import type { Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import fs from "fs";
import path from "path";
import { getActiveSession, createTrade, setVaultChannelId, getUserState } from "../../db/firestore.js";
import { parseTradeWithGemini } from "../../ai/gemini.js";
import { generateSocraticChallenge } from "../../ai/challenger.js";
import { findMediaUrl } from "../../media/extractor.js";
import { handleMediaUrl } from "./media.js";
import { extractGoogleAiModeShare } from "../../services/sharegoogle.js";
import { processUserReflectionNote } from "../commands/reflect.js";
import { classifyMessageIntent, answerConversationalQuery } from "../../ai/conversation.js";
import { generateSpeechAudio } from "../../services/tts.js";

const ENV_PATH = path.resolve(process.cwd(), ".env");

export async function handleNaturalMessage(ctx: Context) {
  const userId = ctx.from?.id.toString();
  const text = ctx.message?.text;
  if (!userId || !text) return;

  // Ignore commands
  if (text.startsWith("/")) return;

  // 1. Check if message was forwarded from a channel (Auto Vault Channel Connect)
  const forwardOrigin = (ctx.message as any)?.forward_origin;
  const forwardFromChat = (ctx.message as any)?.forward_from_chat;
  const channelChat = forwardFromChat || (forwardOrigin?.type === "channel" ? forwardOrigin.chat : null);

  if (channelChat && (channelChat.type === "channel" || channelChat.id < 0)) {
    const channelId = channelChat.id.toString();
    process.env.TELEGRAM_VAULT_CHANNEL_ID = channelId;

    await setVaultChannelId(channelId, userId);

    if (fs.existsSync(ENV_PATH)) {
      let content = fs.readFileSync(ENV_PATH, "utf-8");
      if (content.includes("TELEGRAM_VAULT_CHANNEL_ID=")) {
        content = content.replace(/TELEGRAM_VAULT_CHANNEL_ID=.*/, `TELEGRAM_VAULT_CHANNEL_ID=${channelId}`);
      } else {
        content += `\nTELEGRAM_VAULT_CHANNEL_ID=${channelId}\n`;
      }
      fs.writeFileSync(ENV_PATH, content, "utf-8");
    }

    await ctx.reply(
      `🎬 *Private Channel Vault Connected!*\n\n` +
        `Channel: *${channelChat.title || "Private Vault"}*\n` +
        `Channel ID: \`${channelId}\`\n\n` +
        `✅ Your video archive will now stream full \`.mp4\` videos directly into this channel!`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // 2. Check if user is actively reflecting on a knowledge card
  const reflectionResult = await processUserReflectionNote(userId, text);
  if (reflectionResult) {
    const challenge = await generateSocraticChallenge(
      reflectionResult.title,
      text,
      reflectionResult.takeaway
    );

    const keyboard = new InlineKeyboard().text(
      "🎙️ Defend / Deepen Verdict",
      `defend:${reflectionResult.itemId}`
    );

    const replyContent =
      `🧠 *Personal Synthesis Attached!*\n\n` +
      `*Card:* ${reflectionResult.title}\n` +
      `*Your Conclusion:* "${text}"\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⚔️ *Socratic Challenger:*\n` +
      `"${challenge.challenge}"\n\n` +
      `❓ *Stress-Test:*\n` +
      `"${challenge.provocativeQuestion}"`;

    try {
      await ctx.reply(replyContent, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch {
      await ctx.reply(replyContent.replace(/[*_`]/g, ""), {
        reply_markup: keyboard,
      });
    }
    return;
  }

  // 3. Check if message contains an Instagram Reel/Post or YouTube link
  const mediaDetection = findMediaUrl(text);
  if (mediaDetection) {
    return handleMediaUrl(ctx, mediaDetection.url);
  }

  // 3b. Check if message contains a Google AI Mode Shared Link (share.google/aimode/...)
  const aiModeMatch = text.match(/https?:\/\/share\.google\/aimode\/[a-zA-Z0-9_-]+/);
  if (aiModeMatch) {
    const shareUrl = aiModeMatch[0];
    const waitMsg = await ctx.reply("🌐 *Decoding Google AI Mode Blueprint...*", { parse_mode: "Markdown" });
    try {
      const decoded = await extractGoogleAiModeShare(shareUrl);
      if (decoded && decoded.sourceFilePath) {
        await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
        await ctx.replyWithDocument(new InputFile(decoded.sourceFilePath, path.basename(decoded.sourceFilePath)), {
          caption:
            `🌐 *Google AI Mode Synthesis Extracted!*\n\n` +
            `🎯 *Prompt:* _"${decoded.prompt.slice(0, 100)}${decoded.prompt.length > 100 ? "..." : ""}"_\n\n` +
            `📦 The complete multi-phase plan, milestones, and audio overview prompt have been packaged into this Markdown source document for NotebookLM.\n\n` +
            `Tap below to import directly into Google NotebookLM:`,
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().url("🎙️ Open Google NotebookLM", "https://notebooklm.google.com"),
        });
        return;
      }
    } catch (e) {
      console.warn("Failed to decode AI Mode share:", e);
    }
  }

  // Check if there is an active session
  const session = await getActiveSession(userId);

  // 4. Intent Classification: Trade Logging vs Generic Conversation / Knowledge Query
  const intent = await classifyMessageIntent(text, Boolean(session));

  if (intent === "trade") {
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
      // Fallback to conversation if trade parsing fails
      const turn = await answerConversationalQuery(userId, text);
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, turn.text, {
        parse_mode: "Markdown",
      });
    }
    return;
  }

  // 5. Generic Conversation Turn (Chat, Ideas, Knowledge Base Search, Live Web Grounding)
  const statusMsg = await ctx.reply("⚡ *Consulting Fabric Knowledge Base & Web...*", {
    parse_mode: "Markdown",
  });

  try {
    const [turn, userState] = await Promise.all([
      answerConversationalQuery(userId, text),
      getUserState(userId),
    ]);

    let responseMarkdown = turn.text;

    // Attach citations if relevant
    if (turn.citedNodes.length > 0) {
      const topReel = turn.citedNodes.find((n) => n.url);
      if (topReel && topReel.url) {
        responseMarkdown += `\n\n🎬 *Vault Reference:* [${topReel.title}](${topReel.url})`;
      }
    }

    try {
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, responseMarkdown, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        responseMarkdown.replace(/[*_`]/g, "")
      );
    }

    // Voice Response if Voice Mode is active
    if ((userState as any)?.voiceMode) {
      try {
        const audioPath = await generateSpeechAudio(
          turn.text.slice(0, 800),
          (userState as any)?.voiceName
        );
        await ctx.replyWithVoice(new InputFile(audioPath));
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (vErr) {
        console.warn("Could not send voice response:", vErr);
      }
    }
  } catch (convErr) {
    console.error("Conversation processing error:", convErr);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Could not process conversation: ${convErr instanceof Error ? convErr.message : "Unknown error"}`
    );
  }
}

