import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { runSentinelAudit } from "../../ai/sentinel.js";

export async function handleSentinel(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text || "";
  const sub = text.replace(/^\/(sentinel|audit)\s*/i, "").trim().toLowerCase();
  if (sub === "reflect" || sub === "reflexion") {
    const { handleReflexion } = await import("./reflect.js");
    return handleReflexion(ctx);
  }

  const statusMsg = await ctx.reply(
    "🛡️ *Sentinel Recon: Ingesting 4F telemetry & auditing cognitive equilibrium...*",
    { parse_mode: "Markdown" }
  );

  try {
    const report = await runSentinelAudit(userId);

    const keyboard = new InlineKeyboard();

    if (report.recommendation && report.recommendation.needed) {
      keyboard.text(
        "⚡ Apply Recommended Swap",
        `swap_plugin:${report.recommendation.targetPluginId}`
      ).row();
    }

    keyboard
      .text("🔄 Re-Run Recon", "action:sentinel")
      .text("🧠 Episodic Reflexion", "action:reflexion")
      .row()
      .text("📊 Balance", "action:balance")
      .text("🧩 View Plugins", "action:plugins");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      report.markdownReport,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    console.error("Sentinel audit execution error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ *Sentinel Audit Failed:*\n${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      { parse_mode: "Markdown" }
    );
  }
}
