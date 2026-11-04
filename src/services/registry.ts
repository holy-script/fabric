/**
 * Fabric OS — Subsystem State Registry & Lifecycle Governor
 *
 * Provides centralized tracking, health monitoring, and dual-persistence
 * for all background services in Fabric OS:
 * 1. ambient_daemon (`scripts/fabric-ambient-daemon.ts`)
 * 2. video_vault_archiver (`scripts/archive-telegram-vault.ts`)
 * 3. insomnia_governor (`scripts/fabric-insomnia.ts`)
 * 4. cybernetic_governor (`src/services/governor.ts`)
 * 5. sms_gateway (`src/services/sms/`)
 * 6. voice_channel (`src/voice/`)
 * 7. newpipe_sync (`api/music/sync.ts`)
 *
 * Dual-Persistence:
 * - Persistent JSON Registry: `data/subsystem_registry.json`
 * - Real-Time Ambient Blackboard: `.ambient_state.json` under key `subsystems`
 */

import fs from "fs";
import path from "path";
import {
  DEFAULT_AMBIENT_STATE_PATH,
  getCurrentAmbientContext,
  logToBlackboard,
} from "./ambient.js";

// =============================================================
// Constants & Types
// =============================================================

export type SubsystemId =
  | "ambient_daemon"
  | "video_vault_archiver"
  | "insomnia_governor"
  | "cybernetic_governor"
  | "sms_gateway"
  | "voice_channel"
  | "newpipe_sync";

export type SubsystemState =
  | "ACTIVE"
  | "IDLE"
  | "DISABLED"
  | "ERROR"
  | "UNCONFIGURED";

export interface SubsystemStatus {
  id: SubsystemId;
  name: string;
  description: string;
  state: SubsystemState;
  enabled: boolean;
  lastHeartbeat: string | null;
  metrics: Record<string, any>;
  error?: string | null;
  updatedAt: string;
}

export interface SubsystemRegistryData {
  version: string;
  lastUpdated: string;
  subsystems: Record<SubsystemId, SubsystemStatus>;
}

export interface SubsystemRegistryOptions {
  registryPath?: string;
  ambientPath?: string;
  refreshLive?: boolean;
}

export const DEFAULT_REGISTRY_PATH = path.resolve(
  process.cwd(),
  "data/subsystem_registry.json"
);

export const KNOWN_SUBSYSTEMS: Record<
  SubsystemId,
  {
    name: string;
    description: string;
    defaultState: SubsystemState;
  }
> = {
  ambient_daemon: {
    name: "macOS Ambient Daemon",
    description: "Reality sensing context watcher (active application, idle time, git repository state)",
    defaultState: "IDLE",
  },
  video_vault_archiver: {
    name: "Tor SOCKS5 Video Vault Archiver",
    description: "Streams saved Instagram reels and media vault directly to Telegram via Tor SOCKS5 proxy",
    defaultState: "IDLE",
  },
  insomnia_governor: {
    name: "Insomnia Closed-Lid Power Governor",
    description: "Enforces native caffeinate execution with battery safety cutoff (<20%) and thermal throttling detection",
    defaultState: "IDLE",
  },
  cybernetic_governor: {
    name: "Closed-Loop 4F Cybernetic Governor",
    description: "Real-time 4F vector homeostasis minimizing Aristotelian existential loss",
    defaultState: "ACTIVE",
  },
  sms_gateway: {
    name: "Two-Way SMS Umbilical Gateway",
    description: "Programmable SMS webhook server and ADB fallback for offline control and emergency alerts",
    defaultState: "IDLE",
  },
  voice_channel: {
    name: "Bidirectional Real-Time Voice Channel",
    description: "Streaming neural speech synthesis (Edge-TTS), audio visualizer, and live sparring voice engine",
    defaultState: "IDLE",
  },
  newpipe_sync: {
    name: "FabricPipe & Sonic Mind Cloud Sync",
    description: "Bi-directional cloud synchronization engine for Android NewPipe builds and personal song memory",
    defaultState: "ACTIVE",
  },
};

export const ALL_SUBSYSTEM_IDS = Object.keys(KNOWN_SUBSYSTEMS) as SubsystemId[];

/**
 * Type guard to validate whether an arbitrary string is a valid SubsystemId.
 */
export function isSubsystemId(val: any): val is SubsystemId {
  return typeof val === "string" && ALL_SUBSYSTEM_IDS.includes(val as SubsystemId);
}

// =============================================================
// Helper Functions: Initialization & Live Inspection
// =============================================================

function createDefaultSubsystemStatus(
  id: SubsystemId,
  nowIso: string = new Date().toISOString()
): SubsystemStatus {
  const meta = KNOWN_SUBSYSTEMS[id];
  return {
    id,
    name: meta.name,
    description: meta.description,
    state: meta.defaultState,
    enabled: meta.defaultState !== "DISABLED",
    lastHeartbeat: meta.defaultState === "ACTIVE" ? nowIso : null,
    metrics: {},
    error: null,
    updatedAt: nowIso,
  };
}

/**
 * Checks if a POSIX process ID is alive without sending a terminating signal.
 */
function isPidAlive(pid: number): boolean {
  if (!pid || isNaN(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM"; // EPERM means process exists but we lack permission to signal it
  }
}

/**
 * Performs non-blocking passive environmental inspection to infer live telemetry
 * and state for a subsystem if it is not explicitly DISABLED.
 */
export async function inspectLiveSubsystem(
  subsystem: SubsystemStatus,
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus> {
  // If explicitly disabled by user/governor, preserve DISABLED state
  if (subsystem.state === "DISABLED") {
    subsystem.enabled = false;
    return subsystem;
  }

  const ambientPath = options?.ambientPath || DEFAULT_AMBIENT_STATE_PATH;

  try {
    switch (subsystem.id) {
      case "insomnia_governor": {
        const pidPath = path.resolve(process.cwd(), ".fabric_insomnia.pid");
        if (fs.existsSync(pidPath)) {
          const content = fs.readFileSync(pidPath, "utf-8").trim();
          const pid = parseInt(content, 10);
          if (isPidAlive(pid)) {
            subsystem.state = "ACTIVE";
            subsystem.metrics = {
              ...subsystem.metrics,
              pid,
              mode: "caffeinate",
            };
            subsystem.lastHeartbeat = new Date().toISOString();
          } else if (subsystem.state === "ACTIVE") {
            subsystem.state = "IDLE";
          }
        }
        break;
      }

      case "ambient_daemon": {
        if (fs.existsSync(ambientPath)) {
          const stats = fs.statSync(ambientPath);
          const ageMs = Date.now() - stats.mtimeMs;
          const context = await getCurrentAmbientContext({ statePath: ambientPath });

          if (ageMs < 120000) {
            // Updated in the last 2 minutes
            subsystem.state = "ACTIVE";
            subsystem.lastHeartbeat = context.timestamp || stats.mtime.toISOString();
            subsystem.metrics = {
              ...subsystem.metrics,
              activeApp: context.frontmostApp?.name,
              idleSeconds: context.focus?.idleSeconds,
              gitBranch: context.git?.branch,
              uncommittedCount: context.git?.uncommittedChangesCount,
            };
          } else if (subsystem.state === "ACTIVE") {
            subsystem.state = "IDLE";
          }
        }
        break;
      }

      case "video_vault_archiver": {
        const trackerPath = path.resolve(process.cwd(), ".telegram_vault_tracker.json");
        if (fs.existsSync(trackerPath)) {
          try {
            const tracker = JSON.parse(fs.readFileSync(trackerPath, "utf-8"));
            subsystem.metrics = {
              ...subsystem.metrics,
              totalArchived: tracker.totalArchived ?? 0,
              totalBytesUploaded: tracker.totalBytesUploaded ?? 0,
              lastUpdated: tracker.lastUpdated,
            };
            if (tracker.lastUpdated) {
              const ageMs = Date.now() - new Date(tracker.lastUpdated).getTime();
              if (ageMs < 15 * 60 * 1000) {
                // Active within 15 minutes
                subsystem.state = "ACTIVE";
                subsystem.lastHeartbeat = tracker.lastUpdated;
              }
            }
          } catch {}
        }
        break;
      }

      case "cybernetic_governor": {
        const context = await getCurrentAmbientContext({ statePath: ambientPath });
        const govState = context.blackboard?.governor;
        if (govState) {
          subsystem.metrics = {
            ...subsystem.metrics,
            lossScore: govState.lossScore,
            lastEvaluation: govState.timestamp,
            interventionsCount: govState.interventionsCount,
          };
          if (govState.timestamp) {
            subsystem.lastHeartbeat = govState.timestamp;
          }
        }
        break;
      }

      case "sms_gateway": {
        const hasKey = Boolean(
          process.env.HTTPSMS_API_KEY || process.env.HTTP_SMS_KEY
        );
        if (!hasKey && Object.keys(subsystem.metrics).length === 0) {
          subsystem.state = "UNCONFIGURED";
        }
        const context = await getCurrentAmbientContext({ statePath: ambientPath });
        const notes = context.blackboard?.sms_notes;
        if (Array.isArray(notes) && notes.length > 0) {
          subsystem.metrics.notesCount = notes.length;
          subsystem.lastHeartbeat = notes[notes.length - 1].timestamp || subsystem.lastHeartbeat;
        }
        break;
      }

      case "voice_channel": {
        const voiceDir = path.resolve(process.cwd(), "data/voice_sessions");
        if (fs.existsSync(voiceDir)) {
          const files = fs.readdirSync(voiceDir).filter((f) => f.endsWith(".json"));
          subsystem.metrics.storedSessions = files.length;
        }
        break;
      }

      case "newpipe_sync": {
        const musicDir = path.resolve(process.cwd(), "data/music");
        if (fs.existsSync(musicDir)) {
          const songsPath = path.join(musicDir, "songs.json");
          if (fs.existsSync(songsPath)) {
            try {
              const songs = JSON.parse(fs.readFileSync(songsPath, "utf-8"));
              subsystem.metrics.totalSongs = Array.isArray(songs)
                ? songs.length
                : Object.keys(songs).length;
            } catch {}
          }
        }
        break;
      }
    }
  } catch (err: any) {
    // Non-fatal passive inspection error
    console.debug(`[registry] Live inspection notice for ${subsystem.id}:`, err?.message);
  }

  return subsystem;
}

// =============================================================
// Core Storage & Persistence Engine
// =============================================================

/**
 * Reads the persistent registry from disk and ensures all known subsystems exist.
 */
export async function getRegistryData(
  options?: SubsystemRegistryOptions
): Promise<SubsystemRegistryData> {
  const registryPath = options?.registryPath || DEFAULT_REGISTRY_PATH;
  const nowIso = new Date().toISOString();

  let stored: Partial<SubsystemRegistryData> = {};

  if (fs.existsSync(registryPath)) {
    try {
      const raw = fs.readFileSync(registryPath, "utf-8");
      stored = JSON.parse(raw);
    } catch (err) {
      console.warn(`[registry] Corrupt registry at ${registryPath}, resetting to defaults:`, err);
    }
  }

  const subsystems: Record<SubsystemId, SubsystemStatus> = {} as any;

  // Initialize or merge all known subsystems
  for (const id of ALL_SUBSYSTEM_IDS) {
    const existing = stored.subsystems?.[id];
    if (existing) {
      subsystems[id] = {
        ...createDefaultSubsystemStatus(id, nowIso),
        ...existing,
        id, // ensure ID is invariant
      };
      // keep enabled consistent with state
      subsystems[id].enabled = subsystems[id].state !== "DISABLED";
    } else {
      subsystems[id] = createDefaultSubsystemStatus(id, nowIso);
    }
  }

  return {
    version: stored.version || "1.0.0",
    lastUpdated: stored.lastUpdated || nowIso,
    subsystems,
  };
}

/**
 * Atomically writes registry state to disk and propagates state to the ambient blackboard.
 */
export async function saveRegistryData(
  data: SubsystemRegistryData,
  options?: SubsystemRegistryOptions
): Promise<void> {
  const registryPath = options?.registryPath || DEFAULT_REGISTRY_PATH;
  const ambientPath = options?.ambientPath || DEFAULT_AMBIENT_STATE_PATH;

  data.lastUpdated = new Date().toISOString();

  // 1. Persist to Primary JSON Registry File
  try {
    const parentDir = path.dirname(registryPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err: any) {
    console.error(`[registry] Failed to save registry to ${registryPath}:`, err);
    throw err;
  }

  // 2. Propagate to Real-Time Ambient Blackboard
  try {
    const blackboardMap: Record<string, SubsystemStatus> = {};
    for (const [id, status] of Object.entries(data.subsystems)) {
      blackboardMap[id] = { ...status };
    }
    await logToBlackboard("subsystems", blackboardMap, ambientPath);
  } catch (err: any) {
    console.warn(`[registry] Blackboard sync warning (non-fatal):`, err?.message);
  }
}

// =============================================================
// Public State Management API
// =============================================================

/**
 * Returns all registered subsystems with their latest state and metrics.
 */
export async function getAllSubsystems(
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus[]> {
  const data = await getRegistryData(options);
  const shouldRefresh = options?.refreshLive ?? true;

  const results: SubsystemStatus[] = [];
  let mutated = false;

  for (const id of ALL_SUBSYSTEM_IDS) {
    let sub = data.subsystems[id];
    if (shouldRefresh) {
      sub = await inspectLiveSubsystem(sub, options);
      data.subsystems[id] = sub;
      mutated = true;
    }
    results.push(sub);
  }

  if (mutated) {
    await saveRegistryData(data, options);
  }

  return results;
}

/**
 * Retrieves a single subsystem by its ID.
 */
export async function getSubsystem(
  id: SubsystemId,
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus | null> {
  if (!isSubsystemId(id)) return null;

  const data = await getRegistryData(options);
  let sub = data.subsystems[id];
  if (!sub) return null;

  if (options?.refreshLive ?? true) {
    sub = await inspectLiveSubsystem(sub, options);
    data.subsystems[id] = sub;
    await saveRegistryData(data, options);
  }

  return sub;
}

/**
 * Updates the state, metrics, or error payload for a subsystem.
 */
export async function setSubsystemState(
  id: SubsystemId,
  state: SubsystemState,
  meta?: {
    metrics?: Record<string, any>;
    error?: string | null;
    lastHeartbeat?: string | null;
  },
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus> {
  if (!isSubsystemId(id)) {
    throw new Error(`Invalid subsystem id: '${id}'. Must be one of: ${ALL_SUBSYSTEM_IDS.join(", ")}`);
  }

  const data = await getRegistryData(options);
  const nowIso = new Date().toISOString();

  const sub = data.subsystems[id] || createDefaultSubsystemStatus(id, nowIso);

  sub.state = state;
  sub.enabled = state !== "DISABLED";
  sub.updatedAt = nowIso;

  if (meta?.metrics) {
    sub.metrics = {
      ...sub.metrics,
      ...meta.metrics,
    };
  }

  if (meta?.error !== undefined) {
    sub.error = meta.error;
  } else if (state === "ACTIVE" || state === "IDLE") {
    sub.error = null;
  }

  if (meta?.lastHeartbeat !== undefined) {
    sub.lastHeartbeat = meta.lastHeartbeat;
  } else if (state === "ACTIVE") {
    sub.lastHeartbeat = nowIso;
  }

  data.subsystems[id] = sub;
  await saveRegistryData(data, options);

  return sub;
}

/**
 * Enables a subsystem, setting its state to ACTIVE (or IDLE if specified).
 */
export async function enableSubsystem(
  id: SubsystemId,
  options?: SubsystemRegistryOptions & { targetState?: "ACTIVE" | "IDLE" }
): Promise<SubsystemStatus> {
  const target = options?.targetState || "ACTIVE";
  return setSubsystemState(
    id,
    target,
    {
      error: null,
      lastHeartbeat: target === "ACTIVE" ? new Date().toISOString() : undefined,
    },
    options
  );
}

/**
 * Disables a subsystem, setting its state to DISABLED.
 */
export async function disableSubsystem(
  id: SubsystemId,
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus> {
  return setSubsystemState(id, "DISABLED", undefined, options);
}

/**
 * Toggles a subsystem between enabled/disabled.
 */
export async function toggleSubsystem(
  id: SubsystemId,
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus> {
  const current = await getSubsystem(id, options);
  if (!current || current.state === "DISABLED") {
    return enableSubsystem(id, options);
  }
  return disableSubsystem(id, options);
}

/**
 * Records a heartbeat event and optional metrics from a running background daemon.
 */
export async function recordHeartbeat(
  id: SubsystemId,
  metrics?: Record<string, any>,
  options?: SubsystemRegistryOptions
): Promise<SubsystemStatus> {
  const nowIso = new Date().toISOString();
  return setSubsystemState(
    id,
    "ACTIVE",
    {
      metrics,
      lastHeartbeat: nowIso,
      error: null,
    },
    options
  );
}

/**
 * Resets the registry back to initial defaults (useful for testing and clean installs).
 */
export async function resetSubsystemRegistry(
  options?: SubsystemRegistryOptions
): Promise<void> {
  const registryPath = options?.registryPath || DEFAULT_REGISTRY_PATH;
  const nowIso = new Date().toISOString();

  const subsystems: Record<SubsystemId, SubsystemStatus> = {} as any;
  for (const id of ALL_SUBSYSTEM_IDS) {
    subsystems[id] = createDefaultSubsystemStatus(id, nowIso);
  }

  const data: SubsystemRegistryData = {
    version: "1.0.0",
    lastUpdated: nowIso,
    subsystems,
  };

  await saveRegistryData(data, options);
}
