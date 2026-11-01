import type { Context } from "grammy";
import {
  isNotionConfigured,
  getNotionDatabaseId,
  getNotionDatabaseInfo,
  syncKnowledgeItemToNotion,
} from "../../notion/client.js";
import { getKnowledgeItems } from "../../db/firestore.js";

/**
 * Strips raw Markdown formatting tokens to prevent Telegram markdown parsing errors.
 */
function cleanMarkdown(text: string): string {
  return text.replace(/[*_`\[\]()]/g, "");
}

/**
 * Handles the /notion Telegram command.
 *
 * Supported workflows:
 * - /notion or /notion status: Shows connection health, database name, and detected schema.
 * - /notion sync: Fetches recent wins and gotchas from Firestore and pushes them to Notion.
 * - If not configured: Displays step-by-step onboarding guide and required Notion schema.
 */
export async function handleNotion(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();

  // 1. If Notion is NOT configured: provide onboarding guide and schema
  if (!isNotionConfigured()) {
    await ctx.reply(
      `📚 *Notion Knowledge Vault — Setup Guide*\n\n` +
        `Fabric OS can automatically sync your wins, gotchas, tools, and insights directly into a searchable Notion database.\n\n` +
        `*Connect in 3 simple steps:*\n\n` +
        `1️⃣ *Create an Integration*\n` +
        `• Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)\n` +
        `• Click *+ New integration*, name it *Fabric OS*, and copy your *Internal Integration Secret* (\`NOTION_API_KEY\`).\n\n` +
        `2️⃣ *Create & Share Database*\n` +
        `• Create a new database in your Notion workspace.\n` +
        `• Click the \`•••\` menu in the top-right corner ➔ *Connections* ➔ connect *Fabric OS*.\n` +
        `• Copy the 32-character Database ID from the database URL (\`NOTION_DATABASE_ID\`).\n\n` +
        `3️⃣ *Set Environment Variables*\n` +
        `• In Vercel or your terminal, configure:\n` +
        `  \`vercel env add NOTION_API_KEY\`\n` +
        `  \`vercel env add NOTION_DATABASE_ID\`\n` +
        `  _(or append to \`.env\` for local development)_\n\n` +
        `📋 *Required Notion Database Property Schema:*\n` +
        `• *Name* — Title\n` +
        `• *Category* — Select (\`Win\`, \`Gotcha\`, \`Tool\`, \`Strategy\`, \`Insight\`)\n` +
        `• *Tags* — Multi-select\n` +
        `• *Takeaway* — Text\n` +
        `• *Date* — Date\n\n` +
        `_Once environment variables are set, run \`/notion\` to verify the connection!_`,
      {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      }
    );
    return;
  }

  // 2. If Notion IS configured and user triggered /notion sync
  if (subCommand === "sync") {
    const statusMsg = await ctx.reply("🔄 *Syncing Knowledge Garden with Notion...*", {
      parse_mode: "Markdown",
    });

    try {
      // Query recent knowledge items (wins, gotchas, tools, strategies, insights)
      const items = await getKnowledgeItems(userId, undefined, 20);

      if (items.length === 0) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          statusMsg.message_id,
          `ℹ️ *No Knowledge Items Found*\n\n` +
            `Your Knowledge Garden has no items yet.\n` +
            `Bank breakthroughs with \`/win <milestone>\` or traps with \`/gotcha <lesson>\` and sync again!`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      let successCount = 0;
      let winCount = 0;
      let gotchaCount = 0;
      let otherCount = 0;
      const errors: string[] = [];

      for (const item of items) {
        try {
          await syncKnowledgeItemToNotion(item);
          successCount++;
          if (item.category === "win") winCount++;
          else if (item.category === "gotcha") gotchaCount++;
          else otherCount++;
        } catch (err: any) {
          console.error(`Failed to sync item "${item.title}":`, err);
          errors.push(
            `• *${cleanMarkdown(item.title.slice(0, 30))}*: ${cleanMarkdown(
              err.message?.slice(0, 80) || "Sync failed"
            )}`
          );
        }
      }

      const breakdown: string[] = [];
      if (winCount > 0) breakdown.push(`🏆 ${winCount} win${winCount === 1 ? "" : "s"}`);
      if (gotchaCount > 0) breakdown.push(`⚠️ ${gotchaCount} gotcha${gotchaCount === 1 ? "" : "s"}`);
      if (otherCount > 0) breakdown.push(`💡 ${otherCount} other item${otherCount === 1 ? "" : "s"}`);

      let replyText =
        `✅ *Notion Sync Complete!*\n\n` +
        `Transferred *${successCount}/${items.length}* knowledge items to your Notion Knowledge Vault.\n` +
        (breakdown.length > 0 ? `📊 Breakdown: ${breakdown.join(" · ")}\n\n` : "\n") +
        `🔗 Check your database in Notion to view the updated pages and takeaways.`;

      if (errors.length > 0) {
        replyText +=
          `\n\n⚠️ *Issues encountered (${errors.length}):*\n` +
          errors.slice(0, 3).join("\n");
      }

      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, replyText, {
        parse_mode: "Markdown",
      });
    } catch (error: any) {
      console.error("Notion sync error:", error);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `❌ *Sync Failed:* ${cleanMarkdown(
          error.message || "Unknown error occurred while contacting Notion."
        )}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // 3. Status View: /notion or /notion status
  const checkingMsg = await ctx.reply("🔍 *Checking Notion workspace status...*", {
    parse_mode: "Markdown",
  });

  try {
    const dbInfo = await getNotionDatabaseInfo();
    const dbId = getNotionDatabaseId();
    const maskedDbId = `${dbId.slice(0, 6)}...${dbId.slice(-4)}`;
    const propNames = Object.keys(dbInfo.properties);
    const foundProps = propNames.join(", ");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      checkingMsg.message_id,
      `📚 *Notion Knowledge Vault — Connected*\n\n` +
        `🟢 *Status:* Online & Synchronized\n` +
        `📂 *Database:* [${cleanMarkdown(dbInfo.title)}](${dbInfo.url})\n` +
        `🔑 *Database ID:* \`${maskedDbId}\`\n` +
        `📑 *Properties Detected:* ${propNames.length} (\`${cleanMarkdown(foundProps)}\`)\n\n` +
        `*Commands:*\n` +
        `• \`/notion sync\` — Push recent wins & gotchas to Notion\n` +
        `• \`/win <breakthrough>\` — Bank a win\n` +
        `• \`/gotcha <lesson>\` — Document a pitfall\n` +
        `• \`/garden\` — View your Knowledge Garden stats`,
      {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      }
    );
  } catch (error: any) {
    console.error("Notion status check error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      checkingMsg.message_id,
      `⚠️ *Notion Connection Issue*\n\n` +
        `Credentials are set in environment variables, but Fabric OS could not access the Notion database.\n\n` +
        `*Error:* ${cleanMarkdown(error.message || "Access denied or database not found")}\n\n` +
        `*Troubleshooting Checklist:*\n` +
        `1. Open your database in Notion.\n` +
        `2. Click \`•••\` (top right) ➔ *Connections* ➔ verify your *Fabric OS* integration is connected.\n` +
        `3. Verify \`NOTION_DATABASE_ID\` matches the database ID in the URL.`,
      { parse_mode: "Markdown" }
    );
  }
}
