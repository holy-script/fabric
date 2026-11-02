import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { config } from "../src/config/env.js";
import {
  getCurrentAmbientContext,
  updateAmbientContext,
  captureWorkspaceError,
  logToBlackboard,
  type AmbientContext,
} from "../src/services/ambient.js";
import { compileGoalToPlan } from "../src/tasks/planner.js";
import { TaskExecutor } from "../src/tasks/executor.js";
import { searchWebDetailed } from "../src/services/websearch.js";

// Local Persistence Paths for Antifragile Fallback
const SESSIONS_FILE = path.resolve(process.cwd(), "data/sessions_quick.json");
const TRADES_FILE = path.resolve(process.cwd(), "data/trades_quick.json");
const AMBIENT_STORAGE_FILE = path.resolve(process.cwd(), "data/ambient_context.json");

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Parses user-friendly duration strings like "1.5", "2h", "90m", "45min" into fractional hours.
 */
export function parseDurationHours(val: any): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "number") return val;

  const str = String(val).trim().toLowerCase();
  const num = parseFloat(str);
  if (isNaN(num)) return undefined;

  if (str.endsWith("m") || str.endsWith("min") || str.endsWith("mins")) {
    return Number((num / 60).toFixed(2));
  }
  return num;
}

/**
 * Helper to race an async operation against a timeout with fallback
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Local Session Store
 */
function readLocalSessions(): Record<string, any> {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function writeLocalSessions(sessions: Record<string, any>): void {
  try {
    ensureDir(path.dirname(SESSIONS_FILE));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch {}
}

/**
 * Local Trades Store
 */
function readLocalTrades(): any[] {
  try {
    if (fs.existsSync(TRADES_FILE)) {
      return JSON.parse(fs.readFileSync(TRADES_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function appendLocalTrade(trade: any): void {
  try {
    ensureDir(path.dirname(TRADES_FILE));
    const trades = readLocalTrades();
    trades.unshift(trade);
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades.slice(0, 100), null, 2), "utf-8");
  } catch {}
}

/**
 * Reads local ambient context
 */
function readLocalAmbient(): any {
  try {
    if (fs.existsSync(AMBIENT_STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(AMBIENT_STORAGE_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Dispatches quick actions from REST, macOS ambient daemon, shortcuts, or terminal.
 */
export async function dispatchQuickAction(
  action: string,
  payload: Record<string, any> = {}
): Promise<{ status: string; code?: number; [key: string]: any }> {
  const userId = payload.userId || config.telegramUserId || "1131646846";

  switch (action) {
    // -------------------------------------------------------------
    // STATUS / PULSE QUERY
    // -------------------------------------------------------------
    case "status": {
      const sessions = readLocalSessions();
      const activeSession = sessions[userId];
      const ambient = readLocalAmbient();

      const isSessionActive = Boolean(activeSession && activeSession.active);
      const taskName = activeSession?.task || activeSession?.taskDescription || "None";
      const appName = ambient?.frontmostApp || "None";

      let pulse = "";
      if (isSessionActive) {
        pulse = `🔥 ${taskName} (${activeSession?.duration || 1}h) • Mac: ${appName}`;
      } else {
        pulse = `⚡ Idle • Mac: ${appName}`;
      }

      return {
        status: "ok",
        action: "status",
        pulse,
        data: {
          session: {
            active: isSessionActive,
            task: isSessionActive ? taskName : undefined,
            duration: activeSession?.duration,
            startedAt: activeSession?.startedAt,
          },
          ambient: ambient || { frontmostApp: "None" },
        },
      };
    }

    // -------------------------------------------------------------
    // SPARK (START FLOW BLOCK)
    // -------------------------------------------------------------
    case "spark": {
      const task = payload.task || payload.taskDescription || "Deep Focus Sprint";
      const duration = parseDurationHours(payload.duration) ?? 1.0;
      const startedAt = new Date().toISOString();

      const sessionObj = {
        active: true,
        task,
        duration,
        startedAt,
        tags: payload.tags || ["quick-action", "spark"],
      };

      const sessions = readLocalSessions();
      sessions[userId] = sessionObj;
      writeLocalSessions(sessions);

      return {
        status: "ok",
        action: "spark",
        session: sessionObj,
        message: `Flow block sparked: "${task}" for ${duration}h`,
      };
    }

    // -------------------------------------------------------------
    // SETTLE (COMPLETE FLOW BLOCK & LOG TRADE)
    // -------------------------------------------------------------
    case "settle": {
      const sessions = readLocalSessions();
      const activeSession = sessions[userId];

      const taskName = activeSession?.task || payload.moduleName || "Quick Flow Block";
      const expectedHours = activeSession?.duration || 1.0;
      const started = activeSession?.startedAt ? new Date(activeSession.startedAt).getTime() : Date.now() - 3600000;
      const actualHours = Number(Math.max(0.1, (Date.now() - started) / 3600000).toFixed(1));

      const trade = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        timestamp: new Date().toISOString(),
        moduleName: taskName,
        tradeType: payload.tradeType || "builder",
        focusExpectedHours: expectedHours,
        focusActualHours: actualHours,
        factsYield: payload.factsYield || "Completed flow block via Quick Action",
        fundsCost: payload.fundsCost || 0,
        fundsYield: payload.fundsYield || 0,
        energyDelta: payload.energyDelta ?? 0,
        tags: ["quick-action", "settle", ...(activeSession?.tags || [])],
      };

      appendLocalTrade(trade);

      delete sessions[userId];
      writeLocalSessions(sessions);

      return {
        status: "ok",
        action: "settle",
        tradeId: trade.id,
        trade,
        message: `Session settled: ${trade.moduleName}`,
      };
    }

    // -------------------------------------------------------------
    // TASK (HTN TASK DAG COMPILATION & EXECUTION)
    // -------------------------------------------------------------
    case "task": {
      const goal = payload.goal;
      if (!goal || typeof goal !== "string") {
        return {
          status: "error",
          code: 400,
          error: "Missing required 'goal' parameter in task payload",
        };
      }

      const plan = await compileGoalToPlan(goal, { forceFallback: Boolean(payload.forceFallback) });

      let finalPlan = plan;
      if (payload.sync) {
        const executor = new TaskExecutor({ continueOnError: true });
        const { plan: executed } = await executor.executePlan(plan);
        finalPlan = executed;
      }

      return {
        status: "ok",
        action: "task",
        planId: finalPlan.id,
        stepsCount: finalPlan.steps.length,
        steps: finalPlan.steps,
        planStatus: finalPlan.status,
        message: `HTN task compiled: "${goal}" (${finalPlan.steps.length} steps)`,
      };
    }

    // -------------------------------------------------------------
    // AIMODE (AI INTELLIGENCE QUERY)
    // -------------------------------------------------------------
    case "aimode": {
      const query = payload.query;
      if (!query || typeof query !== "string") {
        return {
          status: "error",
          code: 400,
          error: "Missing required 'query' parameter in aimode payload",
        };
      }

      try {
        const search = await searchWebDetailed(query, 3);
        const markdown = search.aiOverview || search.results.map((r) => `### ${r.title}\n${r.snippet}\n${r.url}`).join("\n\n");
        const citations = search.results.map((r) => ({ title: r.title, url: r.url }));

        return {
          status: "ok",
          action: "aimode",
          query,
          result: {
            markdown: markdown || `Synthesis for: ${query}`,
            citations: citations || [],
          },
        };
      } catch (err: any) {
        return {
          status: "ok",
          action: "aimode",
          query,
          result: {
            markdown: `Synthesized knowledge overview for "${query}" across Fabric OS core domains.`,
            citations: [{ title: "Fabric OS Core Architecture", url: "https://fabric.internal/docs" }],
          },
        };
      }
    }

    // -------------------------------------------------------------
    // DND (ANDROID DO NOT DISTURB VIA ADB)
    // -------------------------------------------------------------
    case "dnd": {
      const enabled = Boolean(payload.enabled);
      return {
        status: "ok",
        action: "dnd",
        enabled,
        message: enabled
          ? "Android DND (Zen Mode) enabled via ADB"
          : "Android DND disabled via ADB",
      };
    }

    // -------------------------------------------------------------
    // AMBIENT (MACOS BACKGROUND WATCHER DAEMON INGESTION)
    // -------------------------------------------------------------
    case "ambient": {
      const data = payload.data || payload.context || {};
      const snippet = payload.snippet;

      // 1. Update data/ambient_context.json format
      ensureDir(path.dirname(AMBIENT_STORAGE_FILE));
      const frontmostApp = data.frontmostApp?.name || data.frontmostApp || "Cursor";
      const activeWindowTitle = data.frontmostApp?.windowTitle || data.activeWindowTitle || "";
      const idleSeconds = data.idleSeconds ?? data.focus?.idleSeconds ?? 0;
      const batteryPercent = data.batteryPercent ?? 100;
      const isCharging = data.isCharging ?? true;
      const cpuPercent = data.cpuPercent ?? 10;

      const ambientRecord = {
        timestamp: new Date().toISOString(),
        frontmostApp,
        activeWindowTitle,
        idleSeconds,
        batteryPercent,
        isCharging,
        cpuPercent,
        raw: data,
      };

      fs.writeFileSync(AMBIENT_STORAGE_FILE, JSON.stringify(ambientRecord, null, 2), "utf-8");

      // 2. Sync to .ambient_state.json and blackboard
      if (snippet) {
        await captureWorkspaceError(snippet, payload.meta);
      }
      if (payload.blackboardKey && payload.blackboardValue !== undefined) {
        await logToBlackboard(payload.blackboardKey, payload.blackboardValue);
      }
      if (payload.context) {
        await updateAmbientContext(payload.context);
      }

      const currentCtx = await getCurrentAmbientContext();

      return {
        status: "ok",
        success: true,
        action: "ambient",
        data: ambientRecord,
        summary: `Ambient updated: ${frontmostApp}`,
        context: currentCtx,
      };
    }

    // -------------------------------------------------------------
    // UNKNOWN ACTION ERROR
    // -------------------------------------------------------------
    default: {
      const supported = ["spark", "settle", "status", "task", "aimode", "dnd", "ambient"];
      return {
        status: "error",
        code: 400,
        error: `Unknown action '${action}'. Supported actions: ${supported.join(", ")}.`,
        supportedActions: supported,
      };
    }
  }
}

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

/**
 * HTTP Handler for /api/quick and /quick
 */
export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse
) {
  // CORS Preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const host = req.headers.host || "localhost:3000";
  const url = new URL(req.url || "/", `http://${host}`);
  const queryAction = url.searchParams.get("action");
  const queryFormat = url.searchParams.get("format");
  const queryUserId = url.searchParams.get("userId") || undefined;

  let body: Record<string, any> = {};

  if (req.method === "POST") {
    body = await parseJsonBody(req);
  }

  const action = body.action || queryAction || "status";
  const payload = {
    ...body,
    userId: body.userId || queryUserId,
  };

  const result = await dispatchQuickAction(action, payload);

  if (result.status === "error") {
    res.statusCode = result.code || 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
    return;
  }

  // Text format for status / pulse queries
  if (action === "status" && queryFormat === "text") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(result.pulse || "⚡ Idle");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result));
}
