/**
 * Fabric OS — Subsystems Registry & Lifecycle API
 *
 * GET /api/subsystems
 *   - Lists all registered background subsystems and their live states.
 *   - Query params:
 *       ?id=<subsystemId>      Returns a single subsystem by ID.
 *       ?refresh=false         Disables active environmental probing.
 *       ?registryPath=...      Optional custom persistence file (for testing).
 *       ?ambientPath=...       Optional custom ambient state blackboard.
 *
 * POST /api/subsystems
 *   - Performs lifecycle and status actions on subsystems.
 *   - Payload:
 *       {
 *         "action": "enable" | "disable" | "toggle" | "heartbeat" | "set_state",
 *         "id": "ambient_daemon",
 *         "state": "ACTIVE" | "IDLE" | "DISABLED" | "ERROR" | "UNCONFIGURED",
 *         "metrics": { ... },
 *         "error": "optional error message"
 *       }
 */

import type { IncomingMessage, ServerResponse } from "http";
import {
  getAllSubsystems,
  getSubsystem,
  setSubsystemState,
  enableSubsystem,
  disableSubsystem,
  toggleSubsystem,
  recordHeartbeat,
  isSubsystemId,
  ALL_SUBSYSTEM_IDS,
  type SubsystemId,
  type SubsystemState,
  type SubsystemRegistryOptions,
} from "../src/services/registry.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        // 5MB limit
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

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const host = req.headers.host || "localhost:3000";
  const url = new URL(req.url || "/", `http://${host}`);

  // Query options
  const queryId = url.searchParams.get("id") || url.searchParams.get("subsystemId");
  const queryRefresh = url.searchParams.get("refresh");
  const queryRegistryPath = url.searchParams.get("registryPath");
  const queryAmbientPath = url.searchParams.get("ambientPath");

  const options: SubsystemRegistryOptions = {
    refreshLive: queryRefresh !== "false" && queryRefresh !== "0",
    registryPath: queryRegistryPath || undefined,
    ambientPath: queryAmbientPath || undefined,
  };

  try {
    // -------------------------------------------------------------
    // GET: Query subsystems
    // -------------------------------------------------------------
    if (req.method === "GET") {
      if (queryId) {
        if (!isSubsystemId(queryId)) {
          return sendJson(res, 404, {
            success: false,
            error: `Subsystem '${queryId}' not found. Valid IDs: ${ALL_SUBSYSTEM_IDS.join(", ")}`,
          });
        }

        const subsystem = await getSubsystem(queryId as SubsystemId, options);
        if (!subsystem) {
          return sendJson(res, 404, {
            success: false,
            error: `Subsystem '${queryId}' not found.`,
          });
        }

        return sendJson(res, 200, {
          success: true,
          subsystem,
        });
      }

      const subsystems = await getAllSubsystems(options);
      return sendJson(res, 200, {
        success: true,
        count: subsystems.length,
        subsystems,
        timestamp: new Date().toISOString(),
      });
    }

    // -------------------------------------------------------------
    // POST: Lifecycle & Status Actions
    // -------------------------------------------------------------
    if (req.method === "POST") {
      let body: Record<string, any> = {};
      try {
        body = await parseJsonBody(req);
      } catch (err: any) {
        return sendJson(res, 400, {
          success: false,
          error: err.message || "Invalid JSON body",
        });
      }

      // Merge body options with query options
      if (body.registryPath) options.registryPath = body.registryPath;
      if (body.ambientPath) options.ambientPath = body.ambientPath;

      const rawAction = body.action || url.searchParams.get("action");
      const rawId = body.id || body.subsystemId || queryId;

      if (!rawAction) {
        return sendJson(res, 400, {
          success: false,
          error: "Missing required 'action' field. Supported actions: 'enable', 'disable', 'toggle', 'heartbeat', 'set_state'",
        });
      }

      const action = String(rawAction).toLowerCase().trim();

      if (!rawId) {
        return sendJson(res, 400, {
          success: false,
          error: "Missing required 'id' field.",
        });
      }

      if (!isSubsystemId(rawId)) {
        return sendJson(res, 400, {
          success: false,
          error: `Invalid subsystem id '${rawId}'. Supported subsystems: ${ALL_SUBSYSTEM_IDS.join(", ")}`,
        });
      }

      const subsystemId = rawId as SubsystemId;

      switch (action) {
        case "enable": {
          const subsystem = await enableSubsystem(subsystemId, options);
          return sendJson(res, 200, {
            success: true,
            action: "enable",
            subsystem,
          });
        }

        case "disable": {
          const subsystem = await disableSubsystem(subsystemId, options);
          return sendJson(res, 200, {
            success: true,
            action: "disable",
            subsystem,
          });
        }

        case "toggle": {
          const subsystem = await toggleSubsystem(subsystemId, options);
          return sendJson(res, 200, {
            success: true,
            action: "toggle",
            subsystem,
          });
        }

        case "heartbeat": {
          const metrics = body.metrics && typeof body.metrics === "object" ? body.metrics : undefined;
          const subsystem = await recordHeartbeat(subsystemId, metrics, options);
          return sendJson(res, 200, {
            success: true,
            action: "heartbeat",
            subsystem,
          });
        }

        case "set_state":
        case "setstate":
        case "update": {
          const state: SubsystemState = body.state;
          if (!state) {
            return sendJson(res, 400, {
              success: false,
              error: "Missing 'state' field for set_state action. Expected: ACTIVE, IDLE, DISABLED, ERROR, UNCONFIGURED",
            });
          }

          const subsystem = await setSubsystemState(
            subsystemId,
            state,
            {
              metrics: body.metrics,
              error: body.error,
              lastHeartbeat: body.lastHeartbeat,
            },
            options
          );

          return sendJson(res, 200, {
            success: true,
            action: "set_state",
            subsystem,
          });
        }

        default: {
          return sendJson(res, 400, {
            success: false,
            error: `Unsupported action '${rawAction}'. Supported actions: 'enable', 'disable', 'toggle', 'heartbeat', 'set_state'`,
          });
        }
      }
    }

    // Method not allowed
    return sendJson(res, 405, {
      success: false,
      error: `Method ${req.method} not allowed. Supported methods: GET, POST, OPTIONS`,
    });
  } catch (err: any) {
    console.error("⚠️ [api/subsystems] Error handling request:", err);
    return sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error handling subsystem request",
    });
  }
}
