import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getActiveSession, clearSession, createTrade } from "../../db/firestore.js";
import { parseTradeWithGemini } from "../../ai/gemini.js";

export async function handleSettle(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const session = await getActiveSession(userId);
  const outcomeText = ctx.message?.text?.replace(/^\/settle\s*/i, "").trim() || "";

  if (!session && !outcomeText) {
    await ctx.reply(
      `⚠️ *No Active Session Found*\n` +
        `Either start one with \`/spark <task>\` first, or log a past session with \`/log <details>\`.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Calculate actual hours if session was tracked
  let actualHours: number | undefined;
  if (session) {
    const elapsedMs = Date.now() - session.startedAt.getTime();
    actualHours = Math.max(0.1, Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10);
  }

  const statusMsg = await ctx.reply("🔄 *Refining telemetry with Gemini...*", {
    parse_mode: "Markdown",
  });

  try {
    const combinedInput = session
      ? `Task: "${session.taskDescription}". Duration: ${actualHours} hours. Outcome: ${outcomeText || "Completed"}`
      : outcomeText;

    const parsed = await parseTradeWithGemini(userId, combinedInput, session || undefined);
    if (actualHours && (!parsed.focusActualHours || parsed.focusActualHours === 1.0)) {
      parsed.focusActualHours = actualHours;
    }

    const tradeId = await createTrade(parsed);
    if (session) {
      await clearSession(userId);
    }

    const energySign = parsed.energyDelta > 0 ? `+${parsed.energyDelta}` : `${parsed.energyDelta}`;
    const energyEmoji =
      parsed.energyDelta > 2 ? "🔋 High" : parsed.energyDelta < -1 ? "🪫 Drained" : "⚖️ Stable";

    const keyboard = new InlineKeyboard()
      .text("📊 Balance", "action:balance")
      .text("🏆 Bank Win", "action:win_prompt")
      .row()
      .text("⚡ New Spark", "action:spark_prompt");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `✅ *Trade Logged to Ledger* \`#${tradeId.slice(-6)}\`\n\n` +
        `📦 *Module:* ${parsed.moduleName} (${parsed.tradeType})\n` +
        `⏳ *Focus:* ${parsed.focusActualHours}h ${
          parsed.focusExpectedHours ? `(exp: ${parsed.focusExpectedHours}h)` : ""
        }\n` +
        `💡 *Facts Yield:* ${parsed.factsYield}\n` +
        `💰 *Funds:* -$${parsed.fundsCost} / +$${parsed.fundsYield}\n` +
        `⚡ *Energy Delta:* ${energySign} (${energyEmoji})\n` +
        `🏷️ *Tags:* ${parsed.tags.map((t) => `#${t}`).join(" ")}`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } catch (error) {
    console.error("Error settling session:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to settle trade: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
