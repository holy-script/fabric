import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import fs from "fs";
import path from "path";

export interface PrepQuestion {
  num: string;
  marks: string;
  type: string;
  text: string;
  options: string[];
  correct: string[];
  answer: string;
  source_paper: string;
}

export interface SubjectBank {
  title: string;
  questions: PrepQuestion[];
}

export type QuestionBank = Record<string, SubjectBank>;

const BANK_PATH = path.resolve(process.cwd(), "data/notebooklm_sources/iitm_prep_questions.json");

let cachedBank: QuestionBank | null = null;

export function loadQuestionBank(): QuestionBank {
  if (cachedBank) return cachedBank;
  try {
    if (fs.existsSync(BANK_PATH)) {
      const raw = fs.readFileSync(BANK_PATH, "utf-8");
      cachedBank = JSON.parse(raw);
      return cachedBank!;
    }
  } catch (err) {
    console.error("Failed to load IITM question bank:", err);
  }
  return {};
}

export function getSubjectKey(alias: string): string | null {
  const norm = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm.includes("net") || norm === "cn") return "Computer_Networks";
  if (norm.includes("sys") || norm.includes("design") || norm === "csd") return "Computer_Systems_Design";
  if (norm.includes("bio") || norm === "bdbn") return "BDBN";
  return null;
}

export function formatQuestionCard(
  subjectKey: string,
  qIdx: number,
  q: PrepQuestion
): { text: string; keyboard: InlineKeyboard } {
  const subjectDisplay =
    subjectKey === "Computer_Networks"
      ? "📘 Computer Networks"
      : subjectKey === "Computer_Systems_Design"
      ? "⚡ Computer Systems Design"
      : "🧬 Big Data & Biological Networks";

  let msg = `🎓 *IITM BS QUIZ 1 SPARRING: ${subjectDisplay}*\n`;
  msg += `*Format:* \`${q.type} • ${q.marks} Marks\` | *Paper:* \`${q.source_paper}\`\n\n`;
  msg += `❓ *Question #${qIdx + 1}:*\n${q.text}\n\n`;

  const keyboard = new InlineKeyboard();

  if (q.options && q.options.length > 0) {
    msg += `*Options:*\n`;
    const rowButtons: Array<{ text: string; callback_data: string }> = [];

    q.options.forEach((opt, idx) => {
      const cleanOpt = opt.replace("✓ Correct", "").trim();
      const label = String.fromCharCode(65 + idx); // A, B, C, D...
      msg += `*${label}.* ${cleanOpt}\n`;

      rowButtons.push({
        text: label,
        callback_data: `prep_ans:${subjectKey}:${qIdx}:${idx}`,
      });
    });
    msg += `\n`;

    // Add option buttons (up to 4 per row)
    for (let i = 0; i < rowButtons.length; i += 4) {
      keyboard.row(...rowButtons.slice(i, i + 4));
    }
  }

  // Action buttons
  keyboard.row(
    { text: "💡 Reveal Formula & Solution", callback_data: `prep_sol:${subjectKey}:${qIdx}` },
    { text: "➡️ Next Question", callback_data: `prep:q:${subjectKey}:random` }
  );
  keyboard.row({ text: "🏠 Academic Hub", callback_data: "prep:menu" });

  return { text: msg, keyboard };
}

export async function handlePrep(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const arg = parts[1]?.toLowerCase();

  const bank = loadQuestionBank();
  const subjectKey = arg ? getSubjectKey(arg) : null;

  if (subjectKey && bank[subjectKey]) {
    const list = bank[subjectKey].questions;
    if (list.length === 0) {
      await ctx.reply("⚠️ No questions found for this subject.");
      return;
    }
    const qIdx = Math.floor(Math.random() * list.length);
    const q = list[qIdx];
    const { text: msg, keyboard } = formatQuestionCard(subjectKey, qIdx, q);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  // Default: Overview Menu
  const cnCount = bank["Computer_Networks"]?.questions.length || 0;
  const csdCount = bank["Computer_Systems_Design"]?.questions.length || 0;
  const bdbnCount = bank["BDBN"]?.questions.length || 0;
  const total = cnCount + csdCount + bdbnCount;

  let menu = `🎓 *IIT Madras BS Degree — Quiz 1 Grokking Foundry*\n`;
  menu += `Grounded on official Previous Year Question (PYQ) papers across all 3 active courses.\n\n`;

  menu += `📊 *Active Question Bank (${total} Questions Extracted):*\n`;
  menu += `• 📘 *Computer Networks:* \`${cnCount}\` exam questions\n`;
  menu += `• ⚡ *Computer Systems Design:* \`${csdCount}\` exam questions\n`;
  menu += `• 🧬 *Big Data & Biological Networks:* \`${bdbnCount}\` exam questions\n\n`;

  menu += `🎯 *Choose your study mode below to start active recall testing:*`;

  const keyboard = new InlineKeyboard()
    .text(`📘 Computer Networks (${cnCount})`, "prep:q:Computer_Networks:random")
    .row()
    .text(`⚡ Systems Design (${csdCount})`, "prep:q:Computer_Systems_Design:random")
    .row()
    .text(`🧬 Biological Networks (${bdbnCount})`, "prep:q:BDBN:random")
    .row()
    .text("🎲 Mix All 3 Subjects (Exam Mode)", "prep:q:random:random")
    .row()
    .text("🎙️ Export Sources to NotebookLM", "prep:export_menu");

  await ctx.reply(menu, { parse_mode: "Markdown", reply_markup: keyboard });
}

