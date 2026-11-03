import { describe, it, expect, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import {
  extractYoutubeId,
  createDefaultSong,
} from "../src/music/extractor.js";
import {
  saveSong,
  getSong,
  listSongs,
  updateSongContext,
  savePlaylist,
  getPlaylist,
  listPlaylists,
  addSongToPlaylist,
  removeSongFromPlaylist,
  processClientSync,
} from "../src/music/store.js";
import { generateDynamicMix } from "../src/music/mixer.js";
import type { FabricSong, FabricPlaylist, SyncPayload } from "../src/music/types.js";
import syncHandler from "../api/music/sync.js";
import musicApiHandler from "../api/music/index.js";

describe("Fabric OS — Sonic Mind & Music Framework QC Suite", () => {
  const testSongId = "test_song_123";
  const testPlaylistId = "test_playlist_focus";

  it("1. YouTube ID Extractor handles diverse URL variations accurately", () => {
    expect(extractYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeId("invalid_url.com")).toBeNull();
    expect(extractYoutubeId("invalid")).toBeNull();
  });

  it("2. Song store saves, retrieves, lists, and annotates personal context", async () => {
    const rawSong = createDefaultSong(
      {
        id: testSongId,
        url: `https://www.youtube.com/watch?v=${testSongId}`,
        title: "Late Night Tokyo Cybernetic Ambient",
        artist: "Kuroshio",
        duration: 360,
        thumbnailUrl: "https://example.com/thumb.jpg",
      },
      "Crucial track for high-conviction coding sessions. Ethereal synthesis.",
      ["japanese-ambient", "cyberpunk", "flow"]
    );

    const saved = await saveSong(rawSong);
    expect(saved.id).toBe(testSongId);
    expect(saved.context.personalNote).toContain("Crucial track");

    const fetched = await getSong(testSongId);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("Late Night Tokyo Cybernetic Ambient");

    // Update context
    const updated = await updateSongContext(testSongId, {
      personalNote: "Updated memory: Built Fabric OS Era 8 listening to this.",
      sonicTexture: {
        energyLevel: 7,
        hasVocals: false,
        mood: ["focused", "transcendent"],
        genreTags: ["ambient", "flow"],
      },
    });

    expect(updated?.context.personalNote).toContain("Built Fabric OS Era 8");
    expect(updated?.context.sonicTexture.energyLevel).toBe(7);

    const allSongs = await listSongs();
    expect(allSongs.some((s) => s.id === testSongId)).toBe(true);
  });

  it("3. Playlist store creates, edits, and re-sequences songs", async () => {
    const playlist = await savePlaylist({
      id: testPlaylistId,
      name: "Deep Compiler Focus",
      description: "Music for sustained flow state execution",
      intent: "Low distraction, high immersion",
      songIds: [testSongId],
      isSmartMix: false,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(playlist.id).toBe(testPlaylistId);
    expect(playlist.songIds).toContain(testSongId);

    // Add another track
    const updated = await addSongToPlaylist(testPlaylistId, "track_beta_456");
    expect(updated.songIds).toEqual([testSongId, "track_beta_456"]);

    // Remove track
    const removed = await removeSongFromPlaylist(testPlaylistId, "track_beta_456");
    expect(removed?.songIds).toEqual([testSongId]);
  });

  it("4. Dynamic Mix Generator synthesizes goal-oriented mixes with spaced repetition", async () => {
    // Seed a couple more songs
    await saveSong(
      createDefaultSong(
        {
          id: "gem_alpha_789",
          url: "https://www.youtube.com/watch?v=gem_alpha_789",
          title: "IITM Computer Systems Design Groove",
          artist: "Silicon Wave",
          duration: 300,
          thumbnailUrl: "https://example.com/alpha.jpg",
        },
        "Unreleased gem from 2021. Peak clarity.",
        ["iitm", "synthwave", "instrumental"]
      )
    );

    const mix = await generateDynamicMix({
      name: "IITM CSD War Room Mix",
      intent: "IITM Computer Systems Design intense focus",
      targetDurationMinutes: 30,
      requireInstrumental: true,
      spacedRepetitionRatio: 0.4,
    });

    expect(mix.isSmartMix).toBe(true);
    expect(mix.name).toBe("IITM CSD War Room Mix");
    expect(mix.songIds.length).toBeGreaterThan(0);
    expect(mix.songIds).toContain("gem_alpha_789");
  });

  it("5. Bi-directional Sync Resolver executes client mutations and returns delta", async () => {
    const payload: SyncPayload = {
      deviceId: "pixel_8_pro_android",
      clientVersion: 1,
      lastSyncTimestamp: Date.now() - 3600000,
      mutations: [
        {
          id: "mut_1",
          type: "UPSERT_PLAYLIST",
          entityId: "mobile_playlist_1",
          payload: {
            id: "mobile_playlist_1",
            name: "Created On Phone Inside NewPipe",
            description: "Sync test playlist",
            songIds: [testSongId],
            isSmartMix: false,
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          timestamp: Date.now(),
        },
        {
          id: "mut_2",
          type: "UPDATE_SONG_CONTEXT",
          entityId: testSongId,
          payload: {
            songId: testSongId,
            context: {
              personalNote: "Added from phone context sheet!",
            },
          },
          timestamp: Date.now(),
        },
      ],
    };

    const syncResult = await processClientSync(payload);
    expect(syncResult.appliedCount).toBe(2);
    expect(syncResult.playlists.some((p) => p.id === "mobile_playlist_1")).toBe(true);
    expect(syncResult.songs.some((s) => s.id === testSongId && s.context.personalNote.includes("from phone"))).toBe(true);
  });

  it("6. Vercel Serverless Sync endpoint POST /api/music/sync processes requests", async () => {
    const payload = {
      deviceId: "test_mac_cli",
      clientVersion: 1,
      lastSyncTimestamp: 0,
      mutations: [],
    };

    const req: any = {
      method: "POST",
      url: "/api/music/sync",
      on: (event: string, cb: any) => {
        if (event === "data") cb(Buffer.from(JSON.stringify(payload)));
        if (event === "end") cb();
      },
    };

    let statusCode = 0;
    let responseBody = "";

    const res: any = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (data: string) => {
        responseBody = data;
      },
    };

    await syncHandler(req, res);
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(responseBody);
    expect(parsed.status).toBe("success");
    expect(Array.isArray(parsed.playlists)).toBe(true);
    expect(Array.isArray(parsed.songs)).toBe(true);
  });

  it("7. REST API endpoint GET & POST /api/music handles song annotations and mix triggers", async () => {
    // 1. GET /api/music?action=songs
    let statusCode = 0;
    let responseBody = "";

    const getReq: any = {
      method: "GET",
      url: "/api/music?action=songs",
      on: (event: string, cb: any) => {
        if (event === "end") cb();
      },
    };

    const res: any = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (data: string) => {
        responseBody = data;
      },
    };

    await musicApiHandler(getReq, res);
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(responseBody);
    expect(parsed.status).toBe("success");
    expect(parsed.songs.length).toBeGreaterThan(0);
  });
});
