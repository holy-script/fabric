import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { createGoal, getUserGoals, unlockGoal } from "../../db/firestore.js";

export async function handleGoal(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text?.replace(/^\/goal\s*/i, "").trim();

  if (!text || !text.includes("->")) {
    await ctx.reply(
      `🎯 *Set a Gated Milestone & Reward*\n` +
        `Usage: \`/goal <milestone condition> -> <guilt-free reward>\`\n\n` +
        `_Example: \`/goal Complete 5 plyo workouts this week -> Buy new studio headphones\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const [milestone, reward] = text.split("->").map((s) => s.trim());

  const goalId = await createGoal({
    userId,
    title: milestone,
    targetMetric: "Verified via telemetry",
    reward,
  });

  await ctx.reply(
    `🔒 *Validation Gate Armed* \`#${goalId.slice(-6)}\`\n\n` +
      `🎯 *Milestone:* ${milestone}\n` +
      `🎁 *Locked Reward:* ${reward}\n\n` +
      `_This reward is locked in the Reward Bank until you clear the gate. Run \`/goals\` to view progress._`,
    { parse_mode: "Markdown" }
  );
}

export async function handleGoals(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const goals = await getUserGoals(userId);

  if (goals.length === 0) {
    await ctx.reply(
      `🎯 *No Goals in Reward Bank*\n` +
        `Set one with: \`/goal <milestone> -> <guilt-free reward>\``,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const pending = goals.filter((g) => !g.isUnlocked);
  const unlocked = goals.filter((g) => g.isUnlocked);

  let message = `🎁 *The Fabric: Reward Bank & Validation Gates*\n\n`;

  if (pending.length > 0) {
    message += `🔒 *Locked Gates (Pending Milestones):*\n`;
    message += pending
      .map(
        (g) =>
          `• \`#${g.id?.slice(-6)}\` *${g.title}*\n` +
          `  🎁 _Reward:_ ${g.reward}\n` +
          `  👉 Claim when done: \`/claim ${g.id?.slice(-6)}\``
      )
      .join("\n\n");
    message += `\n\n`;
  }

  if (unlocked.length > 0) {
    message += `🔓 *Unlocked & Claimed:*\n`;
    message += unlocked
      .map(
        (g) =>
          `• ✅ *${g.title}*\n` +
          `  🎁 _Earned:_ ${g.reward} (Unlocked ${g.unlockedAt?.toLocaleDateString()})`
      )
      .join("\n\n");
  }

  const keyboard = new InlineKeyboard();
  pending.slice(0, 3).forEach((g) => {
    keyboard.text(`Claim #${g.id?.slice(-6)}`, `goal:claim:${g.id}`).row();
  });

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: pending.length > 0 ? keyboard : undefined,
  });
}

export async function handleClaim(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const targetId = ctx.message?.text?.replace(/^\/claim\s*/i, "").trim();
  if (!targetId) {
    await ctx.reply(`Usage: \`/claim <goal_id>\`\n_Example: \`/claim 4850f6\`_`, {
      parse_mode: "Markdown",
    });
    return;
  }

  const goals = await getUserGoals(userId);
  const match = goals.find((g) => g.id?.endsWith(targetId) || g.id === targetId);

  if (!match || !match.id) {
    await ctx.reply(`❌ Milestone \`#${targetId}\` not found in your Reward Bank.`);
    return;
  }

  if (match.isUnlocked) {
    await ctx.reply(`Milestone *${match.title}* was already unlocked!`);
    return;
  }

  await unlockGoal(match.id);

  await ctx.reply(
    `🎉 *VALIDATION GATE CLEARED!*\n\n` +
      `✅ *Milestone Met:* ${match.title}\n` +
      `🎁 *Reward Unlocked:* ${match.reward}\n\n` +
      `_Go enjoy your guilt-free reward. You earned every bit of it._`,
    { parse_mode: "Markdown" }
  );
}
