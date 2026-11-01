import { db, getUserState } from "../db/firestore.js";
import { BUILTIN_PLUGINS, type PluginDefinition } from "./catalog.js";

export async function getUserActivePlugins(userId: string): Promise<PluginDefinition[]> {
  const state = await getUserState(userId);
  const activeIds = state.activePlugins || ["monotropic-flow"];

  return activeIds
    .map((id) => BUILTIN_PLUGINS[id])
    .filter((p): p is PluginDefinition => Boolean(p));
}

export async function installPlugin(
  userId: string,
  pluginId: string
): Promise<{ success: boolean; message: string }> {
  const plugin = BUILTIN_PLUGINS[pluginId];
  if (!plugin) {
    return {
      success: false,
      message: `Plugin \`${pluginId}\` not found in catalog. Use \`/plugins\` to view available options.`,
    };
  }

  const state = await getUserState(userId);
  const current = new Set(state.activePlugins || []);

  if (current.has(pluginId)) {
    return {
      success: false,
      message: `Plugin *${plugin.name}* is already active.`,
    };
  }

  current.add(pluginId);
  const updated = Array.from(current);

  await db.collection("userState").doc(userId).set(
    {
      activePlugins: updated,
    },
    { merge: true }
  );

  return {
    success: true,
    message: `✅ Installed plugin: *${plugin.name}*\n_${plugin.description}_`,
  };
}

export async function uninstallPlugin(
  userId: string,
  pluginId: string
): Promise<{ success: boolean; message: string }> {
  const plugin = BUILTIN_PLUGINS[pluginId];
  const state = await getUserState(userId);
  const current = (state.activePlugins || []).filter((id) => id !== pluginId);

  if (current.length === (state.activePlugins || []).length) {
    return {
      success: false,
      message: `Plugin \`${pluginId}\` was not active.`,
    };
  }

  await db.collection("userState").doc(userId).set(
    {
      activePlugins: current,
    },
    { merge: true }
  );

  return {
    success: true,
    message: `🗑️ Deactivated plugin: *${plugin ? plugin.name : pluginId}*`,
  };
}

export async function swapPlugin(
  userId: string,
  oldId: string,
  newId: string
): Promise<{ success: boolean; message: string }> {
  const newPlugin = BUILTIN_PLUGINS[newId];
  if (!newPlugin) {
    return {
      success: false,
      message: `Target plugin \`${newId}\` not found in catalog.`,
    };
  }

  const state = await getUserState(userId);
  const current = (state.activePlugins || []).filter((id) => id !== oldId);
  if (!current.includes(newId)) {
    current.push(newId);
  }

  await db.collection("userState").doc(userId).set(
    {
      activePlugins: current,
    },
    { merge: true }
  );

  const oldName = BUILTIN_PLUGINS[oldId]?.name || oldId;
  return {
    success: true,
    message: `🔄 *Swapped Driver:*\nRemoved: \`${oldName}\`\nInstalled: *${newPlugin.name}*\n_${newPlugin.description}_`,
  };
}

export async function getActivePluginPromptGuidance(userId: string): Promise<string> {
  const plugins = await getUserActivePlugins(userId);
  if (plugins.length === 0) return "";

  const lines = plugins.map((p) => `- [${p.name}]: ${p.promptGuidance}`);
  return `\nActive Ways of Working (WoW) Plugins:\n${lines.join("\n")}\n`;
}

