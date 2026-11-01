import type { Context } from "grammy";
import { getKnowledgeItems, getRecentTrades } from "../../db/firestore.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

export async function handleWins(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const wins = await getKnowledgeItems(userId, "win", 6);

  if (wins.length === 0) {
    await ctx.reply(
      `🏆 *The Hopecore Vault is Empty*\n` +
        `Bank your first triumph with \`/win <milestone>\` or send a voice memo!`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = wins
    .map(
      (w, i) =>
        `*${i + 1}. ${w.title}*\n` +
        `📝 ${w.content}\n` +
        (w.actionableTakeaway ? `💡 _Takeaway:_ ${w.actionableTakeaway}\n` : "") +
        `🏷️ ${w.tags.map((t) => `#${t}`).join(" ")}`
    )
    .join("\n\n");

  await ctx.reply(`🏆 *The Hopecore Vault (Recent Wins)*\n\n${list}`, {
    parse_mode: "Markdown",
  });
}

export async function handleGotchas(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const gotchas = await getKnowledgeItems(userId, "gotcha", 6);

  if (gotchas.length === 0) {
    await ctx.reply(
      `⚠️ *No Gotchas Recorded*\n` +
        `Document pitfalls and hard-learned traps with \`/gotcha <bug or lesson>\`.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = gotchas
    .map(
      (g, i) =>
        `*${i + 1}. ${g.title}*\n` +
        `🪤 ${g.content}\n` +
        (g.actionableTakeaway ? `🛡️ _Heuristic:_ ${g.actionableTakeaway}\n` : "") +
        `🏷️ ${g.tags.map((t) => `#${t}`).join(" ")}`
    )
    .join("\n\n");

  await ctx.reply(`⚠️ *Knowledge Garden: Documented Traps*\n\n${list}`, {
    parse_mode: "Markdown",
  });
}

export async function handleSearch(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const query = ctx.message?.text?.replace(/^\/search\s*/i, "").trim();
  if (!query) {
    await ctx.reply(
      `🔍 *Search Knowledge Garden*\nUsage: \`/search <topic or keyword>\`\n\n_Example: \`/search firestore batch\` or \`/search plyometrics\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply(`🔍 *Searching vault for "${query}"...*`, {
    parse_mode: "Markdown",
  });

  try {
    const allKnowledge = await getKnowledgeItems(userId, undefined, 30);
    const recentTrades = await getRecentTrades(userId, 20);

    const vaultData = {
      knowledge: allKnowledge.map((k) => ({
        category: k.category,
        title: k.title,
        content: k.content,
        takeaway: k.actionableTakeaway,
        tags: k.tags,
      })),
      trades: recentTrades.map((t) => ({
        module: t.moduleName,
        yield: t.factsYield,
        tags: t.tags,
      })),
    };

    const prompt = `
You are the Knowledge Garden Search Engine for "The Fabric".
The user is searching for: "${query}"

Here is their personal knowledge vault and trade history:
${JSON.stringify(vaultData, null, 2)}

Synthesize the most relevant matches. Format as:
🔍 *Search Results for "${query}"*
- Found items with category [Win/Gotcha/Trade]
- Key actionable takeaways and patterns

If nothing is relevant, say so directly and offer a heuristic. Keep it concise.
`;

    const response = await model.generateContent(prompt);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      response.response.text(),
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Search error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Search failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

