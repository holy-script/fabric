import type { Context } from "grammy";
import { getUserState } from "../../db/firestore.js";

export async function handleStart(ctx: Context) {
  const userId = ctx.from?.id.toString() || "default";
  await getUserState(userId);

  const welcomeMessage = `
🌌 *Welcome to The Fabric: 4F Meta-OS*

*Currencies:*
⏳ *Focus* (Time & Attention)
💡 *Facts* (Knowledge & Capabilities)
💰 *Funds* (Capital & Vitality)
🔄 *Feedback* (AI Refinement Loop)

*Operational Commands:*
⚡ \`/spark <task> [duration]\` — Start a focused execution block
🏁 \`/settle <outcome & energy>\` — Close out active session & log trade
📝 \`/log <text>\` — Quick-log a trade (Gemini auto-extracts 4F metrics)
🏆 \`/win <breakthrough>\` — Bank a triumph or milestone (Hopecore)
⚠️ \`/gotcha <pitfall>\` — Record a bug, trap, or hard-learned lesson
📊 \`/balance\` — View currency balances & Aristotelian state
❓ \`/ask <question>\` — Consult the 4F Advisor on trade-offs

_You can also just send voice notes or text me naturally anytime._
`;

  await ctx.reply(welcomeMessage, { parse_mode: "Markdown" });
}

