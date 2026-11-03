import { execFile } from "child_process";
import { promisify } from "util";
import type { FabricSong, SongContext } from "./types.js";

const execFileAsync = promisify(execFile);
const YT_DLP_PATH = process.env.YT_DLP_PATH || "/opt/homebrew/bin/yt-dlp";

export interface ExtractedMetadata {
  id: string;
  url: string;
  title: string;
  artist: string;
  duration: number;
  thumbnailUrl: string;
}

/**
 * Extracts normalized YouTube Video ID from any standard YT URL or raw ID
 */
export function extractYoutubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If it's a URL or path, match standard YouTube patterns
  if (trimmed.includes("/") || trimmed.includes(".")) {
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/
    );
    return match ? match[1] : null;
  }

  // Direct 11-char ID check (alphanumeric, -, _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Extracts rich metadata for a given YouTube URL or ID using yt-dlp
 */
export async function extractMetadata(urlOrId: string): Promise<ExtractedMetadata> {
  const videoId = extractYoutubeId(urlOrId);
  const targetUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : urlOrId;

  try {
    const { stdout } = await execFileAsync(
      YT_DLP_PATH,
      [
        "--dump-json",
        "--no-playlist",
        "--skip-download",
        targetUrl,
      ],
      { timeout: 15000 }
    );

    const json = JSON.parse(stdout);
    const id = json.id || videoId || "unknown";
    return {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: json.title || "Untitled Track",
      artist: json.uploader || json.channel || json.creator || "Unknown Artist",
      duration: Math.round(Number(json.duration) || 0),
      thumbnailUrl: json.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  } catch (err: any) {
    // Graceful fallback if yt-dlp is not available or video fails
    const id = videoId || "fallback_" + Date.now();
    return {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: urlOrId.includes("http") ? "YouTube Stream (" + id + ")" : urlOrId,
      artist: "Curated Source",
      duration: 180, // safe 3 min default
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
}

/**
 * Creates a default initialized FabricSong entity from metadata and optional user context
 */
export function createDefaultSong(
  meta: ExtractedMetadata,
  userNote: string = "",
  tags: string[] = []
): FabricSong {
  const now = Date.now();
  const context: SongContext = {
    personalNote: userNote,
    memories: [],
    sonicTexture: {
      hasVocals: false,
      energyLevel: 5,
      mood: ["ambient", "flow"],
      genreTags: tags.length > 0 ? tags : ["curated"],
    },
    stateAffinity: {
      focus: 0,
      optimalActivity: ["CASUAL_FLOW", "CREATIVE_BUILD"],
    },
  };

  return {
    id: meta.id,
    url: meta.url,
    title: meta.title,
    artist: meta.artist,
    duration: meta.duration,
    thumbnailUrl: meta.thumbnailUrl,
    context,
    telemetry: {
      playCount: 0,
      skipCount: 0,
      addedAt: now,
      updatedAt: now,
    },
  };
}
