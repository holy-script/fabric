import type { Context } from "grammy";
import { getGoldbeesAnalysis } from "../../services/goldbees.js";

export async function handleGold(ctx: Context) {
  const waitMsg = await ctx.reply("📈 *Fetching live NSE GOLDBEES data & dip analytics...*", {
    parse_mode: "Markdown",
  });

  try {
    const analysis = await getGoldbeesAnalysis();
    const sign = analysis.drawdownPercent > 0 ? "+" : "";

    const message =
      `🪙 *FABRIC CAPITAL: GOLDBEES ETF DIP TRACKER*\n\n` +
      `💵 *Current Price (CMP):* ₹\`${analysis.currentPrice}\`\n` +
      `🏔️ *52-Week High:* ₹\`${analysis.fiftyTwoWeekHigh}\`\n` +
      `📉 *Drawdown from Peak:* \`${sign}${analysis.drawdownPercent}%\`\n` +
      `⚡ *RSI (14-Day):* \`${analysis.rsi14}\`\n` +
      `📊 *SMA-20:* ₹\`${analysis.sma20}\` | *SMA-50:* ₹\`${analysis.sma50}\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Verdict: ${analysis.recommendation.actionTitle}*\n\n` +
      `_${analysis.recommendation.description}_\n\n` +
      `💰 *Recommended Deployment:* \`${analysis.recommendation.trancheAllocationPercent}% of Pool\`\n` +
      `• *Pool ₹20,000:* Deploy \`₹${analysis.recommendation.suggestedTrancheInr.conservative.toLocaleString("en-IN")}\`\n` +
      `• *Pool ₹50,000:* Deploy \`₹${analysis.recommendation.suggestedTrancheInr.moderate.toLocaleString("en-IN")}\`\n` +
      `• *Pool ₹100,000:* Deploy \`₹${analysis.recommendation.suggestedTrancheInr.aggressive.toLocaleString("en-IN")}\`\n\n` +
      `_Rule: Buy the capitulation, compound the asymmetry._`;

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, message, {
      parse_mode: "Markdown",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Could not retrieve GOLDBEES market data: ${err.message}`
    );
  }
}
