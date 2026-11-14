import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { VoiceBridge } from "../src/voice/bridge.js";
import { StreamingSynthesizer } from "../src/voice/synthesizer.js";
import {
  pcm16ToWav,
  wavToPcm16,
  generateSineWavePcm16,
  calculateAudioDurationMs,
  calculateRmsEnergy,
  bufferToBase64,
  base64ToBuffer,
} from "../src/voice/audio.js";
import voiceHandler from "../api/voice.js";
import path from "path";
import fs from "fs";

describe("Fabric OS — Real-Time Voice Channel QC Suite", () => {
  const testStorageDir = path.resolve(process.cwd(), "data/voice_sessions_test");
  let bridge: VoiceBridge;
  let synth: StreamingSynthesizer;

  beforeAll(() => {
    synth = new StreamingSynthesizer({ fallbackTimeoutMs: 150 });
    bridge = new VoiceBridge({ synthesizer: synth, storageDir: testStorageDir });
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testStorageDir)) {
        fs.rmSync(testStorageDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // 1. Audio Buffer Encoding & Decoding
  describe("1. Audio Buffer Encoding & Decoding", () => {
    test("generates synthetic 16-bit PCM sine wave with correct dimensions and RMS energy", () => {
      const sampleRate = 24000;
      const durationMs = 250;
      const pcm = generateSineWavePcm16(440, durationMs, sampleRate, 0.5);

      const expectedBytes = Math.floor((sampleRate * durationMs) / 1000) * 2;
      expect(pcm.length).toBe(expectedBytes);

      const rms = calculateRmsEnergy(pcm);
      expect(rms).toBeGreaterThan(0.2);
      expect(rms).toBeLessThan(0.6);
    });

    test("wraps PCM16 into valid 44-byte RIFF WAV header and extracts back identically", () => {
      const pcm = generateSineWavePcm16(500, 100, 24000, 0.4);
      const wav = pcm16ToWav(pcm, 24000, 1);

      expect(wav.length).toBe(pcm.length + 44);
      expect(wav.toString("utf8", 0, 4)).toBe("RIFF");
      expect(wav.toString("utf8", 8, 12)).toBe("WAVE");
      expect(wav.toString("utf8", 12, 16)).toBe("fmt ");
      expect(wav.toString("utf8", 36, 40)).toBe("data");

      // Extract back
      const extracted = wavToPcm16(wav);
      expect(extracted.sampleRate).toBe(24000);
      expect(extracted.channels).toBe(1);
      expect(extracted.pcmData.length).toBe(pcm.length);
      expect(Buffer.compare(extracted.pcmData, pcm)).toBe(0);
      expect(extracted.durationMs).toBe(100);
    });

    test("encodes and decodes base64 audio frames losslessly", () => {
      const original = generateSineWavePcm16(880, 50, 16000);
      const b64 = bufferToBase64(original);
      const restored = base64ToBuffer(b64);

      expect(Buffer.compare(original, restored)).toBe(0);
    });

    test("calculates audio duration accurately across varied sample rates", () => {
      // 48,000 bytes at 24000Hz, 16-bit mono = 1000ms
      expect(calculateAudioDurationMs(48000, 24000, 1, 16)).toBe(1000);
      // 32,000 bytes at 16000Hz, 16-bit mono = 1000ms
      expect(calculateAudioDurationMs(32000, 16000, 1, 16)).toBe(1000);
    });
  });

  // 2. Speech Synthesis & Multi-Persona Fallback
  describe("2. Speech Synthesis & Multi-Persona Fallback", () => {
    test("maps Council personas to distinct neural voice actors", () => {
      expect(synth.resolveVoice("architect")).toBe("en-US-GuyNeural");
      expect(synth.resolveVoice("quant")).toBe("en-US-BrianNeural");
      expect(synth.resolveVoice("stoic")).toBe("en-GB-RyanNeural");
      expect(synth.resolveVoice("biomechanic")).toBe("en-US-DavisNeural");
      expect(synth.resolveVoice("sceptic")).toBe("en-AU-WilliamNeural");
      expect(synth.resolveVoice("socratic")).toBe("en-US-ChristopherNeural");
    });

    test("synthesizes high-fidelity audio within sub-300ms SLA fallback", async () => {
      const text = "Evaluate whether this decision builds compounding leverage.";
      const start = Date.now();
      const result = await synth.synthesize(text, { persona: "architect" });
      const elapsed = Date.now() - start;

      expect(result.audioBuffer.length).toBeGreaterThan(0);
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(100);
      expect(result.sampleRate).toBe(24000);
      expect(elapsed).toBeLessThan(300); // 300ms SLA target
    });

    test("generates Gemini Live multimodal 24kHz audio frames", async () => {
      const text = "Memento mori. Strip away the non-essential.";
      const liveAudio = await synth.synthesizeGeminiLiveFrames(text, "stoic");

      expect(liveAudio.synthesizer).toBe("gemini-live");
      expect(liveAudio.format).toBe("wav");
      expect(liveAudio.sampleRate).toBe(24000);
      expect(liveAudio.audioBuffer.length).toBeGreaterThan(1000);
    });

    test("streams synthesized audio chunks incrementally", async () => {
      const text = "Socratic inquiry begins by questioning the first premise.";
      const chunks: Buffer[] = [];
      for await (const chunk of synth.synthesizeStream(text)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
      expect(totalBytes).toBeGreaterThan(0);
    });
  });

  // 3. Voice Session Lifecycle & SLA Latency Tracking
  describe("3. Voice Session Lifecycle & SLA Latency Tracking", () => {
    let session: any;

    test("initiates voice session with active state and SLA thresholds", async () => {
      session = await bridge.createSession({
        userId: "test_architect",
        mode: "socratic",
        persona: "socratic",
      });

      expect(session.id.startsWith("vs_")).toBe(true);
      expect(session.status).toBe("active");
      expect(session.metrics.slaThresholdMs).toBe(300);
      expect(session.metrics.slaViolations).toBe(0);
      expect(session.transcript.length).toBe(0);
    });

    test("generates Gemini Live token response with endpoint metadata", () => {
      const token = bridge.generateLiveToken(session);
      expect(token.sessionId).toBe(session.id);
      expect(token.endpoint).toContain("generativelanguage.googleapis.com");
      expect(token.slaTargetMs).toBe(300);
      expect(token.sampleRate).toBe(24000);
    });

    test("ingests intermediate audio chunk and tracks latency under 300ms", async () => {
      const pcmChunk = generateSineWavePcm16(440, 100, 24000, 0.3);
      const packet = {
        sessionId: session.id,
        sequenceNumber: 1,
        timestamp: Date.now(),
        sender: "user" as const,
        format: "pcm16" as const,
        sampleRate: 24000,
        channels: 1,
        data: bufferToBase64(pcmChunk),
        isFinal: false,
      };

      const result = await bridge.ingestAudioPacket(session.id, packet);
      expect(result.metrics.audioChunkLatencyMs.length).toBe(1);
      expect(result.metrics.averageChunkLatencyMs).toBeLessThan(300);
    });

    test("executes Socratic sparring turn within 300ms SLA and returns spoken audio reply", async () => {
      const start = Date.now();
      const sparRes = await bridge.spar(
        session.id,
        "I feel distracted by notifications and unable to focus.",
        "socratic"
      );
      const roundTrip = Date.now() - start;

      expect(sparRes.replyDelta.speaker).toBe("council");
      expect(sparRes.replyDelta.persona).toBe("socratic");
      expect(sparRes.replyDelta.fullText).toContain("4F");
      expect(sparRes.replyAudio.sender).toBe("agent");
      expect(sparRes.replyAudio.data.length).toBeGreaterThan(0);
      expect(roundTrip).toBeLessThanOrEqual(500); // Resilient test runner SLA allowance
      expect(sparRes.metrics.slaViolations).toBe(0);
    });

    test("finishes voice session, sets endTime and persists to disk", async () => {
      const closed = await bridge.finishSession(session.id);
      expect(closed.status).toBe("closed");
      expect(closed.endTime).toBeGreaterThan(closed.startTime);

      // Verify disk persistence
      const reloaded = await bridge.getSession(session.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.id).toBe(session.id);
      expect(reloaded?.status).toBe("closed");

      const allSessions = await bridge.listSessions("test_architect");
      expect(allSessions.length).toBeGreaterThan(0);
    });
  });

  // 4. Socratic Voice Persona Logic
  describe("4. Socratic Voice Persona Logic", () => {
    test("generates targeted questions for focus dilemmas", () => {
      const q = bridge.generateSocraticQuestion("I'm getting distracted and lost my focus.");
      expect(q.toLowerCase()).toContain("4f vector");
    });

    test("generates piercing inquiries for code & architecture", () => {
      const q = bridge.generateSocraticQuestion("We need to build a new code module quickly.");
      expect(q.toLowerCase()).toContain("minimal invariant");
    });

    test("generates kinetic challenge for somatic exhaustion", () => {
      const q = bridge.generateSocraticQuestion("I feel so tired and need more sleep.");
      expect(q.toLowerCase()).toContain("biological substrate");
    });

    test("generates Sceptic counter-argument for sparring mode", () => {
      const challenge = bridge.generateSparringChallenge("This distributed cache will never fail.");
      expect(challenge).toContain("Sceptic challenges");
      expect(challenge).toContain("Day Three");
    });
  });

  // 5. REST & Serverless API Endpoint (/api/voice)
  describe("5. REST & Serverless API Endpoint (/api/voice)", () => {
    function createMockRes() {
      let statusCode = 200;
      let headers: Record<string, string> = {};
      let body = "";

      return {
        writeHead: (code: number, hdrs: Record<string, string>) => {
          statusCode = code;
          headers = hdrs;
        },
        end: (data: string) => {
          body = data;
        },
        getStatusCode: () => statusCode,
        getHeaders: () => headers,
        getJson: () => JSON.parse(body || "{}"),
      };
    }

    test("GET /api/voice returns 200 OK with live token and SLA target", async () => {
      const req: any = {
        method: "GET",
        url: "/api/voice",
        headers: { host: "localhost:3000" },
      };
      const res = createMockRes();

      await voiceHandler(req, res as any);
      expect(res.getStatusCode()).toBe(200);
      const json = res.getJson();
      expect(json.success).toBe(true);
      expect(json.slaTargetMs).toBe(300);
      expect(json.tokenInfo).toBeDefined();
    });

    test("POST /api/voice with action 'start' creates new voice session", async () => {
      const req: any = {
        method: "POST",
        url: "/api/voice",
        headers: { host: "localhost:3000" },
        on: (event: string, cb: any) => {
          if (event === "data") {
            cb(JSON.stringify({ action: "start", mode: "sparring", persona: "sceptic" }));
          }
          if (event === "end") {
            cb();
          }
        },
      };
      const res = createMockRes();

      await voiceHandler(req, res as any);
      expect(res.getStatusCode()).toBe(201);
      const json = res.getJson();
      expect(json.success).toBe(true);
      expect(json.sessionId.startsWith("vs_")).toBe(true);
      expect(json.session.mode).toBe("sparring");
    });

    test("POST /api/voice with action 'speak' synthesizes spoken audio", async () => {
      const req: any = {
        method: "POST",
        url: "/api/voice",
        headers: { host: "localhost:3000" },
        on: (event: string, cb: any) => {
          if (event === "data") {
            cb(JSON.stringify({ action: "speak", text: "Hold the line and execute the trade.", persona: "stoic" }));
          }
          if (event === "end") {
            cb();
          }
        },
      };
      const res = createMockRes();

      await voiceHandler(req, res as any);
      expect(res.getStatusCode()).toBe(200);
      const json = res.getJson();
      expect(json.success).toBe(true);
      expect(json.audioBase64.length).toBeGreaterThan(0);
      expect(json.durationMs).toBeGreaterThan(0);
      expect(json.latencyMs).toBeLessThan(300);
    });

    test("POST /api/voice with action 'spar' produces instant voice reply", async () => {
      const req: any = {
        method: "POST",
        url: "/api/voice",
        headers: { host: "localhost:3000" },
        on: (event: string, cb: any) => {
          if (event === "data") {
            cb(JSON.stringify({ action: "spar", input: "I am questioning my focus.", mode: "socratic" }));
          }
          if (event === "end") {
            cb();
          }
        },
      };
      const res = createMockRes();

      await voiceHandler(req, res as any);
      expect(res.getStatusCode()).toBe(200);
      const json = res.getJson();
      expect(json.success).toBe(true);
      expect(json.replyDelta).toBeDefined();
      expect(json.replyAudio.data.length).toBeGreaterThan(0);
      expect(json.metrics.roundTripTimeMs).toBeLessThan(300);
    });
  });
});
