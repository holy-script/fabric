import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("FabricNotch — Native macOS Floating Notch HUD QC Suite", () => {
  const projectRoot = process.cwd();
  const sourcePath = path.join(projectRoot, "scripts/shortcuts/FabricNotch.swift");
  const buildScriptPath = path.join(projectRoot, "scripts/shortcuts/build_notch.sh");
  const binaryPath = path.join(projectRoot, "dist/FabricNotch");

  test("1. Swift source code exists and embodies Apple-grade architecture", () => {
    expect(fs.existsSync(sourcePath)).toBe(true);
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Framework integrations
    expect(source.includes("import Cocoa")).toBe(true);
    expect(source.includes("import SwiftUI")).toBe(true);

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

  test("2. Build script exists and is executable", () => {
    expect(fs.existsSync(buildScriptPath)).toBe(true);
    const stat = fs.statSync(buildScriptPath);
    // Executable bit set (at least user executable)
    expect((stat.mode & 0o111) !== 0).toBe(true);
  });

  test("3. Binary exists in dist/ and executes with --version", () => {
    expect(fs.existsSync(binaryPath)).toBe(true);
    const output = execSync(`"${binaryPath}" --version`, { encoding: "utf-8" });
    expect(output).toContain("FabricNotch v1.0.0");
    expect(output).toContain("arm64");
  });

  test("4. Binary provides comprehensive --help instructions", () => {
    const output = execSync(`"${binaryPath}" --help`, { encoding: "utf-8" });
    expect(output).toContain("FabricNotch — Native macOS Floating Notch HUD");
    expect(output).toContain("--check");
    expect(output).toContain("--headless");
    expect(output).toContain("Spark 90m");
  });

  test("5. Diagnostic check suite passes cleanly (--check)", () => {
    const output = execSync(`"${binaryPath}" --check`, { encoding: "utf-8" });
    expect(output).toContain("[FabricNotch QC] Running self-verification suite");
    expect(output).toContain("Decoded AmbientPayload");
    expect(output).toContain("TelemetryStore initialized");
    expect(output).toContain("RespirationWaveView synthesized");
    expect(output).toContain("All 4 checks passed cleanly");
  });

  test("6. Headless execution completes without blocking (--headless)", () => {
    const output = execSync(`"${binaryPath}" --headless`, { encoding: "utf-8" });
    expect(output).toContain("running in headless verification mode");
    expect(output).toContain("All 4 checks passed cleanly");
  });

  test("7. macOS Application Bundle structure exists and Info.plist is valid", () => {
    const appPath = path.join(projectRoot, "dist/FabricNotch.app");
    const contentsPath = path.join(appPath, "Contents");
    const infoPlistPath = path.join(contentsPath, "Info.plist");

    expect(fs.existsSync(appPath)).toBe(true);
    expect(fs.existsSync(contentsPath)).toBe(true);
    expect(fs.existsSync(infoPlistPath)).toBe(true);

    const plistContent = fs.readFileSync(infoPlistPath, "utf-8");

    // Bundle ID assertion
    expect(plistContent).toContain("<key>CFBundleIdentifier</key>");
    expect(plistContent).toContain("<string>com.fabric.notch</string>");

    // LSUIElement assertion (Agent / Menu Bar HUD without Dock icon)
    expect(plistContent).toContain("<key>LSUIElement</key>");
    expect(plistContent).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);

    // Bundle identity & executable metadata
    expect(plistContent).toContain("<key>CFBundleExecutable</key>");
    expect(plistContent).toContain("<string>FabricNotch</string>");
    expect(plistContent).toContain("<key>CFBundlePackageType</key>");
    expect(plistContent).toContain("<string>APPL</string>");
    expect(plistContent).toContain("<key>CFBundleShortVersionString</key>");
    expect(plistContent).toContain("<string>1.0.0</string>");

    // Retina and graphic optimizations
    expect(plistContent).toContain("<key>NSHighResolutionCapable</key>");
    expect(plistContent).toMatch(/<key>NSHighResolutionCapable<\/key>\s*<true\/>/);
  });

  test("8. App Bundle executable binary & PkgInfo integrity", () => {
    const appBinPath = path.join(projectRoot, "dist/FabricNotch.app/Contents/MacOS/FabricNotch");
    const pkgInfoPath = path.join(projectRoot, "dist/FabricNotch.app/Contents/PkgInfo");

    // PkgInfo verification
    expect(fs.existsSync(pkgInfoPath)).toBe(true);
    const pkgInfoContent = fs.readFileSync(pkgInfoPath, "utf-8").trim();
    expect(pkgInfoContent).toBe("APPL????");

    // Executable binary existence and permissions
    expect(fs.existsSync(appBinPath)).toBe(true);
    const stat = fs.statSync(appBinPath);
    expect((stat.mode & 0o111) !== 0).toBe(true);

    // Execute directly from inside the .app bundle
    const versionOutput = execSync(`"${appBinPath}" --version`, { encoding: "utf-8" });
    expect(versionOutput).toContain("FabricNotch v1.0.0");
    expect(versionOutput).toContain("arm64");

    const checkOutput = execSync(`"${appBinPath}" --check`, { encoding: "utf-8" });
    expect(checkOutput).toContain("All 4 checks passed cleanly");
  });

  test("9. Look-and-Feel & Navigation audit: Quick actions & feedback dispatch", () => {
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

  test("10. Geometry & display notch anchoring specifications", () => {
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Compact dimensions (430 x 44)
    expect(source.includes("let initialWidth: CGFloat = 430")).toBe(true);
    expect(source.includes("let initialHeight: CGFloat = 44")).toBe(true);

    // Expanded hover dimensions (480 x 134)
    expect(source.includes("targetWidth: CGFloat = expanded ? 480 : 430")).toBe(true);
    expect(source.includes("targetHeight: CGFloat = expanded ? 134 : 44")).toBe(true);

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

  test("11. Aesthetic & fluid animation specifications", () => {
    const source = fs.readFileSync(sourcePath, "utf-8");

    // OLED dark glassmorphism (10, 10, 15 @ 92% opacity)
    expect(source.includes("Color(red: 10/255, green: 10/255, blue: 15/255).opacity(0.92)")).toBe(true);

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
