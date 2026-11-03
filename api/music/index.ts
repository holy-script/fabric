import type { IncomingMessage, ServerResponse } from "http";
import {
  listPlaylists,
  getPlaylist,
  savePlaylist,
  listSongs,
  getSong,
  saveSong,
  updateSongContext,
  addSongToPlaylist,
  removeSongFromPlaylist,
} from "../../src/music/store.js";
import { generateDynamicMix } from "../../src/music/mixer.js";
import { extractMetadata, createDefaultSong } from "../../src/music/extractor.js";
import type { MixGenerationOptions, SongContext } from "../../src/music/types.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(jsonStr),
  });
  res.end(jsonStr);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const action = url.searchParams.get("action") || "";

  try {
    // 1. GET requests
    if (req.method === "GET") {
      if (action === "songs") {
        const songs = await listSongs();
        sendJson(res, 200, { status: "success", count: songs.length, songs });
        return;
      }

      if (action === "song") {
        const id = url.searchParams.get("id");
        if (!id) return sendJson(res, 400, { error: "Missing 'id' parameter" });
        const song = await getSong(id);
        if (!song) return sendJson(res, 404, { error: "Song not found" });
        sendJson(res, 200, { status: "success", song });
        return;
      }

      if (action === "playlist") {
        const id = url.searchParams.get("id");
        if (!id) return sendJson(res, 400, { error: "Missing 'id' parameter" });
        const playlist = await getPlaylist(id);
        if (!playlist) return sendJson(res, 404, { error: "Playlist not found" });
        sendJson(res, 200, { status: "success", playlist });
        return;
      }

      // Default GET: list all playlists
      const playlists = await listPlaylists();
      sendJson(res, 200, { status: "success", count: playlists.length, playlists });
      return;
    }

    // 2. POST requests
    if (req.method === "POST") {
      const body = await parseJsonBody(req);

      // Action: Add / Ingest Song with Context
      if (action === "add_song" || body.action === "add_song") {
        const urlOrId = body.url || body.id;
        if (!urlOrId) return sendJson(res, 400, { error: "Missing url or id" });

        const meta = await extractMetadata(urlOrId);
        const userNote = body.personalNote || body.note || "";
        const tags = Array.isArray(body.tags) ? body.tags : [];
        const song = createDefaultSong(meta, userNote, tags);

        if (body.context) {
          song.context = { ...song.context, ...body.context };
        }

        await saveSong(song);

        // Optionally add to playlist
        if (body.playlistId) {
          await addSongToPlaylist(body.playlistId, song.id);
        }

        sendJson(res, 201, { status: "success", song });
        return;
      }

      // Action: Update Song Context ("Why it matters", notes, tags, energy)
      if (action === "annotate_song" || body.action === "annotate_song") {
        const songId = body.id || body.songId;
        if (!songId) return sendJson(res, 400, { error: "Missing songId" });
        const contextPatch: Partial<SongContext> = body.context || body;
        const updated = await updateSongContext(songId, contextPatch);
        if (!updated) return sendJson(res, 404, { error: "Song not found" });
        sendJson(res, 200, { status: "success", song: updated });
        return;
      }

      // Action: Generate Dynamic Mix
      if (action === "mix" || body.action === "mix") {
        const mixOptions: MixGenerationOptions = {
          name: body.name || `Mix: ${body.intent || "Deep Focus"}`,
          intent: body.intent || "Focus flow and clarity",
          targetDurationMinutes: Number(body.duration) || Number(body.targetDurationMinutes) || 60,
          energyRange: Array.isArray(body.energyRange) ? body.energyRange : undefined,
          requireInstrumental: Boolean(body.requireInstrumental),
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          activity: body.activity,
          spacedRepetitionRatio: typeof body.spacedRepetitionRatio === "number" ? body.spacedRepetitionRatio : 0.3,
          currentFocusScore: typeof body.focusScore === "number" ? body.focusScore : undefined,
        };

        const playlist = await generateDynamicMix(mixOptions);
        sendJson(res, 201, { status: "success", playlist });
        return;
      }

      // Action: Create or Update Playlist
      if (body.id && body.name) {
        const playlist = await savePlaylist({
          id: body.id,
          name: body.name,
          description: body.description || "",
          intent: body.intent || "",
          songIds: Array.isArray(body.songIds) ? body.songIds : [],
          isSmartMix: Boolean(body.isSmartMix),
          version: Number(body.version) || 1,
          createdAt: Number(body.createdAt) || Date.now(),
          updatedAt: Date.now(),
        });
        sendJson(res, 200, { status: "success", playlist });
        return;
      }

      sendJson(res, 400, { error: "Unknown action or invalid body parameters" });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err: any) {
    console.error("[api/music] Request error:", err);
    sendJson(res, 500, { error: err?.message || "Internal server error" });
  }
}
