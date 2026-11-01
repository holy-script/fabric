import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  BUILTIN_PLUGINS,
  type PluginDefinition,
} from "../../plugins/catalog.js";
import {
  getUserActivePlugins,
  installPlugin,
  uninstallPlugin,
  swapPlugin,
} from "../../plugins/manager.js";

export async function handlePlugins(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const active = await getUserActivePlugins(userId);
  const activeIds = new Set(active.map((p) => p.id));

  const activeSection =
    active.length > 0
      ? active
          .map((p) => `• 🧩 *${p.name}* (\`${p.id}\`)\n  _${p.description}_`)
          .join("\n\n")
      : "_No plugins active. Defaulting to standard monotropic flow._";

  const catalog = Object.values(BUILTIN_PLUGINS);
  const keyboard = new InlineKeyboard();

  catalog.forEach((p, index) => {
    const isActive = activeIds.has(p.id);
    const label = isActive ? `✅ ${p.name}` : `➕ ${p.name}`;
    const callbackData = isActive
      ? `plugin:uninstall:${p.id}`
      : `plugin:install:${p.id}`;

    keyboard.text(label, callbackData);
    if (index % 2 === 1) keyboard.row();
  });

  const message = `
🧩 *The Fabric: Ways of Working (WoW) Plugins*

*Currently Active Drivers:*
${activeSection}

---
*Catalog (Tap to Toggle / Install / Deactivate):*
`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleInstall(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const pluginId = ctx.message?.text?.replace(/^\/install\s*/i, "").trim();
  if (!pluginId) {
    await ctx.reply(
      `Usage: \`/install <plugin_id>\`\n_Example: \`/install plyo-vitality\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const result = await installPlugin(userId, pluginId);
  await ctx.reply(result.message, { parse_mode: "Markdown" });
}

export async function handleUninstall(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const pluginId = ctx.message?.text?.replace(/^\/uninstall\s*/i, "").trim();
  if (!pluginId) {
    await ctx.reply(
      `Usage: \`/uninstall <plugin_id>\`\n_Example: \`/uninstall strict-pomodoro\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const result = await uninstallPlugin(userId, pluginId);
  await ctx.reply(result.message, { parse_mode: "Markdown" });
}

export async function handleSwap(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const args = ctx.message?.text
    ?.replace(/^\/swap\s*/i, "")
    .trim()
    .split(/\s+/);

  if (!args || args.length < 2) {
    await ctx.reply(
      `Usage: \`/swap <old_plugin> <new_plugin>\`\n_Example: \`/swap strict-pomodoro monotropic-flow\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const [oldId, newId] = args;
  const result = await swapPlugin(userId, oldId, newId);
  await ctx.reply(result.message, { parse_mode: "Markdown" });
}
