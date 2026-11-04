/**
 * Fabric OS — Nightly Consolidation & Dream Loop Architect
 *
 * Implements the nocturnal cognitive consolidation loop bridging:
 * 1. Reality sensing aggregation (.ambient_state.json, git commit logs, completed HTN tasks, focus sprint minutes, FOCI breath stats).
 * 2. Cybernetic 4F Delta and loss reduction calculation:
 *      ΔL = L(S_initial) - L(S_final)
 * 3. Axiom & heuristic induction via episodic reflexion.
 * 4. Knowledge Graph synthesis & synapse cluster updating (data/graph_summary.json).
 * 5. Morning Briefing Memo generation (Yesterday's 4F trajectory, recovery index, #1 priority HTN objective, Sonic Mind warmup track).
 * 6. Dual-persistence: Firestore 'consolidations' collection & local disk 'data/consolidations/'.
 */

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  type FourFVector,
  type CyberneticWeights,
  DEFAULT_CYBERNETIC_WEIGHTS,
  calculateCyberneticLoss,
  calculateLossReduction,
} from "../services/governor.js";
import {
  type AmbientContext,
  DEFAULT_AMBIENT_STATE_PATH,
  getCurrentAmbientContext,
} from "../services/ambient.js";
import {
  type InducedHeuristic,
  induceDeterministicHeuristics,
  analyzeFrictionPoints,
  analyzeHighYieldPatterns,
  synthesizeEpisodicCritique,
} from "./reflexion.js";
import { listPlansLocal } from "../tasks/store.js";
import type { TaskPlan } from "../tasks/types.js";
import { listSongs } from "../music/store.js";
import type { FabricSong } from "../music/types.js";
import { calculateRecoveryScore } from "../services/wearables.js";
import { db } from "../db/firestore.js";
import type { Trade, AristotelianScores } from "../db/types.js";

const execFileAsync = promisify(execFile);

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface GitCommitRecord {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface FociBreathStats {
  respirationRateBpm: number;
  flowMinutes: number;
  calmMinutes: number;
  stressMinutes: number;
  compositeRecoveryScore: number;
}

export interface DailyTelemetryAggregation {
  date: string;
  ambient: {
    frontmostApp: string;
    appCategory: string;
    sedentaryMinutes: number;
    tranceState: string;
    continuousActivitySeconds: number;
    recentErrorCount: number;
  };
  gitCommits: GitCommitRecord[];
  completedTasks: Array<{
    planId: string;
    goal: string;
    completedAt: string;
    completedStepsCount: number;
  }>;
  focusSprintMinutes: number;
  fociStats: FociBreathStats;
  tradesCount: number;
  totalFactsAcquired: number;
}

export interface Aristotelian4FDelta {
  previousVector: FourFVector;
  currentVector: FourFVector;
  deltaVector: FourFVector;
  initialLoss: number;
  finalLoss: number;
  lossReduction: number;
  percentageImprovement: number;
}

export interface PriorityHtnObjective {
  planId?: string;
  goal: string;
  rationale: string;
  nextStep?: string;
  category?: string;
}

export interface RecommendedWarmupTrack {
  id: string;
  title: string;
  artist: string;
  energyLevel: number;
  mood: string[];
  reason: string;
  youtubeUrl?: string;
}

export interface MorningBriefingMemo {
  date: string;
  headline: string;
  yesterdaySummary: string;
  recoveryIndex: number;
  fourFTrajectory: string;
  priorityHtnObjective: PriorityHtnObjective;
  recommendedWarmupTrack: RecommendedWarmupTrack;
  stoicAnchor: string;
  telegramMarkdown: string;
  smsText: string;
}

export interface NightlyConsolidationResult {
  id: string;
  timestamp: string;
  date: string;
  userId: string;
  aggregation: DailyTelemetryAggregation;
  fourFDelta: Aristotelian4FDelta;
  inducedAxioms: InducedHeuristic[];
  graphUpdates: {
    newNodes: string[];
    updatedClusters: string[];
    totalNodes: number;
    totalEdges: number;
  };
  morningBriefing: MorningBriefingMemo;
  persistedPaths: {
    localJson?: string;
    firestoreId?: string;
  };
}

export interface NightlyConsolidationOptions {
  userId?: string;
  date?: string; // YYYY-MM-DD
  ambientStatePath?: string;
  graphSummaryPath?: string;
  outputDir?: string;
  skipDiskWrite?: boolean;
  skipFirestore?: boolean;
  mockAi?: boolean;
  trades?: Trade[];
  customTelemetry?: Partial<DailyTelemetryAggregation>;
  customGitCommits?: GitCommitRecord[];
  customInitialVector?: FourFVector;
  customCurrentVector?: FourFVector;
  customVirtues?: Partial<AristotelianScores>;
}

// Default storage paths
export const DEFAULT_CONSOLIDATIONS_DIR = path.resolve(process.cwd(), "data/consolidations");
export const DEFAULT_GRAPH_SUMMARY_PATH = path.resolve(process.cwd(), "data/graph_summary.json");
export const TRADES_STORAGE_FILE = path.resolve(process.cwd(), "data/trades_quick.json");

// Helper to coerce date to ISO string safely
function toIsoDateStr(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

// ============================================================================
// 1. Data Aggregation Subsystem
// ============================================================================

/**
 * Extracts git commits recorded on target date.
 */
export async function getGitCommitsForDate(
  targetDateStr: string,
  repoPath: string = process.cwd()
): Promise<GitCommitRecord[]> {
  try {
    const since = `${targetDateStr} 00:00:00`;
    const until = `${targetDateStr} 23:59:59`;
    const { stdout } = await execFileAsync(
      "git",
      ["log", `--since=${since}`, `--until=${until}`, "--pretty=format:%h|%s|%an|%ad", "--date=iso"],
      { cwd: repoPath, timeout: 3000 }
    );

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, message, author, date] = line.split("|");
        return {
          hash: hash || "",
          message: message || "",
          author: author || "Operator",
          date: date || targetDateStr,
        };
      })
      .filter((c) => Boolean(c.hash));
  } catch {
    // Non-git environment or timeout fallback
    return [];
  }
}

/**
 * Reads and filters recorded trades for the target day.
 */
export async function getTradesForDate(
  targetDateStr: string,
  explicitTrades?: Trade[]
): Promise<Trade[]> {
  if (explicitTrades && explicitTrades.length > 0) {
    return explicitTrades.filter((t) => {
      const ts = toIsoDateStr(t.timestamp);
      return ts.startsWith(targetDateStr);
    });
  }

  if (fs.existsSync(TRADES_STORAGE_FILE)) {
    try {
      const raw = await fs.promises.readFile(TRADES_STORAGE_FILE, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.filter((t: any) => {
          const ts = toIsoDateStr(t.timestamp);
          return ts.startsWith(targetDateStr);
        });
      }
    } catch {
      // Ignore parse failure
    }
  }

  return [];
}

/**
 * Gathers completed HTN tasks and steps for the target day.
 */
export async function getCompletedHtnTasksForDate(
  targetDateStr: string
): Promise<Array<{ planId: string; goal: string; completedAt: string; completedStepsCount: number }>> {
  try {
    const plans = await listPlansLocal();
    const results: Array<{ planId: string; goal: string; completedAt: string; completedStepsCount: number }> = [];

    for (const plan of plans) {
      const completedSteps = (plan.steps || []).filter((s) => s.status === "completed");
      const planUpdated = toIsoDateStr(plan.updatedAt || plan.createdAt);
      const isPlanCompletedToday = plan.status === "completed" && planUpdated.startsWith(targetDateStr);

      const hasStepsCompletedToday = completedSteps.some((s) => {
        const stepUpdated = toIsoDateStr(s.completedAt);
        return stepUpdated.startsWith(targetDateStr);
      });

      if (isPlanCompletedToday || hasStepsCompletedToday) {
        results.push({
          planId: plan.id,
          goal: plan.goal,
          completedAt: planUpdated || targetDateStr,
          completedStepsCount: completedSteps.length,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Full telemetry aggregator for the 24-hour cycle.
 */
export async function aggregateDailyTelemetry(
  options: NightlyConsolidationOptions = {}
): Promise<DailyTelemetryAggregation> {
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  // 1. Ambient Context
  let ambientCtx: AmbientContext;
  if (options.ambientStatePath && fs.existsSync(options.ambientStatePath)) {
    try {
      const raw = fs.readFileSync(options.ambientStatePath, "utf-8");
      ambientCtx = JSON.parse(raw);
    } catch {
      ambientCtx = await getCurrentAmbientContext();
    }
  } else {
    ambientCtx = await getCurrentAmbientContext();
  }

  // 2. Git Commits
  let gitCommits: GitCommitRecord[] = [];
  if (options.customGitCommits) {
    gitCommits = options.customGitCommits;
  } else {
    gitCommits = await getGitCommitsForDate(targetDate);
    // If empty and ambient context has git head, attach current context head as a baseline if active
    if (gitCommits.length === 0 && ambientCtx.git?.headCommit) {
      gitCommits = [
        {
          hash: ambientCtx.git.headCommit.slice(0, 7),
          message: "Active working branch commit",
          author: "Operator",
          date: ambientCtx.timestamp || targetDate,
        },
      ];
    }
  }

  // 3. Completed HTN Tasks
  const completedTasks = await getCompletedHtnTasksForDate(targetDate);

  // 4. Focus Sprint Minutes & Trades
  const trades = await getTradesForDate(targetDate, options.trades);
  let focusSprintMinutes = 0;
  let totalFactsAcquired = 0;

  for (const t of trades) {
    focusSprintMinutes += Math.round((t.focusActualHours || 0) * 60);
    if (t.factsYield && t.factsYield !== "None" && t.factsYield.length > 5) {
      totalFactsAcquired += 1;
    }
  }

  // If no trades logged yet today, estimate from ambient continuous activity
  if (focusSprintMinutes === 0 && ambientCtx.focus?.continuousActivitySeconds) {
    focusSprintMinutes = Math.round(ambientCtx.focus.continuousActivitySeconds / 60);
  }

  // 5. FOCI Breath Stats & Composite Recovery Score
  const rawRecovery =
    ambientCtx.blackboard?.wearables?.recoveryScore ??
    ambientCtx.blackboard?.foci?.recoveryScore ??
    78;

  const respirationRate =
    ambientCtx.blackboard?.foci?.respirationRate ??
    ambientCtx.blackboard?.wearables?.respirationRate ??
    14.2;

  const calmMinutes = Math.round(focusSprintMinutes * 0.65);
  const flowMinutes = Math.round(focusSprintMinutes * 0.28);
  const stressMinutes = Math.max(0, focusSprintMinutes - calmMinutes - flowMinutes);

  const fociStats: FociBreathStats = {
    respirationRateBpm: respirationRate,
    flowMinutes,
    calmMinutes,
    stressMinutes,
    compositeRecoveryScore: calculateRecoveryScore({
      hrvMs: ambientCtx.blackboard?.wearables?.hrvMs ?? 65,
      sleepHours: ambientCtx.blackboard?.wearables?.sleepHours ?? 7.5,
      sleepEfficiency: 0.9,
    }),
  };

  if (rawRecovery && fociStats.compositeRecoveryScore === 70) {
    fociStats.compositeRecoveryScore = rawRecovery;
  }

  const baseAggregation: DailyTelemetryAggregation = {
    date: targetDate,
    ambient: {
      frontmostApp: ambientCtx.frontmostApp?.name || "System",
      appCategory: ambientCtx.frontmostApp?.category || "productivity",
      sedentaryMinutes: ambientCtx.focus?.sedentaryMinutes || 0,
      tranceState: ambientCtx.focus?.tranceState || "idle",
      continuousActivitySeconds: ambientCtx.focus?.continuousActivitySeconds || 0,
      recentErrorCount: ambientCtx.recentErrors?.length || 0,
    },
    gitCommits,
    completedTasks,
    focusSprintMinutes,
    fociStats,
    tradesCount: trades.length,
    totalFactsAcquired: totalFactsAcquired + gitCommits.length,
  };

  // Merge custom overrides if provided
  if (options.customTelemetry) {
    return {
      ...baseAggregation,
      ...options.customTelemetry,
      ambient: {
        ...baseAggregation.ambient,
        ...(options.customTelemetry.ambient || {}),
      },
      fociStats: {
        ...baseAggregation.fociStats,
        ...(options.customTelemetry.fociStats || {}),
      },
    };
  }

  return baseAggregation;
}

// ============================================================================
// 2. Cybernetic 4F Delta & Loss Reduction Engine
// ============================================================================

/**
 * Computes Aristotelian 4F Delta and cybernetic loss reduction:
 *   ΔL = L(S_initial) - L(S_final)
 */
export function compute4FDeltaAndLoss(
  prevVector: FourFVector,
  currVector: FourFVector,
  virtues?: Partial<AristotelianScores>,
  weights: CyberneticWeights = DEFAULT_CYBERNETIC_WEIGHTS
): Aristotelian4FDelta {
  const reduction = calculateLossReduction(
    prevVector,
    currVector,
    virtues,
    virtues,
    weights
  );

  const deltaVector: FourFVector = {
    focus: Number((currVector.focus - prevVector.focus).toFixed(2)),
    facts: Number((currVector.facts - prevVector.facts).toFixed(2)),
    funds: Number((currVector.funds - prevVector.funds).toFixed(2)),
    feedback: Number((currVector.feedback - prevVector.feedback).toFixed(2)),
  };

  return {
    previousVector: prevVector,
    currentVector: currVector,
    deltaVector,
    initialLoss: reduction.lossBefore,
    finalLoss: reduction.lossAfter,
    lossReduction: reduction.lossReduction,
    percentageImprovement: reduction.percentImprovement,
  };
}

/**
 * Derives end-of-day 4F Vector from telemetry aggregation.
 */
export function deriveConsolidatedVector(
  aggregation: DailyTelemetryAggregation,
  customVirtues?: Partial<AristotelianScores>
): { vector: FourFVector; virtues: AristotelianScores } {
  // Focus dimension (-5 to +5, optimal 0)
  let focusVal = 0.0;
  if (aggregation.focusSprintMinutes >= 300) focusVal = 3.5;
  else if (aggregation.focusSprintMinutes >= 200) focusVal = 1.8;
  else if (aggregation.focusSprintMinutes >= 120) focusVal = 0.2; // optimal Golden Mean
  else if (aggregation.focusSprintMinutes >= 60) focusVal = -0.8;
  else focusVal = -2.2;

  // Facts dimension: based on git commits, completed HTN tasks, and facts acquired
  let factsVal = 0.0;
  const yieldCount = aggregation.totalFactsAcquired + aggregation.completedTasks.length;
  if (yieldCount >= 6) factsVal = 1.2;
  else if (yieldCount >= 3) factsVal = 0.1; // optimal grounded knowledge
  else if (yieldCount >= 1) factsVal = -0.6;
  else factsVal = -2.0;

  // Funds / Vitality dimension: based on FOCI composite recovery score and sedentary minutes
  let fundsVal = 0.0;
  const rec = aggregation.fociStats.compositeRecoveryScore;
  if (rec >= 85) fundsVal = 1.5;
  else if (rec >= 70) factsVal >= 0 ? (fundsVal = 0.2) : (fundsVal = -0.2);
  else if (rec >= 55) fundsVal = -1.2;
  else fundsVal = -3.0;

  // Sedentary penalty
  if (aggregation.ambient.sedentaryMinutes > 120) {
    fundsVal = Math.max(-5.0, fundsVal - 1.0);
  }

  // Feedback dimension: based on error count, trades logged, and self-correction
  let feedbackVal = 0.0;
  if (aggregation.ambient.recentErrorCount > 4) feedbackVal = -2.0;
  else if (aggregation.tradesCount >= 2) feedbackVal = 0.1; // calibrated
  else feedbackVal = -0.5;

  const defaultVirtues: AristotelianScores = {
    prioritization: 0,
    documentation: 0,
    waysToWork: 0,
    timeManagement: 0,
    variety: 0,
    expressionism: 0,
    vitality: 0,
    logic: 0,
    goalsAndRewards: 0,
    portfolioGrowth: 0,
    skillHorizon: 0,
    rapidPrototyping: 0,
    ...(customVirtues || {}),
  } as AristotelianScores;

  return {
    vector: {
      focus: Number(focusVal.toFixed(2)),
      facts: Number(factsVal.toFixed(2)),
      funds: Number(fundsVal.toFixed(2)),
      feedback: Number(feedbackVal.toFixed(2)),
    },
    virtues: defaultVirtues,
  };
}

// ============================================================================
// 3. Axiom & Heuristic Induction Subsystem
// ============================================================================

/**
 * Induces 1-3 new actionable axioms grounded in the day's telemetry and friction points.
 */
export function induceNightlyAxioms(
  aggregation: DailyTelemetryAggregation,
  trades: Trade[] = []
): InducedHeuristic[] {
  const nowIso = new Date().toISOString();
  const heuristics: InducedHeuristic[] = [];

  // 1. Friction-based induction via Reflexion engine
  if (trades.length > 0) {
    const critique = synthesizeEpisodicCritique(trades);
    const tradeAxioms = induceDeterministicHeuristics(critique);
    for (const a of tradeAxioms) {
      heuristics.push(a);
      if (heuristics.length >= 3) break;
    }
  }

  // 2. High-Yield Git & Architecture Axiom
  if (heuristics.length < 3 && aggregation.gitCommits.length >= 2) {
    heuristics.push({
      id: `heuristic_atomic_velocity_${Date.now()}`,
      title: "Atomic Commit Cadence Rule",
      label: "Atomic Commit Cadence Rule",
      axiom: "Frequent granular commits coupled with typed interfaces minimize working memory cognitive friction and accelerate HTN wavefront execution.",
      description: "When code mutations are partitioned into atomic, verified units, regression surface area drops to near zero.",
      actionableTakeaway: "Enforce committing tested checkpoints after every 45 minutes of active implementation rather than hoarding uncommitted diffs.",
      quadrant: "Facts",
      category: "strategy",
      tags: ["git", "cadence", "code_craft", "facts", "momentum"],
      evidence: [
        `Logged ${aggregation.gitCommits.length} git commits today.`,
        `Latest: "${aggregation.gitCommits[0]?.message}"`,
      ],
      confidence: 0.91,
      inducedAt: nowIso,
    });
  }

  // 3. Kinetic & Diaphragmatic Balance Axiom
  if (heuristics.length < 3 && aggregation.ambient.sedentaryMinutes > 75) {
    heuristics.push({
      id: `heuristic_kinetic_reset_${Date.now()}`,
      title: "Diaphragmatic Kinetic Reset Axiom",
      label: "Diaphragmatic Kinetic Reset Axiom",
      axiom: "Continuous sedentary states exceeding 75 minutes restrict diaphragmatic amplitude and trigger neurochemical lethargy.",
      description: "Postural static compression lowers oxygen delivery and diminishes prefrontal cortical glucose metabolism.",
      actionableTakeaway: "Interleave a 3-minute standing reset and 5 slow diaphragmatic cycles at every 75-minute milestone to preserve high vitality.",
      quadrant: "Funds",
      category: "gotcha",
      tags: ["vitality", "posture", "foci", "breathing", "resets"],
      evidence: [
        `Accumulated ${aggregation.ambient.sedentaryMinutes} sedentary minutes today.`,
        `FOCI breath rate: ${aggregation.fociStats.respirationRateBpm} bpm.`,
      ],
      confidence: 0.89,
      inducedAt: nowIso,
    });
  }

  // 4. Default Sovereign Flow Axiom
  if (heuristics.length === 0) {
    heuristics.push({
      id: `heuristic_sovereign_equilibrium_${Date.now()}`,
      title: "Sovereign 4F Equilibrium Axiom",
      label: "Sovereign 4F Equilibrium Axiom",
      axiom: "Cognitive compounding requires daily synchronization across Focus, Facts, Funds, and Feedback before sleep cycles begin.",
      description: "Memory consolidation without intentional episodic synthesis leads to heuristic degradation and chaotic attention drift.",
      actionableTakeaway: "Review yesterday's cybernetic loss delta before engaging in the morning's #1 HTN objective.",
      quadrant: "Focus",
      category: "strategy",
      tags: ["equilibrium", "consolidation", "focus", "meta_os"],
      evidence: [`Consolidation for date ${aggregation.date}`],
      confidence: 0.95,
      inducedAt: nowIso,
    });
  }

  return heuristics.slice(0, 3);
}

// ============================================================================
// 4. Knowledge Graph Synthesis & Synapse Linking
// ============================================================================

/**
 * Links newly induced axioms into `data/graph_summary.json` nodes, edges, and cluster synapses.
 */
export async function linkAxiomsToKnowledgeGraph(
  axioms: InducedHeuristic[],
  graphPath: string = DEFAULT_GRAPH_SUMMARY_PATH,
  skipDiskWrite = false
): Promise<{ newNodes: string[]; updatedClusters: string[]; totalNodes: number; totalEdges: number }> {
  const result = {
    newNodes: [] as string[],
    updatedClusters: [] as string[],
    totalNodes: 0,
    totalEdges: 0,
  };

  if (!fs.existsSync(graphPath)) {
    return result;
  }

  try {
    const raw = await fs.promises.readFile(graphPath, "utf-8");
    const summary = JSON.parse(raw);

    if (!summary || !Array.isArray(summary.nodes) || !Array.isArray(summary.edges)) {
      return result;
    }

    const clusters: any[] = Array.isArray(summary.clusters) ? summary.clusters : [];

    for (const axiom of axioms) {
      const exists = summary.nodes.some((n: any) => n.id === axiom.id);
      if (!exists) {
        summary.nodes.push({
          id: axiom.id,
          type: "heuristic",
          label: axiom.label,
          description: axiom.axiom,
          weight: Math.round(axiom.confidence * 40),
          quadrant: axiom.quadrant,
          category: axiom.category,
          tags: axiom.tags,
          author: "Nightly Dream Loop",
          actionableTakeaway: axiom.actionableTakeaway,
          telegramStreamUrl: "",
          notionUrl: "",
        });
        result.newNodes.push(axiom.id);

        // Link to quadrant dimension
        const targetDim = `dim_${axiom.quadrant.toLowerCase()}`;
        summary.edges.push({
          source: axiom.id,
          target: targetDim,
          relation: "applies_to",
          weight: 4,
        });

        // Update cluster synapses by matching tags
        for (const cluster of clusters) {
          const clusterTags: string[] = cluster.topTags || [];
          const hasOverlap = axiom.tags.some((t) => clusterTags.includes(t.toLowerCase()));

          if (hasOverlap && Array.isArray(cluster.nodeIds)) {
            if (!cluster.nodeIds.includes(axiom.id)) {
              cluster.nodeIds.push(axiom.id);
              if (!result.updatedClusters.includes(cluster.id)) {
                result.updatedClusters.push(cluster.id);
              }
            }
          }
        }
      }
    }

    if (summary.metadata) {
      summary.metadata.totalNodes = summary.nodes.length;
      summary.metadata.totalEdges = summary.edges.length;
      summary.metadata.lastNightlyConsolidationAt = new Date().toISOString();
    }

    result.totalNodes = summary.nodes.length;
    result.totalEdges = summary.edges.length;

    if (!skipDiskWrite) {
      await fs.promises.writeFile(graphPath, JSON.stringify(summary, null, 2), "utf-8");
    }

    return result;
  } catch (err) {
    console.warn("⚠️ [Consolidation] Error updating graph_summary.json:", err);
    return result;
  }
}

// ============================================================================
// 5. Morning Briefing Memo Generation
// ============================================================================

/**
 * Selects the #1 priority HTN task objective for the morning.
 */
export async function selectPriorityHtnObjective(): Promise<PriorityHtnObjective> {
  try {
    const plans = await listPlansLocal();

    // Look for active running plan
    const runningPlan = plans.find((p) => p.status === "running");
    if (runningPlan) {
      const pendingStep = (runningPlan.steps || []).find((s) => s.status !== "completed");
      return {
        planId: runningPlan.id,
        goal: runningPlan.goal,
        rationale: "Unfinished active HTN plan currently in execution wavefront.",
        nextStep: pendingStep ? pendingStep.title : "Execute next sequential DAG step",
        category: "active_plan",
      };
    }

    // Look for pending un-started plan
    const pendingPlan = plans.find((p) => p.status === "pending");
    if (pendingPlan) {
      const firstStep = (pendingPlan.steps || [])[0];
      return {
        planId: pendingPlan.id,
        goal: pendingPlan.goal,
        rationale: "Highest-priority queued DAG objective awaiting activation.",
        nextStep: firstStep ? firstStep.title : "Initialize wavefront execution",
        category: "queued_plan",
      };
    }
  } catch {
    // Fall through to default
  }

  // Default sovereign objective
  return {
    goal: "Execute 90-min Deep Flow Sprint on Core Architecture",
    rationale: "Capitalize on high recovery index and zero uncommitted blockers.",
    nextStep: "Spark monotropic session on primary subsystem",
    category: "deep_flow",
  };
}

/**
 * Recommends an optimal Sonic Mind warmup track for morning cognitive alignment.
 */
export async function selectMorningWarmupTrack(
  songsList?: FabricSong[]
): Promise<RecommendedWarmupTrack> {
  let songs = songsList;
  if (!songs) {
    try {
      songs = await listSongs();
    } catch {
      songs = [];
    }
  }

  // Filter for flow/warmup-friendly tracks (energy level 3-7, spark or casual affinity)
  if (songs && songs.length > 0) {
    const candidate = songs.find((s) => {
      const energy = s.context?.sonicTexture?.energyLevel ?? 5;
      const affinities = s.context?.stateAffinity?.optimalActivity || [];
      return (
        energy >= 3 &&
        energy <= 7 &&
        (affinities.includes("SPARK_SESSION") ||
          affinities.includes("CASUAL_FLOW") ||
          affinities.includes("IITM_PREP"))
      );
    }) || songs[0];

    if (candidate) {
      return {
        id: candidate.id,
        title: candidate.title,
        artist: candidate.artist || "Sonic Mind Artist",
        energyLevel: candidate.context?.sonicTexture?.energyLevel ?? 5,
        mood: candidate.context?.sonicTexture?.mood || ["focus", "ambient"],
        reason: candidate.context?.personalNote || "Calibrated sonic texture to anchor morning beta-wave flow.",
        youtubeUrl: candidate.url,
      };
    }
  }

  // Curated sovereign fallback
  return {
    id: "warmup_home_resonance",
    title: "Resonance",
    artist: "HOME",
    energyLevel: 5,
    mood: ["ethereal", "driving", "nostalgic"],
    reason: "105 BPM synthwave cadence designed to smoothly elevate dopamine and activate prefrontal cortex.",
    youtubeUrl: "https://www.youtube.com/watch?v=8GW6sLrK40k",
  };
}

/**
 * Synthesizes the Morning Briefing Memo with Telegram Markdown & GSM SMS representations.
 */
export function generateMorningBriefingMemo(
  date: string,
  aggregation: DailyTelemetryAggregation,
  fourFDelta: Aristotelian4FDelta,
  objective: PriorityHtnObjective,
  track: RecommendedWarmupTrack
): MorningBriefingMemo {
  const recovery = aggregation.fociStats.compositeRecoveryScore;
  const lossRedPct = Math.round(fourFDelta.percentageImprovement);
  const sign = fourFDelta.lossReduction >= 0 ? "+" : "";

  const yesterdaySummary =
    `Logged ${aggregation.focusSprintMinutes}m focus across ${aggregation.tradesCount} session(s) ` +
    `with ${aggregation.gitCommits.length} git commit(s) and ${aggregation.completedTasks.length} completed task(s).`;

  const fourFTrajectory =
    `Focus: ${fourFDelta.currentVector.focus >= 0 ? "+" : ""}${fourFDelta.currentVector.focus} | ` +
    `Facts: ${fourFDelta.currentVector.facts >= 0 ? "+" : ""}${fourFDelta.currentVector.facts} | ` +
    `Funds: ${fourFDelta.currentVector.funds >= 0 ? "+" : ""}${fourFDelta.currentVector.funds} | ` +
    `Feedback: ${fourFDelta.currentVector.feedback >= 0 ? "+" : ""}${fourFDelta.currentVector.feedback} ` +
    `(${sign}${fourFDelta.lossReduction.toFixed(1)} ΔL / ${lossRedPct}% improvement)`;

  const stoicAnchor =
    recovery >= 75
      ? "«You have power over your mind - not outside events. Realize this, and you will find great strength.» — Marcus Aurelius"
      : "«Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.» — John C. Maxwell";

  // 1. Rich Telegram Markdown Format
  const telegramMarkdown = [
    `🌅 *MORNING RECON & DREAM LOOP MEMO*`,
    `📅 _Cycle: ${date}_ | 🔋 *Recovery Index: ${recovery}/100*`,
    ``,
    `📊 *Yesterday's 4F Trajectory:*`,
    `• ${yesterdaySummary}`,
    `• 4F State: \`[Foc: ${fourFDelta.currentVector.focus} | Fct: ${fourFDelta.currentVector.facts} | Fnd: ${fourFDelta.currentVector.funds} | Fbk: ${fourFDelta.currentVector.feedback}]\``,
    `• Cybernetic Dispersion: *${sign}${fourFDelta.lossReduction.toFixed(2)} ΔL* (${lossRedPct}% loss reduction)`,
    ``,
    `🎯 *#1 Priority HTN Objective:*`,
    `*${objective.goal}*`,
    `💡 _Rationale:_ ${objective.rationale}`,
    objective.nextStep ? `👉 _Next Action:_ \`${objective.nextStep}\`` : ``,
    ``,
    `🎧 *Sonic Mind Warmup:*`,
    `🎵 *${track.title}* — ${track.artist} (Energy: ${track.energyLevel}/10)`,
    `_«${track.reason}»_`,
    track.youtubeUrl ? `🔗 [Open Warmup Stream](${track.youtubeUrl})` : ``,
    ``,
    `⚓ *Philosophical Anchor:*`,
    `_${stoicAnchor}_`,
  ]
    .filter(Boolean)
    .join("\n");

  // 2. Compact GSM SMS Format (under 160 chars or concise 2-part text)
  const smsText =
    `Fabric Morning (${date}): Recovery ${recovery}%. ` +
    `Focus ${aggregation.focusSprintMinutes}m (${sign}${fourFDelta.lossReduction.toFixed(1)} ΔL). ` +
    `#1 Priority: ${objective.goal.slice(0, 45)}. ` +
    `Warmup: ${track.title} - ${track.artist}.`;

  return {
    date,
    headline: `Morning Recon: Recovery ${recovery}% | ${sign}${fourFDelta.lossReduction.toFixed(1)} ΔL`,
    yesterdaySummary,
    recoveryIndex: recovery,
    fourFTrajectory,
    priorityHtnObjective: objective,
    recommendedWarmupTrack: track,
    stoicAnchor,
    telegramMarkdown,
    smsText,
  };
}

// ============================================================================
// 6. Dual-Persistence & Storage Subsystem
// ============================================================================

/**
 * Saves consolidation record to local disk (data/consolidations/consolidation_YYYY-MM-DD.json).
 */
export async function persistConsolidationLocal(
  record: NightlyConsolidationResult,
  outputDir: string = DEFAULT_CONSOLIDATIONS_DIR
): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    await fs.promises.mkdir(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `consolidation_${record.date}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
  return filePath;
}

/**
 * Dual-persists consolidation record to Firestore 'consolidations' collection.
 */
export async function persistConsolidationFirestore(
  record: NightlyConsolidationResult
): Promise<string | null> {
  try {
    const docRef = db.collection("consolidations").doc(record.id);
    await Promise.race([
      docRef.set({
        ...record,
        persistedAt: new Date(),
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write timeout")), 2000)
      ),
    ]);
    return record.id;
  } catch (err) {
    console.warn("⚠️ [Consolidation] Firestore persistence skipped or timed out:", err);
    return null;
  }
}

/**
 * Retrieves the latest consolidation record from local disk or Firestore.
 */
export async function getLatestConsolidation(
  outputDir: string = DEFAULT_CONSOLIDATIONS_DIR
): Promise<NightlyConsolidationResult | null> {
  // Check local disk first
  if (fs.existsSync(outputDir)) {
    try {
      const files = await fs.promises.readdir(outputDir);
      const jsonFiles = files
        .filter((f) => f.startsWith("consolidation_") && f.endsWith(".json"))
        .sort()
        .reverse();

      if (jsonFiles.length > 0) {
        const latestFile = path.join(outputDir, jsonFiles[0]);
        const content = await fs.promises.readFile(latestFile, "utf-8");
        return JSON.parse(content) as NightlyConsolidationResult;
      }
    } catch {
      // Fall through to Firestore
    }
  }

  // Fallback to Firestore
  try {
    const snap = await db
      .collection("consolidations")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (!snap.empty) {
      return snap.docs[0].data() as NightlyConsolidationResult;
    }
  } catch {
    // Ignore
  }

  return null;
}

// ============================================================================
// 7. Master Orchestrator: runNightlyConsolidation
// ============================================================================

/**
 * Master entrypoint for the Nightly Consolidation & Dream Loop.
 */
export async function runNightlyConsolidation(
  options: NightlyConsolidationOptions = {}
): Promise<NightlyConsolidationResult> {
  const date = options.date || new Date().toISOString().slice(0, 10);
  const userId = options.userId || "default_user";
  const id = `consolidation_${date}_${Date.now().toString(36)}`;
  const timestamp = new Date().toISOString();

  // 1. Aggregation of Day's Telemetry
  const aggregation = await aggregateDailyTelemetry(options);

  // 2. Compute 4F Delta & Cybernetic Loss Reduction
  const prevVector =
    options.customInitialVector || { focus: -1.0, facts: -0.5, funds: -1.2, feedback: 0.5 };

  const derived = deriveConsolidatedVector(aggregation, options.customVirtues);
  const currVector = options.customCurrentVector || derived.vector;
  const fourFDelta = compute4FDeltaAndLoss(prevVector, currVector, derived.virtues);

  // 3. Axiom & Heuristic Induction
  const trades = await getTradesForDate(date, options.trades);
  const inducedAxioms = induceNightlyAxioms(aggregation, trades);

  // 4. Knowledge Graph Synthesis & Synapse Linking
  const graphSummaryPath = options.graphSummaryPath || DEFAULT_GRAPH_SUMMARY_PATH;
  const graphUpdates = await linkAxiomsToKnowledgeGraph(
    inducedAxioms,
    graphSummaryPath,
    options.skipDiskWrite
  );

  // 5. Morning Briefing Memo Generation
  const priorityObjective = await selectPriorityHtnObjective();
  const warmupTrack = await selectMorningWarmupTrack();
  const morningBriefing = generateMorningBriefingMemo(
    date,
    aggregation,
    fourFDelta,
    priorityObjective,
    warmupTrack
  );

  // 6. Dual Persistence
  const result: NightlyConsolidationResult = {
    id,
    timestamp,
    date,
    userId,
    aggregation,
    fourFDelta,
    inducedAxioms,
    graphUpdates,
    morningBriefing,
    persistedPaths: {},
  };

  if (!options.skipDiskWrite) {
    const localDir = options.outputDir || DEFAULT_CONSOLIDATIONS_DIR;
    try {
      const localPath = await persistConsolidationLocal(result, localDir);
      result.persistedPaths.localJson = localPath;
    } catch (err) {
      console.warn("⚠️ [Consolidation] Local file persistence error:", err);
    }
  }

  if (!options.skipFirestore) {
    const firestoreId = await persistConsolidationFirestore(result);
    if (firestoreId) {
      result.persistedPaths.firestoreId = firestoreId;
    }
  }

  return result;
}
