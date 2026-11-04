/**
 * Fabric OS — Closed-Loop 4F Cybernetic Governor
 *
 * Implements high-agency homeostatic regulation minimizing the Aristotelian
 * cybernetic loss function:
 *
 *   L(S) = sum(w_i * (S_i - S_i^*)^2) + lambda * sum(Phi_j(A_j))
 *
 * Core Homeostatic Rules:
 * 1. Excessive Focus (F_focus > +3 or continuous focus > 90 min) -> Warning state, enforces 5-min cognitive break.
 * 2. Depleted Vitality (F_funds < -2 or FOCI composite recovery score < 45) -> Fatigue alert & restorative downtime.
 * 3. Sedentary Stagnation (sedentary > 75 min without standing) -> Kinetic stretch intervention.
 * 4. Feedback Dispersion (extreme vice penalty in loss function L(S)) -> Signal recalibration & distraction purge.
 *
 * Progressive Actuation Cascade:
 * - Level 1: Dynamic Island & MenuBar badge pulse (gentle nudge).
 * - Level 2: Native macOS Notification + Raycast HUD toast.
 * - Level 3: Android ADB Zen mode trigger (toggleZenMode(true)) to silence mobile distractions and dim screen.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type {
  AmbientContext,
  DynamicIslandPayload,
  FocusTranceInfo,
  FrontmostAppInfo,
} from "./ambient.js";
import {
  logToBlackboard,
  updateAmbientContext,
  DEFAULT_AMBIENT_STATE_PATH,
} from "./ambient.js";
import { toggleZenMode } from "./telemetry-adb.js";
import type { AristotelianScores } from "../db/types.js";
import { ARISTOTELIAN_DIMENSIONS } from "../ai/sentinel.js";

const execFileAsync = promisify(execFile);

// -------------------------------------------------------------
// Constants & Cybernetic Homeostasis Thresholds
// -------------------------------------------------------------

export const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15-minute cooldown between repeated alert dispatches
export const FOCUS_TIME_LIMIT_MINUTES = 90;        // > 90 min continuous active focus triggers break
export const SEDENTARY_LIMIT_MINUTES = 75;         // > 75 min continuous sedentary posture triggers stretch
export const FOCUS_VECTOR_EXCESS_THRESHOLD = 3.0;  // F_focus > +3.0 triggers excessive focus warning
export const VITALITY_CRITICAL_THRESHOLD = -2.0;   // F_funds < -2.0 triggers vitality exhaustion
export const FOCI_RECOVERY_CRITICAL_THRESHOLD = 45; // FOCI composite recovery < 45/100 triggers fatigue alert
export const FEEDBACK_DISPERSION_VECTOR_THRESHOLD = 3.0; // |F_feedback| > 3.0 triggers dispersion alert
export const VICE_PENALTY_CRITICAL_THRESHOLD = 8.0;     // Excessive Aristotelian vice penalty threshold
export const CYBERNETIC_LOSS_CRITICAL_THRESHOLD = 25.0; // Critical system dispersion threshold

export type GovernorRuleId =
  | "excessive_focus"
  | "depleted_vitality"
  | "sedentary_stagnation"
  | "feedback_dispersion";

export type ActuationLevel = 1 | 2 | 3;

export interface FourFVector {
  focus: number;    // [-5, +5]: -5=Distracted/Fragmented, 0=Deep Flow, +5=Tunnel Vision/Burnout
  facts: number;    // [-5, +5]: -5=Ignorance/Stagnation, 0=Grounded Knowledge, +5=Overthinking
  funds: number;    // [-5, +5]: -5=Depleted Vitality, 0=Optimal Vitality, +5=Sedentary Hoarding
  feedback: number; // [-5, +5]: -5=Blind Isolation, 0=Calibrated Correction, +5=Social Noise
}

export interface CyberneticWeights {
  focus: number;
  facts: number;
  funds: number;
  feedback: number;
  lambda: number; // Aristotelian vice penalty weight
}

export const DEFAULT_CYBERNETIC_WEIGHTS: CyberneticWeights = {
  focus: 1.0,
  facts: 1.0,
  funds: 1.2,
  feedback: 1.0,
  lambda: 0.5,
};

export interface GovernorBreach {
  ruleId: GovernorRuleId;
  title: string;
  description: string;
  severity: "notice" | "warning" | "critical";
  recommendedActuationLevel: ActuationLevel;
  metricObserved: string;
  threshold: string;
  actionRequired: string;
}

export interface CyberneticLossResult {
  totalLoss: number;
  vectorLoss: number;
  vicePenalty: number;
  breakdown: {
    focus: number;
    facts: number;
    funds: number;
    feedback: number;
  };
}

export interface LossReductionResult {
  lossBefore: number;
  lossAfter: number;
  lossReduction: number;
  percentImprovement: number;
}

export interface GovernorTelemetryInput {
  timestamp?: string | number | Date;
  fourF?: Partial<FourFVector>;
  ambient?: Partial<AmbientContext>;
  frontmostApp?: FrontmostAppInfo;
  focus?: Partial<FocusTranceInfo>;
  wearables?: {
    recoveryScore?: number;
    respirationRate?: number;
    vitalityScore?: number;
  };
  virtues?: Partial<AristotelianScores>;
  blackboard?: Record<string, any>;
}

export interface GovernorActuator {
  sendMacNotification?: (
    title: string,
    message: string,
    subtitle?: string
  ) => Promise<boolean>;
  sendRaycastToast?: (text: string, title?: string) => Promise<boolean>;
  triggerAndroidZenMode?: (enable: boolean) => Promise<boolean>;
  updateDynamicIsland?: (payload: DynamicIslandPayload) => Promise<boolean>;
}

export interface GovernorEvaluationOptions {
  now?: number | Date;
  cooldownMs?: number;
  weights?: CyberneticWeights;
  targetVector?: FourFVector;
  forceLevel?: ActuationLevel;
  bypassCooldown?: boolean;
  persistToBlackboard?: boolean;
  statePath?: string;
  actuator?: GovernorActuator;
}

export interface GovernorEvaluationResult {
  timestamp: string;
  breaches: GovernorBreach[];
  hasBreaches: boolean;
  actuationLevel: ActuationLevel | 0;
  inCooldown: boolean;
  timeToNextInterventionMs: number;
  lossBefore: number;
  projectedLossReduction: number;
  lossAfterProjected: number;
  actuationPerformed: {
    level1_island_pulse: boolean;
    level2_notification: boolean;
    level2_raycast_hud: boolean;
    level3_zen_mode: boolean;
  };
  blackboardSummary: {
    governor_status: "optimal" | "warning" | "alert";
    governor_interventions: GovernorBreach[];
    last_actuation_level: number;
    time_to_next_intervention_ms: number;
    cybernetic_loss: number;
    projected_loss_reduction: number;
  };
  dynamicIslandPayload?: DynamicIslandPayload;
}

// -------------------------------------------------------------
// Cybernetic Mathematical Formulations
// -------------------------------------------------------------

/**
 * Calculates Aristotelian extreme vice penalty:
 * Phi_j(A_j) = (|A_j| - 2)^2 when |A_j| > 2, 0 otherwise.
 */
export function calculateExtremeVicePenalty(
  scores?: Partial<AristotelianScores>
): number {
  if (!scores) return 0;
  let penalty = 0;

  for (const dim of ARISTOTELIAN_DIMENSIONS) {
    const val = scores[dim.id];
    if (typeof val === "number" && !isNaN(val)) {
      const absVal = Math.abs(val);
      if (absVal > 2.0) {
        penalty += Math.pow(absVal - 2.0, 2);
      }
    }
  }

  // Also include any extra virtue scores provided
  for (const [key, val] of Object.entries(scores)) {
    if (typeof val === "number" && !isNaN(val)) {
      const isKnown = ARISTOTELIAN_DIMENSIONS.some((d) => d.id === key);
      if (!isKnown && Math.abs(val) > 2.0) {
        penalty += Math.pow(Math.abs(val) - 2.0, 2);
      }
    }
  }

  return Math.round(penalty * 100) / 100;
}

/**
 * Calculates total Cybernetic Loss L(S):
 * L(S) = sum(w_i * (S_i - S_i^*)^2) + lambda * sum(Phi_j(A_j))
 */
export function calculateCyberneticLoss(
  state: FourFVector,
  target: FourFVector = { focus: 0, facts: 0, funds: 0, feedback: 0 },
  virtueScores?: Partial<AristotelianScores>,
  weights: CyberneticWeights = DEFAULT_CYBERNETIC_WEIGHTS
): CyberneticLossResult {
  const diffFocus = (state.focus ?? 0) - (target.focus ?? 0);
  const diffFacts = (state.facts ?? 0) - (target.facts ?? 0);
  const diffFunds = (state.funds ?? 0) - (target.funds ?? 0);
  const diffFeedback = (state.feedback ?? 0) - (target.feedback ?? 0);

  const lossFocus = (weights.focus ?? 1.0) * Math.pow(diffFocus, 2);
  const lossFacts = (weights.facts ?? 1.0) * Math.pow(diffFacts, 2);
  const lossFunds = (weights.funds ?? 1.2) * Math.pow(diffFunds, 2);
  const lossFeedback = (weights.feedback ?? 1.0) * Math.pow(diffFeedback, 2);

  const vectorLoss = lossFocus + lossFacts + lossFunds + lossFeedback;
  const viceRaw = calculateExtremeVicePenalty(virtueScores);
  const vicePenalty = (weights.lambda ?? 0.5) * viceRaw;

  const totalLoss = Math.round((vectorLoss + vicePenalty) * 100) / 100;

  return {
    totalLoss,
    vectorLoss: Math.round(vectorLoss * 100) / 100,
    vicePenalty: Math.round(vicePenalty * 100) / 100,
    breakdown: {
      focus: Math.round(lossFocus * 100) / 100,
      facts: Math.round(lossFacts * 100) / 100,
      funds: Math.round(lossFunds * 100) / 100,
      feedback: Math.round(lossFeedback * 100) / 100,
    },
  };
}

/**
 * Calculates the cybernetic loss reduction after a restorative homeostatic intervention:
 * Delta L = L_before - L_after
 */
export function calculateLossReduction(
  currentState: FourFVector,
  projectedState: FourFVector,
  virtueScores?: Partial<AristotelianScores>,
  projectedVirtueScores?: Partial<AristotelianScores>,
  weights: CyberneticWeights = DEFAULT_CYBERNETIC_WEIGHTS
): LossReductionResult {
  const before = calculateCyberneticLoss(currentState, undefined, virtueScores, weights);
  const after = calculateCyberneticLoss(
    projectedState,
    undefined,
    projectedVirtueScores || virtueScores,
    weights
  );

  const lossReduction = Math.round(Math.max(0, before.totalLoss - after.totalLoss) * 100) / 100;
  const percentImprovement =
    before.totalLoss > 0
      ? Math.round((lossReduction / before.totalLoss) * 1000) / 10
      : 0;

  return {
    lossBefore: before.totalLoss,
    lossAfter: after.totalLoss,
    lossReduction,
    percentImprovement,
  };
}

/**
 * Projects the post-intervention 4F state after applying homeostatic interventions.
 */
export function projectInterventionEquilibrium(
  current: FourFVector,
  breaches: GovernorBreach[],
  virtueScores?: Partial<AristotelianScores>
): { projectedVector: FourFVector; projectedVirtues: Partial<AristotelianScores> } {
  const projected: FourFVector = { ...current };
  const projVirtues: Partial<AristotelianScores> = virtueScores ? { ...virtueScores } : {};

  for (const b of breaches) {
    if (b.ruleId === "excessive_focus") {
      // 5-min cognitive break relieves cognitive tunnel vision: resets focus towards 0
      projected.focus = Math.max(0, Math.min(1.0, (projected.focus || 0) * 0.25));
    } else if (b.ruleId === "depleted_vitality") {
      // Restorative protocol replenishes vitality/funds towards golden mean
      projected.funds = Math.max(-0.5, Math.min(1.0, (projected.funds || 0) + 2.5));
    } else if (b.ruleId === "sedentary_stagnation") {
      // Kinetic stretch relieves posture lock, slightly boosting vitality
      projected.funds = Math.max(0, Math.min(2.0, (projected.funds || 0) + 1.0));
    } else if (b.ruleId === "feedback_dispersion") {
      // Recalibration purges noise and dampens feedback vice
      projected.feedback = 0;
      // Dampen extreme virtue scores towards +/- 1.5
      for (const k of Object.keys(projVirtues)) {
        if (typeof projVirtues[k] === "number") {
          const v = projVirtues[k]!;
          if (Math.abs(v) > 2.0) {
            projVirtues[k] = v > 0 ? 1.5 : -1.5;
          }
        }
      }
    }
  }

  return { projectedVector: projected, projectedVirtues: projVirtues };
}

// -------------------------------------------------------------
// Telemetry Normalization & Rule Evaluation
// -------------------------------------------------------------

/**
 * Derives a normalized 4F vector and supporting telemetry from diverse ambient inputs.
 */
export function deriveFourFVectorFromTelemetry(input: GovernorTelemetryInput): {
  fourF: FourFVector;
  sedentaryMinutes: number;
  continuousActivitySeconds: number;
  recoveryScore: number;
  standingDetected: boolean;
  virtues: Partial<AristotelianScores>;
} {
  const ambient = (input.ambient || input) as AmbientContext;
  const focusInfo = input.focus || ambient.focus || ({} as FocusTranceInfo);
  const wearables = input.wearables || ambient.blackboard?.wearables || {};
  const virtues = input.virtues || ambient.blackboard?.virtues || {};

  const sedentaryMinutes = focusInfo.sedentaryMinutes ?? 0;
  const continuousActivitySeconds = focusInfo.continuousActivitySeconds ?? 0;
  const standingDetected = focusInfo.standingDetected ?? false;
  const recoveryScore = wearables.recoveryScore ?? 75;

  // Focus: based on continuous duration or explicit input
  let focusVal = input.fourF?.focus;
  if (focusVal === undefined) {
    if (continuousActivitySeconds >= 120 * 60) focusVal = 4.5;
    else if (continuousActivitySeconds >= 90 * 60) focusVal = 3.5;
    else if (continuousActivitySeconds >= 60 * 60) focusVal = 2.0;
    else if (continuousActivitySeconds >= 30 * 60) focusVal = 0.5;
    else focusVal = 0.0;
  }

  // Funds / Vitality: based on wearables recovery or explicit input
  let fundsVal = input.fourF?.funds;
  if (fundsVal === undefined) {
    if (wearables.vitalityScore !== undefined) {
      fundsVal = wearables.vitalityScore;
    } else if (recoveryScore < 30) {
      fundsVal = -4.0;
    } else if (recoveryScore < 45) {
      fundsVal = -2.5;
    } else if (recoveryScore < 60) {
      fundsVal = -1.0;
    } else if (recoveryScore >= 85) {
      fundsVal = 2.0;
    } else {
      fundsVal = 0.0;
    }
  }

  const factsVal = input.fourF?.facts ?? 0.0;
  const feedbackVal = input.fourF?.feedback ?? 0.0;

  return {
    fourF: {
      focus: focusVal,
      facts: factsVal,
      funds: fundsVal ?? 0.0,
      feedback: feedbackVal,
    },
    sedentaryMinutes,
    continuousActivitySeconds,
    recoveryScore,
    standingDetected,
    virtues,
  };
}

/**
 * Evaluates the 4 homeostatic boundary conditions against current telemetry.
 */
export function evaluateHomeostaticBoundaries(
  fourF: FourFVector,
  sedentaryMinutes: number,
  continuousActivitySeconds: number,
  recoveryScore: number,
  standingDetected: boolean,
  virtues?: Partial<AristotelianScores>,
  weights: CyberneticWeights = DEFAULT_CYBERNETIC_WEIGHTS
): GovernorBreach[] {
  const breaches: GovernorBreach[] = [];
  const loss = calculateCyberneticLoss(fourF, undefined, virtues, weights);

  // 1. Excessive Focus (F_focus > +3.0 OR continuous focus > 90 min)
  const isContinuousOver90 = continuousActivitySeconds > FOCUS_TIME_LIMIT_MINUTES * 60;
  const isFocusVectorExcess = fourF.focus > FOCUS_VECTOR_EXCESS_THRESHOLD;

  if (isContinuousOver90 || isFocusVectorExcess) {
    let severity: "notice" | "warning" | "critical" = "warning";
    let level: ActuationLevel = 2;

    if (continuousActivitySeconds > 120 * 60 || fourF.focus >= 4.5) {
      severity = "critical";
      level = 3;
    } else if (continuousActivitySeconds <= 95 * 60 && fourF.focus <= 3.3) {
      severity = "notice";
      level = 1;
    }

    const elapsedMin = Math.round(continuousActivitySeconds / 60);
    breaches.push({
      ruleId: "excessive_focus",
      title: "Cognitive Hyper-Focus Saturation",
      description: `Continuous focus session reached ${elapsedMin}m (F_focus = ${fourF.focus.toFixed(1)}). Exceeds optimal cognitive threshold.`,
      severity,
      recommendedActuationLevel: level,
      metricObserved: `${elapsedMin}m continuous (F_focus: ${fourF.focus.toFixed(1)})`,
      threshold: `> ${FOCUS_TIME_LIMIT_MINUTES}m or F_focus > ${FOCUS_VECTOR_EXCESS_THRESHOLD}`,
      actionRequired: "Enforce mandatory 5-minute cognitive reset & hydration break.",
    });
  }

  // 2. Depleted Vitality (F_funds < -2.0 OR FOCI recovery score < 45)
  const isFundsDepleted = fourF.funds < VITALITY_CRITICAL_THRESHOLD;
  const isFociFatigued = recoveryScore < FOCI_RECOVERY_CRITICAL_THRESHOLD;

  if (isFundsDepleted || isFociFatigued) {
    let severity: "notice" | "warning" | "critical" = "warning";
    let level: ActuationLevel = 2;

    if (fourF.funds <= -3.5 || recoveryScore < 30) {
      severity = "critical";
      level = 3;
    } else if (fourF.funds >= -2.3 && recoveryScore >= 42) {
      severity = "notice";
      level = 1;
    }

    breaches.push({
      ruleId: "depleted_vitality",
      title: "Biological Vitality Depletion",
      description: `Autonomic reserves critically low (F_funds: ${fourF.funds.toFixed(1)}, Recovery: ${recoveryScore}/100). Cognitive throughput degraded.`,
      severity,
      recommendedActuationLevel: level,
      metricObserved: `F_funds: ${fourF.funds.toFixed(1)}, FOCI recovery: ${recoveryScore}/100`,
      threshold: `F_funds < ${VITALITY_CRITICAL_THRESHOLD} or recovery < ${FOCI_RECOVERY_CRITICAL_THRESHOLD}`,
      actionRequired: "Fatigue alert: cease high-cognitive load and initiate restorative downtime.",
    });
  }

  // 3. Sedentary Stagnation (sedentary > 75 min without standing)
  const isSedentaryOver75 = sedentaryMinutes > SEDENTARY_LIMIT_MINUTES;
  if (isSedentaryOver75 && !standingDetected) {
    let severity: "notice" | "warning" | "critical" = "warning";
    let level: ActuationLevel = 2;

    if (sedentaryMinutes > 120) {
      severity = "critical";
      level = 3;
    } else if (sedentaryMinutes <= 80) {
      severity = "notice";
      level = 1;
    }

    breaches.push({
      ruleId: "sedentary_stagnation",
      title: "Sedentary Posture Stagnation",
      description: `Physical immobility detected for ${sedentaryMinutes} minutes without standing transition.`,
      severity,
      recommendedActuationLevel: level,
      metricObserved: `${sedentaryMinutes} min sedentary without standing`,
      threshold: `> ${SEDENTARY_LIMIT_MINUTES} min sedentary`,
      actionRequired: "Kinetic stretch intervention: stand, walk, or perform spinal mobilization.",
    });
  }

  // 4. Feedback Dispersion (extreme vice penalty in loss function L(S))
  const isFeedbackVectorDispersed = Math.abs(fourF.feedback) > FEEDBACK_DISPERSION_VECTOR_THRESHOLD;
  const isVicePenaltyHigh = loss.vicePenalty >= VICE_PENALTY_CRITICAL_THRESHOLD;
  const isTotalLossCritical = loss.totalLoss >= CYBERNETIC_LOSS_CRITICAL_THRESHOLD;

  if (isFeedbackVectorDispersed || isVicePenaltyHigh || isTotalLossCritical) {
    let severity: "notice" | "warning" | "critical" = "warning";
    let level: ActuationLevel = 2;

    if (loss.totalLoss >= 40.0 || Math.abs(fourF.feedback) >= 4.5) {
      severity = "critical";
      level = 3;
    } else if (loss.totalLoss <= 28.0 && Math.abs(fourF.feedback) <= 3.4) {
      severity = "notice";
      level = 1;
    }

    breaches.push({
      ruleId: "feedback_dispersion",
      title: "Cybernetic Feedback Dispersion",
      description: `Severe entropy detected (Loss: ${loss.totalLoss.toFixed(1)}, Vice Penalty: ${loss.vicePenalty.toFixed(1)}, F_feedback: ${fourF.feedback.toFixed(1)}).`,
      severity,
      recommendedActuationLevel: level,
      metricObserved: `Loss: ${loss.totalLoss.toFixed(1)}, Vice: ${loss.vicePenalty.toFixed(1)}`,
      threshold: `Loss >= ${CYBERNETIC_LOSS_CRITICAL_THRESHOLD} or Vice >= ${VICE_PENALTY_CRITICAL_THRESHOLD}`,
      actionRequired: "Recalibrate signal vs noise: close divergent tabs and re-center on single objective.",
    });
  }

  return breaches;
}

// -------------------------------------------------------------
// Progressive Actuation Cascade
// -------------------------------------------------------------

/**
 * Builds the Dynamic Island HUD payload for a given governor breach.
 */
export function buildGovernorDynamicIslandPayload(
  breach: GovernorBreach,
  level: ActuationLevel
): DynamicIslandPayload {
  const status = level >= 2 ? "alert" : "warning";

  switch (breach.ruleId) {
    case "excessive_focus":
      return {
        status,
        headline: "🛑 Mandatory Cognitive Break",
        subtext: "Continuous focus limit exceeded. Rest eyes & hydrate.",
        badge: "BREAK",
        icon: "🛑",
        actionPrompt: "Enforce 5-min cognitive break",
      };
    case "depleted_vitality":
      return {
        status,
        headline: "💤 Autonomic Fatigue Alert",
        subtext: "Vitality reserves depleted. Throttle heavy work.",
        badge: "FATIGUE",
        icon: "💤",
        actionPrompt: "Initiate restorative downtime",
      };
    case "sedentary_stagnation":
      return {
        status,
        headline: "🚶 Kinetic Stretch Prompt",
        subtext: "Immobilized > 75m. Stand up and mobilize spine.",
        badge: "STRETCH",
        icon: "🚶",
        actionPrompt: "Take a 2-min kinetic stretch",
      };
    case "feedback_dispersion":
      return {
        status,
        headline: "⚖️ Cybernetic Recalibration",
        subtext: "High existential loss detected. Purge distractions.",
        badge: "EQUILIBRIUM",
        icon: "⚖️",
        actionPrompt: "Re-center single-threaded execution",
      };
  }
}

/**
 * Executes default native macOS notification via AppleScript osascript.
 */
async function defaultSendMacNotification(
  title: string,
  message: string,
  subtitle?: string
): Promise<boolean> {
  try {
    const cleanTitle = title.replace(/"/g, '\\"');
    const cleanMsg = message.replace(/"/g, '\\"');
    const cleanSub = subtitle ? subtitle.replace(/"/g, '\\"') : "Fabric Cybernetic Governor";
    const script = `display notification "${cleanMsg}" with title "${cleanTitle}" subtitle "${cleanSub}" sound name "Glass"`;
    await execFileAsync("osascript", ["-e", script], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Dispatches a toast to Raycast HUD.
 */
async function defaultSendRaycastToast(text: string, title?: string): Promise<boolean> {
  try {
    const encoded = encodeURIComponent(title ? `${title}: ${text}` : text);
    const raycastUrl = `raycast://extensions/raycast/raycast/show-hud?text=${encoded}`;
    await execFileAsync("open", ["-g", raycastUrl], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Progressive Actuation Cascade dispatcher.
 * Escalates smoothly:
 * Level 1: Dynamic Island & MenuBar badge pulse
 * Level 2: Native macOS Notification + Raycast HUD toast
 * Level 3: Android ADB Zen mode trigger (toggleZenMode(true))
 */
export async function executeActuationCascade(
  level: ActuationLevel,
  breaches: GovernorBreach[],
  options: {
    actuator?: GovernorActuator;
    islandPayload?: DynamicIslandPayload;
  } = {}
): Promise<{
  level1_island_pulse: boolean;
  level2_notification: boolean;
  level2_raycast_hud: boolean;
  level3_zen_mode: boolean;
}> {
  const result = {
    level1_island_pulse: false,
    level2_notification: false,
    level2_raycast_hud: false,
    level3_zen_mode: false,
  };

  if (breaches.length === 0 || level <= 0) return result;
  const primaryBreach = breaches[0];
  const islandPayload =
    options.islandPayload || buildGovernorDynamicIslandPayload(primaryBreach, level);

  const actuator = options.actuator || {};

  // --- LEVEL 1: Dynamic Island & MenuBar Badge Pulse ---
  try {
    if (actuator.updateDynamicIsland) {
      await actuator.updateDynamicIsland(islandPayload);
    }
    result.level1_island_pulse = true;
  } catch {
    result.level1_island_pulse = false;
  }

  // --- LEVEL 2: Native macOS Notification + Raycast HUD Toast ---
  if (level >= 2) {
    const title = `Fabric Governor: ${primaryBreach.title}`;
    const message = primaryBreach.actionRequired;
    const subtitle = primaryBreach.metricObserved;

    try {
      if (actuator.sendMacNotification) {
        result.level2_notification = await actuator.sendMacNotification(
          title,
          message,
          subtitle
        );
      } else {
        result.level2_notification = await defaultSendMacNotification(
          title,
          message,
          subtitle
        );
      }
    } catch {
      result.level2_notification = false;
    }

    try {
      if (actuator.sendRaycastToast) {
        result.level2_raycast_hud = await actuator.sendRaycastToast(message, title);
      } else {
        result.level2_raycast_hud = await defaultSendRaycastToast(message, title);
      }
    } catch {
      result.level2_raycast_hud = false;
    }
  }

  // --- LEVEL 3: Android ADB Zen Mode (silence mobile distractions & dim screen) ---
  if (level >= 3) {
    try {
      if (actuator.triggerAndroidZenMode) {
        result.level3_zen_mode = await actuator.triggerAndroidZenMode(true);
      } else {
        const zenRes = await toggleZenMode(true, undefined, true);
        result.level3_zen_mode = zenRes.success;
      }
    } catch {
      result.level3_zen_mode = false;
    }
  }

  return result;
}

// -------------------------------------------------------------
// Closed-Loop Governor Audit Evaluator
// -------------------------------------------------------------

/**
 * Closed-loop audit function evaluateGovernorInterventions:
 * 1. Inspects current ambient telemetry, 4F vector, and wearables.
 * 2. Evaluates the 4 homeostatic boundary conditions.
 * 3. Checks cooldown safety timer to prevent spamming notifications within 15 minutes.
 * 4. Executes the progressive actuation cascade (Levels 1, 2, 3).
 * 5. Calculates cybernetic loss reduction and time-to-next-intervention.
 * 6. Logs governor decisions into the ambient blackboard.
 */
export async function evaluateGovernorInterventions(
  telemetry: GovernorTelemetryInput,
  options: GovernorEvaluationOptions = {}
): Promise<GovernorEvaluationResult> {
  const now = options.now
    ? new Date(options.now).getTime()
    : Date.now();
  const timestampStr = new Date(now).toISOString();
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const weights = options.weights || DEFAULT_CYBERNETIC_WEIGHTS;
  const persist = options.persistToBlackboard ?? true;

  // 1. Normalize Telemetry
  const {
    fourF,
    sedentaryMinutes,
    continuousActivitySeconds,
    recoveryScore,
    standingDetected,
    virtues,
  } = deriveFourFVectorFromTelemetry(telemetry);

  // 2. Evaluate Boundary Conditions
  const breaches = evaluateHomeostaticBoundaries(
    fourF,
    sedentaryMinutes,
    continuousActivitySeconds,
    recoveryScore,
    standingDetected,
    virtues,
    weights
  );

  const hasBreaches = breaches.length > 0;

  // 3. Determine Actuation Level
  let targetLevel: ActuationLevel | 0 = 0;
  if (hasBreaches) {
    if (options.forceLevel) {
      targetLevel = options.forceLevel;
    } else {
      // Pick highest recommended actuation level across all breaches
      targetLevel = Math.max(...breaches.map((b) => b.recommendedActuationLevel)) as ActuationLevel;
    }
  }

  // 4. Cooldown Check
  const ambient = (telemetry.ambient || telemetry) as AmbientContext;
  const blackboard = telemetry.blackboard || ambient.blackboard || {};
  const lastActuationTime = Number(blackboard.governor_last_actuation_time || 0);
  const timeSinceLastActuation = now - lastActuationTime;
  const isCooldownActive =
    lastActuationTime > 0 &&
    timeSinceLastActuation < cooldownMs &&
    !options.bypassCooldown;

  let effectiveLevel: ActuationLevel | 0 = targetLevel;
  let inCooldown = false;
  let timeToNextInterventionMs = 0;

  if (hasBreaches) {
    if (isCooldownActive) {
      inCooldown = true;
      timeToNextInterventionMs = Math.max(0, cooldownMs - timeSinceLastActuation);
      // Under active cooldown: suppress Level 2/3 interrupts to prevent spamming, but maintain Level 1 nudge
      effectiveLevel = 1;
    } else {
      inCooldown = false;
      timeToNextInterventionMs = cooldownMs; // Next alert would have to wait 15 min
    }
  } else {
    // No active breaches: calculate time remaining until closest threshold
    const remainingFocusSeconds = Math.max(0, FOCUS_TIME_LIMIT_MINUTES * 60 - continuousActivitySeconds);
    const remainingSedentaryMinutes = Math.max(0, SEDENTARY_LIMIT_MINUTES - sedentaryMinutes);
    const msToFocusBreach = remainingFocusSeconds * 1000;
    const msToSedentaryBreach = remainingSedentaryMinutes * 60 * 1000;

    timeToNextInterventionMs = Math.min(msToFocusBreach, msToSedentaryBreach);
    if (timeToNextInterventionMs === 0) {
      timeToNextInterventionMs = cooldownMs;
    }
  }

  // 5. Calculate Loss Reduction & Projections
  const lossBeforeObj = calculateCyberneticLoss(fourF, options.targetVector, virtues, weights);
  const lossBefore = lossBeforeObj.totalLoss;

  let projectedLossReduction = 0;
  let lossAfterProjected = lossBefore;

  if (hasBreaches) {
    const { projectedVector, projectedVirtues } = projectInterventionEquilibrium(
      fourF,
      breaches,
      virtues
    );
    const reduction = calculateLossReduction(
      fourF,
      projectedVector,
      virtues,
      projectedVirtues,
      weights
    );
    projectedLossReduction = reduction.lossReduction;
    lossAfterProjected = reduction.lossAfter;
  }

  // 6. Progressive Actuation Cascade
  let islandPayload: DynamicIslandPayload | undefined;
  if (hasBreaches && effectiveLevel > 0) {
    islandPayload = buildGovernorDynamicIslandPayload(breaches[0], effectiveLevel as ActuationLevel);
  }

  let actuationPerformed = {
    level1_island_pulse: false,
    level2_notification: false,
    level2_raycast_hud: false,
    level3_zen_mode: false,
  };

  if (hasBreaches && effectiveLevel > 0) {
    actuationPerformed = await executeActuationCascade(effectiveLevel as ActuationLevel, breaches, {
      actuator: options.actuator,
      islandPayload,
    });
  }

  // 7. Assemble Blackboard Summary
  const blackboardSummary = {
    governor_status: hasBreaches
      ? effectiveLevel >= 2
        ? ("alert" as const)
        : ("warning" as const)
      : ("optimal" as const),
    governor_interventions: breaches,
    last_actuation_level: effectiveLevel,
    time_to_next_intervention_ms: timeToNextInterventionMs,
    cybernetic_loss: lossBefore,
    projected_loss_reduction: projectedLossReduction,
  };

  // 8. Persist to Blackboard & Ambient State
  if (persist) {
    try {
      const updates: Record<string, any> = {
        ...blackboardSummary,
        governor_last_evaluation_time: now,
      };

      if (hasBreaches && !inCooldown && effectiveLevel >= 2) {
        updates.governor_last_actuation_time = now;
      }

      if (islandPayload) {
        await updateAmbientContext(
          {
            blackboard: updates,
            dynamicIsland: islandPayload,
          },
          options.statePath || DEFAULT_AMBIENT_STATE_PATH
        );
      } else {
        await logToBlackboard("governor", updates, options.statePath || DEFAULT_AMBIENT_STATE_PATH);
      }
    } catch {
      // Non-blocking in tests or offline environments
    }
  }

  return {
    timestamp: timestampStr,
    breaches,
    hasBreaches,
    actuationLevel: effectiveLevel,
    inCooldown,
    timeToNextInterventionMs,
    lossBefore,
    projectedLossReduction,
    lossAfterProjected,
    actuationPerformed,
    blackboardSummary,
    dynamicIslandPayload: islandPayload,
  };
}
