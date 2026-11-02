/**
 * FOCI Wearable Telegram Bot Command Handler
 * 
 * Manages `/foci` command, real-time biofeedback HUD,
 * 60-second breathing test simulation, and BLE pairing diagnostics.
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  getFociBridgeState,
  flushFociFocusBlock,
  simulateFociLiveStream,
  resetFociStressTracking,
  muteFociAlerts,
} from "../../integrations/foci/bridge.js";
import { generateSyntheticPacket } from "../../integrations/foci/protocol.js";
import type { FociMentalState } from "../../integrations/foci/types.js";
import { config } from "../../config/env.js";

const STATE_ICONS: Record<FociMentalState, string> = {
  flow: "🌊 FLOW",
  focus: "🎯 FOCUS",
  calm: "🧘 CALM",
  distraction: "🌀 DISTRACTION",
  stress: "🔥 STRESS",
  fatigue: "💤 FATIGUE",
};

export async function handleFoci(ctx: Context) {
  const text = ctx.message?.text || "";
  const subcommand = text.replace(/^\/foci\s*/i, "").trim().toLowerCase();

  if (subcommand === "test") {
    return handleFociTest(ctx);
  }
  if (subcommand === "scan" || subcommand === "pair" || subcommand === "setup") {
    return handleFociScan(ctx);
  }
  if (subcommand === "reset" || subcommand === "breathe") {
    return handleFociReset(ctx);
  }

  // Default: Real-time Telemetry Status HUD
  return handleFociStatus(ctx);
}

/**
 * Real-time FOCI Status HUD
 */
export async function handleFociStatus(ctx: Context) {
  const userId = ctx.from?.id.toString() || config.telegramUserId || "1131646846";
  const state = getFociBridgeState(userId);
  const packet = state.latestPacket;

  const isConnected = state.deviceStatus.isConnected;
  const connectionTag = isConnected ? "🟢 Active Stream" : "🟡 Standby (No active BLE bridge)";
  const battery = packet?.batteryLevel ?? state.deviceStatus.batteryLevel ?? 88;
  const mentalState = packet?.mentalState || "focus";
  const stateLabel = STATE_ICONS[mentalState] || "🎯 FOCUS";
  const bpm = packet?.breath.respirationRate ?? 13.5;
  const depth = packet?.breath.diaphragmaticDepth ?? 76;
  const ieRatio = packet?.breath.inhalationExhalationRatio ?? 0.5;
  const fluidity = packet?.breath.fluidity ?? 80;
  const posture = packet?.posture || "good";

  // Physiological evaluation of respiration rate
  let breathEval = "Optimal Cognitive Zone";
  if (bpm < 10) breathEval = "Deep Parasympathetic / Vagal Tone";
  else if (bpm > 18) breathEval = "Rapid Sympathetic Breathing (Stress Alert)";
  else if (depth < 40) breathEval = "Shallow Thoracic Breathing";

  // Build mini-progress bar for diaphragmatic depth
  const depthBar = renderBar(depth, 100, 10);
  const fluidityBar = renderBar(fluidity, 100, 10);

  const keyboard = new InlineKeyboard()
    .text("🔄 Refresh Status", "action:foci_status")
    .text("🧪 60s Breathing Test", "action:foci_test")
    .row()
    .text("🧘 2m Diaphragmatic Reset", "action:foci_reset")
    .text("📡 BLE Pairing Guide", "action:foci_scan");

  const message =
    `🧘 *FABRIC FOCI BIOFEEDBACK & BREATH HUD*\n\n` +
    `*Hardware:* \`TinyLogics FOCI 2 Clip (BLE)\`\n` +
    `*Link Status:* ${connectionTag}\n` +
    `*Battery:* 🔋 \`${battery}%\` | *Posture:* \`${posture.toUpperCase()}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧠 *COGNITIVE MENTAL STATE*\n` +
    `• *Current:* *${stateLabel}*\n` +
    `• *Confidence:* \`${Math.round((packet?.mentalStateConfidence ?? 0.85) * 100)}%\`\n` +
    (state.negativeDurationMinutes > 0
      ? `• ⚠️ *Consecutive ${state.negativeState?.toUpperCase()}:* \`${state.negativeDurationMinutes}m\`\n`
      : "") +
    `\n` +
    `🫁 *DIAPHRAGMATIC BREATHING ARCHITECTURE*\n` +
    `• *Respiration Rate:* \`${bpm} breaths/min\`\n` +
    `  _(${breathEval})_\n` +
    `• *Belly Expansion Depth:* \`${depth}%\`\n` +
    `  \`[${depthBar}]\`\n` +
    `• *Inhale / Exhale (I:E):* \`1:${(1 / (ieRatio || 0.5)).toFixed(1)}\` (${ieRatio <= 0.6 ? "Vagal Exhale Dominant" : "Equalized"})\n` +
    `• *Fluidity / Coherence:* \`${fluidity}%\`\n` +
    `  \`[${fluidityBar}]\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 *Ingestion Engine:* \`${state.bufferCount} packets in buffer\` | \`${state.totalBlocksIngested} blocks archived\`\n` +
    `_Diaphragmatic micro-motion automatically recalibrates Vitality in Fabric OS._`;

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    } catch {
      // If content is identical
    }
  }

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * 60-Second Live Breathing Simulation Test
 */
export async function handleFociTest(ctx: Context) {
  const userId = ctx.from?.id.toString() || config.telegramUserId || "1131646846";

  const statusMsg = await ctx.reply(
    `🧪 *FOCI 60-SECOND DIAPHRAGMATIC BREATHING TEST*\n\n` +
      `*Stage 1/3:* Initiating micro-motion sensor stream...\n` +
      `_Calibrating baseline abdominal displacement..._`,
    { parse_mode: "Markdown" }
  );

  try {
    // Stage 1: Initial calibration
    await new Promise((r) => setTimeout(r, 1200));

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `🧪 *FOCI 60-SECOND DIAPHRAGMATIC BREATHING TEST*\n\n` +
        `🌬️ *Stage 2/3: Live Breathing Tracking*\n\n` +
        `• 00s - 20s: Distraction detected $\\rightarrow$ Respiration: \`18.2 bpm\`\n` +
        `• 20s - 40s: Diaphragmatic rhythm locked $\\rightarrow$ Respiration: \`12.4 bpm\` (Depth: 78%)\n` +
        `• 40s - 60s: Extended exhalations $\\rightarrow$ Respiration: \`9.2 bpm\` (Depth: 91%)\n\n` +
        `_Simulating high-resolution 10Hz accelerometer telemetry..._`,
      { parse_mode: "Markdown" }
    );

    // Simulate 60 packets
    const block = await simulateFociLiveStream(60, { userId });

    await new Promise((r) => setTimeout(r, 1500));

    const keyboard = new InlineKeyboard()
      .text("📊 View Updated HUD", "action:foci_status")
      .text("🧘 2m Reset Exercise", "action:foci_reset");

    const finalReport =
      `🎉 *FOCI 60-SECOND BREATHING TEST COMPLETE!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🧠 *Dominant State:* *${STATE_ICONS[block.dominantState]}*\n` +
      `🌬️ *Average Respiration:* \`${block.averageRespirationRate} bpm\`\n` +
      `🎯 *Focus Score:* \`${block.focusScore}/100\`\n` +
      `🧘 *Calm Score:* \`${block.calmScore}/100\`\n` +
      `⚡ *Energy Delta:* \`+${block.energyDelta}\` | *Vitality Boost:* \`+${block.vitalityImpact}\`\n\n` +
      `📊 *Cognitive State Breakdown:*\n` +
      `• Focus: \`${block.stateBreakdown.focus}%\`\n` +
      `• Flow: \`${block.stateBreakdown.flow}%\`\n` +
      `• Calm: \`${block.stateBreakdown.calm}%\`\n` +
      `• Distraction: \`${block.stateBreakdown.distraction}%\`\n` +
      `• Stress: \`${block.stateBreakdown.stress}%\`\n\n` +
      `✅ *Archived to Firestore \`biometrics\` & \`trades\` collection.*`;

    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, finalReport, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error("Error running FOCI test stream:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ FOCI test stream failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * BLE Hardware Pairing & Scanner Guide
 */
export async function handleFociScan(ctx: Context) {
  const guide =
    `📡 *FOCI BLE HARDWARE BRIDGE GUIDE (Mac / Linux)*\n\n` +
    `FOCI communicates with Fabric via Bluetooth Low Energy (BLE) using our custom bridge daemon.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ *PREREQUISITES*\n` +
    `• Install Python BLE dependencies:\n` +
    `  \`pip install bleak requests\`\n\n` +
    `2️⃣ *SCAN FOR NEARBY FOCI DEVICES*\n` +
    `• In your terminal, run:\n` +
    `  \`python3 scripts/foci-ble-bridge.py --scan\`\n` +
    `• Note the BLE MAC Address or UUID of your FOCI clip.\n\n` +
    `3️⃣ *START LIVE TELEMETRY BRIDGE*\n` +
    `• Run the daemon:\n` +
    `  \`python3 scripts/foci-ble-bridge.py\`\n` +
    `• It automatically discovers FOCI, subscribes to notifications, decodes 20-byte micro-motion frames, and POSTs to:\n` +
    `  \`http://localhost:3000/api/webhooks/health?source=foci\`\n\n` +
    `4️⃣ *SYNTHETIC SIMULATION (NO HARDWARE REQUIRED)*\n` +
    `• Test without wearable:\n` +
    `  \`python3 scripts/foci-ble-bridge.py --synthetic\`\n\n` +
    `_macOS Note: Ensure Terminal / VSCode has Bluetooth permission under macOS Settings > Privacy & Security > Bluetooth._`;

  const keyboard = new InlineKeyboard()
    .text("🔄 Return to HUD", "action:foci_status")
    .text("🧪 Run 60s Test", "action:foci_test");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(guide, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    return;
  }

  await ctx.reply(guide, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * 2-Minute Diaphragmatic Reset Exercise
 */
export async function handleFociReset(ctx: Context) {
  const userId = ctx.from?.id.toString() || config.telegramUserId || "1131646846";
  resetFociStressTracking(userId);

  const resetGuide =
    `🧘 *2-MINUTE DIAPHRAGMATIC VAGAL RESET*\n\n` +
    `Use this protocol when FOCI flags elevated Stress or cognitive fragmentation.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ *POSTURE SETUP (30s)*\n` +
    `• Sit upright with uncrossed legs, feet flat on the floor.\n` +
    `• Place one hand on your belly (over the FOCI clip) and one on your chest.\n` +
    `• Relax your jaw, drop your shoulders away from your ears.\n\n` +
    `2️⃣ *THE 4-4-6 PARASYMPATHETIC CADENCE (90s)*\n` +
    `• *Inhale (4s):* Breathe in smoothly through your nose. Feel your belly push outward into FOCI. The chest should remain still.\n` +
    `• *Hold (4s):* Maintain a soft, relaxed pause. No tension.\n` +
    `• *Exhale (6-8s):* Slow, whispered exhalation through slightly pursed lips.\n\n` +
    `Repeat this 6 times (~2 minutes). Your respiration rate will drop below 8 bpm, activating acetylcholine release via the vagus nerve.`;

  const keyboard = new InlineKeyboard()
    .text("✅ Reset Complete (Check HUD)", "action:foci_status")
    .text("🧪 Test Telemetry", "action:foci_test");

  if (ctx.callbackQuery) {
    await ctx.editMessageText(resetGuide, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    return;
  }

  await ctx.reply(resetGuide, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

function renderBar(value: number, max: number, length: number = 10): string {
  const filled = Math.round((Math.max(0, Math.min(value, max)) / max) * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}
