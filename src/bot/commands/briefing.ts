import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";
import {
  db,
  getUserState,
  getUserGoals,
  getRecentTrades,
  knowledgeCollection,
} from "../../db/firestore.js";
import { getUserActivePlugins } from "../../plugins/manager.js";
import { getReflexionSummary } from "../../ai/reflexion.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

export const MORNING_BRIEFING_PROMPT = `
You are the Morning Recon Briefing Agent for "The Fabric: 4F Meta-OS".
Your mission is to formulate the user's daily flight plan at dawn, calibrating their Focus, Facts, Funds, and Feedback for maximum intentionality, momentum, and biological-intellectual equilibrium.

Analyze the user's telemetry:
1. Active Ways of Working (WoW) plugins
2. Current Energy Delta & cumulative telemetry
3. Pending milestones & locked rewards in the Reward Bank
4. Recent currency trades (past focus hours, facts yield, feedback)

Generate a punchy, sharp Telegram Markdown message with EXACTLY these 4 core components:

🌅 *MORNING RECON: DAILY FLIGHT PLAN*

⏱️ *Focus Budget for the Day:*
Calculate an explicit hours allocation (e.g., 4.0h - 5.5h) calibrated to their active plugins (e.g., Monotropic Flow, Strict Pomodoro) and recent energy delta. Specify how to divide focus blocks or pace biological energy.

🎯 *Priority Target (Reward Bank Gate):*
Highlight the highest-leverage pending milestone from their Reward Bank and the reward it unlocks. If no pending goals exist, designate a primary operational target and instruct them to arm a gate with \`/goal <milestone> -> <reward>\`.

⚖️ *Equilibrium Alert (Aristotelian Scale):*
Examine the 5 dimensions: Logic (coding/analysis), Vitality (exercise/sleep), Expressionism (art/creative play), Variety (cross-pollination), Prioritization (signal vs noise). Identify which dimension is drifting into deficiency or excess, with ONE crisp corrective action for today.

⚓ *Philosophical Anchor:*
A 2-3 sentence Stoic Memento Mori ("Wake Up Dead Man" urgency) or sharp Hopecore spark to ignite the day with relentless momentum and craft.

Style Guidelines:
- Direct, tactical reconnaissance tone. No corporate fluff, no generic pleasantries.
- Use clean Telegram Markdown (*bold*, _italic_, \`code\`).
- Keep entire response under 280 words.
`;

export async function generateMorningBriefing(userId: string): Promise<string> {
  const userState = await getUserState(userId);
  const activePlugins = await getUserActivePlugins(userId);
  const allGoals = await getUserGoals(userId);
  const pendingGoals = allGoals.filter((g) => !g.isUnlocked);
  const recentTrades = await getRecentTrades(userId, 7);

  const pluginsText =
    activePlugins.length > 0
      ? activePlugins
          .map((p) => `- ${p.name} (${p.category}): ${p.description}`)
          .join("\n")
      : "- Monotropic Deep Flow (focus_strategy)";

  const telemetryText = `
- Total Focus Hours: ${userState.totalFocusHours}h
- Total Facts Acquired: ${userState.totalFactsAcquired}
- Total Funds Spent: $${userState.totalFundsSpent}
- Total Funds Yield: $${userState.totalFundsYield}
- Average Energy Delta: ${userState.averageEnergyDelta > 0 ? "+" : ""}${userState.averageEnergyDelta} (-5 to +5)
- Aristotle Scales: ${JSON.stringify(userState.goldenMeans || {})}
`;

  const pendingGoalsText =
    pendingGoals.length > 0
      ? pendingGoals
          .map(
            (g) =>
              `- [${g.id ? "#" + g.id.slice(-6) : "Gate"}] Milestone: "${g.title}" -> Locked Reward: "${g.reward}"`
          )
          .join("\n")
      : "No pending milestones armed in Reward Bank.";

  const recentTradesText =
    recentTrades.length > 0
      ? recentTrades
          .map(
            (t) =>
              `- ${t.moduleName} (${t.tradeType}): ${t.focusActualHours}h, energy delta: ${
                t.energyDelta > 0 ? "+" : ""
              }${t.energyDelta}, yield: "${t.factsYield}"`
          )
          .join("\n")
      : "No recent trades recorded.";

  const prompt = `${MORNING_BRIEFING_PROMPT}

User Telemetry Context:
Active Plugins:
${pluginsText}

Cumulative Telemetry:
${telemetryText}

Reward Bank (Pending Milestones):
${pendingGoalsText}

Recent Trades (Last 7):
${recentTradesText}
`;

  const response = await model.generateContent(prompt);
  let briefing = response.response.text().trim();

  // Daily Vault Resurfacing (Spaced Retrieval from 3,843 reels)
  try {
    const snap = await knowledgeCollection
      .where("userId", "==", userId)
      .limit(40)
      .get();
    if (!snap.empty) {
      const randomDoc = snap.docs[Math.floor(Math.random() * snap.docs.length)];
      const k = randomDoc.data();
      const streamLink = k.streamUrl ? `\n🎬 [Watch Video in Vault](${k.streamUrl})` : "";
      const takeaway = k.actionableTakeaway || k.content || "Reflect on how this principle applies to your craft.";
      briefing += `\n\n🪴 *Daily Vault Resurfacing (Spaced Retrieval):*\n*${k.title}*${streamLink}\n💡 _Heuristic:_ ${takeaway}\n_Send a voice memo or reply to layer your synthesis onto this card today._`;
    }
  } catch (err) {
    console.warn("Could not query daily vault spark:", err);
  }

  // Autonomous Episodic Reflexion Summary
  try {
    const reflexionSummary = await getReflexionSummary(userId);
    if (reflexionSummary) {
      briefing += `\n\n${reflexionSummary}`;
    }
  } catch (err) {
    console.warn("Could not query episodic reflexion summary:", err);
  }

  // Save to agentOutputs in Firestore
  try {
    await db.collection("agentOutputs").add({
      agentName: "briefing",
      userId,
      runAt: new Date(),
      report: briefing,
    });
  } catch (err) {
    console.error("Could not record briefing output to Firestore:", err);
  }

  return briefing;
}

export async function handleBriefing(ctx: Context): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  try {
    await ctx.replyWithChatAction?.("typing");
  } catch {
    // Ignore chat action failure
  }

  const keyboard = new InlineKeyboard()
    .text("🧠 Episodic Reflexion", "action:reflexion")
    .text("🛡️ Sentinel Recon", "action:sentinel")
    .row()
    .text("⚡ Spark Morning Sprint", "action:spark_prompt")
    .text("📊 Balance", "action:balance");

  try {
    const briefing = await generateMorningBriefing(userId);
    try {
      await ctx.reply(briefing, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch {
      // Fallback in case Markdown parsing triggers telegram formatting error
      await ctx.reply(briefing, { reply_markup: keyboard });
    }
  } catch (err) {
    console.error("Error generating morning briefing:", err);
    await ctx.reply(
      "⚠️ *Failed to generate Morning Recon Briefing.*\nPlease try again shortly.",
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  }
}
