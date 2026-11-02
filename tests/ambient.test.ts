import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import {
  categorizeApp,
  calculateTranceState,
  parseOsascriptBrowserOutput,
  parseGitStatus,
  generateDynamicIslandPayload,
  getDefaultAmbientContext,
  getCurrentAmbientContext,
  updateAmbientContext,
  logToBlackboard,
  getBlackboardValue,
  getBlackboard,
  captureWorkspaceError,
  formatAmbientPromptContext,
  type FrontmostAppInfo,
  type GitContext,
  type FocusTranceInfo,
  type WorkspaceErrorEntry,
} from "../src/services/ambient.js";
import {
  runCommandWithTimeout,
  fetchFrontmostApp,
  fetchWindowAndUrl,
  fetchGitContext,
  fetchMacIdleSeconds,
  FabricAmbientDaemon,
  type CommandRunner,
} from "../scripts/fabric-ambient-daemon.js";

describe("macOS Ambient Daemon & Context Service QC Suite", () => {
  const tempDir = path.join(os.tmpdir(), `fabric-ambient-test-${Date.now()}`);
  const tempStatePath = path.join(tempDir, ".ambient_state.json");

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------
  // 1. Pure Parser Logic
  // -------------------------------------------------------------
  describe("1. Parser Logic & Categorization", () => {
    test("categorizeApp correctly classifies core macOS application types", () => {
      // Browsers
      expect(categorizeApp("Google Chrome")).toBe("browser");
      expect(categorizeApp("Safari")).toBe("browser");
      expect(categorizeApp("Arc")).toBe("browser");
      expect(categorizeApp("Brave Browser")).toBe("browser");
      expect(categorizeApp("Microsoft Edge")).toBe("browser");

      // IDEs & Code Editors
      expect(categorizeApp("Code")).toBe("ide");
      expect(categorizeApp("Visual Studio Code")).toBe("ide");
      expect(categorizeApp("Cursor")).toBe("ide");
      expect(categorizeApp("Neovim")).toBe("ide");
      expect(categorizeApp("Zed")).toBe("ide");

      // Terminals
      expect(categorizeApp("Terminal")).toBe("terminal");
      expect(categorizeApp("iTerm2")).toBe("terminal");
      expect(categorizeApp("Ghostty")).toBe("terminal");
      expect(categorizeApp("Kitty")).toBe("terminal");
      expect(categorizeApp("Warp")).toBe("terminal");

      // Communication
      expect(categorizeApp("Slack")).toBe("communication");
      expect(categorizeApp("Discord")).toBe("communication");
      expect(categorizeApp("Telegram")).toBe("communication");

      // Design & Media
      expect(categorizeApp("Figma")).toBe("design");
      expect(categorizeApp("Spotify")).toBe("media");

      // Productivity & System
      expect(categorizeApp("Notion")).toBe("productivity");
      expect(categorizeApp("Finder")).toBe("system");

      // Fallback
      expect(categorizeApp("UnknownCustomTool")).toBe("other");
      expect(categorizeApp("")).toBe("other");
    });

    test("parseOsascriptBrowserOutput parses title and URL accurately", () => {
      // Standard title and URL
      const res1 = parseOsascriptBrowserOutput(
        "Fabric OS - Dynamic Dashboard, https://fabric.internal/dashboard"
      );
      expect(res1.title).toBe("Fabric OS - Dynamic Dashboard");
      expect(res1.url).toBe("https://fabric.internal/dashboard");

      // Title containing commas followed by URL
      const res2 = parseOsascriptBrowserOutput(
        "IITM Grokking: Quiz 1, CN, Maths & BDBN, https://study.iitm.ac.in/portal"
      );
      expect(res2.title).toBe("IITM Grokking: Quiz 1, CN, Maths & BDBN");
      expect(res2.url).toBe("https://study.iitm.ac.in/portal");

      // Pure URL without title
      const res3 = parseOsascriptBrowserOutput("https://github.com/org/fabric");
      expect(res3.url).toBe("https://github.com/org/fabric");

      // Bare window title without URL
      const res4 = parseOsascriptBrowserOutput("ambient.ts — fabric [main]");
      expect(res4.title).toBe("ambient.ts — fabric [main]");
      expect(res4.url).toBeUndefined();

      // Empty or whitespace
      expect(parseOsascriptBrowserOutput("")).toEqual({});
      expect(parseOsascriptBrowserOutput("   ")).toEqual({});
    });

    test("parseGitStatus detects clean and dirty working directory", () => {
      const clean = parseGitStatus("");
      expect(clean.isClean).toBe(true);
      expect(clean.uncommittedChangesCount).toBe(0);

      const dirty = parseGitStatus(" M src/services/ambient.ts\n?? scripts/daemon.ts\n");
      expect(dirty.isClean).toBe(false);
      expect(dirty.uncommittedChangesCount).toBe(2);
    });

    test("calculateTranceState maps continuous activity and idle intervals", () => {
      // Idle overrides continuous activity if break >= 60 seconds
      expect(calculateTranceState(3600, 65)).toBe("idle");
      expect(calculateTranceState(0, 100)).toBe("idle");

      // Warming up (< 15 mins)
      expect(calculateTranceState(10 * 60, 5)).toBe("warming_up");

      // Active (15 to 30 mins)
      expect(calculateTranceState(20 * 60, 0)).toBe("active");

      // Deep Flow (30 to 60 mins)
      expect(calculateTranceState(45 * 60, 2)).toBe("deep_flow");

      // Trance (60 to 90 mins)
      expect(calculateTranceState(75 * 60, 10)).toBe("trance");

      // Sedentary Lock (> 90 mins continuous)
      expect(calculateTranceState(95 * 60, 0)).toBe("sedentary_lock");
      expect(calculateTranceState(120 * 60, 15)).toBe("sedentary_lock");
    });

    test("generateDynamicIslandPayload produces contextual HUD states", () => {
      const app: FrontmostAppInfo = {
        name: "Google Chrome",
        category: "browser",
        windowTitle: "AlphaFold 3 Review",
        url: "https://alphafold.ebi.ac.uk",
      };
      const git: GitContext = {
        repository: "fabric",
        branch: "feature/ambient",
        isClean: true,
        uncommittedChangesCount: 0,
      };

      // 1. Normal state
      const normalFocus: FocusTranceInfo = {
        sedentaryMinutes: 10,
        continuousActivitySeconds: 600,
        idleSeconds: 0,
        tranceState: "warming_up",
        lastBreakTimestamp: new Date().toISOString(),
        standingDetected: false,
      };
      const normalPayload = generateDynamicIslandPayload(app, git, normalFocus);
      expect(normalPayload.status).toBe("normal");
      expect(normalPayload.badge).toBe("feature/ambient");
      expect(normalPayload.headline).toContain("fabric [feature/ambient]");

      // 2. Deep Flow state
      const flowFocus: FocusTranceInfo = {
        ...normalFocus,
        sedentaryMinutes: 45,
        continuousActivitySeconds: 2700,
        tranceState: "deep_flow",
      };
      const flowPayload = generateDynamicIslandPayload(app, git, flowFocus);
      expect(flowPayload.status).toBe("flow");
      expect(flowPayload.badge).toBe("FLOW");
      expect(flowPayload.icon).toBe("⚡");

      // 3. Sedentary Lock state (> 90m)
      const lockFocus: FocusTranceInfo = {
        ...normalFocus,
        sedentaryMinutes: 98,
        continuousActivitySeconds: 5880,
        tranceState: "sedentary_lock",
      };
      const lockPayload = generateDynamicIslandPayload(app, git, lockFocus);
      expect(lockPayload.status).toBe("warning");
      expect(lockPayload.badge).toBe("BREAK");
      expect(lockPayload.icon).toBe("🚶");
      expect(lockPayload.headline).toContain("Sedentary Lock (98m)");

      // 4. Alert state for fatal test failure
      const errorEntry: WorkspaceErrorEntry = {
        timestamp: new Date().toISOString(),
        snippet: "AssertionError: expected 200 but got 500 in test-suite.ts",
        exitCode: 1,
        source: "bun test",
      };
      const alertPayload = generateDynamicIslandPayload(app, git, normalFocus, [errorEntry]);
      expect(alertPayload.status).toBe("alert");
      expect(alertPayload.badge).toBe("ALERT");
      expect(alertPayload.icon).toBe("🚨");
      expect(alertPayload.subtext).toContain("AssertionError");
    });
  });

  // -------------------------------------------------------------
  // 2. State Aggregation & Service
  // -------------------------------------------------------------
  describe("2. State Aggregation & Ambient Context Service", () => {
    test("getCurrentAmbientContext returns safe default when file does not exist", async () => {
      const nonExistent = path.join(tempDir, "does-not-exist.json");
      const ctx = await getCurrentAmbientContext({ statePath: nonExistent });

      expect(ctx).toBeDefined();
      expect(ctx.frontmostApp.name).toBe("Visual Studio Code");
      expect(ctx.git.repository).toBe("fabric");
      expect(ctx.focus.tranceState).toBe("warming_up");
      expect(ctx.dynamicIsland.status).toBe("normal");
    });

    test("updateAmbientContext atomically updates and persists state", async () => {
      const updated = await updateAmbientContext(
        {
          frontmostApp: {
            name: "Arc",
            category: "browser",
            windowTitle: "IITM Grokking",
            url: "https://study.iitm.ac.in",
          },
          git: {
            repository: "fabric",
            branch: "experiment/telemetry",
            isClean: false,
            uncommittedChangesCount: 3,
          },
        },
        tempStatePath
      );

      expect(updated.frontmostApp.name).toBe("Arc");
      expect(updated.git.branch).toBe("experiment/telemetry");
      expect(fs.existsSync(tempStatePath)).toBe(true);

      const reloaded = await getCurrentAmbientContext({ statePath: tempStatePath });
      expect(reloaded.frontmostApp.name).toBe("Arc");
      expect(reloaded.git.uncommittedChangesCount).toBe(3);
    });

    test("logToBlackboard updates arbitrary blackboard keys and persists", async () => {
      await logToBlackboard("active_subagent_task", "ambient_telemetry_refactor", tempStatePath);
      await logToBlackboard("confidence_score", 0.99, tempStatePath);

      const val1 = await getBlackboardValue<string>("active_subagent_task", tempStatePath);
      const val2 = await getBlackboardValue<number>("confidence_score", tempStatePath);
      const all = await getBlackboard(tempStatePath);

      expect(val1).toBe("ambient_telemetry_refactor");
      expect(val2).toBe(0.99);
      expect(all.active_subagent_task).toBe("ambient_telemetry_refactor");
      expect(all.confidence_score).toBe(0.99);
    });

    test("captureWorkspaceError logs snippet to recentErrors and blackboard", async () => {
      const snippet = "TypeError: undefined is not a function at runStep (executor.ts:88)";
      await captureWorkspaceError(snippet, { source: "test_runner", exitCode: 1 }, tempStatePath);

      const ctx = await getCurrentAmbientContext({ statePath: tempStatePath });
      expect(ctx.recentErrors.length).toBe(1);
      expect(ctx.recentErrors[0].snippet).toBe(snippet);
      expect(ctx.recentErrors[0].exitCode).toBe(1);

      // Verify blackboard injection
      expect(ctx.blackboard.last_error).toBeDefined();
      expect(ctx.blackboard.last_error.snippet).toBe(snippet);
      expect(ctx.blackboard.fatal_test_failure).toBeDefined();
      expect(ctx.blackboard.fatal_test_failure.exitCode).toBe(1);

      // Dynamic Island updates to alert
      expect(ctx.dynamicIsland.status).toBe("alert");
      expect(ctx.dynamicIsland.badge).toBe("ALERT");
    });

    test("formatAmbientPromptContext creates structured Markdown for LLMs", () => {
      const ctx = getDefaultAmbientContext();
      ctx.frontmostApp.name = "Cursor";
      ctx.frontmostApp.category = "ide";
      ctx.frontmostApp.windowTitle = "ambient.ts";
      ctx.git.repository = "fabric";
      ctx.git.branch = "main";
      ctx.git.isClean = false;
      ctx.git.uncommittedChangesCount = 2;
      ctx.focus.tranceState = "deep_flow";
      ctx.focus.sedentaryMinutes = 40;
      ctx.focus.idleSeconds = 0;
      ctx.blackboard = { task_target: "macOS daemon" };

      const formatted = formatAmbientPromptContext(ctx);
      expect(formatted).toContain("### 🌿 LIVE AMBIENT CONTEXT:");
      expect(formatted).toContain("Cursor");
      expect(formatted).toContain("ambient.ts");
      expect(formatted).toContain("DEEP_FLOW");
      expect(formatted).toContain("40m continuous activity");
      expect(formatted).toContain("task_target");
    });
  });

  // -------------------------------------------------------------
  // 3. Timeout Safety & Resiliency
  // -------------------------------------------------------------
  describe("3. Timeout Safety & Resilience", () => {
    test("runCommandWithTimeout resolves for standard execution", async () => {
      const out = await runCommandWithTimeout("echo", ["ambient-ok"], 1000);
      expect(out).toBe("ambient-ok");
    });

    test("runCommandWithTimeout aborts hanging commands within timeout limit", async () => {
      const start = Date.now();
      let threw = false;

      try {
        // Run sleep command with a short 250ms timeout
        await runCommandWithTimeout("sleep", ["5"], 250);
      } catch (err: any) {
        threw = true;
        expect(err.message).toContain("timed out after 250ms");
      }

      const elapsed = Date.now() - start;
      expect(threw).toBe(true);
      expect(elapsed).toBeLessThan(1200); // Must not hang for 5s
    });

    test("fetchFrontmostApp gracefully falls back when AppleScript times out or fails", async () => {
      const failingRunner: CommandRunner = async () => {
        throw new Error("osascript is not allowed assistive access (-25211)");
      };

      const app = await fetchFrontmostApp(100, failingRunner);
      expect(app).toBe("Finder"); // Fallback
    });

    test("fetchWindowAndUrl safely catches browser scripting errors", async () => {
      const timingOutRunner: CommandRunner = async () => {
        throw new Error("Command timed out after 100ms");
      };

      const win = await fetchWindowAndUrl("Google Chrome", 100, timingOutRunner);
      expect(win).toEqual({});
    });

    test("fetchGitContext falls back cleanly in non-git directory or on failure", async () => {
      const failingRunner: CommandRunner = async () => {
        throw new Error("fatal: not a git repository");
      };

      const git = await fetchGitContext("/tmp", 100, failingRunner);
      expect(git.repository).toBe("tmp");
      expect(git.branch).toBe("main");
      expect(git.isClean).toBe(true);
    });

    test("fetchMacIdleSeconds returns 0 when ioreg fails or is unavailable", async () => {
      const failingRunner: CommandRunner = async () => {
        throw new Error("ioreg command not found");
      };

      const idle = await fetchMacIdleSeconds(100, failingRunner);
      expect(idle).toBe(0);
    });

    test("pushHeartbeat returns false without throwing when Fabric server is offline", async () => {
      const daemon = new FabricAmbientDaemon({
        fabricApiUrl: "http://127.0.0.1:49999", // dead port
        statePath: tempStatePath,
      });

      const res = await daemon.pushHeartbeat(getDefaultAmbientContext());
      expect(res).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 4. Daemon Lifecycle & Full Cycle
  // -------------------------------------------------------------
  describe("4. Daemon Lifecycle & Ambient Loop", () => {
    test("FabricAmbientDaemon.pollOnce gathers state and writes to custom statePath", async () => {
      const mockRunner: CommandRunner = async (cmd, args) => {
        if (args.includes("-e") && args[1].includes("System Events")) {
          return "Visual Studio Code";
        }
        if (cmd === "git" && args.includes("branch")) {
          return "ambient-watcher";
        }
        if (cmd === "git" && args.includes("--show-toplevel")) {
          return "/projects/fabric";
        }
        if (cmd === "git" && args.includes("status")) {
          return "";
        }
        if (cmd === "sh" && args[1].includes("ioreg")) {
          return "5"; // 5 seconds idle
        }
        return "";
      };

      const daemon = new FabricAmbientDaemon({
        intervalMs: 1000,
        statePath: tempStatePath,
        mockRunner,
      });

      const ctx = await daemon.pollOnce();

      expect(ctx.frontmostApp.name).toBe("Visual Studio Code");
      expect(ctx.frontmostApp.category).toBe("ide");
      expect(ctx.git.repository).toBe("fabric");
      expect(ctx.git.branch).toBe("ambient-watcher");
      expect(ctx.focus.idleSeconds).toBe(5);
      expect(ctx.dynamicIsland.status).toBe("normal");
      expect(fs.existsSync(tempStatePath)).toBe(true);
    });

    test("daemon.recordError stores terminal failures in blackboard", async () => {
      const daemon = new FabricAmbientDaemon({
        statePath: tempStatePath,
        fabricApiUrl: "http://127.0.0.1:49999",
      });

      await daemon.recordError("bun test: tests/ambient.test.ts failed with Exit Code 1", {
        source: "test_suite",
        exitCode: 1,
      });

      const ctx = await getCurrentAmbientContext({ statePath: tempStatePath });
      expect(ctx.blackboard.fatal_test_failure).toBeDefined();
      expect(ctx.blackboard.fatal_test_failure.snippet).toContain("tests/ambient.test.ts failed");
      expect(ctx.dynamicIsland.status).toBe("alert");
    });

    test("daemon start and stop manages timer properly", async () => {
      const daemon = new FabricAmbientDaemon({
        intervalMs: 50,
        statePath: tempStatePath,
        fabricApiUrl: "http://127.0.0.1:49999",
      });

      daemon.start();
      // Allow two ticks
      await new Promise((r) => setTimeout(r, 120));
      daemon.stop();

      const ctx = await getCurrentAmbientContext({ statePath: tempStatePath });
      expect(ctx).toBeDefined();
    });
  });
});
