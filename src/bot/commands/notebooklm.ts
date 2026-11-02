import type { Context } from "grammy";
import { InputFile, InlineKeyboard } from "grammy";
import path from "path";
import {
  exportClusterToNotebookLM,
  exportAllClustersToNotebookLM,
  exportMasterHeuristicsToNotebookLM,
  getIITMGrokkingBundles,
} from "../../integrations/notebooklm/exporter.js";
import { checkNotebookLMStatus } from "../../integrations/notebooklm/client.js";
import { getOrLoadGraph } from "../../graph/query.js";
import { syncNotebookLM } from "../../browser/tool.js";

export async function handleNotebookLMCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();
  const target = parts.slice(2).join(" ").toLowerCase();

  // 1. Export Specific Cluster or All: /nlm export <cluster>
  if (subCommand === "export") {
    if (!target || target === "list") {
      const graph = await getOrLoadGraph();
      let list = `📚 *Available Bundles for NotebookLM Export:*\n\n`;
      list += `🎓 *IIT Madras BS Degree (Quiz 1 Grokking Mastery):*\n`;
      list += `• \`/nlm export cn\` — Computer Networks (24 PYQs + Formulas)\n`;
      list += `• \`/nlm export csd\` — Computer Systems Design (23 PYQs + Mux/Radix)\n`;
      list += `• \`/nlm export bdbn\` — Big Data & Bio Networks (70 PYQs + Centrality)\n`;
      list += `• \`/nlm export iitm\` — All 3 subjects combined\n\n`;
      list += `🧠 *Fabric OS Knowledge Clusters:*\n`;
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

    // IITM Grokking Export: /nlm export cn | csd | bdbn | iitm
    const iitmBundles = getIITMGrokkingBundles();
    if (target === "iitm" || target === "iitm_all") {
      await ctx.reply("⏳ _Sending all 3 IITM BS Quiz 1 Grokking Notebooks..._", { parse_mode: "Markdown" });
      for (const b of iitmBundles) {
        await ctx.replyWithDocument(new InputFile(b.filePath, b.fileName), {
          caption: `🎓 *${b.title}*\n\nContains **${b.questionCount}** real exam questions, master formulas, and audio prompt for NotebookLM!`,
          parse_mode: "Markdown",
        });
      }
      return;
    }

    const matchedIitm = iitmBundles.find((b) => b.subject === target || `iitm_${b.subject}` === target);
    if (matchedIitm) {
      await ctx.replyWithDocument(new InputFile(matchedIitm.filePath, matchedIitm.fileName), {
        caption:
          `🎓 *IITM BS Quiz 1 Source Bundle: ${matchedIitm.title}*\n\n` +
          `• **Exam Questions:** \`${matchedIitm.questionCount}\` verified PYQs\n` +
          `• **File:** \`${matchedIitm.fileName}\`\n\n` +
          `Import into NotebookLM to generate grounded practice answers and an **Audio Overview (Podcast)**!`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎙️ Open Google NotebookLM", url: "https://notebooklm.google.com" }],
          ],
        },
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

  // 1b. Fully Automated Browser Sync: /nlm auto <subject>
  if (subCommand === "auto" || subCommand === "sync") {
    const iitmBundles = getIITMGrokkingBundles();
    let targetBundle = iitmBundles.find((b) => b.subject === target || `iitm_${b.subject}` === target);
    if (!targetBundle && (!target || target === "cn")) {
      targetBundle = iitmBundles[0]; // Default: Computer Networks
    }

    const title = targetBundle?.title || `Fabric OS: ${target || "Knowledge Base"}`;
    const filePath = targetBundle?.filePath || path.resolve(process.cwd(), "data/notebooklm_sources/Fabric_Master_Heuristics_and_Axioms.md");

    const waitMsg = await ctx.reply(
      `🤖 *Autonomous NotebookLM Sync Initiated!*\n\n` +
        `• Target: *${title}*\n` +
        `• Chrome CDP: \`Connected to ~/.fabric/browser_profile\`\n` +
        `⏳ _Creating notebook, uploading markdown source & triggering Audio Overview podcast..._`,
      { parse_mode: "Markdown" }
    );

    try {
      const res = await syncNotebookLM(title, filePath, true);
      if (res.success) {
        let reply = `🎙️ *NotebookLM Fully Synced & Podcast Triggered!*\n\n`;
        reply += `• **Notebook:** *${res.title}*\n`;
        reply += `• **Source Uploaded:** \`${res.sourceTitle || "Markdown Source"}\`\n`;
        reply += `• **Audio Status:** \`${res.audioStatus}\`\n\n`;
        reply += `Open the notebook below to listen to the dual-host deep dive:`;

        const keyboard = new InlineKeyboard();
        if (res.notebookUrl) {
          keyboard.url("🎙️ Listen on Google NotebookLM", res.notebookUrl);
        }

        await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, reply, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } else {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          waitMsg.message_id,
          `⚠️ *NotebookLM Auto-Sync Notice:*\n\n${res.error}\n\n_If first time, ensure your Google Chrome profile has logged into notebooklm.google.com._`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ *Sync Error:* ${err.message}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // 2. Default Overview & Status Check
  const status = await checkNotebookLMStatus();
  const graph = await getOrLoadGraph();

  let guide = `🎙️ *The Fabric: Google NotebookLM Integration*\n\n`;
  guide += `Transform your 3,840+ curated Knowledge Base reels and heuristics into **interactive AI research notebooks** and **deep-dive dual-host Audio Podcasts** via NotebookLM.\n\n`;

  guide += `📦 *Export Commands:*\n`;
  guide += `• \`/nlm export <cluster>\` — Generates a citation-grounded Markdown bundle and sends the \`.md\` file to this chat\n`;
  guide += `• \`/nlm export cn\` — Export IITM Computer Networks Study Guide\n`;
  guide += `• \`/nlm export csd\` — Export IITM Systems Design Study Guide\n`;
  guide += `• \`/nlm export bdbn\` — Export IITM Biological Networks Study Guide\n`;
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
          { text: "🎓 Export IITM BS Quiz 1 Guides", callback_data: "prep:export_menu" },
        ],
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

