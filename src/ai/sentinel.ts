import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";
import { config } from "../config/env.js";
import {
  getRecentTrades,
  getUserState,
  getUserGoals,
  userStatesCollection,
} from "../db/firestore.js";
import { getUserActivePlugins } from "../plugins/manager.js";
import { BUILTIN_PLUGINS } from "../plugins/catalog.js";
import type { Trade, UserState, GoalItem, AristotelianScores } from "../db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
});

export type DimensionKey =
  | "prioritization"
  | "documentation"
  | "waysToWork"
  | "timeManagement"
  | "variety"
  | "goalsAndRewards"
  | "portfolioGrowth"
  | "skillHorizon"
  | "rapidPrototyping"
  | "expressionism";

export interface AristotelianDimensionMeta {
  id: DimensionKey;
  name: string;
  deficiency: string; // -5
  mean: string;       // 0
  excess: string;     // +5
}

export const ARISTOTELIAN_DIMENSIONS: AristotelianDimensionMeta[] = [
  {
    id: "prioritization",
    name: "Prioritization",
    deficiency: "Paralysis",
    mean: "Strategic Decisiveness",
    excess: "Rigid Meta-planning",
  },
  {
    id: "documentation",
    name: "Documentation",
    deficiency: "Amnesia",
    mean: "Passive Capture",
    excess: "Bureaucratic Over-architecture",
  },
  {
    id: "waysToWork",
    name: "Ways to Work",
    deficiency: "Chaos",
    mean: "Adaptive Rhythm",
    excess: "Dogmatic Rigidity",
  },
  {
    id: "timeManagement",
    name: "Time Management",
    deficiency: "Time Blindness",
    mean: "Deep Flow",
    excess: "Chronometer Anxiety",
  },
  {
    id: "variety",
    name: "Variety & Excitement",
    deficiency: "Gray Stagnation",
    mean: "Curated Polymathy",
    excess: "Dilettantism",
  },
  {
    id: "goalsAndRewards",
    name: "Goals & Rewards",
    deficiency: "Drifting",
    mean: "Evidence-Based Gating",
    excess: "Toxic Perfectionism",
  },
  {
    id: "portfolioGrowth",
    name: "Portfolio Growth",
    deficiency: "Invisible Effort",
    mean: "Compounding Artifacts",
    excess: "Vanity Posturing",
  },
  {
    id: "skillHorizon",
    name: "Skill Horizon",
    deficiency: "Tactical Fires",
    mean: "Dual-Track Investment",
    excess: "Ivory Tower",
  },
  {
    id: "rapidPrototyping",
    name: "Rapid Prototyping",
    deficiency: "Wheel-Reinvention",
    mean: "Experiential Sandboxing",
    excess: "Copy-Paste Atrophy",
  },
  {
    id: "expressionism",
    name: "Expressionism / Art",
    deficiency: "Sterile Mechanization",
    mean: "Radical Authenticity",
    excess: "Ungrounded Indulgence",
  },
];

export interface DimensionScore {
  id: DimensionKey;
  name: string;
  score: number;
  deficiency: string;
  mean: string;
  excess: string;
  currentLabel: string;
  barText: string;
  analysis?: string;
}

export interface CognitiveMalwareThreat {
  id: "negative_energy_streak" | "monotony_sameness" | "burnout_spin_cycle" | "overdue_reward_gate";
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  detected: boolean;
  metric?: string;
}

export interface RecommendedPluginSwap {
  needed: boolean;
  currentPluginId: string;
  currentPluginName: string;
  targetPluginId: string;
  targetPluginName: string;
  reason: string;
}

export interface SentinelAuditReport {
  userId: string;
  timestamp: Date;
  dimensions: DimensionScore[];
  scores: AristotelianScores;
  malwareThreats: CognitiveMalwareThreat[];
  hasMalware: boolean;
  recommendation: RecommendedPluginSwap;
  summary: string;
  markdownReport: string;
}

/**
 * Renders an ASCII Aristotelian Mean Radar bar:
 * Scale: -5 (Deficiency) to 0 (Virtue/Mean) to +5 (Excess)
 */
export function renderSentinelRadarBar(
  score: number,
  dimensionName: string,
  stateLabel: string
): string {
  const clamped = Math.max(-5, Math.min(5, Math.round(score)));
  let left = "     ";
  let right = "     ";

  if (clamped < 0) {
    const filled = Math.abs(clamped);
    left = "■".repeat(filled).padStart(5, " ");
  } else if (clamped > 0) {
    right = "■".repeat(clamped).padEnd(5, " ");
  }

  const scoreStr = clamped > 0 ? `+${clamped}` : `${clamped}`;
  const statusIcon = clamped === 0 ? "🎯 " : "";
  return `\`[${left}|${right}]\` *${dimensionName}*: ${scoreStr} (${statusIcon}${stateLabel})`;
}

/**
 * Detects Cognitive Malware & Behavioral Anomalies deterministically
 */
export function detectCognitiveMalware(
  trades: Trade[],
  userState: UserState,
  goals: GoalItem[]
): CognitiveMalwareThreat[] {
  const threats: CognitiveMalwareThreat[] = [];

  // 1. Negative Energy Delta streaks (> 3 sessions)
  let negativeStreak = 0;
  for (const trade of trades) {
    if (trade.energyDelta < 0) {
      negativeStreak++;
    } else {
      break;
    }
  }

  threats.push({
    id: "negative_energy_streak",
    severity: negativeStreak >= 4 ? "CRITICAL" : "WARNING",
    title: "Cognitive Drainage Spiral",
    description: `Streak of ${negativeStreak} consecutive session(s) with negative Energy Delta. Operating under depleted cognitive reserves damages neural plasticity and induces burnout.`,
    detected: negativeStreak >= 3,
    metric: `${negativeStreak} consecutive negative sessions`,
  });

  // 2. Monotony / Sameness (> 7 days without Variety/Expression)
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentWeekTrades = trades.filter(
    (t) => now - new Date(t.timestamp).getTime() <= sevenDaysMs
  );

  const creativeKeywords = [
    "art", "music", "sound", "dance", "film", "creative", "polymath",
    "dancercise", "groove", "expression", "play", "sandbox", "drawing",
    "writing", "design", "quirky", "weird", "synthesizer"
  ];

  const hasVarietyOrExpression = trades.some((t) => {
    const tradeAge = now - new Date(t.timestamp).getTime();
    if (tradeAge > sevenDaysMs) return false;

    const mod = (t.moduleName || "").toLowerCase();
    const notes = (t.notes || "").toLowerCase();
    const tags = (t.tags || []).map((tag) => tag.toLowerCase());

    return (
      creativeKeywords.some((k) => mod.includes(k) || notes.includes(k) || tags.includes(k)) ||
      t.pluginId === "creative-play-v1" ||
      t.pluginId === "weird-sandbox" ||
      t.pluginId === "dancercise-groove"
    );
  });

  // If user has active trades in the last 7 days or total trades >= 5, but zero variety/expression
  const isMonotonous =
    (recentWeekTrades.length >= 3 && !hasVarietyOrExpression) ||
    (trades.length >= 7 && !hasVarietyOrExpression);

  threats.push({
    id: "monotony_sameness",
    severity: "WARNING",
    title: "Monotony Drift (Gray Stagnation)",
    description:
      "Over 7 days of mono-track linear execution without creative play or polymath cross-pollination. Causes tunnel vision and mental petrification.",
    detected: isMonotonous,
    metric: `${recentWeekTrades.length} trades in 7d with 0 creative/variety breaks`,
  });

  // 3. High focus with low facts yield (burnout / spin cycles)
  let spinHours = 0;
  let lowYieldSessions = 0;

  for (const trade of trades.slice(0, 10)) {
    const hours = trade.focusActualHours || 0;
    const facts = (trade.factsYield || "").trim().toLowerCase();
    const isTrivialYield =
      facts.length < 15 ||
      ["none", "nothing", "wip", "progress", "n/a", "fixed bug", "coding", "same"].includes(facts);

    if (hours >= 2.0 && isTrivialYield) {
      spinHours += hours;
      lowYieldSessions++;
    }
  }

  const isSpinCycle = lowYieldSessions >= 2 || spinHours >= 5.0;

  threats.push({
    id: "burnout_spin_cycle",
    severity: "WARNING",
    title: "Spin-Cycle / Sunk Cost Loop",
    description: `High focus deployment (${spinHours.toFixed(1)}h across ${lowYieldSessions} session(s)) yielding negligible factual artifacts. Indicates stuck loops, resistance, or fatigue.`,
    detected: isSpinCycle,
    metric: `${lowYieldSessions} high-focus/low-yield sessions (${spinHours.toFixed(1)}h)`,
  });

  // 4. Overdue Reward Bank gates
  const pendingGoals = goals.filter((g) => !g.isUnlocked);
  const overdueGoals = pendingGoals.filter((g) => {
    if (g.targetFocusHours && userState.totalFocusHours >= g.targetFocusHours) {
      return true;
    }
    const ageDays = (now - new Date(g.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > 14;
  });

  threats.push({
    id: "overdue_reward_gate",
    severity: overdueGoals.length > 0 ? "WARNING" : "INFO",
    title: "Deferred Reward Debt",
    description:
      overdueGoals.length > 0
        ? `Milestone gate "${overdueGoals[0].title}" target reached (${userState.totalFocusHours}h) but reward "${overdueGoals[0].reward}" remains uncollected in Reward Bank.`
        : "Pending milestone gates are healthy.",
    detected: overdueGoals.length > 0,
    metric: `${overdueGoals.length} overdue gates`,
  });

  return threats;
}

/**
 * Heuristic baseline scoring for the 10 dimensions (-5 to +5)
 */
function calculateHeuristicScores(
  trades: Trade[],
  userState: UserState,
  threats: CognitiveMalwareThreat[]
): AristotelianScores {
  const scores: AristotelianScores = {
    prioritization: 0,
    documentation: 0,
    waysToWork: 0,
    timeManagement: 0,
    variety: 0,
    goalsAndRewards: 0,
    portfolioGrowth: 0,
    skillHorizon: 0,
    rapidPrototyping: 0,
    expressionism: 0,
  };

  if (trades.length === 0) {
    return scores;
  }

  // 1. Prioritization (Paralysis [-5] vs Strategic Decisiveness [0] vs Rigid Meta-planning [+5])
  const avgFocus = trades.reduce((acc, t) => acc + (t.focusActualHours || 0), 0) / trades.length;
  const metaTags = trades.filter((t) => (t.tags || []).some((tg) => tg.includes("plan") || tg.includes("meta"))).length;
  if (metaTags > trades.length * 0.4) {
    scores.prioritization = Math.min(4, Math.round((metaTags / trades.length) * 5));
  } else if (avgFocus < 0.75) {
    scores.prioritization = -3;
  } else if (userState.averageEnergyDelta < -1.5) {
    scores.prioritization = -2;
  } else {
    scores.prioritization = 0;
  }

  // 2. Documentation (Amnesia [-5] vs Passive Capture [0] vs Bureaucratic Over-architecture [+5])
  const emptyYields = trades.filter((t) => !(t.factsYield && t.factsYield.length > 10)).length;
  const excessiveYields = trades.filter((t) => (t.factsYield || "").length > 400).length;
  if (emptyYields > trades.length * 0.5) {
    scores.documentation = -Math.min(5, Math.round((emptyYields / trades.length) * 6));
  } else if (excessiveYields > trades.length * 0.4) {
    scores.documentation = Math.min(4, Math.round((excessiveYields / trades.length) * 5));
  } else {
    scores.documentation = 0;
  }

  // 3. Ways to Work (Chaos [-5] vs Adaptive Rhythm [0] vs Dogmatic Rigidity [+5])
  const energyVariance = trades.reduce((acc, t) => acc + Math.pow(t.energyDelta - userState.averageEnergyDelta, 2), 0) / trades.length;
  if (energyVariance > 6.0) {
    scores.waysToWork = -3; // Chaos
  } else if (userState.averageEnergyDelta < -2.0) {
    scores.waysToWork = 3; // Grinding dogma despite exhaustion
  } else {
    scores.waysToWork = 0;
  }

  // 4. Time Management (Time Blindness [-5] vs Deep Flow [0] vs Chronometer Anxiety [+5])
  const timeDivergences = trades.filter(
    (t) => t.focusExpectedHours && Math.abs(t.focusActualHours - t.focusExpectedHours) > 1.5
  ).length;
  if (timeDivergences > trades.length * 0.4) {
    scores.timeManagement = -3; // Time Blindness
  } else if (avgFocus > 4.5) {
    scores.timeManagement = -2;
  } else {
    scores.timeManagement = 0;
  }

  // 5. Variety & Excitement (Gray Stagnation [-5] vs Curated Polymathy [0] vs Dilettantism [+5])
  const uniqueTags = new Set(trades.flatMap((t) => t.tags || [])).size;
  const monotonyThreat = threats.find((t) => t.id === "monotony_sameness" && t.detected);
  if (monotonyThreat || uniqueTags <= 2) {
    scores.variety = -4; // Gray Stagnation
  } else if (uniqueTags > 15) {
    scores.variety = 3; // Dilettantism
  } else {
    scores.variety = 0;
  }

  // 6. Goals & Rewards (Drifting [-5] vs Evidence-Based Gating [0] vs Toxic Perfectionism [+5])
  const overdueThreat = threats.find((t) => t.id === "overdue_reward_gate" && t.detected);
  if (overdueThreat) {
    scores.goalsAndRewards = 3; // Toxic perfectionism / withholding rewards
  } else {
    scores.goalsAndRewards = 0;
  }

  // 7. Portfolio Growth (Invisible Effort [-5] vs Compounding Artifacts [0] vs Vanity Posturing [+5])
  const builderTrades = trades.filter((t) => t.tradeType === "builder");
  if (userState.totalFocusHours > 10 && userState.totalFactsAcquired === 0) {
    scores.portfolioGrowth = -3; // Invisible Effort
  } else if (builderTrades.length > 0) {
    scores.portfolioGrowth = 0;
  }

  // 8. Skill Horizon (Tactical Fires [-5] vs Dual-Track Investment [0] vs Ivory Tower [+5])
  const learnerTrades = trades.filter((t) => t.tradeType === "learner").length;
  const ratioLearner = learnerTrades / trades.length;
  if (ratioLearner === 0 && trades.length >= 5) {
    scores.skillHorizon = -3; // Tactical fires
  } else if (ratioLearner > 0.8) {
    scores.skillHorizon = 4; // Ivory Tower
  } else {
    scores.skillHorizon = 0;
  }

  // 9. Rapid Prototyping (Wheel-Reinvention [-5] vs Experiential Sandboxing [0] vs Copy-Paste Atrophy [+5])
  const spinThreat = threats.find((t) => t.id === "burnout_spin_cycle" && t.detected);
  if (spinThreat) {
    scores.rapidPrototyping = -3; // Wheel-reinvention / stuck
  } else {
    scores.rapidPrototyping = 0;
  }

  // 10. Expressionism / Art (Sterile Mechanization [-5] vs Radical Authenticity [0] vs Ungrounded Indulgence [+5])
  const creativeKeywords = ["art", "music", "dance", "creative", "film", "groove", "expression", "play", "weird"];
  const creativeTrades = trades.filter((t) => {
    const mod = (t.moduleName || "").toLowerCase();
    const tags = (t.tags || []).map((x) => x.toLowerCase());
    return creativeKeywords.some((k) => mod.includes(k) || tags.includes(k));
  }).length;

  if (creativeTrades === 0 && trades.length >= 4) {
    scores.expressionism = -4; // Sterile Mechanization
  } else if (creativeTrades > trades.length * 0.7) {
    scores.expressionism = 3; // Ungrounded Indulgence
  } else {
    scores.expressionism = 0;
  }

  return scores;
}

const SYSTEM_SENTINEL_PROMPT = `
You are the Sentinel Agent and Aristotelian Mean Calibrator for "The Fabric" 4F Meta-OS.
Your purpose is to audit personal telemetry and diagnose cognitive malware, systemic imbalances, and vices of deficiency/excess.

Aristotle's Doctrine of the Mean (Nicomachean Ethics):
Every virtue is the contextual golden mean (0) between a vice of deficiency (-5) and a vice of excess (+5).

You must score the user across EXACTLY these 10 Aristotelian Dimensions from -5 to +5:
1. "prioritization": Paralysis (-5) vs Strategic Decisiveness (0) vs Rigid Meta-planning (+5)
2. "documentation": Amnesia (-5) vs Passive Capture (0) vs Bureaucratic Over-architecture (+5)
3. "waysToWork": Chaos (-5) vs Adaptive Rhythm (0) vs Dogmatic Rigidity (+5)
4. "timeManagement": Time Blindness (-5) vs Deep Flow (0) vs Chronometer Anxiety (+5)
5. "variety": Gray Stagnation (-5) vs Curated Polymathy (0) vs Dilettantism (+5)
6. "goalsAndRewards": Drifting (-5) vs Evidence-Based Gating (0) vs Toxic Perfectionism (+5)
7. "portfolioGrowth": Invisible Effort (-5) vs Compounding Artifacts (0) vs Vanity Posturing (+5)
8. "skillHorizon": Tactical Fires (-5) vs Dual-Track Investment (0) vs Ivory Tower (+5)
9. "rapidPrototyping": Wheel-Reinvention (-5) vs Experiential Sandboxing (0) vs Copy-Paste Atrophy (+5)
10. "expressionism": Sterile Mechanization (-5) vs Radical Authenticity (0) vs Ungrounded Indulgence (+5)

Return a JSON object conforming strictly to:
{
  "scores": {
    "prioritization": number (integer -5 to 5),
    "documentation": number (integer -5 to 5),
    "waysToWork": number (integer -5 to 5),
    "timeManagement": number (integer -5 to 5),
    "variety": number (integer -5 to 5),
    "goalsAndRewards": number (integer -5 to 5),
    "portfolioGrowth": number (integer -5 to 5),
    "skillHorizon": number (integer -5 to 5),
    "rapidPrototyping": number (integer -5 to 5),
    "expressionism": number (integer -5 to 5)
  },
  "overallDiagnosis": string (2-3 concise sentences summarizing system state and primary friction)
}

Respond ONLY with raw JSON. No markdown code blocks, no commentary.
`;

/**
 * Computes the recommended Way of Working (WoW) plugin swap
 */
export function computeRecommendedPluginSwap(
  scores: AristotelianScores,
  threats: CognitiveMalwareThreat[],
  activePluginIds: string[]
): RecommendedPluginSwap {
  const primaryActiveId = activePluginIds[0] || "monotropic-flow";
  const primaryActiveName = BUILTIN_PLUGINS[primaryActiveId]?.name || primaryActiveId;

  // 1. Expressionism deficit or Monotony drift -> Creative Play v1
  if (
    scores.expressionism <= -2 ||
    threats.some((t) => t.id === "monotony_sameness" && t.detected)
  ) {
    if (primaryActiveId !== "creative-play-v1") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "creative-play-v1",
        targetPluginName: "Creative Play (v1)",
        reason: `Expressionism is deficient (${scores.expressionism}) with Monotony Drift detected. Switch to Creative Play (v1) to induce uninhibited artistic sandboxing and break sterile mechanization.`,
      };
    }
  }

  // 2. Prioritization paralysis or Chaos -> Monotropic Flow v1
  if (scores.prioritization <= -2 || scores.waysToWork <= -3) {
    if (primaryActiveId !== "monotropic-flow-v1" && primaryActiveId !== "monotropic-flow") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "monotropic-flow-v1",
        targetPluginName: "Monotropic Flow (v1)",
        reason: `Prioritization paralysis (${scores.prioritization}) or chaotic rhythm detected. Switch to Monotropic Flow (v1) to lock in single-task execution and strategic decisiveness.`,
      };
    }
  }

  // 3. Time Management deficit (Time Blindness) or Spin-Cycle -> Strict Pomodoro
  if (
    scores.timeManagement <= -2 ||
    threats.some((t) => t.id === "burnout_spin_cycle" && t.detected)
  ) {
    if (primaryActiveId !== "strict-pomodoro") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "strict-pomodoro",
        targetPluginName: "Strict Pomodoro 25/5",
        reason: `Time blindness (${scores.timeManagement}) or spin-cycle loop detected. Switch to Strict Pomodoro 25/5 to enforce hard sprint boundaries and mandatory physical resets.`,
      };
    }
  }

  // 4. Negative Energy streak -> Plyometrics & CNS Reset or Dopamine Sabbath
  if (threats.some((t) => t.id === "negative_energy_streak" && t.detected)) {
    if (primaryActiveId !== "plyo-vitality") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "plyo-vitality",
        targetPluginName: "Plyometrics & CNS Reset",
        reason: `Drainage spiral detected with consecutive negative energy sessions. Switch to Plyometrics & CNS Reset to recharge physiological reserves and reboot dopamine receptor sensitivity.`,
      };
    }
  }

  // 5. Variety deficit (Gray Stagnation) -> Dancercise & Fluid Intellect
  if (scores.variety <= -3) {
    if (primaryActiveId !== "dancercise-groove") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "dancercise-groove",
        targetPluginName: "Dancercise & Fluid Intellect",
        reason: `Gray Stagnation detected (${scores.variety}). Switch to Dancercise to engage sensorimotor coordination and loosen mental rigidity.`,
      };
    }
  }

  // 6. Skill Horizon or Prototyping deficit -> Feynman Meta-Learner
  if ((scores.skillHorizon ?? 0) <= -2 || (scores.rapidPrototyping ?? 0) <= -2) {
    if (primaryActiveId !== "feynman-learner") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "feynman-learner",
        targetPluginName: "Feynman Meta-Learner",
        reason: `Tactical fire fighting or wheel-reinvention detected. Switch to Feynman Meta-Learner to compound permanent mental models from execution.`,
      };
    }
  }

  // 7. Toxic Perfectionism or Dogmatic Rigidity -> Hopecore Maker
  if ((scores.goalsAndRewards ?? 0) >= 3 || (scores.waysToWork ?? 0) >= 3) {
    if (primaryActiveId !== "hopecore-maker") {
      return {
        needed: true,
        currentPluginId: primaryActiveId,
        currentPluginName: primaryActiveName,
        targetPluginId: "hopecore-maker",
        targetPluginName: "Hopecore & Radical Sincerity",
        reason: `Dogmatic rigidity or toxic perfectionism detected (+${scores.waysToWork}). Switch to Hopecore & Radical Sincerity to celebrate micro-wins and release unyielding pressure.`,
      };
    }
  }

  // Default: System in equilibrium
  return {
    needed: false,
    currentPluginId: primaryActiveId,
    currentPluginName: primaryActiveName,
    targetPluginId: primaryActiveId,
    targetPluginName: primaryActiveName,
    reason: "System telemetry is operating near Aristotelian equilibrium. Current driver is optimal.",
  };
}

/**
 * Executes the autonomous Sentinel audit for a given user
 */
export async function runSentinelAudit(userId: string): Promise<SentinelAuditReport> {
  // 1. Ingestion: Scans trades, state, plugins, goals
  const [trades, userState, activePlugins, goals] = await Promise.all([
    getRecentTrades(userId, 30),
    getUserState(userId),
    getUserActivePlugins(userId),
    getUserGoals(userId),
  ]);

  // 2. Detect Cognitive Malware & Anomalies
  const malwareThreats = detectCognitiveMalware(trades, userState, goals);
  const hasMalware = malwareThreats.some((t) => t.detected);

  // 3. Baseline heuristic scores
  const heuristicScores = calculateHeuristicScores(trades, userState, malwareThreats);

  // 4. LLM synthesis & calibrated evaluation
  let calculatedScores: AristotelianScores = { ...heuristicScores };
  let overallDiagnosis = "Telemetry analyzed across 10 Aristotelian dimensions.";

  try {
    const tradeSummaries = trades.slice(0, 15).map((t) => ({
      module: t.moduleName,
      type: t.tradeType,
      hours: t.focusActualHours,
      energy: t.energyDelta,
      tags: t.tags,
      factsYield: (t.factsYield || "").slice(0, 100),
    }));

    const promptContext = `
Telemetry Ingestion:
- User ID: ${userId}
- Total Focus Hours: ${userState.totalFocusHours}h
- Total Facts Acquired: ${userState.totalFactsAcquired}
- Average Energy Delta: ${userState.averageEnergyDelta}
- Active Plugins: ${activePlugins.map((p) => p.name).join(", ") || "None"}
- Recent Trades (Last ${tradeSummaries.length}):
${JSON.stringify(tradeSummaries, null, 2)}
- Detected Malware Flags:
${JSON.stringify(malwareThreats.filter((t) => t.detected), null, 2)}
`;

    const response = await model.generateContent(
      `${SYSTEM_SENTINEL_PROMPT}\n\n${promptContext}`
    );
    const text = response.response.text();
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
    }

    const parsed = JSON.parse(cleaned.trim());
    if (parsed.scores && typeof parsed.scores === "object") {
      for (const dim of ARISTOTELIAN_DIMENSIONS) {
        if (typeof parsed.scores[dim.id] === "number") {
          calculatedScores[dim.id] = Math.max(-5, Math.min(5, Math.round(parsed.scores[dim.id])));
        }
      }
    }
    if (parsed.overallDiagnosis && typeof parsed.overallDiagnosis === "string") {
      overallDiagnosis = parsed.overallDiagnosis;
    }
  } catch (err) {
    console.warn("⚠️ Sentinel LLM evaluation fallback to heuristics:", err);
  }

  // 5. Recommendation Engine: WoW Plugin Swap
  const activePluginIds = activePlugins.map((p) => p.id);
  const recommendation = computeRecommendedPluginSwap(
    calculatedScores,
    malwareThreats,
    activePluginIds
  );

  // 6. Persistence: Update userStatesCollection in Firestore
  try {
    await userStatesCollection.doc(userId).set(
      {
        goldenMeans: calculatedScores,
        lastAudit: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to persist Sentinel audit to Firestore:", err);
  }

  // 7. Format Dimension scores & visual text bars
  const dimensions: DimensionScore[] = ARISTOTELIAN_DIMENSIONS.map((meta) => {
    const rawVal = calculatedScores[meta.id] ?? 0;
    const score = Math.max(-5, Math.min(5, Math.round(rawVal)));

    let currentLabel = meta.mean;
    if (score < 0) currentLabel = meta.deficiency;
    if (score > 0) currentLabel = meta.excess;

    const barText = renderSentinelRadarBar(score, meta.name, currentLabel);

    return {
      id: meta.id,
      name: meta.name,
      score,
      deficiency: meta.deficiency,
      mean: meta.mean,
      excess: meta.excess,
      currentLabel,
      barText,
    };
  });

  // 8. Generate Markdown Diagnostic Report
  const radarSection = dimensions.map((d) => d.barText).join("\n");

  const detectedMalware = malwareThreats.filter((t) => t.detected);
  let malwareSection = "✅ *CLEAN* — No active cognitive malware, spin-cycles, or energy drainage streaks detected.";
  if (detectedMalware.length > 0) {
    const items = detectedMalware.map((t) => {
      const icon = t.severity === "CRITICAL" ? "🔴" : t.severity === "WARNING" ? "🟡" : "ℹ️";
      return `• ${icon} *[${t.severity}]* ${t.title}\n  _${t.description}_`;
    });
    malwareSection = `⚠️ *WARNING: Anomalies Detected*\n${items.join("\n")}`;
  }

  let swapSection = `*Current Driver:* \`${recommendation.currentPluginName}\`\n*Status:* System operates in balanced Aristotelian rhythm. No swap required.`;
  if (recommendation.needed) {
    swapSection = `*Current Driver:* \`${recommendation.currentPluginName}\`\n*Recommended:* *${recommendation.targetPluginName}*\n_Reason: ${recommendation.reason}_`;
  }

  const markdownReport = `🛡️ *SENTINEL RECON: COGNITIVE AUDIT*
_Autonomous 4F Meta-OS Aristotelian Calibrator_

⚖️ *Aristotelian Equilibrium Radar*
${radarSection}

🦠 *Cognitive Malware Scan*
${malwareSection}

🔄 *Recommended WoW Plugin Swap*
${swapSection}

🎯 *Sentinel Synthesis:*
_${overallDiagnosis}_
`;

  return {
    userId,
    timestamp: new Date(),
    dimensions,
    scores: calculatedScores,
    malwareThreats,
    hasMalware,
    recommendation,
    summary: overallDiagnosis,
    markdownReport,
  };
}
