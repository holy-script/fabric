import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getLatestBiometrics, type BiometricSnapshot } from "../../services/wearables.js";

/**
 * Renders a visual progress bar for scores 0-100.
 */
function renderProgressBar(percentage: number, totalBlocks: number = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  const filled = Math.max(0, Math.min(totalBlocks, Math.round((clamped / 100) * totalBlocks)));
  return "█".repeat(filled) + "░".repeat(totalBlocks - filled);
}

/**
 * Converts decimal hours to human-readable "Xh Ym".
 */
function formatHours(hours?: number): string {
  if (hours === undefined || hours === null || isNaN(hours)) return "N/A";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formats a friendly timestamp for when the last sync occurred.
 */
function formatSyncTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return `Today at ${timeStr}`;
  }
  if (diffHours < 48 && date.getDate() === now.getDate() - 1) {
    return `Yesterday at ${timeStr}`;
  }
  return `${date.toISOString().split("T")[0]} at ${timeStr}`;
}

/**
 * Formats the rich visual Biometric HUD card.
 */
export function formatBiometricCard(snapshot: BiometricSnapshot): string {
  const recoveryScore = snapshot.recovery?.score ?? 70;
  const progressBar = renderProgressBar(recoveryScore, 10);

  let statusBadge = "🟢 OPTIMAL PRIMED";
  if (recoveryScore >= 85) statusBadge = "⚡ PEAK READINESS";
  else if (recoveryScore >= 70) statusBadge = "🟢 OPTIMAL PRIMED";
  else if (recoveryScore >= 50) statusBadge = "🟡 ADAPTIVE STRAIN";
  else statusBadge = "🔴 CNS FATIGUE / DEPLETED";

  const sleep = snapshot.sleep;
  const sleepTotalStr = sleep ? formatHours(sleep.totalHours) : "No sleep logged";
  const effStr = sleep?.efficiencyPercent ? ` (${sleep.efficiencyPercent}% eff)` : "";

  let sleepBreakdown = "";
  if (sleep?.deepSleepHours || sleep?.remSleepHours || sleep?.lightSleepHours) {
    const deepStr = sleep.deepSleepHours ? formatHours(sleep.deepSleepHours) : "--";
    const remStr = sleep.remSleepHours ? formatHours(sleep.remSleepHours) : "--";
    const lightStr = sleep.lightSleepHours ? formatHours(sleep.lightSleepHours) : "--";
    sleepBreakdown = `   • 🌊 Deep: *${deepStr}* | 🧠 REM: *${remStr}* | 🕯️ Light: *${lightStr}*\n`;
  }

  const rhr = snapshot.heartRate?.resting;
  const hrv = snapshot.hrv?.value;
  const hrvMetric = snapshot.hrv?.metric || "rMSSD";
  const resp = snapshot.respirationRate;
  const activeCal = snapshot.energy?.activeCalories;
  const steps = snapshot.energy?.stepCount;

  const syncTime = formatSyncTime(snapshot.timestamp);
  const deviceName = snapshot.device?.name || snapshot.source.toUpperCase();

  return (
    `🧬 *FABRIC BIOMETRIC HUD: TELEMETRY & RECOVERY*\n\n` +
    `🔋 *Recovery & Readiness:* *${recoveryScore}%* [${statusBadge}]\n` +
    `\`[${progressBar}]\` *${recoveryScore} / 100*\n` +
    (snapshot.recovery?.strain !== undefined ? `• Day Strain: *${snapshot.recovery.strain} / 21*\n` : "") +
    `\n` +
    `💤 *Sleep Architecture:*\n` +
    `• Duration: *${sleepTotalStr}*${effStr}\n` +
    sleepBreakdown +
    `\n` +
    `❤️ *Cardiovascular & Autonomic Tone:*\n` +
    `• Resting Heart Rate: *${rhr ? `${rhr} bpm` : "N/A"}*\n` +
    `• HRV (${hrvMetric}): *${hrv ? `${hrv} ms` : "N/A"}* ` +
    (hrv && hrv >= 65 ? "_(High Parasympathetic)_" : hrv && hrv < 35 ? "_(Sympathetic Dominance)_" : "") +
    `\n` +
    (resp ? `• Respiration Rate: *${resp} breaths/min*\n` : "") +
    (activeCal || steps
      ? `• Active Energy: *${activeCal ? `${activeCal} kcal` : "--"}*` +
        (steps ? ` (${steps.toLocaleString()} steps)` : "") +
        `\n`
      : "") +
    `\n` +
    `📱 *Source:* \`${deviceName}\`\n` +
    `⏱️ *Last Synced:* ${syncTime}\n\n` +
    `_Biometrics are streaming into the Fabric Vitality Ledger._`
  );
}

/**
 * Returns the setup guide when no data has been received yet.
 */
export function formatSetupGuide(userId: string): string {
  const webhookUrl = `https://fabric-one-sage.vercel.app/api/webhooks/health?userId=${userId}`;

  return (
    `🧬 *FABRIC BIOMETRIC INGRESS: WEARABLES SETUP*\n\n` +
    `No wearable telemetry has been received for user \`${userId}\` yet.\n\n` +
    `Connect your smartwatch, smart ring, or fitness tracker to stream real-time Recovery, HRV, Sleep, and Resting Heart Rate directly into your Fabric Meta-OS.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 *Your Personal Webhook Endpoint:*\n` +
    `\`${webhookUrl}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⌚ *1. Apple Watch (Recommended: Health Auto Export)*\n` +
    `• Install **Health Auto Export** (iOS App Store).\n` +
    `• Open app $\\rightarrow$ *Automations* $\\rightarrow$ *Add Automation*:\n` +
    `  - Trigger: *Daily / When Waking Up*\n` +
    `  - Action: *POST JSON to Webhook*\n` +
    `  - URL: \`${webhookUrl}\`\n` +
    `  - Include: Sleep Analysis, Resting HR, Heart Rate, HRV, Respiratory Rate, Active Energy.\n` +
    `• _Alternative:_ iOS Shortcuts automation using "Find Health Samples" $\\rightarrow$ "Get Contents of URL" (POST JSON).\n\n` +
    `📿 *2. Whoop (Strap 4.0)*\n` +
    `• Configure Whoop Developer API or webhook forwarder to POST Recovery & Sleep payloads to your webhook URL.\n\n` +
    `🧭 *3. Garmin / Zepp OS (Amazfit) / Oura / Tasker*\n` +
    `• Use Zepp OS Exporter, Tasker, or Oura Cloud webhooks to POST JSON to your webhook URL.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧪 *Send a Test Packet Right Now:*\n` +
    `\`\`\`bash\n` +
    `curl -X POST "${webhookUrl}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"restingHeartRate":52,"hrv":68,"sleepHours":7.8,"deepSleepHours":1.6,"remSleepHours":1.8,"recoveryScore":88,"source":"Apple Watch"}'\n` +
    `\`\`\``
  );
}

export async function handleHealth(ctx: Context) {
  const userId = ctx.from?.id.toString() || "1131646846";

  const snapshot = await getLatestBiometrics(userId);

  if (!snapshot) {
    const keyboard = new InlineKeyboard()
      .text("🔄 Check Again", "action:refresh_health")
      .text("🥗 Vitality Protocol", "action:vitality");

    await ctx.reply(formatSetupGuide(userId), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("🔄 Refresh", "action:refresh_health")
    .text("⚙️ Setup Guide", "action:health_guide")
    .row()
    .text("🥗 Vitality Protocol", "action:vitality")
    .text("📊 Balance Radar", "action:balance");

  await ctx.reply(formatBiometricCard(snapshot), {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
