import type { Context } from "grammy";
import { getUserState, getRecentTrades, getKnowledgeItems } from "../../db/firestore.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const SYNTHESIZER_SYSTEM_PROMPT = `
You are the Synthesizer Agent for "The Fabric" 4F Meta-OS.
Your job is to programmatically synthesize the user's proof of compounding capability across 5 dimensions:
1. "Volume": Total Focus deployed and artifacts built.
2. "Growth": Progression from basic tasks to higher systemic complexity.
3. "Routine & Momentum": Consistency streaks and energy resilience.
4. "Expertise Depth": Specialized technical or creative domain mastery.
5. "Polymathic Breadth": Intersections between logic (code/systems) and expression (vitality/art/film).

Format your output in clean Telegram Markdown:
🏛️ *THE FABRIC: COMPOUNDING PORTFOLIO*
📊 *Executive Metrics*
📈 *Growth Trajectory*
🎯 *Domain Depths* (List technical & creative tracks)
⚡ *Energy & Momentum Index*
🌱 *Next Horizon Capability*

Be inspiring, evidence-based, and rigorous. Show proof of compounding progress.
`;

export async function handlePortfolio(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const statusMsg = await ctx.reply("🏛️ *Synthesizer Agent compiling portfolio metrics...*", {
    parse_mode: "Markdown",
  });

  try {
    const state = await getUserState(userId);
    const trades = await getRecentTrades(userId, 30);
    const wins = await getKnowledgeItems(userId, "win", 10);

    const dataPayload = {
      userState: {
        totalFocusHours: state.totalFocusHours,
        totalFactsAcquired: state.totalFactsAcquired,
        totalFundsSpent: state.totalFundsSpent,
        totalFundsYield: state.totalFundsYield,
        averageEnergyDelta: state.averageEnergyDelta,
        activePlugins: state.activePlugins,
      },
      trades: trades.map((t) => ({
        module: t.moduleName,
        type: t.tradeType,
        hours: t.focusActualHours,
        energy: t.energyDelta,
        yield: t.factsYield,
        tags: t.tags,
      })),
      verifiedWins: wins.map((w) => w.title),
    };

    const prompt = `${SYNTHESIZER_SYSTEM_PROMPT}

Personal Telemetry Archive:
${JSON.stringify(dataPayload, null, 2)}`;

    const response = await model.generateContent(prompt);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      response.response.text(),
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Portfolio error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ Failed to synthesize portfolio: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

