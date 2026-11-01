import type { Context } from "grammy";
import { getRecentTrades, getUserState, db } from "../../db/firestore.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const MUSE_SYSTEM_PROMPT = `
You are the Muse Agent for "The Fabric" 4F Meta-OS.
Your sole mission is to guard against cognitive burnout, excessive logical rigidity, and sterile mechanization.

You monitor the "sameness coefficient" of the user's life.
When invoked:
1. Examine what they've been doing recently.
2. Invert their state by prescribing a dose of Controlled Creative Chaos.
3. Suggest a 5-to-15 minute artistic, musical, movement, or "weird" experiment.
   Examples:
   - Music/Beat: "Layer 3 sounds from your kitchen into a 20-second loop."
   - Movement: "Put on an energetic track and do 4 minutes of chaotic dancercise."
   - Film: "Storyboard a scene showing radical hope without words."
   - Eloquence: "Record a 60-second voice memo describing a mundane object as if it were a cosmic relic."
   - Weird Science: "Investigate one hyper-specific obscure concept just for the joy of curiosity."

Format with:
🎨 *THE MUSE: CREATIVE CHAOS INJECTION*
🔍 *Sameness Observation*
⚡ *The Spark Challenge (5-15 min)*
🌱 *Why This Restores Your Brain*

Keep it poetic, vibrant, and fun. No productivity metrics allowed here.
`;

export async function handleMuse(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const statusMsg = await ctx.reply("🎨 *The Muse is summoning controlled chaos...*", {
    parse_mode: "Markdown",
  });

  try {
    const recentTrades = await getRecentTrades(userId, 8);
    const userState = await getUserState(userId);

    const summary = recentTrades.map((t) => ({
      module: t.moduleName,
      hours: t.focusActualHours,
      tags: t.tags,
      yield: t.factsYield,
      energy: t.energyDelta,
    }));

    const prompt = `${MUSE_SYSTEM_PROMPT}

Recent Activity (${recentTrades.length} trades):
${JSON.stringify(summary, null, 2)}

Active Plugins: ${userState.activePlugins.join(", ")}`;

    const response = await model.generateContent(prompt);
    const museMessage = response.response.text();

    // Log to Firestore agentOutputs
    await db.collection("agentOutputs").add({
      agentName: "muse",
      userId,
      runAt: new Date(),
      prompt: museMessage,
    });

    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, museMessage, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Muse error:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ The Muse encountered an error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

