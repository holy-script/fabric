import type { Context } from "grammy";
import { startSession, getActiveSession } from "../../db/firestore.js";

export async function handleSpark(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text?.replace(/^\/spark\s*/i, "").trim();

  if (!text) {
    const existing = await getActiveSession(userId);
    if (existing) {
      const elapsedMin = Math.round(
        (Date.now() - existing.startedAt.getTime()) / (1000 * 60)
      );
      await ctx.reply(
        `⚡ *Active Session In Flight*\n` +
          `• Task: ${existing.taskDescription}\n` +
          `• Started: ${elapsedMin} minutes ago\n\n` +
          `Send \`/settle <outcome>\` when finished.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        `⚡ *Initiate a Flow Block*\nUsage: \`/spark <task description> [expected duration]\`\n\n` +
          `_Example: \`/spark 90m deep work on film color grading\`_`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // Parse duration if present (e.g. 90m, 2h)
  const durationMatch = text.match(/(\d+(?:\.\d+)?)\s*(h|m|min|hours?)/i);
  let expectedHours: number | undefined;
  if (durationMatch) {
    const val = parseFloat(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    expectedHours = unit.startsWith("m") ? val / 60 : val;
  }

  await startSession({
    userId,
    startedAt: new Date(),
    taskDescription: text,
    focusExpectedHours: expectedHours,
    tags: ["spark"],
  });

  await ctx.reply(
    `⚡ *Flow Block Sparked*\n` +
      `🎯 *Task:* ${text}\n` +
      `⏳ *Planned Focus:* ${expectedHours ? `${expectedHours}h` : "Open-ended"}\n\n` +
      `_Enter monotropic flow. When done, send \`/settle <outcome & energy>\`._`,
    { parse_mode: "Markdown" }
  );
}

