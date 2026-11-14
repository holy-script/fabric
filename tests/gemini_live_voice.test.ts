import { describe, test, expect } from "bun:test";
import {
  GeminiLiveClient,
  mapPersonaToGeminiVoice,
  getFabricCouncilSystemInstruction,
  packPcm16Chunk,
  unpackPcm24Chunk,
  createPcm16SineWave,
  buildSetupMessage,
  buildAudioChunkMessage,
  buildTextMessage,
  parseServerMessage,
  GEMINI_LIVE_PERSONA_VOICES,
  DEFAULT_GEMINI_LIVE_MODEL,
  DEFAULT_GEMINI_LIVE_ENDPOINT,
} from "../src/voice/gemini-live.js";
import { calculateRmsEnergy } from "../src/voice/audio.js";

describe("Fabric OS — Gemini 2.0 Multimodal Live API Voice Engine QC Suite", () => {
  // 1. Setup Message Payload Generation
  describe("1. Setup Message Payload Generation", () => {
    test("generates standard setup frame with default model and Socratic persona", () => {
      const setupMsg = buildSetupMessage();

      expect(setupMsg.setup).toBeDefined();
      expect(setupMsg.setup.model).toBe(DEFAULT_GEMINI_LIVE_MODEL);
      expect(setupMsg.setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
      expect(setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
      expect(setupMsg.setup.systemInstruction.parts[0].text).toContain("Fabric OS");
      expect(setupMsg.setup.systemInstruction.parts[0].text).toContain("4F Vector");
    });

    test("generates setup frame customized for Stoic persona and custom model", () => {
      const setupMsg = buildSetupMessage({
        model: "models/gemini-2.0-flash-exp",
        persona: "stoic",
        systemInstruction: "Custom Stoic Grounding Prompt",
      });

      expect(setupMsg.setup.model).toBe("models/gemini-2.0-flash-exp");
      expect(setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Aoede");
      expect(setupMsg.setup.systemInstruction.parts[0].text).toBe("Custom Stoic Grounding Prompt");
    });

    test("accepts explicit voiceName override", () => {
      const setupMsg = buildSetupMessage({
        persona: "architect",
        voiceName: "Puck",
      });

      expect(setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Puck");
    });
  });

  // 2. Audio Frame Packing and Unpacking
  describe("2. Audio Frame Packing and Unpacking", () => {
    test("packs PCM 16kHz audio buffer into base64 realtimeInput chunk message", () => {
      const pcm16 = createPcm16SineWave(440, 100, 16000, 0.4);
      // 100ms at 16000Hz, 16-bit mono = 1600 samples * 2 bytes = 3200 bytes
      expect(pcm16.length).toBe(3200);

      const b64 = packPcm16Chunk(pcm16);
      expect(typeof b64).toBe("string");
      expect(b64.length).toBeGreaterThan(0);

      const packet = buildAudioChunkMessage(pcm16);
      expect(packet.realtimeInput.mediaChunks[0].mimeType).toBe("audio/pcm;rate=16000");
      expect(packet.realtimeInput.mediaChunks[0].data).toBe(b64);
    });

    test("unpacks PCM 24kHz base64 payload into lossless raw audio buffer", () => {
      const originalPcm = createPcm16SineWave(260, 50, 24000, 0.5);
      const b64 = packPcm16Chunk(originalPcm);

      const unpacked = unpackPcm24Chunk(b64);
      expect(Buffer.compare(originalPcm, unpacked)).toBe(0);
    });

    test("builds client content text turn message with turnComplete flag", () => {
      const msg = buildTextMessage("Evaluate 4F focus drift.", true);
      expect(msg.clientContent.turns[0].role).toBe("user");
      expect(msg.clientContent.turns[0].parts[0].text).toBe("Evaluate 4F focus drift.");
      expect(msg.clientContent.turnComplete).toBe(true);
    });

    test("computes audio energy from synthetic 16kHz sine wave", () => {
      const pcm16 = createPcm16SineWave(440, 100, 16000, 0.5);
      const energy = calculateRmsEnergy(pcm16);
      expect(energy).toBeGreaterThan(0.25);
      expect(energy).toBeLessThan(0.5);
    });
  });

  // 3. Persona Voice Mapping & System Prompt Grounding
  describe("3. Persona Voice Mapping & System Prompt Grounding", () => {
    test("maps each Fabric Council persona to its exact prebuilt Gemini Live voice", () => {
      expect(mapPersonaToGeminiVoice("architect")).toBe("Fenrir");
      expect(mapPersonaToGeminiVoice("quant")).toBe("Charon");
      expect(mapPersonaToGeminiVoice("stoic")).toBe("Aoede");
      expect(mapPersonaToGeminiVoice("biomechanic")).toBe("Puck");
      expect(mapPersonaToGeminiVoice("socratic")).toBe("Kore");
      expect(mapPersonaToGeminiVoice("sceptic")).toBe("Fenrir");
    });

    test("falls back cleanly to Kore when given undefined or unknown persona", () => {
      expect(mapPersonaToGeminiVoice(undefined)).toBe("Kore");
      expect(mapPersonaToGeminiVoice("unknown_persona")).toBe("Kore");
    });

    test("embeds 4F vector (Focus, Facts, Funds, Feedback) and persona in system instruction", () => {
      const prompt = getFabricCouncilSystemInstruction("quant");
      expect(prompt).toContain("QUANT");
      expect(prompt).toContain("Focus (F_focus)");
      expect(prompt).toContain("Facts (F_facts)");
      expect(prompt).toContain("Funds (F_funds)");
      expect(prompt).toContain("Feedback (F_feedback)");
      expect(prompt).toContain("Golden Mean");
    });
  });

  // 4. Session Lifecycle (Connect, Stream Chunks, Receive Audio, Interrupt, Close)
  describe("4. Session Lifecycle & Interaction Flows", () => {
    test("initiates session in simulation mode and emits open & setupComplete", async () => {
      const client = new GeminiLiveClient({
        persona: "architect",
        simulate: true,
        simulationLatencyMs: 15,
      });

      expect(client.isConnected()).toBe(false);
      expect(client.getPersona()).toBe("architect");
      expect(client.getVoiceName()).toBe("Fenrir");

      let opened = false;
      let setupDone = false;

      client.on("open", () => {
        opened = true;
      });
      client.on("setupComplete", () => {
        setupDone = true;
      });

      await client.connect();

      // Give event loop tick for async events
      await new Promise((r) => setTimeout(r, 20));

      expect(client.isConnected()).toBe(true);
      expect(client.isSimulated()).toBe(true);
      expect(opened).toBe(true);
      expect(setupDone).toBe(true);

      client.close();
      expect(client.isConnected()).toBe(false);
    });

    test("streams audio chunk and receives server response (transcript, 24kHz audio, turnComplete)", async () => {
      const client = new GeminiLiveClient({
        persona: "stoic",
        simulate: true,
        simulationLatencyMs: 20,
      });

      await client.connect();

      let receivedAudio: Buffer | null = null;
      let audioSampleRate = 0;
      let receivedTranscript = "";
      let turnDone = false;

      client.on("audio", (buf, meta) => {
        receivedAudio = buf;
        audioSampleRate = meta.sampleRate;
      });

      client.on("transcript", (delta) => {
        if (delta.isFinal) {
          receivedTranscript = delta.text;
        }
      });

      client.on("turnComplete", () => {
        turnDone = true;
      });

      // Send 16kHz PCM audio chunk
      const inputPcm = createPcm16SineWave(440, 100, 16000, 0.4);
      client.sendAudioChunk(inputPcm);

      expect(client.isResponding()).toBe(true);

      // Await turn completion
      await new Promise<void>((resolve) => {
        client.on("turnComplete", () => resolve());
      });

      expect(turnDone).toBe(true);
      expect(receivedAudio).not.toBeNull();
      expect(audioSampleRate).toBe(24000);
      expect(receivedTranscript.length).toBeGreaterThan(0);
      expect(receivedTranscript).toContain("agency");
      expect(client.isResponding()).toBe(false);

      client.close();
    });

    test("handles programmatic barge-in interruption while server is responding", async () => {
      const client = new GeminiLiveClient({
        persona: "quant",
        simulate: true,
        simulationLatencyMs: 60, // Slower response to permit interruption
      });

      await client.connect();

      let interrupted = false;
      client.on("interrupted", () => {
        interrupted = true;
      });

      client.sendText("Calculate downside exposure.");
      expect(client.isResponding()).toBe(true);

      // Trigger immediate interruption before 60ms timer fires
      await new Promise((r) => setTimeout(r, 10));
      client.interrupt();

      expect(interrupted).toBe(true);
      expect(client.isResponding()).toBe(false);

      // Verify that after interrupt, old timer does not fire turnComplete
      let lateTurnComplete = false;
      client.on("turnComplete", () => {
        lateTurnComplete = true;
      });

      await new Promise((r) => setTimeout(r, 80));
      expect(lateTurnComplete).toBe(false);

      client.close();
    });

    test("triggers automatic acoustic barge-in when client audio exceeds RMS energy threshold", async () => {
      const client = new GeminiLiveClient({
        persona: "biomechanic",
        simulate: true,
        simulationLatencyMs: 60,
        bargeInThresholdRms: 0.02,
      });

      await client.connect();

      let interrupted = false;
      client.on("interrupted", () => {
        interrupted = true;
      });

      client.sendText("Guide my breath rhythm.");
      expect(client.isResponding()).toBe(true);

      await new Promise((r) => setTimeout(r, 10));

      // User speaks over the AI with audible volume (RMS ~0.35)
      const loudUserAudio = createPcm16SineWave(300, 100, 16000, 0.5);
      client.sendAudioChunk(loudUserAudio);

      expect(interrupted).toBe(true);
      expect(client.isResponding()).toBe(false);

      client.close();
    });

    test("handles incoming server turn parts parsing via handleServerMessage", () => {
      const client = new GeminiLiveClient({ persona: "socratic", simulate: true });

      let parsedText = "";
      let parsedAudioBytes = 0;
      let turnFinished = false;

      client.on("transcript", (d) => {
        parsedText += d.text;
      });
      client.on("audio", (buf) => {
        parsedAudioBytes += buf.length;
      });
      client.on("turnComplete", () => {
        turnFinished = true;
      });

      const pcm24 = createPcm16SineWave(440, 100, 24000);
      const b64Audio = packPcm16Chunk(pcm24);

      client.handleServerMessage({
        serverContent: {
          modelTurn: {
            parts: [
              { text: "Examine the unstated premise." },
              { inlineData: { mimeType: "audio/pcm;rate=24000", data: b64Audio } },
            ],
          },
          turnComplete: true,
        },
      });

      expect(parsedText).toBe("Examine the unstated premise.");
      expect(parsedAudioBytes).toBe(pcm24.length);
      expect(turnFinished).toBe(true);
    });
  });

  // 5. Resilient Error Handling & Safe Fallback
  describe("5. Resilient Error Handling & Safe Fallback", () => {
    test("throws descriptive error when transmitting audio while disconnected", () => {
      const client = new GeminiLiveClient({ simulate: false });
      expect(() => {
        client.sendAudioChunk(Buffer.alloc(100));
      }).toThrow("GeminiLiveClient is not connected");
    });

    test("throws descriptive error when transmitting text while disconnected", () => {
      const client = new GeminiLiveClient({ simulate: false });
      expect(() => {
        client.sendText("Hello");
      }).toThrow("GeminiLiveClient is not connected");
    });

    test("parses JSON server messages safely and throws on corrupt payloads", () => {
      const valid = parseServerMessage(JSON.stringify({ setupComplete: {} }));
      expect(valid.setupComplete).toBeDefined();

      expect(() => {
        parseServerMessage("NOT_VALID_JSON{:::broken");
      }).toThrow();
    });

    test("automatically activates simulation fallback if live WebSocket endpoint is unreachable", async () => {
      // Point to an unreachable port with short timeout and fallbackOnFailure enabled
      const client = new GeminiLiveClient({
        endpoint: "wss://127.0.0.1:59999/unreachable-live-bidi",
        apiKey: "unauthorized-dummy-key",
        connectionTimeoutMs: 100,
        fallbackOnFailure: true,
      });

      await client.connect();

      expect(client.isConnected()).toBe(true);
      expect(client.isSimulated()).toBe(true);

      client.close();
    });

    test("rejects connection when fallbackOnFailure is explicitly disabled on unreachable host", async () => {
      const client = new GeminiLiveClient({
        endpoint: "wss://127.0.0.1:59999/unreachable-live-bidi",
        apiKey: "dummy-key",
        connectionTimeoutMs: 50,
        fallbackOnFailure: false,
      });

      let threw = false;
      try {
        await client.connect();
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(client.isConnected()).toBe(false);

      client.close();
    });
  });
});
