import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getUserState, getRecentTrades, db } from "../../db/firestore.js";
import { getUserActivePlugins } from "../../plugins/manager.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

export const SIMULATOR_SYSTEM_PROMPT = `
You are the Systems Architecture Simulation Engine for "The Fabric" 4F Meta-OS.
Your purpose is to implement Point 9 of the system architecture:
"When you want to try a new framework you found online, you don't just implement it blindly. You feed the framework's rules to the AI agent, which rapidly builds a simulated pipeline of how it would plug into your existing tools, letting you test-drive the workflow method before writing a single line of integration code."

Context & Foundations:
- The user is a creative, neurodivergent, high-focus builder operating within a 4F currency economy:
  1. Focus: Deep immersion, monotropic attention, hours deployed.
  2. Facts: Synthesized knowledge, concrete artifacts, technical models, signal vs. noise.
  3. Funds: Capital expenditure, software/tooling costs, revenue leverage.
  4. Feedback / Energy Delta: Biological vitality reserve (-5 to +5 scale).
- External productivity frameworks often act as "productivity malware" or introduce toxic cognitive friction:
  * For example, rigid 25-minute Pomodoro intervals violently shatter monotropic flow states.
  * Zettelkasten systems often devolve into administrative note-shuffling without actual product yields.
  * Rigid time-blocking or extreme regimes (like 75 Hard) induce executive exhaustion and systemic burnout.
- Aristotelian Mean Dynamics: Virtue is a dynamic equilibrium (the golden mean, 0) between deficiency (-5) and excess (+5) across 5 core scales:
  1. Logic & Engineering
  2. Physical Vitality
  3. Art & Expression
  4. Variety & Polymathy
  5. Prioritization

Simulation Task:
Analyze the requested framework or routine concept against the user's live telemetry and active Ways of Working (WoW) plugins.
Output your simulation in clean Telegram Markdown formatted with these structured sections:

🎮 *THE FABRIC: SYSTEMS ARCHITECTURE SIMULATION*
🔬 *Target Framework:* [Framework Name]

🧩 *1. Plugin Translation (4F Currency Economy)*
• *Focus Demand:* [Projected focus commitment, cognitive context-switch penalty, impact on flow]
• *Facts Yield:* [Expected actionable artifacts, signal-to-noise ratio, practical leverage]
• *Funds Impact:* [Financial or tooling overhead, potential commercial ROI]
• *Energy Delta Forecast:* [Projected average net energy delta per session (-5 to +5)]

⚖️ *2. 30-Day Aristotelian Drift Forecast*
• 🔺 *Excess Risks (+):* [Which scales will shoot into toxic excess (e.g., hyper-rigidity, perfectionism, fatigue)]
• 🔻 *Deficiency Risks (-):* [Which scales will fall into deficiency (e.g., physical vitality drop, creative atrophy)]
• 🎯 *Equilibrium Verdict:* [Concise synthesis of 30-day systemic viability]

⚠️ *3. Cognitive Friction & Malware Warnings*
• *Neurodivergent Vulnerabilities:* [Monotropic fragmentation, dopamine crashes, executive overhead]
• *Administrative Overhead:* [Risk of meta-work replacing actual execution]
• *Failure Mode:* [What catastrophic failure occurs when an unexpected exception or chaotic day strikes]

🧪 *4. The 7-Day Pilot Recommendation (Micro-dose Protocol)*
• *Micro-dose Setup:* [A non-destructive, low-friction 7-day trial testing the core upside without systemic disruption]
• *Operating Constraints:* [1-2 strict boundary guardrails]
• *Kill Criteria (Falsification Gate):* [Clear trigger to instantly abort the pilot, e.g., if Energy Delta < 0 for 2 consecutive days]

🕹️ *5. Telemetry Protocol*
• *Recommended Tag:* \`#pilot-[slug]\`
• *Golden Rule:* _[One-sentence architectural decision heuristic]_

Keep the tone incisive, protective of biological energy, deeply architectural, and realistic. No generic platitudes.
`;

export async function executeSimulation(ctx: Context, query: string) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const statusMsg = await ctx.reply(
    `🔬 *Simulating systems architecture pipeline for: "${query}"...*`,
    { parse_mode: "Markdown" }
  );

  try {
    const userState = await getUserState(userId);
    const recentTrades = await getRecentTrades(userId, 8);
    const activePlugins = await getUserActivePlugins(userId);

    const recentSummary = recentTrades.map((t) => ({
      module: t.moduleName,
      hours: t.focusActualHours,
      type: t.tradeType,
      energy: t.energyDelta,
      tags: t.tags,
      yield: t.factsYield,
    }));

    const activePluginList = activePlugins.map(
      (p) => `• ${p.name} (${p.id}): ${p.description}`
    );

    const telemetryContext = `
Live User Telemetry:
- Total Focus Hours: ${userState.totalFocusHours}
- Total Facts Acquired: ${userState.totalFactsAcquired}
- Funds Spent / Yield: -$${userState.totalFundsSpent} / +$${userState.totalFundsYield}
- Energy Baseline Average: ${userState.averageEnergyDelta}
- Active Ways of Working Plugins:
${activePluginList.length > 0 ? activePluginList.join("\n") : "  (Default monotropic flow)"}

Recent Activity Logs (${recentTrades.length} trades):
${JSON.stringify(recentSummary, null, 2)}
`;

    const prompt = `${SIMULATOR_SYSTEM_PROMPT}

Proposed Framework to Simulate:
"${query}"

${telemetryContext}`;

    const response = await model.generateContent(prompt);
    const simulationText = response.response.text();

    // Log the simulation to Firestore under agentOutputs collection with agentName: "simulator"
    await db.collection("agentOutputs").add({
      agentName: "simulator",
      userId,
      framework: query,
      runAt: new Date(),
      output: simulationText,
    });

    const slug = query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "framework";

    const keyboard = new InlineKeyboard()
      .text("🧪 Test 7-Day Pilot", `sim:pilot:${slug}`)
      .text("🗑️ Discard", "sim:discard")
      .row()
      .text("⚖️ View Balance", "action:balance")
      .text("🧩 Active Plugins", "action:plugins");

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        simulationText,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch {
      // Fallback in case of raw unescaped markdown characters from LLM
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        simulationText,
        {
          reply_markup: keyboard,
        }
      );
    }
  } catch (error) {
    console.error("Simulation engine error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Systems Simulation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function handleSimulate(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const rawText = ctx.message?.text || "";
  const query = rawText.replace(/^\/simulate(@\w+)?\s*/i, "").trim();

  if (!query) {
    const keyboard = new InlineKeyboard()
      .text("75 Hard", "sim:run:75 Hard")
      .text("Atomic Notes", "sim:run:Zettelkasten Atomic Notes")
      .row()
      .text("Strict Time Blocking", "sim:run:Strict Time Blocking")
      .text("10k Hours Practice", "sim:run:10,000 Hours Deliberate Practice");

    await ctx.reply(
      `🎮 *The Fabric: Systems Simulation Engine*\n\n` +
        `Test-drive new productivity frameworks, routines, or workflow methodologies before writing a single line of integration code.\n\n` +
        `*Usage:*\n\`/simulate <framework or routine concept>\`\n\n` +
        `*Examples:*\n` +
        `• \`/simulate 75 Hard\`\n` +
        `• \`/simulate Zettelkasten Atomic Notes\`\n` +
        `• \`/simulate Strict Time Blocking\`\n` +
        `• \`/simulate 10,000 Hours Deliberate Practice\`\n` +
        `• \`/simulate Getting Things Done (GTD)\`\n\n` +
        `_Or select a preset framework below to simulate immediately:_`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
    return;
  }

  await executeSimulation(ctx, query);
}
