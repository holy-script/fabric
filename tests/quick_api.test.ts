import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import handler, { dispatchQuickAction, parseDurationHours } from "../api/quick.js";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

const TEST_USER_ID = "test-quick-user-99";
const AMBIENT_STORAGE_FILE = path.resolve(process.cwd(), "data/ambient_context.json");

function createMockReqRes(
  method: string,
  url: string,
  body?: any,
  headers: Record<string, string> = {}
) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000", "content-type": "application/json", ...headers };
  req.body = body;

  let responseData = "";
  let statusCode = 200;
  const resHeaders: Record<string, string> = {};

  const res = {
    statusCode: 200,
    setHeader: (name: string, val: string) => {
      resHeaders[name.toLowerCase()] = val;
    },
    end: (data: string = "") => {
      responseData = data;
      statusCode = res.statusCode;
    },
  };

  const execute = async (): Promise<{
    status: number;
    body: any;
    headers: Record<string, string>;
  }> => {
    const promise = handler(req, res as any);
    if (body !== undefined) {
      req.emit("data", typeof body === "string" ? body : JSON.stringify(body));
    }
    req.emit("end");
    await promise;

    let parsed = null;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = responseData;
    }
    return { status: statusCode, body: parsed, headers: resHeaders };
  };

  return { req, res, execute };
}

describe("Fabric OS Quick-Action & Smart Surface Dispatcher QC Suite", () => {
  beforeAll(async () => {
    // Ensure clean state via quick dispatch
    await dispatchQuickAction("settle", { userId: TEST_USER_ID });
  });

  afterAll(async () => {
    await dispatchQuickAction("settle", { userId: TEST_USER_ID });
  });

  // ==========================================
  // 1. Duration Parsing Helpers
  // ==========================================
  describe("Duration Parser Utility", () => {
    test("correctly parses hours, minutes, and number inputs", () => {
      expect(parseDurationHours(1.5)).toBe(1.5);
      expect(parseDurationHours("2")).toBe(2);
      expect(parseDurationHours("2h")).toBe(2);
      expect(parseDurationHours("90m")).toBe(1.5);
      expect(parseDurationHours("30min")).toBe(0.5);
      expect(parseDurationHours("45m")).toBe(0.75);
      expect(parseDurationHours(undefined)).toBeUndefined();
    });
  });

  // ==========================================
  // 2. System Pulse & Status
  // ==========================================
  describe("Pulse & Status Queries", () => {
    test("GET /api/quick returns status pulse when idle", async () => {
      const { execute } = createMockReqRes("GET", `/api/quick?userId=${TEST_USER_ID}`);
      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("status");
      expect(typeof body.pulse).toBe("string");
      expect(body.pulse).toContain("⚡ Idle");
      expect(body.data).toBeDefined();
      expect(body.data.session.active).toBe(false);
    });

    test("GET /api/quick?action=status&format=text returns plain-text pulse", async () => {
      const { execute } = createMockReqRes(
        "GET",
        `/api/quick?action=status&format=text&userId=${TEST_USER_ID}`
      );
      const { status, body, headers } = await execute();

      expect(status).toBe(200);
      expect(headers["content-type"]).toContain("text/plain");
      expect(typeof body).toBe("string");
      expect(body).toContain("⚡ Idle");
    });
  });

  // ==========================================
  // 3. Spark & Settle Flow Block Cycle
  // ==========================================
  describe("Spark & Settle Session Cycle", () => {
    test("POST /api/quick with action 'spark' starts an active session", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "spark",
        task: "Deep Work on Architecture",
        duration: 1.5,
        userId: TEST_USER_ID,
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("spark");
      expect(body.session.task).toBe("Deep Work on Architecture");
      expect(body.session.duration).toBe(1.5);
      expect(body.message).toContain("Flow block sparked");
    });

    test("GET /api/quick?action=status reflects active sparked session", async () => {
      const { execute } = createMockReqRes(
        "GET",
        `/api/quick?action=status&userId=${TEST_USER_ID}`
      );
      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.pulse).toContain("Deep Work on Architecture");
      expect(body.data.session.active).toBe(true);
      expect(body.data.session.task).toBe("Deep Work on Architecture");
    });

    test("POST /api/quick with action 'settle' logs 4F trade and clears active session", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "settle",
        energyDelta: 2,
        factsYield: "Engineered unified quick action REST dispatcher for smart surfaces",
        userId: TEST_USER_ID,
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("settle");
      expect(body.tradeId).toBeDefined();
      expect(body.trade.moduleName).toBe("Deep Work on Architecture");
      expect(body.trade.energyDelta).toBe(2);
      expect(body.trade.factsYield).toContain("smart surfaces");
      expect(body.message).toContain("Session settled");
    });

    test("GET /api/quick?action=status returns to Idle after settle", async () => {
      const { execute } = createMockReqRes(
        "GET",
        `/api/quick?action=status&userId=${TEST_USER_ID}`
      );
      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.data.session.active).toBe(false);
      expect(body.pulse).toContain("⚡ Idle");
    });
  });

  // ==========================================
  // 4. HTN Task DAG Compilation & Execution
  // ==========================================
  describe("HTN Task Action", () => {
    test("POST /api/quick with action 'task' compiles goal into DAG plan", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "task",
        goal: "Study for IITM Quiz 1 Computer Networks and generate NotebookLM podcast",
        forceFallback: true,
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("task");
      expect(body.planId).toBeDefined();
      expect(body.stepsCount).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(body.steps)).toBe(true);
      expect(body.message).toContain("HTN task compiled");
    });

    test("POST /api/quick with action 'task' and sync:true executes steps to completion", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "task",
        goal: "Calculate network subnet masks",
        sync: true,
        forceFallback: true,
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("task");
      expect(body.planStatus).toBe("completed");
      expect(body.steps.length).toBeGreaterThan(0);
    });

    test("POST /api/quick returns 400 error when goal is missing", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "task",
      });

      const { status, body } = await execute();

      expect(status).toBe(400);
      expect(body.status).toBe("error");
      expect(body.error).toContain("Missing required 'goal'");
    });
  });

  // ==========================================
  // 5. Browser AI Mode Intelligence Action
  // ==========================================
  describe("Browser AI Mode Action", () => {
    test("POST /api/quick with action 'aimode' performs structured intelligence query", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "aimode",
        query: "What is the 4F framework in Fabric OS?",
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("aimode");
      expect(body.query).toBe("What is the 4F framework in Fabric OS?");
      expect(body.result).toBeDefined();
      expect(typeof body.result.markdown).toBe("string");
      expect(Array.isArray(body.result.citations)).toBe(true);
    }, 15000);

    test("POST /api/quick returns 400 error when AI mode query is missing", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "aimode",
      });

      const { status, body } = await execute();

      expect(status).toBe(400);
      expect(body.status).toBe("error");
      expect(body.error).toContain("Missing required 'query'");
    });
  });

  // ==========================================
  // 6. Android DND via ADB Action
  // ==========================================
  describe("Android DND via ADB Action", () => {
    test("POST /api/quick with action 'dnd' handles Zen mode request gracefully", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "dnd",
        enabled: true,
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("dnd");
      expect(body.enabled).toBe(true);
      expect(body.message).toBeDefined();
    });

    test("POST /api/quick with action 'dnd' handles disable request", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "dnd",
        enabled: false,
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("dnd");
      expect(body.enabled).toBe(false);
      expect(body.message).toBeDefined();
    });
  });

  // ==========================================
  // 7. Ambient macOS Context Daemon Ingestion
  // ==========================================
  describe("macOS Ambient Context Ingestion", () => {
    test("POST /api/quick with action 'ambient' ingests frontmost app and telemetry", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "ambient",
        data: {
          frontmostApp: "Cursor",
          activeWindowTitle: "api/quick.ts - fabric",
          idleSeconds: 8,
          batteryPercent: 92,
          isCharging: true,
          cpuPercent: 14.5,
        },
      });

      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.action).toBe("ambient");
      expect(body.data.frontmostApp).toBe("Cursor");
      expect(body.data.batteryPercent).toBe(92);
      expect(body.summary).toContain("Cursor");

      // Verify ambient persistence file
      expect(fs.existsSync(AMBIENT_STORAGE_FILE)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(AMBIENT_STORAGE_FILE, "utf-8"));
      expect(saved.frontmostApp).toBe("Cursor");
    });

    test("GET /api/quick?action=status reflects ingested ambient app in pulse HUD", async () => {
      const { execute } = createMockReqRes(
        "GET",
        `/api/quick?action=status&userId=${TEST_USER_ID}`
      );
      const { status, body } = await execute();

      expect(status).toBe(200);
      expect(body.pulse).toContain("Mac: Cursor");
      expect(body.data.ambient.frontmostApp).toBe("Cursor");
    });
  });

  // ==========================================
  // 8. Protocol Errors & CORS Validation
  // ==========================================
  describe("Protocol Errors & CORS Handling", () => {
    test("POST /api/quick returns 400 for unsupported action", async () => {
      const { execute } = createMockReqRes("POST", "/api/quick", {
        action: "teleport_dimension",
      });

      const { status, body } = await execute();

      expect(status).toBe(400);
      expect(body.status).toBe("error");
      expect(body.error).toContain("Unknown action");
      expect(body.supportedActions).toContain("spark");
      expect(body.supportedActions).toContain("settle");
      expect(body.supportedActions).toContain("aimode");
      expect(body.supportedActions).toContain("dnd");
      expect(body.supportedActions).toContain("ambient");
      expect(body.supportedActions).toContain("status");
    });

    test("OPTIONS /api/quick handles CORS preflight correctly", async () => {
      const { execute } = createMockReqRes("OPTIONS", "/api/quick");
      const { status, headers } = await execute();

      expect(status).toBe(204);
      expect(headers["access-control-allow-origin"]).toBe("*");
      expect(headers["access-control-allow-methods"]).toContain("POST");
    });
  });
});
