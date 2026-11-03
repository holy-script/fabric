/**
 * Fabric OS — Dynamic Mix Generator & Spaced Repetition Sonic DJ
 * Synthesizes goal-oriented mixes from your song memory vault based on
 * intent, 4F focus vector, personal notes, and forgotten gems.
 */

import type {
  FabricSong,
  FabricPlaylist,
  MixGenerationOptions,
} from "./types.js";
import { listSongs, savePlaylist } from "./store.js";

/**
 * Computes semantic relevance score between a song's context and the user's intent
 */
function computeRelevanceScore(song: FabricSong, options: MixGenerationOptions): number {
  let score = 0;
  const intentLower = options.intent.toLowerCase();
  const searchCorpus = [
    song.title,
    song.artist,
    song.context.personalNote,
    ...(song.context.memories || []),
    ...(song.context.sonicTexture.mood || []),
    ...(song.context.sonicTexture.genreTags || []),
  ]
    .join(" ")
    .toLowerCase();

  // 1. Keyword intent matching
  const words = intentLower.split(/\s+/).filter((w) => w.length > 2);
  for (const word of words) {
    if (searchCorpus.includes(word)) {
      score += 15;
    }
  }

  // 2. Activity affinity matching
  if (options.activity) {
    if (song.context.stateAffinity.optimalActivity.includes(options.activity)) {
      score += 25;
    }
  }

  // 3. Instrumental requirement
  if (options.requireInstrumental) {
    if (song.context.sonicTexture.hasVocals) {
      score -= 50; // heavily penalize vocals for deep focus
    } else {
      score += 20;
    }
  }

  // 4. Energy range alignment
  if (options.energyRange) {
    const [minE, maxE] = options.energyRange;
    const songE = song.context.sonicTexture.energyLevel || 5;
    if (songE >= minE && songE <= maxE) {
      score += 20;
    } else {
      const distance = Math.min(Math.abs(songE - minE), Math.abs(songE - maxE));
      score -= distance * 5;
    }
  }

  // 5. Explicit tag filtering
  if (options.tags && options.tags.length > 0) {
    for (const tag of options.tags) {
      const tagLower = tag.toLowerCase();
      if (
        song.context.sonicTexture.genreTags.some((t) => t.toLowerCase().includes(tagLower)) ||
        song.context.sonicTexture.mood.some((m) => m.toLowerCase().includes(tagLower))
      ) {
        score += 20;
      }
    }
  }

  // 6. Aristotelian 4F Focus alignment
  if (typeof options.currentFocusScore === "number") {
    // If current focus is deficient (< 0), prefer songs with positive focus affinity
    const songFocusAffinity = song.context.stateAffinity.focus || 0;
    if (options.currentFocusScore < 0 && songFocusAffinity >= 0) {
      score += 15;
    }
  }

  return score;
}

/**
 * Calculates a spaced repetition boost for forgotten gems
 */
function computeSpacedRepetitionScore(song: FabricSong): number {
  const now = Date.now();
  const lastPlayed = song.telemetry.lastPlayedAt;

  // Never played or played long ago
  if (!lastPlayed) {
    return 30; // High novelty bonus
  }

  const daysSincePlayed = (now - lastPlayed) / (1000 * 60 * 60 * 24);

  // If high personal note or memories exist, forgotten gems get compounding recall priority
  const hasStrongContext =
    (song.context.personalNote && song.context.personalNote.length > 20) ||
    (song.context.memories && song.context.memories.length > 0);

  const contextMultiplier = hasStrongContext ? 1.5 : 1.0;

  if (daysSincePlayed > 60) return 25 * contextMultiplier;
  if (daysSincePlayed > 30) return 18 * contextMultiplier;
  if (daysSincePlayed > 14) return 10 * contextMultiplier;
  if (daysSincePlayed < 1) return -15; // Prevent fatigue

  return 0;
}

/**
 * Sequences selected tracks into a psychological flow arc (Warmup -> Peak Flow -> Cool Down)
 */
function sequenceFlowArc(songs: FabricSong[]): FabricSong[] {
  if (songs.length <= 2) return songs;

  // Sort by energy
  const sorted = [...songs].sort(
    (a, b) =>
      (a.context.sonicTexture.energyLevel || 5) -
      (b.context.sonicTexture.energyLevel || 5)
  );

  const warmupCount = Math.max(1, Math.floor(sorted.length * 0.2));
  const cooldownCount = Math.max(1, Math.floor(sorted.length * 0.2));

  const warmup = sorted.slice(0, warmupCount);
  const remaining = sorted.slice(warmupCount);
  const cooldown = remaining.splice(remaining.length - cooldownCount, cooldownCount);
  const peakFlow = remaining; // remaining middle & higher energy

  return [...warmup, ...peakFlow, ...cooldown];
}

/**
 * Generates an intelligent, context-aware playlist and persists it to the store
 */
export async function generateDynamicMix(options: MixGenerationOptions): Promise<FabricPlaylist> {
  const allSongs = await listSongs();

  if (allSongs.length === 0) {
    // Generate an empty container playlist
    const emptyMix: FabricPlaylist = {
      id: `mix-${Date.now()}`,
      name: options.name || "Curated Flow Mix",
      description: options.intent || "Dynamic Mix",
      intent: options.intent,
      songIds: [],
      isSmartMix: true,
      mixRules: {
        targetDurationMinutes: options.targetDurationMinutes || 60,
        energyRange: options.energyRange,
        requireInstrumental: options.requireInstrumental,
        preferredActivity: options.activity,
      },
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return await savePlaylist(emptyMix);
  }

  const spacedRatio = options.spacedRepetitionRatio ?? 0.3;
  const targetSeconds = (options.targetDurationMinutes || 60) * 60;

  // Score all songs
  const scoredSongs = allSongs.map((song) => {
    const baseRelevance = computeRelevanceScore(song, options);
    const recallBoost = computeSpacedRepetitionScore(song);
    const finalScore = baseRelevance * (1 - spacedRatio) + recallBoost * spacedRatio;
    return { song, score: finalScore };
  });

  // Sort descending by score
  scoredSongs.sort((a, b) => b.score - a.score);

  // Greedily assemble tracks until target duration
  let accumulatedSeconds = 0;
  const selected: FabricSong[] = [];

  for (const item of scoredSongs) {
    if (selected.length > 0 && accumulatedSeconds >= targetSeconds) {
      break;
    }
    // Prevent tracks with massive negative penalties (e.g. unwanted vocals)
    if (item.score < -20 && selected.length >= 3) {
      continue;
    }
    selected.push(item.song);
    accumulatedSeconds += item.song.duration || 180;
  }

  // Sequence into natural flow arc
  const sequenced = sequenceFlowArc(selected);
  const songIds = sequenced.map((s) => s.id);

  const playlistId = `mix-${Date.now()}`;
  const playlist: FabricPlaylist = {
    id: playlistId,
    name: options.name || `Mix: ${options.intent.slice(0, 30)}`,
    description: `Synthesized for: "${options.intent}". Total: ${Math.round(
      accumulatedSeconds / 60
    )} mins across ${selected.length} tracks.`,
    intent: options.intent,
    songIds,
    isSmartMix: true,
    mixRules: {
      targetDurationMinutes: options.targetDurationMinutes || 60,
      energyRange: options.energyRange,
      requireInstrumental: options.requireInstrumental,
      preferredActivity: options.activity,
      spacedRepetitionRatio: spacedRatio,
    },
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return await savePlaylist(playlist);
}
