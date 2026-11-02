import type { Context } from "grammy";
import { searchGraph } from "../../graph/query.js";
import { getUserState } from "../../db/firestore.js";
import { getLatestBiometrics } from "../../services/wearables.js";
import { conveneCouncil, formatCouncilCard } from "../../ai/council.js";
import fs from "fs";
import path from "path";

const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");

function getVaultTelegramUrl(sourceUrl?: string): string | null {
  if (!sourceUrl || !fs.existsSync(VAULT_TRACKER_FILE)) return null;
  try {
    const tracker = JSON.parse(fs.readFileSync(VAULT_TRACKER_FILE, "utf-8"));
    return tracker.archivedUrls?.[sourceUrl]?.telegramUrl || null;
  } catch {
    return null;
  }
}

export async function handleAgentCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();
  const args = parts.slice(2).join(" ");
  const userId = String(ctx.from?.id || "1131646846");

  // 1. In-Chat Tool: /agent search <keywords>
  if (subCommand === "search") {
    if (!args) {
      await ctx.reply("🔍 *Usage:* `/agent search <keywords>`\n_Example:_ `/agent search fastapi microservices`", {
        parse_mode: "Markdown",
      });
      return;
    }

    const searchingMsg = await ctx.reply(`🔍 _Querying The Fabric Knowledge Base for: "${args}"..._`, {
      parse_mode: "Markdown",
    });

    const result = await searchGraph(args, 5);
    const nodes = result.nodes || [];

    if (nodes.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        searchingMsg.message_id,
        `❌ No vault materials found matching "${args}". Try different keywords.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    let reply = `🤖 *Fabric Knowledge Hub — A2A Search*\n*Query:* \`${args}\`\n*Matches:* \`${nodes.length}\` items\n\n`;

    for (const [idx, node] of nodes.entries()) {
      const props = node.properties || {};
      const sourceUrl = (props.sourceUrl as string) || "";
      const tgUrl = getVaultTelegramUrl(sourceUrl);
      const notionUrl = (props.notionUrl as string) || "";

      reply += `*${idx + 1}. ${node.label}*\n`;
      if (props.actionableTakeaway) reply += `💡 _${props.actionableTakeaway}_\n`;
      if (tgUrl) reply += `🎬 [Stream Telegram Video](${tgUrl}) `;
      if (notionUrl) reply += `| 📑 [Notion Card](${notionUrl})\n`;
      reply += `\n`;
    }

    await ctx.api.editMessageText(ctx.chat!.id, searchingMsg.message_id, reply, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  // 2. In-Chat Tool: /agent council <dilemma>
  if (subCommand === "council") {
    if (!args) {
      await ctx.reply("🏛️ *Usage:* `/agent council <dilemma>`\n_Example:_ `/agent council Should I build my own auth or use Clerk?`", {
        parse_mode: "Markdown",
      });
      return;
    }

    const conveningMsg = await ctx.reply(`🏛️ _Convening Polymath Council on behalf of agent..._`, {
      parse_mode: "Markdown",
    });

    const report = await conveneCouncil(userId, args);
    const card = formatCouncilCard(report);

    await ctx.api.editMessageText(ctx.chat!.id, conveningMsg.message_id, card, {
      parse_mode: "Markdown",
    });
    return;
  }

  // 3. In-Chat Tool: /agent telemetry
  if (subCommand === "telemetry" || subCommand === "bio") {
    const state = await getUserState(userId);
    const bio = await getLatestBiometrics(userId);

    let reply = `📊 *The Fabric: A2A Telemetry Wire*\n\n`;
    reply += `*Currencies:*\n`;
    reply += `• Focus: \`${state.totalFocusHours.toFixed(1)} hrs\`\n`;
    reply += `• Facts: \`${state.totalFactsAcquired} models\`\n`;
    reply += `• Funds Yield: \`₹${state.totalFundsYield}\`\n`;
    reply += `• Energy Delta: \`${state.averageEnergyDelta > 0 ? "+" : ""}${state.averageEnergyDelta.toFixed(1)}\`\n\n`;

    if (bio) {
      reply += `*Biometrics (${bio.source}):*\n`;
      reply += `• Recovery: \`${bio.recovery?.score ?? 75}%\` (${bio.recovery?.readinessCategory ?? "optimal"})\n`;
      reply += `• HRV: \`${bio.hrv?.value ?? 70} ms\`\n`;
      reply += `• Resting HR: \`${bio.heartRate?.resting ?? 62} bpm\`\n`;
      reply += `• Sleep: \`${bio.sleep?.totalHours ?? 7.5} hrs\`\n`;
    }

    await ctx.reply(reply, { parse_mode: "Markdown" });
    return;
  }

  // 4. Default: Display Setup Guide & Client Configuration
  const appUrl = "https://fabric-one-sage.vercel.app";
  const mcpScriptPath = path.resolve(process.cwd(), "src/mcp/server.ts");

  let guide = `🌐 *The Fabric: Agent-to-Agent (A2A) & MCP Gateway*\n\n`;
  guide += `Connect any external AI agent (Claude Desktop, Cursor, Antigravity, AutoGen, CrewAI, or Custom GPTs) directly to your 3,840+ knowledge vault items, 4F telemetry, and Polymath Council.\n\n`;

  guide += `📡 *1. Universal Remote HTTP / A2A API:*\n`;
  guide += `• **Endpoint:** \`${appUrl}/api/a2a\`\n`;
  guide += `• **Methods:** \`POST /api/a2a\` (REST or JSON-RPC 2.0)\n`;
  guide += `• **Quick Test (curl):**\n`;
  guide += `\`\`\`bash\ncurl -X POST ${appUrl}/api/a2a \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "search", "query": "dsa patterns", "limit": 3}'\n\`\`\`\n\n`;

  guide += `🔌 *2. Local Model Context Protocol (MCP) Server:*\n`;
  guide += `Add this to your \`claude_desktop_config.json\` or Cursor \`mcp.json\`:\n`;
  guide += `\`\`\`json\n{\n  "mcpServers": {\n    "fabric": {\n      "command": "bun",\n      "args": ["run", "${mcpScriptPath}"]\n    }\n  }\n}\n\`\`\`\n\n`;

  guide += `💬 *3. In-Chat Agent Commands:*\n`;
  guide += `• \`/agent search <keywords>\` — Quick knowledge lookup\n`;
  guide += `• \`/agent council <dilemma>\` — Deliberate with 5 personas\n`;
  guide += `• \`/agent telemetry\` — Inspect live 4F & biometric wire\n`;

  await ctx.reply(guide, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔍 Search Knowledge", switch_inline_query_current_chat: "/agent search " },
          { text: "🏛️ Council Deliberate", switch_inline_query_current_chat: "/agent council " },
        ],
        [
          { text: "🌐 Open API Docs (JSON)", url: `${appUrl}/api/a2a` },
          { text: "📊 Visual HUD Mini-App", url: `${appUrl}/api/dashboard?userId=${userId}` },
        ],
      ],
    },
  });
}
