import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  parsePmsetBatt,
  parsePmsetTherm,
  evaluateInsomniaSafety,
  updateInsomniaBlackboard,
  getInsomniaBlackboard,
  InsomniaDaemon,
  readPidFile,
  writePidFile,
  removePidFile,
  DEFAULT_BATTERY_THRESHOLD,
  type PowerStatus,
  type ThermalStatus,
  type InsomniaState,
} from "../scripts/fabric-insomnia.js";
import {
  getCurrentAmbientContext,
  generateDynamicIslandPayload,
} from "../src/services/ambient.js";

describe("Fabric OS — Insomnia & Closed-Lid Power Governor QC Suite", () => {
  const projectRoot = process.cwd();
  const scriptPath = path.join(projectRoot, "scripts/fabric-insomnia.ts");
  const shellLauncherPath = path.join(projectRoot, "scripts/shortcuts/fabric-insomnia.sh");

  let testDir: string;
  let testStatePath: string;
  let testPidPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-insomnia-test-"));
    testStatePath = path.join(testDir, ".ambient_state.json");
    testPidPath = path.join(testDir, ".fabric_insomnia.pid");
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  // ===========================================================
  // 1. pmset -g batt Parsing Unit Tests
  // ===========================================================
  describe("1. Battery and Power Source Parsing (pmset -g batt)", () => {
    test("correctly parses AC Power at 100% charged", () => {
      const mockOutput = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=36372579)\t100%; charged; 0:00 remaining present: true`;
      const parsed = parsePmsetBatt(mockOutput);

      expect(parsed.isPluggedIn).toBe(true);
      expect(parsed.batteryPercent).toBe(100);
      expect(parsed.chargingStatus).toBe("charged");
      expect(parsed.timeRemaining).toBe("0:00");
    });

    test("correctly parses AC Power actively charging at 72%", () => {
      const mockOutput = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=36372579)\t72%; charging; 0:45 remaining present: true`;
      const parsed = parsePmsetBatt(mockOutput);

      expect(parsed.isPluggedIn).toBe(true);
      expect(parsed.batteryPercent).toBe(72);
      expect(parsed.chargingStatus).toBe("charging");
      expect(parsed.timeRemaining).toBe("0:45");
    });

    test("correctly parses Battery Power discharging at 85%", () => {
      const mockOutput = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=36372579)\t85%; discharging; 4:12 remaining present: true`;
      const parsed = parsePmsetBatt(mockOutput);

      expect(parsed.isPluggedIn).toBe(false);
      expect(parsed.batteryPercent).toBe(85);
      expect(parsed.chargingStatus).toBe("discharging");
      expect(parsed.timeRemaining).toBe("4:12");
    });

    test("correctly parses Battery Power low at 14%", () => {
      const mockOutput = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=36372579)\t14%; discharging; 0:28 remaining present: true`;
      const parsed = parsePmsetBatt(mockOutput);

      expect(parsed.isPluggedIn).toBe(false);
      expect(parsed.batteryPercent).toBe(14);
      expect(parsed.chargingStatus).toBe("discharging");
      expect(parsed.timeRemaining).toBe("0:28");
    });

    test("handles Desktop Mac without internal battery gracefully", () => {
      const mockOutput = `Now drawing from 'AC Power'`;
      const parsed = parsePmsetBatt(mockOutput);

      expect(parsed.isPluggedIn).toBe(true);
      expect(parsed.batteryPercent).toBe(100);
      expect(parsed.chargingStatus).toBe("unknown");
    });

    test("handles empty or malformed output cleanly", () => {
      const parsed = parsePmsetBatt("");
      expect(parsed.isPluggedIn).toBe(true);
      expect(parsed.batteryPercent).toBe(100);
      expect(parsed.chargingStatus).toBe("unknown");
    });
  });

  // ===========================================================
  // 2. pmset -g therm Parsing Unit Tests
  // ===========================================================
  describe("2. Thermal Status Parsing (pmset -g therm)", () => {
    test("parses normal thermal status with zero warnings", () => {
      const mockOutput = `Note: No thermal warning level has been recorded
Note: No performance warning level has been recorded
Note: No CPU power status has been recorded`;
      const parsed = parsePmsetTherm(mockOutput);

      expect(parsed.isThrottled).toBe(false);
      expect(parsed.cpuSpeedLimit).toBe(100);
      expect(parsed.cpuSchedulerLimit).toBe(100);
      expect(parsed.thermalWarningLevel).toBe("None");
    });

    test("detects CPU Speed Limit throttling (e.g. 65%)", () => {
      const mockOutput = `CPU_Speed_Limit = 65
CPU_Scheduler_Limit = 100
CPU_Available_CPUs = 8`;
      const parsed = parsePmsetTherm(mockOutput);

      expect(parsed.isThrottled).toBe(true);
      expect(parsed.cpuSpeedLimit).toBe(65);
      expect(parsed.cpuSchedulerLimit).toBe(100);
    });

    test("detects CPU Scheduler Limit throttling (e.g. 50%)", () => {
      const mockOutput = `CPU_Speed_Limit = 100
CPU_Scheduler_Limit = 50
CPU_Available_CPUs = 8`;
      const parsed = parsePmsetTherm(mockOutput);

      expect(parsed.isThrottled).toBe(true);
      expect(parsed.cpuSchedulerLimit).toBe(50);
    });

    test("detects explicit Thermal Warning Level (Moderate / Heavy / Trapping)", () => {
      const mockOutput = `Thermal_Warning_Level = Moderate
CPU_Speed_Limit = 100`;
      const parsed = parsePmsetTherm(mockOutput);

      expect(parsed.isThrottled).toBe(true);
      expect(parsed.thermalWarningLevel).toBe("Moderate");
    });

    test("handles natural language thermal warning format", () => {
      const mockOutput = `Thermal warning level: Trapping`;
      const parsed = parsePmsetTherm(mockOutput);

      expect(parsed.isThrottled).toBe(true);
      expect(parsed.thermalWarningLevel).toBe("Trapping");
    });

    test("handles empty thermal output safely without throwing", () => {
      const parsed = parsePmsetTherm("");
      expect(parsed.isThrottled).toBe(false);
      expect(parsed.cpuSpeedLimit).toBe(100);
    });
  });

  // ===========================================================
  // 3. Safety Governor Thresholds & Aristotelian Balance
  // ===========================================================
  describe("3. Safety Governor Evaluation (evaluateInsomniaSafety)", () => {
    const normalTherm: ThermalStatus = {
      isThrottled: false,
      cpuSpeedLimit: 100,
      cpuSchedulerLimit: 100,
      thermalWarningLevel: "None",
    };

    const throttledTherm: ThermalStatus = {
      isThrottled: true,
      cpuSpeedLimit: 70,
      cpuSchedulerLimit: 100,
      thermalWarningLevel: "Moderate",
    };

    test("verdict is SAFE when on AC Power at 100%", () => {
      const power: PowerStatus = {
        isPluggedIn: true,
        batteryPercent: 100,
        chargingStatus: "charged",
      };
      const verdict = evaluateInsomniaSafety(power, normalTherm);
      expect(verdict.safe).toBe(true);
      expect(verdict.code).toBe("SAFE");
    });

    test("verdict is SAFE on AC Power even if battery level is low (e.g. 15%)", () => {
      const power: PowerStatus = {
        isPluggedIn: true,
        batteryPercent: 15,
        chargingStatus: "charging",
      };
      const verdict = evaluateInsomniaSafety(power, normalTherm);
      expect(verdict.safe).toBe(true);
    });

    test("verdict is SAFE on Battery Power when above 20% threshold (e.g. 60%)", () => {
      const power: PowerStatus = {
        isPluggedIn: false,
        batteryPercent: 60,
        chargingStatus: "discharging",
      };
      const verdict = evaluateInsomniaSafety(power, normalTherm, DEFAULT_BATTERY_THRESHOLD);
      expect(verdict.safe).toBe(true);
    });

    test("verdict is UNSAFE on Battery Power when below 20% threshold (e.g. 18%)", () => {
      const power: PowerStatus = {
        isPluggedIn: false,
        batteryPercent: 18,
        chargingStatus: "discharging",
      };
      const verdict = evaluateInsomniaSafety(power, normalTherm, DEFAULT_BATTERY_THRESHOLD);
      expect(verdict.safe).toBe(false);
      expect(verdict.code).toBe("LOW_BATTERY_DC");
      expect(verdict.reason).toContain("preserve battery health");
    });

    test("verdict is UNSAFE when thermal throttling is active even on AC Power", () => {
      const power: PowerStatus = {
        isPluggedIn: true,
        batteryPercent: 100,
        chargingStatus: "charged",
      };
      const verdict = evaluateInsomniaSafety(power, throttledTherm);
      expect(verdict.safe).toBe(false);
      expect(verdict.code).toBe("THERMAL_THROTTLED");
      expect(verdict.reason).toContain("overheating");
    });

    test("supports custom battery thresholds (e.g. 35%)", () => {
      const power: PowerStatus = {
        isPluggedIn: false,
        batteryPercent: 30,
        chargingStatus: "discharging",
      };
      // 30% is below 35% custom threshold
      const verdict = evaluateInsomniaSafety(power, normalTherm, 35);
      expect(verdict.safe).toBe(false);
      expect(verdict.code).toBe("LOW_BATTERY_DC");

      // 30% is above 20% default threshold
      const defaultVerdict = evaluateInsomniaSafety(power, normalTherm, 20);
      expect(defaultVerdict.safe).toBe(true);
    });
  });

  // ===========================================================
  // 4. Blackboard & Ambient Context Persistence
  // ===========================================================
  describe("4. Blackboard State Updates & Dynamic Island Integration", () => {
    test("writes active insomnia state to .ambient_state.json blackboard", async () => {
      const now = new Date().toISOString();
      const state: InsomniaState = {
        isActive: true,
        reason: "Overnight Video Vault Archiver",
        batteryPercent: 98,
        isPluggedIn: true,
        startedAt: now,
        pid: 12345,
        releasedReason: null,
        safetyGovernor: {
          batteryThresholdPercent: 20,
          isThermalThrottled: false,
          safeToRun: true,
        },
      };

      await updateInsomniaBlackboard(state, testStatePath);

      const loaded = await getInsomniaBlackboard(testStatePath);
      expect(loaded).not.toBeNull();
      expect(loaded?.isActive).toBe(true);
      expect(loaded?.reason).toBe("Overnight Video Vault Archiver");
      expect(loaded?.batteryPercent).toBe(98);
      expect(loaded?.isPluggedIn).toBe(true);
      expect(loaded?.startedAt).toBe(now);

      // Verify Dynamic Island payload reflects insomnia
      const ambient = await getCurrentAmbientContext({ statePath: testStatePath });
      expect(ambient.dynamicIsland.badge).toBe("🌙 INSOMNIA");
      expect(ambient.dynamicIsland.icon).toBe("🌙");
      expect(ambient.dynamicIsland.headline).toContain("Insomnia Active");
    });

    test("writes inactive insomnia state and clears dynamic island insomnia badge", async () => {
      // First make active
      await updateInsomniaBlackboard(
        {
          isActive: true,
          reason: "Active Task",
          batteryPercent: 80,
          isPluggedIn: false,
          startedAt: new Date().toISOString(),
        },
        testStatePath
      );

      // Then stop
      await updateInsomniaBlackboard(
        {
          isActive: false,
          reason: "Stopped by user",
          batteryPercent: 79,
          isPluggedIn: false,
          startedAt: null,
          releasedReason: "user_stopped",
        },
        testStatePath
      );

      const loaded = await getInsomniaBlackboard(testStatePath);
      expect(loaded?.isActive).toBe(false);
      expect(loaded?.releasedReason).toBe("user_stopped");

      const ambient = await getCurrentAmbientContext({ statePath: testStatePath });
      expect(ambient.dynamicIsland.badge).not.toBe("🌙 INSOMNIA");
    });

    test("PID file management utilities write, read, and remove correctly", () => {
      writePidFile(99887, testPidPath);
      expect(fs.existsSync(testPidPath)).toBe(true);
      expect(readPidFile(testPidPath)).toBe(99887);

      removePidFile(testPidPath);
      expect(fs.existsSync(testPidPath)).toBe(false);
      expect(readPidFile(testPidPath)).toBeNull();
    });
  });

  // ===========================================================
  // 5. InsomniaDaemon Class & Continuous Safety Governor Loop
  // ===========================================================
  describe("5. InsomniaDaemon Lifecycle & Auto-Release Governor", () => {
    test("initializes with options and default thresholds", () => {
      const daemon = new InsomniaDaemon({
        statePath: testStatePath,
        pidPath: testPidPath,
        batteryThreshold: 25,
        checkIntervalMs: 500,
        reason: "Test Suite Execution",
      });

      expect(daemon).toBeDefined();
    });

    test("performs safety check with injected mock runner", async () => {
      const mockBatt = `Now drawing from 'AC Power'\n -InternalBattery-0\t100%; charged; 0:00 remaining present: true`;
      const mockTherm = `Note: No thermal warning level has been recorded`;

      const mockRunner = async (cmd: string, args: string[]) => {
        if (args.includes("batt")) return mockBatt;
        if (args.includes("therm")) return mockTherm;
        return "";
      };

      const daemon = new InsomniaDaemon({
        statePath: testStatePath,
        pidPath: testPidPath,
        mockRunner,
      });

      const check = await daemon.checkSafety();
      expect(check.safe).toBe(true);
      expect(check.power.isPluggedIn).toBe(true);
      expect(check.power.batteryPercent).toBe(100);
      expect(check.thermal.isThrottled).toBe(false);
    });

    test("refuses to start when machine is unsafe (battery < 20% on DC)", async () => {
      const mockBatt = `Now drawing from 'Battery Power'\n -InternalBattery-0\t12%; discharging; 0:20 remaining present: true`;
      const mockTherm = `Note: No thermal warning level has been recorded`;

      const mockRunner = async (cmd: string, args: string[]) => {
        if (args.includes("batt")) return mockBatt;
        if (args.includes("therm")) return mockTherm;
        return "";
      };

      const daemon = new InsomniaDaemon({
        statePath: testStatePath,
        pidPath: testPidPath,
        batteryThreshold: 20,
        mockRunner,
      });

      const started = await daemon.start(true);
      expect(started).toBe(false);

      const state = await getInsomniaBlackboard(testStatePath);
      expect(state?.isActive).toBe(false);
      expect(state?.releasedReason).toBe("low_battery");
    });

    test("auto-releases sleep lock when battery drops below threshold during governor tick", async () => {
      let currentBatt = `Now drawing from 'Battery Power'\n -InternalBattery-0\t50%; discharging; 2:00 remaining present: true`;
      const mockTherm = `Note: No thermal warning level has been recorded`;

      const mockRunner = async (cmd: string, args: string[]) => {
        if (args.includes("batt")) return currentBatt;
        if (args.includes("therm")) return mockTherm;
        return "";
      };

      const daemon = new InsomniaDaemon({
        statePath: testStatePath,
        pidPath: testPidPath,
        batteryThreshold: 20,
        mockRunner,
      });

      // 1. Initial start is safe (50% on DC)
      const started = await daemon.start(true);
      expect(started).toBe(true);

      let state = await getInsomniaBlackboard(testStatePath);
      expect(state?.isActive).toBe(true);

      // 2. Simulate battery dropping to 15% on DC
      currentBatt = `Now drawing from 'Battery Power'\n -InternalBattery-0\t15%; discharging; 0:30 remaining present: true`;

      // Trigger governor tick
      await daemon.runGovernorTick();

      // Lock must be automatically released
      state = await getInsomniaBlackboard(testStatePath);
      expect(state?.isActive).toBe(false);
      expect(state?.releasedReason).toBe("low_battery");
    });

    test("auto-releases sleep lock when thermal throttling occurs during governor tick", async () => {
      const mockBatt = `Now drawing from 'AC Power'\n -InternalBattery-0\t100%; charged; 0:00 remaining present: true`;
      let currentTherm = `Note: No thermal warning level has been recorded`;

      const mockRunner = async (cmd: string, args: string[]) => {
        if (args.includes("batt")) return mockBatt;
        if (args.includes("therm")) return currentTherm;
        return "";
      };

      const daemon = new InsomniaDaemon({
        statePath: testStatePath,
        pidPath: testPidPath,
        mockRunner,
      });

      const started = await daemon.start(true);
      expect(started).toBe(true);

      // Simulate thermal warning
      currentTherm = `Thermal_Warning_Level = Heavy\nCPU_Speed_Limit = 50`;

      await daemon.runGovernorTick();

      const state = await getInsomniaBlackboard(testStatePath);
      expect(state?.isActive).toBe(false);
      expect(state?.releasedReason).toBe("thermal_throttle");
    });
  });

  // ===========================================================
  // 6. CLI Flags & Shell Launcher Verification
  // ===========================================================
  describe("6. CLI Flags & Shell Launcher Interface", () => {
    test("shell launcher script exists and is executable", () => {
      expect(fs.existsSync(shellLauncherPath)).toBe(true);
      const stat = fs.statSync(shellLauncherPath);
      expect((stat.mode & 0o111) !== 0).toBe(true);
    });

    test("CLI --help displays usage documentation cleanly", () => {
      const output = execSync(`bun run "${scriptPath}" --help`, { encoding: "utf-8" });
      expect(output).toContain("Fabric OS — Insomnia & Closed-Lid Power Governor Daemon");
      expect(output).toContain("--start");
      expect(output).toContain("--stop");
      expect(output).toContain("--status");
      expect(output).toContain("--toggle");
      expect(output).toContain("--check");
      expect(output).toContain("--threshold");
    });

    test("CLI --check runs live safety evaluation", () => {
      const output = execSync(`bun run "${scriptPath}" --check`, { encoding: "utf-8" });
      expect(output).toContain("Fabric Insomnia Safety Governor Check");
      expect(output).toContain("Power Source:");
      expect(output).toContain("Battery Level:");
      expect(output).toContain("Thermal State:");
      expect(output).toContain("Safety Verdict:");
    });

    test("CLI --check --json returns valid parseable JSON", () => {
      const output = execSync(`bun run "${scriptPath}" --check --json`, { encoding: "utf-8" });
      const parsed = JSON.parse(output);
      expect(typeof parsed.safe).toBe("boolean");
      expect(parsed.power).toBeDefined();
      expect(typeof parsed.power.batteryPercent).toBe("number");
      expect(parsed.thermal).toBeDefined();
      expect(typeof parsed.thermal.isThrottled).toBe("boolean");
    });

    test("CLI --status displays current status", () => {
      const output = execSync(
        `bun run "${scriptPath}" --status --state-path "${testStatePath}" --pid-path "${testPidPath}"`,
        { encoding: "utf-8" }
      );
      expect(output).toContain("[Fabric Insomnia Status]");
      expect(output).toContain("Power Source:");
    });

    test("CLI --status --json returns valid parseable JSON", () => {
      const output = execSync(
        `bun run "${scriptPath}" --status --json --state-path "${testStatePath}" --pid-path "${testPidPath}"`,
        { encoding: "utf-8" }
      );
      const parsed = JSON.parse(output);
      expect(typeof parsed.isActive).toBe("boolean");
      expect(parsed.power).toBeDefined();
      expect(parsed.thermal).toBeDefined();
    });

    test("shell launcher ./scripts/shortcuts/fabric-insomnia.sh --check executes cleanly", () => {
      const output = execSync(`"${shellLauncherPath}" --check`, { encoding: "utf-8" });
      expect(output).toContain("Fabric Insomnia Safety Governor Check");
      expect(output).toContain("Safety Verdict:");
    });
  });
});
