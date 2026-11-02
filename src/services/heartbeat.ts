import { execSync } from "child_process";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";
import { config } from "../config/env.js";
import {
  db,
  userStatesCollection,
  getActiveSession,
  getRecentTrades,
  getUserGoals,
  getKnowledgeItems,
} from "../db/firestore.js";
import { getAllDomains } from "../domains/manager.js";
import { getGoldbeesAnalysis, type GoldbeesAnalysis } from "./goldbees.js";
import { generateDsaLesson } from "../bot/commands/dsa.js";
import { generateSocraticChallenge } from "../ai/challenger.js";
import { DEFAULT_SIDEQUESTS, sidequestsCollection, type SidequestItem } from "../bot/commands/sidequest.js";
import type { Trade } from "../db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

export interface HeartbeatState {
  enabled: boolean;
  lastDispatched: {
    dawn?: string;
    midday?: string;
    twilight?: string;
    [key: string]: string | undefined;
  };
}

// In-memory cache to prevent redundant Firestore writes and avoid double-dispatch
const inMemoryHeartbeatState = new Map<string, HeartbeatState>();

/**
 * Strips raw markdown tokens that commonly break Telegram markdown v1 entity parsing.
 */
function sanitizeMarkdown(text: string): string {
  // Replace unmatched brackets/underscores that break telegram markdown
  return text.replace(/([\\`*_{}\[\]()#+\-.!])/g, (match) => {
    // Keep bold (*) and italics (_) if properly paired, but escape lone characters
    return match;
  });
}

/**
 * Safe message sender: tries Markdown first, falls back to plain text if Telegram entity parsing fails.
 */
async function safeSendMessage(
  bot: Bot | { api: Bot["api"] },
  chatId: string | number,
  text: string,
  keyboard?: InlineKeyboard
): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch (err: any) {
    console.warn(`[Heartbeat] Markdown send failed for ${chatId}, falling back to plain text:`, err.message);
    const plainText = text.replace(/[*_`\[\]()]/g, "");
    await bot.api.sendMessage(chatId, plainText, {
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  }
}

/**
 * Returns current date string (YYYY-MM-DD) and hour/minute in the configured timezone.
 */
export function getCurrentTimeContext(date = new Date()): {
  todayStr: string;
  hour: number;
  minute: number;
  formattedTime: string;
} {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = dateFormatter.format(date); // "YYYY-MM-DD"

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = timeFormatter.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  const formattedTime = date.toLocaleTimeString("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return { todayStr, hour, minute, formattedTime };
}

/**
 * Retrieves the heartbeat state for a user.
 */
export async function getHeartbeatState(userId: string): Promise<HeartbeatState> {
  if (inMemoryHeartbeatState.has(userId)) {
    return inMemoryHeartbeatState.get(userId)!;
  }

  try {
    const doc = await userStatesCollection.doc(userId).get();
    if (doc.exists) {
      const data = doc.data() || {};
      const state: HeartbeatState = {
        enabled: data.heartbeatEnabled !== false, // default true
        lastDispatched: data.heartbeatLastDispatched || {},
      };
      inMemoryHeartbeatState.set(userId, state);
      return state;
    }
  } catch (err) {
    console.warn(`[Heartbeat] Could not load state from Firestore for ${userId}:`, err);
  }

  const defaultState: HeartbeatState = { enabled: true, lastDispatched: {} };
  inMemoryHeartbeatState.set(userId, defaultState);
  return defaultState;
}

/**
 * Persists the user's heartbeat configuration.
 */
export async function setHeartbeatEnabled(userId: string, enabled: boolean): Promise<void> {
  const current = await getHeartbeatState(userId);
  current.enabled = enabled;
  inMemoryHeartbeatState.set(userId, current);

  try {
    await userStatesCollection.doc(userId).set(
      {
        heartbeatEnabled: enabled,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error(`[Heartbeat] Failed to persist enabled state for ${userId}:`, err);
  }
}

/**
 * Checks if proactive heartbeat notifications are enabled for a user.
 */
export async function isHeartbeatEnabled(userId: string): Promise<boolean> {
  const state = await getHeartbeatState(userId);
  return state.enabled;
}

/**
 * Updates the last dispatched date for a specific anchor phase.
 */
async function markAnchorDispatched(
  userId: string,
  phase: "dawn" | "midday" | "twilight",
  dateStr: string
): Promise<void> {
  const current = await getHeartbeatState(userId);
  current.lastDispatched[phase] = dateStr;
  inMemoryHeartbeatState.set(userId, current);

  try {
    await userStatesCollection.doc(userId).set(
      {
        heartbeatLastDispatched: {
          [phase]: dateStr,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error(`[Heartbeat] Failed to update dispatched record for ${userId}:`, err);
  }
}

/**
 * Safely inspects local git commits pushed or created today.
 */
function getLocalGitCommitsToday(): { count: number; messages: string[] } {
  try {
    const raw = execSync("git log --since='midnight' --oneline", {
      encoding: "utf8",
      timeout: 3000,
    }).trim();

    if (!raw) return { count: 0, messages: [] };
    const lines = raw.split("\n").filter(Boolean);
    return {
      count: lines.length,
      messages: lines.slice(0, 3).map((l) => l.replace(/^[a-f0-9]+\s+/i, "")),
    };
  } catch {
    return { count: 0, messages: [] };
  }
}

/**
 * Phase 1: Dawn Briefing (Morning 08:00 AM)
 * - Today's DSA Problem / mental model challenge
 * - Active domain focus and 3 priority intentions
 * - GOLDBEES ETF market check (if drawdown / opportunity trigger)
 */
export async function sendDawnBriefing(
  bot: Bot | { api: Bot["api"] },
  userId: string
): Promise<void> {
  console.log(`[Heartbeat] Dispatched Dawn Briefing for user ${userId}`);

  // 1. Fetch DSA Foundry mental model
  let dsaSection = "";
  try {
    const dsa = await generateDsaLesson();
    dsaSection =
      `🧩 *TODAY'S DSA FOUNDRY:* *${dsa.pattern}*\n\n` +
      `${dsa.content}\n`;
  } catch (err: any) {
    dsaSection =
      `🧩 *TODAY'S DSA FOUNDRY:* *Sliding Window & Two Pointers*\n\n` +
      `💡 *Mental Model:* An accordion expanding to ingest valid states and contracting to drop stale constraints.\n` +
      `📐 *Invariant:* Window \`[L, R]\` satisfies target sum at every rightward step.\n` +
      `⚔️ *Challenge:* Implement variable window maximum without auxiliary space!`;
  }

  // 2. Fetch Active Domains & Pending Goals
  let domainSection = "";
  try {
    const [domainState, goals] = await Promise.all([
      getAllDomains(userId),
      getUserGoals(userId),
    ]);

    const activeList = domainState.active.map((d) => `${d.icon} *${d.name}*`).join(" • ");
    const pendingGoals = goals.filter((g) => !g.isUnlocked).slice(0, 3);

    let intentionsText = "";
    if (pendingGoals.length > 0) {
      intentionsText = pendingGoals
        .map((g, i) => `${i + 1}. *${g.title}* (Reward: _${g.reward}_)`)
        .join("\n");
    } else {
      intentionsText =
        `1. Execute 2.5h Deep Block in primary mounted craft.\n` +
        `2. Log 1 whole-food anti-inflammatory meal with \`/meal\`.\n` +
        `3. Ship 1 verified git commit or technical breakthrough.`;
    }

    domainSection =
      `🎛️ *ACTIVE DOMAIN WORKBENCH:*\n${activeList}\n\n` +
      `🎯 *3 PRIORITY INTENTIONS TODAY:*\n${intentionsText}\n`;
  } catch (err: any) {
    domainSection =
      `🎯 *PRIORITY INTENTIONS TODAY:*\n` +
      `1. Deep flow focus session (2.0h+).\n` +
      `2. Vitality baseline (hydration & movement).\n` +
      `3. Capture 1 win into the knowledge garden.\n`;
  }

  // 3. GOLDBEES ETF Market Check
  let goldSection = "";
  let isOpportunity = false;
  try {
    const gold = await getGoldbeesAnalysis();
    isOpportunity =
      gold.drawdownPercent <= -3.0 ||
      gold.rsi14 < 45 ||
      gold.recommendation.zone !== "HOLD_OBSERVE";

    const badge = isOpportunity ? "🚨 *DIP ACCUMULATION TRIGGER ACTIVE!*" : "⚖️ *STABLE HOLD / OBSERVE*";

    goldSection =
      `📈 *GOLDBEES ETF RADAR:* ${badge}\n` +
      `• *Price:* ₹${gold.currentPrice} | *Drawdown:* \`${gold.drawdownPercent}%\` from 52W High (₹${gold.fiftyTwoWeekHigh})\n` +
      `• *RSI (14):* \`${gold.rsi14}\` | *SMA50:* ₹${gold.sma50}\n` +
      `• *Tactical Action:* *${gold.recommendation.actionTitle}*\n` +
      `  _${gold.recommendation.description}_\n`;
  } catch (err: any) {
    goldSection =
      `📈 *GOLDBEES ETF RADAR:*\n` +
      `• *Status:* Market data offline. Run \`/gold\` during trading hours to inspect dip tranches.\n`;
  }

  const message =
    `🌅 *CHRONOS HEARTBEAT: DAWN BRIEFING*\n` +
    `_Circadian Anchor: 08:00 AM • Biological & Intellectual Ignition_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${domainSection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${dsaSection}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${goldSection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚡ _"The day is surrendered or conquered in the first 90 minutes. Arm your focus."_`;

  const keyboard = new InlineKeyboard()
    .text("⚡ Spark Morning Sprint", "action:spark_prompt")
    .text("📈 GOLDBEES Radar", "action:gold_analysis")
    .row()
    .text("🎲 Roll Another DSA", "action:dsa_roll")
    .text("🎛️ Domain Workbench", "action:domain_menu");

  await safeSendMessage(bot, userId, message, keyboard);
}

/**
 * Phase 2: Midday Vitality Reset (14:00 PM)
 * - Posture, hydration, and kinetic reset cue
 * - Cognitive sentinel sanity check (checks if user is stuck in tunnel vision or sedentary lock)
 */
export async function sendMiddayReset(
  bot: Bot | { api: Bot["api"] },
  userId: string
): Promise<void> {
  console.log(`[Heartbeat] Dispatched Midday Reset for user ${userId}`);

  // 1. Check Active Session & Sedentary Lock
  let sessionWarning = "";
  let hoursLoggedSoFar = 0;
  let kineticTradesCount = 0;

  try {
    const [activeSession, recentTrades] = await Promise.all([
      getActiveSession(userId),
      getRecentTrades(userId, 20),
    ]);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const todayTrades = recentTrades.filter(
      (t) => new Date(t.timestamp).getTime() >= startOfDay.getTime()
    );

    hoursLoggedSoFar = todayTrades.reduce((sum, t) => sum + (t.focusActualHours || 0), 0);
    kineticTradesCount = todayTrades.filter(
      (t) =>
        t.moduleName.toLowerCase().includes("vitality") ||
        t.tags?.some((tag) => ["vitality", "workout", "kinetic", "meal", "walk"].includes(tag.toLowerCase()))
    ).length;

    if (activeSession) {
      const elapsedMs = Date.now() - activeSession.startedAt.getTime();
      const elapsedHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10;

      if (elapsedHours >= 1.5) {
        sessionWarning =
          `⚠️ *PROLONGED TUNNEL VISION ALERT:*\n` +
          `You have been executing *"${activeSession.taskDescription}"* for \`${elapsedHours}h\` without settling.\n` +
          `Cognitive diminishing returns begin after 90m without a sensory break. Settle or take a 10m physical buffer!\n\n`;
      } else {
        sessionWarning =
          `⚡ *Active Session:* *"${activeSession.taskDescription}"* (\`${elapsedHours}h\` running).\n\n`;
      }
    }
  } catch (err) {
    console.warn("[Heartbeat] Error inspecting session for midday reset:", err);
  }

  // Sedentary lock sanity check
  let sentinelAuditNote = "";
  if (hoursLoggedSoFar >= 3.0 && kineticTradesCount === 0) {
    sentinelAuditNote =
      `🛡️ *SENTINEL SANITY CHECK: SEDENTARY LOCK DETECTED*\n` +
      `You have logged \`${hoursLoggedSoFar}h\` of mental execution today with *0 kinetic or vitality trades*.\n` +
      `The mind cannot out-perform the hardware executing it. Stand up now before intellectual fatigue sets in.\n\n`;
  } else {
    sentinelAuditNote =
      `🛡️ *SENTINEL EQUILIBRIUM:*\n` +
      `Today's Pace: \`${hoursLoggedSoFar}h\` focus logged • \`${kineticTradesCount}\` vitality checkpoints.\n` +
      `Ensure cognitive load is balanced with physical tendon decompression.\n\n`;
  }

  const message =
    `☀️ *CHRONOS HEARTBEAT: MIDDAY VITALITY RESET*\n` +
    `_Circadian Anchor: 14:00 PM • Posture, Hydration & Kinetic Flush_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${sessionWarning}` +
    `${sentinelAuditNote}` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🦾 *BIOMECHANICAL PROTOCOL (EXECUTE NOW):*\n` +
    `1. 💧 *Hydration Baseline:* 500ml water + pinch of unrefined sea salt / electrolytes.\n` +
    `2. 📐 *Spinal Decompression:* Thoracic extension, 10 scapular retractions, roll shoulders back.\n` +
    `3. ⚡ *15-Min Kinetic Flush:* 30 jump squats, skater hops, or brisk outdoor sunlight walk.\n` +
    `4. 🥗 *Fuel Check:* If fasting ended, log clean metabolic macros with \`/meal <food>\`.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Break the physical trance. High performance demands physical elasticity._`;

  const keyboard = new InlineKeyboard()
    .text("⚡ 15m Kinetic Reset", "action:spark_kinetic")
    .text("🥗 Log Clean Meal", "action:meal_prompt")
    .row()
    .text("🛡️ Sentinel Audit", "action:sentinel")
    .text("🏁 Settle Session", "action:settle");

  await safeSendMessage(bot, userId, message, keyboard);
}

/**
 * Phase 3: Twilight Settle (21:30 PM)
 * - Daily trade synthesis (git commits, hours logged, energy delta)
 * - Socratic Challenger provocation based on today's verdicts
 * - 1 high-novelty low-friction sidequest suggestion if cognitive fatigue is detected
 */
export async function sendTwilightSettle(
  bot: Bot | { api: Bot["api"] },
  userId: string
): Promise<void> {
  console.log(`[Heartbeat] Dispatched Twilight Settle for user ${userId}`);

  // 1. Daily Trade & Telemetry Synthesis
  let totalHours = 0;
  let netEnergy = 0;
  let tradesCount = 0;
  let factsCount = 0;
  let gitTradesCount = 0;
  let topTradeModules: string[] = [];

  try {
    const recentTrades = await getRecentTrades(userId, 30);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const todayTrades = recentTrades.filter(
      (t) => new Date(t.timestamp).getTime() >= startOfDay.getTime()
    );

    tradesCount = todayTrades.length;
    totalHours = Math.round(todayTrades.reduce((sum, t) => sum + (t.focusActualHours || 0), 0) * 10) / 10;
    netEnergy = todayTrades.reduce((sum, t) => sum + (t.energyDelta || 0), 0);
    factsCount = todayTrades.filter((t) => Boolean(t.factsYield && t.factsYield.length > 5)).length;

    gitTradesCount = todayTrades.filter((t) =>
      t.tags?.some((tag) => ["github", "git", "coding", "pull-request"].includes(tag.toLowerCase()))
    ).length;

    topTradeModules = Array.from(new Set(todayTrades.map((t) => t.moduleName))).slice(0, 4);
  } catch (err) {
    console.warn("[Heartbeat] Error compiling today trades for twilight settle:", err);
  }

  // Incorporate local git commit telemetry if available
  const localGit = getLocalGitCommitsToday();
  const effectiveGitCommits = Math.max(gitTradesCount, localGit.count);

  const energySign = netEnergy > 0 ? `+${netEnergy}` : `${netEnergy}`;
  const energyEmoji = netEnergy >= 2 ? "🔋 Surging" : netEnergy <= -1 ? "🪫 Drained" : "⚖️ Balanced";

  const telemetrySection =
    `📊 *DAILY TELEMETRY SYNTHESIS:*\n` +
    `• ⏳ *Focus Hours Logged:* \`${totalHours}h\` across \`${tradesCount}\` trade(s)\n` +
    `• ⚡ *Net Energy Delta:* \`${energySign}\` (${energyEmoji})\n` +
    `• 💡 *Facts & Heuristics:* \`${factsCount}\` acquired\n` +
    `• 🐙 *Git Commits Captured:* \`${effectiveGitCommits}\` commit(s)\n` +
    (topTradeModules.length > 0
      ? `• 📦 *Active Fronts:* ${topTradeModules.map((m) => `_${m}_`).join(", ")}\n`
      : "");

  // 2. Socratic Challenger Provocation based on Today's Verdicts
  let socraticSection = "";
  try {
    const knowledgeItems = await getKnowledgeItems(userId, undefined, 10);
    const itemWithVerdict = knowledgeItems.find(
      (k) => Boolean(k.userConclusions) || (k.userReflections && k.userReflections.length > 0)
    );

    if (itemWithVerdict && itemWithVerdict.userConclusions) {
      const challenge = await generateSocraticChallenge(
        itemWithVerdict.title,
        itemWithVerdict.userConclusions,
        itemWithVerdict.actionableTakeaway
      );

      socraticSection =
        `⚔️ *SOCRATIC CHALLENGER PROVOCATION:*\n` +
        `_Testing verdict on: "${itemWithVerdict.title}"_\n\n` +
        `🗣️ *Your Verdict:* _"${itemWithVerdict.userConclusions}"_\n` +
        `💥 *The Vulnerability:* ${challenge.challenge}\n` +
        `❓ *Stress-Test Question:* *${challenge.provocativeQuestion}*\n`;
    } else {
      // Fallback provocation based on focus vs prioritization
      socraticSection =
        `⚔️ *SOCRATIC CHALLENGER PROVOCATION:*\n` +
        `_Antifragile audit on today's execution allocation:_\n\n` +
        `You logged \`${totalHours}h\` of execution today.\n` +
        `💥 *The Vulnerability:* Comfort in linear craft often masks avoidance of strategic ambiguity.\n` +
        `❓ *Stress-Test Question:* *Did you attack the single most intimidating bottleneck on your board, or did you polish peripheral code to preserve a feeling of progress?*\n`;
    }
  } catch (err: any) {
    socraticSection =
      `⚔️ *SOCRATIC CHALLENGER PROVOCATION:*\n` +
      `❓ *Stress-Test:* Where did your core assumption fail today, and how will you invert it tomorrow?\n`;
  }

  // 3. High-Novelty Low-Friction Sidequest Suggestion
  let sidequestSection = "";
  const isFatigued = netEnergy <= 0 || totalHours >= 4.0;

  if (isFatigued) {
    let sidequest = DEFAULT_SIDEQUESTS[Math.floor(Math.random() * DEFAULT_SIDEQUESTS.length)];
    try {
      const snap = await sidequestsCollection.where("userId", "==", userId).limit(5).get();
      if (!snap.empty) {
        const customDocs = snap.docs.map((d) => d.data() as SidequestItem);
        sidequest = customDocs[Math.floor(Math.random() * customDocs.length)];
      }
    } catch {}

    sidequestSection =
      `🎮 *ANTI-FATIGUE ESCAPE HATCH (SIDEQUEST):*\n` +
      `_Cognitive fatigue detected. Decompress neural bandwidth with low-friction play:_\n\n` +
      `🎯 *${sidequest.title}* (\`${sidequest.durationMinutes}m\` • ${sidequest.energyYield} energy)\n` +
      `📝 _${sidequest.description}_\n\n` +
      `No commercial pressure. Zero optimization. Pure sensory curiosity.\n`;
  } else {
    sidequestSection =
      `🎮 *RESTORATIVE WIND-DOWN:*\n` +
      `Energy remains resilient (\`${energySign}\`). Lock screens, avoid blue light, and initiate mental shutdown.\n`;
  }

  const message =
    `🌙 *CHRONOS HEARTBEAT: TWILIGHT SETTLE*\n` +
    `_Circadian Anchor: 21:30 PM • Daily Trade Synthesis & Socratic Inversion_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${telemetrySection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${socraticSection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${sidequestSection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💤 _"Finish each day and be done with it. You have done what you could."_`;

  const keyboard = new InlineKeyboard()
    .text("🏆 Bank a Win", "action:win_prompt")
    .text("🎮 Roll Sidequest", "action:sidequest_roll")
    .row()
    .text("📊 Balance Radar", "action:balance")
    .text("🪞 Reflect on Knowledge", "action:reflect_prompt");

  await safeSendMessage(bot, userId, message, keyboard);
}

/**
 * Checks current local hour/minute and dispatches appropriate messages without spamming.
 * Tracks last dispatched date per anchor in Firestore and in-memory state.
 */
export async function runHeartbeatTick(bot: Bot): Promise<void> {
  const { todayStr, hour, minute, formattedTime } = getCurrentTimeContext();

  // Determine current active anchor phase based on time window
  let activePhase: "dawn" | "midday" | "twilight" | null = null;

  // Dawn: 08:00 AM (08:00 to 08:59)
  if (hour === 8) {
    activePhase = "dawn";
  }
  // Midday: 14:00 PM (14:00 to 14:59)
  else if (hour === 14) {
    activePhase = "midday";
  }
  // Twilight: 21:30 PM (21:30 to 22:30)
  else if ((hour === 21 && minute >= 30) || (hour === 22 && minute < 30)) {
    activePhase = "twilight";
  }

  if (!activePhase) {
    // Outside anchor windows; nothing to dispatch on this tick
    return;
  }

  // Gather target user IDs
  const targetUserIds = new Set<string>();
  if (config.telegramUserId) {
    targetUserIds.add(config.telegramUserId);
  }

  try {
    const usersSnap = await userStatesCollection.limit(50).get();
    for (const doc of usersSnap.docs) {
      targetUserIds.add(doc.id);
    }
  } catch (err) {
    console.warn("[Heartbeat] Could not list user states:", err);
  }

  for (const userId of targetUserIds) {
    try {
      const state = await getHeartbeatState(userId);

      // Check if user disabled proactive notifications
      if (!state.enabled) {
        continue;
      }

      // Check if already dispatched for today
      if (state.lastDispatched[activePhase] === todayStr) {
        continue;
      }

      console.log(`[Heartbeat] Disagree with silence: Firing ${activePhase} anchor at ${formattedTime} for user ${userId}`);

      // Dispatch appropriate phase
      if (activePhase === "dawn") {
        await sendDawnBriefing(bot, userId);
      } else if (activePhase === "midday") {
        await sendMiddayReset(bot, userId);
      } else if (activePhase === "twilight") {
        await sendTwilightSettle(bot, userId);
      }

      // Record dispatch to avoid duplicate notifications
      await markAnchorDispatched(userId, activePhase, todayStr);
    } catch (userErr) {
      console.error(`[Heartbeat] Error processing ${activePhase} for user ${userId}:`, userErr);
    }
  }
}

/**
 * Provides status summary for the /heartbeat command.
 */
export async function getHeartbeatStatus(userId: string): Promise<{
  enabled: boolean;
  lastDispatched: Record<string, string | undefined>;
  nextAnchor: string;
  currentTime: string;
}> {
  const state = await getHeartbeatState(userId);
  const { hour, minute, formattedTime } = getCurrentTimeContext();

  let nextAnchor = "🌅 Dawn Briefing (Tomorrow 08:00 AM IST)";
  const currentMinuteOfDay = hour * 60 + minute;

  if (currentMinuteOfDay < 8 * 60) {
    nextAnchor = "🌅 Dawn Briefing (Today 08:00 AM IST)";
  } else if (currentMinuteOfDay < 14 * 60) {
    nextAnchor = "☀️ Midday Vitality Reset (Today 14:00 PM IST)";
  } else if (currentMinuteOfDay < 21 * 60 + 30) {
    nextAnchor = "🌙 Twilight Settle (Today 21:30 PM IST)";
  }

  return {
    enabled: state.enabled,
    lastDispatched: state.lastDispatched,
    nextAnchor,
    currentTime: formattedTime,
  };
}

// Background scheduler handle
let schedulerHandle: NodeJS.Timeout | null = null;

/**
 * Starts the autonomous circadian heartbeat timer loop.
 */
export function startHeartbeatScheduler(bot: Bot, intervalMs = 60000): NodeJS.Timeout {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
  }

  console.log(`⏱️ [Heartbeat] Autonomous Chronos Heartbeat scheduler active (${intervalMs / 1000}s interval).`);

  // Initial non-blocking tick check
  runHeartbeatTick(bot).catch((err) => {
    console.error("[Heartbeat] Initial tick error:", err);
  });

  schedulerHandle = setInterval(() => {
    runHeartbeatTick(bot).catch((err) => {
      console.error("[Heartbeat] Periodic tick error:", err);
    });
  }, intervalMs);

  return schedulerHandle;
}

/**
 * Stops the heartbeat scheduler on graceful bot shutdown.
 */
export function stopHeartbeatScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    console.log("[Heartbeat] Heartbeat scheduler halted.");
  }
}
