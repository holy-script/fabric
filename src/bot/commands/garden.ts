import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getKnowledgeItems, getRecentTrades, knowledgeCollection } from "../../db/firestore.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

export async function handleGarden(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const items = await getKnowledgeItems(userId, undefined, 8);

  let reelsText = "";
  try {
    const fs = await import("fs");
    const path = await import("path");
    const trackerPath = path.resolve(process.cwd(), "reels_tracker.json");
    if (fs.existsSync(trackerPath)) {
      const data = JSON.parse(fs.readFileSync(trackerPath, "utf-8"));
      reelsText = `\n📱 *Reels Ingestion:* \`${data.processed || 0} / ${data.total || 3843}\` (${data.percent || "0%"}) | Notion: \`${data.notionSynced || 0}\`\n`;
    }
  } catch {}

  if (items.length === 0) {
    await ctx.reply(
      `🪴 *The Knowledge Garden is Empty*\n\n` +
        `Send a link to an Instagram Reel, YouTube video, or use \`/win\` and \`/gotcha\` to seed your garden!`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = items
    .slice(0, 5)
    .map((it, idx) => {
      const icon =
        it.category === "win"
          ? "🏆"
          : it.category === "gotcha"
          ? "⚠️"
          : it.category === "tool"
          ? "🛠️"
          : "💡";
      return (
        `*${idx + 1}. ${icon} ${it.title}*\n` +
        (it.author ? `👤 _@${it.author}_\n` : "") +
        (it.actionableTakeaway ? `💡 _Takeaway:_ ${it.actionableTakeaway}\n` : "") +
        `🏷️ ${it.tags.map((t) => `#${t}`).join(" ")}`
      );
    })
    .join("\n\n");

  await ctx.reply(
    `🪴 *The Fabric OS: Knowledge Garden*${reelsText}\n` +
      `*Recent Additions:*\n\n${list}\n\n` +
      `_Use \`/search <keyword>\` to search vault or \`/muse\` for random wisdom._`,
    { parse_mode: "Markdown" }
  );
}

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
      `🔍 *Search Knowledge Garden*\nUsage: \`/search <topic or keyword>\`\n\n_Example: \`/search dopamine\` or \`/search plyometrics\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply(`🔍 *Searching 3,843-card vault for "${query}"...*`, {
    parse_mode: "Markdown",
  });

  try {
    const cleanQ = query.toLowerCase();
    const matchedDocs: Array<{ id: string; data: any }> = [];

    // 1. Tag-based query (direct O(1) indexed lookup)
    try {
      const tagSnap = await knowledgeCollection
        .where("userId", "==", userId)
        .where("tags", "array-contains", cleanQ)
        .limit(8)
        .get();
      for (const d of tagSnap.docs) {
        matchedDocs.push({ id: d.id, data: d.data() });
      }
    } catch {}

    // 2. Keyword scan across recent items if tag lookup yielded few results
    if (matchedDocs.length < 5) {
      const broadSnap = await knowledgeCollection
        .where("userId", "==", userId)
        .limit(100)
        .get();

      for (const d of broadSnap.docs) {
        if (matchedDocs.some((m) => m.id === d.id)) continue;
        const data = d.data();
        const titleMatch = data.title?.toLowerCase().includes(cleanQ);
        const takeawayMatch = data.actionableTakeaway?.toLowerCase().includes(cleanQ);
        const authorMatch = data.author?.toLowerCase().includes(cleanQ);
        if (titleMatch || takeawayMatch || authorMatch) {
          matchedDocs.push({ id: d.id, data });
          if (matchedDocs.length >= 6) break;
        }
      }
    }

    if (matchedDocs.length > 0) {
      const keyboard = new InlineKeyboard();
      let text = `🔍 *Vault Matches for "${query}":*\n\n`;

      matchedDocs.slice(0, 5).forEach((item, idx) => {
        const d = item.data;
        const icon = d.category === "win" ? "🏆" : d.category === "gotcha" ? "⚠️" : "🎬";
        const streamLink = d.streamUrl ? `\n   📱 [Play in Telegram Vault](${d.streamUrl})` : "";
        const author = d.author ? ` _(@${d.author})_` : "";
        const verdict = d.userConclusions ? `\n   🧠 *Your Verdict:* _${d.userConclusions}_` : "";

        text += `*${idx + 1}. ${icon} ${d.title}*${author}${streamLink}\n`;
        text += `   💡 _Takeaway:_ ${d.actionableTakeaway || d.content}\n${verdict}\n\n`;

        keyboard.text(`🎙️ Reflect on #${idx + 1}`, `reflect:${item.id}`);
        if ((idx + 1) % 2 === 0) keyboard.row();
      });

      text += `_Tap a button below to attach your personal verdict/synthesis to any reel._`;

      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    }

    // 3. Fallback AI synthesis if no direct substring match
    const allKnowledge = await getKnowledgeItems(userId, undefined, 20);
    const vaultData = {
      knowledge: allKnowledge.map((k) => ({
        title: k.title,
        takeaway: k.actionableTakeaway,
        tags: k.tags,
      })),
    };

    const prompt = `
You are the Knowledge Garden Search Engine for "The Fabric".
The user searched for: "${query}"
Vault sample:
${JSON.stringify(vaultData, null, 2)}

Provide a concise heuristic answer synthesizing relevant principles. Keep it under 150 words.
`;

    const response = await model.generateContent(prompt);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `🔍 *No exact reel title matches "${query}".*\n\n💡 *Synthesized Heuristic:*\n${response.response.text()}`,
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

