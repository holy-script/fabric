import type { IncomingMessage, ServerResponse } from "http";
import { getUserState, getRecentTrades, getUserGoals, GoalItem } from "../src/db/firestore.js";
import { BUILTIN_PLUGINS } from "../src/plugins/catalog.js";
import type { UserState, Trade } from "../src/db/types.js";
import { getGraphSummary, type GraphSummaryData } from "../src/graph/query.js";
import { getAllDomains } from "../src/domains/manager.js";
import { STARTER_DOMAINS } from "../src/domains/catalog.js";
import type { DomainDefinition } from "../src/domains/types.js";
import { getDeviceBattery } from "../src/services/telemetry-adb.js";
import { getLatestBiometrics } from "../src/services/wearables.js";

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

function getMeanLabel(score: number): { label: string; color: string; hex: string; category: "mean" | "drift" | "imbalance" } {
  if (score === 0) {
    return { label: "Golden Mean (0)", color: "text-emerald-400", hex: "#10b981", category: "mean" };
  }
  if (Math.abs(score) <= 2) {
    const sign = score > 0 ? `+${score}` : `${score}`;
    return { label: `Mild Drift (${sign})`, color: "text-amber-400", hex: "#f59e0b", category: "drift" };
  }
  const sign = score > 0 ? `+${score}` : `${score}`;
  const excessOrDeficit = score > 0 ? "Excess" : "Deficiency";
  return { label: `${excessOrDeficit} (${sign})`, color: "text-rose-400", hex: "#f43f5e", category: "imbalance" };
}

function getPillarTheme(pillar: string): { badge: string; border: string; text: string; dot: string } {
  switch (pillar) {
    case "Capital & Wealth":
      return { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", border: "border-emerald-500/40", text: "text-emerald-400", dot: "bg-emerald-400" };
    case "Vitality & Biological Architecture":
      return { badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", border: "border-cyan-500/40", text: "text-cyan-400", dot: "bg-cyan-400" };
    case "Craft & Intellectual Depth":
      return { badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30", border: "border-indigo-500/40", text: "text-indigo-400", dot: "bg-indigo-400" };
    case "Creative Forge & Expressionism":
      return { badge: "bg-purple-500/10 text-purple-400 border-purple-500/30", border: "border-purple-500/40", text: "text-purple-400", dot: "bg-purple-400" };
    case "Nervous System & Ambient I/O":
      return { badge: "bg-amber-500/10 text-amber-400 border-amber-500/30", border: "border-amber-500/40", text: "text-amber-400", dot: "bg-amber-400" };
    default:
      return { badge: "bg-zinc-800 text-zinc-300 border-zinc-700", border: "border-zinc-700", text: "text-zinc-300", dot: "bg-zinc-400" };
  }
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
    let activeDomains: DomainDefinition[] = [];
    let benchDomains: DomainDefinition[] = [];
    let liveBattery: any = null;
    let latestBiometrics: any = null;

    // Parallel multi-source fetch
    const [stateRes, tradesRes, goalsRes, graphRes, domainsRes, batteryRes, bioRes] = await Promise.allSettled([
      userId ? getUserState(userId) : Promise.resolve(null),
      userId ? getRecentTrades(userId, 10) : Promise.resolve([]),
      userId ? getUserGoals(userId) : Promise.resolve([]),
      getGraphSummary(),
      userId ? getAllDomains(userId) : Promise.resolve(null),
      getDeviceBattery().catch(() => null),
      userId ? getLatestBiometrics(userId).catch(() => null) : Promise.resolve(null),
    ]);

    if (stateRes.status === "fulfilled" && stateRes.value) userState = stateRes.value;
    if (tradesRes.status === "fulfilled" && tradesRes.value) recentTrades = tradesRes.value;
    if (goalsRes.status === "fulfilled" && goalsRes.value) goals = goalsRes.value;
    if (batteryRes.status === "fulfilled" && batteryRes.value) liveBattery = batteryRes.value;
    if (bioRes.status === "fulfilled" && bioRes.value) latestBiometrics = bioRes.value;

    if (graphRes.status === "fulfilled" && graphRes.value) {
      graphSummary = graphRes.value;
    } else {
      graphSummary = {
        nodes: [
          { id: "dim_focus", type: "dimension", label: "Focus (Time & Attention)", description: "Deliberate attention, flow states, distraction reduction.", weight: 100, quadrant: "Focus", category: "core", tags: ["focus", "time"], actionableTakeaway: "Protect uninterrupted attentional blocks.", notionUrl: "https://app.notion.com/p/Deep-Work-Focus-Protocol" },
          { id: "dim_facts", type: "dimension", label: "Facts (Systems & Tools)", description: "Concrete knowledge, AI architectures, hardware.", weight: 100, quadrant: "Facts", category: "core", tags: ["facts", "tools"], actionableTakeaway: "Systematize knowledge into executable patterns.", notionUrl: "https://app.notion.com/p/Facts-and-Knowledge-Architecture" },
          { id: "dim_funds", type: "dimension", label: "Funds (Vitality & Capital)", description: "Physical vitality, biomechanics, capital allocation.", weight: 100, quadrant: "Funds", category: "core", tags: ["funds", "vitality"], actionableTakeaway: "Cultivate asymmetric financial and physical leverage.", notionUrl: "https://app.notion.com/p/Funds-and-Vitality-Reserve" },
          { id: "dim_feedback", type: "dimension", label: "Feedback (Psychology & Balance)", description: "Interpersonal mirrors, psychological integration.", weight: 100, quadrant: "Feedback", category: "core", tags: ["feedback", "psychology"], actionableTakeaway: "Align extremes towards the golden mean.", notionUrl: "https://app.notion.com/p/Psychological-Feedback-and-Equilibrium" },
          { id: "reel_sample_dopamine", type: "reel", label: "Circadian Dopamine Reset", description: "Shielding early-morning prefrontal bandwidth from passive feeds.", weight: 85, quadrant: "Feedback", category: "reel", tags: ["dopamine", "circadian", "vitality"], actionableTakeaway: "Zero high-dopamine inputs before first 90-minute focus block.", telegramStreamUrl: "https://t.me/c/4325133626/3", notionUrl: "https://app.notion.com/p/Dopamine-Circuits" }
        ],
        edges: [],
        clusters: [],
        metadata: { totalNodes: 5, totalEdges: 0, clustersCount: 0, builtAt: new Date().toISOString() },
      };
    }

    // Default fallback state if uninitialized
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

    // Process Domains
    if (domainsRes.status === "fulfilled" && domainsRes.value) {
      activeDomains = domainsRes.value.active;
      benchDomains = domainsRes.value.bench;
    } else {
      // Fallback starter domain distribution
      const fallbackList = Object.values(STARTER_DOMAINS);
      activeDomains = fallbackList.filter((d) => d.status === "active");
      benchDomains = fallbackList.filter((d) => d.status === "bench");
    }

    // Ensure dedicated starter commands are present
    const ensureCommands = (d: DomainDefinition): DomainDefinition => {
      const copy = { ...d };
      if (!copy.suggestedCommands || copy.suggestedCommands.length === 0) {
        if (copy.id === "goldbees-etf") copy.suggestedCommands = ["/gold"];
        else if (copy.id === "explainable-dsa") copy.suggestedCommands = ["/dsa"];
        else if (copy.id === "sidequest-lab") copy.suggestedCommands = ["/sidequest"];
        else if (copy.id === "metabolic-nutrition" || copy.id === "somatic-grooming") copy.suggestedCommands = ["/vitality"];
        else if (copy.id === "comfyui-generative") copy.suggestedCommands = ["/comfy"];
        else if (copy.id === "airtel-gsm") copy.suggestedCommands = ["/sms", "/phone"];
        else if (copy.id === "monotropic-flow") copy.suggestedCommands = ["/spark"];
      }
      return copy;
    };

    activeDomains = activeDomains.map(ensureCommands);
    benchDomains = benchDomains.map(ensureCommands);

    // If FOCI bio-respiration domain is not in list, add it to bench
    if (!activeDomains.some(d => d.id.includes("foci")) && !benchDomains.some(d => d.id.includes("foci"))) {
      benchDomains.push({
        id: "foci-bio-respiration",
        name: "FOCI Bio-Respiration & Neurometrics",
        pillar: "Vitality & Biological Architecture",
        status: "bench",
        icon: "🫁",
        description: "Real-time respiratory rhythm tracking, cognitive flow detection, and autonomic nervous system equilibrium coaching.",
        tags: ["foci", "respiration", "neurometrics", "flow", "hrv", "vitality"],
        suggestedCommands: ["/foci", "/vitality"],
      });
    }

    // 5-7 active mounted slots representation
    const MAX_MOUNT_SLOTS = 7;
    const mountedSlots = Array.from({ length: MAX_MOUNT_SLOTS }, (_, idx) => {
      return activeDomains[idx] || null;
    });

    // Biometric & Vitality Telemetry Data
    const batteryInfo = liveBattery ? {
      level: Math.round(liveBattery.level),
      status: liveBattery.charging ? "Charging (USB/AC)" : (liveBattery.status || "Discharging"),
      temperature: liveBattery.temperature ? `${liveBattery.temperature}°C` : "29.4°C",
      voltage: liveBattery.voltage ? `${(liveBattery.voltage / 1000).toFixed(2)}V` : "4.15V",
      charging: Boolean(liveBattery.charging),
      isLive: true,
      source: "Android ADB Telemetry",
    } : {
      level: 92,
      status: "Discharging (Equilibrium)",
      temperature: "28.5°C",
      voltage: "4.12V",
      charging: false,
      isLive: false,
      source: "Lithium Polymer Calibrated Reserve",
    };

    const recoveryScore = latestBiometrics?.recovery?.score
      ? latestBiometrics.recovery.score
      : Math.min(98, Math.max(55, 87 + Math.round((state.averageEnergyDelta || 0) * 2.5)));

    const hrvValue = latestBiometrics?.hrv?.value || 74;
    const hrvStatus = hrvValue >= 70 ? "Optimal • Parasympathetic Surge" : hrvValue >= 55 ? "Balanced Baseline" : "Sympathetic Load";

    const sleepScore = latestBiometrics?.sleep?.efficiencyPercent || 89;
    const sleepDuration = latestBiometrics?.sleep?.totalHours ? `${latestBiometrics.sleep.totalHours}h` : "7h 42m";
    const deepSleep = latestBiometrics?.sleep?.deepSleepHours ? `${latestBiometrics.sleep.deepSleepHours}h` : "1h 38m (21%)";
    const remSleep = latestBiometrics?.sleep?.remSleepHours ? `${latestBiometrics.sleep.remSleepHours}h` : "1h 55m (25%)";

    const fociState = {
      respirationRate: latestBiometrics?.respirationRate || 13.5,
      state: "Flow",
      fluidity: 95,
      streakMinutes: 48,
      guidance: "Coherent sinusoidal rhythm detected. Autonomic nervous system balanced for deep cognitive focus.",
    };

    // Aristotelian 10-Dimension Definitions & Values
    const aristotelian10 = [
      {
        key: "prioritization",
        label: "Prioritization",
        icon: "🎯",
        score: state.goldenMeans?.prioritization ?? 0,
        desc: "Ruthlessly filtering signal from noise; executing top needle-moving missions first.",
        excess: "Hyper-fixated tunnel vision; refusing any adaptation or pivots.",
        deficit: "Scattered reactivity; context-switching on every ping.",
      },
      {
        key: "documentation",
        label: "Documentation",
        icon: "📝",
        score: state.goldenMeans?.documentation ?? 0,
        desc: "Executable architectural memos, loop invariants, and durable knowledge captures.",
        excess: "Architecture astronautics; endless documentation without shipping code.",
        deficit: "Tribal knowledge oblivion; zero notes, repeated mistakes.",
      },
      {
        key: "waysToWork",
        label: "Ways to Work",
        icon: "⚙️",
        score: state.goldenMeans?.waysToWork ?? 0,
        desc: "Monotropic single-task flow paired with intentional asynchronous rituals.",
        excess: "Productivity theatre; constantly tweaking configs instead of executing.",
        deficit: "Brute-force burnout; working without systems or leverage.",
      },
      {
        key: "timeManagement",
        label: "Time Management",
        icon: "⏱️",
        score: state.goldenMeans?.timeManagement ?? 0,
        desc: "Deliberate timeboxing with high-agency slack preserved for serendipity.",
        excess: "Hyper-scheduled neurosis; every minute blocked, zero cognitive slack.",
        deficit: "Procrastination drift; amorphous hours leaking into low-value browsing.",
      },
      {
        key: "variety",
        label: "Variety",
        icon: "🔀",
        score: state.goldenMeans?.variety ?? 0,
        desc: "Polymathic cross-pollination across algorithmic code, philosophy, art & biology.",
        excess: "ADHD rabbit-hole hopping; 15 half-started builds, nothing shipped.",
        deficit: "Monomaniacal desk lock; cognitive rigidity and physical stagnation.",
      },
      {
        key: "goalsAndRewards",
        label: "Goals & Rewards",
        icon: "🎁",
        score: state.goldenMeans?.goalsAndRewards ?? 0,
        desc: "Gated dopamine release strictly unlocked through verified milestone proofs.",
        excess: "Dopamine austerity; never celebrating milestones, chronic anhedonia.",
        deficit: "Ungated cheap dopamine; scrolling before completing morning execution.",
      },
      {
        key: "portfolioGrowth",
        label: "Portfolio Growth",
        icon: "📈",
        score: state.goldenMeans?.portfolioGrowth ?? 0,
        desc: "Shipping public, compoundable artifacts, open-source repos, and assets.",
        excess: "Vanity broadcasting; tweeting and marketing unverified vaporware.",
        deficit: "Stealth hoarding; brilliant builds locked in private repos.",
      },
      {
        key: "skillHorizon",
        label: "Skill Horizon",
        icon: "🔭",
        score: state.goldenMeans?.skillHorizon ?? 0,
        desc: "Active boundary expansion; mastering 1 novel hard primitive (DSA, ML, WebGPU) weekly.",
        excess: "Tutorial purgatory; watching endless lectures without building.",
        deficit: "Stale comfort zone; repeating the same safe year of experience.",
      },
      {
        key: "rapidPrototyping",
        label: "Rapid Prototyping",
        icon: "⚡",
        score: state.goldenMeans?.rapidPrototyping ?? 0,
        desc: "0-to-1 bias for action; working code and clickable prototypes running in hours.",
        excess: "Abandoned tech debt pileups; duct-taped builds discarded before stability.",
        deficit: "Analysis paralysis; weeks of debate without writing a single line of code.",
      },
      {
        key: "expressionism",
        label: "Expressionism",
        icon: "🎨",
        score: state.goldenMeans?.expressionism ?? 0,
        desc: "Bold cinematic aesthetic signature, typographic polish, and authentic voice.",
        excess: "Self-indulgent aesthetic escapism; style over core function.",
        deficit: "Sterile utilitarianism; lifeless, joyless mechanical output.",
      },
    ];

    // Aristotelian data mapped to 5 key virtues for Tab 1 summary
    const radarData = {
      Logic: state.goldenMeans?.documentation ?? 0,
      Vitality: state.goldenMeans?.vitality ?? 0,
      Art: state.goldenMeans?.expressionism ?? 0,
      Variety: state.goldenMeans?.variety ?? 0,
      Prioritization: state.goldenMeans?.prioritization ?? 0,
    };

    const lockedGoals = goals.filter((g) => !g.isUnlocked);
    const unlockedGoals = goals.filter((g) => g.isUnlocked);

    // Serialize payloads safely
    const serializedGraph = JSON.stringify(graphSummary).replace(/<\/script/gi, "<\\/script");
    const serializedAristotle10 = JSON.stringify(aristotelian10).replace(/<\/script/gi, "<\\/script");

    const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>The Fabric HUD — 4F Meta-OS &amp; Domain Workbench</title>
  
  <!-- Telegram WebApp SDK -->
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Chart.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <script>
    if (typeof tailwind !== 'undefined') {
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
    }
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
      margin: 0;
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

    .glow-rose {
      box-shadow: 0 0 20px -5px rgba(244, 63, 94, 0.25);
    }

    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
    .no-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    /* Subtle custom scrollbar */
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

    canvas#graphCanvas, canvas#fociCanvas {
      touch-action: none;
    }

    /* Radar vertex animation */
    .radar-vertex {
      transition: r 0.2s ease, filter 0.2s ease;
      cursor: pointer;
    }
    .radar-vertex:hover {
      r: 7;
      filter: drop-shadow(0 0 8px currentColor);
    }

    /* Toast Notification */
    #dashboardToast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 9999;
      pointer-events: none;
    }
    #dashboardToast.toast-show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body class="min-h-screen px-4 py-3 sm:px-6 sm:py-6 max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto flex flex-col gap-4">

  <!-- HEADER -->
  <header class="flex flex-col gap-3 pt-1">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            The Fabric HUD
            <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">v2.5</span>
          </h1>
          <p class="text-xs text-zinc-400">4F Meta-OS • Domain Workbench, Bio &amp; Knowledge Mesh</p>
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
        <span>Mesh: <span class="text-cyan-400">Active</span></span>
        <span class="text-zinc-600">•</span>
        <span>Slots: <span class="text-emerald-400">${activeDomains.length}/${MAX_MOUNT_SLOTS}</span></span>
        <span class="text-zinc-600">•</span>
        <span>Nodes: <span class="text-purple-400">${graphSummary.metadata.totalNodes || 3880}</span></span>
      </div>
    </div>
  </header>

  <!-- TAB NAVIGATION SWITCHER (3 TABS) -->
  <nav class="flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg text-xs font-bold">
    <!-- TAB 1: 4F HUD -->
    <button id="navTabHud" onclick="switchMainTab('hud')" class="flex-1 py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-zinc-800 text-cyan-400 shadow-md border border-cyan-500/30">
      <span class="text-sm">📊</span>
      <span class="truncate">4F Telemetry</span>
    </button>

    <!-- TAB 2: DOMAIN WORKBENCH & BIO -->
    <button id="navTabWorkbench" onclick="switchMainTab('workbench')" class="flex-1 py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 text-zinc-400 hover:text-zinc-200 border border-transparent">
      <span class="text-sm">🎛️</span>
      <span class="truncate">Workbench &amp; Bio</span>
      <span class="hidden sm:inline-block text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">New</span>
    </button>

    <!-- TAB 3: KNOWLEDGE GRAPH & VAULT -->
    <button id="navTabGraph" onclick="switchMainTab('graph')" class="flex-1 py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 text-zinc-400 hover:text-zinc-200 border border-transparent">
      <span class="text-sm">🕸️</span>
      <span class="truncate">Vault Mesh</span>
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

    <!-- ARISTOTELIAN OVERVIEW SUMMARY RADAR -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
            <span>⚖️</span> Aristotelian Equilibrium Radar
          </h2>
          <p class="text-[11px] text-zinc-400">Dynamic virtue calibration across core operating axes (Scale: -5 to +5)</p>
        </div>
        <button onclick="switchMainTab('workbench')" class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 transition">
          Full 10D Radar &rarr;
        </button>
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

  <!-- ============================================================== -->
  <!-- TAB 2: DOMAIN WORKBENCH & BIO SECTION (NEW 3RD TAB)             -->
  <!-- ============================================================== -->
  <main id="tabContentWorkbench" class="flex flex-col gap-4 hidden">
    
    <!-- QUICK COMMAND LAUNCHER BAR -->
    <section class="glass-card rounded-2xl p-3.5 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="text-xs">⚡</span>
          <span class="text-xs font-bold text-zinc-200 uppercase tracking-wider">Suggested Domain Commands</span>
        </div>
        <span class="text-[10px] font-mono text-zinc-500">Tap to copy / execute</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${[
          { cmd: "/gold", label: "GOLDBEES", icon: "🪙", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
          { cmd: "/dsa", label: "DSA Foundry", icon: "🧩", color: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
          { cmd: "/sidequest", label: "Sidequest", icon: "🎲", color: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
          { cmd: "/vitality", label: "Vitality Bio", icon: "🥗", color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
          { cmd: "/comfy", label: "ComfyUI Gen", icon: "🎨", color: "bg-pink-500/10 text-pink-300 border-pink-500/30" },
          { cmd: "/foci", label: "FOCI Neurometrics", icon: "🫁", color: "bg-teal-500/10 text-teal-300 border-teal-500/30" },
          { cmd: "/sms", label: "Airtel SMS", icon: "📱", color: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
          { cmd: "/phone", label: "Android DND/ADB", icon: "📲", color: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
        ].map(item => `
          <button onclick="copyCommand('${item.cmd}')" class="px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium flex items-center gap-1.5 border transition active:scale-95 ${item.color} hover:brightness-125">
            <span>${item.icon}</span>
            <span class="font-bold text-white">${item.cmd}</span>
            <span class="text-[10px] opacity-75">${item.label}</span>
          </button>
        `).join("")}
      </div>
    </section>

    <!-- REAL-TIME BIOMETRIC HEALTH & VITALITY CARD -->
    <section class="glass-card glow-cyan rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 text-sm">
            🧬
          </div>
          <div>
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              Biometric Health &amp; Vitality Telemetry
              <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${batteryInfo.isLive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'}">
                ${batteryInfo.isLive ? 'Live ADB Mesh' : 'Calibrated Baseline'}
              </span>
            </h2>
            <p class="text-[11px] text-zinc-400">Continuous CNS recovery, autonomic balance, sleep stages &amp; respiratory pacing</p>
          </div>
        </div>
        <span class="text-xs text-cyan-400 font-mono font-bold">${recoveryScore}% Ready</span>
      </div>

      <!-- Biometric Quadrant Metrics -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        
        <!-- 1. Recovery Gauge -->
        <div class="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>RECOVERY</span>
            <span>⚡</span>
          </div>
          <div class="my-1.5">
            <span class="text-2xl font-black text-white font-mono">${recoveryScore}%</span>
            <div class="w-full bg-zinc-800 rounded-full h-1.5 mt-1 overflow-hidden">
              <div class="bg-gradient-to-r from-teal-500 to-emerald-400 h-1.5 rounded-full" style="width: ${recoveryScore}%"></div>
            </div>
          </div>
          <span class="text-[10px] text-emerald-400 font-medium">Optimal Parasympathetic</span>
        </div>

        <!-- 2. Battery & Hardware Telemetry -->
        <div class="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>BATTERY CELL</span>
            <span>🔋</span>
          </div>
          <div class="my-1.5">
            <span class="text-2xl font-black text-white font-mono">${batteryInfo.level}%</span>
            <div class="w-full bg-zinc-800 rounded-full h-1.5 mt-1 overflow-hidden">
              <div class="h-1.5 rounded-full ${batteryInfo.level > 50 ? 'bg-emerald-400' : 'bg-amber-400'}" style="width: ${batteryInfo.level}%"></div>
            </div>
          </div>
          <span class="text-[10px] text-zinc-400 font-mono truncate" title="${batteryInfo.temperature} • ${batteryInfo.status}">
            ${batteryInfo.temperature} • ${batteryInfo.status}
          </span>
        </div>

        <!-- 3. HRV Score -->
        <div class="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>HRV (rMSSD)</span>
            <span>❤️</span>
          </div>
          <div class="my-1.5">
            <span class="text-2xl font-black text-white font-mono">${hrvValue}<span class="text-xs font-normal text-zinc-400 ml-1">ms</span></span>
            <span class="text-[10px] text-purple-400 block font-mono">Baseline: 66-82 ms</span>
          </div>
          <span class="text-[10px] text-purple-300 font-medium truncate">${hrvStatus}</span>
        </div>

        <!-- 4. Sleep Score -->
        <div class="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>SLEEP SCORE</span>
            <span>🌙</span>
          </div>
          <div class="my-1.5">
            <span class="text-2xl font-black text-white font-mono">${sleepScore}<span class="text-xs font-normal text-zinc-400 ml-0.5">/100</span></span>
            <span class="text-[10px] text-zinc-400 block font-mono">${sleepDuration} total</span>
          </div>
          <span class="text-[10px] text-cyan-300 font-medium truncate">Deep: ${deepSleep}</span>
        </div>

      </div>

      <!-- FOCI Respiration State & Real-Time Wave Visualizer -->
      <div class="bg-zinc-900/90 rounded-xl p-3 border border-zinc-800 flex flex-col gap-2">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span class="text-xs font-bold text-white font-mono">FOCI Respiration State: <span class="text-cyan-400 uppercase">${fociState.state}</span></span>
            <span class="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
              ${fociState.respirationRate} bpm
            </span>
          </div>
          <div class="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
            <span>Fluidity: <strong class="text-emerald-400">${fociState.fluidity}%</strong></span>
            <span>•</span>
            <span>Pacing Streak: <strong class="text-purple-300">${fociState.streakMinutes}m</strong></span>
          </div>
        </div>

        <!-- 60FPS Canvas Breathing Wave -->
        <div class="w-full h-14 bg-zinc-950/80 rounded-lg overflow-hidden border border-zinc-800/80 relative">
          <canvas id="fociCanvas" class="w-full h-full block"></canvas>
          <div class="absolute right-2.5 top-1.5 text-[9px] font-mono text-cyan-400/80 uppercase tracking-widest pointer-events-none" id="fociPhaseText">
            Inhale Expansion
          </div>
        </div>
        <p class="text-[11px] text-zinc-400 font-mono leading-relaxed">${fociState.guidance}</p>
      </div>
    </section>

    <!-- INTERACTIVE 10-DIMENSION ARISTOTELIAN EQUILIBRIUM RADAR -->
    <section class="glass-card glow-purple rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
            <span>⚖️</span> 10-Dimension Aristotelian Equilibrium Radar
          </h2>
          <p class="text-[11px] text-zinc-400">Virtue calibration across all 10 operating dimensions (-5 to +5 scale)</p>
        </div>
        <div class="flex items-center gap-1.5 font-mono text-[10px]">
          <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">0 = Golden Mean</span>
          <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">±1..2 Drift</span>
          <span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">±3..5 Imbalance</span>
        </div>
      </div>

      <!-- Vector SVG Radar Chart Viewport -->
      <div class="relative w-full max-w-[420px] mx-auto py-2 flex flex-col items-center">
        <svg id="aristotleSvgRadar" viewBox="0 0 460 460" class="w-full max-h-[380px] overflow-visible drop-shadow-xl select-none">
          <!-- Dynamically generated SVG elements via JS for 60fps interactivity -->
        </svg>
      </div>

      <!-- Dynamic Virtue Focus Inspector Card -->
      <div id="virtueInspectorCard" class="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 transition-all duration-200 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg" id="inspectorIcon">🎯</span>
            <div>
              <h3 class="text-xs font-bold text-white" id="inspectorTitle">Prioritization</h3>
              <span class="text-[10px] font-mono text-zinc-400" id="inspectorMeanLabel">Golden Mean (0)</span>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" id="inspectorBadge">
            Equilibrium
          </span>
        </div>
        <p class="text-[11px] text-zinc-300 leading-relaxed font-sans" id="inspectorDesc">
          Ruthlessly filtering signal from noise; executing top needle-moving missions first.
        </p>
        <div class="grid grid-cols-2 gap-2 pt-1 text-[10px] font-mono">
          <div class="bg-rose-950/20 p-2 rounded-lg border border-rose-800/30 text-rose-300">
            <strong class="block text-rose-400 uppercase text-[9px]">Excess Pathology (+)</strong>
            <span id="inspectorExcess">Hyper-fixated tunnel vision; refusing any adaptation or pivots.</span>
          </div>
          <div class="bg-amber-950/20 p-2 rounded-lg border border-amber-800/30 text-amber-300">
            <strong class="block text-amber-400 uppercase text-[9px]">Deficit Pathology (-)</strong>
            <span id="inspectorDeficit">Scattered reactivity; context-switching on every ping.</span>
          </div>
        </div>
      </div>

      <!-- 10 Dimension Selector Grid Buttons -->
      <div class="flex flex-col gap-1.5 pt-1">
        <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Tap Axis to Inspect &amp; Calibrate:</span>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
          ${aristotelian10.map((dim, idx) => {
            const meanInfo = getMeanLabel(dim.score);
            return `
              <button 
                onclick="inspectDimension(${idx})" 
                id="dimBtn_${idx}"
                class="dim-selector-btn p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 flex flex-col items-center gap-0.5 transition active:scale-95 text-left"
              >
                <div class="flex items-center gap-1.5 w-full justify-between">
                  <span class="text-xs">${dim.icon}</span>
                  <span class="text-[10px] font-mono font-bold ${meanInfo.color}">${dim.score > 0 ? "+" : ""}${dim.score}</span>
                </div>
                <span class="text-[11px] font-semibold text-zinc-200 truncate w-full mt-0.5">${dim.label}</span>
                <span class="text-[9px] ${meanInfo.color} font-mono truncate w-full">${meanInfo.category.toUpperCase()}</span>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </section>

    <!-- MOUNTED DOMAIN SLOTS (5-7 ACTIVE SLOTS VS BENCH) -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-2">
            <span>🎛️</span> Mounted Domain Slots
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              ${activeDomains.length}/${MAX_MOUNT_SLOTS} Active Bays
            </span>
          </h2>
          <p class="text-[11px] text-zinc-400">Active operating engines mounted into the 4F Meta-OS memory mesh</p>
        </div>
        <span class="text-xs text-zinc-500 font-mono">Capacity: 7 Max</span>
      </div>

      <!-- Active Mounted Slot Bays -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        ${mountedSlots.map((domain, index) => {
          if (!domain) {
            return `
              <div class="p-3.5 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 flex items-center justify-center gap-2 text-zinc-500 transition">
                <span class="text-sm">➕</span>
                <div class="flex flex-col">
                  <span class="text-xs font-mono font-semibold text-zinc-400">Slot 0${index + 1}: Empty Bay</span>
                  <span class="text-[10px] text-zinc-600">Mount a domain from the standby bench below</span>
                </div>
              </div>
            `;
          }

          const theme = getPillarTheme(domain.pillar);
          return `
            <div class="p-3.5 rounded-2xl bg-zinc-900/90 border ${theme.border} flex flex-col gap-2.5 shadow-md relative overflow-hidden">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2.5">
                  <span class="text-2xl p-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60 shadow-inner">${domain.icon}</span>
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      ${escapeHtml(domain.name)}
                      <span class="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Slot 0${index + 1}</span>
                    </span>
                    <span class="text-[10px] font-mono mt-0.5 px-2 py-0.5 rounded-full inline-block w-fit border ${theme.badge}">
                      ${escapeHtml(domain.pillar)}
                    </span>
                  </div>
                </div>
                <span class="w-2 h-2 rounded-full ${theme.dot} animate-pulse mt-1 shrink-0" title="Mounted &amp; Active"></span>
              </div>

              <p class="text-[11px] text-zinc-400 leading-relaxed font-sans">${escapeHtml(domain.description)}</p>

              <!-- Commands & Tags -->
              <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
                <div class="flex flex-wrap gap-1">
                  ${(domain.suggestedCommands || []).map(cmd => `
                    <button onclick="copyCommand('${escapeHtml(cmd)}')" class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 active:scale-95 transition" title="Click to copy command">
                      ${escapeHtml(cmd)}
                    </button>
                  `).join("")}
                </div>
                <div class="flex flex-wrap gap-1">
                  ${domain.tags.slice(0, 3).map(tag => `
                    <span class="text-[9px] font-mono text-zinc-500">#${escapeHtml(tag)}</span>
                  `).join("")}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>

    <!-- STANDBY BENCH RESERVOIR -->
    <section class="glass-card rounded-2xl p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-2">
            <span>📦</span> Standby Bench Reservoir
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              ${benchDomains.length} Benched
            </span>
          </h2>
          <p class="text-[11px] text-zinc-400">Auxiliary domains ready to swap into an active slot via Telegram <code class="text-zinc-300 bg-zinc-800 px-1 rounded">/domain</code></p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${benchDomains.map((domain) => {
          const theme = getPillarTheme(domain.pillar);
          return `
            <div class="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between gap-2 hover:border-zinc-700 transition">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-xl">${domain.icon}</span>
                  <div class="flex flex-col">
                    <span class="text-xs font-semibold text-zinc-200">${escapeHtml(domain.name)}</span>
                    <span class="text-[9px] font-mono text-zinc-500">${escapeHtml(domain.pillar)}</span>
                  </div>
                </div>
                <span class="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">Standby</span>
              </div>
              <p class="text-[10px] text-zinc-400 leading-normal line-clamp-2">${escapeHtml(domain.description)}</p>
              <div class="flex items-center justify-between gap-1 pt-1 border-t border-zinc-800/60 text-[9px] font-mono">
                <div class="flex gap-1">
                  ${(domain.suggestedCommands || []).slice(0, 2).map(cmd => `
                    <button onclick="copyCommand('${escapeHtml(cmd)}')" class="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-white transition">
                      ${escapeHtml(cmd)}
                    </button>
                  `).join("")}
                </div>
                <span class="text-zinc-500">Mount: /domain mount</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>

  </main>

  <!-- ========================================== -->
  <!-- TAB 3: KNOWLEDGE GRAPH & VAULT SECTION     -->
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
            <p class="text-[11px] text-zinc-400">Interactive force-directed neural mesh linking high-agency principles, Notion cards &amp; Telegram streaming reels</p>
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

    <!-- Force-Directed Canvas Viewport -->
    <section class="glass-card rounded-2xl overflow-hidden relative border border-zinc-800 shadow-2xl flex flex-col">
      <!-- Overlay controls -->
      <div class="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
        <div class="px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800/90 text-[10px] font-mono text-zinc-300 backdrop-blur-md shadow-md pointer-events-auto flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span id="canvasStatusText">Physics Active</span>
        </div>
      </div>

      <div class="absolute top-3 right-3 z-10 flex items-center gap-1 pointer-events-auto">
        <button onclick="zoomInCanvas()" class="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center font-mono text-sm transition active:scale-90" title="Zoom In">+</button>
        <button onclick="zoomOutCanvas()" class="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center font-mono text-sm transition active:scale-90" title="Zoom Out">-</button>
        <button onclick="resetCanvasView()" class="w-7 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center text-xs transition active:scale-90" title="Reset View &amp; Center">⊙</button>
        <button id="pausePhysicsBtn" onclick="togglePhysicsPause()" class="px-2 h-7 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 flex items-center justify-center text-[10px] font-mono transition active:scale-90" title="Pause / Resume Physics">❄️ Freeze</button>
      </div>

      <!-- HTML5 Canvas Element -->
      <div class="relative w-full h-[460px] sm:h-[520px] bg-[#0c0c11]">
        <canvas id="graphCanvas" class="w-full h-full block cursor-grab active:cursor-grabbing"></canvas>
      </div>

      <div class="px-4 py-2 bg-zinc-950/90 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
        <span>Drag to pan • Pinch/scroll to zoom • Drag node to reposition</span>
        <span class="text-zinc-400">Click node to inspect</span>
      </div>
    </section>

    <!-- INTERACTIVE NODE / CLUSTER INSPECTOR DRAWER -->
    <section id="nodeInspector" class="glass-card rounded-2xl p-4 transition-all duration-300 flex flex-col gap-3 border border-zinc-800">
      <div class="py-6 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
        <span class="text-xl">✨</span>
        <span class="font-bold text-zinc-300">Tap Any Node or Cluster to Inspect</span>
        <span class="text-[11px] text-zinc-500 max-w-sm">
          Click concepts to see core syntheses, or select purple reel nodes to view actionable heuristics and open direct links to streaming Telegram reels and Notion cards.
        </span>
      </div>
    </section>

  </main>

  <!-- ON-SCREEN TOAST NOTIFICATION -->
  <div id="dashboardToast" class="px-4 py-2 rounded-xl bg-zinc-900/95 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-medium shadow-2xl flex items-center gap-2 backdrop-blur-md">
    <span>⚡</span>
    <span id="toastMessage">Command copied to clipboard</span>
  </div>

  <!-- FOOTER -->
  <footer class="text-center py-4 text-[11px] text-zinc-600 font-mono flex flex-col gap-1 items-center">
    <span>The Fabric: 4F Meta-OS • Personal Telemetry, Domain Workbench &amp; Knowledge Vault</span>
    <span class="text-zinc-700">Autonomous Aristotelian Operating Mesh • Zero External Dependency Fallback</span>
  </footer>

  <!-- SERIALIZED DATA INJECTION -->
  <script>
    window.__GRAPH_DATA__ = ${serializedGraph};
    window.__ARISTOTLE_10__ = ${serializedAristotle10};
  </script>

  <!-- CLIENT-SIDE APPLICATION SCRIPT -->
  <script>
    function escapeClientHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Telegram WebApp SDK initialization
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#09090b');
        tg.setBackgroundColor('#09090b');
      } catch (e) {
        console.warn('Telegram SDK initialization note:', e);
      }

      const tgCloseBtn = document.getElementById('tgCloseBtn');
      if (tgCloseBtn) tgCloseBtn.classList.remove('hidden');

      // Auto-set userId if missing from query params
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

    function showToast(msg) {
      const toast = document.getElementById('dashboardToast');
      const text = document.getElementById('toastMessage');
      if (!toast || !text) return;
      text.innerText = msg;
      toast.classList.add('toast-show');
      setTimeout(() => {
        toast.classList.remove('toast-show');
      }, 2200);
    }

    function copyCommand(cmd) {
      triggerHaptic('medium');
      if (!cmd) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(() => {
          showToast('Copied "' + cmd + '" to clipboard! Run in bot.');
        }).catch(() => {
          showToast('Command: ' + cmd);
        });
      } else {
        showToast('Command: ' + cmd);
      }
    }

    function refreshDashboard() {
      triggerHaptic('medium');
      window.location.reload();
    }

    function closeTelegramApp() {
      triggerHaptic('light');
      tg?.close();
    }

    // Open Telegram Video Stream Link
    function openTelegramVaultUrl(url) {
      triggerHaptic('medium');
      if (!url) return;
      try {
        if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(url);
          return;
        }
      } catch (e) {
        console.warn("Telegram openTelegramLink failed, falling back to window.open", e);
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // Open External Notion Link
    function openExternalUrl(url) {
      triggerHaptic('light');
      if (!url) return;
      try {
        if (window.Telegram?.WebApp?.openLink) {
          window.Telegram.WebApp.openLink(url);
          return;
        }
      } catch (e) {
        console.warn("Telegram openLink failed, falling back to window.open", e);
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // ========================================================
    // TAB NAVIGATION SWITCHER (HUD vs WORKBENCH vs GRAPH)
    // ========================================================
    function switchMainTab(tab) {
      triggerHaptic('light');
      const hudContent = document.getElementById('tabContentHud');
      const workbenchContent = document.getElementById('tabContentWorkbench');
      const graphContent = document.getElementById('tabContentGraph');

      const navTabHud = document.getElementById('navTabHud');
      const navTabWorkbench = document.getElementById('navTabWorkbench');
      const navTabGraph = document.getElementById('navTabGraph');

      // Hide all tabs
      hudContent?.classList.add('hidden');
      workbenchContent?.classList.add('hidden');
      graphContent?.classList.add('hidden');

      // Reset all nav tabs
      [navTabHud, navTabWorkbench, navTabGraph].forEach(btn => {
        btn?.classList.remove('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        btn?.classList.add('text-zinc-400', 'border-transparent');
      });

      if (tab === 'workbench') {
        workbenchContent?.classList.remove('hidden');
        navTabWorkbench?.classList.add('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabWorkbench?.classList.remove('text-zinc-400', 'border-transparent');

        // Draw / Re-render 10-Dimension SVG Radar & restart FOCI loop
        setTimeout(() => {
          render10DRadarSvg();
          startFociWave();
        }, 30);

      } else if (tab === 'graph') {
        graphContent?.classList.remove('hidden');
        navTabGraph?.classList.add('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabGraph?.classList.remove('text-zinc-400', 'border-transparent');

        // Resize canvas and reheat physics
        setTimeout(() => {
          if (window.resizeGraphCanvas) window.resizeGraphCanvas();
          if (window.reheatSimulation) window.reheatSimulation(0.5);
        }, 30);

      } else {
        // default: hud
        hudContent?.classList.remove('hidden');
        navTabHud?.classList.add('bg-zinc-800', 'text-cyan-400', 'shadow-md', 'border-cyan-500/30');
        navTabHud?.classList.remove('text-zinc-400', 'border-transparent');
      }
    }

    // Auto-detect URL parameter or hash
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || window.location.hash.replace('#', '');
    if (initialTab === 'workbench' || initialTab === 'bio' || initialTab === 'domains') {
      switchMainTab('workbench');
    } else if (initialTab === 'graph') {
      switchMainTab('graph');
    }

    // ========================================================
    // TAB 1: CHART.JS OVERVIEW RADAR
    // ========================================================
    const ctx = document.getElementById('radarChart')?.getContext('2d');
    if (ctx && typeof Chart !== 'undefined') {
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
                  return ' ' + context.label + ': ' + (rawVal > 0 ? '+' : '') + rawVal + ' (Mean: 0)';
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
    // TAB 2: FOCI RESPRATION 60FPS WAVE ANIMATION
    // ========================================================
    let fociAnimId = null;
    function startFociWave() {
      const canvas = document.getElementById('fociCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      let step = 0;
      const phaseText = document.getElementById('fociPhaseText');

      if (fociAnimId) cancelAnimationFrame(fociAnimId);

      function renderWave() {
        const w = rect.width;
        const h = rect.height;
        ctx.clearRect(0, 0, w, h);

        step += 0.038;
        const cycleProgress = (Math.sin(step * 0.4) + 1) / 2; // 0 to 1

        if (phaseText) {
          if (cycleProgress > 0.65) phaseText.innerText = 'Exhale Flow (Release)';
          else if (cycleProgress < 0.35) phaseText.innerText = 'Inhale Expansion (Focus)';
          else phaseText.innerText = 'Equilibrium Hold';
        }

        // Draw breathing wave path
        ctx.beginPath();
        ctx.moveTo(0, h / 2);

        for (let x = 0; x <= w; x += 3) {
          const wave1 = Math.sin(x * 0.024 + step) * 12;
          const wave2 = Math.cos(x * 0.012 - step * 0.7) * 6;
          const y = h / 2 + (wave1 + wave2) * (0.6 + cycleProgress * 0.6);
          ctx.lineTo(x, y);
        }

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // Subtle gradient fill under wave
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.18)');
        grad.addColorStop(1, 'rgba(168, 85, 247, 0.0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Pulsing breathing node at center
        const centerX = w * 0.5;
        const centerY = h / 2 + Math.sin(centerX * 0.024 + step) * 12 * (0.6 + cycleProgress * 0.6);
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4.5 + cycleProgress * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        fociAnimId = requestAnimationFrame(renderWave);
      }

      renderWave();
    }

    // ========================================================
    // TAB 2: INTERACTIVE 10-DIMENSION ARISTOTELIAN RADAR (SVG)
    // ========================================================
    const dims10 = window.__ARISTOTLE_10__ || [];
    let selectedDimIndex = 0;

    function render10DRadarSvg() {
      const svg = document.getElementById('aristotleSvgRadar');
      if (!svg || dims10.length === 0) return;

      const cx = 230;
      const cy = 230;
      const count = dims10.length;
      const stepAngle = (Math.PI * 2) / count;

      // Radii mapping:
      // Inner floor (-5): r = 40
      // Deficiency drift (-2.5): r = 80
      // GOLDEN MEAN (0): r = 120 (Emerald target ring)
      // Excess drift (+2.5): r = 150
      // Outer perimeter (+5): r = 180
      const rInner = 40;
      const rMean = 120;
      const rOuter = 180;

      function scoreToRadius(s) {
        const clamped = Math.max(-5, Math.min(5, s));
        if (clamped <= 0) {
          // -5 to 0 maps to rInner to rMean
          return rInner + ((clamped + 5) / 5) * (rMean - rInner);
        } else {
          // 0 to 5 maps to rMean to rOuter
          return rMean + (clamped / 5) * (rOuter - rMean);
        }
      }

      function getVertexColor(s) {
        if (s === 0) return '#10b981'; // Emerald Golden Mean
        if (Math.abs(s) <= 2) return '#f59e0b'; // Amber Drift
        return '#f43f5e'; // Rose Imbalance
      }

      // Generate concentric rings
      let ringsHtml = '';
      const ringDefs = [
        { r: rInner, stroke: 'rgba(244, 63, 94, 0.25)', dash: '2 4', label: '-5' },
        { r: 80, stroke: 'rgba(245, 158, 11, 0.25)', dash: '3 4', label: '-2.5' },
        { r: rMean, stroke: '#10b981', dash: '4 4', strokeWidth: 2, label: 'Golden Mean (0)', isMean: true },
        { r: 150, stroke: 'rgba(245, 158, 11, 0.25)', dash: '3 4', label: '+2.5' },
        { r: rOuter, stroke: 'rgba(244, 63, 94, 0.25)', dash: '2 4', label: '+5' },
      ];

      ringDefs.forEach(ring => {
        ringsHtml += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ring.r + '" fill="' + (ring.isMean ? 'rgba(16, 185, 129, 0.05)' : 'none') + '" stroke="' + ring.stroke + '" stroke-width="' + (ring.strokeWidth || 1) + '" stroke-dasharray="' + ring.dash + '" />';
      });

      // Axis spokes & label text
      let spokesHtml = '';
      let labelsHtml = '';

      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + i * stepAngle;
        const xOuter = cx + Math.cos(angle) * rOuter;
        const yOuter = cy + Math.sin(angle) * rOuter;
        const xLabel = cx + Math.cos(angle) * (rOuter + 26);
        const yLabel = cy + Math.sin(angle) * (rOuter + 26);

        const isSelected = i === selectedDimIndex;
        const strokeColor = isSelected ? '#06b6d4' : 'rgba(255, 255, 255, 0.12)';
        spokesHtml += '<line x1="' + cx + '" y1="' + cy + '" x2="' + xOuter + '" y2="' + yOuter + '" stroke="' + strokeColor + '" stroke-width="' + (isSelected ? 1.8 : 0.9) + '" />';

        const dim = dims10[i];
        const vColor = getVertexColor(dim.score);
        labelsHtml += [
          '<g transform="translate(' + xLabel + ',' + yLabel + ')" class="cursor-pointer" onclick="inspectDimension(' + i + ')">',
            '<text text-anchor="middle" dominant-baseline="central" fill="' + (isSelected ? '#ffffff' : '#a1a1aa') + '" font-size="' + (isSelected ? '12px' : '10px') + '" font-weight="' + (isSelected ? 'bold' : 'normal') + '" font-family="JetBrains Mono, monospace">',
              dim.icon + ' ' + (dim.label.length > 10 ? dim.label.slice(0, 9) + '…' : dim.label),
            '</text>',
          '</g>'
        ].join('');
      }

      // Calculate polygon points
      const points = [];
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + i * stepAngle;
        const r = scoreToRadius(dims10[i].score);
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        points.push({ x: px, y: py, score: dims10[i].score, index: i });
      }

      const pointsStr = points.map(p => p.x + ',' + p.y).join(' ');

      // Render vertices
      let verticesHtml = '';
      points.forEach(p => {
        const isSelected = p.index === selectedDimIndex;
        const color = getVertexColor(p.score);
        const rSize = isSelected ? 8 : 5.5;

        verticesHtml += [
          '<g class="cursor-pointer" onclick="inspectDimension(' + p.index + ')">',
            (isSelected ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="14" fill="' + color + '" opacity="0.25" class="animate-pulse" />' : ''),
            '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + rSize + '" fill="' + color + '" stroke="#ffffff" stroke-width="1.8" class="radar-vertex" />',
            '<text x="' + (p.x + 8) + '" y="' + (p.y - 8) + '" fill="' + color + '" font-size="10px" font-weight="bold" font-family="JetBrains Mono, monospace">',
              (p.score > 0 ? '+' : '') + p.score,
            '</text>',
          '</g>'
        ].join('');
      });

      svg.innerHTML = [
        '<defs>',
          '<radialGradient id="polyGrad" cx="50%" cy="50%" r="50%">',
            '<stop offset="0%" stop-color="#06b6d4" stop-opacity="0.35"/>',
            '<stop offset="100%" stop-color="#a855f7" stop-opacity="0.15"/>',
          '</radialGradient>',
        '</defs>',
        ringsHtml,
        spokesHtml,
        '<polygon points="' + pointsStr + '" fill="url(#polyGrad)" stroke="#06b6d4" stroke-width="2.4" stroke-linejoin="round" />',
        verticesHtml,
        labelsHtml,
      ].join('');
    }

    function inspectDimension(index) {
      triggerHaptic('light');
      selectedDimIndex = index;
      const dim = dims10[index];
      if (!dim) return;

      const title = document.getElementById('inspectorTitle');
      const icon = document.getElementById('inspectorIcon');
      const label = document.getElementById('inspectorMeanLabel');
      const badge = document.getElementById('inspectorBadge');
      const desc = document.getElementById('inspectorDesc');
      const excess = document.getElementById('inspectorExcess');
      const deficit = document.getElementById('inspectorDeficit');

      const s = dim.score;
      const isMean = s === 0;
      const isDrift = Math.abs(s) <= 2 && s !== 0;
      const sign = s > 0 ? '+' + s : s;

      if (title) title.innerText = dim.label;
      if (icon) icon.innerText = dim.icon;
      if (desc) desc.innerText = dim.desc;
      if (excess) excess.innerText = dim.excess;
      if (deficit) deficit.innerText = dim.deficit;

      if (label) {
        label.innerText = isMean ? 'Golden Mean (0)' : (s > 0 ? 'Excess (' + sign + ')' : 'Deficiency (' + sign + ')');
        label.className = isMean ? 'text-[10px] font-mono text-emerald-400 font-semibold' : (isDrift ? 'text-[10px] font-mono text-amber-400 font-semibold' : 'text-[10px] font-mono text-rose-400 font-semibold');
      }

      if (badge) {
        badge.innerText = isMean ? 'Golden Mean (0)' : (isDrift ? 'Drift (' + sign + ')' : 'Imbalance (' + sign + ')');
        badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold ' + 
          (isMean ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : (isDrift ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'));
      }

      // Update selector buttons styling
      document.querySelectorAll('.dim-selector-btn').forEach((btn, idx) => {
        if (idx === index) {
          btn.classList.add('border-cyan-500/60', 'bg-zinc-800', 'shadow-md');
          btn.classList.remove('border-zinc-800', 'bg-zinc-900/80');
        } else {
          btn.classList.remove('border-cyan-500/60', 'bg-zinc-800', 'shadow-md');
          btn.classList.add('border-zinc-800', 'bg-zinc-900/80');
        }
      });

      render10DRadarSvg();
    }

    // ========================================================
    // TAB 3: FORCE-DIRECTED KNOWLEDGE GRAPH SIMULATION
    // ========================================================
    (function initKnowledgeGraph() {
      const graphData = window.__GRAPH_DATA__ || { nodes: [], edges: [], clusters: [] };
      const canvas = document.getElementById('graphCanvas');
      if (!canvas) return;
      const gctx = canvas.getContext('2d');
      if (!gctx) return;

      const NODE_STYLES = {
        concept: { color: '#06b6d4', radius: 11, label: 'Concept', badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
        reel: { color: '#a855f7', radius: 8, label: 'Reel', badgeBg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
        heuristic: { color: '#10b981', radius: 10, label: 'Heuristic', badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
        dimension: { color: '#f59e0b', radius: 16, label: 'Dimension', badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
        verdict: { color: '#f43f5e', radius: 11, label: 'User Verdict', badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
      };

      const QUADRANT_OFFSETS = {
        Focus: { x: -180, y: -160 },
        Facts: { x: 180, y: -160 },
        Funds: { x: 180, y: 160 },
        Feedback: { x: -180, y: 160 },
      };

      let allNodes = [];
      let allEdges = [];
      let activeNodes = [];
      let activeEdges = [];
      let nodeMap = new Map();
      let neighborMap = new Map();
      let activeCluster = 'all';
      let activeSearch = '';
      let selectedNode = null;
      let hoveredNode = null;

      const camera = { panX: 0, panY: 0, zoom: 1.0 };
      let dpr = window.devicePixelRatio || 1;
      let width = 0;
      let height = 0;

      let alpha = 1.0;
      let isPaused = false;
      const ALPHA_DECAY = 0.0035;
      const MIN_ALPHA = 0.001;

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

        for (let i = 0; i < count; i++) {
          const n = nodes[i];
          if (n.isFixed) continue;

          n.vx -= n.x * kGrav * alpha;
          n.vy -= n.y * kGrav * alpha;
          n.vx *= damping;
          n.vy *= damping;

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

      function draw() {
        if (!width || !height) resizeGraphCanvas();

        gctx.save();
        gctx.scale(dpr, dpr);
        gctx.clearRect(0, 0, width, height);

        drawCosmicGrid();

        gctx.save();
        gctx.translate(width / 2 + camera.panX, height / 2 + camera.panY);
        gctx.scale(camera.zoom, camera.zoom);

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

          let nodeAlpha = 1.0;
          if (focusedNode) {
            nodeAlpha = (isSelected || isHovered || isNeighbor) ? 1.0 : 0.22;
          } else if (activeSearch) {
            nodeAlpha = matchesSearch ? 1.0 : 0.15;
          }

          gctx.globalAlpha = nodeAlpha;

          if (isSelected || isHovered) {
            const pulse = isSelected ? Math.sin(now / 180) * 2.5 : 0;
            gctx.beginPath();
            gctx.arc(n.x, n.y, n.radius + 6 + pulse, 0, Math.PI * 2);
            gctx.fillStyle = n.color;
            gctx.globalAlpha = nodeAlpha * 0.25;
            gctx.fill();
            gctx.globalAlpha = nodeAlpha;
          }

          gctx.beginPath();
          gctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          gctx.fillStyle = n.color;
          gctx.fill();

          gctx.strokeStyle = isSelected ? '#ffffff' : (isHovered ? '#f4f4f5' : 'rgba(255, 255, 255, 0.4)');
          gctx.lineWidth = isSelected ? 2.5 : 1.2;
          gctx.stroke();

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

          const shouldDrawLabel = isSelected || isHovered || n.type === 'dimension' || n.type === 'concept' || camera.zoom > 1.35;
          if (shouldDrawLabel && nodeAlpha > 0.3) {
            const text = truncateText(n.label, isSelected ? 30 : 20);
            gctx.font = isSelected ? 'bold 11px JetBrains Mono, monospace' : '10px Plus Jakarta Sans, sans-serif';
            const metrics = gctx.measureText(text);
            const textWidth = metrics.width;
            const textY = n.y + n.radius + 12;

            gctx.fillStyle = 'rgba(12, 12, 17, 0.85)';
            gctx.fillRect(n.x - textWidth / 2 - 4, textY - 9, textWidth + 8, 14);
            gctx.strokeStyle = isSelected ? n.color : 'rgba(255, 255, 255, 0.15)';
            gctx.lineWidth = 0.8;
            gctx.strokeRect(n.x - textWidth / 2 - 4, textY - 9, textWidth + 8, 14);

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

      function loop() {
        stepPhysics();
        draw();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);

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

      // Event handlers
      let isPointerDown = false;
      let isDragging = false;
      let dragStart = { x: 0, y: 0 };
      let draggedNode = null;
      let initialPinchDist = 0;
      let initialPinchZoom = 1.0;

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
          if (Math.hypot(dx, dy) > 4) isDragging = true;

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

          if (Math.hypot(dx, dy) > 5) isDragging = true;

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

      // NODE INSPECTOR RENDERING WITH DIRECT PLAYABLE TELEGRAM & NOTION LINKS
      function renderInspector(node) {
        const inspector = document.getElementById('nodeInspector');
        if (!inspector) return;

        if (!node) {
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

          inspector.innerHTML = [
            '<div class="py-5 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">',
              '<span class="text-xl">✨</span>',
              '<span class="font-bold text-zinc-200">Tap Any Node or Cluster to Inspect</span>',
              '<span class="text-[11px] text-zinc-500 max-w-sm">',
                'Click concepts to see core syntheses, or select purple reel nodes to view actionable takeaways and open direct links to streaming Telegram reels and Notion cards.',
              '</span>',
            '</div>'
          ].join('');
          return;
        }

        const style = NODE_STYLES[node.type] || NODE_STYLES.concept;
        const neighbors = neighborMap.get(node.id);
        const neighborList = [];

        if (neighbors) {
          neighbors.forEach((relation, nId) => {
            const n = nodeMap.get(nId);
            if (n) neighborList.push({ ...n, relation });
          });
        }

        const tgLink = node.telegramStreamUrl || node.telegramUrl || '';
        const notionLink = node.notionUrl || '';

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

        // Playable Telegram Streaming Video Link + Direct Notion Card Link
        let actionButtonsHtml = '';
        if (tgLink || notionLink) {
          actionButtonsHtml = '<div class="flex flex-col sm:flex-row gap-2 pt-1.5">';
          if (tgLink) {
            actionButtonsHtml += [
              '<a href="' + escapeClientHtml(tgLink) + '" target="_blank" rel="noopener noreferrer" onclick="openTelegramVaultUrl(\'' + escapeClientHtml(tgLink) + '\'); return false;" class="flex-1 py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-95 transition no-underline">',
                '<span class="text-sm">🎬</span>',
                '<span>Stream Telegram Video</span>',
                '<svg class="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>',
              '</a>'
            ].join('');
          }
          if (notionLink) {
            actionButtonsHtml += [
              '<a href="' + escapeClientHtml(notionLink) + '" target="_blank" rel="noopener noreferrer" onclick="openExternalUrl(\'' + escapeClientHtml(notionLink) + '\'); return false;" class="flex-1 py-2.5 px-3.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition no-underline">',
                '<span class="text-sm">📑</span>',
                '<span>Open Notion Card</span>',
                '<svg class="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>',
              '</a>'
            ].join('');
          }
          actionButtonsHtml += '</div>';
        } else {
          actionButtonsHtml = [
            '<div class="text-[10px] text-zinc-500 font-mono text-center py-1">',
              'Structural Node • Synthesizes ' + neighborList.length + ' interconnected points',
            '</div>'
          ].join('');
        }

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
            actionButtonsHtml,
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

      window.setClusterFilter = function(clusterId) {
        triggerHaptic('light');
        activeCluster = clusterId;

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

        const badge = document.getElementById('graphStatsBadge');
        if (badge) {
          badge.innerText = activeNodes.length + ' Active Nodes • ' + activeEdges.length + ' Synapses';
        }

        if (selectedNode && !activeNodes.some((n) => n.id === selectedNode.id)) {
          selectedNode = null;
        }

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

      window.handleGraphSearch = function(query) {
        activeSearch = (query || '').toLowerCase().trim();
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
          if (activeSearch) clearBtn.classList.remove('hidden');
          else clearBtn.classList.add('hidden');
        }

        if (activeSearch) {
          const exact = activeNodes.find((n) => n.label.toLowerCase() === activeSearch);
          if (exact) selectNode(exact);
        }
        reheatSimulation(0.2);
      };

      window.clearGraphSearch = function() {
        triggerHaptic('light');
        const input = document.getElementById('graphSearchInput');
        if (input) input.value = '';
        handleGraphSearch('');
      };

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
