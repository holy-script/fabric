import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";
import { searchGraph } from "../graph/query.js";
import { searchWebDetailed } from "../services/websearch.js";
import { getUserState, getRecentTrades } from "../db/firestore.js";
import { getAllDomains } from "../domains/manager.js";
import type { UserState, Trade } from "../db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
});

export interface ConversationTurnResult {
  text: string;
  citedNodes: Array<{
    title: string;
    type: string;
    takeaway?: string;
    url?: string;
  }>;
  webCitations: Array<{
    title: string;
    url: string;
  }>;
}

/**
 * Classifies whether a text message is intentionally logging a 4F trade or is a conversational thought/question.
 */
export async function classifyMessageIntent(
  text: string,
  hasActiveSession: boolean
): Promise<"trade" | "conversation"> {
  const t = text.trim();

  // If user explicitly asks a question or has conversational indicators
  if (
    t.endsWith("?") ||
    /^(what|how|why|when|where|who|can you|could you|explain|tell me|compare|is it|should i|thoughts on|look up|search|find|help|ideas for)/i.test(
      t
    )
  ) {
    return "conversation";
  }

  // Common trade keywords
  const tradePatterns = [
    /\b(worked on|spent \d|focused \d|hours?|hrs?|energy [+-]?\d|\+\d energy|-\d energy|completed task|built feature|trade:)\b/i,
  ];

  if (tradePatterns.some((p) => p.test(t)) || hasActiveSession) {
    // Check with fast classifier if ambiguous
    if (t.length > 80 && !t.endsWith("?")) {
      return "trade";
    }
  }

  // Quick prompt classifier if uncertain
  try {
    const prompt = `Classify this user message to their personal AI operating system into one category:
"trade": The user is logging work done, hours spent, tasks completed, energy change, or focus output.
"conversation": The user is asking a question, brainstorming, seeking advice, discussing an idea, wanting information, or conversing.

Message: "${t.slice(0, 300)}"

Return ONLY the single word "trade" or "conversation".`;

    const res = await model.generateContent(prompt);
    const intent = res.response.text().trim().toLowerCase();
    if (intent.includes("trade")) return "trade";
    return "conversation";
  } catch {
    return "conversation";
  }
}

/**
 * Answers a user question or conversational query using Knowledge Graph RAG + Web Search Grounding.
 */
export async function answerConversationalQuery(
  userId: string,
  query: string
): Promise<ConversationTurnResult> {
  // Fast safe fetch with 1000ms timeout to be antifragile against Firestore quota exhaustion
  const safeFetch = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 1000)),
    ]);

  const [userState, recentTrades, domainState] = await Promise.all([
    safeFetch(getUserState(userId), null),
    safeFetch(getRecentTrades(userId, 3), []),
    safeFetch(getAllDomains(userId), { active: [], bench: [] } as any),
  ]);

  // 1. Query Knowledge Graph for matching nodes, vaulted reels, heuristics
  let localContextStr = "";
  const citedNodes: ConversationTurnResult["citedNodes"] = [];

  try {
    const graphSearch = await searchGraph(query, 6);
    if (graphSearch.nodes.length > 0) {
      localContextStr = "### RELEVANT LOCAL KNOWLEDGE BASE & SAVED VAULT:\n";
      for (const node of graphSearch.nodes) {
        const takeaway = (node.properties?.actionableTakeaway as string) || "";
        const url = (node.properties?.url as string) || (node.properties?.streamUrl as string) || "";
        const summary = node.description || "";

        localContextStr += `- [${node.type.toUpperCase()}] ${node.label}\n`;
        if (summary) localContextStr += `  Summary: ${summary.slice(0, 180)}\n`;
        if (takeaway) localContextStr += `  Key Heuristic: "${takeaway}"\n`;
        if (url) localContextStr += `  Ref: ${url}\n`;

        citedNodes.push({
          title: node.label,
          type: node.type,
          takeaway: takeaway || undefined,
          url: url || undefined,
        });
      }
    }
  } catch (err) {
    console.warn("[Conversation] Knowledge graph search failed:", err);
  }

  // 2. Determine if Web Search is needed (e.g. current events, external facts, prices, tech)
  let webContextStr = "";
  const webCitations: ConversationTurnResult["webCitations"] = [];

  const needsWeb =
    query.length > 8 &&
    (/latest|today|price|current|news|market|release|version|docs|how to|what is|best way|2024|2025|2026/i.test(
      query
    ) ||
      citedNodes.length === 0);

  if (needsWeb) {
    try {
      const searchRes = await searchWebDetailed(query, 3);
      if (searchRes.results.length > 0 || searchRes.aiOverview) {
        webContextStr = `### LIVE WEB GROUNDING (Engine: ${searchRes.engineUsed.toUpperCase()}):\n`;
        if (searchRes.aiOverview) {
          webContextStr += `AI Overview Summary: ${searchRes.aiOverview}\n\n`;
        }
        for (const item of searchRes.results) {
          webContextStr += `- ${item.title}: ${item.snippet}\n  URL: ${item.url}\n`;
          webCitations.push({ title: item.title, url: item.url });
        }
      }
    } catch (err) {
      console.warn("[Conversation] Web search failed:", err);
    }
  }

  // 3. User & Fabric context
  const activeDomainNames = domainState.active.map((d: any) => d.name).join(", ");
  const userDiagnosis = userState?.goldenMeans
    ? `Aristotle Scales: Logic (${userState.goldenMeans.logic || 0}), Vitality (${userState.goldenMeans.vitality || 0}), Expressionism (${userState.goldenMeans.expressionism || 0}), Variety (${userState.goldenMeans.variety || 0}), Prioritization (${userState.goldenMeans.prioritization || 0})`
    : "";

  const systemPrompt = `You are Fabric OS — the user's autonomous 4F Meta-OS and intellectual sparring partner.
Core Philosophy:
- Focus, Facts, Funds, Feedback.
- Aristotle's Golden Mean: The virtue is the active midpoint between deficiency and excess.
- High agency, antifragile, practical, concise, and intellectually rigorous.
- You are speaking with the creator of Fabric. Address them directly, with conversational warmth but zero corporate fluff.

Active Mounted Domains: [${activeDomainNames}]
${userDiagnosis ? `User State: ${userDiagnosis}\n` : ""}

Context Sources Provided:
${localContextStr}
${webContextStr}

Instructions:
1. Answer the user's query or conversation directly and thoroughly.
2. If relevant items exist from their local Knowledge Base / Saved Vault, actively reference them (e.g. "In your saved vault...").
3. If live web search information is provided, integrate it seamlessly.
4. Keep the tone sharp, lucid, and action-oriented. Format with clean GitHub Markdown (bold headers, bullet points).
5. If recommending actions, ground them in 4F trade-offs (time cost, energy yield).`;

  const userPrompt = `User Query: "${query}"`;

  let replyText = "";
  try {
    const aiPromise = model.generateContent([
      { text: systemPrompt },
      { text: userPrompt },
    ]);

    // 3.8-second timeout race to prevent Vercel serverless function abortion
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM generation timeout")), 3800)
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);
    replyText = response.response.text().trim();
  } catch (err) {
    console.warn("[Conversation] LLM call failed or timed out, generating deterministic fallback:", err);

    if (citedNodes.length > 0) {
      replyText = `### 🧠 Fabric Knowledge Base Findings\n\nFound **${citedNodes.length} relevant items** in your saved Vault regarding your query:\n\n` +
        citedNodes
          .map((n) => `• **${n.title}** (${n.type.toUpperCase()})\n${n.takeaway ? `  ↳ _Heuristic:_ "${n.takeaway}"\n` : ""}${n.url ? `  ↳ _Vault Clip:_ [Watch on Telegram](${n.url})\n` : ""}`)
          .join("\n");
    } else if (webCitations.length > 0) {
      replyText = `### 🌐 Web Findings\n\n` +
        webCitations.map((w) => `• [${w.title}](${w.url})`).join("\n");
    } else {
      replyText = `I searched your Knowledge Base and saved Vault for *"${query}"*, but didn't find any direct matches yet. Try another keyword or save a new reel to populate this topic!`;
    }
  }

  return {
    text: replyText,
    citedNodes,
    webCitations,
  };
}
