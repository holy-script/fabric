import { spawn, execFile, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import {
  DEFAULT_AMBIENT_STATE_PATH,
  getCurrentAmbientContext,
  updateAmbientContext,
} from "../src/services/ambient.js";

// =============================================================
// Constants & Types
// =============================================================

export const DEFAULT_INSOMNIA_PID_PATH = path.resolve(
  process.cwd(),
  ".fabric_insomnia.pid"
);
export const DEFAULT_BATTERY_THRESHOLD = 20; // 20% minimum battery on DC
export const DEFAULT_CHECK_INTERVAL_MS = 10000; // 10s governor check cycle

export type CommandRunner = (
  cmd: string,
  args: string[],
  timeoutMs?: number
) => Promise<string>;

export interface PowerStatus {
  isPluggedIn: boolean;
  batteryPercent: number;
  chargingStatus: "charging" | "discharging" | "charged" | "finishing" | "unknown";
  timeRemaining?: string;
  raw?: string;
}

export interface ThermalStatus {
  isThrottled: boolean;
  cpuSpeedLimit?: number;
  cpuSchedulerLimit?: number;
  thermalWarningLevel?: string;
  raw?: string;
}

export interface InsomniaSafetyVerdict {
  safe: boolean;
  reason?: string;
  code?: "SAFE" | "LOW_BATTERY_DC" | "THERMAL_THROTTLED";
}

export interface InsomniaState {
  isActive: boolean;
  reason?: string;
  batteryPercent?: number;
  isPluggedIn?: boolean;
  startedAt?: string | null;
  pid?: number;
  caffeinatePid?: number;
  releasedReason?: "low_battery" | "thermal_throttle" | "user_stopped" | "error" | null;
  lastSafetyCheck?: string;
  safetyGovernor?: {
    batteryThresholdPercent: number;
    isThermalThrottled: boolean;
    safeToRun: boolean;
    verdictCode?: string;
    reason?: string | null;
  };
}

export interface InsomniaOptions {
  statePath?: string;
  pidPath?: string;
  batteryThreshold?: number;
  checkIntervalMs?: number;
  reason?: string;
  mockRunner?: CommandRunner;
}

// =============================================================
// Helper: System Command Runner with Strict Timeout Guard
// =============================================================

export async function runCommandWithTimeout(
  cmd: string,
  args: string[],
  timeoutMs: number = 2500,
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
            return reject(
              new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`)
            );
          }
          return reject(new Error(stderr || error.message));
        }
        resolve(stdout.trim());
      }
    );
  });
}

// =============================================================
// Pure Parsers: pmset -g batt & pmset -g therm
// =============================================================

/**
 * Pure Function: Parses macOS `pmset -g batt` stdout into structured PowerStatus.
 */
export function parsePmsetBatt(output: string): PowerStatus {
  if (!output || !output.trim()) {
    return {
      isPluggedIn: true,
      batteryPercent: 100,
      chargingStatus: "unknown",
      raw: "",
    };
  }

  const raw = output.trim();
  const lower = raw.toLowerCase();

  // Detect power source
  // 'AC Power' -> true; 'Battery Power' -> false
  let isPluggedIn = true;
  if (lower.includes("'battery power'") || lower.includes("drawing from 'battery")) {
    isPluggedIn = false;
  } else if (lower.includes("'ac power'") || lower.includes("ac attached") || lower.includes("charging")) {
    isPluggedIn = true;
  }

  // Extract battery percentage: matches "75%", "100%", etc.
  const percentMatch = raw.match(/(\d{1,3})%/);
  const batteryPercent = percentMatch ? Math.min(100, Math.max(0, parseInt(percentMatch[1], 10))) : 100;

  // Extract charging status
  let chargingStatus: PowerStatus["chargingStatus"] = "unknown";
  if (lower.includes("discharging")) {
    chargingStatus = "discharging";
  } else if (lower.includes("charging") && !lower.includes("not charging")) {
    chargingStatus = "charging";
  } else if (lower.includes("charged") || lower.includes("finishing charge")) {
    chargingStatus = lower.includes("finishing charge") ? "finishing" : "charged";
  } else if (lower.includes("ac attached") || lower.includes("not charging")) {
    chargingStatus = "charged";
  }

  // Extract time remaining if present: "3:12 remaining" or "(no estimate)"
  let timeRemaining: string | undefined = undefined;
  const timeMatch = raw.match(/(\d{1,2}:\d{2})\s+remaining/);
  if (timeMatch) {
    timeRemaining = timeMatch[1];
  } else if (lower.includes("no estimate")) {
    timeRemaining = "calculating...";
  }

  return {
    isPluggedIn,
    batteryPercent,
    chargingStatus,
    timeRemaining,
    raw,
  };
}

/**
 * Pure Function: Parses macOS `pmset -g therm` stdout into structured ThermalStatus.
 */
export function parsePmsetTherm(output: string): ThermalStatus {
  if (!output || !output.trim()) {
    return {
      isThrottled: false,
      cpuSpeedLimit: 100,
      cpuSchedulerLimit: 100,
      thermalWarningLevel: "None",
      raw: "",
    };
  }

  const raw = output.trim();
  let isThrottled = false;

  // 1. CPU Speed Limit (e.g. CPU_Speed_Limit = 65 -> throttled)
  let cpuSpeedLimit: number | undefined = undefined;
  const speedMatch = raw.match(/CPU_Speed_Limit\s*=\s*(\d+)/i);
  if (speedMatch) {
    cpuSpeedLimit = parseInt(speedMatch[1], 10);
    if (cpuSpeedLimit < 100) {
      isThrottled = true;
    }
  }

  // 2. CPU Scheduler Limit (e.g. CPU_Scheduler_Limit = 70 -> throttled)
  let cpuSchedulerLimit: number | undefined = undefined;
  const schedMatch = raw.match(/CPU_Scheduler_Limit\s*=\s*(\d+)/i);
  if (schedMatch) {
    cpuSchedulerLimit = parseInt(schedMatch[1], 10);
    if (cpuSchedulerLimit < 100) {
      isThrottled = true;
    }
  }

  // 3. Thermal Warning Level (e.g. Thermal_Warning_Level = Moderate | Heavy | Trapping | Critical)
  let thermalWarningLevel: string = "None";
  const warnMatch = raw.match(/Thermal_Warning_Level\s*=\s*([a-zA-Z0-9]+)/i);
  if (warnMatch) {
    thermalWarningLevel = warnMatch[1];
    const warnLower = thermalWarningLevel.toLowerCase();
    if (
      warnLower !== "none" &&
      warnLower !== "normal" &&
      warnLower !== "0"
    ) {
      isThrottled = true;
    }
  }

  // Also check natural language warnings: "Thermal warning level: Heavy"
  const natWarnMatch = raw.match(/Thermal\s+warning\s+level:\s*([a-zA-Z0-9]+)/i);
  if (natWarnMatch) {
    thermalWarningLevel = natWarnMatch[1];
    const warnLower = thermalWarningLevel.toLowerCase();
    if (
      warnLower !== "none" &&
      warnLower !== "normal" &&
      warnLower !== "0"
    ) {
      isThrottled = true;
    }
  }

  return {
    isThrottled,
    cpuSpeedLimit: cpuSpeedLimit ?? 100,
    cpuSchedulerLimit: cpuSchedulerLimit ?? 100,
    thermalWarningLevel,
    raw,
  };
}

// =============================================================
// Safety Governor Policy Evaluator
// =============================================================

/**
 * Pure Function: Evaluates battery and thermal safety thresholds.
 * 
 * Safety Policy:
 * 1. Overheating Guard: If thermal throttling is detected, release lock immediately.
 * 2. Battery Depletion Guard: If running on battery (DC power) and charge < minBatteryThreshold (20%),
 *    release lock immediately to protect battery health and prevent unexpected power death.
 */
export function evaluateInsomniaSafety(
  power: PowerStatus,
  therm: ThermalStatus,
  minBatteryThreshold: number = DEFAULT_BATTERY_THRESHOLD
): InsomniaSafetyVerdict {
  if (therm.isThrottled) {
    const detail =
      therm.thermalWarningLevel !== "None"
        ? `Warning level: ${therm.thermalWarningLevel}`
        : `CPU throttled to ${therm.cpuSpeedLimit}%`;
    return {
      safe: false,
      code: "THERMAL_THROTTLED",
      reason: `Thermal throttling active (${detail}). Sleep lock released to prevent overheating in closed-lid mode.`,
    };
  }

  if (!power.isPluggedIn && power.batteryPercent < minBatteryThreshold) {
    return {
      safe: false,
      code: "LOW_BATTERY_DC",
      reason: `Battery level (${power.batteryPercent}%) is below safety threshold (${minBatteryThreshold}%) on DC power. Sleep lock released to preserve battery health.`,
    };
  }

  return {
    safe: true,
    code: "SAFE",
  };
}

// =============================================================
// Blackboard & Ambient Context Persistence
// =============================================================

/**
 * Persists insomnia status into `.ambient_state.json` under blackboard.insomnia.
 * Automatically updates Dynamic Island badge and headline to display 🌙 INSOMNIA status.
 */
export async function updateInsomniaBlackboard(
  state: InsomniaState,
  statePath?: string
): Promise<void> {
  const filePath = statePath || DEFAULT_AMBIENT_STATE_PATH;

  await updateAmbientContext(
    {
      blackboard: {
        insomnia: state,
      },
    },
    filePath
  );
}

/**
 * Reads current insomnia status from blackboard in `.ambient_state.json`.
 */
export async function getInsomniaBlackboard(
  statePath?: string
): Promise<InsomniaState | null> {
  const filePath = statePath || DEFAULT_AMBIENT_STATE_PATH;
  try {
    const ctx = await getCurrentAmbientContext({ statePath: filePath });
    return (ctx.blackboard?.insomnia as InsomniaState) || null;
  } catch {
    return null;
  }
}

// =============================================================
// Process & PID Helpers
// =============================================================

export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === "EPERM"; // Process exists, but owned by another user
  }
}

export function readPidFile(pidPath: string = DEFAULT_INSOMNIA_PID_PATH): number | null {
  try {
    if (!fs.existsSync(pidPath)) return null;
    const content = fs.readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function writePidFile(pid: number, pidPath: string = DEFAULT_INSOMNIA_PID_PATH): void {
  const dir = path.dirname(pidPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pidPath, pid.toString(), "utf-8");
}

export function removePidFile(pidPath: string = DEFAULT_INSOMNIA_PID_PATH): void {
  try {
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath);
    }
  } catch {
    // Ignore cleanup error
  }
}

// =============================================================
// Insomnia Daemon Implementation
// =============================================================

export class InsomniaDaemon {
  private statePath: string;
  private pidPath: string;
  private batteryThreshold: number;
  private checkIntervalMs: number;
  private reason: string;
  private runner?: CommandRunner;

  private caffeinateProcess: ChildProcess | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private startedAt: string | null = null;

  constructor(options: InsomniaOptions = {}) {
    this.statePath = options.statePath || DEFAULT_AMBIENT_STATE_PATH;
    this.pidPath = options.pidPath || DEFAULT_INSOMNIA_PID_PATH;
    this.batteryThreshold = options.batteryThreshold ?? DEFAULT_BATTERY_THRESHOLD;
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.reason = options.reason || "Overnight AI Agent Execution";
    this.runner = options.mockRunner;
  }

  /**
   * Queries macOS hardware power state.
   */
  async fetchPowerStatus(): Promise<PowerStatus> {
    try {
      const output = await runCommandWithTimeout(
        "pmset",
        ["-g", "batt"],
        2000,
        this.runner
      );
      return parsePmsetBatt(output);
    } catch {
      return {
        isPluggedIn: true,
        batteryPercent: 100,
        chargingStatus: "unknown",
      };
    }
  }

  /**
   * Queries macOS hardware thermal state.
   */
  async fetchThermalStatus(): Promise<ThermalStatus> {
    try {
      const output = await runCommandWithTimeout(
        "pmset",
        ["-g", "therm"],
        2000,
        this.runner
      );
      return parsePmsetTherm(output);
    } catch {
      return {
        isThrottled: false,
        cpuSpeedLimit: 100,
        cpuSchedulerLimit: 100,
        thermalWarningLevel: "None",
      };
    }
  }

  /**
   * Runs single diagnostic safety evaluation.
   */
  async checkSafety(): Promise<{
    safe: boolean;
    verdict: InsomniaSafetyVerdict;
    power: PowerStatus;
    thermal: ThermalStatus;
  }> {
    const power = await this.fetchPowerStatus();
    const thermal = await this.fetchThermalStatus();
    const verdict = evaluateInsomniaSafety(power, thermal, this.batteryThreshold);

    return {
      safe: verdict.safe,
      verdict,
      power,
      thermal,
    };
  }

  /**
   * Starts the caffeinate sleep assertion and periodic safety check loop.
   */
  async start(foreground: boolean = false): Promise<boolean> {
    if (this.isRunning) return true;

    // 1. Check existing PID file
    const existingPid = readPidFile(this.pidPath);
    if (existingPid && isProcessAlive(existingPid)) {
      console.log(`🌙 Fabric Insomnia is already active (PID: ${existingPid}).`);
      return true;
    }

    // 2. Perform initial safety check
    const check = await this.checkSafety();
    if (!check.safe) {
      console.warn(`❌ [Safety Governor] Cannot start insomnia: ${check.verdict.reason}`);
      await updateInsomniaBlackboard(
        {
          isActive: false,
          reason: this.reason,
          batteryPercent: check.power.batteryPercent,
          isPluggedIn: check.power.isPluggedIn,
          startedAt: null,
          releasedReason: check.verdict.code === "LOW_BATTERY_DC" ? "low_battery" : "thermal_throttle",
          lastSafetyCheck: new Date().toISOString(),
          safetyGovernor: {
            batteryThresholdPercent: this.batteryThreshold,
            isThermalThrottled: check.thermal.isThrottled,
            safeToRun: false,
            verdictCode: check.verdict.code,
            reason: check.verdict.reason,
          },
        },
        this.statePath
      );
      return false;
    }

    // 3. If launching in background daemon mode (not foreground)
    if (!foreground && typeof process !== "undefined" && process.argv) {
      return this.spawnBackgroundDaemon();
    }

    // 4. Foreground daemon execution: Spawn caffeinate child process
    this.startedAt = new Date().toISOString();
    this.isRunning = true;

    if (!this.runner) {
      try {
        // caffeinate -dims: prevents display, idle, disk, and system sleep
        this.caffeinateProcess = spawn("caffeinate", ["-dims"], {
          stdio: "ignore",
          detached: false,
        });

        this.caffeinateProcess.on("exit", (code) => {
          if (this.isRunning) {
            console.warn(`[Insomnia] caffeinate exited unexpectedly (code: ${code})`);
            this.stop("error");
          }
        });
      } catch (err: any) {
        console.error("Failed to spawn caffeinate:", err.message);
        return false;
      }
    }

    writePidFile(process.pid, this.pidPath);

    // 5. Update blackboard with active insomnia state
    await updateInsomniaBlackboard(
      {
        isActive: true,
        reason: this.reason,
        batteryPercent: check.power.batteryPercent,
        isPluggedIn: check.power.isPluggedIn,
        startedAt: this.startedAt,
        pid: process.pid,
        caffeinatePid: this.caffeinateProcess?.pid,
        releasedReason: null,
        lastSafetyCheck: new Date().toISOString(),
        safetyGovernor: {
          batteryThresholdPercent: this.batteryThreshold,
          isThermalThrottled: check.thermal.isThrottled,
          safeToRun: true,
          verdictCode: "SAFE",
          reason: null,
        },
      },
      this.statePath
    );

    console.log(
      `🌙 Fabric Insomnia active [PID: ${process.pid} | Battery: ${check.power.batteryPercent}% (${check.power.isPluggedIn ? "AC" : "DC"}) | Safety Interval: ${this.checkIntervalMs}ms]`
    );

    // 6. Schedule continuous governor safety checks
    this.checkTimer = setInterval(async () => {
      await this.runGovernorTick();
    }, this.checkIntervalMs);

    return true;
  }

  /**
   * Internal Safety Governor tick. Auto-releases sleep lock if thresholds breached.
   */
  async runGovernorTick(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const check = await this.checkSafety();

      if (!check.safe) {
        console.warn(
          `⚠️ [Safety Governor] Violation triggered: ${check.verdict.reason}`
        );
        const releaseReason =
          check.verdict.code === "LOW_BATTERY_DC" ? "low_battery" : "thermal_throttle";

        await this.stop(releaseReason, check.verdict.reason);
        return;
      }

      // Safe: update telemetry in blackboard
      await updateInsomniaBlackboard(
        {
          isActive: true,
          reason: this.reason,
          batteryPercent: check.power.batteryPercent,
          isPluggedIn: check.power.isPluggedIn,
          startedAt: this.startedAt,
          pid: process.pid,
          caffeinatePid: this.caffeinateProcess?.pid,
          releasedReason: null,
          lastSafetyCheck: new Date().toISOString(),
          safetyGovernor: {
            batteryThresholdPercent: this.batteryThreshold,
            isThermalThrottled: check.thermal.isThrottled,
            safeToRun: true,
            verdictCode: "SAFE",
            reason: null,
          },
        },
        this.statePath
      );
    } catch (err: any) {
      console.warn("[Insomnia] Safety check warning:", err.message);
    }
  }

  /**
   * Stops insomnia daemon and safely releases caffeinate sleep assertions.
   */
  async stop(
    releasedReason: InsomniaState["releasedReason"] = "user_stopped",
    detailReason?: string
  ): Promise<void> {
    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    // Terminate caffeinate child process
    if (this.caffeinateProcess) {
      try {
        this.caffeinateProcess.kill("SIGTERM");
      } catch {
        // Process might already be dead
      }
      this.caffeinateProcess = null;
    }

    removePidFile(this.pidPath);

    // Query current power for final state
    const power = await this.fetchPowerStatus();

    await updateInsomniaBlackboard(
      {
        isActive: false,
        reason: detailReason || (releasedReason === "user_stopped" ? "Stopped by user" : "Sleep lock released by safety governor"),
        batteryPercent: power.batteryPercent,
        isPluggedIn: power.isPluggedIn,
        startedAt: null,
        releasedReason,
        lastSafetyCheck: new Date().toISOString(),
        safetyGovernor: {
          batteryThresholdPercent: this.batteryThreshold,
          isThermalThrottled: false,
          safeToRun: releasedReason === "user_stopped",
          verdictCode: releasedReason === "user_stopped" ? "SAFE" : "RELEASED",
          reason: detailReason || null,
        },
      },
      this.statePath
    );

    console.log(`🌙 Fabric Insomnia stopped. Sleep lock released (${releasedReason}).`);
  }

  /**
   * Spawns a background detached worker running the daemon in foreground mode.
   */
  private spawnBackgroundDaemon(): boolean {
    const bunOrNode = process.execPath;
    const scriptPath = path.resolve(__dirname, "fabric-insomnia.ts");

    const args = [
      scriptPath,
      "--foreground",
      "--state-path",
      this.statePath,
      "--pid-path",
      this.pidPath,
      "--threshold",
      this.batteryThreshold.toString(),
      "--interval",
      this.checkIntervalMs.toString(),
      "--reason",
      this.reason,
    ];

    try {
      const child = spawn(bunOrNode, args, {
        detached: true,
        stdio: "ignore",
        cwd: process.cwd(),
      });

      child.unref();

      if (child.pid) {
        writePidFile(child.pid, this.pidPath);
        console.log(`🌙 Fabric Insomnia started in background (PID: ${child.pid}). Closed-lid execution active.`);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Failed to spawn background insomnia daemon:", err.message);
      return false;
    }
  }
}

// =============================================================
// CLI Actions & Interface
// =============================================================

export async function stopRunningDaemon(
  pidPath: string = DEFAULT_INSOMNIA_PID_PATH,
  statePath: string = DEFAULT_AMBIENT_STATE_PATH
): Promise<boolean> {
  const pid = readPidFile(pidPath);
  let stopped = false;

  if (pid) {
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        stopped = true;
      } catch {
        try {
          process.kill(pid, "SIGKILL");
          stopped = true;
        } catch {
          // Process not killable
        }
      }
    }
  }

  removePidFile(pidPath);

  // Clean blackboard
  const daemon = new InsomniaDaemon({ statePath, pidPath });
  await daemon.stop("user_stopped", "User stopped insomnia via CLI");

  return stopped;
}

export async function getStatusReport(
  statePath: string = DEFAULT_AMBIENT_STATE_PATH,
  pidPath: string = DEFAULT_INSOMNIA_PID_PATH
): Promise<{
  isActive: boolean;
  pid: number | null;
  state: InsomniaState | null;
  power: PowerStatus;
  thermal: ThermalStatus;
}> {
  const daemon = new InsomniaDaemon({ statePath, pidPath });
  const pid = readPidFile(pidPath);
  const alive = pid ? isProcessAlive(pid) : false;
  const blackboardState = await getInsomniaBlackboard(statePath);
  const power = await daemon.fetchPowerStatus();
  const thermal = await daemon.fetchThermalStatus();

  return {
    isActive: Boolean(alive && blackboardState?.isActive),
    pid: alive ? pid : null,
    state: blackboardState,
    power,
    thermal,
  };
}

export function printHelp(): void {
  console.log(`
Fabric OS — Insomnia & Closed-Lid Power Governor Daemon

Usage:
  bun run scripts/fabric-insomnia.ts [command] [options]

Commands:
  --start             Start insomnia sleep assertion & closed-lid governor
  --stop              Stop insomnia and release system sleep lock
  --status            Display live status, power source, and safety telemetry
  --toggle            Toggle insomnia between active and stopped states
  --check             Run instant battery and thermal safety governor check
  --help, -h          Show this help information

Options:
  --reason <text>     Reason for closed-lid execution (default: 'Overnight AI Agent Execution')
  --threshold <num>   Minimum battery percentage on DC before releasing lock (default: 20)
  --interval <ms>     Safety check polling interval in milliseconds (default: 10000)
  --foreground, -f    Run daemon in foreground (for testing or supervisor processes)
  --state-path <path> Path to .ambient_state.json blackboard
  --pid-path <path>   Path to .fabric_insomnia.pid file
  --json              Output structured JSON for --status or --check
`);
}

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  let statePath = DEFAULT_AMBIENT_STATE_PATH;
  let pidPath = DEFAULT_INSOMNIA_PID_PATH;
  let batteryThreshold = DEFAULT_BATTERY_THRESHOLD;
  let checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS;
  let reason = "Overnight AI Agent Execution";
  let isForeground = false;
  let isJson = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--state-path" && args[i + 1]) {
      statePath = args[++i];
    } else if (args[i] === "--pid-path" && args[i + 1]) {
      pidPath = args[++i];
    } else if (args[i] === "--threshold" && args[i + 1]) {
      batteryThreshold = parseInt(args[++i], 10) || DEFAULT_BATTERY_THRESHOLD;
    } else if (args[i] === "--interval" && args[i + 1]) {
      checkIntervalMs = parseInt(args[++i], 10) || DEFAULT_CHECK_INTERVAL_MS;
    } else if (args[i] === "--reason" && args[i + 1]) {
      reason = args[++i];
    } else if (args[i] === "--foreground" || args[i] === "-f") {
      isForeground = true;
    } else if (args[i] === "--json") {
      isJson = true;
    }
  }

  const daemon = new InsomniaDaemon({
    statePath,
    pidPath,
    batteryThreshold,
    checkIntervalMs,
    reason,
  });

  // 1. --check
  if (args.includes("--check")) {
    const result = await daemon.checkSafety();
    if (isJson) {
      console.log(
        JSON.stringify(
          {
            safe: result.safe,
            power: result.power,
            thermal: result.thermal,
            verdict: result.verdict,
            threshold: batteryThreshold,
          },
          null,
          2
        )
      );
    } else {
      console.log("🔍 [Fabric Insomnia Safety Governor Check]");
      console.log(`  • Power Source: ${result.power.isPluggedIn ? "🔌 AC Power" : "🔋 Battery Power"}`);
      console.log(`  • Battery Level: ${result.power.batteryPercent}% (Safety Threshold: ${batteryThreshold}%)`);
      console.log(`  • Charging State: ${result.power.chargingStatus}${result.power.timeRemaining ? ` (${result.power.timeRemaining} remaining)` : ""}`);
      console.log(`  • Thermal State: ${result.thermal.isThrottled ? `⚠️ THROTTLED (${result.thermal.thermalWarningLevel})` : "✅ Normal (Cool)"}`);
      console.log(`  • Safety Verdict: ${result.safe ? "✅ SAFE for closed-lid overnight agent execution" : `❌ UNSAFE: ${result.verdict.reason}`}`);
    }
    process.exit(result.safe ? 0 : 1);
  }

  // 2. --status
  if (args.includes("--status")) {
    const report = await getStatusReport(statePath, pidPath);
    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("🌙 [Fabric Insomnia Status]");
      console.log(`  • State: ${report.isActive ? "🟢 ACTIVE (Sleep Prevented)" : "⚪ INACTIVE (Normal Sleep Allowed)"}`);
      if (report.pid) console.log(`  • Daemon PID: ${report.pid}`);
      console.log(`  • Power Source: ${report.power.isPluggedIn ? "🔌 AC Power" : "🔋 Battery Power"} (${report.power.batteryPercent}%)`);
      console.log(`  • Thermal State: ${report.thermal.isThrottled ? `⚠️ Throttled (${report.thermal.thermalWarningLevel})` : "✅ Normal"}`);
      if (report.state?.startedAt) console.log(`  • Started At: ${report.state.startedAt}`);
      if (report.state?.reason) console.log(`  • Execution Reason: ${report.state.reason}`);
      if (report.state?.releasedReason) console.log(`  • Last Release Reason: ${report.state.releasedReason}`);
    }
    process.exit(0);
  }

  // 3. --stop
  if (args.includes("--stop")) {
    await stopRunningDaemon(pidPath, statePath);
    console.log("🌙 Fabric Insomnia sleep lock cleared.");
    process.exit(0);
  }

  // 4. --toggle
  if (args.includes("--toggle")) {
    const status = await getStatusReport(statePath, pidPath);
    if (status.isActive) {
      await stopRunningDaemon(pidPath, statePath);
      console.log("🌙 Fabric Insomnia toggled OFF.");
    } else {
      const ok = await daemon.start(isForeground);
      if (ok) {
        console.log("🌙 Fabric Insomnia toggled ON.");
      } else {
        process.exit(1);
      }
    }
    process.exit(0);
  }

  // 5. --start
  if (args.includes("--start")) {
    const ok = await daemon.start(isForeground);

    if (isForeground) {
      const shutdown = async () => {
        await daemon.stop("user_stopped");
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } else {
      process.exit(ok ? 0 : 1);
    }
  }
}

// Auto-run when executed directly via CLI
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("fabric-insomnia.ts")
) {
  runCli().catch((err) => {
    console.error("Fatal Insomnia error:", err);
    process.exit(1);
  });
}
