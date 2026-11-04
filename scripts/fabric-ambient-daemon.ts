import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import {
  AmbientContext,
  FrontmostAppInfo,
  GitContext,
  FocusTranceInfo,
  categorizeApp,
  calculateTranceState,
  parseOsascriptBrowserOutput,
  parseGitStatus,
  generateDynamicIslandPayload,
  updateAmbientContext,
  captureWorkspaceError,
  logToBlackboard,
  DEFAULT_AMBIENT_STATE_PATH,
} from "../src/services/ambient.js";
import {
  evaluateGovernorInterventions,
  type GovernorEvaluationResult,
} from "../src/services/governor.js";

export interface DaemonOptions {
  intervalMs?: number;
  statePath?: string;
  fabricApiUrl?: string;
  cwd?: string;
  mockRunner?: CommandRunner;
}

export type CommandRunner = (
  cmd: string,
  args: string[],
  timeoutMs: number
) => Promise<string>;

/**
 * Executes a system binary with strict timeout safety to prevent macOS AppleScript hangs.
 */
export async function runCommandWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number = 2000,
  runner?: CommandRunner
): Promise<string> {
  if (runner) {
    return runner(cmd, args, timeoutMs);
  }

  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed || (error as any).signal === "SIGTERM") {
            return reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
          }
          return reject(new Error(stderr || error.message));
        }
        resolve(stdout.trim());
      }
    );
  });
}

/**
 * Fetches the frontmost macOS application name via AppleScript.
 */
export async function fetchFrontmostApp(
  timeoutMs: number = 2000,
  runner?: CommandRunner
): Promise<string> {
  try {
    const script =
      'tell application "System Events" to get name of first application process whose frontmost is true';
    const output = await runCommandWithTimeout(
      "osascript",
      ["-e", script],
      timeoutMs,
      runner
    );
    return output || "Finder";
  } catch (err) {
    return "Finder";
  }
}

/**
 * Fetches the frontmost window title or active tab URL for web browsers.
 */
export async function fetchWindowAndUrl(
  appName: string,
  timeoutMs: number = 2000,
  runner?: CommandRunner
): Promise<{ windowTitle?: string; url?: string }> {
  const category = categorizeApp(appName);

  if (category === "browser") {
    // Specialized AppleScript per browser engine
    let script = "";
    const nameLower = appName.toLowerCase();

    if (nameLower.includes("safari")) {
      script =
        'tell application "Safari" to if (count of windows) > 0 then return {name of current tab of front window, URL of current tab of front window}';
    } else if (nameLower.includes("arc")) {
      script =
        'tell application "Arc" to if (count of windows) > 0 then return {title of active tab of front window, URL of active tab of front window}';
    } else {
      // Chrome, Brave, Edge, Opera, etc.
      script = `tell application "${appName}" to if (count of windows) > 0 then return {title of active tab of front window, URL of active tab of front window}`;
    }

    try {
      const output = await runCommandWithTimeout(
        "osascript",
        ["-e", script],
        timeoutMs,
        runner
      );
      const parsed = parseOsascriptBrowserOutput(output);
      return {
        windowTitle: parsed.title,
        url: parsed.url,
      };
    } catch {
      // Fall through to generic window inspection if browser scripting is disabled
    }
  }

  // Generic window title inspection for IDEs, Terminals, and other GUI apps
  try {
    const genericScript =
      'tell application "System Events" to tell (first application process whose frontmost is true) to if (count of windows) > 0 then return name of front window';
    const output = await runCommandWithTimeout(
      "osascript",
      ["-e", genericScript],
      timeoutMs,
      runner
    );
    return {
      windowTitle: output || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Inspects active Git repository and branch state.
 */
export async function fetchGitContext(
  workspaceDir: string = process.cwd(),
  timeoutMs: number = 2000,
  runner?: CommandRunner
): Promise<GitContext> {
  try {
    const toplevel = await runCommandWithTimeout(
      "git",
      ["-C", workspaceDir, "rev-parse", "--show-toplevel"],
      timeoutMs,
      runner
    );

    const branch = await runCommandWithTimeout(
      "git",
      ["-C", workspaceDir, "branch", "--show-current"],
      timeoutMs,
      runner
    );

    let porcelain = "";
    try {
      porcelain = await runCommandWithTimeout(
        "git",
        ["-C", workspaceDir, "status", "--porcelain"],
        timeoutMs,
        runner
      );
    } catch {
      porcelain = "";
    }

    let headCommit = "";
    try {
      headCommit = await runCommandWithTimeout(
        "git",
        ["-C", workspaceDir, "rev-parse", "--short", "HEAD"],
        timeoutMs,
        runner
      );
    } catch {
      headCommit = "";
    }

    const { isClean, uncommittedChangesCount } = parseGitStatus(porcelain);
    const repository = path.basename(toplevel) || "fabric";

    return {
      repository,
      branch: branch || "main",
      isClean,
      uncommittedChangesCount,
      repoPath: toplevel,
      headCommit: headCommit || undefined,
    };
  } catch {
    return {
      repository: path.basename(workspaceDir) || "workspace",
      branch: "main",
      isClean: true,
      uncommittedChangesCount: 0,
    };
  }
}

/**
 * Reads user idle time in seconds using macOS IOHIDSystem.
 */
export async function fetchMacIdleSeconds(
  timeoutMs: number = 1500,
  runner?: CommandRunner
): Promise<number> {
  try {
    // Read HIDIdleTime from IOHIDSystem (in nanoseconds)
    const raw = await runCommandWithTimeout(
      "sh",
      ["-c", "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}'"],
      timeoutMs,
      runner
    );
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  } catch {
    return 0;
  }
}

/**
 * Local Background Watcher Daemon for Fabric OS.
 */
export class FabricAmbientDaemon {
  private intervalMs: number;
  private statePath: string;
  private fabricApiUrl: string;
  private cwd: string;
  private runner?: CommandRunner;

  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  // Attentional State Accumulators
  private continuousActivitySeconds: number = 0;
  private lastBreakTimestamp: string = new Date().toISOString();
  private lastTickTimestamp: number = Date.now();

  constructor(options: DaemonOptions = {}) {
    this.intervalMs = options.intervalMs || 5000;
    this.statePath = options.statePath || DEFAULT_AMBIENT_STATE_PATH;
    this.fabricApiUrl =
      options.fabricApiUrl ||
      process.env.FABRIC_API_URL ||
      "http://localhost:3000";
    this.cwd = options.cwd || process.cwd();
    this.runner = options.mockRunner;
  }

  /**
   * Performs a single non-invasive ambient gathering cycle.
   */
  async pollOnce(): Promise<AmbientContext> {
    const now = Date.now();
    const elapsedSeconds = Math.max(1, Math.round((now - this.lastTickTimestamp) / 1000));
    this.lastTickTimestamp = now;

    // 1. Frontmost Application
    const appName = await fetchFrontmostApp(2000, this.runner);
    const category = categorizeApp(appName);

    // 2. Window Title & URL
    const { windowTitle, url } = await fetchWindowAndUrl(
      appName,
      2000,
      this.runner
    );

    const frontmostApp: FrontmostAppInfo = {
      name: appName,
      windowTitle,
      url,
      category,
    };

    // 3. Git Repository & Branch
    const git = await fetchGitContext(this.cwd, 2000, this.runner);

    // 4. Sedentary & Focus Trance Tracking
    const idleSeconds = await fetchMacIdleSeconds(1500, this.runner);

    if (idleSeconds < 60) {
      // User is continuously active (typing / clicking)
      this.continuousActivitySeconds += elapsedSeconds;
    } else {
      // User broke away or idle
      if (this.continuousActivitySeconds > 120) {
        this.lastBreakTimestamp = new Date().toISOString();
      }
      this.continuousActivitySeconds = 0;
    }

    const sedentaryMinutes = Math.floor(this.continuousActivitySeconds / 60);
    const tranceState = calculateTranceState(
      this.continuousActivitySeconds,
      idleSeconds
    );

    const focus: FocusTranceInfo = {
      sedentaryMinutes,
      continuousActivitySeconds: this.continuousActivitySeconds,
      idleSeconds,
      tranceState,
      lastBreakTimestamp: this.lastBreakTimestamp,
      standingDetected: false,
    };

    // 5. Update Ambient State locally
    const updated = await updateAmbientContext(
      {
        frontmostApp,
        git,
        focus,
      },
      this.statePath
    );

    // 6. Closed-Loop Cybernetic Governor Evaluation
    try {
      const governorResult = await evaluateGovernorInterventions(updated, {
        statePath: this.statePath,
        persistToBlackboard: true,
      });

      if (governorResult.dynamicIslandPayload && governorResult.actuationLevel > 0) {
        updated.dynamicIsland = governorResult.dynamicIslandPayload;
      }
      if (governorResult.blackboardSummary) {
        updated.blackboard = {
          ...updated.blackboard,
          ...governorResult.blackboardSummary,
        };
      }
    } catch {
      // Governor failure must never crash the ambient daemon
    }

    // 7. Push Heartbeat to Fabric OS (/api/quick?action=ambient)
    await this.pushHeartbeat(updated);

    return updated;
  }

  /**
   * Pushes context update to Fabric OS API with timeout safety.
   */
  async pushHeartbeat(context: AmbientContext): Promise<boolean> {
    if (!this.fabricApiUrl) return false;

    const endpoint = `${this.fabricApiUrl.replace(/\/$/, "")}/api/quick?action=ambient`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res.ok;
    } catch {
      // Network failures are expected if local Next.js/Vercel server is not running; antifragile silent return
      return false;
    }
  }

  /**
   * Captures an error snippet or fatal test failure and updates the blackboard.
   */
  async recordError(
    snippet: string,
    meta?: { source?: string; exitCode?: number }
  ): Promise<void> {
    await captureWorkspaceError(snippet, meta, this.statePath);

    // If Fabric OS is online, also push to blackboard over HTTP
    try {
      const endpoint = `${this.fabricApiUrl.replace(/\/$/, "")}/api/quick?action=ambient`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet, meta }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      // Offline fallback already persisted to statePath
    }
  }

  /**
   * Starts the background daemon polling loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickTimestamp = Date.now();

    console.log(
      `🛰️  Fabric Ambient Daemon running [Interval: ${this.intervalMs}ms | State: ${this.statePath}]`
    );

    // Initial immediate poll
    this.pollOnce().catch((err) => {
      console.warn("[AmbientDaemon] Initial poll warning:", err);
    });

    this.timer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.pollOnce();
      } catch (err) {
        console.warn("[AmbientDaemon] Poll tick warning:", err);
      }
    }, this.intervalMs);
  }

  /**
   * Stops the background daemon polling loop.
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("🛑 Fabric Ambient Daemon stopped.");
  }
}

// -------------------------------------------------------------
// CLI Direct Invocation
// -------------------------------------------------------------
async function runCli() {
  const args = process.argv.slice(2);

  let interval = 5000;
  let once = false;
  let statePath = DEFAULT_AMBIENT_STATE_PATH;
  let captureErrorSnippet: string | null = null;
  let exitCode: number | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--interval" && args[i + 1]) {
      interval = parseInt(args[++i], 10) || 5000;
    } else if (args[i] === "--once") {
      once = true;
    } else if (args[i] === "--state-path" && args[i + 1]) {
      statePath = args[++i];
    } else if (args[i] === "--capture-error" && args[i + 1]) {
      captureErrorSnippet = args[++i];
    } else if (args[i] === "--exit-code" && args[i + 1]) {
      exitCode = parseInt(args[++i], 10);
    }
  }

  const daemon = new FabricAmbientDaemon({
    intervalMs: interval,
    statePath,
  });

  if (captureErrorSnippet) {
    console.log("🚨 Logging workspace failure to Fabric Ambient Blackboard...");
    await daemon.recordError(captureErrorSnippet, {
      source: "terminal_cli",
      exitCode: exitCode ?? 1,
    });
    console.log("✓ Error snippet recorded to blackboard.");
    process.exit(0);
  }

  if (once) {
    const ctx = await daemon.pollOnce();
    console.log(JSON.stringify(ctx, null, 2));
    process.exit(0);
  }

  // Long running daemon mode
  daemon.start();

  const shutdown = () => {
    daemon.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Auto-run if executed directly via bun or node
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("fabric-ambient-daemon.ts")
) {
  runCli().catch((err) => {
    console.error("Fatal daemon error:", err);
    process.exit(1);
  });
}
