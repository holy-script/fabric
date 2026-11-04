import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("Fabric / FabricNotch — Unified Native macOS Desktop App & Daemon Controller QC Suite", () => {
  const projectRoot = process.cwd();
  const sourcePath = path.join(projectRoot, "scripts/shortcuts/FabricNotch.swift");
  const buildScriptPath = path.join(projectRoot, "scripts/shortcuts/build_notch.sh");
  const binaryPath = path.join(projectRoot, "dist/FabricNotch");
  const fabricBinPath = path.join(projectRoot, "dist/Fabric");

  test("1. Swift source code exists and embodies Apple-grade architecture", () => {
    expect(fs.existsSync(sourcePath)).toBe(true);
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Framework integrations
    expect(source.includes("import Cocoa")).toBe(true);
    expect(source.includes("import SwiftUI")).toBe(true);
    expect(source.includes("import UserNotifications")).toBe(true);

    // Window level and floating HUD configuration
    expect(source.includes(".statusBar")).toBe(true);
    expect(source.includes(".canJoinAllSpaces")).toBe(true);
    expect(source.includes(".fullScreenAuxiliary")).toBe(true);
    expect(source.includes(".accessory")).toBe(true);

    // Respiration wave & 4F metrics
    expect(source.includes("RespirationWaveView")).toBe(true);
    expect(source.includes("TimelineView")).toBe(true);
    expect(source.includes("FourFVector")).toBe(true);
    expect(source.includes("vitalityScore")).toBe(true);

    // Hover expansion & quick actions
    expect(source.includes("onHover")).toBe(true);
    expect(source.includes("triggerSpark")).toBe(true);
    expect(source.includes("triggerSettle")).toBe(true);
  });

  test("2. Process & Daemon Controller architecture in Swift source", () => {
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Controller models
    expect(source.includes("DaemonProcessManager")).toBe(true);
    expect(source.includes("DaemonProcessInfo")).toBe(true);
    expect(source.includes("DaemonStatus")).toBe(true);

    // 4 Background Workers
    expect(source.includes("macOS Ambient Daemon")).toBe(true);
    expect(source.includes("Telegram Video Vault Archiver")).toBe(true);
    expect(source.includes("Insomnia Power Governor")).toBe(true);
    expect(source.includes("Cybernetic Governor")).toBe(true);

    // Live status indicators & PID detection
    expect(source.includes("🟢")).toBe(true);
    expect(source.includes("⚪")).toBe(true);
    expect(source.includes("🔴")).toBe(true);
    expect(source.includes("findPids")).toBe(true);
    expect(source.includes("statusDetail")).toBe(true);

    // 1-Click Start, Stop, and prominent Force Quit All
    expect(source.includes("startDaemon")).toBe(true);
    expect(source.includes("stopDaemon")).toBe(true);
    expect(source.includes("forceQuitAllDaemons")).toBe(true);
    expect(source.includes("Force Quit All")).toBe(true);

    // Native Notifications & Clean Quit
    expect(source.includes("FabricNotifier")).toBe(true);
    expect(source.includes("UNUserNotificationCenter")).toBe(true);
    expect(source.includes("quitAndStopAll")).toBe(true);
    expect(source.includes("Quit Fabric & Stop All Daemons")).toBe(true);
  });

  test("3. Build script exists and is executable", () => {
    expect(fs.existsSync(buildScriptPath)).toBe(true);
    const stat = fs.statSync(buildScriptPath);
    expect((stat.mode & 0o111) !== 0).toBe(true);
  });

  test("4. Binaries exist in dist/ and execute with --version", () => {
    expect(fs.existsSync(binaryPath)).toBe(true);
    expect(fs.existsSync(fabricBinPath)).toBe(true);

    const output = execSync(`"${binaryPath}" --version`, { encoding: "utf-8" });
    expect(output).toContain("v1.0.0");
    expect(output).toContain("arm64");

    const fabricOutput = execSync(`"${fabricBinPath}" --version`, { encoding: "utf-8" });
    expect(fabricOutput).toContain("Fabric v1.0.0");
    expect(fabricOutput).toContain("arm64");
  });

  test("5. Binaries provide comprehensive --help instructions", () => {
    const output = execSync(`"${binaryPath}" --help`, { encoding: "utf-8" });
    expect(output).toContain("Fabric / FabricNotch — Unified Native macOS Desktop App & Daemon Controller");
    expect(output).toContain("--check");
    expect(output).toContain("--headless");
    expect(output).toContain("--daemons");
    expect(output).toContain("--force-quit");
    expect(output).toContain("Spark 90m");
    expect(output).toContain("Process & Daemon Controller HUD");
  });

  test("6. Diagnostic check suite passes cleanly (--check, 8 assertions)", () => {
    const output = execSync(`"${binaryPath}" --check`, { encoding: "utf-8" });
    expect(output).toContain("[FabricNotch QC] Running self-verification suite");
    expect(output).toContain("Decoded AmbientPayload");
    expect(output).toContain("TelemetryStore initialized");
    expect(output).toContain("RespirationWaveView synthesized");
    expect(output).toContain("DaemonProcessManager initialized with 4 workers");
    expect(output).toContain("FabricNotifier toast dispatcher verified");
    expect(output).toContain("Force Quit dry-run logic simulated");
    expect(output).toContain("All 8 checks passed cleanly");
  });

  test("7. Headless execution completes without blocking (--headless)", () => {
    const output = execSync(`"${binaryPath}" --headless`, { encoding: "utf-8" });
    expect(output).toContain("running in headless verification mode");
    expect(output).toContain("All 8 checks passed cleanly");
  });

  test("8. Live Daemon status query succeeds (--daemons)", () => {
    const output = execSync(`"${binaryPath}" --daemons`, { encoding: "utf-8" });
    expect(output).toContain("Fabric OS — Background Workers & Daemons Status:");
    expect(output).toContain("macOS Ambient Daemon");
    expect(output).toContain("Telegram Video Vault Archiver");
    expect(output).toContain("Insomnia Power Governor");
    expect(output).toContain("Cybernetic Governor");
  });

  test("9. Force-Quit simulation completes cleanly without unintended kills (--force-quit --dry-run)", () => {
    const output = execSync(`"${binaryPath}" --force-quit --dry-run`, { encoding: "utf-8" });
    expect(output).toContain("Initiating Force Quit of all Fabric OS background daemons (Dry-Run Mode)");
    expect(output).toContain("All background daemons and child processes identified for cleanup");
  });

  test("10. macOS FabricNotch.app Application Bundle structure & Info.plist validity", () => {
    const appPath = path.join(projectRoot, "dist/FabricNotch.app");
    const contentsPath = path.join(appPath, "Contents");
    const infoPlistPath = path.join(contentsPath, "Info.plist");

    expect(fs.existsSync(appPath)).toBe(true);
    expect(fs.existsSync(contentsPath)).toBe(true);
    expect(fs.existsSync(infoPlistPath)).toBe(true);

    const plistContent = fs.readFileSync(infoPlistPath, "utf-8");
    expect(plistContent).toContain("<string>com.fabric.notch</string>");
    expect(plistContent).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);
    expect(plistContent).toContain("<string>FabricNotch</string>");
    expect(plistContent).toContain("<string>APPL</string>");
    expect(plistContent).toContain("<string>1.0.0</string>");
  });

  test("11. macOS Fabric.app Universal Application Bundle structure & Info.plist validity", () => {
    const appPath = path.join(projectRoot, "dist/Fabric.app");
    const contentsPath = path.join(appPath, "Contents");
    const infoPlistPath = path.join(contentsPath, "Info.plist");

    expect(fs.existsSync(appPath)).toBe(true);
    expect(fs.existsSync(contentsPath)).toBe(true);
    expect(fs.existsSync(infoPlistPath)).toBe(true);

    const plistContent = fs.readFileSync(infoPlistPath, "utf-8");
    expect(plistContent).toContain("<string>com.fabric.app</string>");
    expect(plistContent).toContain("<string>Fabric OS</string>");
    expect(plistContent).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);
    expect(plistContent).toContain("<string>Fabric</string>");
    expect(plistContent).toContain("<string>APPL</string>");
  });

  test("12. App Bundles executable binary & PkgInfo integrity", () => {
    const notchBinPath = path.join(projectRoot, "dist/FabricNotch.app/Contents/MacOS/FabricNotch");
    const notchPkgInfo = path.join(projectRoot, "dist/FabricNotch.app/Contents/PkgInfo");
    const fabricAppBin = path.join(projectRoot, "dist/Fabric.app/Contents/MacOS/Fabric");
    const fabricPkgInfo = path.join(projectRoot, "dist/Fabric.app/Contents/PkgInfo");

    // PkgInfo verification
    expect(fs.existsSync(notchPkgInfo)).toBe(true);
    expect(fs.readFileSync(notchPkgInfo, "utf-8").trim()).toBe("APPL????");
    expect(fs.existsSync(fabricPkgInfo)).toBe(true);
    expect(fs.readFileSync(fabricPkgInfo, "utf-8").trim()).toBe("APPL????");

    // Executables
    expect(fs.existsSync(notchBinPath)).toBe(true);
    expect(fs.existsSync(fabricAppBin)).toBe(true);
    expect((fs.statSync(notchBinPath).mode & 0o111) !== 0).toBe(true);
    expect((fs.statSync(fabricAppBin).mode & 0o111) !== 0).toBe(true);

    // Execute directly from inside the .app bundles
    const notchCheck = execSync(`"${notchBinPath}" --check`, { encoding: "utf-8" });
    expect(notchCheck).toContain("All 8 checks passed cleanly");

    const fabricCheck = execSync(`"${fabricAppBin}" --check`, { encoding: "utf-8" });
    expect(fabricCheck).toContain("All 8 checks passed cleanly");
  });

  test("13. Look-and-Feel & Navigation audit: Quick actions & feedback dispatch", () => {
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Quick Action button definitions
    expect(source.includes("actionButton(icon: \"bolt.fill\", title: \"Spark 90m\"")).toBe(true);
    expect(source.includes("actionButton(icon: \"flag.checkered\", title: \"Settle\"")).toBe(true);
    expect(source.includes("actionButton(icon: \"arrow.clockwise\", title: \"Refresh\"")).toBe(true);
    expect(source.includes("actionButton(icon: \"safari.fill\", title: \"Cockpit\"")).toBe(true);

    // Quick Action backend dispatches
    expect(source.includes("action: \"spark\"")).toBe(true);
    expect(source.includes("duration\": \"1.5\"")).toBe(true);
    expect(source.includes("action: \"settle\"")).toBe(true);
    expect(source.includes("http://localhost:3000/api/quick")).toBe(true);
    expect(source.includes("http://localhost:3000/dashboard")).toBe(true);

    // Feedback banner notifications with automatic dismissal
    expect(source.includes("⚡ 90m Focus Sprint Sparked!")).toBe(true);
    expect(source.includes("🏁 Session Settled (+1 Energy)")).toBe(true);
    expect(source.includes("🔄 State Synced")).toBe(true);
    expect(source.includes("feedbackBanner")).toBe(true);
  });

  test("14. Geometry & display notch anchoring specifications", () => {
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Compact dimensions (430 x 44)
    expect(source.includes("let initialWidth: CGFloat = 430")).toBe(true);
    expect(source.includes("let initialHeight: CGFloat = 44")).toBe(true);

    // Expanded hover dimensions (540 x 330)
    expect(source.includes("targetWidth: CGFloat = expanded ? 540 : 430")).toBe(true);
    expect(source.includes("targetHeight: CGFloat = expanded ? 330 : 44")).toBe(true);

    // Screen top-center anchor calculation
    expect(source.includes("screenFrame.midX - initialWidth / 2.0")).toBe(true);
    expect(source.includes("screenFrame.maxY - initialHeight")).toBe(true);
    expect(source.includes("screenFrame.maxY - targetHeight")).toBe(true);

    // Window level & mission control behavior
    expect(source.includes("window.level = .statusBar")).toBe(true);
    expect(source.includes(".canJoinAllSpaces")).toBe(true);
    expect(source.includes(".fullScreenAuxiliary")).toBe(true);
    expect(source.includes(".stationary")).toBe(true);
  });

  test("15. Aesthetic & fluid animation specifications", () => {
    const source = fs.readFileSync(sourcePath, "utf-8");

    // OLED dark glassmorphism (10, 10, 15 @ 94% opacity)
    expect(source.includes("Color(red: 10/255, green: 10/255, blue: 15/255).opacity(0.94)")).toBe(true);

    // Continuous corner radius transition (19 compact -> 24 expanded)
    expect(source.includes("cornerRadius: isHovered ? 24 : 19")).toBe(true);

    // Dual-harmonic canvas wave generation
    expect(source.includes("let wave1 = sin(normX * 6.0 * .pi - phase)")).toBe(true);
    expect(source.includes("let wave2 = sin(normX * 12.0 * .pi + phase * 1.3) * 0.22")).toBe(true);
    expect(source.includes("let envelope = sin(normX * .pi)")).toBe(true);

    // Physics spring transitions & collapse debounce
    expect(source.includes(".spring(response: 0.30, dampingFraction: 0.78)")).toBe(true);
    expect(source.includes(".spring(response: 0.28, dampingFraction: 0.82)")).toBe(true);
    expect(source.includes("asyncAfter(deadline: .now() + 0.18")).toBe(true);
  });
});
