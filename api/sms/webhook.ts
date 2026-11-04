/**
 * Fabric OS — Serverless SMS Webhook Gateway (/api/sms/webhook)
 *
 * Ingests inbound SMS events from httpSMS Android Gateway or local Android device,
 * classifies commands via fast natural language router, and dispatches responses.
 */

import type { IncomingMessage, ServerResponse } from "http";
import { processIncomingSMS } from "../../src/services/sms/router.js";
import type { SMSWebhookPayload } from "../../src/services/sms/types.js";

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body !== undefined && (req as any).body !== null) {
    if (typeof (req as any).body === "object") return (req as any).body;
    try {
      return JSON.parse((req as any).body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(
  req: IncomingMessage & { method?: string; query?: any },
  res: ServerResponse
) {
  // CORS Preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const host = req.headers.host || "localhost:3000";
  const url = new URL(req.url || "/", `http://${host}`);

  // Health / verification ping
  if (req.method === "GET") {
    const testContent = url.searchParams.get("content");
    const testFrom = url.searchParams.get("from");

    if (testContent) {
      // Allow testing via GET query params: /api/sms/webhook?content=status&from=+1234
      const result = await processIncomingSMS({
        content: testContent,
        from: testFrom || undefined,
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ok",
          intent: result.intent,
          replyText: result.replyText,
          replySent: result.sentReplyResult?.success ?? false,
          data: result.resultData,
        })
      );
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "ok",
        service: "Fabric OS SMS Gateway & Android Umbilical",
        provider: "httpSMS / Android ADB / Mock",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "error", error: "Method not allowed. Use POST or GET." }));
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const payload: SMSWebhookPayload = body || {};

    // Check for webhook verification / ping payload
    if (
      payload.event === "test" ||
      payload.type === "webhook.test" ||
      payload.type === "ping"
    ) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", test: true, timestamp: new Date().toISOString() }));
      return;
    }

    // Process inbound SMS command
    const result = await processIncomingSMS(payload, { replyViaSms: true });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "ok",
        intent: result.intent,
        replyText: result.replyText,
        replySent: result.sentReplyResult?.success ?? false,
        data: result.resultData,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "error",
        error: err?.message || "Failed to process SMS webhook",
      })
    );
  }
}
