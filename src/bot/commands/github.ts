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
      `🐙 *Fabric Git Passive Telemetry*\n\n` +
      `Documentation is treated as a passive byproduct of execution rather than an administrative chore. ` +
      `Your git commits and PRs are automatically parsed with Gemini 3.5 Flash to capture technical breakthroughs and estimated focus time directly into your 4F ledger.\n\n` +
      `⚡ *1-Command Universal Local Setup (Recommended):*\n` +
      `Activate passive tracking for *all* local repos on this machine:\n` +
      `\`bun run scripts/install-git-telemetry.ts --global\`\n` +
      `_(or via bash: \`./scripts/install-git-hook.sh --global\`)_\n\n` +
      `• *Non-blocking:* Runs in background with sub-second detached curl; zero git delays.\n` +
      `• *Diff & Focus:* Computes files changed and delta time since previous commit.\n` +
      `• *Single Repo:* \`bun run scripts/install-git-telemetry.ts --current\`\n` +
      `• *Verify Connection:* \`bun run scripts/install-git-telemetry.ts --test\`\n\n` +
      `🌐 *GitHub Cloud Webhook Setup (For Remote Pushes/PRs):*\n` +
      `1️⃣ In GitHub repo: *Settings* ➔ *Webhooks* ➔ *Add webhook*\n` +
      `2️⃣ *Payload URL:*\n` +
      `   \`https://fabric-one-sage.vercel.app/api/webhooks/github\`\n` +
      `3️⃣ *Content type:* \`application/json\`\n` +
      `4️⃣ *Events:* Select *Pushes* and *Pull requests*\n\n` +
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
