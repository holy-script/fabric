import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  spinProject,
  listProjects,
  getProjectStatus,
  type SpinMode,
} from "../../services/antigravity.js";

/**
 * Telegram Command Handler for /spin
 *
 * Scaffolds and launches a new Google Antigravity autonomous coding project workspace.
 * Usage:
 *   /spin <projectName> [initial prompt]
 *   /spin list
 *   /spin status <projectName>
 */
export async function handleSpin(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const rawArgs = text.replace(/^\/spin\s*/i, "").trim();

  // 1. Display Guide if no arguments
  if (!rawArgs) {
    const guide = `🚀 *Fabric OS: Antigravity Project Spinner*

Instantly scaffold, git-initialize, and leash Google Antigravity (\`agy\`) autonomous coding agents on new workspaces.

📌 *Usage:*
• \`/spin <projectName> [initial prompt]\`
• \`/spin list\` — List all spun projects
• \`/spin status <projectName>\` — Inspect project status

_Examples:_
• \`/spin quantum-vault Build an AES-GCM encrypted local key-value store\`
• \`/spin particle-canvas Create a Three.js interactive particle galaxy\`
• \`/spin rust-hyper-service Build an ultra-fast REST microservice in Axum\`

_Defaults:_
• Path: \`~/Desktop/projects/<projectName>\`
• Scaffolds: \`README.md\`, \`AGENTS.md\`, \`.gitignore\`, \`.gemini/\`
• Architecture: Aristotelian 4F Vector + Kahn HTN Handoff`;

    await ctx.reply(guide, { parse_mode: "Markdown" });
    return;
  }

  const parts = rawArgs.split(/\s+/);
  const subCommand = parts[0]?.toLowerCase();

  // 2. Handle /spin list
  if (subCommand === "list" || subCommand === "ls") {
    const projects = await listProjects();
    if (projects.length === 0) {
      await ctx.reply("📂 *No Antigravity projects found yet.*\nSpin one with `/spin <projectName> <prompt>`", {
        parse_mode: "Markdown",
      });
      return;
    }

    let msg = `📂 *Antigravity Project Workspaces (${projects.length}):*\n\n`;
    for (const p of projects.slice(0, 10)) {
      const statusIcon =
        p.status === "completed"
          ? "✅"
          : p.status === "spinning"
          ? "🌀"
          : p.status === "failed"
          ? "❌"
          : "📦";
      msg += `${statusIcon} *${p.projectName}* (\`${p.status}\`)\n`;
      msg += `   📁 \`${p.projectDir}\`\n`;
      msg += `   🎯 _${p.initialPrompt.slice(0, 60)}${p.initialPrompt.length > 60 ? "..." : ""}_\n\n`;
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
    return;
  }

  // 3. Handle /spin status <projectName>
  if (subCommand === "status") {
    const targetName = parts[1];
    if (!targetName) {
      await ctx.reply("⚠️ *Usage:* `/spin status <projectName>`", { parse_mode: "Markdown" });
      return;
    }

    const p = await getProjectStatus(targetName);
    if (!p) {
      await ctx.reply(`❌ *Project \`${targetName}\` not found.*`, { parse_mode: "Markdown" });
      return;
    }

    let statusMsg = `📊 *Antigravity Project: \`${p.projectName}\`*\n\n`;
    statusMsg += `• *Status:* \`${p.status}\`\n`;
    statusMsg += `• *Mode:* \`${p.mode}\`\n`;
    statusMsg += `• *Directory:* \`${p.projectDir}\`\n`;
    statusMsg += `• *Git:* ${p.gitInitialized ? "✅ Initialized" : "⚠️ Not initialized"}\n`;
    if (p.pid) statusMsg += `• *Process PID:* \`${p.pid}\`\n`;
    if (p.exitCode !== undefined && p.exitCode !== null) statusMsg += `• *Exit Code:* \`${p.exitCode}\`\n`;
    statusMsg += `• *Scaffolded Files:* \`${p.filesScaffolded.join(", ") || "Standard"}\`\n`;
    statusMsg += `• *Created:* ${p.createdAt}\n`;
    statusMsg += `• *Updated:* ${p.updatedAt}\n\n`;
    statusMsg += `🎯 *Initial Directive:*\n_${p.initialPrompt}_\n`;

    if (p.lastOutput) {
      statusMsg += `\n📝 *Latest Output:*\n\`\`\`\n${p.lastOutput.slice(0, 400)}\n\`\`\``;
    }

    await ctx.reply(statusMsg, { parse_mode: "Markdown" });
    return;
  }

  // 4. Handle Spinning New Project: /spin <projectName> [initial prompt]
  const projectName = parts[0];
  const initialPrompt =
    parts.slice(1).join(" ").trim() ||
    `Scaffold, architect, and implement the initial working prototype for ${projectName}.`;

  const statusMsg = await ctx.reply(
    `🌀 *Spinning Workspace for \`${projectName}\`...*\n` +
      `• Scaffolding workspace files (\`README.md\`, \`AGENTS.md\`, \`.gemini/\`)\n` +
      `• Initializing Git branch \`main\`\n` +
      `• Leashing Antigravity CLI (\`agy\`) autonomous session...`,
    { parse_mode: "Markdown" }
  );

  try {
    const result = await spinProject({
      projectName,
      initialPrompt,
      mode: "auto",
      background: true,
    });

    let completionMsg = `🚀 *Antigravity Workspace Spun Successfully!*\n\n`;
    completionMsg += `• *Project:* \`${result.projectName}\`\n`;
    completionMsg += `• *Status:* \`${result.status}\`\n`;
    completionMsg += `• *Workspace:* \`${result.projectDir}\`\n`;
    completionMsg += `• *Mode:* \`${result.mode}\`\n`;
    completionMsg += `• *Git:* ${result.gitInitialized ? "✅ Initialized (main)" : "⚠️ Existed/Skipped"}\n`;
    if (result.pid) completionMsg += `• *Leashed PID:* \`${result.pid}\`\n`;
    completionMsg += `• *Files Created:* \`${result.filesScaffolded.join(", ") || "None (existed)"}\`\n\n`;
    completionMsg += `🎯 *Directive:*\n_${result.initialPrompt}_\n\n`;
    completionMsg += `💻 *Pair Program in Terminal:*\n\`agy --add-dir "${result.projectDir}"\``;

    const keyboard = new InlineKeyboard()
      .text("📊 Check Status", `action:spin_status:${result.projectName}`)
      .text("📂 All Projects", "action:spin_list");

    try {
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, completionMsg, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch {
      await ctx.reply(completionMsg, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }
  } catch (err: any) {
    const errorMsg = `❌ *Failed to spin project \`${projectName}\`:*\n${err?.message || err}`;
    try {
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, errorMsg, {
        parse_mode: "Markdown",
      });
    } catch {
      await ctx.reply(errorMsg, { parse_mode: "Markdown" });
    }
  }
}
