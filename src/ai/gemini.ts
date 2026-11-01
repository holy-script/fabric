import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";
import {
  SYSTEM_TRADE_PARSER,
  SYSTEM_KNOWLEDGE_PARSER,
  SYSTEM_QUERY_ADVISOR,
} from "./prompts.js";
import type { Trade, KnowledgeItem, UserState } from "../db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// Gemini 2.5 Flash is fast, stable, and has multimodal capabilities
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

// Helper to strip ```json code blocks if the model outputs them
function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

/**
 * Parses raw text or voice transcript into a structured 4F Trade
 */
export async function parseTradeWithGemini(
  userId: string,
  rawText: string,
  sessionContext?: {
    taskDescription: string;
    focusExpectedHours?: number;
    startedAt: Date;
  }
): Promise<Omit<Trade, "id">> {
  const contextStr = sessionContext
    ? `\nActive Session Context:
- Planned Task: ${sessionContext.taskDescription}
- Expected Hours: ${sessionContext.focusExpectedHours || "not set"}
- Started: ${sessionContext.startedAt.toISOString()}`
    : "";

  const prompt = `${SYSTEM_TRADE_PARSER}
${contextStr}

User Input: "${rawText}"`;

  const response = await model.generateContent(prompt);
  const text = response.response.text();
  const cleaned = cleanJsonOutput(text);

  const parsed = JSON.parse(cleaned);

  return {
    userId,
    timestamp: new Date(),
    moduleName: parsed.moduleName || "General Execution",
    tradeType: parsed.tradeType || "builder",
    focusExpectedHours:
      parsed.focusExpectedHours ?? sessionContext?.focusExpectedHours ?? undefined,
    focusActualHours: Number(parsed.focusActualHours) || 1.0,
    factsInput: parsed.factsInput || undefined,
    factsYield: parsed.factsYield || "Progress made",
    fundsCost: Number(parsed.fundsCost) || 0,
    fundsYield: Number(parsed.fundsYield) || 0,
    energyDelta: Math.max(-5, Math.min(5, Number(parsed.energyDelta) || 0)),
    tags: Array.isArray(parsed.tags) ? parsed.tags : ["trade"],
    notes: parsed.notes || rawText,
  };
}

/**
 * Parses a knowledge item (/win, /gotcha, etc.) into structured format
 */
export async function parseKnowledgeWithGemini(
  userId: string,
  categoryHint: string | undefined,
  rawText: string
): Promise<Omit<KnowledgeItem, "id">> {
  const prompt = `${SYSTEM_KNOWLEDGE_PARSER}
Hint Category: ${categoryHint || "unspecified"}

User Input: "${rawText}"`;

  const response = await model.generateContent(prompt);
  const text = response.response.text();
  const cleaned = cleanJsonOutput(text);

  const parsed = JSON.parse(cleaned);

  return {
    userId,
    timestamp: new Date(),
    category: parsed.category || "insight",
    title: parsed.title || "Quick Note",
    content: parsed.content || rawText,
    tags: Array.isArray(parsed.tags) ? parsed.tags : ["knowledge"],
    actionableTakeaway: parsed.actionableTakeaway || undefined,
  };
}

/**
 * Answers questions about the 4F balance and decisions
 */
export async function askAdvisor(
  question: string,
  userState: UserState,
  recentTrades: Trade[]
): Promise<string> {
  const stateSummary = `Current User Telemetry:
- Total Focus Hours: ${userState.totalFocusHours}
- Total Facts Acquired: ${userState.totalFactsAcquired}
- Total Funds Spent: $${userState.totalFundsSpent}
- Total Funds Yield: $${userState.totalFundsYield}
- Average Energy Delta: ${userState.averageEnergyDelta}
- Recent Trades: ${recentTrades
    .slice(0, 3)
    .map(
      (t) =>
        `${t.moduleName} (${t.focusActualHours}h, energy: ${t.energyDelta > 0 ? "+" : ""}${t.energyDelta})`
    )
    .join(", ")}`;

  const prompt = `${SYSTEM_QUERY_ADVISOR}

${stateSummary}

User Question: "${question}"`;

  const response = await model.generateContent(prompt);
  return response.response.text();
}

