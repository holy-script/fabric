import { describe, it, expect } from "bun:test";
import fs from "fs";
import { loadQuestionBank } from "../src/bot/commands/prep.js";
import { getIITMGrokkingBundles } from "../src/integrations/notebooklm/exporter.js";
import { extractGoogleAiModeShare } from "../src/services/sharegoogle.js";

describe("IITM Quiz 1 Grokking & Google AI Mode QC Suite", () => {
  it("loads structured question bank with verified PYQs for all 3 courses", () => {
    const bank = loadQuestionBank();
    const subjects = Object.keys(bank);

    expect(subjects).toContain("Computer_Networks");
    expect(subjects).toContain("Computer_Systems_Design");
    expect(subjects).toContain("BDBN");

    expect(bank["Computer_Networks"].questions.length).toBeGreaterThanOrEqual(20);
    expect(bank["Computer_Systems_Design"].questions.length).toBeGreaterThanOrEqual(20);
    expect(bank["BDBN"].questions.length).toBeGreaterThanOrEqual(50);

    // Verify sample question structure
    const sample = bank["Computer_Networks"].questions[0];
    expect(sample.text.length).toBeGreaterThan(15);
    expect(sample.source_paper).toContain(".pdf");
  });

  it("exports all 3 high-yield Markdown source bundles for Google NotebookLM", () => {
    const bundles = getIITMGrokkingBundles();
    expect(bundles.length).toBe(3);

    for (const b of bundles) {
      expect(fs.existsSync(b.filePath)).toBe(true);
      const content = fs.readFileSync(b.filePath, "utf-8");
      // Must be substantial (>15KB)
      expect(content.length).toBeGreaterThan(15000);
      // Must contain Master Formula Sheet with KaTeX
      expect(content).toContain("Module I: Master Formula Sheet");
      // Must contain NotebookLM Audio Prompt
      expect(content).toContain("Module IV: NotebookLM Deep-Dive Audio Prompt");
    }
  });

  it("extracts and decodes Google AI Mode share links with prompt & full blueprint", async () => {
    const testUrl = "https://share.google/aimode/Y3DE6SVtWOnD5QFn8";
    const decoded = await extractGoogleAiModeShare(testUrl);

    expect(decoded).not.toBeNull();
    if (decoded) {
      expect(decoded.url).toBe(testUrl);
      expect(decoded.prompt.toLowerCase()).toContain("n5");
      expect(decoded.response.toLowerCase()).toContain("blueprint");
      expect(decoded.sourceFilePath).toBeDefined();
      expect(fs.existsSync(decoded.sourceFilePath!)).toBe(true);
    }
  });
});
