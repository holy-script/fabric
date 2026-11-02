import type { Context } from "grammy";
import { InputFile, InlineKeyboard } from "grammy";
import fs from "fs";
import { browsePage, runAiModeQuery, syncNotebookLM } from "../../browser/tool.js";

export async function handleBrowserCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();
  const queryOrUrl = parts.slice(2).join(" ").trim();

  // 1. /browser <url> or /browser view <url>
  if (subCommand && (subCommand.startsWith("http://") || subCommand.startsWith("https://"))) {
    const url = subCommand;
    const waitMsg = await ctx.reply(`🌐 *Browsing:* \`${url}\`...`, { parse_mode: "Markdown" });

    try {
      const res = await browsePage(url, { screenshot: true, extractText: true });
      const snippet = (res.text || "No text content extracted.").slice(0, 1000);

      let reply = `🌐 *Browser Snapshot: ${res.title}*\n`;
      reply += `🔗 \`${res.url}\` (HTTP ${res.status})\n\n`;
      reply += `📝 *Extracted Content:*\n${snippet}...\n`;

      if (res.screenshotPath && fs.existsSync(res.screenshotPath)) {
        await ctx.replyWithPhoto(new InputFile(res.screenshotPath), {
          caption: reply.slice(0, 1024),
          parse_mode: "Markdown",
        });
        fs.unlinkSync(res.screenshotPath);
      } else {
        await ctx.reply(reply, { parse_mode: "Markdown" });
      }

      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ *Browser Error:* ${err.message}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // 2. /browser aimode <query>
  if (subCommand === "aimode" && queryOrUrl) {
    const waitMsg = await ctx.reply(`🧠 *Running Google AI Mode via Browser:* _"${queryOrUrl}"_...`, {
      parse_mode: "Markdown",
    });

    try {
      const result = await runAiModeQuery(queryOrUrl);
      let reply = `🌐 *Google AI Mode Generative Synthesis:*\n\n`;
      reply += `${result.markdown.slice(0, 3500)}\n\n`;

      if (result.citations && result.citations.length > 0) {
        reply += `📚 *Citations & Sources:*\n`;
        for (const c of result.citations.slice(0, 4)) {
          reply += `• [${c.title}](${c.url})\n`;
        }
      }

      const keyboard = new InlineKeyboard();
      if (result.shareUrl) {
        keyboard.url("🔗 Open AI Mode Session", result.shareUrl);
      }

      await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, reply, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ *AI Mode Error:* ${err.message}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // 3. Default Guide
  let guide = `🌐 *Fabric OS: Autonomous Browser & Desktop Automation*\n\n`;
  guide += `Powered by \`puppeteer-core\` connected to your authenticated Google Chrome profile.\n\n`;
  guide += `📌 *Available Commands:*\n`;
  guide += `• \`/browser <url>\` — Browse any page, extract markdown content & capture screenshot\n`;
  guide += `• \`/browser aimode <query>\` — Run live Google AI Mode search with browser session\n`;
  guide += `• \`/nlm auto <subject>\` — Zero-click upload and podcast generation in NotebookLM\n`;
  guide += `• \`/task <goal>\` — Compile and execute hierarchical multi-step goal DAG\n`;

  await ctx.reply(guide, { parse_mode: "Markdown" });
}

export async function handleAiModeDirect(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const query = text.replace(/^\/aimode\s*/i, "").trim();

  if (!query) {
    await ctx.reply(`Usage: \`/aimode <query>\` — Dispatches Google AI Mode search via your browser session.`, {
      parse_mode: "Markdown",
    });
    return;
  }

  const waitMsg = await ctx.reply(`🧠 *Running Google AI Mode via Browser:* _"${query}"_...`, {
    parse_mode: "Markdown",
  });

  try {
    const result = await runAiModeQuery(query);
    let reply = `🌐 *Google AI Mode Generative Synthesis:*\n\n`;
    reply += `${result.markdown.slice(0, 3500)}\n\n`;

    if (result.citations && result.citations.length > 0) {
      reply += `📚 *Citations & Sources:*\n`;
      for (const c of result.citations.slice(0, 4)) {
        reply += `• [${c.title}](${c.url})\n`;
      }
    }

    const keyboard = new InlineKeyboard();
    if (result.shareUrl) {
      keyboard.url("🔗 Open AI Mode Session", result.shareUrl);
    }

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, reply, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ *AI Mode Error:* ${err.message}`,
      { parse_mode: "Markdown" }
    );
  }
}
