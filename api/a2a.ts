import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { Bot } from "grammy";
import { config } from "../src/config/env.js";
import { searchGraph, getCluster } from "../src/graph/query.js";
import { getUserState, createTrade } from "../src/db/firestore.js";
import { getLatestBiometrics } from "../src/services/wearables.js";
import { getAllDomains } from "../src/domains/manager.js";
import { conveneCouncil, formatCouncilCard } from "../src/ai/council.js";
import { searchWeb } from "../src/services/websearch.js";
import type { TradeType } from "../src/db/types.js";

const bot = new Bot(config.telegramToken);
const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");

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

async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const TOOLS_METADATA = [
  {
    name: "search",
    alias: "fabric_search_knowledge",
    description: "Search 3,840+ curated Knowledge Base items (reels, architecture patterns, tech tools, heuristics).",
    parameters: {
      query: "string (search keywords)",
      limit: "number (optional, default 8)",
      category: "string (optional: tool | concept | heuristic | framework)",
    },
  },
  {
    name: "telemetry",
    alias: "fabric_get_telemetry",
    description: "Retrieve real-time 4F currencies (Focus, Facts, Funds, Energy) and wearable biometrics.",
    parameters: {
      userId: "string (optional)",
    },
  },
  {
    name: "council",
    alias: "fabric_convene_council",
    description: "Deliberate any dilemma across 5 Polymath Council personas into an actionable verdict.",
    parameters: {
      dilemma: "string (the problem/question)",
    },
  },
  {
    name: "cluster",
    alias: "fabric_get_cluster",
    description: "Retrieve synthesis and concepts for a topic cluster (e.g. 'fullstack', 'ai-agents', 'movement').",
    parameters: {
      topic: "string (cluster id or topic name)",
    },
  },
  {
    name: "domains",
    alias: "fabric_list_domains",
    description: "List active mounted slots and benched domains in the Fabric OS workbench.",
    parameters: {},
  },
  {
    name: "notify",
    alias: "fabric_notify_user",
    description: "Send a direct proactive Telegram alert to the user's mobile device.",
    parameters: {
      message: "string (markdown text)",
      priority: "'normal' | 'urgent'",
    },
  },
  {
    name: "log_trade",
    alias: "fabric_log_trade",
    description: "Record an acquired insight or completed focus session into user's 4F ledger.",
    parameters: {
      tradeType: "'builder' | 'learner' | 'automation'",
      note: "string",
      focusHours: "number (optional)",
      factsYield: "string (optional)",
      energyDelta: "number (optional, -5 to +5)",
    },
  },
];

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-fabric-token, x-user-id");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rawUrl = req.url || "";
  const parsedUrl = new URL(rawUrl, "http://localhost");
  const queryUserId = parsedUrl.searchParams.get("userId") || parsedUrl.searchParams.get("user_id");
  const queryToken = parsedUrl.searchParams.get("token");

  const headerToken = (
    req.headers["x-fabric-token"] ||
    (typeof req.headers["authorization"] === "string"
      ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
      : undefined)
  ) as string | undefined;

  // Optional Token Authentication
  const expectedToken = process.env.FABRIC_A2A_TOKEN || process.env.FABRIC_TOKEN;
  if (expectedToken) {
    const providedToken = headerToken || queryToken;
    if (!providedToken || providedToken !== expectedToken) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 401;
      res.end(JSON.stringify({ status: "error", error: "Unauthorized: Invalid x-fabric-token" }));
      return;
    }
  }

  const targetUserId =
    queryUserId ||
    (req.headers["x-user-id"] as string) ||
    process.env.TELEGRAM_USER_ID ||
    "1131646846";

  // 1. GET: Self-describing Discovery Schema & API Documentation
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify(
        {
          status: "ok",
          service: "The Fabric: A2A Universal Agent Protocol & Knowledge Hub",
          version: "1.0.0",
          endpoint: "/api/a2a",
          protocolsSupported: [
            "REST API (POST /api/a2a)",
            "JSON-RPC 2.0 (MCP-over-HTTP)",
            "Model Context Protocol (MCP stdio via src/mcp/server.ts)",
          ],
          availableTools: TOOLS_METADATA,
          examples: {
            restSearch: {
              method: "POST",
              url: "/api/a2a",
              body: { action: "search", query: "fastapi microservices", limit: 5 },
            },
            restCouncil: {
              method: "POST",
              url: "/api/a2a",
              body: { action: "council", dilemma: "Should I refactor our state store to event sourcing?" },
            },
            jsonRpc: {
              method: "POST",
              url: "/api/a2a",
              body: {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name: "fabric_search_knowledge", arguments: { query: "stoicism discipline" } },
              },
            },
          },
          targetUser: targetUserId,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    const body = await parseBody(req);

    // Normalize Action & Arguments (Supports both REST and JSON-RPC)
    let action = body.action || parsedUrl.searchParams.get("action");
    let args = body.args || body;
    let isJsonRpc = false;
    let jsonRpcId = body.id || 1;

    if (body.jsonrpc === "2.0") {
      isJsonRpc = true;
      if (body.method === "tools/list") {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: jsonRpcId,
            result: { tools: TOOLS_METADATA },
          })
        );
        return;
      }

      if (body.method === "tools/call") {
        const toolName = body.params?.name;
        args = body.params?.arguments || {};
        if (toolName === "fabric_search_knowledge" || toolName === "search") action = "search";
        else if (toolName === "fabric_get_telemetry" || toolName === "telemetry") action = "telemetry";
        else if (toolName === "fabric_convene_council" || toolName === "council") action = "council";
        else if (toolName === "fabric_get_cluster" || toolName === "cluster") action = "cluster";
        else if (toolName === "fabric_list_domains" || toolName === "domains") action = "domains";
        else if (toolName === "fabric_notify_user" || toolName === "notify") action = "notify";
        else if (toolName === "fabric_log_trade" || toolName === "log_trade") action = "log_trade";
        else action = toolName;
      }
    }

    // Default action to search if 'q' or 'query' is passed without action
    if (!action && (args.query || args.q)) {
      action = "search";
    }

    let result: any = null;

    switch (action) {
      case "search":
      case "fabric_search_knowledge": {
        const query = String(args.query || args.q || "");
        const limit = typeof args.limit === "number" ? Math.min(args.limit, 25) : 8;
        const category = args.category ? String(args.category).toLowerCase() : undefined;

        const graphRes = await searchGraph(query, limit * 2);
        let nodes = graphRes.nodes || [];

        if (category) {
          nodes = nodes.filter((n) => {
            const cat = String(n.properties?.category || "").toLowerCase();
            return cat === category || n.type === category;
          });
        }

        const topNodes = nodes.slice(0, limit);

        const items = topNodes.map((n) => {
          const props = n.properties || {};
          const sourceUrl = (props.sourceUrl as string) || "";
          const tgUrl = getVaultTelegramUrl(sourceUrl);

          return {
            id: n.id,
            label: n.label,
            type: n.type,
            category: props.category || "general",
            summary: n.description || "",
            actionableTakeaway: props.actionableTakeaway || "",
            tags: props.tags || [],
            sourceUrl: sourceUrl || undefined,
            notionUrl: props.notionUrl || undefined,
            telegramStreamUrl: tgUrl || undefined,
          };
        });

        result = {
          query,
          count: items.length,
          items,
          relevantClusters: (graphRes.relevantClusters || []).slice(0, 3).map((c) => ({
            id: c.id,
            label: c.label,
            coreTheme: c.coreTheme,
          })),
        };
        break;
      }

      case "telemetry":
      case "fabric_get_telemetry": {
        const state = await getUserState(targetUserId);
        const bio = await getLatestBiometrics(targetUserId);

        result = {
          userId: targetUserId,
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
              }
            : null,
          virtues: state.goldenMeans || {},
        };
        break;
      }

      case "council":
      case "fabric_convene_council": {
        const dilemma = String(args.dilemma || args.problem || "");
        if (!dilemma) throw new Error("Missing 'dilemma' parameter");

        const councilReport = await conveneCouncil(targetUserId, dilemma);
        result = {
          dilemma,
          verdict: councilReport.verdict,
          perspectives: councilReport.perspectives,
          formattedCard: formatCouncilCard(councilReport),
        };
        break;
      }

      case "cluster":
      case "fabric_get_cluster": {
        const topic = String(args.topic || args.clusterId || "");
        if (!topic) throw new Error("Missing 'topic' parameter");

        const cluster = await getCluster(topic);
        if (!cluster) {
          result = { error: `Cluster '${topic}' not found` };
        } else {
          result = {
            id: cluster.cluster.id,
            label: cluster.cluster.label,
            coreTheme: cluster.cluster.coreTheme,
            topTags: cluster.cluster.topTags,
            masterSynthesis: cluster.cluster.masterSynthesis,
            conceptCount: cluster.cluster.nodeIds.length,
            topConcepts: (cluster.topConcepts || []).slice(0, 8).map((c) => ({
              label: c.label,
              summary: c.description || c.properties?.actionableTakeaway || "",
            })),
          };
        }
        break;
      }

      case "domains":
      case "fabric_list_domains": {
        const { active, bench } = await getAllDomains(targetUserId);
        result = {
          activeCount: active.length,
          active: active.map((a) => ({ id: a.id, name: a.name, pillar: a.pillar, description: a.description })),
          benchCount: bench.length,
          bench: bench.map((b) => ({ id: b.id, name: b.name, pillar: b.pillar })),
        };
        break;
      }

      case "notify":
      case "fabric_notify_user": {
        const message = String(args.message || args.text || "");
        if (!message) throw new Error("Missing 'message' parameter");

        const priority = args.priority === "urgent" ? "🚨 *URGENT AGENT DISPATCH:*\n\n" : "🤖 *External Agent Notification:*\n\n";

        await bot.api.sendMessage(targetUserId, `${priority}${message}`, {
          parse_mode: "Markdown",
        });

        result = { sent: true, recipient: targetUserId, timestamp: new Date().toISOString() };
        break;
      }

      case "log_trade":
      case "fabric_log_trade": {
        const tradeType = (String(args.tradeType || "learner")) as TradeType;
        const note = String(args.note || "A2A Transaction");
        const focusHours = Number(args.focusHours || 0);
        const factsYield = String(args.factsYield || "Agent acquired insight");
        const fundsCost = Number(args.fundsCost || 0);
        const fundsYield = Number(args.fundsYield || 0);
        const energyDelta = Number(args.energyDelta || 0);

        const tradeId = await createTrade({
          userId: targetUserId,
          timestamp: new Date(),
          moduleName: "A2A-Mesh",
          tradeType,
          focusActualHours: focusHours,
          factsYield,
          fundsCost,
          fundsYield,
          energyDelta,
          tags: ["a2a", "external-agent"],
          notes: `[A2A] ${note}`,
        });

        // Notify user in background
        try {
          await bot.api.sendMessage(
            targetUserId,
            `🤖 *A2A Trade Ingested:*\n_${note}_\nFocus: \`+${focusHours}h\` | Facts: _${factsYield}_`,
            { parse_mode: "Markdown" }
          );
        } catch {}

        result = { tradeId, status: "logged", timestamp: new Date().toISOString() };
        break;
      }

      default:
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            status: "error",
            error: `Unknown action: '${action}'. Supported actions: search, telemetry, council, cluster, domains, notify, log_trade`,
          })
        );
        return;
    }

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;

    if (isJsonRpc) {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: jsonRpcId,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        })
      );
    } else {
      res.end(JSON.stringify({ status: "ok", data: result }));
    }
  } catch (err: any) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 500;
    res.end(JSON.stringify({ status: "error", error: err.message || String(err) }));
  }
}

