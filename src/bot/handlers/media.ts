import type { Context } from "grammy";
import { createKnowledgeItem } from "../../db/firestore.js";
import { isNotionConfigured, syncKnowledgeItemToNotion } from "../../notion/client.js";
import { extractMediaInsight } from "../../media/extractor.js";

/**
 * Handles incoming Instagram Reel / YouTube links sent in chat.
 * Digests the content using Gemini Flash, catalogues to Firestore,
 * syncs to Notion (if configured), and updates the Telegram message.
 */
export async function handleMediaUrl(ctx: Context, url: string) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const statusMsg = await ctx.reply("📱 *Digesting media link with Gemini...*", {
    parse_mode: "Markdown",
  });

  try {
    // 1. Extract insights via Gemini Flash & oEmbed/yt-dlp
    const insight = await extractMediaInsight(url, userId);

    // 2. Save KnowledgeItem to Firestore
    const itemId = await createKnowledgeItem(insight);

    // 3. Auto-sync to Notion if configured
    let notionLink = "";
    if (isNotionConfigured()) {
      try {
        const notionRes = await syncKnowledgeItemToNotion({
          ...insight,
          id: itemId,
        });
        notionLink = `\n📓 [Open in Notion](${notionRes.url})`;
      } catch (err) {
        console.warn("Async Notion sync notice:", err);
      }
    }

    // 4. Construct Telegram Media Card response
    const tagsFormatted = insight.tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    const insightsFormatted = insight.keyInsights.map((k) => `• ${k}`).join("\n");
    const authorLine = insight.author ? `👤 *Author:* ${insight.author}\n` : "";

    const cardMessage =
      `📱 *Ingested Media Card* \`#${itemId.slice(-6)}\`\n\n` +
      `📌 *Title:* ${insight.title}\n` +
      authorLine +
      `🔗 [Source Media](${url})\n\n` +
      `📝 *Key Insights:*\n${insightsFormatted}\n\n` +
      `💡 *Actionable Takeaway:*\n${insight.actionableTakeaway}\n\n` +
      `🏷️ ${tagsFormatted}` +
      notionLink;

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        cardMessage,
        { parse_mode: "Markdown" }
      );
    } catch (mdErr) {
      // Fallback in case raw characters trigger a markdown parse error
      console.warn("Markdown render error in media card, using plain fallback:", mdErr);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        cardMessage.replace(/[*_`]/g, "")
      );
    }
  } catch (error) {
    console.error("Media digestion error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ *Failed to digest media:*\n${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
