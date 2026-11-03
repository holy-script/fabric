/**
 * Fabric OS — Sonic Mind & Music Store
 * Dual-layer persistence (Local File cache + Firestore cloud ledger)
 * with atomic conflict-free bi-directional sync resolution for NewPipe.
 */

import fs from "fs";
import path from "path";
import type {
  FabricSong,
  FabricPlaylist,
  SongContext,
  SyncPayload,
  SyncResponse,
  SyncMutation,
} from "./types.js";
import { db } from "../db/firestore.js";

const DEFAULT_MUSIC_DIR = path.resolve(process.cwd(), "data/music");
const SONGS_DIR = path.join(DEFAULT_MUSIC_DIR, "songs");
const PLAYLISTS_DIR = path.join(DEFAULT_MUSIC_DIR, "playlists");

function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * =========================================================================
 * 1. SONG OPERATIONS (Local & Firestore)
 * =========================================================================
 */

export async function saveSong(song: FabricSong): Promise<FabricSong> {
  ensureDirectoryExists(SONGS_DIR);
  song.telemetry.updatedAt = Date.now();

  // 1. Write to local disk cache
  const localFile = path.join(SONGS_DIR, `${song.id}.json`);
  await fs.promises.writeFile(localFile, JSON.stringify(song, null, 2), "utf8");

  // 2. Write to Firestore if connected
  if (db) {
    try {
      await Promise.race([
        db.collection("music_songs").doc(song.id).set(song, { merge: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firestore song save timeout")), 2500)
        ),
      ]);
    } catch (err: any) {
      console.warn(`[MusicStore] Firestore saveSong fallback for ${song.id}:`, err?.message || err);
    }
  }

  return song;
}

export async function getSong(id: string): Promise<FabricSong | null> {
  ensureDirectoryExists(SONGS_DIR);
  const localFile = path.join(SONGS_DIR, `${id}.json`);

  if (fs.existsSync(localFile)) {
    try {
      const content = await fs.promises.readFile(localFile, "utf8");
      return JSON.parse(content) as FabricSong;
    } catch (err) {
      console.warn(`[MusicStore] Error parsing local song ${id}:`, err);
    }
  }

  if (db) {
    try {
      const snap = await Promise.race([
        db.collection("music_songs").doc(id).get(),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error("Firestore getSong timeout")), 2500)
        ),
      ]);
      if (snap && snap.exists) {
        const data = snap.data() as FabricSong;
        // Backfill local cache
        await fs.promises.writeFile(localFile, JSON.stringify(data, null, 2), "utf8");
        return data;
      }
    } catch (err) {
      // ignore timeout
    }
  }

  return null;
}

export async function listSongs(): Promise<FabricSong[]> {
  ensureDirectoryExists(SONGS_DIR);
  const files = await fs.promises.readdir(SONGS_DIR);
  const songs: FabricSong[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const raw = await fs.promises.readFile(path.join(SONGS_DIR, file), "utf8");
        const parsed = JSON.parse(raw) as FabricSong;
        if (parsed.id) {
          songs.push(parsed);
        }
      } catch (e) {
        // skip corrupted files
      }
    }
  }

  return songs.sort((a, b) => b.telemetry.updatedAt - a.telemetry.updatedAt);
}

export async function updateSongContext(
  id: string,
  contextPatch: Partial<SongContext>
): Promise<FabricSong | null> {
  const song = await getSong(id);
  if (!song) return null;

  song.context = {
    ...song.context,
    ...contextPatch,
    sonicTexture: {
      ...song.context.sonicTexture,
      ...(contextPatch.sonicTexture || {}),
    },
    stateAffinity: {
      ...song.context.stateAffinity,
      ...(contextPatch.stateAffinity || {}),
    },
  };

  return await saveSong(song);
}

/**
 * =========================================================================
 * 2. PLAYLIST OPERATIONS (Local & Firestore)
 * =========================================================================
 */

export async function savePlaylist(playlist: FabricPlaylist): Promise<FabricPlaylist> {
  ensureDirectoryExists(PLAYLISTS_DIR);
  playlist.updatedAt = Date.now();
  playlist.version = (playlist.version || 0) + 1;

  // 1. Write to local disk cache
  const localFile = path.join(PLAYLISTS_DIR, `${playlist.id}.json`);
  await fs.promises.writeFile(localFile, JSON.stringify(playlist, null, 2), "utf8");

  // 2. Write to Firestore if connected
  if (db) {
    try {
      await Promise.race([
        db.collection("music_playlists").doc(playlist.id).set(playlist, { merge: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firestore playlist save timeout")), 2500)
        ),
      ]);
    } catch (err: any) {
      console.warn(`[MusicStore] Firestore savePlaylist fallback for ${playlist.id}:`, err?.message || err);
    }
  }

  return playlist;
}

export async function getPlaylist(id: string): Promise<FabricPlaylist | null> {
  ensureDirectoryExists(PLAYLISTS_DIR);
  const localFile = path.join(PLAYLISTS_DIR, `${id}.json`);

  if (fs.existsSync(localFile)) {
    try {
      const content = await fs.promises.readFile(localFile, "utf8");
      return JSON.parse(content) as FabricPlaylist;
    } catch (err) {
      console.warn(`[MusicStore] Error parsing local playlist ${id}:`, err);
    }
  }

  if (db) {
    try {
      const snap = await Promise.race([
        db.collection("music_playlists").doc(id).get(),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error("Firestore getPlaylist timeout")), 2500)
        ),
      ]);
      if (snap && snap.exists) {
        const data = snap.data() as FabricPlaylist;
        await fs.promises.writeFile(localFile, JSON.stringify(data, null, 2), "utf8");
        return data;
      }
    } catch (err) {
      // ignore
    }
  }

  return null;
}

export async function listPlaylists(): Promise<FabricPlaylist[]> {
  ensureDirectoryExists(PLAYLISTS_DIR);
  const files = await fs.promises.readdir(PLAYLISTS_DIR);
  const playlists: FabricPlaylist[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const raw = await fs.promises.readFile(path.join(PLAYLISTS_DIR, file), "utf8");
        const parsed = JSON.parse(raw) as FabricPlaylist;
        if (parsed.id) {
          playlists.push(parsed);
        }
      } catch (e) {
        // skip
      }
    }
  }

  return playlists.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deletePlaylist(id: string): Promise<boolean> {
  ensureDirectoryExists(PLAYLISTS_DIR);
  const localFile = path.join(PLAYLISTS_DIR, `${id}.json`);
  let deleted = false;

  if (fs.existsSync(localFile)) {
    await fs.promises.unlink(localFile);
    deleted = true;
  }

  if (db) {
    try {
      await db.collection("music_playlists").doc(id).delete();
      deleted = true;
    } catch (err) {
      // ignore
    }
  }

  return deleted;
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
  index?: number
): Promise<FabricPlaylist> {
  let playlist = await getPlaylist(playlistId);
  if (!playlist) {
    playlist = {
      id: playlistId,
      name: playlistId.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: "Auto-created playlist",
      songIds: [],
      isSmartMix: false,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // Remove existing if present to prevent duplicates and re-position
  const currentSongs = playlist.songIds.filter((s) => s !== songId);
  if (typeof index === "number" && index >= 0 && index <= currentSongs.length) {
    currentSongs.splice(index, 0, songId);
  } else {
    currentSongs.push(songId);
  }

  playlist.songIds = currentSongs;
  return await savePlaylist(playlist);
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string
): Promise<FabricPlaylist | null> {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) return null;

  playlist.songIds = playlist.songIds.filter((s) => s !== songId);
  return await savePlaylist(playlist);
}

/**
 * =========================================================================
 * 3. BI-DIRECTIONAL SYNC RESOLVER FOR NEWPIPE
 * =========================================================================
 */

export async function processClientSync(payload: SyncPayload): Promise<SyncResponse> {
  const now = Date.now();
  let appliedCount = 0;
  let conflictsResolved = 0;

  for (const mutation of payload.mutations || []) {
    try {
      switch (mutation.type) {
        case "UPSERT_PLAYLIST": {
          const clientPlaylist: FabricPlaylist = mutation.payload;
          const existing = await getPlaylist(clientPlaylist.id);
          // Monotonic version conflict resolution
          if (!existing || mutation.timestamp >= existing.updatedAt) {
            await savePlaylist({
              ...clientPlaylist,
              updatedAt: mutation.timestamp,
            });
            appliedCount++;
          } else {
            conflictsResolved++;
          }
          break;
        }

        case "DELETE_PLAYLIST": {
          await deletePlaylist(mutation.entityId);
          appliedCount++;
          break;
        }

        case "ADD_SONG_TO_PLAYLIST": {
          const { playlistId, songId, index } = mutation.payload;
          await addSongToPlaylist(playlistId, songId, index);
          appliedCount++;
          break;
        }

        case "REMOVE_SONG_FROM_PLAYLIST": {
          const { playlistId, songId } = mutation.payload;
          await removeSongFromPlaylist(playlistId, songId);
          appliedCount++;
          break;
        }

        case "UPDATE_SONG_CONTEXT": {
          const { songId, context } = mutation.payload;
          await updateSongContext(songId, context);
          appliedCount++;
          break;
        }

        case "LOG_PLAYBACK_EVENT": {
          const { songId, completed } = mutation.payload;
          const song = await getSong(songId);
          if (song) {
            if (completed) {
              song.telemetry.playCount = (song.telemetry.playCount || 0) + 1;
            } else {
              song.telemetry.skipCount = (song.telemetry.skipCount || 0) + 1;
            }
            song.telemetry.lastPlayedAt = mutation.timestamp;
            await saveSong(song);
            appliedCount++;
          }
          break;
        }

        default:
          console.warn(`[MusicStore] Unknown sync mutation type: ${mutation.type}`);
      }
    } catch (err) {
      console.error(`[MusicStore] Failed to apply mutation ${mutation.id}:`, err);
    }
  }

  // Fetch complete current state to send back to client
  const allPlaylists = await listPlaylists();
  const allSongs = await listSongs();

  return {
    serverTimestamp: now,
    appliedCount,
    playlists: allPlaylists,
    songs: allSongs,
    conflictsResolved,
  };
}
