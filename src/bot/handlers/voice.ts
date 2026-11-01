import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { config } from "../../config/env.js";
import { parseVoiceWithGemini, askAdvisor } from "../../ai/gemini.js";
import { generateSocraticChallenge } from "../../ai/challenger.js";
import {
  createTrade,
  createKnowledgeItem,
  getUserState,
  getRecentTrades,
} from "../../db/firestore.js";
import { processUserReflectionNote } from "../commands/reflect.js";

export async function handleVoiceMessage(ctx: Context) {
  const userId = ctx.from?.id.toString();
  const voice = ctx.message?.voice;
  if (!userId || !voice) return;

  const statusMsg = await ctx.reply("🎙️ *Transcribing & digesting audio memo...*", {
    parse_mode: "Markdown",
  });

  try {
    // 1. Get file metadata from Telegram
    const file = await ctx.getFile();
    if (!file.file_path) {
      throw new Error("Could not retrieve file path from Telegram.");
    }

    // 2. Download audio bytes from Telegram Bot API CDN
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download voice file: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    // 3. Multimodal ingestion via Gemini Flash
    const mimeType = voice.mime_type || "audio/ogg";
    const result = await parseVoiceWithGemini(userId, base64Audio, mimeType);

    // Check if user is actively reflecting on a knowledge card
    const reflectionText = result.transcript || result.trade?.notes || "";
    const reflectionResult = await processUserReflectionNote(userId, reflectionText);
    if (reflectionResult) {
      const challenge = await generateSocraticChallenge(
        reflectionResult.title,
        reflectionText,
        reflectionResult.takeaway
      );

      const keyboard = new InlineKeyboard().text(
        "🎙️ Defend / Deepen Verdict",
        `defend:${reflectionResult.itemId}`
      );

      const replyContent =
        `🧠 *Personal Synthesis Attached!*\n\n` +
        `*Card:* ${reflectionResult.title}\n` +
        `*Your Conclusion:* "${reflectionText}"\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚔️ *Socratic Challenger:*\n` +
        `"${challenge.challenge}"\n\n` +
        `❓ *Stress-Test:*\n` +
        `"${challenge.provocativeQuestion}"`;

      try {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          replyContent,
          { parse_mode: "Markdown", reply_markup: keyboard }
        );
      } catch {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          replyContent.replace(/[*_`]/g, ""),
          { reply_markup: keyboard }
        );
      }
      return;
    }

    // 4. Act according to extracted intent
    if (result.intent === "trade" && result.trade) {
      const tradeId = await createTrade(result.trade);
      const energySign =
        result.trade.energyDelta > 0
          ? `+${result.trade.energyDelta}`
          : `${result.trade.energyDelta}`;

      const keyboard = new InlineKeyboard()
        .text("📊 Balance", "action:balance")
        .text("🏆 Bank Win", "action:win_prompt")
        .row()
        .text("❓ Ask Advisor", "action:ask_prompt");

      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `🎙️ *Voice Transcribed:*\n_${result.transcript}_\n\n` +
          `✅ *Trade Ingested* \`#${tradeId.slice(-6)}\`\n` +
          `📦 *Module:* ${result.trade.moduleName} (${result.trade.tradeType})\n` +
          `⏳ *Focus:* ${result.trade.focusActualHours}h\n` +
          `💡 *Yield:* ${result.trade.factsYield}\n` +
          `⚡ *Energy:* ${energySign}\n` +
          `🏷️ ${result.trade.tags.map((t) => `#${t}`).join(" ")}`,
        { parse_mode: "Markdown", reply_markup: keyboard }
      );
    } else if (result.intent === "win" && result.knowledge) {
      const id = await createKnowledgeItem(result.knowledge);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `🎙️ *Voice Transcribed:*\n_${result.transcript}_\n\n` +
          `🏆 *Win Banked into Knowledge Garden* \`#${id.slice(-6)}\`\n` +
          `📌 *${result.knowledge.title}*\n` +
          (result.knowledge.actionableTakeaway
            ? `💡 *Takeaway:* ${result.knowledge.actionableTakeaway}\n`
            : "") +
          `🏷️ ${result.knowledge.tags.map((t) => `#${t}`).join(" ")}`,
        { parse_mode: "Markdown" }
      );
    } else if (result.intent === "gotcha" && result.knowledge) {
      const id = await createKnowledgeItem(result.knowledge);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `🎙️ *Voice Transcribed:*\n_${result.transcript}_\n\n` +
          `⚠️ *Gotcha Documented* \`#${id.slice(-6)}\`\n` +
          `📌 *${result.knowledge.title}*\n` +
          (result.knowledge.actionableTakeaway
            ? `🛡️ *Heuristic:* ${result.knowledge.actionableTakeaway}\n`
            : "") +
          `🏷️ ${result.knowledge.tags.map((t) => `#${t}`).join(" ")}`,
        { parse_mode: "Markdown" }
      );
    } else if (result.intent === "question" || result.question) {
      const query = result.question || result.transcript;
      const state = await getUserState(userId);
      const recent = await getRecentTrades(userId, 5);
      const answer = await askAdvisor(query, state, recent);

      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `🎙️ *Voice Question:*\n_${result.transcript}_\n\n${answer}`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `🎙️ *Transcribed:*\n_${result.transcript}_\n\n` +
          `_Processed memo. Use \`/log\`, \`/win\`, or \`/ask\` to categorize specifically._`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error("Voice processing error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to process voice memo: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

