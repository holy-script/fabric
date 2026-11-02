import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  sendDawnBriefing,
  sendMiddayReset,
  sendTwilightSettle,
  setHeartbeatEnabled,
  getHeartbeatStatus,
  getCurrentTimeContext,
} from "../../services/heartbeat.js";
import { getActiveSession, getRecentTrades } from "../../db/firestore.js";
import { getAllDomains } from "../../domains/manager.js";
import { getGoldbeesAnalysis } from "../../services/goldbees.js";

/**
 * Handles the /heartbeat and /pulse command.
 *
 * Supported subcommands:
 * - `/heartbeat` or `/pulse`: Current-moment circadian pulse & system audit.
 * - `/heartbeat on`: Enables autonomous proactive reach-outs at anchor times.
 * - `/heartbeat off`: Disables proactive notifications.
 * - `/heartbeat dawn`: Test-fires the 08:00 AM Dawn Briefing immediately.
 * - `/heartbeat midday`: Test-fires the 14:00 PM Midday Vitality Reset immediately.
 * - `/heartbeat twilight`: Test-fires the 21:30 PM Twilight Settle immediately.
 */
export async function handleHeartbeat(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const rawText = ctx.message?.text?.replace(/^\/(?:heartbeat|pulse)\s*/i, "").trim().toLowerCase();

  // 1. Subcommand: /heartbeat on
  if (rawText === "on" || rawText === "enable" || rawText === "1" || rawText === "start") {
    await setHeartbeatEnabled(userId, true);
    await ctx.reply(
      `🟢 *Chronos Heartbeat Proactive Loop Activated*\n\n` +
        `The Fabric Meta-OS will now autonomously reach out to you on schedule:\n` +
        `• 🌅 *Dawn Briefing (08:00 AM IST):* DSA Foundry, Active Domain Intentions, GOLDBEES Market Check.\n` +
        `• ☀️ *Midday Vitality Reset (14:00 PM IST):* Posture, Hydration, CNS Flush & Sedentary Sanity Check.\n` +
        `• 🌙 *Twilight Settle (21:30 PM IST):* Trade Synthesis, Socratic Challenger & Restorative Sidequest.\n\n` +
        `_Circadian rhythm aligned with high-agency execution._`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("⚡ Current Pulse", "action:heartbeat_status")
          .text("🔔 Turn Off", "action:heartbeat_off"),
      }
    );
    return;
  }

  // 2. Subcommand: /heartbeat off
  if (rawText === "off" || rawText === "disable" || rawText === "0" || rawText === "stop") {
    await setHeartbeatEnabled(userId, false);
    await ctx.reply(
      `🔴 *Chronos Heartbeat Proactive Loop Silenced*\n\n` +
        `Autonomous notifications have been paused for this account. ` +
        `You can still manually check your pulse anytime with \`/pulse\` or test phases with \`/heartbeat dawn\`.\n\n` +
        `To re-enable, send \`/heartbeat on\`.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🟢 Turn Back On", "action:heartbeat_on"),
      }
    );
    return;
  }

  // 3. Subcommand: /heartbeat dawn
  if (rawText === "dawn" || rawText === "morning") {
    const waitMsg = await ctx.reply("🌅 *Formulating Dawn Briefing...*", {
      parse_mode: "Markdown",
    });
    try {
      await sendDawnBriefing(ctx.api as any, userId);
      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ Failed to generate Dawn Briefing: ${err.message}`
      );
    }
    return;
  }

  // 4. Subcommand: /heartbeat midday
  if (rawText === "midday" || rawText === "reset" || rawText === "noon") {
    const waitMsg = await ctx.reply("☀️ *Formulating Midday Vitality Reset...*", {
      parse_mode: "Markdown",
    });
    try {
      await sendMiddayReset(ctx.api as any, userId);
      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ Failed to generate Midday Reset: ${err.message}`
      );
    }
    return;
  }

  // 5. Subcommand: /heartbeat twilight
  if (rawText === "twilight" || rawText === "settle" || rawText === "night") {
    const waitMsg = await ctx.reply("🌙 *Synthesizing Twilight Settle & Socratic Challenge...*", {
      parse_mode: "Markdown",
    });
    try {
      await sendTwilightSettle(ctx.api as any, userId);
      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ Failed to generate Twilight Settle: ${err.message}`
      );
    }
    return;
  }

  // 6. Default: Current-moment health check & briefing
  const waitMsg = await ctx.reply("💓 *Querying Chronos Heartbeat & Circadian Telemetry...*", {
    parse_mode: "Markdown",
  });

  try {
    const [status, activeSession, recentTrades, domains, goldbees] = await Promise.all([
      getHeartbeatStatus(userId),
      getActiveSession(userId),
      getRecentTrades(userId, 20),
      getAllDomains(userId),
      getGoldbeesAnalysis().catch(() => null),
    ]);

    const { hour, formattedTime } = getCurrentTimeContext();

    // Circadian Phase classification
    let phaseEmoji = "☀️";
    let phaseLabel = "Midday High-Execution";
    if (hour >= 5 && hour < 12) {
      phaseEmoji = "🌅";
      phaseLabel = "Dawn Awakening & Strategic Prioritization";
    } else if (hour >= 12 && hour < 18) {
      phaseEmoji = "☀️";
      phaseLabel = "Midday Flow & Metabolic Vitality";
    } else if (hour >= 18 && hour < 23) {
      phaseEmoji = "🌙";
      phaseLabel = "Twilight Settle & Synthesis";
    } else {
      phaseEmoji = "🌌";
      phaseLabel = "Night Watch & Deep Regeneration";
    }

    // Active session status
    let sessionText = "_No active session running. Ready to `/spark`._";
    if (activeSession) {
      const elapsedMinutes = Math.round((Date.now() - activeSession.startedAt.getTime()) / 60000);
      const elapsedHours = (elapsedMinutes / 60).toFixed(1);
      sessionText = `⚡ *Locked:* *"${activeSession.taskDescription}"* (\`${elapsedHours}h\` active / ${elapsedMinutes}m)`;
    }

    // Today's Trades
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayTrades = recentTrades.filter(
      (t) => new Date(t.timestamp).getTime() >= startOfDay.getTime()
    );
    const todayHours = Math.round(todayTrades.reduce((sum, t) => sum + (t.focusActualHours || 0), 0) * 10) / 10;
    const netEnergy = todayTrades.reduce((sum, t) => sum + (t.energyDelta || 0), 0);
    const energySign = netEnergy > 0 ? `+${netEnergy}` : `${netEnergy}`;

    // Active domain slots
    const mountedDomains = domains.active.map((d) => `${d.icon} ${d.name}`).slice(0, 4).join(", ");

    // GOLDBEES quick snapshot
    let goldText = "N/A";
    if (goldbees) {
      const isDip = goldbees.drawdownPercent <= -3.0;
      goldText = `₹${goldbees.currentPrice} (\`${goldbees.drawdownPercent}%\` ${isDip ? "🚨 DIP" : "stable"})`;
    }

    const stateEmoji = status.enabled ? "🟢 ACTIVE" : "🔴 PAUSED";
    const toggleAction = status.enabled ? "action:heartbeat_off" : "action:heartbeat_on";
    const toggleLabel = status.enabled ? "🔕 Mute Loop" : "🔔 Activate Loop";

    const pulseMessage =
      `💓 *CHRONOS HEARTBEAT: REAL-TIME HUD*\n\n` +
      `⏱️ *Local Time:* \`${status.currentTime}\` IST\n` +
      `${phaseEmoji} *Circadian State:* *${phaseLabel}*\n` +
      `🔔 *Autonomous Loop:* *${stateEmoji}*\n` +
      `⏭️ *Next Anchor:* ${status.nextAnchor}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *SESSION STATUS:*\n` +
      `${sessionText}\n\n` +
      `📊 *TODAY'S MOMENTUM:*\n` +
      `• *Focus Logged:* \`${todayHours}h\` across \`${todayTrades.length}\` trade(s)\n` +
      `• *Net Energy Delta:* \`${energySign}\`\n` +
      `• *Mounted Domains:* _${mountedDomains}_\n` +
      `• *GOLDBEES ETF:* ${goldText}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Test any circadian phase directly using the controls below:_`;

    const keyboard = new InlineKeyboard()
      .text("🌅 Dawn", "action:heartbeat_test_dawn")
      .text("☀️ Midday", "action:heartbeat_test_midday")
      .text("🌙 Twilight", "action:heartbeat_test_twilight")
      .row()
      .text(toggleLabel, toggleAction)
      .text("⚡ Spark", "action:spark_prompt")
      .row()
      .text("🛡️ Sentinel", "action:sentinel")
      .text("📊 Balance", "action:balance");

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, pulseMessage, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    console.error("Error generating heartbeat pulse:", err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Failed to generate Chronos pulse: ${err.message}`
    );
  }
}
