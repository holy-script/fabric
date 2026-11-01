import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getCluster, searchGraph, findPath, getOrLoadGraph } from "../../graph/query.js";
import { setActiveReflectionSession } from "./reflect.js";

export async function handleCluster(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const topic = ctx.message?.text?.replace(/^\/(?:cluster|synthesize)\s*/i, "").trim();

  if (!topic) {
    const graph = await getOrLoadGraph();
    const clusterList = graph.clusters
      .slice(0, 8)
      .map((c, i) => `*${i + 1}.* \`/cluster ${c.id}\` — ${c.label}`)
      .join("\n");

    await ctx.reply(
      `🧬 *Fabric Knowledge Graph: Clusters & Synthesizer*\n\n` +
        `Usage: \`/cluster <topic or cluster_id>\`\n` +
        `_Example: \`/cluster dopamine\` or \`/cluster plyometrics\`_\n\n` +
        `*Available Semantic Clusters:*\n${clusterList}\n\n` +
        `_Or use \`/path <concept1> -> <concept2>\` to find conceptual links._`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const waitMsg = await ctx.reply(`🧠 *Synthesizing Knowledge Cluster for "${topic}"...*`, {
    parse_mode: "Markdown",
  });

  try {
    // 1. Try finding explicit cluster
    const clusterResult = await getCluster(topic);

    if (clusterResult) {
      const { cluster, nodes } = clusterResult;
      const reelNodes = nodes.filter((n) => n.type === "reel").slice(0, 5);

      let text = `🧬 *Cluster: ${cluster.label}*\n\n`;
      text += `🎯 *Core Theme:*\n_${cluster.coreTheme}_\n\n`;

      if (cluster.masterSynthesis) {
        text += `📜 *Master Protocol:*\n${cluster.masterSynthesis}\n\n`;
      }

      text += `🎬 *Key Vault Reels in this Cluster:*\n`;
      const keyboard = new InlineKeyboard();

      reelNodes.forEach((r, idx) => {
        const streamLink = r.properties.telegramStreamUrl
          ? ` [▶️ Stream](${r.properties.telegramStreamUrl})`
          : "";
        text += `*${idx + 1}.* ${r.label}${streamLink}\n   💡 _${r.description.slice(0, 100)}..._\n`;
        keyboard.text(`🎙️ Reflect #${idx + 1}`, `reflect:${r.properties.firestoreId || r.id}`);
        if ((idx + 1) % 2 === 0) keyboard.row();
      });

      text += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🎙️ *Layer Your Synthesis:*\n`;
      text += `Send a voice memo or text note now to record your overarching personal conclusion for this cluster!`;

      // Set active reflection on the first reel node or concept
      if (reelNodes.length > 0 && reelNodes[0].properties.firestoreId) {
        setActiveReflectionSession(userId, {
          itemId: reelNodes[0].properties.firestoreId as string,
          title: `[Cluster] ${cluster.label}`,
        });
      }

      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    }

    // 2. Fallback to graph search if no single cluster matched
    const searchRes = await searchGraph(topic, 6);
    if (searchRes.nodes.length > 0) {
      let text = `🔍 *Graph Subgraph for "${topic}"*\n\n`;
      const keyboard = new InlineKeyboard();

      searchRes.nodes.slice(0, 5).forEach((n, idx) => {
        const typeIcon = n.type === "concept" ? "💡" : n.type === "heuristic" ? "🛡️" : "🎬";
        const streamLink = n.properties.telegramStreamUrl ? ` [▶️ Stream](${n.properties.telegramStreamUrl})` : "";
        text += `*${idx + 1}. ${typeIcon} ${n.label}*${streamLink}\n   _${n.description.slice(0, 110)}..._\n\n`;
        if (n.properties.firestoreId) {
          keyboard.text(`🎙️ Reflect #${idx + 1}`, `reflect:${n.properties.firestoreId}`);
          if ((idx + 1) % 2 === 0) keyboard.row();
        }
      });

      if (searchRes.relevantClusters.length > 0) {
        text += `🔗 *Linked Clusters:* ${searchRes.relevantClusters.map((c) => `\`${c.label}\``).join(", ")}\n`;
      }

      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ No knowledge cluster found for *"${topic}"*. Try \`/cluster\` to view all available clusters.`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Cluster synthesis error: ${err.message}`
    );
  }
}

export async function handlePath(ctx: Context) {
  const text = ctx.message?.text?.replace(/^\/path\s*/i, "").trim();

  if (!text || !text.includes("->")) {
    await ctx.reply(
      `🗺️ *Knowledge Graph Pathfinder*\n\n` +
        `Finds multi-hop reasoning chains connecting distant concepts across your 3,843-reel graph.\n\n` +
        `Usage: \`/path <concept1> -> <concept2>\`\n\n` +
        `_Example: \`/path dopamine -> plyometrics\` or \`/path game feel -> flow state\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const parts = text.split("->").map((s) => s.trim());
  const [from, to] = parts;

  const waitMsg = await ctx.reply(`🧭 *Tracing conceptual path: "${from}" ➔ "${to}"...*`, {
    parse_mode: "Markdown",
  });

  try {
    const res = await findPath(from, to);

    if (!res.found) {
      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, `❌ ${res.explanation}`);
      return;
    }

    let report = `🗺️ *Knowledge Path Discovered:*\n`;
    report += `*${from}* ➔ *${to}*\n\n`;

    res.steps.forEach((step, idx) => {
      const rel = step.relation.toUpperCase();
      report += `*Step ${idx + 1}:* \`${step.from.label}\`\n`;
      report += `  ↳ *--[${rel}]-->* \`${step.to.label}\`\n\n`;
    });

    report += `⚖️ *Total Conceptual Distance:* ${res.steps.length} hops (weight: ${res.totalWeight.toFixed(2)})\n`;
    report += `💡 _${res.explanation}_`;

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, report, {
      parse_mode: "Markdown",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Pathfinder error: ${err.message}`
    );
  }
}
