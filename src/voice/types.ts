/**
 * Fabric OS — Real-Time Voice Channel Schemas & Types
 * Defines data structures for voice sessions, streaming audio frames,
 * Council personas, latency SLA tracking (<300ms), and synthesis.
 */

export type VoiceMode =
  | "socratic"
  | "sparring"
  | "executive_debrief"
  | "polymath_council"
  | "foci_flow";

export type CouncilPersonaId =
  | "architect"
  | "quant"
  | "stoic"
  | "biomechanic"
  | "sceptic"
  | "socratic";

export type AudioFormat = "pcm16" | "webm" | "wav" | "mp3" | "ogg";

export type SpeakerRole = "user" | "council" | "agent" | "system";

export interface AudioPacket {
  sessionId: string;
  sequenceNumber: number;
  timestamp: number;
  sender: SpeakerRole;
  format: AudioFormat;
  sampleRate: number;
  channels: number;
  data: string; // Base64-encoded audio payload
  isFinal?: boolean;
  durationMs?: number;
}

export interface TranscriptDelta {
  id: string;
  sessionId: string;
  speaker: SpeakerRole;
  persona?: CouncilPersonaId | string;
  delta: string;
  fullText: string;
  isFinal: boolean;
  timestamp: number;
  confidence?: number;
}

export interface VoiceLatencyMetrics {
  sessionStartLatencyMs: number;
  audioChunkLatencyMs: number[];
  averageChunkLatencyMs: number;
  speechToTextMs?: number;
  llmFirstTokenMs?: number;
  ttsFirstAudioMs?: number;
  roundTripTimeMs: number;
  slaThresholdMs: number; // 300ms SLA target
  slaViolations: number;
}

export interface VoiceSession {
  id: string;
  userId: string;
  mode: VoiceMode;
  status: "initiating" | "active" | "paused" | "closed" | "error";
  startTime: number;
  endTime?: number;
  activeSpeaker: "user" | "council" | "agent" | "idle";
  activePersona: CouncilPersonaId | string;
  transcript: TranscriptDelta[];
  metrics: VoiceLatencyMetrics;
  metadata?: Record<string, any>;
}

export interface VoiceTokenResponse {
  token: string;
  sessionId: string;
  endpoint: string;
  mode: VoiceMode;
  persona: string;
  sampleRate: number;
  expiresAt: number;
  slaTargetMs: number;
}

export interface SynthesizerOptions {
  voiceName?: string;
  pitch?: string;
  rate?: string;
  volume?: string;
  persona?: CouncilPersonaId | string;
  format?: AudioFormat;
  preferGeminiLive?: boolean;
}

export interface SynthesizedAudio {
  audioBuffer: Buffer;
  base64: string;
  format: AudioFormat;
  durationMs: number;
  latencyMs: number;
  synthesizer: "edge-tts" | "gemini-live" | "synthetic-fallback";
  sampleRate: number;
  channels: number;
}
