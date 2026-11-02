import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import fs from "fs";
import path from "path";
import { NotebookLMAdapter } from "../../browser/adapters/notebooklm.js";
import { getIITMGrokkingBundles } from "../../integrations/notebooklm/exporter.js";

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

export interface UserPrepScore {
  userId: string;
  correct: number;
  total: number;
  marksEarned: number;
  totalMarks: number;
  streak: number;
  maxStreak: number;
  bySubject: Record<string, { correct: number; total: number; marksEarned: number; totalMarks: number }>;
  lastUpdated: string;
}

const BANK_PATH = path.resolve(process.cwd(), "data/notebooklm_sources/iitm_prep_questions.json");

let cachedBank: QuestionBank | null = null;
const userScores = new Map<string, UserPrepScore>();

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

export function getSubjectAlias(subjectKey: string): "cn" | "csd" | "bdbn" {
  if (subjectKey === "Computer_Networks") return "cn";
  if (subjectKey === "Computer_Systems_Design") return "csd";
  return "bdbn";
}

export function getUserScore(userId: string | number): UserPrepScore {
  const id = String(userId);
  if (!userScores.has(id)) {
    userScores.set(id, {
      userId: id,
      correct: 0,
      total: 0,
      marksEarned: 0,
      totalMarks: 0,
      streak: 0,
      maxStreak: 0,
      bySubject: {
        Computer_Networks: { correct: 0, total: 0, marksEarned: 0, totalMarks: 0 },
        Computer_Systems_Design: { correct: 0, total: 0, marksEarned: 0, totalMarks: 0 },
        BDBN: { correct: 0, total: 0, marksEarned: 0, totalMarks: 0 },
      },
      lastUpdated: new Date().toISOString(),
    });
  }
  return userScores.get(id)!;
}

export function recordPrepAnswer(
  userId: string | number,
  subjectKey: string,
  isCorrect: boolean,
  marks: number = 1
): UserPrepScore {
  const score = getUserScore(userId);
  score.total += 1;
  score.totalMarks += marks;
  if (isCorrect) {
    score.correct += 1;
    score.marksEarned += marks;
    score.streak += 1;
    if (score.streak > score.maxStreak) {
      score.maxStreak = score.streak;
    }
  } else {
    score.streak = 0;
  }

  if (!score.bySubject[subjectKey]) {
    score.bySubject[subjectKey] = { correct: 0, total: 0, marksEarned: 0, totalMarks: 0 };
  }
  score.bySubject[subjectKey].total += 1;
  score.bySubject[subjectKey].totalMarks += marks;
  if (isCorrect) {
    score.bySubject[subjectKey].correct += 1;
    score.bySubject[subjectKey].marksEarned += marks;
  }
  score.lastUpdated = new Date().toISOString();
  return score;
}

export function resetUserScore(userId: string | number): void {
  const id = String(userId);
  userScores.delete(id);
}

export function checkAnswer(
  q: PrepQuestion,
  optionIndex: number
): { isCorrect: boolean; chosenOptionText: string; correctOptionText: string } {
  const chosenOpt = q.options && q.options[optionIndex] ? q.options[optionIndex] : "";
  const isCorrect = Boolean(
    chosenOpt.includes("✓ Correct") ||
    (q.correct && q.correct.some((c) => c.includes(chosenOpt.replace("✓ Correct", "").trim()))) ||
    (q.answer && chosenOpt.trim().toLowerCase() === q.answer.trim().toLowerCase())
  );

  const correctOpt =
    q.options?.find((o) => o.includes("✓ Correct")) ||
    (q.correct && q.correct[0]) ||
    q.answer ||
    "See explanation";

  return {
    isCorrect,
    chosenOptionText: chosenOpt.replace("✓ Correct", "").trim(),
    correctOptionText: correctOpt.replace("✓ Correct", "").trim(),
  };
}

export function formatScoreMessage(userId: string | number): string {
  const score = getUserScore(userId);
  const acc = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
  let msg = `🏆 *IITM BS Quiz 1 Sparring — Performance Dossier*\n\n`;
  msg += `• *Overall Accuracy:* \`${score.correct}/${score.total}\` (*${acc}%*)\n`;
  msg += `• *Marks Tally:* \`${score.marksEarned}/${score.totalMarks}\` Marks\n`;
  msg += `• *Current Streak:* \`${score.streak}\` 🔥 (Best: \`${score.maxStreak}\`)\n\n`;

  msg += `📚 *Breakdown by Course:*\n`;
  const subLabels: Record<string, string> = {
    Computer_Networks: "📘 Computer Networks",
    Computer_Systems_Design: "⚡ Computer Systems Design",
    BDBN: "🧬 Big Data & Biological Networks",
  };
  for (const [key, stats] of Object.entries(score.bySubject)) {
    const sAcc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    const label = subLabels[key] || key;
    msg += `• ${label}: \`${stats.correct}/${stats.total}\` (*${sAcc}%*) • \`+${stats.marksEarned} pts\`\n`;
  }
  msg += `\nKeep testing daily to grok invariants before Quiz 1!`;
  return msg;
}

export function formatQuestionCard(
  subjectKey: string,
  qIdx: number,
  q: PrepQuestion,
  userId?: string | number
): { text: string; keyboard: InlineKeyboard } {
  const subjectDisplay =
    subjectKey === "Computer_Networks"
      ? "📘 Computer Networks"
      : subjectKey === "Computer_Systems_Design"
      ? "⚡ Computer Systems Design"
      : "🧬 Big Data & Biological Networks";

  const subAlias = getSubjectAlias(subjectKey);

  let msg = `🎓 *IITM BS QUIZ 1 SPARRING: ${subjectDisplay}*\n`;

  if (userId) {
    const score = getUserScore(userId);
    const acc = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    msg += `🏆 *Score:* \`${score.correct}/${score.total}\` (${acc}%) • *Streak:* \`${score.streak}\` 🔥\n`;
  }

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
    { text: "💡 Reveal Solution", callback_data: `prep_sol:${subjectKey}:${qIdx}` },
    { text: "➡️ Next Question", callback_data: `prep:q:${subjectKey}:random` }
  );
  keyboard.row(
    { text: "🎲 Change Subject", callback_data: "prep:menu" },
    { text: "🎙️ Upload to NotebookLM", callback_data: `prep:nlm:${subAlias}` }
  );
  keyboard.row(
    { text: "🏆 My Score", callback_data: "prep:score" },
    { text: "🏠 Academic Hub", callback_data: "prep:menu" }
  );

  return { text: msg, keyboard };
}

export async function handlePrepNotebookLMUpload(
  ctx: Context,
  subjectArg?: string
): Promise<void> {
  const bundles = getIITMGrokkingBundles();
  let normalizedKey = "cn";
  if (subjectArg) {
    const resolvedKey = getSubjectKey(subjectArg);
    if (resolvedKey === "Computer_Systems_Design" || subjectArg === "csd") normalizedKey = "csd";
    else if (resolvedKey === "BDBN" || subjectArg === "bdbn") normalizedKey = "bdbn";
    else normalizedKey = "cn";
  }

  const bundle = bundles.find((b) => b.subject === normalizedKey) || bundles[0];

  const waitMsg = await ctx.reply(
    `🤖 *Autonomous NotebookLM Upload Initiated...*\n\n` +
      `• Target: *${bundle.title}*\n` +
      `• File: \`${bundle.fileName}\` (${bundle.questionCount} PYQs + Formulas)\n` +
      `• Chrome Profile: \`~/.fabric/browser_profile\`\n\n` +
      `⏳ _Checking browser session and uploading study guide to NotebookLM..._`,
    { parse_mode: "Markdown" }
  );

  try {
    const adapter = new NotebookLMAdapter();
    const loginStatus = await adapter.checkLoginStatus();

    if (!loginStatus.isLoggedIn) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `⚠️ *Google NotebookLM Authentication Required*\n\n` +
          `Your local Chrome profile (\`~/.fabric/browser_profile\`) is not logged into Google.\n\n` +
          `*To authenticate:*\n` +
          `1. Open Google Chrome with profile \`~/.fabric/browser_profile\`\n` +
          `2. Sign in to your Google Account at [notebooklm.google.com](https://notebooklm.google.com)\n` +
          `3. Re-run \`/prep nlm ${normalizedKey}\` for autonomous sync.\n\n` +
          `_You can also manually download the markdown file via \`/nlm export ${normalizedKey}\`._`,
        {
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: true },
          reply_markup: {
            inline_keyboard: [
              [{ text: "📦 Export Markdown File", callback_data: `nlm:export:${normalizedKey}` }],
              [{ text: "🎙️ Open NotebookLM", url: "https://notebooklm.google.com" }],
            ],
          },
        }
      );
      return;
    }

    // Create dedicated notebook
    const notebook = await adapter.createNotebook(bundle.title);

    // Upload study guide markdown source
    const uploadResult = await adapter.uploadMarkdownSource(notebook.url, bundle.filePath);

    // Trigger Audio Overview podcast
    let podcastStatus = "idle";
    try {
      const audioResult = await adapter.triggerAudioOverview(notebook.url);
      podcastStatus = audioResult.status;
    } catch (audioErr: any) {
      podcastStatus = `Notice: ${audioErr.message}`;
    }

    let reply = `🎙️ *IITM Master Notebook Uploaded to NotebookLM!*\n\n`;
    reply += `• **Notebook:** *${bundle.title}*\n`;
    reply += `• **Source Ingested:** \`${uploadResult.sourceTitle}\` (${(uploadResult.bytesUploaded / 1024).toFixed(1)} KB)\n`;
    reply += `• **Audio Overview Status:** \`${podcastStatus}\`\n\n`;
    reply += `Your curated question bank, formulas, and prompt blueprint are loaded. Click below to start studying or generate your podcast overview!`;

    const keyboard = new InlineKeyboard().url("🎙️ Open on Google NotebookLM", notebook.url);
    keyboard.row({
      text: "➡️ Continue Quiz Sparring",
      callback_data: `prep:q:${bundle.subject === "cn" ? "Computer_Networks" : bundle.subject === "csd" ? "Computer_Systems_Design" : "BDBN"}:random`,
    });

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, reply, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `⚠️ *NotebookLM Automated Upload Notice:*\n\n` +
        `${err.message}\n\n` +
        `_Tip: You can receive the markdown directly with \`/nlm export ${normalizedKey}\`._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 Export Markdown Directly", callback_data: `nlm:export:${normalizedKey}` }],
            [{ text: "🏠 Academic Hub", callback_data: "prep:menu" }],
          ],
        },
      }
    );
  }
}

export async function handlePrep(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const arg = parts[1]?.toLowerCase();
  const subArg = parts[2]?.toLowerCase();
  const userId = ctx.from?.id ? String(ctx.from.id) : "operator";

  // Check for /prep nlm [cn|csd|bdbn]
  if (arg === "nlm" || arg === "notebooklm") {
    await handlePrepNotebookLMUpload(ctx, subArg);
    return;
  }

  // Check for /prep score or /prep stats
  if (arg === "score" || arg === "stats") {
    const scoreMsg = formatScoreMessage(userId);
    const keyboard = new InlineKeyboard()
      .text("📘 Study Computer Networks", "prep:q:Computer_Networks:random")
      .row()
      .text("⚡ Study Systems Design", "prep:q:Computer_Systems_Design:random")
      .row()
      .text("🧬 Study Biological Networks", "prep:q:BDBN:random")
      .row()
      .text("🔄 Reset My Score", "prep:reset")
      .text("🏠 Academic Hub", "prep:menu");
    await ctx.reply(scoreMsg, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  // Check for /prep reset
  if (arg === "reset") {
    resetUserScore(userId);
    await ctx.reply("🔄 *Quiz Score Reset!* Your session stats and streaks have been cleared. Ready for a new sprint!", {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("🎯 Start Practicing", "prep:menu"),
    });
    return;
  }

  const bank = loadQuestionBank();

  // Check for /prep random or /prep all
  if (arg === "random" || arg === "all" || arg === "mix") {
    const subjects = Object.keys(bank);
    if (subjects.length === 0) {
      await ctx.reply("⚠️ Question bank is currently empty.");
      return;
    }
    const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];
    const list = bank[randomSubject]?.questions || [];
    if (list.length === 0) {
      await ctx.reply("⚠️ No questions found for this subject.");
      return;
    }
    const qIdx = Math.floor(Math.random() * list.length);
    const q = list[qIdx];
    const { text: msg, keyboard } = formatQuestionCard(randomSubject, qIdx, q, userId);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  const subjectKey = arg ? getSubjectKey(arg) : null;

  if (subjectKey && bank[subjectKey]) {
    const list = bank[subjectKey].questions;
    if (list.length === 0) {
      await ctx.reply("⚠️ No questions found for this subject.");
      return;
    }
    const qIdx = Math.floor(Math.random() * list.length);
    const q = list[qIdx];
    const { text: msg, keyboard } = formatQuestionCard(subjectKey, qIdx, q, userId);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  // Default: Overview Interactive Hub Menu
  const cnCount = bank["Computer_Networks"]?.questions.length || 0;
  const csdCount = bank["Computer_Systems_Design"]?.questions.length || 0;
  const bdbnCount = bank["BDBN"]?.questions.length || 0;
  const total = cnCount + csdCount + bdbnCount;

  const score = getUserScore(userId);
  const acc = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

  let menu = `🎓 *IIT Madras BS Degree — Quiz 1 Grokking Foundry*\n`;
  menu += `Grounded on official Previous Year Question (PYQ) papers across all 3 active courses.\n\n`;

  if (score.total > 0) {
    menu += `🏆 *Your Live Score:* \`${score.correct}/${score.total}\` (*${acc}%*) • *Streak:* \`${score.streak}\` 🔥\n\n`;
  }

  menu += `📊 *Active Question Bank (${total} Questions Extracted):*\n`;
  menu += `• 📘 *Computer Networks:* \`${cnCount}\` exam questions (\`/prep cn\`)\n`;
  menu += `• ⚡ *Computer Systems Design:* \`${csdCount}\` exam questions (\`/prep csd\`)\n`;
  menu += `• 🧬 *Big Data & Biological Networks:* \`${bdbnCount}\` exam questions (\`/prep bdbn\`)\n\n`;

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
    .text("🏆 My Performance Score", "prep:score")
    .text("🎙️ Upload to NotebookLM", "prep:export_menu");

  await ctx.reply(menu, { parse_mode: "Markdown", reply_markup: keyboard });
}
