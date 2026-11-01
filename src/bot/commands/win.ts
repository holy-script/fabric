import type { Context } from "grammy";
import { parseKnowledgeWithGemini } from "../../ai/gemini.js";
import { createKnowledgeItem } from "../../db/firestore.js";

export async function handleWin(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text?.replace(/^\/win\s*/i, "").trim();

  if (!text) {
    await ctx.reply(
      `🏆 *Bank a Win (Hopecore)*\n` +
        `Usage: \`/win <breakthrough, milestone, or victory>\`\n\n` +
        `_Example: \`/win Deployed the Cloudflare worker and response latency dropped to 18ms\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply("🌱 *Cataloguing triumph into Knowledge Garden...*", {
    parse_mode: "Markdown",
  });

  try {
    const parsed = await parseKnowledgeWithGemini(userId, "win", text);
    const id = await createKnowledgeItem(parsed);

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `🏆 *Win Banked* \`#${id.slice(-6)}\`\n\n` +
        `📌 *Title:* ${parsed.title}\n` +
        `📝 *Content:* ${parsed.content}\n` +
        (parsed.actionableTakeaway ? `💡 *Takeaway:* ${parsed.actionableTakeaway}\n` : "") +
        `🏷️ ${parsed.tags.map((t) => `#${t}`).join(" ")}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error banking win:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to bank win: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function handleGotcha(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text?.replace(/^\/gotcha\s*/i, "").trim();

  if (!text) {
    await ctx.reply(
      `⚠️ *Record a Gotcha / Pitfall*\n` +
        `Usage: \`/gotcha <bug, trap, or hard lesson>\`\n\n` +
        `_Example: \`/gotcha Firestore batch writes fail if exceeding 500 operations in a single commit\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply("🛡️ *Cataloguing gotcha into Knowledge Garden...*", {
    parse_mode: "Markdown",
  });

  try {
    const parsed = await parseKnowledgeWithGemini(userId, "gotcha", text);
    const id = await createKnowledgeItem(parsed);

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `⚠️ *Gotcha Documented* \`#${id.slice(-6)}\`\n\n` +
        `📌 *Title:* ${parsed.title}\n` +
        `📝 *Trap:* ${parsed.content}\n` +
        (parsed.actionableTakeaway ? `🛡️ *Heuristic:* ${parsed.actionableTakeaway}\n` : "") +
        `🏷️ ${parsed.tags.map((t) => `#${t}`).join(" ")}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error logging gotcha:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to log gotcha: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

