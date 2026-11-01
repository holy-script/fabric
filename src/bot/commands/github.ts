import type { Context } from "grammy";
import { getRecentTrades } from "../../db/firestore.js";

/**
 * Strips raw Markdown formatting tokens to prevent Telegram markdown parsing errors.
 */
function cleanMarkdown(text: string): string {
  return text.replace(/[*_`\[\]()]/g, "");
}

/**
 * Handles the /github command.
 * Provides setup instructions for GitHub repository webhooks and displays recent git-derived trades.
 */
export async function handleGithub(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  try {
    const trades = await getRecentTrades(userId, 30);
    const gitTrades = trades.filter((t) =>
      t.tags?.some((tag) => {
        const lower = tag.toLowerCase();
        return lower === "github" || lower === "coding" || lower === "pull-request";
      })
    );

    let tradesSection = "";
    if (gitTrades.length > 0) {
      tradesSection = gitTrades
        .slice(0, 5)
        .map((t) => {
          const dateStr = t.timestamp
            ? new Date(t.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "Recent";
          const safeModule = cleanMarkdown(t.moduleName);
          const safeYield = cleanMarkdown(t.factsYield);
          return `• *${safeModule}* (${dateStr})\n  ⏳ \`${t.focusActualHours}h\` | 💡 _${safeYield}_`;
        })
        .join("\n\n");
    } else {
      tradesSection = `_No git telemetry recorded yet. Push commits or merge PRs to start passive capture!_`;
    }

    const message =
      `🐙 *GitHub Passive Telemetry Ingress*\n\n` +
      `Documentation is treated as a passive byproduct of execution rather than an administrative chore. ` +
      `Your git commits and PRs are automatically parsed with Gemini Flash to capture technical breakthroughs and architectural patterns directly into your 4F ledger.\n\n` +
      `⚙️ *Webhook Setup Guide (2 Steps):*\n\n` +
      `1️⃣ *Open GitHub Webhook Settings*\n` +
      `• In your GitHub repository, navigate to *Settings* ➔ *Webhooks* ➔ *Add webhook*.\n\n` +
      `2️⃣ *Configure Webhook Details*\n` +
      `• *Payload URL:*\n` +
      `  \`https://fabric-one-sage.vercel.app/api/webhooks/github\`\n` +
      `• *Content type:* \`application/json\`\n` +
      `• *Events to trigger:*\n` +
      `  Choose *Let me select individual events*, then check:\n` +
      `  ☑️ *Pushes*\n` +
      `  ☑️ *Pull requests*\n` +
      `• Click *Add webhook* to activate.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 *Recent Git-Derived Trades:*\n\n` +
      `${tradesSection}`;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error("Error handling /github command:", error);
    await ctx.reply(
      `❌ Failed to load GitHub telemetry: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
