import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getUserState } from "../../db/firestore.js";

export async function handleStart(ctx: Context) {
  const userId = ctx.from?.id.toString() || "default";
  await getUserState(userId);

  const keyboard = new InlineKeyboard()
    .text("⚡ Spark Session", "action:spark_prompt")
    .text("📊 Telemetry", "action:balance")
    .row()
    .text("🏆 Bank Win", "action:win_prompt")
    .text("❓ Ask Advisor", "action:ask_prompt");

  const welcomeMessage = `
🌌 *Welcome to The Fabric: 4F Meta-OS*

*Core Currencies:*
⏳ *Focus* (Time & Attention)
💡 *Facts* (Knowledge & Capabilities)
💰 *Funds* (Capital & Vitality)
🔄 *Feedback* (AI Refinement Loop)

*Operational Commands:*
⚡ \`/spark <task> [duration]\` — Start a focused execution block
🏁 \`/settle <outcome & energy>\` — Close out active session & log trade
📝 \`/log <text>\` — Quick-log a trade (Gemini auto-extracts metrics)
🏆 \`/win <breakthrough>\` — Bank a triumph or milestone (Hopecore)
⚠️ \`/gotcha <pitfall>\` — Record a bug, trap, or hard-learned lesson
📊 \`/balance\` — View currency telemetry & Aristotelian equilibrium
❓ \`/ask <question>\` — Consult the 4F Advisor on trade-offs

🎙️ *Voice-First Ingestion:*
_You can send raw voice memos anytime! The bot transcribes, detects intent, and logs trades or gotchas hands-free._
`;

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
