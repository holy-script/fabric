import type { IncomingMessage, ServerResponse } from "http";
import { Bot } from "grammy";
import { config } from "../../src/config/env.js";
import { ingestBiometricPayload } from "../../src/services/wearables.js";
import { ingestFociTelemetry, getFociBridgeState } from "../../src/integrations/foci/bridge.js";
import { decodeFociPacket } from "../../src/integrations/foci/protocol.js";
import type { FociTelemetryPacket } from "../../src/integrations/foci/types.js";

const bot = new Bot(config.telegramToken);

/**
 * Safely parses the HTTP request body whether incoming as pre-parsed or stream.
 */
async function parseBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body) {
    if (typeof (req as any).body === "object") {
      return (req as any).body;
    }
    try {
      return JSON.parse((req as any).body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // Fallback for form-urlencoded payload= format
        try {
          const params = new URLSearchParams(raw);
          const payloadStr = params.get("payload");
          if (payloadStr) {
            return resolve(JSON.parse(payloadStr));
          }
        } catch {}
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(
  req: IncomingMessage & {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: ServerResponse
) {
  // 1. Health check & setup info for GET requests
  if (req.method === "GET") {
    const fociState = getFociBridgeState();
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: "ok",
        platform: "The Fabric: 4F Meta-OS",
        service: "Wearables & Biometric Telemetry Ingress Active",
        endpoint: "/api/webhooks/health",
        foci: fociState,
        supportedSources: [
          "FOCI Wearable BLE Bridge (TinyLogics Diaphragmatic Breath & Focus)",
          "Apple Watch (Health Auto Export)",
          "iOS Shortcuts (HealthKit)",
          "Whoop 4.0 Developer API",
          "Garmin Connect / Zepp OS / Amazfit",
          "Oura Ring",
          "Generic JSON biometrics",
        ],
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    const rawUrl = req.url || "";
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const queryUserId = parsedUrl.searchParams.get("userId") || parsedUrl.searchParams.get("user_id");
    const queryToken = parsedUrl.searchParams.get("token");

    const headerToken = (
      req.headers["x-fabric-token"] ||
      (typeof req.headers["authorization"] === "string"
        ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
        : undefined)
    ) as string | undefined;

    const headerUserId = req.headers["x-user-id"] as string | undefined;

    // Optional secret verification if configured
    const expectedSecret = process.env.FABRIC_WEBHOOK_SECRET || process.env.FABRIC_TOKEN;
    if (expectedSecret) {
      const providedToken = headerToken || queryToken;
      if (!providedToken || providedToken !== expectedSecret) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 401;
        res.end(JSON.stringify({ status: "error", error: "Unauthorized: Invalid x-fabric-token" }));
        return;
      }
    }

    const payload = await parseBody(req);

    // Resolve target userId
    const targetUserId =
      queryUserId ||
      headerUserId ||
      payload.userId ||
      payload.user_id ||
      process.env.TELEGRAM_USER_ID ||
      "1131646846";

    // Check if source is FOCI Wearable BLE
    const sourceParam = parsedUrl.searchParams.get("source") || payload.source;
    if (sourceParam === "foci" || payload.mentalState || (payload.rawHex && payload.rawHex.length >= 24)) {
      const packet: FociTelemetryPacket = payload.rawHex
        ? decodeFociPacket(payload.rawHex, payload.deviceId || "FOCI-BLE")
        : (payload as FociTelemetryPacket);

      const result = await ingestFociTelemetry(packet, targetUserId);

      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: "ok",
          source: "foci",
          ingested: true,
          mentalState: packet.mentalState,
          respirationRate: packet.breath?.respirationRate,
          alertTriggered: result.alertTriggered,
          blockFlushed: !!result.blockFlushed,
          dominantBlockState: result.blockFlushed?.dominantState,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Ingest into Biometric Engine
    const snapshot = await ingestBiometricPayload(targetUserId, payload);

    // Format metrics for notification
    const recoveryScore = snapshot.recovery?.score ?? 70;
    const sleepHours = snapshot.sleep?.totalHours ?? 0;
    const hrvMs = snapshot.hrv?.value ?? 0;

    const recoveryStr = snapshot.recovery?.score !== undefined ? `${snapshot.recovery.score}%` : "N/A";
    const sleepStr = snapshot.sleep?.totalHours !== undefined ? `${snapshot.sleep.totalHours}h` : "N/A";
    const hrvStr = snapshot.hrv?.value !== undefined ? `${snapshot.hrv.value}ms` : "N/A";

    const notification =
      `🧬 *Biometric Sync Captured:* Recovery ${recoveryStr}, Sleep ${sleepStr}, HRV ${hrvStr}\n\n` +
      `• 🔋 *Readiness Score:* ${recoveryScore}% (${snapshot.recovery?.readinessCategory || "tracked"})\n` +
      `• 💤 *Sleep Duration:* ${sleepHours > 0 ? `${sleepHours}h` : "N/A"}` +
      (snapshot.sleep?.efficiencyPercent ? ` (${snapshot.sleep.efficiencyPercent}% efficiency)` : "") +
      (snapshot.sleep?.deepSleepHours || snapshot.sleep?.remSleepHours
        ? `\n  - Deep: ${snapshot.sleep.deepSleepHours || 0}h | REM: ${snapshot.sleep.remSleepHours || 0}h`
        : "") +
      `\n` +
      `• ❤️ *Resting HR:* ${snapshot.heartRate?.resting ? `${snapshot.heartRate.resting} bpm` : "N/A"}\n` +
      `• 🫀 *HRV:* ${hrvMs > 0 ? `${hrvMs}ms` : "N/A"}` +
      (snapshot.hrv?.metric ? ` (${snapshot.hrv.metric})` : "") +
      `\n` +
      (snapshot.respirationRate ? `• 🌬️ *Respiration:* ${snapshot.respirationRate} br/min\n` : "") +
      (snapshot.energy?.activeCalories ? `• ⚡ *Active Energy:* ${snapshot.energy.activeCalories} kcal\n` : "") +
      `• 📱 *Source:* ${snapshot.device?.name || snapshot.source}\n\n` +
      `_Vitality balance updated on Fabric OS._`;

    // Send Telegram alert
    try {
      await bot.api.sendMessage(targetUserId, notification, {
        parse_mode: "Markdown",
      });
    } catch (tgErr) {
      console.error("⚠️ Failed to deliver Telegram biometric notification:", tgErr);
    }

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: "ok",
        message: "Biometric telemetry successfully ingested",
        snapshot: {
          userId: snapshot.userId,
          date: snapshot.date,
          recovery: snapshot.recovery,
          sleep: snapshot.sleep,
          heartRate: snapshot.heartRate,
          hrv: snapshot.hrv,
          respirationRate: snapshot.respirationRate,
          source: snapshot.source,
        },
      })
    );
  } catch (error) {
    console.error("⚠️ Error processing health webhook:", error);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        status: "error",
        error: error instanceof Error ? error.message : "Internal server error",
      })
    );
  }
}
