import type { Context } from "grammy";
import { findKnowledgeItem, addReflectionToKnowledgeItem } from "../../db/firestore.js";
import { appendReflectionToNotionPage } from "../../notion/client.js";

export interface ReflectionSession {
  itemId: string;
  title: string;
  notionUrl?: string;
  takeaway?: string;
}

export interface ProcessedReflectionNote {
  title: string;
  itemId: string;
  takeaway?: string;
  notionUrl?: string;
}

// In-memory active reflection state per user
const activeReflectionSessions = new Map<string, ReflectionSession>();

export function setActiveReflectionSession(
  userId: string,
  session: ReflectionSession
) {
  activeReflectionSessions.set(userId, session);
}

export function getActiveReflectionSession(userId: string): ReflectionSession | null {
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
    notionUrl: item.notionUrl,
    takeaway: item.actionableTakeaway || item.content,
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
): Promise<ProcessedReflectionNote | null> {
  const session = activeReflectionSessions.get(userId);
  if (!session) return null;

  try {
    // 1. Log reflection to Firestore
    await addReflectionToKnowledgeItem(session.itemId, {
      text: noteText,
      audioUrl,
    });

    // 2. Log reflection to Notion if configured & target exists
    let notionTarget = session.notionUrl;
    if (!notionTarget) {
      const item = await findKnowledgeItem(userId, session.itemId);
      if (item) {
        notionTarget = item.notionUrl || item.notionPageId;
      }
    }

    if (notionTarget) {
      try {
        await appendReflectionToNotionPage(notionTarget, noteText);
      } catch (notionErr) {
        console.warn("Could not append reflection to Notion page:", notionErr);
      }
    }

    // Clean up session
    activeReflectionSessions.delete(userId);

    return {
      title: session.title,
      itemId: session.itemId,
      takeaway: session.takeaway,
      notionUrl: notionTarget,
    };
  } catch (err) {
    console.error("Failed to save reflection:", err);
    activeReflectionSessions.delete(userId);
    return null;
  }
}
