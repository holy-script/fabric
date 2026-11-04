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
});
