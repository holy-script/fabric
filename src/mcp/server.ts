#!/usr/bin/env bun
/**
 * The Fabric: Model Context Protocol (MCP) Server
 * Exposes Fabric OS Knowledge Graph (3,840+ items), 4F Telemetry,
 * Wearable Biometrics, and Polymath Council Deliberation to any local/remote AI agent.
 */

import fs from "fs";
import path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Bot } from "grammy";
import { config } from "../config/env.js";
import { searchGraph, getCluster, getGraphStats } from "../graph/query.js";
import { getUserState, createTrade } from "../db/firestore.js";
import type { TradeType } from "../db/types.js";
import { getLatestBiometrics } from "../services/wearables.js";
import { getAllDomains } from "../domains/manager.js";
import { conveneCouncil, formatCouncilCard } from "../ai/council.js";
import { searchWeb, type WebSearchResult } from "../services/websearch.js";

const DEFAULT_USER_ID = process.env.TELEGRAM_USER_ID || "1131646846";
const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");

// Helper to look up Telegram cloud stream URL
function getVaultTelegramUrl(sourceUrl?: string): string | null {
  if (!sourceUrl || !fs.existsSync(VAULT_TRACKER_FILE)) return null;
  try {
    const tracker = JSON.parse(fs.readFileSync(VAULT_TRACKER_FILE, "utf-8"));
    const entry = tracker.archivedUrls?.[sourceUrl];
    return entry?.telegramUrl || null;
  } catch {
    return null;
  }
}

// Instantiate Telegram Bot for outbound notifications
const bot = new Bot(config.telegramToken);

// Define MCP Tools
const TOOLS: Tool[] = [
  {
    name: "fabric_search_knowledge",
    description:
      "Search The Fabric's 3,840+ curated Knowledge Base (reels, architecture patterns, tech tools, philosophy, systems engineering). Returns actionable takeaways, tags, Notion links, and playable Telegram video streaming links.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords or conceptual topic (e.g., 'fastapi', 'distributed systems', 'dsa', 'stoicism', 'biomechanics')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 8, max: 25)",
        },
        category: {
          type: "string",
          description: "Optional category filter: 'tool' | 'concept' | 'quote' | 'framework' | 'heuristic'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fabric_get_telemetry",
    description:
      "Retrieve the user's real-time 4F Meta-OS telemetry: Currency Balances (Focus hours, Facts acquired, Funds yield, Energy baseline), Continuous Wearable Biometrics (HRV, Sleep stages, Recovery score, Resting HR), and 10-Dimension Aristotelian Mean Scales.",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Target Fabric Telegram user ID (default: primary owner)",
        },
      },
    },
  },
  {
    name: "fabric_convene_council",
    description:
      "Convene The Fabric's Polymath Council — a 5-member adversarial deliberation engine (The Architect, The Quant, The Stoic, The Biomechanic, and The Sceptic) to debate and synthesize any technical, financial, or strategic dilemma into an actionable verdict.",
    inputSchema: {
      type: "object",
      properties: {
        dilemma: {
          type: "string",
          description: "The strategic decision, dilemma, or question to deliberate",
        },
        userId: {
          type: "string",
          description: "Target user ID for personalized context (default: primary owner)",
        },
      },
      required: ["dilemma"],
    },
  },
  {
    name: "fabric_get_cluster",
    description:
      "Retrieve high-level architectural synthesis and core concepts for an entire topic cluster in the Knowledge Graph (e.g. 'fullstack', 'ai-agents', 'movement', 'finance').",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Cluster ID, label, or topic to inspect",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "fabric_list_domains",
    description:
      "List the hot-swappable domains currently mounted in the user's Fabric OS workbench slots (e.g., gold-etf, explainable-dsa, sidequest-vault, vitality-grooming) and standby bench.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "fabric_log_trade",
    description:
      "Log a completed 4F transaction into The Fabric on behalf of the user (e.g., when an agent helped acquire high-signal facts or completed a focused session).",
    inputSchema: {
      type: "object",
      properties: {
        tradeType: {
          type: "string",
          enum: ["builder", "learner", "automation"],
          description: "The primary currency of the trade ('builder' | 'learner' | 'automation')",
        },
        focusHours: {
          type: "number",
          description: "Focus hours spent (e.g. 0.5)",
        },
        factsYield: {
          type: "string",
          description: "Count or description of acquired facts/insights",
        },
        fundsCost: {
          type: "number",
          description: "Financial expenditure or cost",
        },
        fundsYield: {
          type: "number",
          description: "Financial yield or return",
        },
        energyDelta: {
          type: "number",
          description: "Subjective energy impact (-5 to +5)",
        },
        moduleName: {
          type: "string",
          description: "Name of the subsystem or module performing the trade",
        },
        note: {
          type: "string",
          description: "Clear description or takeaway of the trade",
        },
      },
      required: ["tradeType", "note"],
    },
  },
  {
    name: "fabric_notify_user",
    description:
      "Dispatch an instant proactive Telegram notification to the user's primary mobile device via The Fabric bot.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Markdown-formatted message text to send to user",
        },
        priority: {
          type: "string",
          enum: ["normal", "urgent"],
          description: "Notification priority (urgent prepends high-signal alert tags)",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "fabric_web_search",
    description:
      "Execute a zero-cost live web search via The Fabric's DuckDuckGo scraper to cross-reference real-time web context with internal vault materials.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Web search query",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
];

// Initialize Server
const server = new Server(
  {
    name: "fabric-os-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tool Listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Register Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "fabric_search_knowledge": {
        const query = String(args.query || "");
        const limit = typeof args.limit === "number" ? Math.min(args.limit, 25) : 8;
        const categoryFilter = args.category ? String(args.category).toLowerCase() : undefined;

        const result = await searchGraph(query, limit * 2);
        let nodes = result.nodes || [];

        if (categoryFilter) {
          nodes = nodes.filter((n) => {
            const cat = String(n.properties?.category || "").toLowerCase();
            return cat === categoryFilter || n.type === categoryFilter;
          });
        }

        const topNodes = nodes.slice(0, limit);

        if (topNodes.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No direct knowledge vault items found matching query: "${query}". Try related keywords or browse topic clusters.`,
              },
            ],
          };
        }

        const formatted = topNodes.map((n, idx) => {
          const props = n.properties || {};
          const sourceUrl = (props.sourceUrl as string) || "";
          const notionUrl = (props.notionUrl as string) || "";
          const tgUrl = getVaultTelegramUrl(sourceUrl);
          const tags = Array.isArray(props.tags) ? props.tags.join(", ") : "";

          let text = `### ${idx + 1}. ${n.label}\n`;
          text += `* **Type**: \`${n.type}\` | **Category**: \`${props.category || "general"}\`\n`;
          if (n.description) text += `* **Summary**: ${n.description}\n`;
          if (props.actionableTakeaway) text += `* **Actionable Takeaway**: ${props.actionableTakeaway}\n`;
          if (tags) text += `* **Tags**: \`${tags}\`\n`;
          if (tgUrl) text += `* **🎬 Stream Playable Video**: [Telegram Vault Cloud](${tgUrl})\n`;
          if (notionUrl) text += `* **📑 Notion Card**: [Notion Page](${notionUrl})\n`;
          if (sourceUrl) text += `* **Original Source**: [Instagram Reel](${sourceUrl})\n`;

          return text;
        });

        const clustersInfo = (result.relevantClusters || [])
          .slice(0, 3)
          .map((c) => `- **${c.label}**: ${c.coreTheme}`)
          .join("\n");

        let response = `Found **${topNodes.length}** high-signal items in The Fabric Knowledge Base for \`${query}\`:\n\n${formatted.join("\n\n")}`;
        if (clustersInfo) {
          response += `\n\n---\n**Relevant Knowledge Clusters:**\n${clustersInfo}`;
        }

        return {
          content: [{ type: "text", text: response }],
        };
      }

      case "fabric_get_telemetry": {
        const userId = String(args.userId || DEFAULT_USER_ID);
        const state = await getUserState(userId);
        const bio = await getLatestBiometrics(userId);

        const summary = {
          userId,
          currencies: {
            focusHours: state.totalFocusHours,
            factsAcquired: state.totalFactsAcquired,
            fundsYield: state.totalFundsYield,
            fundsSpent: state.totalFundsSpent,
            energyBaseline: state.averageEnergyDelta,
          },
          biometrics: bio
            ? {
                source: bio.source,
                timestamp: bio.timestamp,
                recoveryScore: bio.recovery?.score ?? 75,
                readinessCategory: bio.recovery?.readinessCategory ?? "optimal",
                hrvMs: bio.hrv?.value ?? 70,
                restingHeartRate: bio.heartRate?.resting ?? 62,
                sleepTotalHours: bio.sleep?.totalHours ?? 7.5,
                deepSleepHours: bio.sleep?.deepSleepHours,
                remSleepHours: bio.sleep?.remSleepHours,
              }
            : "No wearable sync recorded yet (calibrated defaults active)",
          aristotelianVirtues: state.goldenMeans || {},
          activeSlotsCount: (state as any).activeSlots?.length || 5,
        };

        return {
          content: [
            {
              type: "text",
              text: `### 📊 The Fabric: 4F Telemetry Snapshot (${userId})\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``,
            },
          ],
        };
      }

      case "fabric_convene_council": {
        const dilemma = String(args.dilemma || "");
        const userId = String(args.userId || DEFAULT_USER_ID);

        const report = await conveneCouncil(userId, dilemma);
        const cardText = formatCouncilCard(report);

        return {
          content: [{ type: "text", text: cardText }],
        };
      }

      case "fabric_get_cluster": {
        const topic = String(args.topic || "");
        const cluster = await getCluster(topic);

        if (!cluster) {
          return {
            content: [
              {
                type: "text",
                text: `Cluster '${topic}' not found. Try 'fullstack', 'ai-agents', 'movement', 'systems-thinking', or use fabric_search_knowledge.`,
              },
            ],
          };
        }

        let response = `### 🌐 Cluster: ${cluster.cluster.label}\n`;
        response += `* **Core Theme**: ${cluster.cluster.coreTheme}\n`;
        response += `* **Total Concepts**: ${cluster.cluster.nodeIds.length}\n`;
        response += `* **Top Tags**: \`${cluster.cluster.topTags.join(", ")}\`\n`;
        if (cluster.cluster.masterSynthesis) {
          response += `\n**Master Architectural Synthesis:**\n${cluster.cluster.masterSynthesis}\n`;
        }

        if (cluster.topConcepts && cluster.topConcepts.length > 0) {
          response += `\n**Key Knowledge Concepts:**\n`;
          for (const sn of cluster.topConcepts.slice(0, 8)) {
            response += `- **${sn.label}**: ${sn.description || sn.properties.actionableTakeaway || ""}\n`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      }

      case "fabric_list_domains": {
        const userId = DEFAULT_USER_ID;
        const { active, bench } = await getAllDomains(userId);

        let text = `### 🎛️ The Fabric Domain Workbench\n\n`;
        text += `**Active Mounted Domains (${active.length}):**\n`;
        for (const m of active) {
          text += `- \`${m.id}\`: **${m.name}** (${m.pillar}) — ${m.description}\n`;
        }

        text += `\n**Standby Bench Reservoir (${bench.length}):**\n`;
        for (const b of bench) {
          text += `- \`${b.id}\`: ${b.name} (${b.pillar})\n`;
        }

        return {
          content: [{ type: "text", text }],
        };
      }

      case "fabric_log_trade": {
        const userId = DEFAULT_USER_ID;
        const tradeType = (String(args.tradeType || "learner")) as TradeType;
        const note = String(args.note || "Automated A2A agent transaction");
        const focusHours = Number(args.focusHours || 0);
        const factsYield = String(args.factsYield || "A2A knowledge insight");
        const fundsCost = Number(args.fundsCost || 0);
        const fundsYield = Number(args.fundsYield || 0);
        const energyDelta = Number(args.energyDelta || 0);
        const moduleName = String(args.moduleName || "A2A-Mesh");

        const tradeId = await createTrade({
          userId,
          timestamp: new Date(),
          moduleName,
          tradeType,
          focusActualHours: focusHours,
          factsYield,
          fundsCost,
          fundsYield,
          energyDelta,
          tags: ["a2a", "mcp-agent", tradeType],
          notes: `[A2A Agent] ${note}`,
        });

        // Notify user via Telegram
        try {
          await bot.api.sendMessage(
            userId,
            `🤖 *A2A Agent Executed Trade:*\n` +
            `Module: \`${moduleName}\` | Type: \`${tradeType}\`\n` +
            `Note: _${note}_\n` +
            `Focus: \`+${focusHours}h\` | Facts: _${factsYield}_ | Energy: \`${energyDelta > 0 ? "+" : ""}${energyDelta}\``,
            { parse_mode: "Markdown" }
          );
        } catch {}

        return {
          content: [
            {
              type: "text",
              text: `✅ Trade logged successfully into The Fabric (ID: ${tradeId}). New balances synced.`,
            },
          ],
        };
      }

      case "fabric_notify_user": {
        const userId = DEFAULT_USER_ID;
        const message = String(args.message || "");
        const priority = args.priority === "urgent" ? "🚨 *URGENT AGENT DISPATCH:*\n\n" : "🤖 *External Agent Notification:*\n\n";

        await bot.api.sendMessage(userId, `${priority}${message}`, {
          parse_mode: "Markdown",
        });

        return {
          content: [
            {
              type: "text",
              text: `✅ Direct Telegram alert successfully delivered to user (${userId}).`,
            },
          ],
        };
      }

      case "fabric_web_search": {
        const q = String(args.query || "");
        const limit = typeof args.limit === "number" ? args.limit : 5;
        const results = await searchWeb(q, limit);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No live web results returned for "${q}".` }],
          };
        }

        const formatted = results
          .map((r: WebSearchResult, i: number) => `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`)
          .join("\n\n");

        return {
          content: [{ type: "text", text: `### 🌐 Web Search Results for "${q}":\n\n${formatted}` }],
        };
      }

      default:
        throw new Error(`Unknown tool name: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Error executing tool '${name}': ${err.message || String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

// Run MCP stdio server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 The Fabric MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Fabric MCP Server:", err);
  process.exit(1);
});
