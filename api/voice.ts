/**
 * Fabric OS — Real-Time Voice Channel Serverless Endpoint
 * /api/voice
 * 
 * Supports:
 * - Session initiation & Gemini Live API token exchange (action: "start")
 * - Streaming audio chunk ingestion & transcript synchronization (action: "audio")
 * - Low-latency Socratic & Polymath Council voice sparring (action: "spar")
 * - Neural speech synthesis via Edge-TTS / Gemini Live fallback (action: "speak")
 * - Session conclusion & dual-layer persistence (action: "finish")
 * - Session status and transcript history inspection (GET /api/voice?sessionId=...)
 */

import type { IncomingMessage, ServerResponse } from "http";
import { defaultVoiceBridge, VoiceBridge } from "../src/voice/bridge.js";
import { defaultSynthesizer, StreamingSynthesizer } from "../src/voice/synthesizer.js";
import type { AudioPacket, VoiceMode, CouncilPersonaId } from "../src/voice/types.js";
import { config } from "../src/config/env.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  });
  res.end(jsonStr);
}

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string> },
  res: ServerResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    });
    res.end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    // 1. GET Requests: Query Session, List Sessions, or Fetch Live Token
    if (req.method === "GET") {
      const sessionId = query.sessionId || query.id;
      const action = query.action;

      if (sessionId) {
        const session = await defaultVoiceBridge.getSession(sessionId);
        if (!session) {
          sendJson(res, 404, { success: false, error: `VoiceSession ${sessionId} not found` });
          return;
        }
        sendJson(res, 200, { success: true, session });
        return;
      }

      if (action === "sessions") {
        const userId = query.userId;
        const sessions = await defaultVoiceBridge.listSessions(userId);
        sendJson(res, 200, { success: true, count: sessions.length, sessions });
        return;
      }

      // Default GET: Return status and a transient token for Gemini Live API
      const tempSession = await defaultVoiceBridge.createSession({
        userId: query.userId || "operator",
        mode: (query.mode as VoiceMode) || "socratic",
        persona: query.persona || "socratic",
      });
      const tokenInfo = defaultVoiceBridge.generateLiveToken(tempSession, config.geminiApiKey);

      sendJson(res, 200, {
        success: true,
        status: "ready",
        channel: "Fabric OS Real-Time Voice Channel",
        slaTargetMs: 300,
        tokenInfo,
        session: tempSession,
      });
      return;
    }

    // 2. POST Requests: Voice Actions
    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      const action = body.action || query.action || "spar";

      switch (action) {
        case "start": {
          const session = await defaultVoiceBridge.createSession({
            userId: body.userId || "operator",
            mode: body.mode || "socratic",
            persona: body.persona || "socratic",
            metadata: body.metadata,
          });
          const tokenInfo = defaultVoiceBridge.generateLiveToken(session, config.geminiApiKey);
          sendJson(res, 201, {
            success: true,
            sessionId: session.id,
            session,
            tokenInfo,
          });
          return;
        }

        case "audio": {
          const sessionId = body.sessionId;
          if (!sessionId) {
            sendJson(res, 400, { success: false, error: "Missing sessionId in audio payload" });
            return;
          }

          const packet: AudioPacket = {
            sessionId,
            sequenceNumber: Number(body.sequenceNumber || 1),
            timestamp: Date.now(),
            sender: "user",
            format: body.format || "pcm16",
            sampleRate: Number(body.sampleRate || 24000),
            channels: Number(body.channels || 1),
            data: body.chunk || body.data || "",
            isFinal: Boolean(body.isFinal),
            durationMs: body.durationMs,
          };

          // Attach optional transcript text if speech-to-text was pre-processed client-side
          if (body.transcriptText) {
            (packet as any).transcriptText = body.transcriptText;
          }

          const ingestResult = await defaultVoiceBridge.ingestAudioPacket(sessionId, packet);
          sendJson(res, 200, {
            success: true,
            ...ingestResult,
          });
          return;
        }

        case "spar": {
          let sessionId = body.sessionId;
          if (!sessionId) {
            const newSession = await defaultVoiceBridge.createSession({
              userId: body.userId || "operator",
              mode: body.mode || "socratic",
              persona: body.persona || "socratic",
            });
            sessionId = newSession.id;
          }

          const input = body.input || body.text || "Spar with me on my current focus.";
          const mode = body.mode as VoiceMode | undefined;

          const sparResult = await defaultVoiceBridge.spar(sessionId, input, mode);
          sendJson(res, 200, {
            success: true,
            sessionId,
            ...sparResult,
          });
          return;
        }

        case "speak": {
          const text = body.text;
          if (!text) {
            sendJson(res, 400, { success: false, error: "Missing 'text' to synthesize" });
            return;
          }

          const persona = body.persona as CouncilPersonaId | undefined;
          const preferGeminiLive = Boolean(body.preferGeminiLive);
          const synthesized = await defaultSynthesizer.synthesize(text, {
            persona,
            preferGeminiLive,
          });

          sendJson(res, 200, {
            success: true,
            format: synthesized.format,
            audioBase64: synthesized.base64,
            durationMs: synthesized.durationMs,
            latencyMs: synthesized.latencyMs,
            synthesizer: synthesized.synthesizer,
            sampleRate: synthesized.sampleRate,
            channels: synthesized.channels,
          });
          return;
        }

        case "finish": {
          const sessionId = body.sessionId;
          if (!sessionId) {
            sendJson(res, 400, { success: false, error: "Missing sessionId to finish" });
            return;
          }

          const session = await defaultVoiceBridge.finishSession(sessionId);
          sendJson(res, 200, {
            success: true,
            session,
            metrics: session.metrics,
          });
          return;
        }

        default:
          sendJson(res, 400, {
            success: false,
            error: `Unsupported action: '${action}'. Valid actions: start, audio, spar, speak, finish.`,
          });
          return;
      }
    }

    sendJson(res, 405, { success: false, error: "Method not allowed" });
  } catch (error: any) {
    console.error("[VoiceEndpoint] Error processing request:", error);
    sendJson(res, 500, {
      success: false,
      error: error?.message || "Internal Voice Server Error",
    });
  }
}
