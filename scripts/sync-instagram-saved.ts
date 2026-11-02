#!/usr/bin/env bun
import { Bot } from "grammy";
import { config } from "../src/config/env.js";
import {
  fetchNewSavedReels,
  getStoredInstagramSession,
  isReelAlreadyIngestedLocally,
  type SavedReelItem,
} from "../src/integrations/instagram/saved-poller.js";
import {
  ingestSavedReel,
  loadCheckpoint,
  loadVaultTracker,
  checkTorProxy,
  DEFAULT_TOR_PROXY,
  type IngestedReelResult,
} from "../src/integrations/instagram/vault-ingester.js";
import { getVaultChannelId } from "../src/db/firestore.js";

const bot = new Bot(config.telegramToken);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanMarkdown(text: string): string {
  return text.replace(/[*_`\[\]()]/g, "");
}

async function sendUserIngestNotification(
  userId: string,
  result: IngestedReelResult
): Promise<void> {
  const vaultLine = result.telegramUrl
    ? `\n🎬 *Video Vault:* [Watch Playable Video](${result.telegramUrl})`
    : "";
  const notionLine = result.notionUrl
    ? `\n📓 *Notion Garden:* [Open Page](${result.notionUrl})`
    : "";

  const message =
    `📥 *New Saved Reel Auto-Ingested!*\n\n` +
    `📌 *Title:* ${cleanMarkdown(result.title)}\n` +
    `👤 *Creator:* @${cleanMarkdown(result.author)}\n` +
    `🧭 *4F Quadrant:* \`${result.quadrant}\` (${result.category})\n\n` +
    `💡 *Actionable Takeaway:*\n` +
    `_${cleanMarkdown(result.takeaway)}_\n\n` +
    `🔗 [Instagram Source](${result.url})` +
    vaultLine +
    notionLine;

  try {
    await bot.api.sendMessage(userId, message, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  } catch (err: any) {
    console.warn(`⚠️ Could not send Telegram notification to user ${userId}:`, err.message);
  }
}

async function printStatus() {
  const session = await getStoredInstagramSession();
  const checkpoint = loadCheckpoint();
  const vaultTracker = loadVaultTracker();
  const torActive = await checkTorProxy();
  const channelId = config.telegramVaultChannelId || (await getVaultChannelId());

  console.log("\n📊 ============ FABRIC: INSTAGRAM AUTO-SYNC STATUS ============");
  console.log(`Instagram Session: ${session?.sessionId ? "Configured & Active ✅" : "Not Configured ❌"}`);
  if (session?.sessionId) {
    const masked = `${session.sessionId.slice(0, 6)}...${session.sessionId.slice(-4)}`;
    console.log(`Session ID:        ${masked}`);
  }
  console.log(`Tor SOCKS5 Proxy:  ${torActive ? "Active (127.0.0.1:9050) ✅" : "Unavailable (Direct mode) ⚠️"}`);
  console.log(`Vault Channel ID:  ${channelId || "Not Configured ❌"}`);
  console.log(`Total In Garden:   ${checkpoint.totalProcessed || Object.keys(checkpoint.processedUrls).length} reels`);
  console.log(`Total in Vault:    ${vaultTracker.totalArchived || Object.keys(vaultTracker.archivedUrls).length} full videos`);
  console.log(`Last Checkpoint:   ${checkpoint.lastUpdated || "N/A"}`);
  console.log("===============================================================\n");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
📱 Fabric OS: Instagram Saved Auto-Sync Pipeline
=================================================
Polls Instagram Saved Reels using authenticated web session,
digests with Gemini into 4F Knowledge Cards, syncs to Notion,
downloads via Tor proxy, and streams into the Telegram Channel Vault.

Usage:
  bun run scripts/sync-instagram-saved.ts [options]

Options:
  --status          Print status and metrics without syncing
  --limit <n>       Max items to fetch from Instagram (default: 20)
  --user <id>       Telegram user ID to credit and notify (default: ${config.telegramUserId})
  --no-vault        Skip video downloading and Telegram channel upload
  --no-tor          Download directly without Tor SOCKS5 proxy
  --no-notify       Do not send notification to Telegram user
  --dry-run         Simulate detection without writes or uploads
  --delay <ms>      Pause between reels in ms (default: 2500)

Examples:
  bun run scripts/sync-instagram-saved.ts
  bun run scripts/sync-instagram-saved.ts --limit 10
  bun run scripts/sync-instagram-saved.ts --status
    `);
    process.exit(0);
  }

  if (args.includes("--status")) {
    await printStatus();
    process.exit(0);
  }

  // Parse arguments
  let limit = 20;
  let userId = config.telegramUserId || "1131646846";
  let skipVault = false;
  let skipTor = false;
  let notify = true;
  let dryRun = false;
  let delayMs = 2500;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10) || 20;
      i++;
    } else if (args[i] === "--user" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (args[i] === "--delay" && args[i + 1]) {
      delayMs = parseInt(args[i + 1], 10) || 2500;
      i++;
    } else if (args[i] === "--no-vault") {
      skipVault = true;
    } else if (args[i] === "--no-tor") {
      skipTor = true;
    } else if (args[i] === "--no-notify") {
      notify = false;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  console.log("\n🔄 ================= FABRIC: INSTAGRAM AUTO-SYNC =================");
  console.log(`Limit:        ${limit} items`);
  console.log(`Target User:  ${userId}`);
  console.log(`Video Vault:  ${skipVault ? "Disabled (--no-vault)" : "Enabled ✅"}`);
  console.log(`Tor Proxy:    ${skipTor ? "Disabled (--no-tor)" : "Enabled ✅"}`);
  console.log(`Notification: ${notify ? "Enabled ✅" : "Disabled"}`);
  console.log(`Mode:         ${dryRun ? "🧪 DRY RUN" : "🚀 LIVE INGESTION"}`);
  console.log("=================================================================\n");

  // 1. Retrieve session
  const session = await getStoredInstagramSession();
  if (!session?.sessionId) {
    console.error("❌ No Instagram session configured!");
    console.error("👉 Please set INSTAGRAM_SESSION_ID in .env or run /syncig session <sessionid> in Telegram.");
    process.exit(1);
  }

  const masked = `${session.sessionId.slice(0, 6)}...${session.sessionId.slice(-4)}`;
  console.log(`🔑 Using Instagram Session: ${masked}`);

  // 2. Fetch saved items from Instagram
  console.log(`🌐 Querying Instagram Web API for saved posts (up to ${limit})...`);
  let savedItems: SavedReelItem[] = [];
  try {
    savedItems = await fetchNewSavedReels(session.sessionId, limit);
  } catch (err: any) {
    console.error("❌ Failed to fetch from Instagram:", err.message);
    process.exit(1);
  }

  console.log(`📦 Retrieved ${savedItems.length} saved post(s) from Instagram.`);

  if (savedItems.length === 0) {
    console.log("ℹ️ No saved items returned. Instagram feed may be empty or session needs refresh.");
    process.exit(0);
  }

  // 3. Filter for items not yet ingested
  const pendingItems = savedItems.filter((item) => !isReelAlreadyIngestedLocally(item.url));

  console.log(`🔍 Checkpoint filter: ${savedItems.length - pendingItems.length} already ingested, ${pendingItems.length} NEW.`);

  if (pendingItems.length === 0) {
    console.log("🎉 All recent saved reels are already ingested! Nothing to do.");
    process.exit(0);
  }

  if (dryRun) {
    console.log(`\n🧪 DRY RUN: Would ingest ${pendingItems.length} new reel(s):`);
    pendingItems.forEach((item, idx) => {
      console.log(`   ${idx + 1}. [${item.code}] ${item.title} (@${item.author})`);
      console.log(`      ${item.url}`);
    });
    process.exit(0);
  }

  // 4. Ingest each new item
  const results: IngestedReelResult[] = [];
  let errorCount = 0;

  for (let idx = 0; idx < pendingItems.length; idx++) {
    const item = pendingItems[idx];
    console.log(`\n[${idx + 1}/${pendingItems.length}] 📥 Ingesting: "${item.title}"`);
    console.log(`   URL: ${item.url} | Author: @${item.author}`);

    try {
      const result = await ingestSavedReel(item, {
        userId,
        skipVault,
        skipTor,
        bot,
      });

      results.push(result);
      console.log(`   ✅ 4F Knowledge Card: [${result.quadrant}] "${result.title}"`);
      if (result.firestoreId) console.log(`   🔥 Firestore ID: ${result.firestoreId}`);
      if (result.notionUrl) console.log(`   📓 Notion Synced: ${result.notionUrl}`);
      if (result.telegramUrl) console.log(`   🎬 Telegram Vault: ${result.telegramUrl}`);

      // 5. Send notification to Telegram bot user
      if (notify) {
        process.stdout.write("   📱 Sending notification to user... ");
        await sendUserIngestNotification(userId, result);
        console.log("Sent! ✅");
      }
    } catch (err: any) {
      errorCount++;
      console.error(`   ❌ Ingestion failed: ${err.message}`);
    }

    if (idx + 1 < pendingItems.length) {
      await sleep(delayMs);
    }
  }

  console.log("\n" + "=".repeat(65));
  console.log("🎉 Auto-Sync Run Complete!");
  console.log(`✅ Successfully Ingested: ${results.length}`);
  if (errorCount > 0) console.log(`⚠️ Errors: ${errorCount}`);
  console.log("=".repeat(65));
}

main().catch((err) => {
  console.error("\n❌ Fatal script error:", err);
  process.exit(1);
});
