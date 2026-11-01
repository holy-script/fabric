import type { Context } from "grammy";
import { findKnowledgeItem, addReflectionToKnowledgeItem } from "../../db/firestore.js";
import { appendReflectionToNotionPage } from "../../notion/client.js";

// In-memory active reflection state per user
const activeReflectionSessions = new Map<string, { itemId: string; title: string; notionUrl?: string }>();

export function getActiveReflectionSession(userId: string) {
  return activeReflectionSessions.get(userId) || null;
}

export function clearActiveReflectionSession(userId: string) {
  activeReflectionSessions.delete(userId);
}

export async function handleReflect(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const query = ctx.message?.text?.replace(/^\/reflect\s*/i, "").trim();

  if (!query) {
    await ctx.reply(
      `🧠 *Personal Synthesis & Reflection Engine*\n\n` +
        `Usage: \`/reflect <topic, keyword, or reel name>\`\n\n` +
        `_Example:_ \`/reflect squat\` or \`/reflect mirror\`\n\n` +
        `This lets you challenge, annotate, and layer your own conclusions over any catalogued reel.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const item = await findKnowledgeItem(userId, query);

  if (!item || !item.id) {
    await ctx.reply(
      `🔍 No knowledge card found matching *"${query}"*.\n` +
        `Try searching with \`/search ${query}\` first to find the exact title or tag.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Set active session for next incoming voice or text note
  activeReflectionSessions.set(userId, {
    itemId: item.id,
    title: item.title,
    notionUrl: undefined, // Will be updated if present in checkpoint
  });

  const mediaLink = item.streamUrl
    ? `🎬 [Direct Stream Playback](${item.streamUrl})\n`
    : item.sourceUrl
    ? `🔗 [Original Instagram Reel](${item.sourceUrl})\n`
    : "";

  const currentReflection = item.userConclusions
    ? `\n🧠 *Your Previous Take:*\n_${item.userConclusions}_\n`
    : "";

  await ctx.reply(
    `🧠 *Synthesizing Over Knowledge Card:*\n` +
      `*${item.title}*\n` +
      (item.author ? `👤 Creator: @${item.author}\n` : "") +
      mediaLink +
      `\n💡 *AI Takeaway:*\n_${item.actionableTakeaway || item.content}_\n` +
      currentReflection +
      `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎙️ *What is your personal conclusion?*\n` +
      `Send a **voice memo** or **text message** now to layer your synthesis onto this card.`,
    { parse_mode: "Markdown", link_preview_options: { is_disabled: false } }
  );
}

export async function processUserReflectionNote(
  userId: string,
  noteText: string,
  audioUrl?: string
): Promise<string | null> {
  const session = activeReflectionSessions.get(userId);
  if (!session) return null;

  try {
    await addReflectionToKnowledgeItem(session.itemId, {
      text: noteText,
      audioUrl,
    });

    // Clean up session
    activeReflectionSessions.delete(userId);

    return session.title;
  } catch (err) {
    console.error("Failed to save reflection:", err);
    activeReflectionSessions.delete(userId);
    return null;
  }
}
