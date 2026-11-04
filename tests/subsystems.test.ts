import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import {
  getAllSubsystems,
  getSubsystem,
  setSubsystemState,
  enableSubsystem,
  disableSubsystem,
  toggleSubsystem,
  recordHeartbeat,
  resetSubsystemRegistry,
  getRegistryData,
  isSubsystemId,
  ALL_SUBSYSTEM_IDS,
  KNOWN_SUBSYSTEMS,
  type SubsystemId,
  type SubsystemStatus,
  type SubsystemRegistryOptions,
} from "../src/services/registry.js";
import { getCurrentAmbientContext } from "../src/services/ambient.js";
import handler from "../api/subsystems.js";

// Helper to simulate HTTP requests against serverless API handlers
function createMockHttp(
  method: string,
  url: string,
  body?: any,
  headers: Record<string, string> = {}
) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = {
    host: "localhost:3000",
    "content-type": "application/json",
    ...headers,
  };

  let responseData = "";
  let statusCode = 200;
  const resHeaders: Record<string, string> = {};

  const res = {
    statusCode: 200,
    setHeader: (name: string, val: string) => {
      resHeaders[name.toLowerCase()] = String(val);
    },
    writeHead: (code: number, headersOrReason?: any) => {
      statusCode = code;
      res.statusCode = code;
      if (typeof headersOrReason === "object") {
        for (const [k, v] of Object.entries(headersOrReason)) {
          resHeaders[k.toLowerCase()] = String(v);
        }
      }
    },
    end: (data: string = "") => {
      responseData = data;
    },
  };

  const execute = async (): Promise<{
    status: number;
    body: any;
    rawText: string;
    headers: Record<string, string>;
  }> => {
    const promise = handler(req, res as any);
    if (body !== undefined) {
      req.emit("data", typeof body === "string" ? body : JSON.stringify(body));
    }
    req.emit("end");
    await promise;

    let parsedBody: any = responseData;
    try {
      parsedBody = JSON.parse(responseData);
    } catch {
      // Raw string
    }

    return {
      status: statusCode,
      body: parsedBody,
      rawText: responseData,
      headers: resHeaders,
    };
  };

  return { req, res, execute };
}

describe("Fabric OS — Subsystem State Registry & Lifecycle Governor QC Suite", () => {
  let tmpDir: string;
  let testRegistryPath: string;
  let testAmbientPath: string;
  let options: SubsystemRegistryOptions;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-subsys-test-"));
    testRegistryPath = path.join(tmpDir, "data", "subsystem_registry.json");
    testAmbientPath = path.join(tmpDir, ".ambient_state.json");
    options = {
      registryPath: testRegistryPath,
      ambientPath: testAmbientPath,
      refreshLive: false, // deterministic unit tests
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  // =============================================================
  // 1. Subsystem State Initialization
  // =============================================================
  describe("1. Subsystem State Initialization", () => {
    it("recognizes all 7 core Fabric OS subsystems", () => {
      expect(ALL_SUBSYSTEM_IDS).toHaveLength(7);
      expect(ALL_SUBSYSTEM_IDS).toContain("ambient_daemon");
      expect(ALL_SUBSYSTEM_IDS).toContain("video_vault_archiver");
      expect(ALL_SUBSYSTEM_IDS).toContain("insomnia_governor");
      expect(ALL_SUBSYSTEM_IDS).toContain("cybernetic_governor");
      expect(ALL_SUBSYSTEM_IDS).toContain("sms_gateway");
      expect(ALL_SUBSYSTEM_IDS).toContain("voice_channel");
      expect(ALL_SUBSYSTEM_IDS).toContain("newpipe_sync");
    });

    it("correctly validates IDs via isSubsystemId type guard", () => {
      expect(isSubsystemId("ambient_daemon")).toBe(true);
      expect(isSubsystemId("cybernetic_governor")).toBe(true);
      expect(isSubsystemId("insomnia_governor")).toBe(true);
      expect(isSubsystemId("video_vault_archiver")).toBe(true);
      expect(isSubsystemId("sms_gateway")).toBe(true);
      expect(isSubsystemId("voice_channel")).toBe(true);
      expect(isSubsystemId("newpipe_sync")).toBe(true);

      expect(isSubsystemId("")).toBe(false);
      expect(isSubsystemId("unknown_service")).toBe(false);
      expect(isSubsystemId(null)).toBe(false);
      expect(isSubsystemId(undefined)).toBe(false);
      expect(isSubsystemId(123)).toBe(false);
    });

    it("initializes complete registry with default state schemas", async () => {
      const subsystems = await getAllSubsystems(options);

      expect(subsystems).toHaveLength(7);

      for (const sub of subsystems) {
        expect(sub).toHaveProperty("id");
        expect(sub).toHaveProperty("name");
        expect(sub).toHaveProperty("description");
        expect(sub).toHaveProperty("state");
        expect(sub).toHaveProperty("enabled");
        expect(sub).toHaveProperty("lastHeartbeat");
        expect(sub).toHaveProperty("metrics");
        expect(sub).toHaveProperty("updatedAt");

        expect(typeof sub.name).toBe("string");
        expect(typeof sub.description).toBe("string");
        expect(typeof sub.enabled).toBe("boolean");
        expect(typeof sub.metrics).toBe("object");
        expect(typeof sub.updatedAt).toBe("string");

        const validStates = ["ACTIVE", "IDLE", "DISABLED", "ERROR", "UNCONFIGURED"];
        expect(validStates).toContain(sub.state);
      }
    });

    it("retrieves single subsystem with getSubsystem", async () => {
      const gov = await getSubsystem("cybernetic_governor", options);
      expect(gov).not.toBeNull();
      expect(gov!.id).toBe("cybernetic_governor");
      expect(gov!.name).toBe(KNOWN_SUBSYSTEMS.cybernetic_governor.name);
      expect(gov!.state).toBe("ACTIVE");
      expect(gov!.enabled).toBe(true);

      const invalid = await getSubsystem("invalid_id" as any, options);
      expect(invalid).toBeNull();
    });
  });

  // =============================================================
  // 2. Enabling, Disabling, and Error State Transitions
  // =============================================================
  describe("2. Enabling, Disabling, and Error State Transitions", () => {
    it("disables an active or idle subsystem", async () => {
      const disabled = await disableSubsystem("cybernetic_governor", options);
      expect(disabled.id).toBe("cybernetic_governor");
      expect(disabled.state).toBe("DISABLED");
      expect(disabled.enabled).toBe(false);

      const queried = await getSubsystem("cybernetic_governor", options);
      expect(queried?.state).toBe("DISABLED");
      expect(queried?.enabled).toBe(false);
    });

    it("enables a disabled subsystem back to ACTIVE", async () => {
      await disableSubsystem("ambient_daemon", options);
      let sub = await getSubsystem("ambient_daemon", options);
      expect(sub?.state).toBe("DISABLED");

      sub = await enableSubsystem("ambient_daemon", options);
      expect(sub.state).toBe("ACTIVE");
      expect(sub.enabled).toBe(true);
      expect(sub.lastHeartbeat).not.toBeNull();
    });

    it("toggles a subsystem between enabled and disabled", async () => {
      // Initially IDLE (enabled)
      const sub1 = await getSubsystem("insomnia_governor", options);
      expect(sub1?.enabled).toBe(true);

      // 1st toggle: disabled
      const toggled1 = await toggleSubsystem("insomnia_governor", options);
      expect(toggled1.state).toBe("DISABLED");
      expect(toggled1.enabled).toBe(false);

      // 2nd toggle: enabled (ACTIVE)
      const toggled2 = await toggleSubsystem("insomnia_governor", options);
      expect(toggled2.state).toBe("ACTIVE");
      expect(toggled2.enabled).toBe(true);
    });

    it("transitions to ERROR state and captures error description", async () => {
      const errorMsg = "Fatal connection refused to Tor proxy 127.0.0.1:9050";
      const sub = await setSubsystemState(
        "video_vault_archiver",
        "ERROR",
        {
          error: errorMsg,
          metrics: { failedAttempts: 3 },
        },
        options
      );

      expect(sub.state).toBe("ERROR");
      expect(sub.error).toBe(errorMsg);
      expect(sub.metrics.failedAttempts).toBe(3);

      // Clearing error upon recovery
      const recovered = await setSubsystemState(
        "video_vault_archiver",
        "ACTIVE",
        { metrics: { failedAttempts: 0 } },
        options
      );
      expect(recovered.state).toBe("ACTIVE");
      expect(recovered.error).toBeNull();
      expect(recovered.metrics.failedAttempts).toBe(0);
    });

    it("records daemon heartbeats and merges metrics", async () => {
      const hb = await recordHeartbeat(
        "ambient_daemon",
        {
          activeApp: "Visual Studio Code",
          idleSeconds: 0,
          fps: 60,
        },
        options
      );

      expect(hb.state).toBe("ACTIVE");
      expect(hb.enabled).toBe(true);
      expect(hb.metrics.activeApp).toBe("Visual Studio Code");
      expect(hb.metrics.fps).toBe(60);
      expect(hb.lastHeartbeat).not.toBeNull();

      // Subsequent heartbeat retains existing metrics while merging new ones
      const hb2 = await recordHeartbeat(
        "ambient_daemon",
        { idleSeconds: 15 },
        options
      );
      expect(hb2.metrics.activeApp).toBe("Visual Studio Code");
      expect(hb2.metrics.idleSeconds).toBe(15);
    });

    it("rejects state updates for invalid subsystem IDs", async () => {
      expect(
        setSubsystemState("bogus_daemon" as any, "ACTIVE", undefined, options)
      ).rejects.toThrow("Invalid subsystem id: 'bogus_daemon'");
    });
  });

  // =============================================================
  // 3. Persistence and Blackboard Sync
  // =============================================================
  describe("3. Persistence and Blackboard Sync", () => {
    it("persists registry to disk JSON and syncs with ambient blackboard", async () => {
      expect(fs.existsSync(testRegistryPath)).toBe(false);

      await setSubsystemState(
        "sms_gateway",
        "ACTIVE",
        { metrics: { carrier: "ADB", totalSmsSent: 42 } },
        options
      );

      // 1. Verify Primary Registry JSON File Exists
      expect(fs.existsSync(testRegistryPath)).toBe(true);
      const rawDisk = JSON.parse(fs.readFileSync(testRegistryPath, "utf-8"));
      expect(rawDisk.subsystems.sms_gateway.state).toBe("ACTIVE");
      expect(rawDisk.subsystems.sms_gateway.metrics.totalSmsSent).toBe(42);

      // 2. Verify Real-Time Ambient Blackboard Exists and contains key 'subsystems'
      expect(fs.existsSync(testAmbientPath)).toBe(true);
      const ambientCtx = await getCurrentAmbientContext({ statePath: testAmbientPath });
      expect(ambientCtx.blackboard).toBeDefined();
      expect(ambientCtx.blackboard.subsystems).toBeDefined();
      expect(ambientCtx.blackboard.subsystems.sms_gateway.state).toBe("ACTIVE");
      expect(ambientCtx.blackboard.subsystems.sms_gateway.metrics.totalSmsSent).toBe(42);
    });

    it("retains persisted states across process reload", async () => {
      await disableSubsystem("voice_channel", options);
      await recordHeartbeat("newpipe_sync", { tracksLoaded: 120 }, options);

      // Simulate cold restart by calling getRegistryData fresh
      const reloaded = await getRegistryData(options);
      expect(reloaded.subsystems.voice_channel.state).toBe("DISABLED");
      expect(reloaded.subsystems.voice_channel.enabled).toBe(false);
      expect(reloaded.subsystems.newpipe_sync.state).toBe("ACTIVE");
      expect(reloaded.subsystems.newpipe_sync.metrics.tracksLoaded).toBe(120);
    });

    it("recovers gracefully from a corrupt registry file", async () => {
      fs.mkdirSync(path.dirname(testRegistryPath), { recursive: true });
      fs.writeFileSync(testRegistryPath, "{ invalid: json... }", "utf-8");

      const data = await getRegistryData(options);
      expect(data.version).toBe("1.0.0");
      expect(Object.keys(data.subsystems)).toHaveLength(7);
      expect(data.subsystems.cybernetic_governor.state).toBe("ACTIVE");
    });

    it("resets subsystem registry cleanly back to defaults", async () => {
      await disableSubsystem("ambient_daemon", options);
      await disableSubsystem("insomnia_governor", options);

      let subs = await getAllSubsystems(options);
      expect(subs.find((s) => s.id === "ambient_daemon")?.state).toBe("DISABLED");

      await resetSubsystemRegistry(options);

      subs = await getAllSubsystems(options);
      expect(subs.find((s) => s.id === "ambient_daemon")?.state).toBe("IDLE");
      expect(subs.find((s) => s.id === "ambient_daemon")?.enabled).toBe(true);
    });
  });

  // =============================================================
  // 4. REST API Endpoints (api/subsystems.ts)
  // =============================================================
  describe("4. REST API Endpoints", () => {
    it("handles CORS OPTIONS preflight request", async () => {
      const { execute } = createMockHttp("OPTIONS", "/api/subsystems");
      const res = await execute();

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-methods"]).toContain("GET, POST, OPTIONS");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });

    it("GET /api/subsystems returns all 7 subsystems", async () => {
      const url = `/api/subsystems?registryPath=${encodeURIComponent(testRegistryPath)}&ambientPath=${encodeURIComponent(testAmbientPath)}&refresh=false`;
      const { execute } = createMockHttp("GET", url);
      const res = await execute();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(7);
      expect(Array.isArray(res.body.subsystems)).toBe(true);
      expect(res.body.subsystems).toHaveLength(7);
    });

    it("GET /api/subsystems?id=ambient_daemon returns specific subsystem", async () => {
      const url = `/api/subsystems?id=ambient_daemon&registryPath=${encodeURIComponent(testRegistryPath)}&ambientPath=${encodeURIComponent(testAmbientPath)}&refresh=false`;
      const { execute } = createMockHttp("GET", url);
      const res = await execute();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subsystem.id).toBe("ambient_daemon");
      expect(res.body.subsystem.name).toBe("macOS Ambient Daemon");
    });

    it("GET /api/subsystems?id=invalid_daemon returns 404", async () => {
      const url = `/api/subsystems?id=non_existent_daemon&registryPath=${encodeURIComponent(testRegistryPath)}&ambientPath=${encodeURIComponent(testAmbientPath)}`;
      const { execute } = createMockHttp("GET", url);
      const res = await execute();

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("not found");
    });

    it("POST /api/subsystems disable action disables the service", async () => {
      const { execute } = createMockHttp("POST", "/api/subsystems", {
        action: "disable",
        id: "video_vault_archiver",
        registryPath: testRegistryPath,
        ambientPath: testAmbientPath,
      });

      const res = await execute();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("disable");
      expect(res.body.subsystem.state).toBe("DISABLED");
      expect(res.body.subsystem.enabled).toBe(false);
    });

    it("POST /api/subsystems enable action re-enables the service", async () => {
      // First disable
      await disableSubsystem("voice_channel", options);

      // Now enable via API
      const { execute } = createMockHttp("POST", "/api/subsystems", {
        action: "enable",
        id: "voice_channel",
        registryPath: testRegistryPath,
        ambientPath: testAmbientPath,
      });

      const res = await execute();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("enable");
      expect(res.body.subsystem.state).toBe("ACTIVE");
      expect(res.body.subsystem.enabled).toBe(true);
    });

    it("POST /api/subsystems toggle action toggles state", async () => {
      const { execute } = createMockHttp("POST", "/api/subsystems", {
        action: "toggle",
        id: "newpipe_sync",
        registryPath: testRegistryPath,
        ambientPath: testAmbientPath,
      });

      const res = await execute();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("toggle");
      expect(res.body.subsystem.state).toBe("DISABLED");
    });

    it("POST /api/subsystems heartbeat action updates metrics and timestamp", async () => {
      const { execute } = createMockHttp("POST", "/api/subsystems", {
        action: "heartbeat",
        id: "insomnia_governor",
        metrics: {
          isPluggedIn: true,
          batteryPercent: 95,
          chargingStatus: "charging",
        },
        registryPath: testRegistryPath,
        ambientPath: testAmbientPath,
      });

      const res = await execute();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("heartbeat");
      expect(res.body.subsystem.state).toBe("ACTIVE");
      expect(res.body.subsystem.metrics.batteryPercent).toBe(95);
      expect(res.body.subsystem.lastHeartbeat).toBeDefined();
    });

    it("POST /api/subsystems set_state action allows setting arbitrary valid state", async () => {
      const { execute } = createMockHttp("POST", "/api/subsystems", {
        action: "set_state",
        id: "sms_gateway",
        state: "UNCONFIGURED",
        error: "Missing HTTPSMS_API_KEY",
        metrics: { mode: "offline" },
        registryPath: testRegistryPath,
        ambientPath: testAmbientPath,
      });

      const res = await execute();
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.action).toBe("set_state");
      expect(res.body.subsystem.state).toBe("UNCONFIGURED");
      expect(res.body.subsystem.error).toBe("Missing HTTPSMS_API_KEY");
      expect(res.body.subsystem.metrics.mode).toBe("offline");
    });

    it("POST /api/subsystems returns 400 for missing action or missing id", async () => {
      // Missing action
      const req1 = createMockHttp("POST", "/api/subsystems", {
        id: "ambient_daemon",
      });
      const res1 = await req1.execute();
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.error).toContain("Missing required 'action'");

      // Missing id
      const req2 = createMockHttp("POST", "/api/subsystems", {
        action: "enable",
      });
      const res2 = await req2.execute();
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error).toContain("Missing required 'id'");

      // Invalid id
      const req3 = createMockHttp("POST", "/api/subsystems", {
        action: "enable",
        id: "invalid_subsystem_name",
      });
      const res3 = await req3.execute();
      expect(res3.status).toBe(400);
      expect(res3.body.success).toBe(false);
      expect(res3.body.error).toContain("Invalid subsystem id");
    });

    it("returns 405 for unsupported HTTP methods", async () => {
      const { execute } = createMockHttp("DELETE", "/api/subsystems");
      const res = await execute();
      expect(res.status).toBe(405);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Method DELETE not allowed");
    });
  });
});
