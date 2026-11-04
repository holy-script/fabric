import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import {
  calculateCyberneticLoss,
  calculateExtremeVicePenalty,
  calculateLossReduction,
  projectInterventionEquilibrium,
  evaluateHomeostaticBoundaries,
  buildGovernorDynamicIslandPayload,
  executeActuationCascade,
  evaluateGovernorInterventions,
  deriveFourFVectorFromTelemetry,
  DEFAULT_COOLDOWN_MS,
  FOCUS_TIME_LIMIT_MINUTES,
  SEDENTARY_LIMIT_MINUTES,
  type FourFVector,
  type GovernorBreach,
  type GovernorActuator,
} from "../src/services/governor.js";
import type { AmbientContext, FocusTranceInfo } from "../src/services/ambient.js";

describe("Fabric OS — Closed-Loop 4F Cybernetic Governor QC Suite", () => {
  let tmpDir: string;
  let tmpStatePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-gov-test-"));
    tmpStatePath = path.join(tmpDir, ".ambient_state.json");
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  // =========================================================================
  // 1. Cybernetic Loss Function & Aristotelian Virtue Penalties
  // =========================================================================
  describe("1. Cybernetic Loss & Aristotelian Virtue Penalties", () => {
    it("returns zero loss when 4F vector and virtues are in optimal equilibrium (S* = 0)", () => {
      const optimal: FourFVector = { focus: 0, facts: 0, funds: 0, feedback: 0 };
      const virtues = { prioritization: 0, documentation: 0, expressionism: 0 };

      const loss = calculateCyberneticLoss(optimal, undefined, virtues);
      expect(loss.totalLoss).toBe(0);
      expect(loss.vectorLoss).toBe(0);
      expect(loss.vicePenalty).toBe(0);
      expect(loss.breakdown.focus).toBe(0);
      expect(loss.breakdown.funds).toBe(0);
    });

    it("penalizes extreme Aristotelian vices non-linearly when |A_j| > 2", () => {
      // Within safe golden mean range (+/- 2.0), penalty is 0
      const moderateVirtues = { prioritization: 1.5, documentation: -2.0, waysToWork: 1.0 };
      expect(calculateExtremeVicePenalty(moderateVirtues)).toBe(0);

      // Severe deviation beyond +/- 2.0 incurs quadratic penalty (|A_j| - 2)^2
      // For +4.0: (4 - 2)^2 = 4.0
      // For -5.0: (5 - 2)^2 = 9.0
      const extremeVirtues = { prioritization: 4.0, documentation: -5.0 };
      const penalty = calculateExtremeVicePenalty(extremeVirtues);
      expect(penalty).toBe(13.0);

      const state: FourFVector = { focus: 0, facts: 0, funds: 0, feedback: 0 };
      const loss = calculateCyberneticLoss(state, undefined, extremeVirtues, {
        focus: 1.0,
        facts: 1.0,
        funds: 1.2,
        feedback: 1.0,
        lambda: 0.5,
      });

      // vicePenalty = 0.5 * 13.0 = 6.5
      expect(loss.vicePenalty).toBe(6.5);
      expect(loss.totalLoss).toBe(6.5);
    });

    it("correctly weights vector loss across all 4F dimensions", () => {
      const state: FourFVector = { focus: 2.0, facts: -1.0, funds: -3.0, feedback: 1.0 };
      // focus: 1.0 * (2)^2 = 4.0
      // facts: 1.0 * (-1)^2 = 1.0
      // funds: 1.2 * (-3)^2 = 10.8
      // feedback: 1.0 * (1)^2 = 1.0
      // total vector loss = 4 + 1 + 10.8 + 1 = 16.8
      const loss = calculateCyberneticLoss(state);
      expect(loss.breakdown.focus).toBe(4.0);
      expect(loss.breakdown.facts).toBe(1.0);
      expect(loss.breakdown.funds).toBe(10.8);
      expect(loss.breakdown.feedback).toBe(1.0);
      expect(loss.vectorLoss).toBe(16.8);
    });
  });

  // =========================================================================
  // 2. Homeostatic Boundary Conditions (All 4 Rules)
  // =========================================================================
  describe("2. Homeostatic Boundary Conditions", () => {
    it("Rule 1: Detects Excessive Focus (F_focus > +3.0 OR continuous focus > 90 min)", () => {
      // A. Normal focus within limits (60 min, F_focus = 1.5)
      const normalBreaches = evaluateHomeostaticBoundaries(
        { focus: 1.5, facts: 0, funds: 0, feedback: 0 },
        60,
        60 * 60,
        80,
        false
      );
      expect(normalBreaches.find((b) => b.ruleId === "excessive_focus")).toBeUndefined();

      // B. Continuous focus exceeded: 95 minutes
      const timeBreaches = evaluateHomeostaticBoundaries(
        { focus: 2.0, facts: 0, funds: 0, feedback: 0 },
        95,
        95 * 60,
        80,
        false
      );
      const timeBreach = timeBreaches.find((b) => b.ruleId === "excessive_focus");
      expect(timeBreach).toBeDefined();
      expect(timeBreach?.title).toContain("Cognitive Hyper-Focus");
      expect(timeBreach?.actionRequired).toContain("5-minute cognitive reset");

      // C. F_focus vector excess: +3.8
      const vectorBreaches = evaluateHomeostaticBoundaries(
        { focus: 3.8, facts: 0, funds: 0, feedback: 0 },
        45,
        45 * 60,
        80,
        false
      );
      const vectorBreach = vectorBreaches.find((b) => b.ruleId === "excessive_focus");
      expect(vectorBreach).toBeDefined();
    });

    it("Rule 2: Detects Depleted Vitality (F_funds < -2.0 OR FOCI recovery < 45)", () => {
      // A. Normal vitality
      const normal = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0.5, feedback: 0 },
        30,
        30 * 60,
        78,
        false
      );
      expect(normal.find((b) => b.ruleId === "depleted_vitality")).toBeUndefined();

      // B. F_funds critically low: -2.8
      const depletedFunds = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: -2.8, feedback: 0 },
        30,
        30 * 60,
        70,
        false
      );
      const fundsBreach = depletedFunds.find((b) => b.ruleId === "depleted_vitality");
      expect(fundsBreach).toBeDefined();
      expect(fundsBreach?.title).toContain("Vitality Depletion");
      expect(fundsBreach?.actionRequired).toContain("Fatigue alert");

      // C. FOCI recovery composite score < 45 (e.g. 38)
      const lowRecovery = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0, feedback: 0 },
        30,
        30 * 60,
        38,
        false
      );
      const recBreach = lowRecovery.find((b) => b.ruleId === "depleted_vitality");
      expect(recBreach).toBeDefined();
    });

    it("Rule 3: Detects Sedentary Stagnation (sedentary > 75 min without standing)", () => {
      // A. Sedentary 70 min (under 75 min limit) -> No breach
      const underLimit = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0, feedback: 0 },
        70,
        70 * 60,
        80,
        false
      );
      expect(underLimit.find((b) => b.ruleId === "sedentary_stagnation")).toBeUndefined();

      // B. Sedentary 82 min without standing -> Breaches
      const sedentaryBreach = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0, feedback: 0 },
        82,
        82 * 60,
        80,
        false
      );
      const breach = sedentaryBreach.find((b) => b.ruleId === "sedentary_stagnation");
      expect(breach).toBeDefined();
      expect(breach?.title).toContain("Sedentary Posture Stagnation");
      expect(breach?.actionRequired).toContain("Kinetic stretch intervention");

      // C. Sedentary 82 min BUT standingDetected === true -> Cleared
      const standing = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0, feedback: 0 },
        82,
        82 * 60,
        80,
        true // standing detected
      );
      expect(standing.find((b) => b.ruleId === "sedentary_stagnation")).toBeUndefined();
    });

    it("Rule 4: Detects Feedback Dispersion (extreme vice penalty or vector dispersion)", () => {
      // A. Feedback vector dispersion: |F_feedback| > 3.0
      const dispersedFeedback = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0, feedback: 3.5 },
        20,
        20 * 60,
        85,
        false
      );
      const fbBreach = dispersedFeedback.find((b) => b.ruleId === "feedback_dispersion");
      expect(fbBreach).toBeDefined();
      expect(fbBreach?.title).toContain("Cybernetic Feedback Dispersion");

      // B. Aristotelian extreme vice penalty >= 8.0
      const viceVirtues = {
        prioritization: 5.0, // (5-2)^2 = 9.0 -> vice penalty 4.5
        documentation: -5.0, // (5-2)^2 = 9.0 -> vice penalty 4.5 -> total vice penalty = 9.0
      };
      const viceBreaches = evaluateHomeostaticBoundaries(
        { focus: 0, facts: 0, funds: 0, feedback: 0 },
        20,
        20 * 60,
        85,
        false,
        viceVirtues
      );
      const viceBreach = viceBreaches.find((b) => b.ruleId === "feedback_dispersion");
      expect(viceBreach).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Progressive Actuation Cascade (Levels 1, 2, 3)
  // =========================================================================
  describe("3. Progressive Actuation Cascade", () => {
    const mockBreach: GovernorBreach = {
      ruleId: "excessive_focus",
      title: "Cognitive Hyper-Focus Saturation",
      description: "Continuous focus exceeded 90 min",
      severity: "warning",
      recommendedActuationLevel: 2,
      metricObserved: "105m continuous",
      threshold: "> 90m",
      actionRequired: "Enforce mandatory 5-minute cognitive reset & hydration break.",
    };

    it("synthesizes Dynamic Island payload matching the specific rule", () => {
      const islandBreak = buildGovernorDynamicIslandPayload(mockBreach, 1);
      expect(islandBreak.badge).toBe("BREAK");
      expect(islandBreak.icon).toBe("🛑");
      expect(islandBreak.status).toBe("warning");

      const fatigueBreach: GovernorBreach = {
        ...mockBreach,
        ruleId: "depleted_vitality",
      };
      const islandFatigue = buildGovernorDynamicIslandPayload(fatigueBreach, 2);
      expect(islandFatigue.badge).toBe("FATIGUE");
      expect(islandFatigue.icon).toBe("💤");
      expect(islandFatigue.status).toBe("alert");
    });

    it("Level 1 triggers Dynamic Island pulse without macOS notification or ADB", async () => {
      let islandUpdated = false;
      let macNotified = false;
      let raycastToasted = false;
      let zenTriggered = false;

      const mockActuator: GovernorActuator = {
        updateDynamicIsland: async () => {
          islandUpdated = true;
          return true;
        },
        sendMacNotification: async () => {
          macNotified = true;
          return true;
        },
        sendRaycastToast: async () => {
          raycastToasted = true;
          return true;
        },
        triggerAndroidZenMode: async () => {
          zenTriggered = true;
          return true;
        },
      };

      const result = await executeActuationCascade(1, [mockBreach], {
        actuator: mockActuator,
      });

      expect(result.level1_island_pulse).toBe(true);
      expect(islandUpdated).toBe(true);
      expect(result.level2_notification).toBe(false);
      expect(macNotified).toBe(false);
      expect(result.level2_raycast_hud).toBe(false);
      expect(raycastToasted).toBe(false);
      expect(result.level3_zen_mode).toBe(false);
      expect(zenTriggered).toBe(false);
    });

    it("Level 2 escalates to native macOS notification and Raycast HUD toast", async () => {
      let macNotified = false;
      let raycastToasted = false;
      let zenTriggered = false;

      const mockActuator: GovernorActuator = {
        updateDynamicIsland: async () => true,
        sendMacNotification: async () => {
          macNotified = true;
          return true;
        },
        sendRaycastToast: async () => {
          raycastToasted = true;
          return true;
        },
        triggerAndroidZenMode: async () => {
          zenTriggered = true;
          return true;
        },
      };

      const result = await executeActuationCascade(2, [mockBreach], {
        actuator: mockActuator,
      });

      expect(result.level1_island_pulse).toBe(true);
      expect(result.level2_notification).toBe(true);
      expect(macNotified).toBe(true);
      expect(result.level2_raycast_hud).toBe(true);
      expect(raycastToasted).toBe(true);
      expect(result.level3_zen_mode).toBe(false);
      expect(zenTriggered).toBe(false);
    });

    it("Level 3 triggers full cascade including Android ADB Zen mode and screen dimming", async () => {
      let macNotified = false;
      let raycastToasted = false;
      let zenTriggered = false;

      const criticalBreach: GovernorBreach = {
        ...mockBreach,
        severity: "critical",
        recommendedActuationLevel: 3,
      };

      const mockActuator: GovernorActuator = {
        updateDynamicIsland: async () => true,
        sendMacNotification: async () => {
          macNotified = true;
          return true;
        },
        sendRaycastToast: async () => {
          raycastToasted = true;
          return true;
        },
        triggerAndroidZenMode: async (enable) => {
          zenTriggered = enable;
          return true;
        },
      };

      const result = await executeActuationCascade(3, [criticalBreach], {
        actuator: mockActuator,
      });

      expect(result.level1_island_pulse).toBe(true);
      expect(result.level2_notification).toBe(true);
      expect(macNotified).toBe(true);
      expect(result.level2_raycast_hud).toBe(true);
      expect(raycastToasted).toBe(true);
      expect(result.level3_zen_mode).toBe(true);
      expect(zenTriggered).toBe(true);
    });
  });

  // =========================================================================
  // 4. Cooldown Safety Timer & Anti-Spam Governor
  // =========================================================================
  describe("4. Cooldown Safety Timer & Anti-Spam", () => {
    it("suppresses repeated Level 2/3 interrupts within the 15-minute cooldown window", async () => {
      const baseTime = 1700000000000;
      let macNotifiedCount = 0;

      const mockActuator: GovernorActuator = {
        updateDynamicIsland: async () => true,
        sendMacNotification: async () => {
          macNotifiedCount++;
          return true;
        },
        sendRaycastToast: async () => true,
        triggerAndroidZenMode: async () => true,
      };

      // 1. Initial breach at T=0
      const eval1 = await evaluateGovernorInterventions(
        {
          fourF: { focus: 3.5, facts: 0, funds: 0, feedback: 0 },
          focus: { continuousActivitySeconds: 100 * 60, sedentaryMinutes: 100 },
        },
        {
          now: baseTime,
          statePath: tmpStatePath,
          actuator: mockActuator,
          forceLevel: 2,
        }
      );

      expect(eval1.hasBreaches).toBe(true);
      expect(eval1.inCooldown).toBe(false);
      expect(eval1.actuationLevel).toBe(2);
      expect(macNotifiedCount).toBe(1);

      // 2. Second breach 5 minutes later (T = 5 min = 300,000 ms < 15 min cooldown)
      const fiveMinLater = baseTime + 5 * 60 * 1000;
      const eval2 = await evaluateGovernorInterventions(
        {
          fourF: { focus: 3.8, facts: 0, funds: 0, feedback: 0 },
          focus: { continuousActivitySeconds: 105 * 60, sedentaryMinutes: 105 },
          blackboard: {
            governor_last_actuation_time: baseTime,
          },
        },
        {
          now: fiveMinLater,
          statePath: tmpStatePath,
          actuator: mockActuator,
          forceLevel: 2,
        }
      );

      expect(eval2.hasBreaches).toBe(true);
      expect(eval2.inCooldown).toBe(true);
      // Under cooldown: Level 2 notification is suppressed (demoted to Level 1 gentle pulse)
      expect(eval2.actuationLevel).toBe(1);
      expect(macNotifiedCount).toBe(1); // Still 1! Not spammed!
      expect(eval2.timeToNextInterventionMs).toBe(10 * 60 * 1000); // 10 minutes remaining in cooldown

      // 3. Third check after 16 minutes (T = 16 min > 15 min cooldown)
      const sixteenMinLater = baseTime + 16 * 60 * 1000;
      const eval3 = await evaluateGovernorInterventions(
        {
          fourF: { focus: 4.0, facts: 0, funds: 0, feedback: 0 },
          focus: { continuousActivitySeconds: 116 * 60, sedentaryMinutes: 116 },
          blackboard: {
            governor_last_actuation_time: baseTime,
          },
        },
        {
          now: sixteenMinLater,
          statePath: tmpStatePath,
          actuator: mockActuator,
          forceLevel: 2,
        }
      );

      expect(eval3.hasBreaches).toBe(true);
      expect(eval3.inCooldown).toBe(false);
      expect(eval3.actuationLevel).toBe(2);
      expect(macNotifiedCount).toBe(2); // Cooldown expired, actuation fires again!
    });
  });

  // =========================================================================
  // 5. Cybernetic Loss Reduction Calculations
  // =========================================================================
  describe("5. Cybernetic Loss Reduction Calculations", () => {
    it("proves quantitative loss reduction after applying homeostatic interventions", () => {
      // Current dispersed state:
      // Focus excessive (+4.0), Vitality depleted (-3.0), Feedback noisy (+3.5)
      const currentState: FourFVector = {
        focus: 4.0,
        facts: 0.0,
        funds: -3.0,
        feedback: 3.5,
      };

      const currentVirtues = {
        prioritization: 4.5,
        documentation: -4.0,
      };

      const breaches = evaluateHomeostaticBoundaries(
        currentState,
        95,
        95 * 60,
        35,
        false,
        currentVirtues
      );

      expect(breaches.length).toBeGreaterThanOrEqual(3);

      const { projectedVector, projectedVirtues } = projectInterventionEquilibrium(
        currentState,
        breaches,
        currentVirtues
      );

      const reduction = calculateLossReduction(
        currentState,
        projectedVector,
        currentVirtues,
        projectedVirtues
      );

      expect(reduction.lossBefore).toBeGreaterThan(30);
      expect(reduction.lossAfter).toBeLessThan(reduction.lossBefore);
      expect(reduction.lossReduction).toBeGreaterThan(20);
      expect(reduction.percentImprovement).toBeGreaterThan(50);
    });

    it("evaluates governor interventions and logs audit summary to blackboard", async () => {
      const result = await evaluateGovernorInterventions(
        {
          fourF: { focus: 3.6, facts: 0, funds: -2.5, feedback: 0 },
          focus: {
            sedentaryMinutes: 80,
            continuousActivitySeconds: 95 * 60,
            standingDetected: false,
          },
          wearables: {
            recoveryScore: 40,
          },
        },
        {
          statePath: tmpStatePath,
          persistToBlackboard: true,
          actuator: {
            updateDynamicIsland: async () => true,
            sendMacNotification: async () => true,
            sendRaycastToast: async () => true,
            triggerAndroidZenMode: async () => true,
          },
        }
      );

      expect(result.hasBreaches).toBe(true);
      expect(result.breaches.length).toBeGreaterThanOrEqual(2);
      expect(result.lossBefore).toBeGreaterThan(15);
      expect(result.projectedLossReduction).toBeGreaterThan(5);
      expect(result.blackboardSummary.governor_status).toBe("alert");

      // Verify persistence to statePath file
      expect(fs.existsSync(tmpStatePath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(tmpStatePath, "utf-8"));
      expect(saved.dynamicIsland).toBeDefined();
      expect(saved.blackboard.governor_status).toBe("alert");
      expect(saved.blackboard.cybernetic_loss).toBe(result.lossBefore);
    });

    it("derives fourF vector correctly from ambient and wearable telemetry", () => {
      const derived = deriveFourFVectorFromTelemetry({
        focus: {
          continuousActivitySeconds: 125 * 60,
          sedentaryMinutes: 125,
          standingDetected: false,
        },
        wearables: {
          recoveryScore: 28,
        },
      });

      expect(derived.fourF.focus).toBe(4.5); // Derived high focus
      expect(derived.fourF.funds).toBe(-4.0); // Derived critical low vitality
      expect(derived.sedentaryMinutes).toBe(125);
      expect(derived.recoveryScore).toBe(28);
    });
  });
});
