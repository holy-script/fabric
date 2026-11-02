import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

export const CORE_DSA_PATTERNS = [
  "Two Pointers & Opposite Direction Convergence",
  "Sliding Window (Dynamic & Fixed Size)",
  "Monotonic Stack (Next Greater Element & Boundary Shadows)",
  "Fast & Slow Pointers (Cycle Detection & Midpoint)",
  "Binary Search on Answer Space",
  "Prefix Sums & Frequency HashMaps",
  "Breadth-First Search (Shortest Path & Level Order)",
  "Depth-First Search (Backtracking & Tree Subproblems)",
  "Trie (Prefix Trees & Autocomplete)",
  "Topological Sort (Kahn's Algorithm & Dependency DAGs)",
  "Disjoint Set Union (Union-Find & Connected Components)",
  "Dynamic Programming (Overlapping Subproblems & Tabulation)",
];

export async function generateDsaLesson(pattern?: string): Promise<{ pattern: string; content: string }> {
  const selectedPattern = pattern || CORE_DSA_PATTERNS[Math.floor(Math.random() * CORE_DSA_PATTERNS.length)];

  const prompt = `
You are the Lead Algorithmic Mentor for "The Fabric: Craft Foundry".
Teach the user this Data Structure & Algorithm pattern: "${selectedPattern}".

Your goal is NOT to give LeetCode code snippets to copy-paste.
Your mission is to ingrain the fundamental "HOW" and "WHY" behind the pattern from absolute first principles (learn by doing).

Structure your response with EXACTLY these 4 sections in clean Telegram Markdown:
🧩 *DSA FOUNDRY: ${selectedPattern.toUpperCase()}*

1. 💡 *The Intuitive Mental Model (Why does this exist?):*
A physical or visual analogy that makes the algorithm feel inevitable.

2. 📐 *The Core Invariant:*
The one mathematical/logical rule that must remain true at every iteration of the loop.

3. 🔍 *Micro-Problem & State Machine:*
Present a concise, elegant problem (e.g., finding equilibrium index or trapping rainwater).
Include a clean text/ASCII visual diagram showing how the pointers or stack evolve step-by-step.

4. ⚔️ *Learn-by-Doing Challenge:*
Ask the user a crisp, targeted question: "How would you update the invariant if duplicate elements appear?" or invite them to reply with their solution.

Keep the total explanation under 280 words, punchy, clear, and deeply memorable.
`;

  const response = await model.generateContent(prompt);
  const content = response.response.text().trim();
  return { pattern: selectedPattern, content };
}

export async function handleDsa(ctx: Context) {
  const query = ctx.message?.text?.replace(/^\/dsa\s*/i, "").trim();
  const selectedPattern = query || CORE_DSA_PATTERNS[Math.floor(Math.random() * CORE_DSA_PATTERNS.length)];

  const waitMsg = await ctx.reply(`🧠 *Formulating Explainable DSA Foundry on "${selectedPattern}"...*`, {
    parse_mode: "Markdown",
  });

  try {
    const { content } = await generateDsaLesson(selectedPattern);

    const keyboard = new InlineKeyboard()
      .text("🎲 Another Pattern", "action:dsa_roll")
      .text("⚡ Spark 45m DSA Sprint", "action:spark_prompt");

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, content, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Could not generate DSA lesson: ${err.message}`
    );
  }
}

