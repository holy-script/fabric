import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";
import {
  SYSTEM_TRADE_PARSER,
  SYSTEM_KNOWLEDGE_PARSER,
  SYSTEM_VOICE_PARSER,
  SYSTEM_ARISTOTLE_EVALUATOR,
  SYSTEM_QUERY_ADVISOR,
} from "./prompts.js";
import type { Trade, KnowledgeItem, UserState } from "../db/types.js";
import { getActivePluginPromptGuidance } from "../plugins/manager.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash-lite",
});

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
 * Parses raw text into a structured 4F Trade
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
  const pluginGuidance = await getActivePluginPromptGuidance(userId);

  const contextStr = sessionContext
    ? `\nActive Session Context:
- Planned Task: ${sessionContext.taskDescription}
- Expected Hours: ${sessionContext.focusExpectedHours || "not set"}
- Started: ${sessionContext.startedAt.toISOString()}`
    : "";

  const prompt = `${SYSTEM_TRADE_PARSER}
${pluginGuidance}
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

export interface VoiceParseResult {
  transcript: string;
  intent: "trade" | "win" | "gotcha" | "question";
  trade?: Omit<Trade, "id">;
  knowledge?: Omit<KnowledgeItem, "id">;
  question?: string;
}

/**
 * Ingests audio bytes (Telegram voice message Ogg Opus), transcribes & parses
 */
export async function parseVoiceWithGemini(
  userId: string,
  audioBase64: string,
  mimeType = "audio/ogg"
): Promise<VoiceParseResult> {
  const pluginGuidance = await getActivePluginPromptGuidance(userId);
  const fullPrompt = `${SYSTEM_VOICE_PARSER}\n${pluginGuidance}`;

  const result = await model.generateContent([
    fullPrompt,
    {
      inlineData: {
        mimeType,
        data: audioBase64,
      },
    },
  ]);

  const text = result.response.text();
  const cleaned = cleanJsonOutput(text);
  const parsed = JSON.parse(cleaned);

  const res: VoiceParseResult = {
    transcript: parsed.transcript || "(No speech detected)",
    intent: parsed.intent || "trade",
  };

  if (parsed.intent === "trade" && parsed.trade) {
    res.trade = {
      userId,
      timestamp: new Date(),
      moduleName: parsed.trade.moduleName || "Voice Log",
      tradeType: parsed.trade.tradeType || "builder",
      focusExpectedHours: parsed.trade.focusExpectedHours ?? undefined,
      focusActualHours: Number(parsed.trade.focusActualHours) || 1.0,
      factsInput: parsed.trade.factsInput || undefined,
      factsYield: parsed.trade.factsYield || "Logged via voice",
      fundsCost: Number(parsed.trade.fundsCost) || 0,
      fundsYield: Number(parsed.trade.fundsYield) || 0,
      energyDelta: Math.max(-5, Math.min(5, Number(parsed.trade.energyDelta) || 0)),
      tags: Array.isArray(parsed.trade.tags) ? parsed.trade.tags : ["voice-memo"],
      notes: parsed.trade.notes || parsed.transcript,
    };
  } else if (
    (parsed.intent === "win" || parsed.intent === "gotcha") &&
    parsed.knowledge
  ) {
    res.knowledge = {
      userId,
      timestamp: new Date(),
      category: parsed.knowledge.category || parsed.intent,
      title: parsed.knowledge.title || "Voice Note",
      content: parsed.knowledge.content || parsed.transcript,
      tags: Array.isArray(parsed.knowledge.tags)
        ? parsed.knowledge.tags
        : ["voice"],
      actionableTakeaway: parsed.knowledge.actionableTakeaway || undefined,
    };
  } else if (parsed.intent === "question") {
    res.question = parsed.question || parsed.transcript;
  }

  return res;
}

export interface AristotleEvaluation {
  scales: {
    logic: number;
    vitality: number;
    expressionism: number;
    variety: number;
    prioritization: number;
  };
  overallDiagnosis: string;
}

/**
 * Calculates current Aristotelian Mean scores from recent telemetry
 */
export async function evaluateAristotleMean(
  recentTrades: Trade[],
  userState: UserState
): Promise<AristotleEvaluation> {
  const tradeSummaries = recentTrades.map((t) => ({
    module: t.moduleName,
    type: t.tradeType,
    hours: t.focusActualHours,
    energy: t.energyDelta,
    tags: t.tags,
    yield: t.factsYield,
  }));

  const prompt = `${SYSTEM_ARISTOTLE_EVALUATOR}

Cumulative Telemetry:
- Total Focus Hours: ${userState.totalFocusHours}
- Average Energy Delta: ${userState.averageEnergyDelta}
- Recent Trades (Last ${recentTrades.length}):
${JSON.stringify(tradeSummaries, null, 2)}`;

  const response = await model.generateContent(prompt);
  const cleaned = cleanJsonOutput(response.response.text());
  return JSON.parse(cleaned);
}

/**
 * Helper to render an ASCII Aristotelian Mean bar
 * Scale: -5 (Deficiency) to 0 (Virtue/Mean) to +5 (Excess)
 */
export function renderMeanBar(value: number, label: string): string {
  const clamped = Math.max(-5, Math.min(5, Math.round(value)));
  let left = "     ";
  let right = "     ";

  if (clamped < 0) {
    const filled = Math.abs(clamped);
    left = "■".repeat(filled).padStart(5, " ");
  } else if (clamped > 0) {
    right = "■".repeat(clamped).padEnd(5, " ");
  }

  let tag = "🎯 Mean";
  if (clamped < 0) tag = `Deficiency (${clamped})`;
  if (clamped > 0) tag = `Excess (+${clamped})`;

  return `\`[${left}|${right}]\` *${label}*: ${tag}`;
}

/**
 * Answers questions about the 4F balance and decisions
 */
export async function askAdvisor(
  question: string,
  userState: UserState,
  recentTrades: Trade[]
): Promise<string> {
  const pluginGuidance = await getActivePluginPromptGuidance(userState.userId);

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
${pluginGuidance}

${stateSummary}

User Question: "${question}"`;

  const response = await model.generateContent(prompt);
  return response.response.text();
}
