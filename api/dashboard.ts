import type { IncomingMessage, ServerResponse } from "http";
import { getUserState, getRecentTrades, getUserGoals, GoalItem } from "../src/db/firestore.js";
import { BUILTIN_PLUGINS } from "../src/plugins/catalog.js";
import type { UserState, Trade } from "../src/db/types.js";

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

    if (userId) {
      try {
        const [stateRes, tradesRes, goalsRes] = await Promise.allSettled([
          getUserState(userId),
          getRecentTrades(userId, 10),
          getUserGoals(userId),
        ]);
        if (stateRes.status === "fulfilled") userState = stateRes.value;
        if (tradesRes.status === "fulfilled") recentTrades = tradesRes.value;
        if (goalsRes.status === "fulfilled") goals = goalsRes.value;
      } catch (err) {
        console.error("Error fetching user data from Firestore:", err);
      }
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

    const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>The Fabric HUD — 4F Meta-OS</title>
  
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
      padding-bottom: env(safe-area-inset-bottom, 24px);
      padding-top: env(safe-area-inset-top, 12px);
    }
    
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    .glass-card {
      background: rgba(18, 18, 23, 0.75);
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
  </style>
</head>
<body class="min-h-screen px-4 py-3 sm:px-6 sm:py-6 max-w-2xl mx-auto flex flex-col gap-5">

  <!-- HEADER -->
  <header class="flex flex-col gap-3 pt-2">
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
            <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">v2.0</span>
          </h1>
          <p class="text-xs text-zinc-400">4F Meta-OS Real-Time Telemetry & Agent Mesh</p>
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
        <span class="text-[11px] text-zinc-400 mt-0.5">Crystallized artifacts</span>
      </div>
    </div>

    <!-- FUNDS -->
    <div class="glass-card glow-emerald rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
      <div class="absolute -right-3 -top-3 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Funds P&L</span>
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
          const { label, color } = getMeanLabel(val);
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
                const energyColor = isPositive
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
                      <span class="text-[10px] font-mono px-2 py-0.5 rounded border ${energyColor}">
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
          <span>🎁</span> Reward Bank & Validation Gates
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

  <!-- FOOTER -->
  <footer class="text-center py-4 text-[11px] text-zinc-600 font-mono flex flex-col gap-1 items-center">
    <span>The Fabric: 4F Meta-OS • Personal Telemetry Engine</span>
    <span class="text-zinc-700">Powered by Gemini & Telegram WebApp Platform</span>
  </footer>

  <script>
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

      // If no userId was in query string, auto-redirect if Telegram provides it!
      const currentUrl = new URL(window.location.href);
      if (!currentUrl.searchParams.get('userId') && tg.initDataUnsafe?.user?.id) {
        currentUrl.searchParams.set('userId', tg.initDataUnsafe.user.id.toString());
        window.location.replace(currentUrl.toString());
      }
    }

    function triggerHaptic() {
      try {
        tg?.HapticFeedback?.impactOccurred('light');
      } catch (e) {}
    }

    function refreshDashboard() {
      triggerHaptic();
      window.location.reload();
    }

    function closeTelegramApp() {
      triggerHaptic();
      tg?.close();
    }

    // Chart.js Radar Chart
    const ctx = document.getElementById('radarChart')?.getContext('2d');
    if (ctx) {
      const radarLabels = ${JSON.stringify(Object.keys(radarData))};
      const rawValues = ${JSON.stringify(Object.values(radarData))};
      
      // Shift -5..+5 scale to 0..10 for smooth circular rendering (5 is Golden Mean center)
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
            legend: {
              display: false,
            },
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
              ticks: {
                display: false,
                stepSize: 2.5,
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.08)',
              },
              angleLines: {
                color: 'rgba(255, 255, 255, 0.12)',
              },
              pointLabels: {
                color: '#e4e4e7',
                font: {
                  size: 11,
                  weight: '600',
                  family: "'Plus Jakarta Sans', sans-serif"
                }
              }
            }
          }
        }
      });
    }
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
