import type { Context } from "grammy";
import {
  fetchNewSavedReels,
  getStoredInstagramSession,
  saveStoredInstagramSession,
  verifyInstagramSession,
  isReelAlreadyIngestedLocally,
} from "../../integrations/instagram/saved-poller.js";
import {
  ingestSavedReel,
  loadCheckpoint,
  loadVaultTracker,
  checkTorProxy,
  type IngestedReelResult,
} from "../../integrations/instagram/vault-ingester.js";
import { getVaultChannelId } from "../../db/firestore.js";
import { config } from "../../config/env.js";

/**
 * Strips raw Markdown formatting tokens to prevent Telegram markdown parsing errors.
 */
function cleanMarkdown(text: string): string {
  return text.replace(/[*_`\[\]()]/g, "");
}

/**
 * Mask sensitive session ID for display.
 */
function maskSession(sessionId: string): string {
  if (sessionId.length <= 10) return "******";
  return `${sessionId.slice(0, 6)}...${sessionId.slice(-4)}`;
}

/**
 * Handles the /syncig Telegram command.
 *
 * Workflows:
 * - /syncig session <sessionid>: Securely saves Instagram session cookie and deletes caller message.
 * - /syncig status: Displays connection state, session health, total synced reels & vault channel.
 * - /syncig (or /syncig sync): Polling trigger to fetch recent saved items and ingest new ones into Garden & Vault.
 */
export async function handleSyncIg(ctx: Context) {
  const userId = ctx.from?.id.toString() || config.telegramUserId || "1131646846";
  const rawText = ctx.message?.text || "";
  const parts = rawText.trim().split(/\s+/);
  const subCommand = parts[1]?.toLowerCase();

  // 1. /syncig session <sessionid>
  if (subCommand === "session") {
    // Delete the user's message containing the cookie for security
    await ctx.deleteMessage().catch(() => {});

    const sessionArg = rawText.replace(/^\/syncig\s+session\s*/i, "").trim();

    if (!sessionArg) {
      await ctx.reply(
        `🔐 *Instagram Session Configuration*\n\n` +
          `Usage: \`/syncig session <sessionid_cookie>\`\n\n` +
          `*How to get your sessionid:*\n` +
          `1. Open [instagram.com](https://www.instagram.com) in your desktop browser.\n` +
          `2. Open DevTools (\`F12\` or \`Cmd+Opt+I\`).\n` +
          `3. Go to **Application** (Chrome) or **Storage** (Firefox) ➔ **Cookies** ➔ \`https://www.instagram.com\`.\n` +
          `4. Copy the value of the \`sessionid\` cookie.\n` +
          `5. Send \`/syncig session <copied_value>\` here.\n\n` +
          `🛡️ _Your message containing the sessionid will be deleted automatically the instant it arrives!_`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const verificationMsg = await ctx.reply("🔍 *Verifying Instagram session...*", {
      parse_mode: "Markdown",
    });

    try {
      const saved = await saveStoredInstagramSession(sessionArg);
      const verify = await verifyInstagramSession(saved.sessionId);

      if (verify.valid) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          verificationMsg.message_id,
          `🔒 *Instagram Session Connected Successfully!*\n\n` +
            `🟢 *Status:* Authenticated & Active\n` +
            (verify.username ? `👤 *Account:* @${verify.username}\n` : "") +
            `🔑 *Session ID:* \`${maskSession(saved.sessionId)}\`\n` +
            `🗑️ *Privacy:* Your message containing the secret was deleted from chat.\n\n` +
            `👉 Run \`/syncig\` now to auto-ingest your latest saved reels into the Knowledge Garden and Video Vault!`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          verificationMsg.message_id,
          `⚠️ *Session Saved with Verification Warning*\n\n` +
            `Session was saved, but Instagram test verification returned:\n` +
            `_${cleanMarkdown(verify.error || "Could not reach Instagram API")}_\n\n` +
            `🔑 *Session ID:* \`${maskSession(saved.sessionId)}\`\n` +
            `You can still test syncing with \`/syncig\`.`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        verificationMsg.message_id,
        `❌ *Failed to save Instagram session:*\n_${cleanMarkdown(err.message)}_`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // 2. /syncig status
  if (subCommand === "status") {
    const checkingMsg = await ctx.reply("🔍 *Checking Instagram & Vault status...*", {
      parse_mode: "Markdown",
    });

    try {
      const session = await getStoredInstagramSession();
      const checkpoint = loadCheckpoint();
      const vaultTracker = loadVaultTracker();
      const channelId = (await getVaultChannelId(userId)) || config.telegramVaultChannelId;
      const torActive = await checkTorProxy();

      const totalGarden = checkpoint.totalProcessed || Object.keys(checkpoint.processedUrls).length;
      const totalVault = vaultTracker.totalArchived || Object.keys(vaultTracker.archivedUrls).length;

      let channelName = "Not Connected";
      if (channelId) {
        try {
          const chat = await ctx.api.getChat(channelId);
          channelName = `${chat.title} (\`${channelId}\`)`;
        } catch {
          channelName = `\`${channelId}\``;
        }
      }

      const sessionStatus = session?.sessionId
        ? `🟢 Active (\`${maskSession(session.sessionId)}\`)`
        : `🔴 Not Configured (Run \`/syncig session <id>\`)`;

      await ctx.api.editMessageText(
        ctx.chat!.id,
        checkingMsg.message_id,
        `📱 *Instagram Saved Reels & Vault Status*\n\n` +
          `🔐 *Instagram Session:* ${sessionStatus}\n` +
          `🛡️ *Tor SOCKS5 Proxy:* ${torActive ? "Active & Rotating ✅" : "Direct Mode / Tor Inactive ⚠️"}\n` +
          `📁 *Vault Channel:* ${channelName}\n\n` +
          `📊 *Metrics:*\n` +
          `• Knowledge Garden: *${totalGarden}* reels ingested\n` +
          `• Telegram Video Vault: *${totalVault}* full videos archived\n` +
          `• Last Checkpoint Update: \`${checkpoint.lastUpdated || "N/A"}\`\n\n` +
          `*Commands:*\n` +
          `• \`/syncig\` — Trigger auto-sync for recent saves\n` +
          `• \`/syncig session <id>\` — Update Instagram session cookie\n` +
          `• \`/setchannel <id>\` — Connect private vault channel`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        checkingMsg.message_id,
        `❌ *Status check error:* ${cleanMarkdown(err.message)}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // 3. /syncig (or /syncig sync) -> Execute Sync
  const session = await getStoredInstagramSession();

  if (!session?.sessionId) {
    await ctx.reply(
      `⚠️ *Instagram Session Not Configured*\n\n` +
        `To enable zero-click Saved Reel auto-syncing, connect your Instagram web session:\n\n` +
        `1. Open [instagram.com](https://www.instagram.com) in your browser.\n` +
        `2. Open DevTools (\`F12\` or \`Cmd+Opt+I\`) ➔ **Application** ➔ **Cookies** ➔ \`instagram.com\`.\n` +
        `3. Copy the value of \`sessionid\`.\n` +
        `4. Run:\n   \`/syncig session <sessionid>\`\n\n` +
        `🛡️ _Your message will be deleted immediately for privacy!_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const statusMsg = await ctx.reply("🔄 *Polling Instagram Saved Reels...*", {
    parse_mode: "Markdown",
  });

  try {
    // 1. Fetch recent saved reels
    const reels = await fetchNewSavedReels(session.sessionId, 20);

    if (reels.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `ℹ️ *No Saved Reels Found*\n\n` +
          `Instagram returned 0 saved items. Make sure your session is valid or save a reel on Instagram and retry!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // 2. Filter for items not yet ingested
    const pendingItems = reels.filter((r) => !isReelAlreadyIngestedLocally(r.url));

    if (pendingItems.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        `✅ *All Saved Reels Up to Date!*\n\n` +
          `Polled recent *${reels.length}* saved reels from Instagram.\n` +
          `All items have already been digested into the Knowledge Garden and archived in the Vault!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `📥 *Found ${pendingItems.length} new saved reel(s)!*\n\n` +
        `Processing through 4F Gemini synthesizer, Firestore, and Telegram Video Vault...`,
      { parse_mode: "Markdown" }
    );

    const results: IngestedReelResult[] = [];
    const errors: string[] = [];

    for (let idx = 0; idx < pendingItems.length; idx++) {
      const item = pendingItems[idx];
      try {
        const res = await ingestSavedReel(item, {
          userId,
          bot: ctx.api as any,
        });
        results.push(res);
      } catch (err: any) {
        console.error(`Error ingesting reel ${item.url}:`, err);
        errors.push(`• *${cleanMarkdown(item.title.slice(0, 30))}*: ${cleanMarkdown(err.message)}`);
      }
    }

    // Build summary response
    const lines = results.map((r, i) => {
      const tgPart = r.telegramUrl ? ` · [Watch in Vault](${r.telegramUrl})` : "";
      const notionPart = r.notionUrl ? ` · [Notion](${r.notionUrl})` : "";
      return (
        `${i + 1}. *[${r.quadrant.toUpperCase()}]* ${cleanMarkdown(r.title)}\n` +
        `   👤 @${cleanMarkdown(r.author)}${tgPart}${notionPart}\n` +
        `   💡 _${cleanMarkdown(r.takeaway.slice(0, 100))}_`
      );
    });

    let summaryText =
      `🎉 *Instagram Auto-Sync Complete!*\n\n` +
      `📥 Processed: *${results.length}/${pendingItems.length}* new reel(s)\n` +
      `🔥 *Knowledge Garden:* Saved to Firestore\n` +
      `🎬 *Telegram Vault:* Video files archived\n\n` +
      `*Newly Ingested Reels:*\n` +
      lines.join("\n\n");

    if (errors.length > 0) {
      summaryText += `\n\n⚠️ *Warnings (${errors.length}):*\n` + errors.join("\n");
    }

    try {
      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, summaryText, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        summaryText.replace(/[*_`]/g, ""),
        { link_preview_options: { is_disabled: true } }
      );
    }
  } catch (err: any) {
    console.error("Instagram sync execution error:", err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ *Instagram Sync Failed:*\n_${cleanMarkdown(err.message)}_\n\n` +
        `If your session expired, update it using \`/syncig session <new_sessionid>\`.`,
      { parse_mode: "Markdown" }
    );
  }
}
