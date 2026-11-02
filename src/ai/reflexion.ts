/**
 * Fabric OS - Autonomous Episodic Memory & Reflexion Loop
 *
 * Implements self-reflective cognitive auditing and heuristic induction over
 * user trades, focus sessions, biometrics, and Sentinel audits.
 *
 * Grounded in the 4F Meta-OS (Focus, Facts, Funds, Feedback).
 */

import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";
import { config } from "../config/env.js";
import {
  db,
  getRecentTrades,
  getUserState,
  createKnowledgeItem,
  knowledgeCollection,
  biometricsCollection,
  userStatesCollection,
  graphsCollection,
} from "../db/firestore.js";
import type { Trade, UserState, AristotelianScores, KnowledgeCategory } from "../db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey || "mock-api-key");
const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
});

// Paths to Knowledge Graph caches
const GRAPH_SUMMARY_PATH = path.resolve(process.cwd(), "data/graph_summary.json");
const KNOWLEDGE_GRAPH_PATH = path.resolve(process.cwd(), "data/knowledge_graph.json");

// ============================================================================
// Types & Interfaces
// ============================================================================

export type FrictionCategory =
  | "energy_drainage"
  | "focus_crash"
  | "spin_cycle"
  | "distraction_spike"
  | "sedentary_lock";

export interface FrictionPoint {
  category: FrictionCategory;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  observedMetric: string;
  tradeIds?: string[];
  moduleName?: string;
}

export type HighYieldCategory =
  | "deep_flow"
  | "high_yield_sprint"
  | "regenerative_momentum"
  | "knowledge_compounding";

export interface HighYieldPattern {
  category: HighYieldCategory;
  title: string;
  description: string;
  observedMetric: string;
  tradeIds?: string[];
  moduleName?: string;
}

export interface InducedHeuristic {
  id: string;
  title: string;
  label: string;
  axiom: string;
  description: string;
  actionableTakeaway: string;
  quadrant: "Focus" | "Facts" | "Funds" | "Feedback";
  category: KnowledgeCategory;
  tags: string[];
  evidence: string[];
  confidence: number; // 0.0 to 1.0
  inducedAt: string;
}

export interface EpisodicPerformanceCritique {
  frictionPoints: FrictionPoint[];
  highYieldPatterns: HighYieldPattern[];
  netEnergy: number;
  totalFocusHours: number;
  totalTrades: number;
  factsYieldCount: number;
  efficiencyRatio: number; // facts per focus hour
  critiqueSummary: string;
}

export interface EpisodicReflexionReport {
  userId: string;
  timestamp: Date;
  daysLookback: number;
  critique: EpisodicPerformanceCritique;
  inducedHeuristics: InducedHeuristic[];
  attachedToGraph: boolean;
  graphNodeIds: string[];
  markdownReport: string;
}

// Helper: safe promise race with timeout
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer!);
  }
}

// In-memory cache for fast retrieval in Daily Briefings / Nightly Resets
const latestReflexionReports = new Map<string, EpisodicReflexionReport>();

// ============================================================================
// Core Analytics: Friction & High-Yield Pattern Detection
// ============================================================================

/**
 * Analyzes trades and telemetry to detect cognitive friction points.
 */
export function analyzeFrictionPoints(
  trades: Trade[],
  biometrics: any[] = [],
  sentinelScores?: AristotelianScores
): FrictionPoint[] {
  const frictionPoints: FrictionPoint[] = [];

  if (!trades || trades.length === 0) {
    return frictionPoints;
  }

  // 1. Energy Drainage: individual severe negative trades or consecutive negative streak
  const negativeTrades = trades.filter((t) => (t.energyDelta ?? 0) < 0);
  let currentNegativeStreak = 0;
  let maxNegativeStreak = 0;

  for (const trade of trades) {
    if ((trade.energyDelta ?? 0) < 0) {
      currentNegativeStreak++;
      if (currentNegativeStreak > maxNegativeStreak) {
        maxNegativeStreak = currentNegativeStreak;
      }
    } else {
      currentNegativeStreak = 0;
    }
  }

  for (const trade of trades) {
    if ((trade.energyDelta ?? 0) <= -2) {
      frictionPoints.push({
        category: "energy_drainage",
        severity: (trade.energyDelta ?? 0) <= -3 ? "CRITICAL" : "WARNING",
        title: `Severe Energy Depletion in ${trade.moduleName || "Task"}`,
        description: `Session drained energy by ${trade.energyDelta}. Mental exhaustion or high resistance observed. ${trade.notes ? `Notes: "${trade.notes}"` : ""}`,
        observedMetric: `energyDelta = ${trade.energyDelta} (${trade.focusActualHours}h)`,
        tradeIds: trade.id ? [trade.id] : undefined,
        moduleName: trade.moduleName,
      });
    }
  }

  if (maxNegativeStreak >= 2) {
    frictionPoints.push({
      category: "energy_drainage",
      severity: maxNegativeStreak >= 3 ? "CRITICAL" : "WARNING",
      title: `Persistent Energy Drainage Spiral (${maxNegativeStreak}x streak)`,
      description: `Detected a streak of ${maxNegativeStreak} consecutive sessions with negative energy delta. Indicates compounding cognitive fatigue.`,
      observedMetric: `${maxNegativeStreak} consecutive negative energy trades`,
      tradeIds: negativeTrades.filter((t) => t.id).map((t) => t.id!) as string[],
    });
  }

  // 2. Focus Crash: actual hours far below expected (e.g. < 50% of expected) or abrupt abandonment
  for (const trade of trades) {
    if (
      trade.focusExpectedHours &&
      trade.focusExpectedHours >= 1.0 &&
      trade.focusActualHours < trade.focusExpectedHours * 0.55
    ) {
      const deficit = Math.round((trade.focusExpectedHours - trade.focusActualHours) * 10) / 10;
      const deficitPct = Math.round((1 - trade.focusActualHours / trade.focusExpectedHours) * 100);
      frictionPoints.push({
        category: "focus_crash",
        severity: deficitPct >= 65 ? "CRITICAL" : "WARNING",
        title: `Focus Crash in ${trade.moduleName || "Task"}`,
        description: `Executed only ${trade.focusActualHours}h vs expected ${trade.focusExpectedHours}h (${deficitPct}% drop-off). Session derailed early.`,
        observedMetric: `Actual: ${trade.focusActualHours}h / Expected: ${trade.focusExpectedHours}h (-${deficit}h deficit)`,
        tradeIds: trade.id ? [trade.id] : undefined,
        moduleName: trade.moduleName,
      });
    }
  }

  // 3. Spin Cycle: high focus time (>= 1.5h) with trivial or empty factual yield
  for (const trade of trades) {
    const hours = trade.focusActualHours || 0;
    const facts = (trade.factsYield || "").trim().toLowerCase();
    const isTrivialFacts =
      facts.length < 15 ||
      ["none", "nothing", "n/a", "wip", "progress", "fixed bug", "coding", "same", "worked"].includes(facts);

    if (hours >= 1.5 && isTrivialFacts) {
      frictionPoints.push({
        category: "spin_cycle",
        severity: hours >= 3.0 ? "CRITICAL" : "WARNING",
        title: `Spin-Cycle / Sunk Cost in ${trade.moduleName || "Task"}`,
        description: `High investment of ${hours}h with negligible factual or architectural yield ("${trade.factsYield || "None"}"). Possible wheel-spinning.`,
        observedMetric: `${hours}h invested with trivial yield`,
        tradeIds: trade.id ? [trade.id] : undefined,
        moduleName: trade.moduleName,
      });
    }
  }

  // 4. Distraction Spike: from biometrics or notes
  for (const bio of biometrics) {
    const breakdown = bio.stateBreakdown || {};
    if (breakdown.distraction >= 35 || breakdown.stress >= 35 || bio.dominantState === "distraction") {
      frictionPoints.push({
        category: "distraction_spike",
        severity: breakdown.distraction >= 50 ? "CRITICAL" : "WARNING",
        title: "Biometric Distraction / Stress Surge",
        description: `Wearable stream captured elevated distraction (${breakdown.distraction ?? 0}%) or stress (${breakdown.stress ?? 0}%) during focus block.`,
        observedMetric: `Distraction: ${breakdown.distraction ?? 0}%, Stress: ${breakdown.stress ?? 0}%`,
      });
      break;
    }
  }

  // 5. Sedentary Lock: > 4.0h of intense focus without kinetic/vitality trades
  const totalFocusHours = trades.reduce((sum, t) => sum + (t.focusActualHours || 0), 0);
  const kineticTrades = trades.filter((t) => {
    const mod = (t.moduleName || "").toLowerCase();
    const tags = (t.tags || []).map((tag) => tag.toLowerCase());
    return (
      mod.includes("vitality") ||
      mod.includes("walk") ||
      mod.includes("plyo") ||
      mod.includes("gym") ||
      tags.some((tag) => ["vitality", "workout", "kinetic", "walk"].includes(tag))
    );
  });

  if (totalFocusHours >= 4.0 && kineticTrades.length === 0 && trades.length >= 3) {
    frictionPoints.push({
      category: "sedentary_lock",
      severity: totalFocusHours >= 6.0 ? "CRITICAL" : "WARNING",
      title: "Sedentary Lock / Hardware Depletion",
      description: `Logged ${totalFocusHours.toFixed(1)}h of intense mental execution without a kinetic reset or vitality trade. Physical stagnation limits cognitive throughput.`,
      observedMetric: `${totalFocusHours.toFixed(1)}h focus with 0 kinetic trades`,
    });
  }

  return frictionPoints;
}

/**
 * Analyzes trades and telemetry to detect high-yield patterns.
 */
export function analyzeHighYieldPatterns(
  trades: Trade[],
  biometrics: any[] = []
): HighYieldPattern[] {
  const patterns: HighYieldPattern[] = [];

  if (!trades || trades.length === 0) {
    return patterns;
  }

  // 1. Deep Flow: High actual hours (>= 1.5h) with positive energy delta (>= +1)
  for (const trade of trades) {
    if (trade.focusActualHours >= 1.5 && (trade.energyDelta ?? 0) >= 1) {
      patterns.push({
        category: "deep_flow",
        title: `Sustained Deep Flow in ${trade.moduleName || "Task"}`,
        description: `Maintained uninterrupted flow for ${trade.focusActualHours}h while elevating energy (+${trade.energyDelta}). High autonomy and absorption.`,
        observedMetric: `${trade.focusActualHours}h focus with +${trade.energyDelta} energy`,
        tradeIds: trade.id ? [trade.id] : undefined,
        moduleName: trade.moduleName,
      });
    }
  }

  // Check biometrics for flow
  for (const bio of biometrics) {
    if (bio.dominantState === "flow" || (bio.focusScore && bio.focusScore >= 80)) {
      patterns.push({
        category: "deep_flow",
        title: "Biometric Peak Flow Resonance",
        description: `Wearable captured sustained diaphragmatic breathing with peak flow score (${bio.focusScore ?? 85}/100).`,
        observedMetric: `Dominant state: ${bio.dominantState}, Focus score: ${bio.focusScore ?? 85}`,
      });
      break;
    }
  }

  // 2. High-Yield Sprint: rich factual yield achieved in concise time (<= 2.0h)
  for (const trade of trades) {
    const facts = (trade.factsYield || "").trim();
    if (trade.focusActualHours > 0 && trade.focusActualHours <= 2.0 && facts.length >= 40) {
      patterns.push({
        category: "high_yield_sprint",
        title: `High-Yield Sprint in ${trade.moduleName || "Task"}`,
        description: `Delivered high factual density (${facts.slice(0, 70)}...) in a concise ${trade.focusActualHours}h burst.`,
        observedMetric: `${facts.length} chars yield in ${trade.focusActualHours}h`,
        tradeIds: trade.id ? [trade.id] : undefined,
        moduleName: trade.moduleName,
      });
    }
  }

  // 3. Regenerative Momentum: multiple positive energy trades in sequence
  let positiveStreak = 0;
  let maxPositiveStreak = 0;
  for (const trade of trades) {
    if ((trade.energyDelta ?? 0) > 0) {
      positiveStreak++;
      if (positiveStreak > maxPositiveStreak) {
        maxPositiveStreak = positiveStreak;
      }
    } else {
      positiveStreak = 0;
    }
  }

  if (maxPositiveStreak >= 2) {
    patterns.push({
      category: "regenerative_momentum",
      title: `Regenerative Momentum Streak (${maxPositiveStreak}x)`,
      description: `Logged ${maxPositiveStreak} consecutive sessions that yielded positive energy. Indicates strong intrinsic motivation and alignment.`,
      observedMetric: `${maxPositiveStreak} consecutive positive energy trades`,
    });
  }

  // 4. Knowledge Compounding: architecture or heuristic tags with clear takeaways
  const compoundingTrades = trades.filter((t) => {
    const tags = (t.tags || []).map((x) => x.toLowerCase());
    return tags.some((x) =>
      ["architecture", "heuristic", "pattern", "insight", "breakthrough", "design"].includes(x)
    );
  });

  if (compoundingTrades.length >= 2) {
    patterns.push({
      category: "knowledge_compounding",
      title: "Architectural Knowledge Compounding",
      description: `${compoundingTrades.length} trades codified reusable meta-patterns or architectural decisions into the 4F Knowledge Graph.`,
      observedMetric: `${compoundingTrades.length} knowledge-compounding trades logged`,
    });
  }

  return patterns;
}

/**
 * Synthesizes an Episodic Performance Critique combining friction points,
 * high-yield patterns, and macroeconomic telemetry.
 */
export function synthesizeEpisodicCritique(
  trades: Trade[],
  biometrics: any[] = [],
  sentinelScores?: AristotelianScores
): EpisodicPerformanceCritique {
  const frictionPoints = analyzeFrictionPoints(trades, biometrics, sentinelScores);
  const highYieldPatterns = analyzeHighYieldPatterns(trades, biometrics);

  const totalFocusHours =
    Math.round(trades.reduce((sum, t) => sum + (t.focusActualHours || 0), 0) * 10) / 10;
  const netEnergy = trades.reduce((sum, t) => sum + (t.energyDelta || 0), 0);
  const totalTrades = trades.length;

  const factsYieldCount = trades.filter((t) => {
    const facts = (t.factsYield || "").trim().toLowerCase();
    return facts.length >= 15 && !["none", "nothing", "wip", "progress"].includes(facts);
  }).length;

  const efficiencyRatio =
    totalFocusHours > 0 ? Math.round((factsYieldCount / totalFocusHours) * 100) / 100 : 0;

  // Generate crisp critique summary
  let critiqueSummary = "";
  if (frictionPoints.length === 0 && highYieldPatterns.length > 0) {
    critiqueSummary = `Exceptional momentum: ${totalFocusHours}h deployed with zero critical friction points and ${highYieldPatterns.length} sustained flow pattern(s).`;
  } else if (frictionPoints.length > 0 && highYieldPatterns.length > 0) {
    critiqueSummary = `Bimodal execution: High-yield flow demonstrated in ${highYieldPatterns[0]?.moduleName || "core modules"}, but ${frictionPoints.length} friction point(s) caused energy leaks or focus degradation.`;
  } else if (frictionPoints.length > 0) {
    critiqueSummary = `Friction-dominant phase: ${frictionPoints.length} cognitive friction point(s) detected, resulting in a net energy delta of ${netEnergy >= 0 ? "+" : ""}${netEnergy}. Root cause: ${frictionPoints[0]?.title}.`;
  } else {
    critiqueSummary = `Baseline execution: ${totalTrades} trade(s) logged across ${totalFocusHours}h with stable energy dynamics.`;
  }

  return {
    frictionPoints,
    highYieldPatterns,
    netEnergy,
    totalFocusHours,
    totalTrades,
    factsYieldCount,
    efficiencyRatio,
    critiqueSummary,
  };
}

// ============================================================================
// Axiom / Heuristic Induction Engine
// ============================================================================

/**
 * Deterministic induction of high-order axioms grounded in observed evidence.
 * Used as primary fallback or when running offline / in tests.
 */
export function induceDeterministicHeuristics(
  critique: EpisodicPerformanceCritique
): InducedHeuristic[] {
  const heuristics: InducedHeuristic[] = [];
  const nowIso = new Date().toISOString();

  // Rule 1: Grounded in primary friction point
  if (critique.frictionPoints.length > 0) {
    const primary = critique.frictionPoints[0];

    if (primary.category === "energy_drainage") {
      heuristics.push({
        id: `heuristic_energy_floor_${Date.now()}`,
        title: "Energy Floor Preemption Rule",
        label: "Energy Floor Preemption Rule",
        axiom: "Executing code or analytical tasks beneath an energy delta threshold of -1 incurs compounding cognitive debt and degrades subsequent session quality.",
        description: "Operating under negative energy states exhausts neurotransmitter reserves and produces low-quality artifacts that require subsequent refactoring.",
        actionableTakeaway: "Immediately terminate or pivot the current session when energy drops below -1; enforce a 15-minute physical reset before sparking new work.",
        quadrant: "Funds",
        category: "strategy",
        tags: ["energy", "vitality", "preemption", "reflexion"],
        evidence: [primary.description, primary.observedMetric],
        confidence: 0.88,
        inducedAt: nowIso,
      });
    } else if (primary.category === "focus_crash") {
      heuristics.push({
        id: `heuristic_scope_atomization_${Date.now()}`,
        title: "Micro-Scope Atomization Axiom",
        label: "Micro-Scope Atomization Axiom",
        axiom: "Sessions with ambiguous deliverables or unconstrained time horizons trigger subconscious friction and premature disengagement.",
        description: "Focus crashes occur when the cognitive load of defining the next step exceeds the effort of execution.",
        actionableTakeaway: "Never spark a session exceeding 60 minutes without pre-defining a single verifiable binary outcome in the task description.",
        quadrant: "Focus",
        category: "strategy",
        tags: ["focus", "scoping", "atomization", "reflexion"],
        evidence: [primary.description, primary.observedMetric],
        confidence: 0.92,
        inducedAt: nowIso,
      });
    } else if (primary.category === "spin_cycle") {
      heuristics.push({
        id: `heuristic_timeboxed_pivot_${Date.now()}`,
        title: "Timeboxed Sunk-Cost Severance Rule",
        label: "Timeboxed Sunk-Cost Severance Rule",
        axiom: "Spending over 90 minutes on a bug or problem without an acquired fact indicates a flawed mental model rather than insufficient effort.",
        description: "Spin cycles are caused by cognitive fixation on an invalid hypothesis. Brute-force time investment yields diminishing returns.",
        actionableTakeaway: "Hard-cap unresolved roadblocks at 90 minutes: write down the explicit failure hypothesis, close editor tabs, and consult Council or Rubber Duck.",
        quadrant: "Facts",
        category: "gotcha",
        tags: ["debugging", "spin_cycle", "heuristics", "reflexion"],
        evidence: [primary.description, primary.observedMetric],
        confidence: 0.85,
        inducedAt: nowIso,
      });
    } else if (primary.category === "sedentary_lock") {
      heuristics.push({
        id: `heuristic_kinetic_coupling_${Date.now()}`,
        title: "Kinetic-Cognitive Coupling Axiom",
        label: "Kinetic-Cognitive Coupling Axiom",
        axiom: "Mental clarity and working memory bandwidth are strictly bound to biological bloodflow and diaphragmatic oxygenation.",
        description: "Sustained static posture induces intellectual petrification and false fatigue.",
        actionableTakeaway: "Couple every 120 minutes of sedentary keyboard focus with a mandatory 10-minute kinetic flush (jump squats or sunlight walk).",
        quadrant: "Funds",
        category: "strategy",
        tags: ["kinetic", "biomechanics", "vitality", "reflexion"],
        evidence: [primary.description, primary.observedMetric],
        confidence: 0.90,
        inducedAt: nowIso,
      });
    } else {
      heuristics.push({
        id: `heuristic_distraction_containment_${Date.now()}`,
        title: "Context Partitioning Principle",
        label: "Context Partitioning Principle",
        axiom: "Context-switching during high-order execution fragments the attentional residue, reducing problem-solving capacity by up to 40%.",
        description: "Distraction spikes during focus blocks shatter mental scratchpads and multiply time-to-flow.",
        actionableTakeaway: "Activate Do-Not-Disturb on all mobile and desktop devices prior to issuing /spark; eliminate external notification surfaces.",
        quadrant: "Focus",
        category: "strategy",
        tags: ["focus", "attention", "partitioning", "reflexion"],
        evidence: [primary.description, primary.observedMetric],
        confidence: 0.86,
        inducedAt: nowIso,
      });
    }
  }

  // Rule 2: Grounded in high-yield pattern or efficiency compounding
  if (critique.highYieldPatterns.length > 0) {
    const yieldPattern = critique.highYieldPatterns[0];

    if (yieldPattern.category === "deep_flow") {
      heuristics.push({
        id: `heuristic_flow_sanctuary_${Date.now() + 1}`,
        title: "Morning Flow Sanctuary Law",
        label: "Morning Flow Sanctuary Law",
        axiom: "Flow states sustained beyond 90 minutes generate compounding factual retention and positive net energy deltas.",
        description: "When uninterrupted deep work is protected from context switches, the brain enters autotelic flow where production feels effortless.",
        actionableTakeaway: "Reserve the first 120 minutes after dawn exclusively for single-task deep flow; defer all incoming communication and peripheral triage.",
        quadrant: "Focus",
        category: "win",
        tags: ["flow", "focus", "circadian", "reflexion"],
        evidence: [yieldPattern.description, yieldPattern.observedMetric],
        confidence: 0.94,
        inducedAt: nowIso,
      });
    } else if (yieldPattern.category === "high_yield_sprint") {
      heuristics.push({
        id: `heuristic_sprint_density_${Date.now() + 1}`,
        title: "Compact Sprint Density Law",
        label: "Compact Sprint Density Law",
        axiom: "Concise, high-urgency focus blocks (45-90m) yield greater factual density than extended marathon sessions.",
        description: "Parkinson's Law dictates that cognitive work expands to fill available time; constrained horizons force high factual extraction.",
        actionableTakeaway: "Default session duration to 60 minutes with an explicit factual yield quota before opening tools.",
        quadrant: "Facts",
        category: "strategy",
        tags: ["sprint", "efficiency", "parkinsons_law", "reflexion"],
        evidence: [yieldPattern.description, yieldPattern.observedMetric],
        confidence: 0.91,
        inducedAt: nowIso,
      });
    } else {
      heuristics.push({
        id: `heuristic_virtuous_momentum_${Date.now() + 1}`,
        title: "Virtuous Momentum Compounding",
        label: "Virtuous Momentum Compounding",
        axiom: "Energy deltas compound cyclically: banking a clean win in the early morning primes neurochemistry for subsequent hard problem-solving.",
        description: "Successive positive trades reinforce self-efficacy and stave off cognitive fatigue.",
        actionableTakeaway: "Engineer an easy, high-probability micro-win as the first trade of each operational cycle to establish neural momentum.",
        quadrant: "Feedback",
        category: "win",
        tags: ["momentum", "psychology", "dopamine", "reflexion"],
        evidence: [yieldPattern.description, yieldPattern.observedMetric],
        confidence: 0.89,
        inducedAt: nowIso,
      });
    }
  } else if (heuristics.length === 0) {
    // Fallback baseline heuristic if no strong friction or yield was recorded
    heuristics.push({
      id: `heuristic_deliberate_intentionality_${Date.now()}`,
      title: "Deliberate Intentionality Baseline",
      label: "Deliberate Intentionality Baseline",
      axiom: "Telemetry that is actively tracked and reflected upon prevents systemic drift into unconscious habits.",
      description: "Consistent logging of Focus, Facts, Funds, and Feedback creates self-calibrating metacognitive loops.",
      actionableTakeaway: "Log every completed work block with an honest energy delta and tangible factual yield before transitioning to the next task.",
      quadrant: "Feedback",
      category: "strategy",
      tags: ["metacognition", "telemetry", "habits", "reflexion"],
      evidence: [`${critique.totalTrades} trade(s) logged across ${critique.totalFocusHours}h`],
      confidence: 0.85,
      inducedAt: nowIso,
    });
  }

  // Ensure at most 2 high-order heuristics are produced
  return heuristics.slice(0, 2);
}

const REFLEXION_INDUCTION_PROMPT = `
You are the Autonomous Episodic Reflexion & Self-Induction Architect for the "Fabric OS" 4F Meta-OS (Focus, Facts, Funds, Feedback).
Your mission is to perform an episodic memory post-mortem on recent user telemetry and induce 1-2 NEW, HIGH-ORDER ACTIONABLE AXIOMS / HEURISTICS.

Input Telemetry & Critique:
- Net Energy Delta: {NET_ENERGY}
- Total Focus Hours: {TOTAL_HOURS}h across {TRADES_COUNT} trades
- Facts Efficiency: {EFFICIENCY} facts/hour
- Identified Friction Points:
{FRICTION_POINTS}
- High-Yield Patterns:
{HIGH_YIELD_PATTERNS}

Induction Rules:
1. Formulate 1-2 universal, high-order decision rules (axioms) strictly grounded in the observed evidence.
2. Rule 1 MUST address the primary cognitive friction point (preempting recurrence).
3. Rule 2 MUST amplify the observed high-yield pattern or optimize efficiency.
4. Each heuristic must include:
   - "label": Short, memorable title (e.g. "Energy Floor Preemption Rule", "Parkinson Boundary Law").
   - "axiom": Deep foundational principle (1-2 sentences).
   - "actionableTakeaway": Concrete behavioral instruction for future focus blocks.
   - "quadrant": Exactly one of "Focus", "Facts", "Funds", "Feedback".
   - "category": One of "strategy", "insight", "gotcha", "win", "tool".
   - "tags": Array of 3-4 lowercase tags.
   - "evidence": Array of 1-2 strings citing the specific observed pattern.
   - "confidence": Float between 0.80 and 0.98.

Respond strictly with valid raw JSON conforming to:
{
  "heuristics": [
    {
      "label": "string",
      "axiom": "string",
      "actionableTakeaway": "string",
      "quadrant": "Focus" | "Facts" | "Funds" | "Feedback",
      "category": "strategy" | "insight" | "gotcha" | "win" | "tool",
      "tags": ["string"],
      "evidence": ["string"],
      "confidence": number
    }
  ]
}
`;

/**
 * Induces 1-2 new actionable heuristics using Gemini, with deterministic fallback.
 */
export async function induceHeuristics(
  critique: EpisodicPerformanceCritique,
  useLLM = true
): Promise<InducedHeuristic[]> {
  const deterministicFallback = induceDeterministicHeuristics(critique);

  if (!useLLM || !config.geminiApiKey || config.geminiApiKey.includes("mock")) {
    return deterministicFallback;
  }

  try {
    const frictionText =
      critique.frictionPoints.length > 0
        ? critique.frictionPoints
            .map(
              (f, i) =>
                `${i + 1}. [${f.severity}] ${f.title} (${f.category}): ${f.description} [Observed: ${f.observedMetric}]`
            )
            .join("\n")
        : "None detected.";

    const yieldText =
      critique.highYieldPatterns.length > 0
        ? critique.highYieldPatterns
            .map(
              (h, i) =>
                `${i + 1}. ${h.title} (${h.category}): ${h.description} [Observed: ${h.observedMetric}]`
            )
            .join("\n")
        : "None detected.";

    const prompt = REFLEXION_INDUCTION_PROMPT.replace("{NET_ENERGY}", `${critique.netEnergy}`)
      .replace("{TOTAL_HOURS}", `${critique.totalFocusHours}`)
      .replace("{TRADES_COUNT}", `${critique.totalTrades}`)
      .replace("{EFFICIENCY}", `${critique.efficiencyRatio}`)
      .replace("{FRICTION_POINTS}", frictionText)
      .replace("{HIGH_YIELD_PATTERNS}", yieldText);

    // Set a 6-second timeout for LLM call
    const callPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM generation timeout")), 6000)
    );

    const res: any = await Promise.race([callPromise, timeoutPromise]);
    let raw = res.response?.text?.()?.trim() || "";

    if (raw.startsWith("```json")) {
      raw = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    } else if (raw.startsWith("```")) {
      raw = raw.replace(/^```\s*/i, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(raw);
    if (parsed.heuristics && Array.isArray(parsed.heuristics) && parsed.heuristics.length > 0) {
      const induced: InducedHeuristic[] = [];
      const nowIso = new Date().toISOString();

      for (let i = 0; i < Math.min(2, parsed.heuristics.length); i++) {
        const item = parsed.heuristics[i];
        if (item.label && item.axiom && item.actionableTakeaway) {
          const quad = ["Focus", "Facts", "Funds", "Feedback"].includes(item.quadrant)
            ? item.quadrant
            : "Focus";
          const cat = ["strategy", "insight", "gotcha", "win", "tool"].includes(item.category)
            ? item.category
            : "strategy";

          const slug = item.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30);

          induced.push({
            id: `heuristic_episodic_${slug}_${Date.now() + i}`,
            title: item.label,
            label: item.label,
            axiom: item.axiom,
            description: item.axiom,
            actionableTakeaway: item.actionableTakeaway,
            quadrant: quad,
            category: cat,
            tags: Array.isArray(item.tags) ? item.tags : ["reflexion", "axiom", quad.toLowerCase()],
            evidence: Array.isArray(item.evidence) ? item.evidence : [critique.critiqueSummary],
            confidence: typeof item.confidence === "number" ? item.confidence : 0.88,
            inducedAt: nowIso,
          });
        }
      }

      if (induced.length > 0) {
        return induced;
      }
    }
  } catch (err) {
    console.warn("⚠️ Episodic heuristic induction falling back to deterministic engine:", err);
  }

  return deterministicFallback;
}

// ============================================================================
// Knowledge Graph Integration
// ============================================================================

/**
 * Attaches induced heuristics to `data/graph_summary.json`, `data/knowledge_graph.json`,
 * and Firestore `knowledgeCollection` & `graphsCollection`.
 */
export async function attachHeuristicsToKnowledgeGraph(
  heuristics: InducedHeuristic[],
  userId: string,
  skipDiskWrite = false,
  skipFirestore = false
): Promise<{ attachedToGraph: boolean; nodeIds: string[] }> {
  if (!heuristics || heuristics.length === 0) {
    return { attachedToGraph: false, nodeIds: [] };
  }

  const nodeIds: string[] = [];

  // 1. Update local data/graph_summary.json
  if (!skipDiskWrite && fs.existsSync(GRAPH_SUMMARY_PATH)) {
    try {
      const raw = fs.readFileSync(GRAPH_SUMMARY_PATH, "utf-8");
      const summary = JSON.parse(raw);

      if (summary && Array.isArray(summary.nodes) && Array.isArray(summary.edges)) {
        for (const h of heuristics) {
          nodeIds.push(h.id);

          // Check if already in nodes
          const exists = summary.nodes.some((n: any) => n.id === h.id);
          if (!exists) {
            summary.nodes.push({
              id: h.id,
              type: "heuristic",
              label: h.label,
              description: h.axiom,
              weight: Math.round(h.confidence * 40),
              quadrant: h.quadrant,
              category: h.category,
              tags: h.tags,
              author: "Episodic Reflexion",
              actionableTakeaway: h.actionableTakeaway,
              telegramStreamUrl: "",
              notionUrl: "",
            });

            // Add edge to corresponding dimension
            const targetDim = `dim_${h.quadrant.toLowerCase()}`;
            summary.edges.push({
              source: h.id,
              target: targetDim,
              relation: "applies_to",
              weight: 3,
            });
          }
        }

        // Update metadata
        if (summary.metadata) {
          summary.metadata.totalNodes = summary.nodes.length;
          summary.metadata.totalEdges = summary.edges.length;
          summary.metadata.lastReflexionAt = new Date().toISOString();
        }

        fs.writeFileSync(GRAPH_SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf-8");
      }
    } catch (err) {
      console.warn("⚠️ Could not update data/graph_summary.json with induced heuristics:", err);
    }
  }

  // 2. Update local data/knowledge_graph.json if present
  if (!skipDiskWrite && fs.existsSync(KNOWLEDGE_GRAPH_PATH)) {
    try {
      const rawKg = fs.readFileSync(KNOWLEDGE_GRAPH_PATH, "utf-8");
      const kg = JSON.parse(rawKg);
      if (kg && Array.isArray(kg.nodes) && Array.isArray(kg.edges)) {
        for (const h of heuristics) {
          const exists = kg.nodes.some((n: any) => n.id === h.id);
          if (!exists) {
            kg.nodes.push({
              id: h.id,
              type: "heuristic",
              label: h.label,
              description: h.axiom,
              weight: Math.round(h.confidence * 40),
              properties: {
                quadrant: h.quadrant,
                category: h.category,
                tags: h.tags,
                actionableTakeaway: h.actionableTakeaway,
                evidence: h.evidence,
                author: "Episodic Reflexion",
              },
            });

            const targetDim = `dim_${h.quadrant.toLowerCase()}`;
            kg.edges.push({
              source: h.id,
              target: targetDim,
              relation: "applies_to",
              weight: 3,
            });
          }
        }

        if (kg.metadata) {
          kg.metadata.totalNodes = kg.nodes.length;
          kg.metadata.totalEdges = kg.edges.length;
        }

        fs.writeFileSync(KNOWLEDGE_GRAPH_PATH, JSON.stringify(kg, null, 2), "utf-8");
      }
    } catch (err) {
      console.warn("⚠️ Could not update data/knowledge_graph.json with induced heuristics:", err);
    }
  }

  // 3. Persist to Firestore: create knowledge item for each heuristic
  if (!skipFirestore) {
    for (const h of heuristics) {
      try {
        await createKnowledgeItem({
          userId,
          timestamp: new Date(),
          category: h.category,
          title: `[Axiom] ${h.label}`,
          content: `${h.axiom}\n\nEvidence Base:\n${h.evidence.map((e) => `• ${e}`).join("\n")}`,
          tags: ["reflexion", "axiom", "heuristic", ...h.tags],
          actionableTakeaway: h.actionableTakeaway,
          quadrant: h.quadrant,
          author: "Episodic Reflexion",
          userConclusions: `[Autonomous Episodic Induction] Axiom formulated on ${new Date().toLocaleDateString()} grounded in observed cognitive telemetry.`,
        });
      } catch (err) {
        console.warn(`⚠️ Could not save heuristic "${h.label}" to Firestore knowledgeCollection:`, err);
      }
    }
  }

  return {
    attachedToGraph: true,
    nodeIds: heuristics.map((h) => h.id),
  };
}

// ============================================================================
// Report Formatting
// ============================================================================

/**
 * Formats the full Episodic Reflexion report in Telegram Markdown.
 */
export function formatReflexionMarkdown(
  userId: string,
  daysLookback: number,
  critique: EpisodicPerformanceCritique,
  heuristics: InducedHeuristic[]
): string {
  const energySign = critique.netEnergy > 0 ? `+${critique.netEnergy}` : `${critique.netEnergy}`;
  const energyEmoji =
    critique.netEnergy >= 2 ? "🔋 High" : critique.netEnergy <= -1 ? "🪫 Depleted" : "⚖️ Stable";

  // Telemetry Vector Section
  const telemetrySection =
    `📊 *Telemetry Vector (Past ${daysLookback} Days):*\n` +
    `• ⏳ *Focus Hours Logged:* \`${critique.totalFocusHours}h\` across \`${critique.totalTrades}\` trade(s)\n` +
    `• ⚡ *Net Energy Delta:* \`${energySign}\` (${energyEmoji})\n` +
    `• 💡 *Facts Yielded:* \`${critique.factsYieldCount}\` items (Efficiency: \`${critique.efficiencyRatio}\` facts/h)`;

  // Friction Section
  let frictionSection = "✅ *No critical cognitive friction points or energy drains detected.*";
  if (critique.frictionPoints.length > 0) {
    const items = critique.frictionPoints.map((f) => {
      const icon = f.severity === "CRITICAL" ? "🔴" : f.severity === "WARNING" ? "🟡" : "ℹ️";
      return `• ${icon} *[${f.severity}] ${f.title}*\n  _${f.description}_\n  \`Metric: ${f.observedMetric}\``;
    });
    frictionSection = `⚠️ *Cognitive Friction Diagnosed (${critique.frictionPoints.length}):*\n${items.join("\n")}`;
  }

  // High-Yield Section
  let highYieldSection = "ℹ️ *No peak flow or high-yield sprints recorded in this period.*";
  if (critique.highYieldPatterns.length > 0) {
    const items = critique.highYieldPatterns.map((h) => {
      return `• 🟢 *${h.title}*\n  _${h.description}_\n  \`Metric: ${h.observedMetric}\``;
    });
    highYieldSection = `🌊 *High-Yield Flow Patterns (${critique.highYieldPatterns.length}):*\n${items.join("\n")}`;
  }

  // Induced Axioms Section
  let axiomsSection = "ℹ️ *No new axioms induced.*";
  if (heuristics.length > 0) {
    const items = heuristics.map((h, i) => {
      return (
        `${i + 1}. 💡 *${h.label}* [${h.quadrant}]\n` +
        `   _Axiom: ${h.axiom}_\n` +
        `   👉 *Rule of Engagement:* *${h.actionableTakeaway}*\n` +
        `   🏷️ \`${h.tags.map((t) => `#${t}`).join(" ")}\` • _Confidence: ${Math.round(h.confidence * 100)}%_`
      );
    });
    axiomsSection = `📜 *Induced High-Order Axioms & Decision Rules:*\n${items.join("\n\n")}`;
  }

  return (
    `🧠 *AUTONOMOUS EPISODIC REFLEXION & COGNITIVE CRITIQUE*\n` +
    `_Fabric OS Episodic Memory Loop • ${new Date().toLocaleDateString()}_\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${telemetrySection}\n\n` +
    `🎯 *Critique Synthesis:*\n` +
    `_${critique.critiqueSummary}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${frictionSection}\n\n` +
    `${highYieldSection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${axiomsSection}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🪴 _Heuristics synthesized and attached to Knowledge Graph._`
  );
}

// ============================================================================
// Public API: runEpisodicReflexion & getReflexionSummary
// ============================================================================

export interface EpisodicReflexionOptions {
  trades?: Trade[];
  biometrics?: any[];
  sentinelScores?: AristotelianScores;
  skipGraphWrite?: boolean;
  skipFirestore?: boolean;
  useLLM?: boolean;
}

/**
 * Runs the Autonomous Episodic Memory & Reflexion Loop:
 * 1. Fetches recent trades, focus sessions, and Sentinel audits.
 * 2. Synthesizes an Episodic Performance Critique (friction vs high-yield).
 * 3. Induces 1-2 new actionable axioms / heuristics.
 * 4. Proposes or attaches heuristics to the Knowledge Graph & Firestore.
 * 5. Persists report and returns comprehensive analysis.
 */
export async function runEpisodicReflexion(
  userId: string,
  daysLookback = 7,
  options: EpisodicReflexionOptions = {}
): Promise<EpisodicReflexionReport> {
  const cutoffDate = new Date(Date.now() - daysLookback * 24 * 60 * 60 * 1000);
  const skipFirestore = options.skipFirestore ?? (options.skipGraphWrite && Boolean(options.trades));

  // 1. Ingestion: Trades, Focus Sessions, and Sentinel Telemetry
  let trades = options.trades;
  if (!trades) {
    if (!skipFirestore) {
      try {
        const recent = await withTimeout(getRecentTrades(userId, 50), 1500, []);
        trades = recent.filter((t) => new Date(t.timestamp).getTime() >= cutoffDate.getTime());
        if (trades.length === 0 && recent.length > 0) {
          trades = recent.slice(0, 15);
        }
      } catch (err) {
        console.warn("⚠️ Could not fetch recent trades for reflexion:", err);
        trades = [];
      }
    } else {
      trades = [];
    }
  }

  let biometrics = options.biometrics;
  if (!biometrics) {
    if (!skipFirestore) {
      try {
        const bioPromise = biometricsCollection
          .where("userId", "==", userId)
          .limit(10)
          .get();
        const bioSnap = await withTimeout(bioPromise, 1500, null);
        biometrics = bioSnap ? bioSnap.docs.map((d) => d.data()) : [];
      } catch {
        biometrics = [];
      }
    } else {
      biometrics = [];
    }
  }

  let sentinelScores = options.sentinelScores;
  if (!sentinelScores) {
    if (!skipFirestore) {
      try {
        const userState = await withTimeout(getUserState(userId), 1500, null);
        sentinelScores = userState?.goldenMeans;
      } catch {
        sentinelScores = undefined;
      }
    } else {
      sentinelScores = undefined;
    }
  }

  // 2. Synthesize Episodic Performance Critique
  const critique = synthesizeEpisodicCritique(trades, biometrics, sentinelScores);

  // 3. Induce New Actionable Axioms / Decision Rules
  const heuristics = await induceHeuristics(critique, options.useLLM ?? true);

  // 4. Attach Heuristics to Knowledge Graph & Firestore
  const graphResult = await attachHeuristicsToKnowledgeGraph(
    heuristics,
    userId,
    options.skipGraphWrite ?? false,
    skipFirestore
  );

  // 5. Generate Markdown Diagnostic Report
  const markdownReport = formatReflexionMarkdown(userId, daysLookback, critique, heuristics);

  const report: EpisodicReflexionReport = {
    userId,
    timestamp: new Date(),
    daysLookback,
    critique,
    inducedHeuristics: heuristics,
    attachedToGraph: graphResult.attachedToGraph,
    graphNodeIds: graphResult.nodeIds,
    markdownReport,
  };

  // Cache in-memory
  latestReflexionReports.set(userId, report);

  // 6. Persist to Firestore: db.collection("agentOutputs") and db.collection("reflexion")
  if (!options.skipGraphWrite && !options.skipFirestore) {
    try {
      await db.collection("agentOutputs").add({
        agentName: "reflexion",
        userId,
        runAt: new Date(),
        daysLookback,
        frictionCount: critique.frictionPoints.length,
        highYieldCount: critique.highYieldPatterns.length,
        heuristicsCount: heuristics.length,
        inducedAxioms: heuristics.map((h) => ({ id: h.id, label: h.label, axiom: h.axiom })),
        report: markdownReport,
      });
    } catch (err) {
      // Non-fatal if firestore is unconfigured
    }
  }

  return report;
}

/**
 * Returns formatted markdown summary of the latest episodic reflexion
 * for inclusion in the Daily Briefing or Nightly Reset.
 */
export async function getReflexionSummary(userId: string): Promise<string> {
  let report = latestReflexionReports.get(userId);

  if (!report) {
    // Try to run a quick reflexion
    try {
      report = await runEpisodicReflexion(userId, 7);
    } catch (err) {
      console.warn("⚠️ getReflexionSummary could not run reflexion:", err);
    }
  }

  if (!report || (report.critique.frictionPoints.length === 0 && report.inducedHeuristics.length === 0)) {
    return (
      `🧠 *Episodic Memory & Reflexion:*\n` +
      `_Telemetry is operating in equilibrium. No active friction points or newly induced axioms._`
    );
  }

  const critique = report.critique;
  const frictionSnippet =
    critique.frictionPoints.length > 0
      ? `⚠️ *Friction:* ${critique.frictionPoints.length} point(s) detected (${critique.frictionPoints[0]?.title}).`
      : "✅ *Friction:* System clean with no cognitive drainage.";

  const yieldSnippet =
    critique.highYieldPatterns.length > 0
      ? `🌊 *Flow:* High yield observed (${critique.highYieldPatterns[0]?.title}).`
      : `⏱️ *Focus:* \`${critique.totalFocusHours}h\` logged with net energy \`${critique.netEnergy >= 0 ? "+" : ""}${critique.netEnergy}\`.`;

  let axiomSnippet = "";
  if (report.inducedHeuristics.length > 0) {
    const primaryAxiom = report.inducedHeuristics[0];
    axiomSnippet =
      `\n💡 *Active Induced Axiom:* *${primaryAxiom.label}*\n` +
      `   👉 _${primaryAxiom.actionableTakeaway}_`;
  }

  return (
    `🧠 *Episodic Reflexion & Induced Heuristics:*\n` +
    `${frictionSnippet}\n` +
    `${yieldSnippet}` +
    `${axiomSnippet}`
  );
}
