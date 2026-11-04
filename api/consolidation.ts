import type { IncomingMessage, ServerResponse } from "http";
import {
  runNightlyConsolidation,
  getLatestConsolidation,
  type NightlyConsolidationOptions,
} from "../src/ai/consolidation.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) reject(new Error("Payload too large"));
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

function sendText(res: ServerResponse, statusCode: number, text: string): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  const queryAction = url.searchParams.get("action");
  const queryFormat = url.searchParams.get("format") || "json";

  let body: Record<string, any> = {};
  if (req.method === "POST") {
    try {
      body = await parseJsonBody(req);
    } catch (err: any) {
      return sendJson(res, 400, { error: err.message || "Invalid JSON body" });
    }
  }

  const action = (body.action || queryAction || (req.method === "POST" ? "run" : "status")).toLowerCase();

  try {
    // -------------------------------------------------------------
    // Action 1: 'run' — Execute Nightly Consolidation
    // -------------------------------------------------------------
    if (action === "run") {
      const options: NightlyConsolidationOptions = {
        userId: body.userId || url.searchParams.get("userId") || "default_user",
        date: body.date || url.searchParams.get("date") || undefined,
        customTelemetry: body.customTelemetry,
        customGitCommits: body.customGitCommits,
        customInitialVector: body.customInitialVector,
        customCurrentVector: body.customCurrentVector,
        customVirtues: body.customVirtues,
        trades: body.trades,
        skipDiskWrite: Boolean(body.skipDiskWrite),
        skipFirestore: Boolean(body.skipFirestore),
      };

      const result = await runNightlyConsolidation(options);
      return sendJson(res, 200, {
        status: "success",
        action: "run",
        consolidation: result,
      });
    }

    // -------------------------------------------------------------
    // Action 2: 'status' — Health & Latest Consolidation Metrics
    // -------------------------------------------------------------
    if (action === "status") {
      const latest = await getLatestConsolidation();
      if (!latest) {
        return sendJson(res, 200, {
          status: "idle",
          action: "status",
          message: "No nightly consolidations recorded yet. Trigger one with action='run'.",
        });
      }

      return sendJson(res, 200, {
        status: "success",
        action: "status",
        latest: {
          id: latest.id,
          date: latest.date,
          timestamp: latest.timestamp,
          recoveryIndex: latest.morningBriefing.recoveryIndex,
          lossReduction: latest.fourFDelta.lossReduction,
          percentageImprovement: latest.fourFDelta.percentageImprovement,
          focusMinutes: latest.aggregation.focusSprintMinutes,
          gitCommitsCount: latest.aggregation.gitCommits.length,
          completedTasksCount: latest.aggregation.completedTasks.length,
          newAxiomsCount: latest.inducedAxioms.length,
          graphNodesUpdated: latest.graphUpdates.newNodes.length,
          headline: latest.morningBriefing.headline,
        },
      });
    }

    // -------------------------------------------------------------
    // Action 3: 'latest_brief' — Morning Briefing Memo
    // -------------------------------------------------------------
    if (action === "latest_brief" || action === "brief" || action === "memo") {
      const latest = await getLatestConsolidation();

      if (!latest) {
        // Fallback: run on-demand consolidation for fresh morning memo
        const fresh = await runNightlyConsolidation({ skipDiskWrite: true, skipFirestore: true });
        const memo = fresh.morningBriefing;

        const format = (body.format || queryFormat).toLowerCase();
        if (format === "sms") return sendText(res, 200, memo.smsText);
        if (format === "markdown" || format === "text") return sendText(res, 200, memo.telegramMarkdown);
        return sendJson(res, 200, { status: "success", action: "latest_brief", memo });
      }

      const memo = latest.morningBriefing;
      const format = (body.format || queryFormat).toLowerCase();

      if (format === "sms") {
        return sendText(res, 200, memo.smsText);
      }
      if (format === "markdown" || format === "text") {
        return sendText(res, 200, memo.telegramMarkdown);
      }

      return sendJson(res, 200, {
        status: "success",
        action: "latest_brief",
        memo,
      });
    }

    return sendJson(res, 400, {
      error: `Unknown action '${action}'. Supported actions: 'run', 'status', 'latest_brief'.`,
    });
  } catch (err: any) {
    console.error("⚠️ [api/consolidation] Execution error:", err);
    return sendJson(res, 500, {
      status: "error",
      error: err?.message || "Internal server error during consolidation",
    });
  }
}
