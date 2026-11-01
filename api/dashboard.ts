import type { IncomingMessage, ServerResponse } from "http";
import { getUserState, getRecentTrades, getUserGoals, GoalItem } from "../src/db/firestore.js";
import { BUILTIN_PLUGINS } from "../src/plugins/catalog.js";
import type { UserState, Trade } from "../src/db/types.js";
import { getGraphSummary, type GraphSummaryData } from "../src/graph/query.js";

function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date: Date | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getEnergyStatus(delta: number): { text: string; color: string; bg: string } {
  if (delta >= 3) return { text: "Optimal Surge", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
  if (delta > 0) return { text: "Net Positive", color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/30" };
  if (delta === 0) return { text: "Neutral Equilibrium", color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/30" };
  if (delta >= -2) return { text: "Mild Drain", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" };
  return { text: "Depleted (Recharge Needed)", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30" };
}

function getMeanLabel(score: number): { label: string; color: string } {
  if (score > 1.5) return { label: `Excess (+${score})`, color: "text-amber-400" };
  if (score < -1.5) return { label: `Deficiency (${score})`, color: "text-rose-400" };
  return { label: `Golden Mean (${score > 0 ? "+" : ""}${score})`, color: "text-emerald-400" };
}

export default async function handler(
  req: IncomingMessage & { method?: string; query?: Record<string, string> },
  res: ServerResponse
) {
  try {
    const url = new URL(req.url || "", `https://${req.headers.host || "localhost"}`);
    const userId =
      url.searchParams.get("userId") || (req as unknown as { query?: Record<string, string> }).query?.userId || "";

    let userState: UserState | null = null;
    let recentTrades: Trade[] = [];
    let goals: GoalItem[] = [];
    let graphSummary: GraphSummaryData;

    // Parallel data fetch
    const [stateRes, tradesRes, goalsRes, graphRes] = await Promise.allSettled([
      userId ? getUserState(userId) : Promise.resolve(null),
      userId ? getRecentTrades(userId, 10) : Promise.resolve([]),
      userId ? getUserGoals(userId) : Promise.resolve([]),
      getGraphSummary(),
    ]);

    if (stateRes.status === "fulfilled" && stateRes.value) userState = stateRes.value;
    if (tradesRes.status === "fulfilled" && tradesRes.value) recentTrades = tradesRes.value;
    if (goalsRes.status === "fulfilled" && goalsRes.value) goals = goalsRes.value;

    if (graphRes.status === "fulfilled" && graphRes.value) {
      graphSummary = graphRes.value;
    } else {
      console.warn("Failed to retrieve graph summary, using fallback dataset:", (graphRes as PromiseRejectedResult).reason);
      graphSummary = {
        nodes: [
          { id: "dim_focus", type: "dimension", label: "Focus (Time & Attention)", description: "Deliberate attention, flow states, distraction reduction.", weight: 100, quadrant: "Focus", category: "core", tags: ["focus", "time"], actionableTakeaway: "Protect uninterrupted attentional blocks." },
          { id: "dim_facts", type: "dimension", label: "Facts (Systems & Tools)", description: "Concrete knowledge, AI architectures, hardware.", weight: 100, quadrant: "Facts", category: "core", tags: ["facts", "tools"], actionableTakeaway: "Systematize knowledge into executable patterns." },
          { id: "dim_funds", type: "dimension", label: "Funds (Vitality & Capital)", description: "Physical vitality, biomechanics, capital allocation.", weight: 100, quadrant: "Funds", category: "core", tags: ["funds", "vitality"], actionableTakeaway: "Cultivate asymmetric financial and physical leverage." },
          { id: "dim_feedback", type: "dimension", label: "Feedback (Psychology & Balance)", description: "Interpersonal mirrors, psychological integration.", weight: 100, quadrant: "Feedback", category: "core", tags: ["feedback", "psychology"], actionableTakeaway: "Align extremes towards the golden mean." },
        ],
        edges: [],
        clusters: [],
        metadata: { totalNodes: 4, totalEdges: 0, clustersCount: 0, builtAt: new Date().toISOString() },
      };
    }

    // Default fallback state if new or uninitialized
    const state: UserState = userState || {
      userId: userId || "Operator",
      totalFocusHours: 0,
      totalFactsAcquired: 0,
      totalFundsSpent: 0,
      totalFundsYield: 0,
      averageEnergyDelta: 0,
      goldenMeans: {
        prioritization: 0,
        documentation: 0,
        waysToWork: 0,
        timeManagement: 0,
        variety: 0,
        goalsAndRewards: 0,
        portfolioGrowth: 0,
        skillHorizon: 0,
        rapidPrototyping: 0,
        expressionism: 0,
        vitality: 0,
      },
      activePlugins: ["monotropic-flow"],
      updatedAt: new Date(),
    };

    const netFunds = Math.round((state.totalFundsYield - state.totalFundsSpent) * 100) / 100;
    const energyStatus = getEnergyStatus(state.averageEnergyDelta);

    // Active plugins list
    const activePluginsList = (state.activePlugins && state.activePlugins.length > 0)
      ? state.activePlugins
      : ["monotropic-flow"];

    // Aristotelian data mapped to 5 key virtues
    const radarData = {
      Logic: state.goldenMeans?.documentation ?? 0,
      Vitality: state.goldenMeans?.vitality ?? 0,
      Art: state.goldenMeans?.expressionism ?? 0,
      Variety: state.goldenMeans?.variety ?? 0,
      Prioritization: state.goldenMeans?.prioritization ?? 0,
    };

    const lockedGoals = goals.filter((g) => !g.isUnlocked);
    const unlockedGoals = goals.filter((g) => g.isUnlocked);

    // Serialize graph summary safely
    const serializedGraph = JSON.stringify(graphSummary).replace(/<\/script/gi, "<\\/script");

    const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>The Fabric HUD — 4F Meta-OS & Knowledge Vault</title>
  
  <!-- Telegram WebApp SDK -->
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Chart.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            fabric: {
              bg: '#09090b',
              surface: '#121217',
              surfaceAlt: '#18181b',
              border: '#27272a',
              cyan: '#06b6d4',
              purple: '#a855f7',
              emerald: '#10b981',
              rose: '#f43f5e',
              amber: '#f59e0b',
            }
          }
        }
      }
    };
  </script>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    
    :root {
      color-scheme: dark;
    }
    
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      background-color: #09090b;
      color: #f4f4f5;
      -webkit-font-smoothing: antialiased;
      padding-bottom: env(safe-area-inset-bottom, 28px);
      padding-top: env(safe-area-inset-top, 12px);
    }
    
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    .glass-card {
      background: rgba(18, 18, 23, 0.78);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(39, 39, 42, 0.8);
    }

    .glow-cyan {
      box-shadow: 0 0 20px -5px rgba(6, 182, 212, 0.25);
    }

    .glow-purple {
      box-shadow: 0 0 20px -5px rgba(168, 85, 247, 0.25);
    }

    .glow-emerald {
      box-shadow: 0 0 20px -5px rgba(16, 185, 129, 0.25);
    }

    .glow-amber {
      box-shadow: 0 0 20px -5px rgba(245, 158, 11, 0.25);
    }

    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
    .no-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    /* Custom subtle scrollbar */
    ::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: #27272a;
      border-radius: 4px;
    }

    .cluster-pill {
      white-space: nowrap;
      user-select: none;
      -webkit-user-select: none;
    }

    canvas#graphCanvas {
      touch-action: none;
    }
  </style>
</head>
<body class="min-h-screen px-4 py-3 sm:px-6 sm:py-6 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto flex flex-col gap-4">

  <!-- HEADER -->
  <header class="flex flex-col gap-3 pt-1">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            The Fabric HUD
            <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">v2.1</span>
          </h1>
          <p class="text-xs text-zinc-400">4F Meta-OS Real-Time Telemetry &amp; Knowledge Mesh</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button onclick="refreshDashboard()" class="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition active:scale-95" title="Refresh Telemetry">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button id="tgCloseBtn" onclick="closeTelegramApp()" class="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 border border-zinc-700/60 transition active:scale-95 hidden" title="Close">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- User & Network Indicator Bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-400">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>ID: <span class="text-zinc-200 font-semibold">${escapeHtml(state.userId)}</span></span>
      </div>
      <div class="flex items-center gap-2">
        <span>Mesh: <span class="text-cyan-400">Operational</span></span>
        <span class="text-zinc-600">•</span>
        <span>Nodes: <span class="text-purple-400">${graphSummary.metadata.totalNodes || 3880}</span></span>
        <span class="text-zinc-600">•</span>
        <span>Updated: <span class="text-zinc-300">${formatDate(state.updatedAt)}</span></span>
      </div>
    </div>

    <!-- Active WoW Plugins -->
    <div class="flex flex-col gap-1.5">
      <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Active Ways of Working (WoW) Plugins</span>
      <div class="flex flex-wrap gap-1.5">
        ${activePluginsList
          .map((id) => {
            const def = BUILTIN_PLUGINS[id];
            const name = def ? def.name : id;
            return `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              <span>${escapeHtml(name)}</span>
            </div>
            `;
          })
          .join("")}
      </div>
    </div>
  </header>

  <!-- TAB NAVIGATION SWITCHER -->
  <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg">
    <button id="navTabHud" onclick="switchMainTab('hud')" class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 bg-zinc-800 text-cyan-400 shadow-md border border-cyan-500/30">
      <span class="text-sm">📊</span>
      <span>4F HUD &amp; Telemetry</span>
    </button>
    <button id="navTabGraph" onclick="switchMainTab('graph')" class="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 text-zinc-400 hover:text-zinc-200 border border-transparent">
      <span class="text-sm">🕸️</span>
      <span>Knowledge Graph &amp; Vault</span>
      <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">Interactive</span>
    </button>
  </nav>

  <!-- ========================================== -->
  <!-- TAB 1: 4F HUD & TELEMETRY SECTION          -->
  <!-- ========================================== -->
  <main id="tabContentHud" class="flex flex-col gap-4">
    
    <!-- 4F CURRENCY CARDS (Focus, Facts, Funds, Vital Energy) -->
    <section class="grid grid-cols-2 gap-3">
      
      <!-- FOCUS -->
      <div class="glass-card glow-cyan rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div class="absolute -right-3 -top-3 w-16 h-16 bg-cyan-500/10 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Focus Hours</span>
          <span class="text-base">⏳</span>
        </div>
        <div class="flex flex-col">
          <span class="text-2xl font-black tracking-tight text-white font-mono">${state.totalFocusHours}<span class="text-sm font-normal text-zinc-400 ml-0.5">h</span></span>
          <span class="text-[11px] text-zinc-400 mt-0.5">Deployed deep attention</span>
        </div>
      </div>

      <!-- FACTS -->
      <div class="glass-card glow-purple rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div class="absolute -right-3 -top-3 w-16 h-16 bg-purple-500/10 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-purple-400">Facts Acquired</span>
          <span class="text-base">💡</span>
        </div>
        <div class="flex flex-col">
          <span class="text-2xl font-black tracking-tight text-white font-mono">${state.totalFactsAcquired}</span>
          <button onclick="switchMainTab('graph')" class="text-[11px] text-purple-400 hover:text-purple-300 mt-1 flex items-center gap-1 font-mono transition text-left">
            <span>Explore Knowledge Vault &rarr;</span>
          </button>
        </div>
      </div>

      <!-- FUNDS -->
      <div class="glass-card glow-emerald rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div class="absolute -right-3 -top-3 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Funds P&amp;L</span>
          <span class="text-base">💰</span>
        </div>
        <div class="flex flex-col">
          <div class="flex items-baseline gap-1 font-mono">
            <span class="text-lg font-black text-white">$${state.totalFundsYield}</span>
            <span class="text-xs text-zinc-500">/ -$${state.totalFundsSpent}</span>
          </div>
          <span class="text-[11px] font-mono mt-0.5 ${netFunds >= 0 ? "text-emerald-400" : "text-rose-400"}">
            Net: ${netFunds >= 0 ? "+" : ""}$${netFunds}
          </span>
        </div>
      </div>

      <!-- ENERGY / BATTERY -->
      <div class="glass-card rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden border ${energyStatus.bg}">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-wider ${energyStatus.color}">Energy Baseline</span>
          <!-- Animated Battery Icon -->
          <div class="flex items-center">
            <div class="w-6 h-3 border border-zinc-400 rounded-sm p-0.5 flex items-center">
              <div class="h-full rounded-xs transition-all duration-500 ${
                state.averageEnergyDelta >= 2 ? "bg-emerald-400 w-full" :
                state.averageEnergyDelta > 0 ? "bg-teal-400 w-3/4" :
                state.averageEnergyDelta === 0 ? "bg-zinc-400 w-1/2" :
                state.averageEnergyDelta >= -2 ? "bg-amber-400 w-1/3" : "bg-rose-500 w-1/5"
              }"></div>
            </div>
            <div class="w-0.5 h-1.5 bg-zinc-400 rounded-r-xs"></div>
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-2xl font-black tracking-tight text-white font-mono">
            ${state.averageEnergyDelta > 0 ? "+" : ""}${state.averageEnergyDelta}
          </span>
          <span class="text-[11px] font-medium ${energyStatus.color} mt-0.5 truncate">${energyStatus.text}</span>
        </div>
      </div>

    </section>

    <!-- ARISTOTELIAN EQUILIBRIUM RADAR CHART -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
            <span>⚖️</span> Aristotelian Equilibrium Radar
          </h2>
          <p class="text-[11px] text-zinc-400">Dynamic virtue calibration across core operating axes (Scale: -5 to +5)</p>
        </div>
        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">0 = Golden Mean</span>
      </div>

      <div class="relative w-full max-w-[340px] mx-auto py-2">
        <canvas id="radarChart" class="w-full"></canvas>
      </div>

      <!-- Virtue Pillars Breakdown -->
      <div class="grid grid-cols-5 gap-1.5 pt-2 border-t border-zinc-800/80 text-center">
        ${Object.entries(radarData)
          .map(([key, val]) => {
            const { color } = getMeanLabel(val);
            return `
            <div class="flex flex-col items-center bg-zinc-900/60 rounded-lg p-1.5 border border-zinc-800/60">
              <span class="text-[10px] font-medium text-zinc-400">${key}</span>
              <span class="text-xs font-bold font-mono text-white mt-0.5">${val > 0 ? "+" : ""}${val}</span>
              <span class="text-[8px] ${color} truncate max-w-[50px] leading-tight mt-0.5">${val === 0 ? "Mean" : (val > 0 ? "Excess" : "Deficit")}</span>
            </div>
            `;
          })
          .join("")}
      </div>
    </section>

    <!-- RECENT TRADES FEED -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
            <span>⚡</span> Recent Trades Telemetry
          </h2>
          <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">${recentTrades.length} entries</span>
        </div>
        <span class="text-xs text-zinc-500">Live Stream</span>
      </div>

      <div class="flex flex-col gap-2.5">
        ${
          recentTrades.length === 0
            ? `
            <div class="py-8 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
              <svg class="w-8 h-8 text-zinc-600 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>No currency trades recorded yet.</span>
              <span class="text-[11px] text-zinc-600">Log your first session with <code class="text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">/spark</code> or <code class="text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">/settle</code></span>
            </div>
            `
            : recentTrades
                .map((trade) => {
                  const isPositive = trade.energyDelta > 0;
                  const isNeutral = trade.energyDelta === 0;
                  const tradeEnergyColor = isPositive
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                    : isNeutral
                    ? "text-zinc-400 bg-zinc-800 border-zinc-700"
                    : "text-rose-400 bg-rose-500/10 border-rose-500/30";

                  return `
                  <div class="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/90 flex flex-col gap-2 hover:border-zinc-700 transition">
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex flex-col">
                        <span class="text-xs font-bold text-zinc-100">${escapeHtml(trade.moduleName)}</span>
                        <span class="text-[10px] text-zinc-500 font-mono">${formatDate(trade.timestamp)}</span>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded border ${tradeEnergyColor}">
                          ${isPositive ? "+" : ""}${trade.energyDelta}⚡
                        </span>
                        <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          ${trade.focusActualHours}h
                        </span>
                      </div>
                    </div>

                    ${
                      trade.factsYield
                        ? `
                      <div class="text-[11px] text-purple-300 bg-purple-950/20 border border-purple-800/30 rounded-lg p-2 font-mono">
                        💡 ${escapeHtml(trade.factsYield)}
                      </div>
                      `
                        : ""
                    }

                    <div class="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[10px]">
                      <span class="px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                        trade.tradeType === "builder"
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                          : trade.tradeType === "learner"
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      }">
                        ${escapeHtml(trade.tradeType)}
                      </span>

                      ${
                        trade.tags && trade.tags.length > 0
                          ? `
                        <div class="flex flex-wrap gap-1">
                          ${trade.tags
                            .slice(0, 3)
                            .map((tag) => `<span class="text-zinc-500 font-mono">#${escapeHtml(tag)}</span>`)
                            .join(" ")}
                        </div>
                        `
                          : ""
                      }
                    </div>
                  </div>
                  `;
                })
                .join("")
        }
      </div>
    </section>

    <!-- GATED REWARD BANK -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
            <span>🎁</span> Reward Bank &amp; Validation Gates
          </h2>
          <p class="text-[11px] text-zinc-400">Guilt-free dopamine unlocked strictly through verified execution</p>
        </div>
        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-amber-500/30">
          ${lockedGoals.length} Locked / ${unlockedGoals.length} Claimed
        </span>
      </div>

      ${
        goals.length === 0
          ? `
          <div class="py-6 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
            <span>No milestones currently armed in Reward Bank.</span>
            <span class="text-[11px] text-zinc-600">Arm a gate via Telegram: <code class="text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">/goal &lt;milestone&gt; -&gt; &lt;reward&gt;</code></span>
          </div>
          `
          : `
          <div class="flex flex-col gap-2">
            <!-- Locked Milestones -->
            ${lockedGoals
              .map(
                (g) => `
              <div class="p-3 rounded-xl bg-zinc-900/80 border border-amber-500/30 flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5">
                  <span class="text-base mt-0.5">🔒</span>
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-zinc-100">${escapeHtml(g.title)}</span>
                    <span class="text-[11px] text-amber-300 font-mono mt-0.5">🎁 Reward: ${escapeHtml(g.reward)}</span>
                    <span class="text-[10px] text-zinc-500 mt-0.5 font-mono">Validation: ${escapeHtml(g.targetMetric)}</span>
                  </div>
                </div>
                <span class="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                  Armed
                </span>
              </div>
            `
              )
              .join("")}

            <!-- Unlocked Milestones -->
            ${unlockedGoals
              .map(
                (g) => `
              <div class="p-3 rounded-xl bg-zinc-900/80 border border-emerald-500/30 flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5">
                  <span class="text-base mt-0.5">🔓</span>
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-zinc-200 line-through decoration-zinc-500">${escapeHtml(g.title)}</span>
                    <span class="text-[11px] text-emerald-300 font-mono mt-0.5 font-semibold">🏆 Unlocked: ${escapeHtml(g.reward)}</span>
                    <span class="text-[10px] text-zinc-500 font-mono">Cleared: ${formatDate(g.unlockedAt || g.createdAt)}</span>
                  </div>
                </div>
                <span class="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                  Unlocked
                </span>
              </div>
            `
              )
              .join("")}
          </div>
          `
      }
    </section>

  </main>

  <!-- ========================================== -->
  <!-- TAB 2: KNOWLEDGE GRAPH & VAULT SECTION     -->
  <!-- ========================================== -->
  <main id="tabContentGraph" class="flex flex-col gap-3 hidden">
    
    <!-- Section Introduction Header -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-2">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
              Knowledge Graph &amp; Vault Constellation
            </h2>
            <p class="text-[11px] text-zinc-400">Interactive force-directed neural mesh linking high-agency principles &amp; streamable reels</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 font-mono text-[10px]">
          <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700" id="graphStatsBadge">
            ${graphSummary.nodes.length} Active Nodes • ${graphSummary.edges.length} Synapses
          </span>
        </div>
      </div>

      <!-- Quick Search Bar -->
      <div class="relative mt-1">
        <input 
          id="graphSearchInput" 
          type="text" 
          placeholder="Search concepts, takeaways, reels, tags (e.g. dopamine, tendon, game feel)..." 
          class="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 transition shadow-inner font-mono"
          oninput="handleGraphSearch(this.value)"
        />
        <svg class="w-4 h-4 text-zinc-500 absolute left-3 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <button id="clearSearchBtn" onclick="clearGraphSearch()" class="hidden absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Cluster Filter Pills (Scrollable) -->
      <div class="flex flex-col gap-1.5 pt-1">
        <div class="flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <span class="uppercase tracking-wider font-semibold">Sub-Constellation Filter</span>
          <span class="text-zinc-500">Scroll horizontally</span>
        </div>
        <div id="clusterPillsContainer" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-xs">
          <button 
            onclick="setClusterFilter('all')" 
            data-cluster-id="all"
            class="cluster-pill px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
          >
            All Clusters (${graphSummary.nodes.length})
          </button>
          ${graphSummary.clusters
            .map((c) => {
              return `
              <button 
                onclick="setClusterFilter('${escapeHtml(c.id)}')" 
                data-cluster-id="${escapeHtml(c.id)}"
                class="cluster-pill px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all active:scale-95 bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
              >
                ${escapeHtml(c.label)}
              </button>
              `;
            })
            .join("")}
        </div>
      </div>

      <!-- Node Style Legend Bar -->
      <div class="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-zinc-800/80 text-[10px] font-mono">
        <span class="text-zinc-500 font-semibold uppercase tracking-wider">Legend:</span>
        <div class="flex items-center gap-2.5 flex-wrap">
          <div class="flex items-center gap-1.5 text-cyan-300">
            <span class="w-2 h-2 rounded-full bg-[#06b6d4] shadow-sm shadow-cyan-400"></span>
            <span>Concepts</span>
          </div>
          <div class="flex items-center gap-1.5 text-purple-300">
            <span class="w-2 h-2 rounded-full bg-[#a855f7] shadow-sm shadow-purple-400"></span>
            <span>Reels</span>
          </div>
          <div class="flex items-center gap-1.5 text-emerald-300">
            <span class="w-2 h-2 rounded-full bg-[#10b981] shadow-sm shadow-emerald-400"></span>
            <span>Heuristics</span>
          </div>
          <div class="flex items-center gap-1.5 text-amber-300">
            <span class="w-2 h-2 rounded-full bg-[#f59e0b] shadow-sm shadow-amber-400"></span>
            <span>Dimensions</span>
          </div>
          <div class="flex items-center gap-1.5 text-rose-300">
            <span class="w-2 h-2 rounded-full bg-[#f43f5e] shadow-sm shadow-rose-400"></span>
            <span>Verdicts</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Force-Directed Canvas Interactive Viewport -->
    <section class="glass-card rounded-2xl overflow-hidden relative border border-zinc-800 shadow-2xl flex flex-col">
      <!-- Canvas Overlay Controls Header -->
      <div class="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
        <div class="px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800/90 text-[10px] font-mono text-zinc-300 backdrop-blur-md shadow-md pointer-events-auto flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span id="canvasStatusText">Physics Active</span>
        </div>
      </div>

      <div class="absolute top-3 right-3 z-10 flex items-center gap-1 pointer-events-auto">
        <button onclick="zoomInCanvas()" class="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center font-mono text-sm transition active:scale-90" title="Zoom In">
          +
        </button>
        <button onclick="zoomOutCanvas()" class="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center font-mono text-sm transition active:scale-90" title="Zoom Out">
          -
        </button>
        <button onclick="resetCanvasView()" class="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center text-xs transition active:scale-90" title="Reset View &amp; Center">
          ⊙
        </button>
        <button id="pausePhysicsBtn" onclick="togglePhysicsPause()" class="px-2 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center text-[10px] font-mono transition active:scale-90" title="Pause / Resume Physics">
          ❄️ Freeze
        </button>
      </div>

      <!-- HTML5 Canvas Element -->
      <div class="relative w-full h-[460px] sm:h-[520px] bg-[#0c0c11]">
        <canvas id="graphCanvas" class="w-full h-full block cursor-grab active:cursor-grabbing"></canvas>
      </div>

      <!-- Canvas Bottom Interaction Hint -->
      <div class="px-4 py-2 bg-zinc-950/90 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span>Drag to pan • Pinch/scroll to zoom • Drag node to reposition</span>
        <span class="text-zinc-400">Click node to inspect</span>
      </div>
    </section>

    <!-- INTERACTIVE NODE / CLUSTER INSPECTOR CARD -->
    <section id="nodeInspector" class="glass-card rounded-2xl p-4 transition-all duration-300 flex flex-col gap-3 border border-zinc-800">
      <div class="py-6 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
        <span class="text-xl">✨</span>
        <span class="font-bold text-zinc-300">Tap Any Node or Cluster to Inspect</span>
        <span class="text-[11px] text-zinc-500 max-w-sm">
          Click concepts to see core syntheses, or select reel nodes to extract actionable heuristics and stream the original video in Telegram Vault.
        </span>
      </div>
    </section>

  </main>

  <!-- FOOTER -->
  <footer class="text-center py-4 text-[11px] text-zinc-600 font-mono flex flex-col gap-1 items-center">
    <span>The Fabric: 4F Meta-OS • Personal Telemetry &amp; Knowledge Vault</span>
    <span class="text-zinc-700">Powered by Gemini, Firestore &amp; Telegram WebApp Platform</span>
  </footer>

  <!-- SERIALIZED GRAPH DATA INJECTION -->
  <script>
    window.__GRAPH_DATA__ = ${serializedGraph};
  </script>

  <!-- CLIENT-SIDE APPLICATION LOGIC -->
  <script>
    // Safe client-side HTML escape helper
    function escapeClientHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Initialize Telegram WebApp SDK
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      try {
        tg.expand();
        tg.setHeaderColor('#09090b');
        tg.setBackgroundColor('#09090b');
      } catch (e) {
        console.warn('Telegram SDK stylings error:', e);
      }

      const tgCloseBtn = document.getElementById('tgCloseBtn');
      if (tgCloseBtn) {
        tgCloseBtn.classList.remove('hidden');
      }

      // If no userId in query string, auto-redirect if Telegram provides it!
      const currentUrl = new URL(window.location.href);
      if (!currentUrl.searchParams.get('userId') && tg.initDataUnsafe?.user?.id) {
        currentUrl.searchParams.set('userId', tg.initDataUnsafe.user.id.toString());
        window.location.replace(currentUrl.toString());
      }
    }

    function triggerHaptic(type = 'light') {
      try {
        tg?.HapticFeedback?.impactOccurred(type);
      } catch (e) {}
    }

    function refreshDashboard() {
      triggerHaptic('medium');
      window.location.reload();
    }

    function closeTelegramApp() {
      triggerHaptic('light');
      tg?.close();
    }

    function openTelegramVaultUrl(url) {
      triggerHaptic('medium');
      if (!url) return;
      try {
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(url);
          return;
        }
      } catch (e) {
        console.warn("Telegram SDK open link error:", e);
      }
      window.open(url, '_blank');
    }

    // ========================================================
    // TAB NAVIGATION (HUD vs KNOWLEDGE GRAPH)
    // ========================================================
    function switchMainTab(tab) {
      triggerHaptic('light');
      const hudContent = document.getElementById('tabContentHud');
      const graphContent = document.getElementById('tabContentGraph');
      const navTabHud = document.getElementById('navTabHud');
      const navTabGraph = document.getElementById('navTabGraph');

      if (tab === 'graph') {
        hudContent?.classList.add('hidden');
        graphContent?.classList.remove('hidden');

        navTabGraph?.classList.add('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabGraph?.classList.remove('text-zinc-400', 'border-transparent');

        navTabHud?.classList.remove('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabHud?.classList.add('text-zinc-400', 'border-transparent');

        // Resize canvas and reheat physics
        setTimeout(() => {
          if (window.resizeGraphCanvas) window.resizeGraphCanvas();
          if (window.reheatSimulation) window.reheatSimulation(0.5);
        }, 30);
      } else {
        graphContent?.classList.add('hidden');
        hudContent?.classList.remove('hidden');

        navTabHud?.classList.add('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabHud?.classList.remove('text-zinc-400', 'border-transparent');

        navTabGraph?.classList.remove('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabGraph?.classList.add('text-zinc-400', 'border-transparent');
      }
    }

    // Auto-check URL query or hash for default tab
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'graph' || window.location.hash === '#graph') {
      switchMainTab('graph');
    }

    // ========================================================
    // CHART.JS ARISTOTELIAN RADAR CHART
    // ========================================================
    const ctx = document.getElementById('radarChart')?.getContext('2d');
    if (ctx) {
      const radarLabels = ${JSON.stringify(Object.keys(radarData))};
      const rawValues = ${JSON.stringify(Object.values(radarData))};
      const mappedValues = rawValues.map(v => Math.max(0, Math.min(10, v + 5)));

      new Chart(ctx, {
        type: 'radar',
        data: {
          labels: radarLabels,
          datasets: [
            {
              label: 'Current Telemetry',
              data: mappedValues,
              backgroundColor: 'rgba(6, 182, 212, 0.25)',
              borderColor: '#06b6d4',
              borderWidth: 2,
              pointBackgroundColor: '#a855f7',
              pointBorderColor: '#ffffff',
              pointHoverBackgroundColor: '#ffffff',
              pointHoverBorderColor: '#a855f7',
              pointRadius: 4,
              pointHoverRadius: 6,
            },
            {
              label: 'Golden Mean (0)',
              data: [5, 5, 5, 5, 5],
              backgroundColor: 'rgba(16, 185, 129, 0.04)',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              borderWidth: 1,
              borderDash: [4, 4],
              pointRadius: 0,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const rawVal = rawValues[context.dataIndex];
                  return ' ' + context.label + ': ' + (rawVal > 0 ? '+' : '') + rawVal + ' (Center: 0)';
                }
              }
            }
          },
          scales: {
            r: {
              min: 0,
              max: 10,
              ticks: { display: false, stepSize: 2.5 },
              grid: { color: 'rgba(255, 255, 255, 0.08)' },
              angleLines: { color: 'rgba(255, 255, 255, 0.12)' },
              pointLabels: {
                color: '#e4e4e7',
                font: { size: 11, weight: '600', family: "'Plus Jakarta Sans', sans-serif" }
              }
            }
          }
        }
      });
    }

    // ========================================================
    // FORCE-DIRECTED KNOWLEDGE GRAPH SIMULATION & RENDERER
    // ========================================================
    (function initKnowledgeGraph() {
      const graphData = window.__GRAPH_DATA__ || { nodes: [], edges: [], clusters: [] };
      const canvas = document.getElementById('graphCanvas');
      if (!canvas) return;
      const gctx = canvas.getContext('2d');
      if (!gctx) return;

      // Specification Node Colors
      const NODE_STYLES = {
        concept: { color: '#06b6d4', radius: 11, label: 'Concept', badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
        reel: { color: '#a855f7', radius: 8, label: 'Reel', badgeBg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
        heuristic: { color: '#10b981', radius: 10, label: 'Heuristic', badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
        dimension: { color: '#f59e0b', radius: 16, label: 'Dimension', badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
        verdict: { color: '#f43f5e', radius: 11, label: 'User Verdict', badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
      };

      // Quadrant coordinate anchors
      const QUADRANT_OFFSETS = {
        Focus: { x: -180, y: -160 },
        Facts: { x: 180, y: -160 },
        Funds: { x: 180, y: 160 },
        Feedback: { x: -180, y: 160 },
      };

      // State
      let allNodes = [];
      let allEdges = [];
      let activeNodes = [];
      let activeEdges = [];
      let nodeMap = new Map();
      let neighborMap = new Map(); // id -> Map(neighborId, relation)
      let activeCluster = 'all';
      let activeSearch = '';
      let selectedNode = null;
      let hoveredNode = null;

      // Camera
      const camera = { panX: 0, panY: 0, zoom: 1.0 };
      let dpr = window.devicePixelRatio || 1;
      let width = 0;
      let height = 0;

      // Physics variables
      let alpha = 1.0;
      let isPaused = false;
      const ALPHA_DECAY = 0.0035;
      const MIN_ALPHA = 0.001;

      // Initialize nodes with positions
      allNodes = (graphData.nodes || []).map((raw) => {
        const style = NODE_STYLES[raw.type] || NODE_STYLES.concept;
        const qOffset = QUADRANT_OFFSETS[raw.quadrant] || { x: 0, y: 0 };
        const angle = Math.random() * Math.PI * 2;
        const dist = raw.type === 'dimension' ? 40 : 50 + Math.random() * 110;
        
        return {
          ...raw,
          x: qOffset.x + Math.cos(angle) * dist,
          y: qOffset.y + Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          radius: style.radius,
          color: style.color,
          isFixed: false,
        };
      });

      allEdges = (graphData.edges || []).map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
        weight: e.weight || 1,
      }));

      // Build initial lookup maps
      allNodes.forEach((n) => nodeMap.set(n.id, n));
      buildAdjacency();

      activeNodes = [...allNodes];
      activeEdges = [...allEdges];

      function buildAdjacency() {
        neighborMap.clear();
        allNodes.forEach((n) => neighborMap.set(n.id, new Map()));
        allEdges.forEach((e) => {
          if (neighborMap.has(e.source)) {
            neighborMap.get(e.source).set(e.target, e.relation);
          }
          if (neighborMap.has(e.target)) {
            neighborMap.get(e.target).set(e.source, e.relation);
          }
        });
      }

      function reheatSimulation(newAlpha = 0.4) {
        if (alpha < newAlpha) alpha = newAlpha;
        const status = document.getElementById('canvasStatusText');
        if (status) status.innerText = isPaused ? 'Physics Paused' : 'Physics Active';
      }
      window.reheatSimulation = reheatSimulation;

      function resizeGraphCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        width = rect.width;
        height = rect.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      window.resizeGraphCanvas = resizeGraphCanvas;

      window.addEventListener('resize', resizeGraphCanvas);
      resizeGraphCanvas();

      // ========================================================
      // PHYSICS SIMULATION ENGINE
      // ========================================================
      function stepPhysics() {
        if (isPaused || alpha < MIN_ALPHA) {
          const status = document.getElementById('canvasStatusText');
          if (status && !isPaused) status.innerText = 'Equilibrium Settled';
          return;
        }

        const nodes = activeNodes;
        const count = nodes.length;
        if (count === 0) return;

        const kRep = 3600 * alpha;
        const kSpring = 0.038;
        const kGrav = 0.007;
        const damping = 0.82;

        // 1. Repulsion between visible nodes
        for (let i = 0; i < count; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < count; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy + 100;
            const dist = Math.sqrt(distSq);
            const force = kRep / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (!n1.isFixed) { n1.vx -= fx; n1.vy -= fy; }
            if (!n2.isFixed) { n2.vx += fx; n2.vy += fy; }
          }
        }

        // 2. Spring attraction along active edges
        for (let i = 0; i < activeEdges.length; i++) {
          const e = activeEdges[i];
          const n1 = nodeMap.get(e.source);
          const n2 = nodeMap.get(e.target);
          if (!n1 || !n2) continue;

          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const idealDist = (n1.type === 'dimension' || n2.type === 'dimension') ? 130 : 80;
          const force = (dist - idealDist) * kSpring * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.isFixed) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.isFixed) { n2.vx += fx; n2.vy += fy; }
        }

        // 3. Center gravity and position integration
        for (let i = 0; i < count; i++) {
          const n = nodes[i];
          if (n.isFixed) continue;

          n.vx -= n.x * kGrav * alpha;
          n.vy -= n.y * kGrav * alpha;
          n.vx *= damping;
          n.vy *= damping;

          // Limit speed cap
          const speed = Math.hypot(n.vx, n.vy);
          if (speed > 12) {
            n.vx = (n.vx / speed) * 12;
            n.vy = (n.vy / speed) * 12;
          }

          n.x += n.vx;
          n.y += n.vy;
        }

        alpha = Math.max(MIN_ALPHA, alpha - ALPHA_DECAY);
      }

      // ========================================================
      // CANVAS DRAWING & RENDERING
      // ========================================================
      function draw() {
        if (!width || !height) {
          resizeGraphCanvas();
        }

        gctx.save();
        gctx.scale(dpr, dpr);
        gctx.clearRect(0, 0, width, height);

        // Draw background grid dots
        drawCosmicGrid();

        gctx.save();
        // Camera translation & zoom
        gctx.translate(width / 2 + camera.panX, height / 2 + camera.panY);
        gctx.scale(camera.zoom, camera.zoom);

        // Identify focused nodes & neighbor sets
        let highlightedNeighbors = new Set();
        if (selectedNode) {
          highlightedNeighbors = new Set(neighborMap.get(selectedNode.id)?.keys());
        } else if (hoveredNode) {
          highlightedNeighbors = new Set(neighborMap.get(hoveredNode.id)?.keys());
        }

        const focusedNode = selectedNode || hoveredNode;

        // 1. Draw Edges
        for (let i = 0; i < activeEdges.length; i++) {
          const e = activeEdges[i];
          const n1 = nodeMap.get(e.source);
          const n2 = nodeMap.get(e.target);
          if (!n1 || !n2) continue;

          const isConnectedToFocus = focusedNode && (e.source === focusedNode.id || e.target === focusedNode.id);

          gctx.beginPath();
          gctx.moveTo(n1.x, n1.y);
          gctx.lineTo(n2.x, n2.y);

          if (isConnectedToFocus) {
            gctx.strokeStyle = focusedNode.color || '#06b6d4';
            gctx.lineWidth = 2.2;
            gctx.globalAlpha = 0.9;
          } else if (focusedNode) {
            gctx.strokeStyle = '#ffffff';
            gctx.lineWidth = 0.8;
            gctx.globalAlpha = 0.03;
          } else {
            gctx.strokeStyle = '#a1a1aa';
            gctx.lineWidth = 0.9;
            gctx.globalAlpha = 0.12;
          }
          gctx.stroke();
        }

        gctx.globalAlpha = 1.0;

        // 2. Draw Nodes
        const now = Date.now();
        for (let i = 0; i < activeNodes.length; i++) {
          const n = activeNodes[i];
          const isSelected = selectedNode && selectedNode.id === n.id;
          const isHovered = hoveredNode && hoveredNode.id === n.id;
          const isNeighbor = highlightedNeighbors.has(n.id);
          const matchesSearch = !activeSearch || n.label.toLowerCase().includes(activeSearch) || (n.tags && n.tags.some(t => t.toLowerCase().includes(activeSearch)));

          // Determine opacity
          let nodeAlpha = 1.0;
          if (focusedNode) {
            nodeAlpha = (isSelected || isHovered || isNeighbor) ? 1.0 : 0.22;
          } else if (activeSearch) {
            nodeAlpha = matchesSearch ? 1.0 : 0.15;
          }

          gctx.globalAlpha = nodeAlpha;

          // Outer glowing aura for selected or hovered
          if (isSelected || isHovered) {
            const pulse = isSelected ? Math.sin(now / 180) * 2.5 : 0;
            gctx.beginPath();
            gctx.arc(n.x, n.y, n.radius + 6 + pulse, 0, Math.PI * 2);
            gctx.fillStyle = n.color;
            gctx.globalAlpha = nodeAlpha * 0.25;
            gctx.fill();
            gctx.globalAlpha = nodeAlpha;
          }

          // Node core circle
          gctx.beginPath();
          gctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          gctx.fillStyle = n.color;
          gctx.fill();

          // Node border stroke
          gctx.strokeStyle = isSelected ? '#ffffff' : (isHovered ? '#f4f4f5' : 'rgba(255, 255, 255, 0.4)');
          gctx.lineWidth = isSelected ? 2.5 : 1.2;
          gctx.stroke();

          // Inner icon / play glyph for Reels
          if (n.type === 'reel') {
            gctx.fillStyle = '#ffffff';
            gctx.beginPath();
            const r = n.radius * 0.45;
            gctx.moveTo(n.x - r * 0.6, n.y - r);
            gctx.lineTo(n.x + r, n.y);
            gctx.lineTo(n.x - r * 0.6, n.y + r);
            gctx.closePath();
            gctx.fill();
          }

          // 3. Node Label rendering
          const shouldDrawLabel = isSelected || isHovered || n.type === 'dimension' || n.type === 'concept' || camera.zoom > 1.35;
          if (shouldDrawLabel && nodeAlpha > 0.3) {
            const text = truncateText(n.label, isSelected ? 30 : 20);
            gctx.font = isSelected ? 'bold 11px JetBrains Mono, monospace' : '10px Plus Jakarta Sans, sans-serif';
            const metrics = gctx.measureText(text);
            const textWidth = metrics.width;
            const textY = n.y + n.radius + 12;

            // Background pill for label
            gctx.fillStyle = 'rgba(12, 12, 17, 0.85)';
            gctx.fillRect(n.x - textWidth / 2 - 4, textY - 9, textWidth + 8, 14);
            gctx.strokeStyle = isSelected ? n.color : 'rgba(255, 255, 255, 0.15)';
            gctx.lineWidth = 0.8;
            gctx.strokeRect(n.x - textWidth / 2 - 4, textY - 9, textWidth + 8, 14);

            // Label text
            gctx.fillStyle = isSelected ? '#ffffff' : '#d4d4d8';
            gctx.textAlign = 'center';
            gctx.textBaseline = 'middle';
            gctx.fillText(text, n.x, textY - 2);
          }
        }

        gctx.restore();
        gctx.restore();
      }

      function drawCosmicGrid() {
        const step = 40 * camera.zoom;
        const offsetX = (width / 2 + camera.panX) % step;
        const offsetY = (height / 2 + camera.panY) % step;

        gctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        for (let x = offsetX; x < width; x += step) {
          for (let y = offsetY; y < height; y += step) {
            gctx.fillRect(x, y, 1.2, 1.2);
          }
        }
      }

      function truncateText(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
      }

      // Main animation loop
      function loop() {
        stepPhysics();
        draw();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);

      // ========================================================
      // COORDINATE CONVERSIONS & HIT-TESTING
      // ========================================================
      function screenToWorld(screenX, screenY) {
        const cx = width / 2 + camera.panX;
        const cy = height / 2 + camera.panY;
        return {
          x: (screenX - cx) / camera.zoom,
          y: (screenY - cy) / camera.zoom,
        };
      }

      function findNodeAt(worldX, worldY, hitThreshold = 14) {
        let closest = null;
        let minDist = Infinity;

        for (let i = activeNodes.length - 1; i >= 0; i--) {
          const n = activeNodes[i];
          const dist = Math.hypot(n.x - worldX, n.y - worldY);
          const limit = (n.radius + hitThreshold) / Math.min(camera.zoom, 1.5);
          if (dist < limit && dist < minDist) {
            minDist = dist;
            closest = n;
          }
        }
        return closest;
      }

      // ========================================================
      // INTERACTIVE MOUSE & TOUCH EVENT HANDLERS
      // ========================================================
      let isPointerDown = false;
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let draggedNode = null;
      let initialPinchDist = 0;
      let initialPinchZoom = 1.0;

      // Mouse events
      canvas.addEventListener('mousedown', (e) => {
        isPointerDown = true;
        isDragging = false;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        dragStart = { x: mouseX, y: mouseY };

        const world = screenToWorld(mouseX, mouseY);
        draggedNode = findNodeAt(world.x, world.y);
        if (draggedNode) {
          draggedNode.isFixed = true;
          reheatSimulation(0.3);
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = screenToWorld(mouseX, mouseY);

        if (isPointerDown) {
          const dx = mouseX - dragStart.x;
          const dy = mouseY - dragStart.y;
          if (Math.hypot(dx, dy) > 4) {
            isDragging = true;
          }

          if (draggedNode) {
            draggedNode.x = world.x;
            draggedNode.y = world.y;
            reheatSimulation(0.25);
          } else if (isDragging) {
            camera.panX += dx;
            camera.panY += dy;
            dragStart = { x: mouseX, y: mouseY };
          }
        } else {
          // Hover state
          const hit = findNodeAt(world.x, world.y);
          if (hit !== hoveredNode) {
            hoveredNode = hit;
            canvas.style.cursor = hit ? 'pointer' : 'grab';
          }
        }
      });

      window.addEventListener('mouseup', () => {
        if (isPointerDown && !isDragging && draggedNode) {
          selectNode(draggedNode);
        } else if (isPointerDown && !isDragging && !draggedNode) {
          deselectNode();
        }

        if (draggedNode) {
          draggedNode.isFixed = false;
          draggedNode = null;
        }
        isPointerDown = false;
        isDragging = false;
      });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        zoomAtPoint(mouseX, mouseY, factor);
      }, { passive: false });

      // Touch events (Mobile / Telegram WebApp)
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          isPointerDown = true;
          isDragging = false;
          const rect = canvas.getBoundingClientRect();
          const touch = e.touches[0];
          const touchX = touch.clientX - rect.left;
          const touchY = touch.clientY - rect.top;
          dragStart = { x: touchX, y: touchY };

          const world = screenToWorld(touchX, touchY);
          draggedNode = findNodeAt(world.x, world.y, 22);
          if (draggedNode) {
            draggedNode.isFixed = true;
            reheatSimulation(0.3);
          }
        } else if (e.touches.length === 2) {
          // Pinch zoom
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          initialPinchZoom = camera.zoom;
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();

        if (e.touches.length === 1 && isPointerDown) {
          const touch = e.touches[0];
          const touchX = touch.clientX - rect.left;
          const touchY = touch.clientY - rect.top;
          const dx = touchX - dragStart.x;
          const dy = touchY - dragStart.y;

          if (Math.hypot(dx, dy) > 5) {
            isDragging = true;
          }

          const world = screenToWorld(touchX, touchY);
          if (draggedNode) {
            draggedNode.x = world.x;
            draggedNode.y = world.y;
            reheatSimulation(0.25);
          } else if (isDragging) {
            camera.panX += dx;
            camera.panY += dy;
            dragStart = { x: touchX, y: touchY };
          }
        } else if (e.touches.length === 2) {
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          if (initialPinchDist > 0) {
            const factor = currentDist / initialPinchDist;
            const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
            const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
            setZoom(initialPinchZoom * factor, midX, midY);
          }
        }
      }, { passive: false });

      canvas.addEventListener('touchend', (e) => {
        if (isPointerDown && !isDragging && draggedNode) {
          selectNode(draggedNode);
        } else if (isPointerDown && !isDragging && !draggedNode && e.touches.length === 0) {
          deselectNode();
        }

        if (draggedNode) {
          draggedNode.isFixed = false;
          draggedNode = null;
        }
        isPointerDown = false;
        isDragging = false;
        initialPinchDist = 0;
      });

      function zoomAtPoint(pointX, pointY, factor) {
        const targetZoom = Math.min(Math.max(camera.zoom * factor, 0.35), 3.5);
        setZoom(targetZoom, pointX, pointY);
      }

      function setZoom(newZoom, centerX = width / 2, centerY = height / 2) {
        const clamped = Math.min(Math.max(newZoom, 0.35), 3.5);
        const ratio = clamped / camera.zoom;
        camera.panX = centerX - width / 2 - (centerX - width / 2 - camera.panX) * ratio;
        camera.panY = centerY - height / 2 - (centerY - height / 2 - camera.panY) * ratio;
        camera.zoom = clamped;
        reheatSimulation(0.1);
      }

      // ========================================================
      // GLOBAL CAMERA & SIMULATION CONTROLS (EXPOSED TO WINDOW)
      // ========================================================
      window.zoomInCanvas = function() {
        triggerHaptic('light');
        zoomAtPoint(width / 2, height / 2, 1.25);
      };

      window.zoomOutCanvas = function() {
        triggerHaptic('light');
        zoomAtPoint(width / 2, height / 2, 0.8);
      };

      window.resetCanvasView = function() {
        triggerHaptic('light');
        camera.panX = 0;
        camera.panY = 0;
        camera.zoom = 1.0;
        reheatSimulation(0.4);
      };

      window.togglePhysicsPause = function() {
        triggerHaptic('light');
        isPaused = !isPaused;
        const btn = document.getElementById('pausePhysicsBtn');
        const status = document.getElementById('canvasStatusText');
        if (btn) btn.innerText = isPaused ? '▶️ Resume' : '❄️ Freeze';
        if (status) status.innerText = isPaused ? 'Physics Paused' : 'Physics Active';
        if (!isPaused) reheatSimulation(0.4);
      };

      // ========================================================
      // NODE SELECTION & INTERACTIVE INSPECTOR
      // ========================================================
      function selectNode(node) {
        triggerHaptic('medium');
        selectedNode = node;
        reheatSimulation(0.25);
        renderInspector(node);
      }

      window.selectNodeById = function(id) {
        const n = nodeMap.get(id);
        if (n) {
          selectNode(n);
          // Smoothly pan camera towards node
          camera.panX = -n.x * camera.zoom;
          camera.panY = -n.y * camera.zoom;
        }
      };

      function deselectNode() {
        selectedNode = null;
        reheatSimulation(0.1);
        renderInspector(null);
      }

      window.deselectNode = deselectNode;

      function renderInspector(node) {
        const inspector = document.getElementById('nodeInspector');
        if (!inspector) return;

        if (!node) {
          // If a cluster is active, show cluster overview
          if (activeCluster !== 'all') {
            const cluster = (graphData.clusters || []).find((c) => c.id === activeCluster);
            if (cluster) {
              const tagsHtml = (cluster.topTags || []).map((t) => 
                '<span class="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">#' + escapeClientHtml(t) + '</span>'
              ).join('');

              const masterSynthesisHtml = cluster.masterSynthesis ? [
                '<div class="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-cyan-200 text-xs flex flex-col gap-1">',
                  '<span class="text-[10px] font-bold uppercase tracking-wider text-cyan-400">🧠 Cluster Master Synthesis</span>',
                  '<p class="leading-relaxed font-sans">' + escapeClientHtml(cluster.masterSynthesis) + '</p>',
                '</div>'
              ].join('') : '';

              inspector.innerHTML = [
                '<div class="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">',
                  '<div class="flex items-center gap-2 flex-wrap">',
                    '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">',
                      'Cluster Overview',
                    '</span>',
                    '<span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">',
                      (cluster.totalReels || cluster.nodeIds.length) + ' Cataloged Reels',
                    '</span>',
                  '</div>',
                  '<button onclick="setClusterFilter(\'all\')" class="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition">',
                    'Show All &rarr;',
                  '</button>',
                '</div>',
                '<div class="flex flex-col gap-2.5 mt-1">',
                  '<h3 class="text-sm font-bold text-white">' + escapeClientHtml(cluster.label) + '</h3>',
                  '<p class="text-xs text-zinc-400 font-mono">' + escapeClientHtml(cluster.coreTheme) + '</p>',
                  masterSynthesisHtml,
                  '<div class="flex flex-wrap gap-1 pt-1">' + tagsHtml + '</div>',
                  '<div class="text-[11px] text-zinc-500 font-mono pt-1 text-center">',
                    'Tap any node in this sub-constellation to stream video or extract heuristics',
                  '</div>',
                '</div>'
              ].join('');
              return;
            }
          }

          // Default constellation overview
          inspector.innerHTML = [
            '<div class="py-5 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">',
              '<span class="text-xl">✨</span>',
              '<span class="font-bold text-zinc-200">Tap Any Node or Cluster to Inspect</span>',
              '<span class="text-[11px] text-zinc-500 max-w-sm">',
                'Click concepts to see core syntheses, or select purple reel nodes to view actionable takeaways and stream directly from the Telegram Vault.',
              '</span>',
            '</div>'
          ].join('');
          return;
        }

        // Selected Node View
        const style = NODE_STYLES[node.type] || NODE_STYLES.concept;
        const neighbors = neighborMap.get(node.id);
        const neighborList = [];

        if (neighbors) {
          neighbors.forEach((relation, nId) => {
            const n = nodeMap.get(nId);
            if (n) {
              neighborList.push({ ...n, relation });
            }
          });
        }

        const tgLink = node.telegramStreamUrl || node.telegramUrl || '';

        const tagsHtml = (node.tags && node.tags.length > 0)
          ? '<div class="flex flex-wrap gap-1 pt-1">' + node.tags.map((t) => '<span class="text-[10px] font-mono text-zinc-400 bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-800">#' + escapeClientHtml(t) + '</span>').join('') + '</div>'
          : '';

        const takeawayHtml = node.actionableTakeaway ? [
          '<div class="p-3 rounded-xl bg-purple-950/25 border border-purple-800/40 text-purple-200 text-xs flex flex-col gap-1 shadow-inner">',
            '<span class="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">',
              '<span>⚡</span> Actionable Takeaway',
            '</span>',
            '<p class="leading-relaxed font-medium">\"' + escapeClientHtml(node.actionableTakeaway) + '\"</p>',
          '</div>'
        ].join('') : '';

        const descriptionHtml = (node.description && !node.actionableTakeaway) ? [
          '<div class="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-xs leading-relaxed font-sans">',
            escapeClientHtml(node.description),
          '</div>'
        ].join('') : '';

        const tgButtonHtml = tgLink ? [
          '<div class="pt-1">',
            '<button onclick="openTelegramVaultUrl(\'' + escapeClientHtml(tgLink) + '\')" class="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-98 transition">',
              '<span class="text-sm">🎬</span>',
              '<span>Watch in Telegram Vault</span>',
              '<svg class="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">',
                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />',
              '</svg>',
            '</button>',
          '</div>'
        ].join('') : [
          '<div class="text-[10px] text-zinc-500 font-mono text-center py-1">',
            'Structural Anchor • Synthesizes ' + neighborList.length + ' vault nodes',
          '</div>'
        ].join('');

        const neighborsHtml = neighborList.length === 0
          ? '<span class="text-xs text-zinc-600 italic">No direct synapses in this subgraph.</span>'
          : '<div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">' + neighborList.map((nbr) => {
              const nbrStyle = NODE_STYLES[nbr.type] || NODE_STYLES.concept;
              return '<button onclick="selectNodeById(\'' + escapeClientHtml(nbr.id) + '\')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1.5 transition active:scale-95 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300" title="' + escapeClientHtml(nbr.label) + '">' +
                '<span class="w-1.5 h-1.5 rounded-full" style="background-color: ' + nbrStyle.color + ';"></span>' +
                '<span class="truncate max-w-[140px]">' + escapeClientHtml(nbr.label) + '</span>' +
                '<span class="text-[8px] text-zinc-500 uppercase">(' + escapeClientHtml(nbr.relation) + ')</span>' +
              '</button>';
            }).join('') + '</div>';

        inspector.innerHTML = [
          '<div class="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">',
            '<div class="flex items-center gap-2 flex-wrap">',
              '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border ' + style.badgeBg + '">',
                style.label,
              '</span>',
              node.quadrant ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">' + escapeClientHtml(node.quadrant) + ' Quadrant</span>' : '',
              node.category ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800/40 text-zinc-400 border border-zinc-800">' + escapeClientHtml(node.category) + '</span>' : '',
            '</div>',
            '<button onclick="deselectNode()" class="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-zinc-800 transition" title="Close Inspector">',
              '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
            '</button>',
          '</div>',
          '<div class="flex flex-col gap-2.5 mt-1">',
            '<div class="flex flex-col gap-0.5">',
              '<h3 class="text-sm font-bold text-white leading-snug">' + escapeClientHtml(node.label) + '</h3>',
              node.author ? '<span class="text-[11px] text-zinc-400 font-mono">Curated author: <span class="text-zinc-200 font-semibold">@' + escapeClientHtml(node.author) + '</span></span>' : '',
            '</div>',
            takeawayHtml,
            descriptionHtml,
            tgButtonHtml,
            tagsHtml,
            '<div class="pt-2 border-t border-zinc-800/80 flex flex-col gap-1.5">',
              '<div class="flex items-center justify-between text-[10px] font-mono">',
                '<span class="text-zinc-400 font-bold uppercase tracking-wider">Connected Synapses (' + neighborList.length + ')</span>',
                '<span class="text-zinc-500">Tap to traverse</span>',
              '</div>',
              neighborsHtml,
            '</div>',
          '</div>'
        ].join('');

        if (window.innerWidth < 640) {
          inspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // ========================================================
      // CLUSTER FILTERING
      // ========================================================
      window.setClusterFilter = function(clusterId) {
        triggerHaptic('light');
        activeCluster = clusterId;

        // Update filter pills UI
        const pills = document.querySelectorAll('.cluster-pill');
        pills.forEach((p) => {
          if (p.getAttribute('data-cluster-id') === clusterId) {
            p.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
            p.classList.remove('bg-zinc-900/90', 'text-zinc-400', 'border-zinc-800');
          } else {
            p.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40');
            p.classList.add('bg-zinc-900/90', 'text-zinc-400', 'border-zinc-800');
          }
        });

        if (clusterId === 'all') {
          activeNodes = [...allNodes];
          activeEdges = [...allEdges];
        } else {
          const cluster = (graphData.clusters || []).find((c) => c.id === clusterId);
          if (cluster) {
            const clusterNodeIds = new Set(cluster.nodeIds);
            
            // Also include structural concept/dimension anchors connected to these cluster nodes
            const includedIds = new Set(clusterNodeIds);
            allEdges.forEach((e) => {
              if (clusterNodeIds.has(e.source) || clusterNodeIds.has(e.target)) {
                const sNode = nodeMap.get(e.source);
                const tNode = nodeMap.get(e.target);
                if (sNode && (sNode.type === 'concept' || sNode.type === 'dimension')) includedIds.add(sNode.id);
                if (tNode && (tNode.type === 'concept' || tNode.type === 'dimension')) includedIds.add(tNode.id);
              }
            });

            activeNodes = allNodes.filter((n) => includedIds.has(n.id));
            const activeIdSet = new Set(activeNodes.map((n) => n.id));
            activeEdges = allEdges.filter((e) => activeIdSet.has(e.source) && activeIdSet.has(e.target));
          }
        }

        // Update badge
        const badge = document.getElementById('graphStatsBadge');
        if (badge) {
          badge.innerText = activeNodes.length + ' Active Nodes • ' + activeEdges.length + ' Synapses';
        }

        // Reset or deselect if selected node is outside subgraph
        if (selectedNode && !activeNodes.some((n) => n.id === selectedNode.id)) {
          selectedNode = null;
        }

        // Center view on active nodes
        recenterOnNodes(activeNodes);
        renderInspector(selectedNode);
        reheatSimulation(0.6);
      };

      function recenterOnNodes(nodes) {
        if (!nodes || nodes.length === 0) return;
        let sumX = 0, sumY = 0;
        nodes.forEach((n) => { sumX += n.x; sumY += n.y; });
        const avgX = sumX / nodes.length;
        const avgY = sumY / nodes.length;

        camera.panX = -avgX * camera.zoom;
        camera.panY = -avgY * camera.zoom;
      }

      // ========================================================
      // SEARCH & FILTER
      // ========================================================
      window.handleGraphSearch = function(query) {
        activeSearch = (query || '').toLowerCase().trim();
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
          if (activeSearch) clearBtn.classList.remove('hidden');
          else clearBtn.classList.add('hidden');
        }

        if (activeSearch) {
          // If query exactly matches a single node, select it
          const exact = activeNodes.find((n) => n.label.toLowerCase() === activeSearch);
          if (exact) {
            selectNode(exact);
          }
        }
        reheatSimulation(0.2);
      };

      window.clearGraphSearch = function() {
        triggerHaptic('light');
        const input = document.getElementById('graphSearchInput');
        if (input) input.value = '';
        handleGraphSearch('');
      };

      // Default inspector render
      renderInspector(null);
    })();
  </script>
</body>
</html>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } catch (error) {
    console.error("Dashboard Handler Exception:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dashboard Error</title>
  <style>
    body { font-family: sans-serif; background: #09090b; color: #f43f5e; padding: 2rem; text-align: center; }
  </style>
</head>
<body>
  <h2>The Fabric HUD Encountered an Issue</h2>
  <p style="color: #a1a1aa;">Failed to load visual telemetry. Please try again shortly.</p>
</body>
</html>`);
  }
}
