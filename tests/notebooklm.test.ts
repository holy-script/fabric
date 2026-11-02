import { describe, test, expect } from "bun:test";
import {
  exportClusterToNotebookLM,
  exportMasterHeuristicsToNotebookLM,
} from "../src/integrations/notebooklm/exporter.js";
import fs from "fs";

describe("NotebookLM Integration QC Suite", () => {
  test("generates citation-grounded Markdown source bundle for a cluster", async () => {
    const bundle = await exportClusterToNotebookLM("cluster_ai_autonomous_systems");
    expect(bundle).not.toBeNull();
    if (!bundle) return;

    expect(bundle.fileName).toContain("autonomous_ai_agents");
    expect(bundle.itemCount).toBeGreaterThan(0);
    expect(fs.existsSync(bundle.filePath)).toBe(true);

    const content = fs.readFileSync(bundle.filePath, "utf-8");
    expect(content).toContain("# NotebookLM Knowledge Source:");
    expect(content).toContain("Actionable Takeaway & Implementation Heuristic");
    expect(content).toContain("Source [1]:");
  });

  test("generates master heuristics and axioms bundle", async () => {
    const bundle = await exportMasterHeuristicsToNotebookLM();
    expect(bundle).not.toBeNull();
    expect(bundle.fileName).toBe("Fabric_Master_Heuristics_and_Axioms.md");
    expect(bundle.itemCount).toBeGreaterThan(0);
    expect(fs.existsSync(bundle.filePath)).toBe(true);

    const content = fs.readFileSync(bundle.filePath, "utf-8");
    expect(content).toContain("Fabric Master Heuristics & Axioms");
  });
});

