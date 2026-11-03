/**
 * Fabric OS — Telegram Bot Music & Sonic Mind Command Handlers
 * Allows operator to capture songs with deep personal context,
 * generate dynamic AI mixes, and query playlists for NewPipe.
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  extractMetadata,
  extractYoutubeId,
  createDefaultSong,
} from "../../music/extractor.js";
import {
  saveSong,
  getSong,
  listSongs,
  listPlaylists,
  addSongToPlaylist,
  updateSongContext,
} from "../../music/store.js";
import { generateDynamicMix } from "../../music/mixer.js";

/**
 * Handles `/song <url> [personal context/note]`
 */
export async function handleSongCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.replace(/^\/song\s*/i, "").trim() || "";

  if (!text) {
    await ctx.reply(
      `🎵 *Fabric Sonic Mind — Song Capture*\n\n` +
        `Save YouTube gems with personal context for your custom NewPipe.\n\n` +
        `*Usage:*\n` +
        `\`/song <youtube_url> [why this song matters / memory / tags]\`\n\n` +
        `*Example:*\n` +
        `\`/song https://youtu.be/XYZ Tokyo 3 AM night walk, high nostalgia, deep focus\``,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Parse URL and optional note
  const tokens = text.split(/\s+/);
  let url = tokens[0];
  let note = tokens.slice(1).join(" ").trim();

  // If first token is not a URL but text contains a URL
  const ytMatch = text.match(/(https?:\/\/[^\s]+)/);
  if (ytMatch) {
    url = ytMatch[1];
    note = text.replace(url, "").trim();
  }

  const ytId = extractYoutubeId(url);
  if (!ytId) {
    await ctx.reply(`⚠️ Could not detect a valid YouTube URL or video ID from:\n\`${url}\``, {
      parse_mode: "Markdown",
    });
    return;
  }

  await ctx.reply(`⏳ *Extracting stream metadata for* \`${ytId}\`...`, { parse_mode: "Markdown" });

  try {
    const meta = await extractMetadata(url);
    const song = createDefaultSong(meta, note);

    // Heuristic tag detection from note
    if (note) {
      const lowerNote = note.toLowerCase();
      if (lowerNote.includes("lofi")) song.context.sonicTexture.genreTags.push("lofi");
      if (lowerNote.includes("ambient")) song.context.sonicTexture.genreTags.push("ambient");
      if (lowerNote.includes("synth") || lowerNote.includes("synthwave")) song.context.sonicTexture.genreTags.push("synthwave");
      if (lowerNote.includes("game") || lowerNote.includes("ost")) song.context.sonicTexture.genreTags.push("game-ost");
      if (lowerNote.includes("sleep") || lowerNote.includes("rest")) {
        song.context.stateAffinity.optimalActivity = ["REST_SLEEP"];
        song.context.sonicTexture.energyLevel = 2;
      }
      if (lowerNote.includes("study") || lowerNote.includes("iitm")) {
        song.context.stateAffinity.optimalActivity = ["IITM_PREP"];
        song.context.sonicTexture.energyLevel = 5;
      }
    }

    await saveSong(song);

    const keyboard = new InlineKeyboard()
      .text("⚡ Deep Focus (5/10)", `music:energy:${song.id}:5`)
      .text("🔥 High Energy (8/10)", `music:energy:${song.id}:8`)
      .row()
      .text("🌙 Rest / Ambient (2/10)", `music:energy:${song.id}:2`)
      .text("➕ Add to Playlist", `music:addto:${song.id}`);

    await ctx.reply(
      `✅ *Captured into Fabric Sonic Mind*\n\n` +
        `🎵 *Title:* ${song.title}\n` +
        `👤 *Artist:* ${song.artist}\n` +
        `⏱ *Duration:* ${Math.round(song.duration / 60)} min\n` +
        `🧠 *Context:* ${note || "_No personal context provided yet._"}\n` +
        `🏷 *Tags:* \`${song.context.sonicTexture.genreTags.join(", ")}\`\n\n` +
        `_Synced with your custom NewPipe cloud ledger._`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } catch (err: any) {
    console.error("[handleSongCommand] Error:", err);
    await ctx.reply(`❌ Failed to extract metadata: ${err?.message || err}`);
  }
}

/**
 * Handles `/mix <intent>`
 */
export async function handleMixCommand(ctx: Context): Promise<void> {
  const intent = ctx.message?.text?.replace(/^\/mix\s*/i, "").trim();

  if (!intent) {
    await ctx.reply(
      `🎧 *Fabric Dynamic Mix Generator*\n\n` +
        `Synthesize a goal-oriented playlist for NewPipe using your semantic song memory.\n\n` +
        `*Usage:* \`/mix <intent or mood> [duration]\`\n\n` +
        `*Examples:*\n` +
        `• \`/mix IITM Computer Networks 90m\`\n` +
        `• \`/mix Late night cybernetic coding 60m\`\n` +
        `• \`/mix Tokyo neon driving unreleased gems\``,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Parse duration if present
  let durationMinutes = 60;
  const durMatch = intent.match(/(\d+)\s*(?:m|min|mins|minutes|h|hours?)/i);
  if (durMatch) {
    const val = parseInt(durMatch[1], 10);
    durationMinutes = intent.toLowerCase().includes("h") ? val * 60 : val;
  }

  await ctx.reply(`🧠 *Synthesizing Mix:* "${intent}" (${durationMinutes} mins)...`, {
    parse_mode: "Markdown",
  });

  try {
    const mix = await generateDynamicMix({
      name: `Mix: ${intent.slice(0, 32)}`,
      intent,
      targetDurationMinutes: durationMinutes,
      requireInstrumental: intent.toLowerCase().includes("instrumental") || intent.toLowerCase().includes("focus"),
      spacedRepetitionRatio: 0.35, // 35% forgotten gems
    });

    // Fetch songs in mix
    const songDetails = await Promise.all(mix.songIds.slice(0, 8).map((id) => getSong(id)));
    const trackList = songDetails
      .filter(Boolean)
      .map((s, idx) => `${idx + 1}. *${s!.title}* — _${s!.artist}_ (${Math.round(s!.duration / 60)}m)`)
      .join("\n");

    await ctx.reply(
      `🎛️ *Dynamic Mix Ready for NewPipe!*\n\n` +
        `📁 *Name:* ${mix.name}\n` +
        `⏱ *Tracks:* ${mix.songIds.length} tracks\n` +
        `🎯 *Intent:* ${mix.intent}\n\n` +
        `*Top Tracks in Sequence:*\n${trackList}\n\n` +
        `_Synced to cloud. Open NewPipe on your phone to stream._`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[handleMixCommand] Error:", err);
    await ctx.reply(`❌ Failed to generate mix: ${err?.message || err}`);
  }
}

/**
 * Handles `/playlists`
 */
export async function handlePlaylistsCommand(ctx: Context): Promise<void> {
  const playlists = await listPlaylists();
  const songs = await listSongs();

  if (playlists.length === 0 && songs.length === 0) {
    await ctx.reply(
      `🎵 *Fabric Sonic Mind is Empty*\n\n` +
        `Start by adding YouTube songs using \`/song <url> [context]\` or syncing your NewPipe database.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const listText = playlists
    .slice(0, 10)
    .map((p, idx) => `${idx + 1}. *${p.name}* (${p.songIds.length} tracks) ${p.isSmartMix ? "🤖 _AI Mix_" : "📁"}`)
    .join("\n");

  await ctx.reply(
    `🎛️ *Fabric Sonic Mind Library*\n\n` +
      `📊 *Total Songs Indexed:* ${songs.length}\n` +
      `📁 *Active Playlists:* ${playlists.length}\n\n` +
      `*Recent Playlists:*\n${listText || "_No playlists created yet._"}\n\n` +
      `Use \`/mix <intent>\` to craft a new mix or \`/song <url>\` to capture context.`,
    { parse_mode: "Markdown" }
  );
}

