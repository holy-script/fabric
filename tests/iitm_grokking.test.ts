import { describe, it, expect } from "bun:test";
import fs from "fs";
import {
  loadQuestionBank,
  getSubjectKey,
  getSubjectAlias,
  recordPrepAnswer,
  getUserScore,
  resetUserScore,
  checkAnswer,
  formatScoreMessage,
  formatQuestionCard,
} from "../src/bot/commands/prep.js";
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

  it("correctly resolves subject aliases and keys", () => {
    expect(getSubjectKey("cn")).toBe("Computer_Networks");
    expect(getSubjectKey("networks")).toBe("Computer_Networks");
    expect(getSubjectKey("csd")).toBe("Computer_Systems_Design");
    expect(getSubjectKey("systems")).toBe("Computer_Systems_Design");
    expect(getSubjectKey("bdbn")).toBe("BDBN");
    expect(getSubjectKey("bio")).toBe("BDBN");
    expect(getSubjectKey("unknown_xyz")).toBeNull();

    expect(getSubjectAlias("Computer_Networks")).toBe("cn");
    expect(getSubjectAlias("Computer_Systems_Design")).toBe("csd");
    expect(getSubjectAlias("BDBN")).toBe("bdbn");
  });

  it("tracks user quiz scores, streaks, and subject breakdown accurately", () => {
    const testUserId = "test_user_777";
    resetUserScore(testUserId);

    let score = getUserScore(testUserId);
    expect(score.total).toBe(0);
    expect(score.correct).toBe(0);
    expect(score.streak).toBe(0);

    // Record correct answer (+2 marks) in Computer_Networks
    score = recordPrepAnswer(testUserId, "Computer_Networks", true, 2);
    expect(score.total).toBe(1);
    expect(score.correct).toBe(1);
    expect(score.marksEarned).toBe(2);
    expect(score.streak).toBe(1);
    expect(score.bySubject["Computer_Networks"].correct).toBe(1);

    // Record another correct answer in CSD
    score = recordPrepAnswer(testUserId, "Computer_Systems_Design", true, 1);
    expect(score.total).toBe(2);
    expect(score.correct).toBe(2);
    expect(score.streak).toBe(2);
    expect(score.maxStreak).toBe(2);

    // Record incorrect answer in BDBN (streak resets to 0, maxStreak remains 2)
    score = recordPrepAnswer(testUserId, "BDBN", false, 2);
    expect(score.total).toBe(3);
    expect(score.correct).toBe(2);
    expect(score.streak).toBe(0);
    expect(score.maxStreak).toBe(2);

    // Verify score message formatting
    const msg = formatScoreMessage(testUserId);
    expect(msg).toContain("IITM BS Quiz 1");
    expect(msg).toContain("2/3");
    expect(msg).toContain("Best: `2`");

    // Reset score
    resetUserScore(testUserId);
    const freshScore = getUserScore(testUserId);
    expect(freshScore.total).toBe(0);
  });

  it("evaluates answers and formats interactive question cards with option buttons", () => {
    const bank = loadQuestionBank();
    const q = bank["Computer_Networks"].questions[0];

    const card = formatQuestionCard("Computer_Networks", 0, q, "test_user_999");
    expect(card.text).toContain("Computer Networks");
    expect(card.text).toContain(q.source_paper);
    expect(card.keyboard).toBeDefined();

    // Test checkAnswer
    if (q.options && q.options.length > 0) {
      const correctIdx = q.options.findIndex((o) => o.includes("✓ Correct"));
      if (correctIdx >= 0) {
        const result = checkAnswer(q, correctIdx);
        expect(result.isCorrect).toBe(true);
      }
    }
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

