import type { Context } from "grammy";
import fs from "fs";
import path from "path";
import { getActiveSession, createTrade } from "../../db/firestore.js";
import { parseTradeWithGemini } from "../../ai/gemini.js";
import { findMediaUrl } from "../../media/extractor.js";
import { handleMediaUrl } from "./media.js";
import { processUserReflectionNote } from "../commands/reflect.js";

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
  const reflectionCardTitle = await processUserReflectionNote(userId, text);
  if (reflectionCardTitle) {
    await ctx.reply(
      `🧠 *Personal Synthesis Attached!*\n\n` +
        `*Card:* ${reflectionCardTitle}\n\n` +
        `*Your Conclusion:*\n"${text}"\n\n` +
        `_Saved to Firestore and synced to Notion Knowledge Garden!_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Check if message contains an Instagram Reel/Post or YouTube link
  const mediaDetection = findMediaUrl(text);
  if (mediaDetection) {
    return handleMediaUrl(ctx, mediaDetection.url);
  }

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

