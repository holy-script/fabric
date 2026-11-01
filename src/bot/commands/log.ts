import type { Context } from "grammy";
import { parseTradeWithGemini } from "../../ai/gemini.js";
import { createTrade } from "../../db/firestore.js";

export async function handleLog(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text?.replace(/^\/log\s*/i, "").trim();

  if (!text) {
    await ctx.reply(
      `📝 *Quick Log a Trade*\n` +
        `Usage: \`/log <natural language text>\`\n\n` +
        `_Example: \`/log spent 2h doing jump squats & plyometrics, energy +4, cost 0, felt explosive\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply("🔄 *Extracting 4F telemetry...*", {
    parse_mode: "Markdown",
  });

  try {
    const parsed = await parseTradeWithGemini(userId, text);
    const tradeId = await createTrade(parsed);

    const energySign = parsed.energyDelta > 0 ? `+${parsed.energyDelta}` : `${parsed.energyDelta}`;

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `✅ *Trade Recorded* \`#${tradeId.slice(-6)}\`\n\n` +
        `📦 *Module:* ${parsed.moduleName} (${parsed.tradeType})\n` +
        `⏳ *Focus:* ${parsed.focusActualHours}h\n` +
        `💡 *Facts Yield:* ${parsed.factsYield}\n` +
        `💰 *Funds:* -$${parsed.fundsCost} / +$${parsed.fundsYield}\n` +
        `⚡ *Energy Delta:* ${energySign}\n` +
        `🏷️ ${parsed.tags.map((t) => `#${t}`).join(" ")}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error logging trade:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to log: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

