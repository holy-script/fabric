import type { Context } from "grammy";
import { handleBalance } from "../commands/balance.js";
import { handleSettle } from "../commands/settle.js";

export async function handleCallbackQuery(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  if (data === "action:balance") {
    await handleBalance(ctx);
  } else if (data === "action:settle") {
    await handleSettle(ctx);
  } else if (data === "action:spark_prompt") {
    await ctx.reply(
      `⚡ *Spark a Session:*\nSend \`/spark <task> [duration]\` or send a voice memo saying what you are starting!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:win_prompt") {
    await ctx.reply(
      `🏆 *Bank a Win:*\nSend \`/win <breakthrough>\` or voice-record your milestone!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:ask_prompt") {
    await ctx.reply(
      `❓ *Ask the Advisor:*\nSend \`/ask <question>\` or send a voice note asking for advice on trade-offs!`,
      { parse_mode: "Markdown" }
    );
  }
}
