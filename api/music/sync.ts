import type { IncomingMessage, ServerResponse } from "http";
import { processClientSync } from "../../src/music/store.js";
import type { SyncPayload } from "../../src/music/types.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        // 10MB limit
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
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(jsonStr),
  });
  res.end(jsonStr);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const payload: SyncPayload = {
      deviceId: body.deviceId || "unknown_device",
      clientVersion: Number(body.clientVersion) || 1,
      lastSyncTimestamp: Number(body.lastSyncTimestamp) || 0,
      mutations: Array.isArray(body.mutations) ? body.mutations : [],
    };

    const result = await processClientSync(payload);
    sendJson(res, 200, {
      status: "success",
      ...result,
    });
  } catch (err: any) {
    console.error("[api/music/sync] Error during sync:", err);
    sendJson(res, 500, {
      status: "error",
      message: err?.message || "Internal server error during music sync",
    });
  }
}

