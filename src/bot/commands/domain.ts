import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  getAllDomains,
  getUserDomainState,
  swapDomain,
  activateDomain,
  benchDomain,
  addCustomDomain,
} from "../../domains/manager.js";

export async function handleDomain(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const rawText = ctx.message?.text?.replace(/^\/(?:domain|domains)\s*/i, "").trim();

  // 1. Subcommand: swap <fromId> <toId>
  if (rawText?.startsWith("swap ")) {
    const parts = rawText.replace(/^swap\s+/i, "").trim().split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply(
        `Usage: \`/domain swap <active_id> <bench_id>\`\n\n` +
          `_Example: \`/domain swap somatic-grooming kinetic-cns\`_`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    const [fromId, toId] = parts;
    const res = await swapDomain(userId, fromId, toId);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    return;
  }

  // 2. Subcommand: bench <id>
  if (rawText?.startsWith("bench ")) {
    const id = rawText.replace(/^bench\s+/i, "").trim();
    const res = await benchDomain(userId, id);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    return;
  }

  // 3. Subcommand: activate / mount <id>
  if (rawText?.startsWith("activate ") || rawText?.startsWith("mount ")) {
    const id = rawText.replace(/^(?:activate|mount)\s+/i, "").trim();
    const res = await activateDomain(userId, id);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    return;
  }

  // 4. Subcommand: add <name> [| pillar | desc]
  if (rawText?.startsWith("add ")) {
    const content = rawText.replace(/^add\s+/i, "").trim();
    const parts = content.split("|").map((s) => s.trim());
    const name = parts[0];
    const pillar = parts[1] || "Custom Craft";
    const description = parts[2] || `Custom focus domain for ${name}.`;

    const res = await addCustomDomain(userId, { name, pillar, description });
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    return;
  }

  // 5. Default: Show Active Workbench Slots vs Bench
  const state = await getUserDomainState(userId);
  const { active, bench } = await getAllDomains(userId);

  let text = `🎛️ *FABRIC DOMAIN WORKBENCH*\n\n`;
  text += `Life is non-linear; categories must never calcify. Your workbench holds **${active.length}/${state.maxActiveSlots} Active Slots**.\n\n`;

  text += `⚡ *ACTIVE MOUNTED SLOTS:*\n`;
  active.forEach((d, i) => {
    const cmdText = d.suggestedCommands && d.suggestedCommands.length > 0
      ? ` \`${d.suggestedCommands[0]}\``
      : "";
    text += `*${i + 1}.* ${d.icon} *${d.name}* (\`${d.id}\`)${cmdText}\n   🏛️ _${d.pillar}_ • ${d.description.slice(0, 80)}...\n\n`;
  });

  if (bench.length > 0) {
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🗄️ *RESERVE BENCH (Available to Swap):*\n`;
    bench.forEach((b) => {
      text += `• ${b.icon} *${b.name}* (\`${b.id}\`) — _${b.pillar}_\n`;
    });
    text += `\n`;
  }

  text += `_Commands:_\n`;
  text += `• \`/domain swap <active_id> <bench_id>\`\n`;
  text += `• \`/domain add <Name> | <Pillar> | <Description>\`\n`;
  text += `• \`/domain bench <id>\` or \`/domain activate <id>\``;

  const keyboard = new InlineKeyboard()
    .text("🔄 Quick Swap Kinetic", "action:domain_swap_kinetic")
    .text("⚡ New Custom Domain", "action:domain_add_prompt");

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
