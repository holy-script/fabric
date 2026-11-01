import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { handleBalance } from "../commands/balance.js";
import { handleSettle } from "../commands/settle.js";
import { handlePlugins } from "../commands/plugins.js";
import { handleBriefing } from "../commands/briefing.js";
import { executeSimulation } from "../commands/simulate.js";
import { installPlugin, uninstallPlugin } from "../../plugins/manager.js";
import { unlockGoal, getUserState } from "../../db/firestore.js";
import { exportPortfolioToNotion, isNotionConfigured } from "../../notion/exporter.js";

export async function handleCallbackQuery(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id.toString();
  if (!data || !userId) return;

  await ctx.answerCallbackQuery();

  if (data === "action:balance") {
    await handleBalance(ctx);
  } else if (data === "action:briefing") {
    await handleBriefing(ctx);
  } else if (data === "action:settle") {
    await handleSettle(ctx);
  } else if (data === "action:plugins") {
    await handlePlugins(ctx);
  } else if (data === "action:spark_prompt") {
    await ctx.reply(
      `⚡ *Spark a Session:*\nSend \`/spark <task> [duration]\` or send a voice memo saying what you are starting!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:win_prompt") {
    await ctx.reply(
      `🏆 *Bank a Win:*\nSend \`/win <breakthrough>\` or voice-record your milestone!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:ask_prompt") {
    await ctx.reply(
      `❓ *Ask the Advisor:*\nSend \`/ask <question>\` or send a voice note asking for advice on trade-offs!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:portfolio_export") {
    if (!isNotionConfigured()) {
      await ctx.reply(
        `❌ *Notion is not configured.*\nPlease set \`NOTION_API_KEY\` and \`NOTION_DATABASE_ID\` in environment variables.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const waitMsg = await ctx.reply("⏳ *Exporting Compounding Portfolio to Notion...*", {
      parse_mode: "Markdown",
    });

    try {
      let summaryText = ctx.callbackQuery.message?.text || "";
      if (!summaryText || summaryText.length < 30) {
        const state = await getUserState(userId);
        summaryText = `Compounding Portfolio for user ${userId}. Focus: ${state.totalFocusHours}h, Facts: ${state.totalFactsAcquired}.`;
      }

      const notionRes = await exportPortfolioToNotion(userId, summaryText);
      const keyboard = new InlineKeyboard().url("📓 Open Live Portfolio in Notion", notionRes.url);

      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `🏛️ *Compounding Portfolio Exported to Notion!*\n\n` +
          `Your 5-dimension compounding capabilities, personal telemetry, and executive synthesis are now published under \`Fabric OS\`.\n\n` +
          `📓 [Open Live Portfolio in Notion](${notionRes.url})`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      console.error("Callback portfolio export error:", error);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ Failed to export portfolio to Notion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  } else if (data.startsWith("sim:run:")) {
    const framework = data.replace("sim:run:", "");
    await executeSimulation(ctx, framework);
  } else if (data.startsWith("sim:pilot:")) {
    const pilotSlug = data.replace("sim:pilot:", "");
    await ctx.reply(
      `🧪 *7-Day Pilot Protocol Activated!*\n\n` +
        `Your micro-dose experiment for \`#pilot-${pilotSlug}\` is registered.\n\n` +
        `• *Execute:* Log your execution blocks with \`/spark\` or \`/log\` adding tag \`#pilot-${pilotSlug}\`.\n` +
        `• *Evaluate:* Run \`/balance\` every 48 hours to check for Aristotelian drift.\n` +
        `• *Abort Gate:* If your Energy Delta drops negative for 2 consecutive sessions, drop the pilot immediately.\n\n` +
        `_No permanent architecture modifications have been committed._`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "sim:discard") {
    await ctx.reply(
      `🗑️ *Simulation Discarded.*\n` +
        `Methodology rejected before writing a single line of integration code. Your baseline 4F telemetry remains intact.`,
      { parse_mode: "Markdown" }
    );
  } else if (data.startsWith("plugin:install:")) {
    const pluginId = data.replace("plugin:install:", "");
    const res = await installPlugin(userId, pluginId);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    await handlePlugins(ctx);
  } else if (data.startsWith("plugin:uninstall:")) {
    const pluginId = data.replace("plugin:uninstall:", "");
    const res = await uninstallPlugin(userId, pluginId);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    await handlePlugins(ctx);
  } else if (data.startsWith("goal:claim:")) {
    const goalId = data.replace("goal:claim:", "");
    await unlockGoal(goalId);
    await ctx.reply(
      `🎉 *VALIDATION GATE CLEARED!*\nReward unlocked in your Reward Bank! Enjoy your guilt-free payoff.`,
      { parse_mode: "Markdown" }
    );
  }
}
