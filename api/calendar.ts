/**
 * Fabric OS — Calendar & Time-Tracking Serverless Endpoint
 * Handles /api/calendar requests for time-blocking, time-tracking, listing events,
 * and triggering Notion synchronization.
 */

import type { IncomingMessage, ServerResponse } from "http";
import { defaultCalendarService } from "../src/services/calendar.js";
import { defaultCalendarNotionBridge } from "../src/services/calendar-notion-sync.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET") {
      const category = url.searchParams.get("category") as any;
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      const events = defaultCalendarService.listEvents({
        category: category || undefined,
        limit,
      });

      return sendJson(res, 200, {
        success: true,
        count: events.length,
        events,
      });
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      const action = body.action || url.searchParams.get("action") || "block";

      if (action === "block") {
        if (!body.title || !body.durationMinutes) {
          return sendJson(res, 400, {
            error: "Missing required fields: 'title' and 'durationMinutes'",
          });
        }

        const event = await defaultCalendarService.blockTime({
          title: body.title,
          durationMinutes: Number(body.durationMinutes),
          startTime: body.startTime,
          description: body.description,
          category: body.category,
          tags: body.tags,
        });

        let notionResult = null;
        if (body.syncToNotion) {
          try {
            notionResult = await defaultCalendarNotionBridge.syncEventToNotion(event);
          } catch (err: any) {
            notionResult = { error: err.message };
          }
        }

        return sendJson(res, 201, {
          success: true,
          action: "block",
          event,
          notion: notionResult,
        });
      }

      if (action === "track") {
        if (!body.title || !body.durationMinutes) {
          return sendJson(res, 400, {
            error: "Missing required fields: 'title' and 'durationMinutes'",
          });
        }

        const event = await defaultCalendarService.trackTime({
          title: body.title,
          durationMinutes: Number(body.durationMinutes),
          category: body.category,
          notes: body.notes,
          takeaway: body.takeaway,
          tags: body.tags,
          focusHours: body.focusHours,
        });

        let notionResult = null;
        if (body.syncToNotion) {
          try {
            notionResult = await defaultCalendarNotionBridge.syncEventToNotion(event);
          } catch (err: any) {
            notionResult = { error: err.message };
          }
        }

        return sendJson(res, 201, {
          success: true,
          action: "track",
          event,
          notion: notionResult,
        });
      }

      if (action === "sync_notion") {
        const syncResult = await defaultCalendarNotionBridge.syncPendingEvents();
        return sendJson(res, 200, {
          success: true,
          action: "sync_notion",
          ...syncResult,
        });
      }

      return sendJson(res, 400, {
        error: `Unknown calendar action: '${action}'. Supported: 'block', 'track', 'sync_notion'.`,
      });
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error: any) {
    return sendJson(res, 500, {
      error: error.message || "Internal calendar service error",
    });
  }
}

