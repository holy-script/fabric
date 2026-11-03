/**
 * Fabric OS — Sonic Mind & Music Framework Types
 * Defines data structures for songs, semantic context, playlists,
 * bi-directional NewPipe sync, and dynamic mix generation.
 */

export type ActivityAffinity =
  | "IITM_PREP"
  | "SPARK_SESSION"
  | "NIGHT_WALK"
  | "CREATIVE_BUILD"
  | "REST_SLEEP"
  | "KINETIC_WORKOUT"
  | "CASUAL_FLOW";

export interface SonicTexture {
  hasVocals: boolean;
  bpm?: number;
  energyLevel: number; // 1 (Delta sleep/ambient) to 10 (Adrenaline sprint)
  mood: string[];      // e.g. ["melancholic", "ethereal", "driving", "meditative", "nostalgic"]
  genreTags: string[]; // e.g. ["japanese-ambient", "synthwave", "game-ost", "lofi"]
}

export interface StateAffinity {
  focus: number;       // -5 to +5 (Aristotelian mean alignment)
  optimalActivity: ActivityAffinity[];
}

export interface SongContext {
  personalNote: string;      // The "Why it matters" narrative (e.g. "Tokyo 3 AM walk feeling")
  memories: string[];        // Specific milestone memories linked to this track
  sonicTexture: SonicTexture;
  stateAffinity: StateAffinity;
  highlightTimestampSeconds?: number; // Favorite moment / drop in the track
}

export interface SongTelemetry {
  playCount: number;
  skipCount: number;
  lastPlayedAt?: number;     // Epoch timestamp in milliseconds
  addedAt: number;
  updatedAt: number;
}

export interface FabricSong {
  id: string;                // YouTube Video ID (e.g. "dQw4w9WgXcQ")
  url: string;               // Canonical URL (e.g. "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  title: string;
  artist: string;            // Channel or composer
  duration: number;          // Duration in seconds
  thumbnailUrl: string;
  context: SongContext;
  telemetry: SongTelemetry;
}

export interface MixRules {
  targetDurationMinutes?: number;
  energyRange?: [number, number]; // [min, max] between 1 and 10
  requireInstrumental?: boolean;
  requiredTags?: string[];
  preferredActivity?: ActivityAffinity;
  spacedRepetitionRatio?: number; // 0.0 - 1.0 (portion of forgotten tracks)
}

export interface FabricPlaylist {
  id: string;                // Slug or UUID
  name: string;              // e.g. "Late Night Compiler", "IITM CSD War Room"
  description: string;
  intent?: string;           // What this playlist is engineered for
  songIds: string[];         // Ordered array of FabricSong IDs
  isSmartMix: boolean;       // Generated dynamically by Fabric vs manually created
  mixRules?: MixRules;
  version: number;           // Monotonic version counter for conflict-free sync
  createdAt: number;
  updatedAt: number;
}

/**
 * Bi-directional Sync Protocol Types for Custom NewPipe
 */

export type SyncMutationType =
  | "UPSERT_PLAYLIST"
  | "DELETE_PLAYLIST"
  | "ADD_SONG_TO_PLAYLIST"
  | "REMOVE_SONG_FROM_PLAYLIST"
  | "REORDER_PLAYLIST"
  | "UPDATE_SONG_CONTEXT"
  | "LOG_PLAYBACK_EVENT";

export interface SyncMutation {
  id: string;                // UUID of mutation
  type: SyncMutationType;
  entityId: string;          // Playlist ID or Song ID
  payload: any;
  timestamp: number;
}

export interface SyncPayload {
  deviceId: string;
  clientVersion: number;
  lastSyncTimestamp: number;
  mutations: SyncMutation[];
}

export interface SyncResponse {
  serverTimestamp: number;
  appliedCount: number;
  playlists: FabricPlaylist[];
  songs: FabricSong[];
  conflictsResolved: number;
}

export interface MixGenerationOptions {
  name: string;
  intent: string;
  targetDurationMinutes?: number;
  energyRange?: [number, number];
  requireInstrumental?: boolean;
  tags?: string[];
  activity?: ActivityAffinity;
  spacedRepetitionRatio?: number;
  currentFocusScore?: number; // operator's current 4F Focus state (-5 to +5)
}
