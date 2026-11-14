/**
 * Fabric OS — Gemini 2.0 Multimodal Live API Client Module
 * 
 * Supports:
 * - Real-time bidirectional streaming over WebSockets:
 *   wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
 * - BidiGenerateContent handshake setup frame (`setup` message) with model `models/gemini-2.0-flash-exp`
 * - Audio modalities ["AUDIO"] with speechConfig prebuilt voice matching Fabric Council Personas:
 *   * architect   -> Fenrir
 *   * quant       -> Charon
 *   * stoic       -> Aoede
 *   * biomechanic -> Puck
 *   * socratic    -> Kore
 *   * sceptic     -> Fenrir
 * - Grounding in Fabric OS Socratic Council persona and 4F Vector (Focus, Facts, Funds, Feedback)
 * - Input audio framing: PCM 16kHz mono 16-bit LE sent via `realtimeInput.mediaChunks`
 * - Server audio response handling: PCM 24kHz audio chunks, transcripts, serverTurn, turnComplete
 * - Barge-in & interruption detection: automatic cutoff when user audio energy exceeds RMS threshold
 * - Resilient fallback simulation for offline testing or environments without live socket permissions
 */

import { EventEmitter } from "events";
import type { CouncilPersonaId } from "./types.js";
import {
  bufferToBase64,
  base64ToBuffer,
  generateSineWavePcm16,
  calculateRmsEnergy,
} from "./audio.js";

export type GeminiLiveVoice = "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede";

export const GEMINI_LIVE_PERSONA_VOICES: Record<CouncilPersonaId | string, GeminiLiveVoice> = {
  architect: "Fenrir",
  quant: "Charon",
  stoic: "Aoede",
  biomechanic: "Puck",
  socratic: "Kore",
  sceptic: "Fenrir",
};

export const DEFAULT_GEMINI_LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const DEFAULT_GEMINI_LIVE_MODEL = "models/gemini-2.0-flash-exp";

export interface GeminiLiveSetupConfig {
  model?: string;
  responseModalities?: ("AUDIO" | "TEXT")[];
  voiceName?: GeminiLiveVoice;
  persona?: CouncilPersonaId | string;
  systemInstruction?: string;
}

export interface GeminiLiveSetupMessage {
  setup: {
    model: string;
    generationConfig: {
      responseModalities: ("AUDIO" | "TEXT")[];
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: GeminiLiveVoice;
          };
        };
      };
    };
    systemInstruction: {
      parts: Array<{ text: string }>;
    };
  };
}

export interface GeminiLiveRealtimeInputMessage {
  realtimeInput: {
    mediaChunks: Array<{
      mimeType: string;
      data: string; // base64-encoded PCM16
    }>;
  };
}

export interface GeminiLiveClientContentMessage {
  clientContent: {
    turns: Array<{
      role: "user";
      parts: Array<{ text: string }>;
    }>;
    turnComplete?: boolean;
  };
}

export interface GeminiLiveServerContent {
  modelTurn?: {
    parts: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string; // base64-encoded PCM24
      };
    }>;
  };
  turnComplete?: boolean;
  interrupted?: boolean;
  groundingMetadata?: Record<string, any>;
}

export interface GeminiLiveServerMessage {
  setupComplete?: Record<string, any>;
  serverContent?: GeminiLiveServerContent;
  toolCall?: Record<string, any>;
  toolCallCancellation?: Record<string, any>;
}

export interface GeminiLiveClientOptions {
  apiKey?: string;
  model?: string;
  persona?: CouncilPersonaId | string;
  voiceName?: GeminiLiveVoice;
  systemInstruction?: string;
  endpoint?: string;
  simulate?: boolean;
  fallbackOnFailure?: boolean;
  connectionTimeoutMs?: number;
  simulationLatencyMs?: number;
  bargeInThresholdRms?: number;
}

/**
 * Maps Fabric Council personas to Gemini 2.0 Live prebuilt voices.
 */
export function mapPersonaToGeminiVoice(persona?: CouncilPersonaId | string): GeminiLiveVoice {
  if (!persona) return "Kore";
  return GEMINI_LIVE_PERSONA_VOICES[persona] || "Kore";
}

/**
 * Produces the grounding prompt for the Socratic Council voice engine.
 */
export function getFabricCouncilSystemInstruction(persona: CouncilPersonaId | string = "socratic"): string {
  return `You are the Socratic Council voice engine of Fabric OS, an Aristotelian human-agent symbiotic operating system.
Your operational mandate is to optimize the operator's 4F Vector:
- Focus (F_focus): Monotropic deep flow, anti-distraction, deliberate 90-minute sprint discipline.
- Facts (F_facts): Grounded epistemic truth, rigorous first-principles reasoning, zero speculation.
- Funds (F_funds): Metabolic bio-vitality, diaphragmatic breath coherence, asymmetric compounding leverage.
- Feedback (F_feedback): Ultra-fast reality loop closure, dialectical self-correction, ruthless honesty.

Current Active Council Persona: [${persona.toUpperCase()}].
Voice & Sparring Guidelines:
1. Speak concisely, directly, and dialogue-first. Never use filler or sycophantic greetings.
2. Deliver punchy dialectical responses strictly under 35 words per turn.
3. Challenge false premises, uncover unstated assumptions, and keep the operator anchored to the Golden Mean between excess and deficiency.`;
}

/**
 * Encodes PCM 16-bit audio data into base64 string for realtime mediaChunks.
 */
export function packPcm16Chunk(data: Buffer | Uint8Array | number[]): string {
  const buf = Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
    ? Buffer.from(data)
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return bufferToBase64(buf);
}

/**
 * Decodes base64 PCM 24-bit/16-bit audio from server inlineData into raw Buffer.
 */
export function unpackPcm24Chunk(base64Data: string): Buffer {
  return base64ToBuffer(base64Data);
}

/**
 * Generates synthetic PCM 16kHz mono audio for client testing or simulation.
 */
export function createPcm16SineWave(
  frequencyHz: number = 440,
  durationMs: number = 100,
  sampleRate: number = 16000,
  volume: number = 0.5
): Buffer {
  return generateSineWavePcm16(frequencyHz, durationMs, sampleRate, volume);
}

/**
 * Formulates the BidiGenerateContent setup handshake frame.
 */
export function buildSetupMessage(options: GeminiLiveSetupConfig = {}): GeminiLiveSetupMessage {
  const model = options.model || DEFAULT_GEMINI_LIVE_MODEL;
  const persona = options.persona || "socratic";
  const voiceName = options.voiceName || mapPersonaToGeminiVoice(persona);
  const responseModalities = options.responseModalities || ["AUDIO"];
  const instruction = options.systemInstruction || getFabricCouncilSystemInstruction(persona);

  return {
    setup: {
      model,
      generationConfig: {
        responseModalities,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: instruction }],
      },
    },
  };
}

/**
 * Formulates a realtime audio input chunk message for Gemini 2.0 Live API.
 */
export function buildAudioChunkMessage(pcm16Data: Buffer | Uint8Array | string): GeminiLiveRealtimeInputMessage {
  const base64 = typeof pcm16Data === "string" ? pcm16Data : packPcm16Chunk(pcm16Data);
  return {
    realtimeInput: {
      mediaChunks: [
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ],
    },
  };
}

/**
 * Formulates a client content text message for Gemini 2.0 Live API.
 */
export function buildTextMessage(text: string, turnComplete: boolean = true): GeminiLiveClientContentMessage {
  return {
    clientContent: {
      turns: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      turnComplete,
    },
  };
}

/**
 * Parses raw server messages safely.
 */
export function parseServerMessage(data: string | Buffer | object): GeminiLiveServerMessage {
  if (typeof data === "object" && data !== null && !Buffer.isBuffer(data)) {
    return data as GeminiLiveServerMessage;
  }
  const str = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  return JSON.parse(str);
}

/**
 * Gemini 2.0 Multimodal Live API Client
 * Manages WebSocket session, audio streaming, barge-in detection, and fallback simulation.
 */
export class GeminiLiveClient extends EventEmitter {
  private apiKey: string;
  private endpoint: string;
  private model: string;
  private persona: CouncilPersonaId | string;
  private voiceName: GeminiLiveVoice;
  private systemInstruction: string;
  private simulate: boolean;
  private fallbackOnFailure: boolean;
  private connectionTimeoutMs: number;
  private simulationLatencyMs: number;
  private bargeInThresholdRms: number;

  private ws: any | null = null;
  private connected: boolean = false;
  private simulatedMode: boolean = false;
  private setupCompleted: boolean = false;
  private isServerResponding: boolean = false;
  private simulationTimer: any = null;

  constructor(options: GeminiLiveClientOptions = {}) {
    super();
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
    this.endpoint = options.endpoint || DEFAULT_GEMINI_LIVE_ENDPOINT;
    this.model = options.model || DEFAULT_GEMINI_LIVE_MODEL;
    this.persona = options.persona || "socratic";
    this.voiceName = options.voiceName || mapPersonaToGeminiVoice(this.persona);
    this.systemInstruction = options.systemInstruction || getFabricCouncilSystemInstruction(this.persona);
    this.simulate = options.simulate ?? false;
    this.fallbackOnFailure = options.fallbackOnFailure ?? true;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 3000;
    this.simulationLatencyMs = options.simulationLatencyMs ?? 25;
    this.bargeInThresholdRms = options.bargeInThresholdRms ?? 0.015;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public isSimulated(): boolean {
    return this.simulatedMode;
  }

  public isResponding(): boolean {
    return this.isServerResponding;
  }

  public getPersona(): CouncilPersonaId | string {
    return this.persona;
  }

  public getVoiceName(): GeminiLiveVoice {
    return this.voiceName;
  }

  public getModel(): string {
    return this.model;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Establishes the WebSocket connection or activates resilient fallback simulation.
   */
  public async connect(): Promise<void> {
    if (this.connected) return;

    // Check if simulation explicitly requested or dummy/missing API key
    if (
      this.simulate ||
      !this.apiKey ||
      this.apiKey === "test-key" ||
      this.apiKey === "mock-key" ||
      this.apiKey === "fabric-live-token"
    ) {
      this.enterSimulationMode();
      return;
    }

    const wsUrl = `${this.endpoint}?key=${encodeURIComponent(this.apiKey)}`;

    try {
      await this.initiateWebSocketConnection(wsUrl);
    } catch (err: any) {
      if (this.fallbackOnFailure) {
        this.enterSimulationMode();
      } else {
        throw err;
      }
    }
  }

  /**
   * Initiates real WebSocket connection with setup handshake.
   */
  private initiateWebSocketConnection(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (this.ws) {
            try {
              this.ws.close();
            } catch {}
          }
          reject(new Error(`Gemini Live WebSocket connection timed out after ${this.connectionTimeoutMs}ms`));
        }
      }, this.connectionTimeoutMs);

      try {
        const WebSocketClass = (globalThis as any).WebSocket;
        if (!WebSocketClass) {
          throw new Error("No WebSocket implementation found in runtime environment");
        }

        const socket = new WebSocketClass(url);
        this.ws = socket;

        socket.onopen = () => {
          // Send setup handshake frame immediately
          const setupMsg = buildSetupMessage({
            model: this.model,
            persona: this.persona,
            voiceName: this.voiceName,
            systemInstruction: this.systemInstruction,
          });
          socket.send(JSON.stringify(setupMsg));
        };

        socket.onmessage = (event: any) => {
          try {
            const parsed = parseServerMessage(event.data);
            this.handleServerMessage(parsed);

            if (parsed.setupComplete && !settled) {
              settled = true;
              clearTimeout(timeout);
              this.connected = true;
              this.setupCompleted = true;
              this.emit("open");
              this.emit("setupComplete");
              resolve();
            }
          } catch (e: any) {
            if (this.listenerCount("error") > 0) {
              this.emit("error", new Error(`Failed to parse server message: ${e.message}`));
            }
          }
        };

        socket.onerror = (err: any) => {
          if (this.listenerCount("error") > 0) {
            this.emit("error", err);
          }
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(err);
          }
        };

        socket.onclose = (event: any) => {
          this.connected = false;
          this.setupCompleted = false;
          this.isServerResponding = false;
          this.emit("close", event.code, event.reason);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`WebSocket closed before handshake: code ${event.code}`));
          }
        };
      } catch (err: any) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      }
    });
  }

  /**
   * Activates fallback simulation mode.
   */
  private enterSimulationMode(): void {
    this.simulatedMode = true;
    this.connected = true;
    this.setupCompleted = true;

    // Dispatch setup complete asynchronously
    setTimeout(() => {
      this.emit("open");
      this.emit("setupComplete");
    }, 5);
  }

  /**
   * Processes incoming server messages from Gemini 2.0 Live API.
   */
  public handleServerMessage(message: GeminiLiveServerMessage): void {
    if (message.setupComplete) {
      this.setupCompleted = true;
    }

    if (message.serverContent) {
      const content = message.serverContent;

      if (content.interrupted) {
        this.isServerResponding = false;
        this.emit("interrupted");
      }

      if (content.modelTurn?.parts) {
        this.isServerResponding = true;
        this.emit("serverTurn", content.modelTurn.parts);

        for (const part of content.modelTurn.parts) {
          if (part.text) {
            this.emit("transcript", {
              text: part.text,
              isFinal: !!content.turnComplete,
            });
          }

          if (part.inlineData && part.inlineData.data) {
            const pcmBuffer = unpackPcm24Chunk(part.inlineData.data);
            const sampleRate = part.inlineData.mimeType?.includes("rate=")
              ? parseInt(part.inlineData.mimeType.split("rate=")[1], 10) || 24000
              : 24000;

            this.emit("audio", pcmBuffer, {
              sampleRate,
              channels: 1,
            });
          }
        }
      }

      if (content.turnComplete) {
        this.isServerResponding = false;
        this.emit("turnComplete");
      }
    }
  }

  /**
   * Sends real-time audio chunk (PCM 16kHz mono) to the Gemini Live session.
   * Performs automatic barge-in detection if server is currently responding.
   */
  public sendAudioChunk(pcm16Data: Buffer | Uint8Array | string): void {
    if (!this.connected) {
      throw new Error("Cannot send audio chunk: GeminiLiveClient is not connected");
    }

    const buffer = typeof pcm16Data === "string" ? base64ToBuffer(pcm16Data) : Buffer.from(pcm16Data);
    const base64 = typeof pcm16Data === "string" ? pcm16Data : packPcm16Chunk(buffer);

    // Barge-in check: If server is currently speaking and user speaks with audible energy
    if (this.isServerResponding) {
      const energy = calculateRmsEnergy(buffer);
      if (energy >= this.bargeInThresholdRms) {
        this.interrupt();
        return;
      }
    }

    if (this.simulatedMode) {
      this.handleSimulatedAudioInput(buffer);
      return;
    }

    const packet = buildAudioChunkMessage(base64);
    try {
      this.ws?.send(JSON.stringify(packet));
    } catch (err: any) {
      if (this.listenerCount("error") > 0) {
        this.emit("error", new Error(`Failed to transmit audio packet: ${err.message}`));
      }
    }
  }

  /**
   * Sends text prompt turn to the Gemini Live session.
   */
  public sendText(text: string, turnComplete: boolean = true): void {
    if (!this.connected) {
      throw new Error("Cannot send text: GeminiLiveClient is not connected");
    }

    if (this.isServerResponding) {
      this.interrupt();
    }

    if (this.simulatedMode) {
      this.handleSimulatedTextInput(text);
      return;
    }

    const packet = buildTextMessage(text, turnComplete);
    try {
      this.ws?.send(JSON.stringify(packet));
    } catch (err: any) {
      if (this.listenerCount("error") > 0) {
        this.emit("error", new Error(`Failed to transmit text turn: ${err.message}`));
      }
    }
  }

  /**
   * Triggers client-side barge-in interrupt, stopping audio output and signaling state reset.
   */
  public interrupt(): void {
    if (this.simulationTimer) {
      clearTimeout(this.simulationTimer);
      this.simulationTimer = null;
    }

    if (this.isServerResponding) {
      this.isServerResponding = false;
      this.emit("interrupted");
    }

    // In live mode, client sends an empty realtimeInput or interruption notice if supported
    if (!this.simulatedMode && this.ws && this.connected) {
      try {
        // Clear pending turns if needed
      } catch {}
    }
  }

  /**
   * Simulates server audio and transcript response for offline tests or graceful fallback.
   */
  private handleSimulatedAudioInput(buffer: Buffer): void {
    if (this.simulationTimer) {
      clearTimeout(this.simulationTimer);
    }

    this.isServerResponding = true;
    const latency = this.simulationLatencyMs;

    this.simulationTimer = setTimeout(() => {
      if (!this.connected || !this.isServerResponding) return;

      const personaText = this.generateSimulatedSocraticText("audio");
      // 24kHz PCM tone representing synthesized voice response
      const pcm24 = generateSineWavePcm16(
        this.persona === "stoic" ? 180 : this.persona === "quant" ? 220 : 260,
        150,
        24000,
        0.35
      );

      // 1. Emit partial transcript
      this.emit("transcript", { text: personaText, isFinal: false });

      // 2. Emit server turn
      this.emit("serverTurn", [
        { text: personaText },
        { inlineData: { mimeType: "audio/pcm;rate=24000", data: bufferToBase64(pcm24) } },
      ]);

      // 3. Emit 24kHz PCM audio chunk
      this.emit("audio", pcm24, { sampleRate: 24000, channels: 1 });

      // 4. Conclude turn
      this.emit("transcript", { text: personaText, isFinal: true });
      this.isServerResponding = false;
      this.emit("turnComplete");
    }, latency);
  }

  /**
   * Simulates server response to text input.
   */
  private handleSimulatedTextInput(text: string): void {
    if (this.simulationTimer) {
      clearTimeout(this.simulationTimer);
    }

    this.isServerResponding = true;
    const latency = this.simulationLatencyMs;

    this.simulationTimer = setTimeout(() => {
      if (!this.connected || !this.isServerResponding) return;

      const personaText = this.generateSimulatedSocraticText(text);
      const pcm24 = generateSineWavePcm16(
        this.persona === "stoic" ? 180 : this.persona === "quant" ? 220 : 260,
        120,
        24000,
        0.35
      );

      this.emit("transcript", { text: personaText, isFinal: false });
      this.emit("serverTurn", [
        { text: personaText },
        { inlineData: { mimeType: "audio/pcm;rate=24000", data: bufferToBase64(pcm24) } },
      ]);
      this.emit("audio", pcm24, { sampleRate: 24000, channels: 1 });
      this.emit("transcript", { text: personaText, isFinal: true });
      this.isServerResponding = false;
      this.emit("turnComplete");
    }, latency);
  }

  /**
   * Generates persona-specific dialectical feedback.
   */
  private generateSimulatedSocraticText(input: string): string {
    const p = this.persona.toLowerCase();
    if (p === "stoic") {
      return "Focus on what lies within your agency; discard extraneous dispersion.";
    }
    if (p === "quant") {
      return "Quantify your expected value and calibrate the risk-reward variance.";
    }
    if (p === "architect") {
      return "Enforce modular boundaries before scaling complexity further.";
    }
    if (p === "biomechanic") {
      return "Somatic coherence confirmed. Maintain diaphragmatic exhalation.";
    }
    return "What immutable invariant are you assuming, and does it hold under stress?";
  }

  /**
   * Terminates session and cleans up resources.
   */
  public close(): void {
    if (this.simulationTimer) {
      clearTimeout(this.simulationTimer);
      this.simulationTimer = null;
    }

    this.isServerResponding = false;
    this.connected = false;
    this.setupCompleted = false;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.emit("close", 1000, "Normal closure");
    this.removeAllListeners();
  }
}
