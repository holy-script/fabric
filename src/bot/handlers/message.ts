import type { Context } from "grammy";
import { getActiveSession, createTrade } from "../../db/firestore.js";
import { parseTradeWithGemini } from "../../ai/gemini.js";

export async function handleNaturalMessage(ctx: Context) {
  const userId = ctx.from?.id.toString();
  const text = ctx.message?.text;
  if (!userId || !text) return;

  // Ignore commands
  if (text.startsWith("/")) return;

  // Check if there is an active session
  const session = await getActiveSession(userId);

  const statusMsg = await ctx.reply("🧠 *Parsing via Fabric telemetry...*", {
    parse_mode: "Markdown",
  });

  try {
    const parsed = await parseTradeWithGemini(userId, text, session || undefined);
    const tradeId = await createTrade(parsed);

    const energySign = parsed.energyDelta > 0 ? `+${parsed.energyDelta}` : `${parsed.energyDelta}`;

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `✅ *Trade Ingested* \`#${tradeId.slice(-6)}\`\n\n` +
        `📦 *Module:* ${parsed.moduleName} (${parsed.tradeType})\n` +
        `⏳ *Focus:* ${parsed.focusActualHours}h\n` +
        `💡 *Facts Yield:* ${parsed.factsYield}\n` +
        `💰 *Funds:* -$${parsed.fundsCost} / +$${parsed.fundsYield}\n` +
        `⚡ *Energy Delta:* ${energySign}\n` +
        `🏷️ ${parsed.tags.map((t) => `#${t}`).join(" ")}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Natural message processing error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `I couldn't parse that as a trade. Try sending \`/ask ${text}\` if it was a question, or use \`/log <details>\`.`
    );
  }
}

