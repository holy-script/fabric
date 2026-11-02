import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";

export async function handleDashboard(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("⚠️ Unable to identify user profile for dashboard.");
    return;
  }

  const dashboardUrl = `https://fabric-one-sage.vercel.app/api/dashboard?userId=${userId}`;
  const docsUrl = `https://fabric-one-sage.vercel.app/docs`;

  const keyboard = new InlineKeyboard()
    .webApp("📊 Open Visual HUD", dashboardUrl)
    .row()
    .url("📜 Architecture & Explainability Dossier", docsUrl);

  const message =
    `🔮 *The Fabric: Visual HUD & Mini App*\n\n` +
    `Tap the button below to launch your real-time visual telemetry dashboard natively inside Telegram without leaving the chat!\n\n` +
    `⚡ *Real-Time Telemetry Surface:*\n` +
    `• *4F Currency Grid* — Focus, Facts, Funds, and Vital Energy Battery\n` +
    `• *Aristotelian Equilibrium Radar* — Real-time dynamic virtue balance\n` +
    `• *Active WoW Plugins* — Current cognitive architectures & flow states\n` +
    `• *Trade Feed* — Recent time-value transactions with energy deltas\n` +
    `• *Reward Bank* — Active validation gates and unlocked guilt-free rewards\n\n` +
    `_Optimized for instant mobile viewing with zero latency._`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
