import type { Context } from "grammy";
import { InputFile } from "grammy";
import {
  exportClusterToNotebookLM,
  exportAllClustersToNotebookLM,
  exportMasterHeuristicsToNotebookLM,
} from "../../integrations/notebooklm/exporter.js";
import { checkNotebookLMStatus } from "../../integrations/notebooklm/client.js";
import { getOrLoadGraph } from "../../graph/query.js";

export async function handleNotebookLMCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();
  const target = parts.slice(2).join(" ").toLowerCase();

  // 1. Export Specific Cluster or All: /nlm export <cluster>
  if (subCommand === "export") {
    if (!target || target === "list") {
      const graph = await getOrLoadGraph();
      let list = `📚 *Available Clusters for NotebookLM Export:*\n\n`;
      list += `• \`/nlm export heuristics\` — Master Heuristics & Axioms\n`;
      list += `• \`/nlm export all\` — Export all 14 clusters\n\n`;
      for (const c of graph.clusters) {
        list += `• \`/nlm export ${c.id}\` — *${c.label}* (${c.nodeIds.length} sources)\n`;
      }
      await ctx.reply(list, { parse_mode: "Markdown" });
      return;
    }

    if (target === "all") {
      const msg = await ctx.reply("⏳ _Generating NotebookLM source bundles for all 14 clusters..._", {
        parse_mode: "Markdown",
      });

      const bundles = await exportAllClustersToNotebookLM();
      const heuristics = await exportMasterHeuristicsToNotebookLM();

      let reply = `✅ *Exported ${bundles.length + 1} NotebookLM Source Bundles!*\n\n`;
      reply += `All files generated in \`data/notebooklm_sources/\`:\n`;
      for (const b of bundles.slice(0, 8)) {
        reply += `• \`${b.fileName}\` (${b.itemCount} items)\n`;
      }
      reply += `• \`...and ${bundles.length - 8} more\`\n\n`;
      reply += `Drag and drop these Markdown files into [NotebookLM](https://notebooklm.google.com) to generate grounded Q&A and 15-minute Audio Overview podcasts!`;

      await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, reply, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎙️ Open Google NotebookLM", url: "https://notebooklm.google.com" }],
          ],
        },
      });
      return;
    }

    if (target === "heuristics" || target === "axioms") {
      const bundle = await exportMasterHeuristicsToNotebookLM();
      await ctx.replyWithDocument(new InputFile(bundle.filePath, bundle.fileName), {
        caption: `📚 *NotebookLM Source Bundle:* Master Heuristics & Axioms\n\nContains **${bundle.itemCount}** synthesized principles ready for grounding in NotebookLM.`,
        parse_mode: "Markdown",
      });
      return;
    }

    // Export single cluster
    const bundle = await exportClusterToNotebookLM(target);
    if (!bundle) {
      await ctx.reply(`❌ Cluster \`${target}\` not found. Use \`/nlm export\` to list all available clusters.`, {
        parse_mode: "Markdown",
      });
      return;
    }

    await ctx.replyWithDocument(new InputFile(bundle.filePath, bundle.fileName), {
      caption:
        `🎙️ *NotebookLM Source Document Generated!*\n\n` +
        `• **Cluster:** *${bundle.clusterLabel}*\n` +
        `• **Sources Included:** \`${bundle.itemCount}\` curated reels & patterns\n` +
        `• **File:** \`${bundle.fileName}\`\n\n` +
        `Upload this document to NotebookLM to generate an **Audio Overview (Podcast)** or grounded study guide!`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌐 Open Google NotebookLM", url: "https://notebooklm.google.com" }],
        ],
      },
    });
    return;
  }

  // 2. Default Overview & Status Check
  const status = await checkNotebookLMStatus();
  const graph = await getOrLoadGraph();

  let guide = `🎙️ *The Fabric: Google NotebookLM Integration*\n\n`;
  guide += `Transform your 3,840+ curated Knowledge Base reels and heuristics into **interactive AI research notebooks** and **deep-dive dual-host Audio Podcasts** via NotebookLM.\n\n`;

  guide += `📦 *Export Commands:*\n`;
  guide += `• \`/nlm export <cluster>\` — Generates a citation-grounded Markdown bundle and sends the \`.md\` file to this chat\n`;
  guide += `• \`/nlm export all\` — Exports all 14 clusters into \`data/notebooklm_sources/\`\n`;
  guide += `• \`/nlm export heuristics\` — Exports master decision rules\n\n`;

  guide += `⚙️ *Programmatic Python CLI Status:*\n`;
  if (status.isInstalled) {
    guide += `• CLI Version: \`${status.cliVersion || "Installed"}\` ✅\n`;
    guide += `• Google Auth: \`${status.isLoggedIn ? "Connected" : "Requires Login ('notebooklm login')"}\`\n\n`;
  } else {
    guide += `• CLI Status: \`Not detected\` (Optional)\n`;
    guide += `• To enable zero-click automated podcast generation from terminal:\n`;
    guide += `  \`pip install notebooklm-py && notebooklm login\`\n\n`;
  }

  guide += `⚡ *Quick Actions:* Tap below to export popular clusters immediately:`;

  await ctx.reply(guide, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🤖 Export AI Agents Cluster", callback_data: "nlm:export:cluster_ai_autonomous_systems" },
          { text: "💻 Export Software Systems", callback_data: "nlm:export:cluster_software_developer_ergonomics" },
        ],
        [
          { text: "🧠 Export Master Heuristics", callback_data: "nlm:export:heuristics" },
          { text: "📂 View All Clusters", callback_data: "nlm:list" },
        ],
        [
          { text: "🎙️ Open Google NotebookLM Web", url: "https://notebooklm.google.com" },
        ],
      ],
    },
  });
}
