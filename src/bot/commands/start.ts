import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getUserState } from "../../db/firestore.js";

export async function handleStart(ctx: Context) {
  const userId = ctx.from?.id.toString() || "default";
  await getUserState(userId);

  const keyboard = new InlineKeyboard()
    .webApp("📊 Open Visual HUD", `https://fabric-one-sage.vercel.app/api/dashboard?userId=${userId}`)
    .text("🌅 Morning Flight Plan", "action:briefing")
    .row()
    .text("⚡ Spark Session", "action:spark_prompt")
    .text("⚖️ Telemetry", "action:balance")
    .row()
    .text("🧩 Plugins (WoW)", "action:plugins")
    .text("❓ Ask Advisor", "action:ask_prompt");

  const welcomeMessage = `
🌌 *Welcome to The Fabric: 4F Meta-OS*

*Core Currencies:*
⏳ *Focus* (Time & Attention)
💡 *Facts* (Knowledge & Capabilities)
💰 *Funds* (Capital & Vitality)
🔄 *Feedback* (AI Refinement Loop)

*Key Operations:*
📊 \`/dashboard\` — Open live in-chat Visual HUD
🌅 \`/briefing\` — Daily Flight Plan & Focus Budget
⚡ \`/spark <task>\` — Start an uninterrupted flow block
🏁 \`/settle <outcome>\` — Finish block & log trade
🧪 \`/simulate <idea>\` — Systems simulation before adopting
🧩 \`/plugins\` — Hot-swap Ways of Working (WoW)
🎨 \`/muse\` — Creative Chaos & monotony interrupter
🏛️ \`/portfolio\` — Compounding capability synthesis
📓 \`/notion\` — Sync Knowledge Garden to Notion

🎙️ *Voice-First Ingestion:*
_Hold the mic button and speak anytime! Send a voice memo to log trades, bank wins, or ask questions hands-free._
`;

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
