import type { Context } from "grammy";
import { getUserState, getRecentTrades } from "../../db/firestore.js";
import { askAdvisor } from "../../ai/gemini.js";

export async function handleBalance(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const state = await getUserState(userId);
  const recent = await getRecentTrades(userId, 3);

  const avgEnergyStr =
    state.averageEnergyDelta > 0
      ? `+${state.averageEnergyDelta}`
      : `${state.averageEnergyDelta}`;

  const tradesList =
    recent.length > 0
      ? recent
          .map(
            (t) =>
              `• *${t.moduleName}* — ${t.focusActualHours}h (${
                t.energyDelta > 0 ? "+" : ""
              }${t.energyDelta} energy)`
          )
          .join("\n")
      : "_No trades recorded yet_";

  const message = `
📊 *The Fabric: System Telemetry*

⏳ *Focus Deployed:* ${state.totalFocusHours}h
💡 *Facts Acquired:* ${state.totalFactsAcquired} artifacts
💰 *Funds Spent:* $${state.totalFundsSpent}
💵 *Funds Yield:* $${state.totalFundsYield}
⚡ *Energy Baseline:* ${avgEnergyStr} / 5.0

*Active Way of Working:*
🧩 \`${state.activePlugins.join("`, `")}\`

*Recent Ledger Entries:*
${tradesList}
`;

  await ctx.reply(message, { parse_mode: "Markdown" });
}

export async function handleAsk(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const question = ctx.message?.text?.replace(/^\/ask\s*/i, "").trim();

  if (!question) {
    await ctx.reply(
      `❓ *Consult the 4F Advisor*\n` +
        `Usage: \`/ask <question or decision dilemma>\`\n\n` +
        `_Example: \`/ask Should I spend 8 hours building custom auth or pay $20 for Clerk?_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply("🤔 *Evaluating Aristotelian balance with Gemini...*", {
    parse_mode: "Markdown",
  });

  try {
    const state = await getUserState(userId);
    const recent = await getRecentTrades(userId, 5);
    const answer = await askAdvisor(question, state, recent);

    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, answer, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error asking advisor:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to generate response: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

