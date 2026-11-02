/**
 * FOCI Wearable BLE Bridge Service
 * 
 * Ingests live telemetry packets, aggregates 5-minute cognitive focus blocks,
 * persists biofeedback to Firestore `biometrics` and `userState`,
 * and triggers Telegram alerts upon prolonged Stress / Distraction (>20 minutes).
 */

import admin from "firebase-admin";
import { Bot, InlineKeyboard } from "grammy";
import { config } from "../../config/env.js";
import {
  db,
  userStatesCollection,
  biometricsCollection,
  createTrade,
  getUserState,
} from "../../db/firestore.js";
import type {
  FociMentalState,
  FociTelemetryPacket,
  FociFocusBlock,
  FociDeviceStatus,
  FociAlertPayload,
} from "./types.js";
import { generateSyntheticPacket } from "./protocol.js";

// Standalone Telegram Bot client for alert dispatching
let alertBot: Bot | null = null;
function getAlertBot(): Bot | null {
  if (!alertBot && config.telegramToken) {
    try {
      alertBot = new Bot(config.telegramToken);
    } catch (e) {
      console.warn("⚠️ Could not instantiate Bot for FOCI alerts:", e);
    }
  }
  return alertBot;
}

// In-Memory Telemetry Buffers & Alert Trackers
interface UserBridgeState {
  deviceStatus: FociDeviceStatus;
  latestPacket: FociTelemetryPacket | null;
  buffer: FociTelemetryPacket[];
  bufferStartTime: Date;
  // Tracking prolonged stress / distraction
  currentNegativeState: "stress" | "distraction" | null;
  negativeStateStartedAt: Date | null;
  lastAlertSentAt: Date | null;
  alertMutedUntil: Date | null;
  totalBlocksIngested: number;
}

const userStates = new Map<string, UserBridgeState>();

function getOrCreateUserState(userId: string): UserBridgeState {
  let state = userStates.get(userId);
  if (!state) {
    state = {
      deviceStatus: {
        deviceId: "FOCI-BLE-DEFAULT",
        deviceName: "FOCI TinyLogics Clip",
        batteryLevel: 90,
        isCharging: false,
        isConnected: false,
        lastSeen: new Date(),
      },
      latestPacket: null,
      buffer: [],
      bufferStartTime: new Date(),
      currentNegativeState: null,
      negativeStateStartedAt: null,
      lastAlertSentAt: null,
      alertMutedUntil: null,
      totalBlocksIngested: 0,
    };
    userStates.set(userId, state);
  }
  return state;
}

export function muteFociAlerts(userId: string, minutes: number = 30): void {
  const state = getOrCreateUserState(userId);
  state.alertMutedUntil = new Date(Date.now() + minutes * 60 * 1000);
}

export function resetFociStressTracking(userId: string): void {
  const state = getOrCreateUserState(userId);
  state.currentNegativeState = null;
  state.negativeStateStartedAt = null;
}

export function getFociBridgeState(userId: string = config.telegramUserId || "1131646846") {
  const state = getOrCreateUserState(userId);
  return {
    deviceStatus: state.deviceStatus,
    latestPacket: state.latestPacket,
    bufferCount: state.buffer.length,
    bufferDurationSec: Math.round((Date.now() - state.bufferStartTime.getTime()) / 1000),
    negativeState: state.currentNegativeState,
    negativeDurationMinutes: state.negativeStateStartedAt
      ? Math.round((Date.now() - state.negativeStateStartedAt.getTime()) / 60000)
      : 0,
    isMuted: state.alertMutedUntil ? state.alertMutedUntil.getTime() > Date.now() : false,
    totalBlocksIngested: state.totalBlocksIngested,
  };
}

/**
 * Ingests a single FOCI telemetry packet.
 * Buffers packets and automatically flushes a 5-minute cognitive focus block.
 * Checks for prolonged stress or distraction (> 20 mins) and sends alerts.
 */
export async function ingestFociTelemetry(
  packet: FociTelemetryPacket,
  userId: string = config.telegramUserId || "1131646846"
): Promise<{
  success: boolean;
  blockFlushed?: FociFocusBlock;
  alertTriggered?: boolean;
}> {
  const state = getOrCreateUserState(userId);

  // Update device status
  state.deviceStatus.deviceId = packet.deviceId || state.deviceStatus.deviceId;
  state.deviceStatus.isConnected = true;
  state.deviceStatus.lastSeen = new Date();
  if (packet.batteryLevel !== undefined) {
    state.deviceStatus.batteryLevel = packet.batteryLevel;
  }
  state.latestPacket = packet;
  state.buffer.push(packet);

  // 1. Check for prolonged Stress / Distraction (>20 minutes)
  let alertTriggered = false;
  const now = new Date();
  const isNegative = packet.mentalState === "stress" || packet.mentalState === "distraction";

  if (isNegative) {
    if (!state.negativeStateStartedAt || state.currentNegativeState !== packet.mentalState) {
      state.currentNegativeState = packet.mentalState as "stress" | "distraction";
      state.negativeStateStartedAt = now;
    } else {
      const negativeDurationMs = now.getTime() - state.negativeStateStartedAt.getTime();
      const negativeMinutes = negativeDurationMs / (60 * 1000);

      // Check threshold: 20 minutes
      if (negativeMinutes >= 20) {
        const isMuted = state.alertMutedUntil && state.alertMutedUntil.getTime() > now.getTime();
        const alertCooldownMs = 30 * 60 * 1000; // 30-minute cooldown
        const canSendAlert =
          !isMuted &&
          (!state.lastAlertSentAt || now.getTime() - state.lastAlertSentAt.getTime() > alertCooldownMs);

        if (canSendAlert) {
          alertTriggered = true;
          state.lastAlertSentAt = now;
          await dispatchProlongedStressAlert(userId, packet, negativeMinutes);
        }
      }
    }
  } else {
    // Return to calm/focus/flow resets consecutive negative duration
    state.currentNegativeState = null;
    state.negativeStateStartedAt = null;
  }

  // 2. Check 5-Minute Cognitive Focus Block threshold
  const bufferDurationMs = now.getTime() - state.bufferStartTime.getTime();
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  let blockFlushed: FociFocusBlock | undefined;
  if (bufferDurationMs >= FIVE_MINUTES_MS || state.buffer.length >= 300) {
    const flushed = await flushFociFocusBlock(userId);
    if (flushed) {
      blockFlushed = flushed;
    }
  }

  return {
    success: true,
    blockFlushed,
    alertTriggered,
  };
}

/**
 * Aggregates the buffered telemetry packets into a 5-minute FociFocusBlock,
 * writes to Firestore `biometrics`, updates `userState`, and clears buffer.
 */
export async function flushFociFocusBlock(
  userId: string = config.telegramUserId || "1131646846"
): Promise<FociFocusBlock | null> {
  const state = getOrCreateUserState(userId);
  if (state.buffer.length === 0) return null;

  const packets = [...state.buffer];
  state.buffer = [];
  const startTime = state.bufferStartTime;
  const endTime = new Date();
  state.bufferStartTime = endTime;

  const durationMinutes = Math.max(
    1,
    Math.round(((endTime.getTime() - startTime.getTime()) / 60000) * 10) / 10
  );

  // Compute state breakdown frequencies
  const counts: Record<FociMentalState, number> = {
    focus: 0,
    calm: 0,
    distraction: 0,
    stress: 0,
    flow: 0,
    fatigue: 0,
  };

  let totalBpm = 0;
  let totalDepth = 0;

  for (const p of packets) {
    if (counts[p.mentalState] !== undefined) {
      counts[p.mentalState]++;
    }
    totalBpm += p.breath.respirationRate;
    totalDepth += p.breath.diaphragmaticDepth;
  }

  const sampleCount = packets.length;
  const avgBpm = Math.round((totalBpm / sampleCount) * 10) / 10;
  const avgDepth = Math.round(totalDepth / sampleCount);

  // Percentages
  const stateBreakdown: Record<FociMentalState, number> = {
    focus: Math.round((counts.focus / sampleCount) * 100),
    flow: Math.round((counts.flow / sampleCount) * 100),
    calm: Math.round((counts.calm / sampleCount) * 100),
    distraction: Math.round((counts.distraction / sampleCount) * 100),
    stress: Math.round((counts.stress / sampleCount) * 100),
    fatigue: Math.round((counts.fatigue / sampleCount) * 100),
  };

  // Find dominant state
  let dominantState: FociMentalState = "focus";
  let maxCount = -1;
  for (const [st, cnt] of Object.entries(counts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      dominantState = st as FociMentalState;
    }
  }

  // Scores
  const focusScore = Math.min(100, stateBreakdown.focus + stateBreakdown.flow * 1.2);
  const calmScore = Math.min(
    100,
    Math.round(stateBreakdown.calm * 1.0 + stateBreakdown.flow * 0.5 + (avgDepth / 100) * 30)
  );

  // Energy delta & vitality calculation
  let energyDelta = 0;
  let vitalityImpact = 0;

  if (dominantState === "flow") {
    energyDelta = 2;
    vitalityImpact = 0.3;
  } else if (dominantState === "calm") {
    energyDelta = 1;
    vitalityImpact = 0.4;
  } else if (dominantState === "focus") {
    energyDelta = 1;
    vitalityImpact = 0.1;
  } else if (dominantState === "distraction") {
    energyDelta = -1;
    vitalityImpact = -0.1;
  } else if (dominantState === "stress") {
    energyDelta = -2;
    vitalityImpact = -0.4;
  } else if (dominantState === "fatigue") {
    energyDelta = -2;
    vitalityImpact = -0.2;
  }

  const blockId = `foci_block_${Date.now()}`;
  const block: FociFocusBlock = {
    id: blockId,
    userId,
    startTime,
    endTime,
    durationMinutes,
    dominantState,
    stateBreakdown,
    averageRespirationRate: avgBpm,
    calmScore,
    focusScore: Math.round(focusScore),
    stressAlertTriggered: stateBreakdown.stress > 40,
    vitalityImpact,
    energyDelta,
    sampleCount,
  };

  state.totalBlocksIngested++;

  // 3. Persist to Firestore: biometrics collection
  try {
    await biometricsCollection.add({
      ...block,
      source: "foci_ble",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("⚠️ Could not save FOCI block to biometricsCollection:", err);
  }

  // 4. Update userState in Firestore
  try {
    const userDoc = await userStatesCollection.doc(userId).get();
    const currentState = userDoc.exists ? userDoc.data() : null;

    const focusedHoursToAdd =
      dominantState === "focus" || dominantState === "flow"
        ? Math.round((durationMinutes / 60) * 100) / 100
        : 0;

    const currentFocusHours = currentState?.totalFocusHours || 0;
    const currentGoldenMeans = currentState?.goldenMeans || {
      prioritization: 0,
      documentation: 0,
      waysToWork: 0,
      timeManagement: 0,
      variety: 0,
      expressionism: 0,
      vitality: 0,
    };

    // Update Vitality mean: target is 0 (Golden Mean)
    const currentVitality = currentGoldenMeans.vitality ?? 0;
    const newVitality = Math.round(
      Math.min(5, Math.max(-5, currentVitality + vitalityImpact)) * 10
    ) / 10;

    // Moving average of energy delta
    const currentAvgEnergy = currentState?.averageEnergyDelta || 0;
    const alpha = 0.15;
    const newAvgEnergy = Math.round((currentAvgEnergy * (1 - alpha) + energyDelta * alpha) * 10) / 10;

    await userStatesCollection.doc(userId).set(
      {
        totalFocusHours: Math.round((currentFocusHours + focusedHoursToAdd) * 100) / 100,
        averageEnergyDelta: newAvgEnergy,
        goldenMeans: {
          ...currentGoldenMeans,
          vitality: newVitality,
        },
        lastFociSync: admin.firestore.FieldValue.serverTimestamp(),
        lastDominantMentalState: dominantState,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // If dominant state was Focus or Flow for >= 15 min or high score, log a builder trade
    if (focusedHoursToAdd >= 0.25 || (durationMinutes >= 5 && (dominantState === "focus" || dominantState === "flow"))) {
      await createTrade({
        userId,
        timestamp: new Date(),
        tradeType: "builder",
        moduleName: `FOCI: ${dominantState.toUpperCase()} Cognitive Block`,
        focusActualHours: focusedHoursToAdd > 0 ? focusedHoursToAdd : 0.08,
        factsYield: `Diaphragmatic breathing maintained at ${avgBpm} bpm (Depth: ${avgDepth}%). Dominant cognitive state: ${dominantState}.`,
        fundsCost: 0,
        fundsYield: 0,
        energyDelta,
        tags: ["foci", "wearable", "biofeedback", dominantState, "breath"],
      });
    }
  } catch (err) {
    console.warn("⚠️ Error updating userState with FOCI block:", err);
  }

  return block;
}

/**
 * Triggers a proactive Telegram alert when prolonged Stress or Distraction (>20m) is detected.
 */
async function dispatchProlongedStressAlert(
  userId: string,
  packet: FociTelemetryPacket,
  durationMinutes: number
): Promise<void> {
  const bot = getAlertBot();
  if (!bot) return;

  const isStress = packet.mentalState === "stress";
  const stateEmoji = isStress ? "🔥" : "🌀";
  const stateTitle = isStress ? "Sympathetic Nervous Overdrive (Stress)" : "Cognitive Fragmentation (Distraction)";

  const keyboard = new InlineKeyboard()
    .text("🧘 Start 2m Breath Reset", "action:foci_reset")
    .text("🔕 Mute 30m", "action:foci_mute_30")
    .row()
    .text("📊 FOCI Telemetry HUD", "action:foci_status");

  const text =
    `⚠️ *FOCI BIOFEEDBACK ALERT: COGNITIVE OVERDRIVE*\n\n` +
    `${stateEmoji} *Status:* Prolonged *${stateTitle}* detected for *${Math.round(durationMinutes)} minutes*.\n\n` +
    `🫁 *Current Respiration:* \`${packet.breath.respirationRate} breaths/min\` (${isStress ? "Rapid & Shallow" : "Irregular"})\n` +
    `🌊 *Diaphragmatic Depth:* \`${packet.breath.diaphragmaticDepth}%\`\n` +
    `📐 *Posture:* \`${packet.posture || "slouch"}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌬️ *PRESCRIBED 2-MINUTE DIAPHRAGMATIC RESET*\n` +
    `1. *Inhale (4s):* Expand lower abdomen, belly outward, shoulders relaxed.\n` +
    `2. *Hold (4s):* Feel the calm vagal pause.\n` +
    `3. *Exhale (6-8s):* Slow, controlled release through slightly parted lips.\n\n` +
    `_Long exhalations activate the vagus nerve and down-regulate cortisol._`;

  try {
    await bot.api.sendMessage(userId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error("Failed to send FOCI prolonged stress Telegram alert:", err);
  }
}

/**
 * Simulates a continuous live stream of FOCI packets (useful for automated testing or demonstration).
 */
export async function simulateFociLiveStream(
  durationSeconds: number,
  options: { state?: FociMentalState; userId?: string; onPacket?: (p: FociTelemetryPacket) => void } = {}
): Promise<FociFocusBlock> {
  const userId = options.userId || config.telegramUserId || "1131646846";
  const startTime = Date.now();

  for (let sec = 0; sec < durationSeconds; sec++) {
    const packet = generateSyntheticPacket({
      stateOverride: options.state,
      timeOffsetSec: (startTime + sec * 1000) / 1000,
    });

    if (options.onPacket) {
      options.onPacket(packet);
    }

    await ingestFociTelemetry(packet, userId);
  }

  const block = await flushFociFocusBlock(userId);
  if (!block) {
    throw new Error("Failed to flush simulated FOCI block");
  }
  return block;
}
