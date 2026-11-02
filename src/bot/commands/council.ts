import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  conveneCouncil,
  formatCouncilCard,
  type CouncilReport,
} from "../../ai/council.js";

export interface CouncilSession {
  userId: string;
  report: CouncilReport;
  timestamp: Date;
}

// In-memory cache of the latest Council deliberation per user
const latestCouncilSessions = new Map<string, CouncilSession>();

export function setLatestCouncilSession(userId: string, report: CouncilReport): void {
  latestCouncilSessions.set(userId, {
    userId,
    report,
    timestamp: new Date(),
  });
}

export function getLatestCouncilSession(userId: string): CouncilSession | null {
  return latestCouncilSessions.get(userId) || null;
}

export function clearLatestCouncilSession(userId: string): void {
  latestCouncilSessions.delete(userId);
}

/**
 * Handles /council command
 */
export async function handleCouncil(ctx: Context): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const text = ctx.message?.text || "";
  const query = text.replace(/^\/council(@\w+)?\s*/i, "").trim();

  // If no dilemma provided, display instructions and example prompts
  if (!query) {
    const helpMessage = [
      `🏛️ *The Polymath Council: Deliberative Multi-Agent Engine*`,
      ``,
      `Summon 5 cognitive archetypes to deliberate complex trade-offs, architecture forks, and 4F resource allocations:`,
      ``,
      `• 🏛️ *The Architect* — Systems leverage, compounding modularity, long-term elegance`,
      `• 📈 *The Quant* — Expected value, asymmetric payoff, tail-risk prevention`,
      `• ⚖️ *The Stoic* — Aristotelian Golden Mean, via negativa, mortality awareness`,
      `• 🦾 *The Biomechanic* — Metabolic efficiency, kinetic CNS, physical stamina`,
      `• ⚔️ *The Sceptic* — Red-teaming, survivorship bias, brutal boundary testing`,
      ``,
      `*Usage:*`,
      `\`/council <dilemma / architectural question / trade-off>\``,
      ``,
      `*Example Prompts:*`,
      `• \`/council Should I build a custom vector DB indexing pipeline or use Cloudflare Vectorize?\``,
      `• \`/council Should I allocate $3,000 into GOLDBEES on this dip or reserve liquidity for GPU server hosting?\``,
      `• \`/council Drained after 7h of deep coding: push through another 2h sprint or do a 30m mobility walk and sleep early?\``,
      `• \`/council Should I write tests first for this new module or rapidly prototype the end-to-end user flow?\``,
    ].join("\n");

    await ctx.reply(helpMessage, { parse_mode: "Markdown" });
    return;
  }

  // Convening animation pill
  const statusMsg = await ctx.reply(`🏛️ *Summoning the Polymath Council...*`, {
    parse_mode: "Markdown",
  });

  try {
    // Convene the multi-agent council
    const report = await conveneCouncil(userId, query);

    // Save session in memory for interactive buttons
    setLatestCouncilSession(userId, report);

    const card = formatCouncilCard(report);

    const keyboard = new InlineKeyboard()
      .text("⚔️ Socratic Challenge", "council:challenge")
      .row()
      .text("⚡ Spark Action", "council:spark")
      .text("📊 Balance", "action:balance");

    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        card,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch (editErr) {
      // If editing fails (e.g. Markdown parse error or timeout), send as new message
      console.warn("⚠️ [Council] Edit message failed, sending as reply:", editErr);
      await ctx.reply(card, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }
  } catch (error: any) {
    console.error("⚠️ [Council] Deliberation error:", error);
    await ctx.reply(
      `❌ *Polymath Council encountered an error:*\n_${error?.message || "Unknown error"}_`,
      { parse_mode: "Markdown" }
    );
  }
}
