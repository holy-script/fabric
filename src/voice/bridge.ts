/**
 * Fabric OS — Real-Time Voice Channel Bridge
 * Coordinates bidirectional streaming audio frames, Socratic sparring,
 * Polymath Council voice deliberation, and latency SLA tracking (<300ms).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type {
  VoiceSession,
  AudioPacket,
  VoiceMode,
  CouncilPersonaId,
  TranscriptDelta,
  VoiceLatencyMetrics,
  VoiceTokenResponse,
} from "./types.js";
import { StreamingSynthesizer, defaultSynthesizer } from "./synthesizer.js";
import {
  base64ToBuffer,
  bufferToBase64,
  calculateRmsEnergy,
  calculateAudioDurationMs,
} from "./audio.js";
import { conveneCouncil } from "../ai/council.js";
import { db } from "../db/firestore.js";

const DEFAULT_SESSIONS_DIR = path.resolve(process.cwd(), "data/voice_sessions");

function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class VoiceBridge {
  private activeSessions: Map<string, VoiceSession> = new Map();
  private synthesizer: StreamingSynthesizer;
  private storageDir: string;

  constructor(options: { synthesizer?: StreamingSynthesizer; storageDir?: string } = {}) {
    this.synthesizer = options.synthesizer || defaultSynthesizer;
    this.storageDir = options.storageDir || DEFAULT_SESSIONS_DIR;
    ensureDirectoryExists(this.storageDir);
  }

  /**
   * Initiates a new VoiceSession with SLA tracking configuration.
   */
  public async createSession(params: {
    userId?: string;
    mode?: VoiceMode;
    persona?: CouncilPersonaId | string;
    metadata?: Record<string, any>;
  } = {}): Promise<VoiceSession> {
    const startTime = Date.now();
    const sessionId = `vs_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const mode = params.mode || "socratic";
    const persona = params.persona || (mode === "socratic" ? "socratic" : "architect");

    const session: VoiceSession = {
      id: sessionId,
      userId: params.userId || "operator",
      mode,
      status: "active",
      startTime,
      activeSpeaker: "idle",
      activePersona: persona,
      transcript: [],
      metrics: {
        sessionStartLatencyMs: Date.now() - startTime,
        audioChunkLatencyMs: [],
        averageChunkLatencyMs: 0,
        roundTripTimeMs: 0,
        slaThresholdMs: 300, // 300ms target
        slaViolations: 0,
      },
      metadata: params.metadata || {},
    };

    this.activeSessions.set(sessionId, session);
    await this.persistSession(session);
    return session;
  }

  /**
   * Retrieves an active or persisted session by ID.
   */
  public async getSession(sessionId: string): Promise<VoiceSession | null> {
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Try reading from disk
    const filePath = path.join(this.storageDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = await fs.promises.readFile(filePath, "utf8");
        const loaded: VoiceSession = JSON.parse(raw);
        this.activeSessions.set(sessionId, loaded);
        return loaded;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Lists all sessions stored locally or in memory.
   */
  public async listSessions(userId?: string): Promise<VoiceSession[]> {
    const results: VoiceSession[] = Array.from(this.activeSessions.values());
    const seenIds = new Set(results.map((s) => s.id));

    if (fs.existsSync(this.storageDir)) {
      try {
        const files = await fs.promises.readdir(this.storageDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const sid = file.replace(/\.json$/, "");
            if (!seenIds.has(sid)) {
              try {
                const raw = await fs.promises.readFile(path.join(this.storageDir, file), "utf8");
                results.push(JSON.parse(raw));
                seenIds.add(sid);
              } catch {}
            }
          }
        }
      } catch {}
    }

    if (userId) {
      return results.filter((s) => s.userId === userId);
    }
    return results.sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Exchanges credentials for Gemini Live API WebSocket endpoint.
   */
  public generateLiveToken(session: VoiceSession, apiKey?: string): VoiceTokenResponse {
    return {
      token: apiKey || process.env.GEMINI_API_KEY || "fabric-live-token",
      sessionId: session.id,
      endpoint: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent",
      mode: session.mode,
      persona: session.activePersona,
      sampleRate: 24000,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour
      slaTargetMs: session.metrics.slaThresholdMs,
    };
  }

  /**
   * Ingests an incoming audio packet from the browser/client, updates latency metrics,
   * and triggers voice synthesis when an utterance concludes.
   */
  public async ingestAudioPacket(
    sessionId: string,
    packet: AudioPacket
  ): Promise<{
    userDelta?: TranscriptDelta;
    replyDelta?: TranscriptDelta;
    replyAudio?: AudioPacket;
    metrics: VoiceLatencyMetrics;
  }> {
    const chunkStart = Date.now();
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`VoiceSession ${sessionId} not found`);
    }

    // Decode audio payload
    const buffer = base64ToBuffer(packet.data);
    const rms = calculateRmsEnergy(buffer);
    const durationMs = packet.durationMs || calculateAudioDurationMs(buffer.length, packet.sampleRate || 24000, packet.channels || 1);

    // Latency tracking
    const chunkLatency = Date.now() - chunkStart;
    session.metrics.audioChunkLatencyMs.push(chunkLatency);
    const sum = session.metrics.audioChunkLatencyMs.reduce((a, b) => a + b, 0);
    session.metrics.averageChunkLatencyMs = Math.round(sum / session.metrics.audioChunkLatencyMs.length);
    session.activeSpeaker = rms > 0.02 ? "user" : "idle";

    // If final packet of an utterance, formulate responder answer
    if (packet.isFinal) {
      // Simulate transcription or extract from metadata
      const transcriptText = (packet as any).transcriptText || "Let us deliberate on this dilemma.";
      const userDelta: TranscriptDelta = {
        id: `td_${Date.now()}_u`,
        sessionId,
        speaker: "user",
        delta: transcriptText,
        fullText: transcriptText,
        isFinal: true,
        timestamp: Date.now(),
      };
      session.transcript.push(userDelta);

      const sparRes = await this.spar(sessionId, transcriptText, session.mode);
      await this.persistSession(session);
      return {
        userDelta,
        replyDelta: sparRes.replyDelta,
        replyAudio: sparRes.replyAudio,
        metrics: session.metrics,
      };
    }

    await this.persistSession(session);
    return {
      metrics: session.metrics,
    };
  }

  /**
   * Socratic responder & conversational sparring engine.
   * Delivers targeted feedback and synthesized voice reply within SLA bounds.
   */
  public async spar(
    sessionId: string,
    input: string,
    mode?: VoiceMode
  ): Promise<{
    replyDelta: TranscriptDelta;
    replyAudio: AudioPacket;
    metrics: VoiceLatencyMetrics;
  }> {
    const turnStart = Date.now();
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`VoiceSession ${sessionId} not found`);
    }

    const currentMode = mode || session.mode;
    let replyText = "";
    let persona: CouncilPersonaId | string = session.activePersona;

    // Fast-path Socratic & Council generation
    if (currentMode === "socratic") {
      persona = "socratic";
      replyText = this.generateSocraticQuestion(input);
    } else if (currentMode === "sparring") {
      persona = "sceptic";
      replyText = this.generateSparringChallenge(input);
    } else if (currentMode === "executive_debrief") {
      persona = "architect";
      replyText = this.generateExecutiveDebrief(input);
    } else if (currentMode === "foci_flow") {
      persona = "biomechanic";
      replyText = this.generateFociFlowGuidance(input);
    } else {
      // polymath_council
      try {
        const councilReport = await Promise.race([
          conveneCouncil(session.userId, input),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
        ]);
        if (councilReport) {
          replyText = `The Stoic advises: "${councilReport.perspectives.stoic.quote}". Executive verdict: ${councilReport.verdict.action}`;
          persona = "stoic";
        } else {
          replyText = this.generateCouncilFallback(input);
        }
      } catch {
        replyText = this.generateCouncilFallback(input);
      }
    }

    const llmLatency = Date.now() - turnStart;
    session.metrics.llmFirstTokenMs = llmLatency;

    // Speech synthesis with 180ms SLA timeout budget
    const synthStart = Date.now();
    const synthesized = await this.synthesizer.synthesize(replyText, {
      persona,
      timeoutMs: 180,
    } as any);
    const ttsLatency = Date.now() - synthStart;
    session.metrics.ttsFirstAudioMs = ttsLatency;

    const roundTrip = Date.now() - turnStart;
    session.metrics.roundTripTimeMs = roundTrip;
    if (roundTrip > session.metrics.slaThresholdMs) {
      session.metrics.slaViolations += 1;
    }

    const replyDelta: TranscriptDelta = {
      id: `td_${Date.now()}_r`,
      sessionId,
      speaker: "council",
      persona,
      delta: replyText,
      fullText: replyText,
      isFinal: true,
      timestamp: Date.now(),
    };
    session.transcript.push(replyDelta);

    const replyAudio: AudioPacket = {
      sessionId,
      sequenceNumber: session.transcript.length,
      timestamp: Date.now(),
      sender: "agent",
      format: synthesized.format,
      sampleRate: synthesized.sampleRate,
      channels: synthesized.channels,
      data: synthesized.base64,
      isFinal: true,
      durationMs: synthesized.durationMs,
    };

    session.activeSpeaker = "council";
    session.activePersona = persona;

    await this.persistSession(session);

    return {
      replyDelta,
      replyAudio,
      metrics: session.metrics,
    };
  }

  /**
   * Concludes a VoiceSession and records final duration and metrics.
   */
  public async finishSession(sessionId: string): Promise<VoiceSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`VoiceSession ${sessionId} not found`);
    }

    session.status = "closed";
    session.endTime = Date.now();
    session.activeSpeaker = "idle";

    await this.persistSession(session);
    return session;
  }

  /**
   * Persists session state to local disk and Firestore.
   */
  public async persistSession(session: VoiceSession): Promise<void> {
    ensureDirectoryExists(this.storageDir);
    const localFile = path.join(this.storageDir, `${session.id}.json`);
    try {
      await fs.promises.writeFile(localFile, JSON.stringify(session, null, 2), "utf8");
    } catch (e) {
      console.warn(`[VoiceBridge] Failed to write local session ${session.id}:`, e);
    }

    if (db) {
      try {
        await Promise.race([
          db.collection("voice_sessions").doc(session.id).set(session, { merge: true }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Firestore voice session save timeout")), 1500)
          ),
        ]);
      } catch (err: any) {
        // Safe Firestore fallback
      }
    }
  }

  // --- Socratic & Persona Response Generators ---

  public generateSocraticQuestion(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes("focus") || lower.includes("distract")) {
      return "What underlying assumption makes this diversion seem urgent, and does it advance your primary 4F vector?";
    }
    if (lower.includes("code") || lower.includes("build") || lower.includes("bug")) {
      return "Before writing more lines: what minimal invariant would prove this component behaves correctly under stress?";
    }
    if (lower.includes("tired") || lower.includes("sleep") || lower.includes("energy")) {
      return "Are you experiencing cognitive resistance, or is your biological substrate signaling an acute somatic deficit?";
    }
    return "What is the core premise you are treating as immutable, and what occurs if you invert it?";
  }

  public generateSparringChallenge(input: string): string {
    return `You claim: "${input.slice(0, 45)}...". The Sceptic challenges: Where does this hypothesis fail when exposed to adversarial conditions on Day Three?`;
  }

  public generateExecutiveDebrief(input: string): string {
    return "Executive Assessment: Maintain focus discipline. Prune uncompounding tangents, log your trade, and protect cognitive momentum.";
  }

  public generateFociFlowGuidance(input: string): string {
    return "Diaphragmatic resonance detected. Deepen your exhalation, synchronize respiration with the blue flow wave, and hold the monotropic sprint.";
  }

  public generateCouncilFallback(input: string): string {
    return "The Council notes your dilemma. Balance systems modularity with metabolic conservation, and execute the highest expected-value trade.";
  }
}

export const defaultVoiceBridge = new VoiceBridge();
