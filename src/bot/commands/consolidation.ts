import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  runNightlyConsolidation,
  getLatestConsolidation,
} from "../../ai/consolidation.js";

/**
 * Telegram Command Handler for /consolidate
 *
 * Runs the nocturnal consolidation & dream loop, inducing new axioms,
 * synthesizing graph synapses, and presenting the Morning Briefing Memo.
 */
export async function handleConsolidate(ctx: Context): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text || "";
  const query = text.replace(/^\/consolidate\s*/i, "").trim().toLowerCase();

  // If user asked specifically for the cached brief/memo
  if (query === "brief" || query === "memo" || query === "latest") {
    const latest = await getLatestConsolidation();
    if (latest) {
      const keyboard = new InlineKeyboard()
        .text("⚡ Spark Morning Sprint", "action:spark_prompt")
        .text("📊 4F Telemetry", "action:balance")
        .row()
        .text("🔄 Re-Run Consolidation", "action:consolidate_rerun")
        .text("🕸️ Knowledge Garden", "action:garden");

      if (latest.morningBriefing.recommendedWarmupTrack?.youtubeUrl) {
        keyboard.row().url(
          `🎧 Play: ${latest.morningBriefing.recommendedWarmupTrack.title}`,
          latest.morningBriefing.recommendedWarmupTrack.youtubeUrl
        );
      }

      try {
        await ctx.reply(latest.morningBriefing.telegramMarkdown, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch {
        await ctx.reply(latest.morningBriefing.telegramMarkdown, {
          reply_markup: keyboard,
        });
      }
      return;
    }
  }

  // Otherwise, run full Nightly Consolidation
  const statusMsg = await ctx.reply(
    "🌙 *Initiating Nightly Dream Loop...*\n" +
      "• Aggregating ambient telemetry, git commits & focus sessions\n" +
      "• Calculating Aristotelian 4F Delta & cybernetic loss reduction\n" +
      "• Inducing high-order axioms & linking knowledge synapses...",
    { parse_mode: "Markdown" }
  );

  try {
    const result = await runNightlyConsolidation({ userId });

    const keyboard = new InlineKeyboard()
      .text("⚡ Spark Morning Sprint", "action:spark_prompt")
      .text("📊 4F Telemetry", "action:balance")
      .row()
      .text("🧠 Episodic Reflexion", "action:reflexion")
      .text("🕸️ Knowledge Garden", "action:garden");

    if (result.morningBriefing.recommendedWarmupTrack?.youtubeUrl) {
      keyboard.row().url(
        `🎧 Play Warmup: ${result.morningBriefing.recommendedWarmupTrack.title}`,
        result.morningBriefing.recommendedWarmupTrack.youtubeUrl
      );
    }

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        result.morningBriefing.telegramMarkdown,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        result.morningBriefing.telegramMarkdown,
        { reply_markup: keyboard }
      );
    }
  } catch (error: any) {
    console.error("Nightly consolidation error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ *Nightly Consolidation Failed:*\n${error?.message || "Unknown error occurred"}`,
      { parse_mode: "Markdown" }
    );
  }
}
