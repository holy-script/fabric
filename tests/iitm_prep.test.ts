import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(import.meta.dir, "../data/iitm_prep");
const QUESTION_BANK_FILE = path.join(DATA_DIR, "quiz1_question_bank.json");
const CN_MASTER_FILE = path.join(DATA_DIR, "computer_networks_quiz1_master.md");
const CSD_MASTER_FILE = path.join(DATA_DIR, "computer_systems_design_quiz1_master.md");
const BDBN_MASTER_FILE = path.join(DATA_DIR, "big_data_biological_networks_quiz1_master.md");

describe("IITM BS Quiz 1 Prep & NotebookLM Grokking Package QC Suite", () => {
  test("1. Structured question bank JSON exists and loads valid records", () => {
    expect(fs.existsSync(QUESTION_BANK_FILE)).toBe(true);
    const content = fs.readFileSync(QUESTION_BANK_FILE, "utf-8");
    const qb = JSON.parse(content);

    expect(Array.isArray(qb)).toBe(true);
    expect(qb.length).toBeGreaterThanOrEqual(150); // We extracted 179 questions
  });

  test("2. Question bank covers all 3 target subjects with significant question volume", () => {
    const qb = JSON.parse(fs.readFileSync(QUESTION_BANK_FILE, "utf-8"));

    const subjects = new Set(qb.map((q: any) => q.subject));
    expect(subjects.has("Computer Networks")).toBe(true);
    expect(subjects.has("Computer Systems Design")).toBe(true);
    expect(subjects.has("Big Data and Biological Networks")).toBe(true);

    const cnCount = qb.filter((q: any) => q.subject === "Computer Networks").length;
    const csdCount = qb.filter((q: any) => q.subject === "Computer Systems Design").length;
    const bdbnCount = qb.filter((q: any) => q.subject === "Big Data and Biological Networks").length;

    expect(cnCount).toBeGreaterThanOrEqual(30);
    expect(csdCount).toBeGreaterThanOrEqual(40);
    expect(bdbnCount).toBeGreaterThanOrEqual(80);
  });

  test("3. Question objects conform to strict schema requirements", () => {
    const qb = JSON.parse(fs.readFileSync(QUESTION_BANK_FILE, "utf-8"));

    for (const q of qb) {
      expect(typeof q.id).toBe("string");
      expect(q.id.length).toBeGreaterThan(3);

      expect(typeof q.subject).toBe("string");
      expect(["Computer Networks", "Computer Systems Design", "Big Data and Biological Networks"]).toContain(q.subject);

      expect(typeof q.topic).toBe("string");
      expect(q.topic.length).toBeGreaterThan(3);

      expect(typeof q.question).toBe("string");
      expect(q.question.length).toBeGreaterThan(0);

      expect(Array.isArray(q.options)).toBe(true);

      expect(typeof q.answer).toBe("string");
      expect(q.answer.length).toBeGreaterThan(0);

      expect(typeof q.explanation).toBe("string");
      expect(q.explanation.length).toBeGreaterThan(20);

      expect(["MCQ", "MSQ", "NAT"]).toContain(q.type);
      expect(typeof q.marks).toBe("number");
      expect(q.marks).toBeGreaterThanOrEqual(1.0);
    }
  });

  test("4. Computer Networks Master Study Notebook has substantial content and structure", () => {
    expect(fs.existsSync(CN_MASTER_FILE)).toBe(true);
    const content = fs.readFileSync(CN_MASTER_FILE, "utf-8");

    expect(content.length).toBeGreaterThan(20000); // > 20 KB
    expect(content).toContain("## Part 1: High-Yield Conceptual Cheat Sheet");
    expect(content).toContain("## Part 2: Categorized Past Exam Question Bank");
    expect(content).toContain("## Part 3: Rapid Active Recall Flashcard Drill");

    // Key technical concepts covered
    expect(content).toContain("Transmission Delay");
    expect(content).toContain("Little's Law");
    expect(content).toContain("Selective Repeat");
    expect(content).toContain("Go-Back-N");
    expect(content).toContain("Internet Checksum");
    expect(content).toContain("mermaid");
  });

  test("5. Computer Systems Design Master Study Notebook has substantial content and structure", () => {
    expect(fs.existsSync(CSD_MASTER_FILE)).toBe(true);
    const content = fs.readFileSync(CSD_MASTER_FILE, "utf-8");

    expect(content.length).toBeGreaterThan(25000); // > 25 KB
    expect(content).toContain("## Part 1: High-Yield Conceptual Cheat Sheet");
    expect(content).toContain("## Part 2: Categorized Past Exam Question Bank");
    expect(content).toContain("## Part 3: Rapid Active Recall Flashcard Drill");

    // Key technical concepts covered
    expect(content).toContain("Radix Number Systems");
    expect(content).toContain("Shannon's Expansion");
    expect(content).toContain("Multiplexer");
    expect(content).toContain("De Morgan's Laws");
    expect(content).toContain("Critical Path");
    expect(content).toContain("mermaid");
  });

  test("6. Big Data and Biological Networks Master Study Notebook has substantial content and structure", () => {
    expect(fs.existsSync(BDBN_MASTER_FILE)).toBe(true);
    const content = fs.readFileSync(BDBN_MASTER_FILE, "utf-8");

    expect(content.length).toBeGreaterThan(50000); // > 50 KB
    expect(content).toContain("## Part 1: High-Yield Conceptual Cheat Sheet");
    expect(content).toContain("## Part 2: Categorized Past Exam Question Bank");
    expect(content).toContain("## Part 3: Rapid Active Recall Flashcard Drill");

    // Key technical concepts covered
    expect(content).toContain("Central Dogma");
    expect(content).toContain("Clustering Coefficient");
    expect(content).toContain("Erdős–Rényi");
    expect(content).toContain("Watts-Strogatz");
    expect(content).toContain("Scale-Free");
    expect(content).toContain("Bridge Amplification");
    expect(content).toContain("mermaid");
  });

  test("7. All 3 Master Notebooks are optimized for NotebookLM ingestion", () => {
    const files = [CN_MASTER_FILE, CSD_MASTER_FILE, BDBN_MASTER_FILE];

    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      // Markdown alert block
      expect(content).toContain("> [!IMPORTANT]");
      // LaTeX math formatting
      expect(content).toContain("$$");
      // Active recall table headers
      expect(content).toContain("Instant Recall Answer");
      expect(content).toContain("Deep-Grokking Rule");
    }
  });
});
