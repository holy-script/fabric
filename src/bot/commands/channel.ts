import type { Context } from "grammy";
import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

export async function handleSetChannel(ctx: Context) {
  const text = ctx.message?.text?.replace(/^\/setchannel\s*/i, "").trim();

  if (!text) {
    await ctx.reply(
      `🎬 *Telegram Video Vault Setup*\n\n` +
        `Usage: \`/setchannel <channel_id>\`\n\n` +
        `_How to get your channel ID:_\n` +
        `1. Create a Private Channel in Telegram (e.g. "Fabric Vault").\n` +
        `2. Add @fabric_os_bot as an **Administrator**.\n` +
        `3. Forward any message from that channel directly into this chat!`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const channelId = text;

  try {
    const chat = await ctx.api.getChat(channelId);
    process.env.TELEGRAM_VAULT_CHANNEL_ID = channelId;

    // Append/update .env file
    if (fs.existsSync(ENV_PATH)) {
      let content = fs.readFileSync(ENV_PATH, "utf-8");
      if (content.includes("TELEGRAM_VAULT_CHANNEL_ID=")) {
        content = content.replace(/TELEGRAM_VAULT_CHANNEL_ID=.*/, `TELEGRAM_VAULT_CHANNEL_ID=${channelId}`);
      } else {
        content += `\nTELEGRAM_VAULT_CHANNEL_ID=${channelId}\n`;
      }
      fs.writeFileSync(ENV_PATH, content, "utf-8");
    }

    await ctx.reply(
      `🎉 *Vault Channel Connected!*\n\n` +
        `📁 Channel: *${chat.title}*\n` +
        `🆔 ID: \`${channelId}\`\n\n` +
        `The archiver is now ready to stream all 3,843 full video files directly into this channel!`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.reply(
      `❌ Could not access channel \`${channelId}\`.\n\n` +
        `Error: _${err.message}_\n\n` +
        `*Checklist:*\n` +
        `1. Did you add @fabric_os_bot to the channel?\n` +
        `2. Did you promote it to **Administrator**?`,
      { parse_mode: "Markdown" }
    );
  }
}
