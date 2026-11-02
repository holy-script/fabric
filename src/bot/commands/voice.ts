import type { Context } from "grammy";
import { db, getUserState } from "../../db/firestore.js";
import type { SupportedVoice } from "../../services/tts.js";

export async function handleVoiceCommand(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text?.replace(/^\/voice\s*/i, "").trim().toLowerCase();
  const state = await getUserState(userId);
  const currentVoiceMode = (state as any).voiceMode || false;
  const currentVoiceName = (state as any).voiceName || "en-US-ChristopherNeural";

  if (!text) {
    await ctx.reply(
      `🎙️ *FABRIC VOICE-TO-VOICE ENGINE*\n\n` +
        `Current Status: *${currentVoiceMode ? "ENABLED ✅ (Fabric speaks back in voice)" : "DISABLED ❌ (Text only)"}*\n` +
        `Active Voice: \`${currentVoiceName}\`\n\n` +
        `*Commands:*\n` +
        `• \`/voice on\` — Enable natural voice note responses\n` +
        `• \`/voice off\` — Disable voice responses (text only)\n` +
        `• \`/voice christopher\` — Deep, grounded, philosophical (default)\n` +
        `• \`/voice guy\` — Energetic, direct, conversational\n` +
        `• \`/voice prabhat\` — Indian English, articulate, crisp\n` +
        `• \`/voice jenny\` — Warm, natural, balanced\n\n` +
        `_When enabled, anytime you send a voice memo or check-in, Fabric replies with an expressive voice note!_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (text === "on" || text === "enable") {
    await db.collection("userState").doc(userId).set({ voiceMode: true }, { merge: true });
    await ctx.reply(`🎙️ *Voice Mode Activated!*\n\nFabric will now speak back to you with natural neural speech.`, {
      parse_mode: "Markdown",
    });
    return;
  }

  if (text === "off" || text === "disable") {
    await db.collection("userState").doc(userId).set({ voiceMode: false }, { merge: true });
    await ctx.reply(`🔇 *Voice Mode Deactivated.*\nFabric will reply in text only.`, {
      parse_mode: "Markdown",
    });
    return;
  }

  let selectedVoice: SupportedVoice | null = null;
  if (text.includes("chris")) selectedVoice = "en-US-ChristopherNeural";
  else if (text.includes("guy")) selectedVoice = "en-US-GuyNeural";
  else if (text.includes("prabhat")) selectedVoice = "en-IN-PrabhatNeural";
  else if (text.includes("jenny")) selectedVoice = "en-US-JennyNeural";

  if (selectedVoice) {
    await db.collection("userState").doc(userId).set(
      { voiceMode: true, voiceName: selectedVoice },
      { merge: true }
    );
    await ctx.reply(
      `🎙️ *Voice Updated to \`${selectedVoice}\` & Enabled!*\nFabric will now use this persona for all spoken responses.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  await ctx.reply(`Usage: \`/voice on\`, \`/voice off\`, or \`/voice <christopher|guy|prabhat|jenny>\``);
}
