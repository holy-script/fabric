#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { Bot, InputFile } from "grammy";
import { config } from "../src/config/env.js";
import { parseInstagramExport, type ParsedReelItem } from "./import-reels.js";
import { updateKnowledgeItemStreamUrl, getUserState } from "../src/db/firestore.js";
import { appendMediaStreamToNotionPage } from "../src/notion/client.js";

const execFileAsync = promisify(execFile);
const bot = new Bot(config.telegramToken);

const DEFAULT_SAVED_POSTS = path.resolve(process.cwd(), "saved_posts.json");
const DEFAULT_CHECKPOINT_FILE = path.resolve(process.cwd(), ".reels_import_checkpoint.json");
const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");
const DEFAULT_PROXY = "socks5://127.0.0.1:9050";
const TEMP_MEDIA_DIR = path.resolve(os.tmpdir(), "fabric_tg_vault");

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
  fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

interface VaultTracker {
  channelId: string;
  totalArchived: number;
  totalBytesUploaded: number;
  lastUpdated: string;
  archivedUrls: Record<string, {
    reelId: string;
    fileId: string;
    messageId: number;
    telegramUrl: string;
    archivedAt: string;
  }>;
}

function loadVaultTracker(): VaultTracker {
  if (fs.existsSync(VAULT_TRACKER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VAULT_TRACKER_FILE, "utf-8"));
    } catch {}
  }
  return {
    channelId: process.env.TELEGRAM_VAULT_CHANNEL_ID || "",
    totalArchived: 0,
    totalBytesUploaded: 0,
    lastUpdated: new Date().toISOString(),
    archivedUrls: {},
  };
}

function saveVaultTracker(data: VaultTracker) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(VAULT_TRACKER_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ Could not write vault tracker:", err);
  }
}

export function extractReelId(url: string): string {
  const match = url.match(/\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)/);
  return match && match[1] ? match[1] : "reel";
}

async function checkProxy(proxyUrl: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "--socks5-hostname",
      proxyUrl.replace(/^socks5:\/\//, ""),
      "-s",
      "-m",
      "5",
      "https://check.torproject.org/api/ip",
    ]);
    const parsed = JSON.parse(stdout.trim());
    return Boolean(parsed.IsTor);
  } catch {
    return false;
  }
}

async function downloadVideo(url: string, outputDir: string, proxy?: string): Promise<{ filePath: string; sizeBytes: number }> {
  const reelId = extractReelId(url);
  const outTemplate = path.join(outputDir, `${reelId}_${Date.now()}.mp4`);

  const args = [
    "-f",
    "b[ext=mp4]/b",
    "--no-playlist",
    "--no-warnings",
    "-o",
    outTemplate,
  ];

  if (proxy) {
    args.push("--proxy", proxy);
  }

  args.push(url);

  await execFileAsync("yt-dlp", args, { timeout: 90000 });

  if (!fs.existsSync(outTemplate)) {
    // Check if yt-dlp added a different extension
    const matches = fs.readdirSync(outputDir).filter(f => f.startsWith(reelId));
    if (matches.length > 0) {
      const matchPath = path.join(outputDir, matches[0]);
      const stat = fs.statSync(matchPath);
      return { filePath: matchPath, sizeBytes: stat.size };
    }
    throw new Error(`Downloaded file not found at ${outTemplate}`);
  }

  const stat = fs.statSync(outTemplate);
  return { filePath: outTemplate, sizeBytes: stat.size };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);

  let limit: number | undefined;
  let batchSize = 2;
  let channelId = process.env.TELEGRAM_VAULT_CHANNEL_ID;
  let proxy = DEFAULT_PROXY;
  let noProxy = false;
  let delayMs = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--channel" && args[i + 1]) {
      channelId = args[i + 1];
      i++;
    } else if (args[i] === "--no-proxy") {
      noProxy = true;
    } else if (args[i] === "--delay" && args[i + 1]) {
      delayMs = parseInt(args[i + 1], 10) || 3000;
      i++;
    }
  }

  const tracker = loadVaultTracker();
  if (channelId) {
    tracker.channelId = channelId;
  } else if (tracker.channelId) {
    channelId = tracker.channelId;
  }

  // If still missing, check Firestore userState
  if (!channelId) {
    try {
      const state = await getUserState(process.env.TELEGRAM_USER_ID || "1131646846");
      if ((state as any).vaultChannelId) {
        channelId = (state as any).vaultChannelId;
        tracker.channelId = channelId!;
      }
    } catch {}
  }

  console.log("\n🎬 ================ THE FABRIC: TELEGRAM VIDEO VAULT ================");
  console.log(`Channel ID: ${channelId || "❌ NOT SET (Please provide --channel <id> or add to .env)"}`);
  console.log(`Tor SOCKS5: ${noProxy ? "Disabled" : proxy}`);
  console.log(`Temp Dir:   ${TEMP_MEDIA_DIR}`);
  console.log("====================================================================\n");

  if (!channelId) {
    console.error("❌ Missing Telegram Vault Channel ID!");
    console.log(`
To connect your private channel:
1. Create a Private Channel in Telegram (e.g. "Fabric Vault").
2. Add @fabric_os_bot as an Administrator.
3. Forward any post from that channel to @fabric_os_bot, or get its ID (starts with -100).
4. Run:
   bun run scripts/archive-telegram-vault.ts --channel <channel_id>
    `);
    process.exit(1);
  }

  // Test Channel Permissions
  try {
    const chat = await bot.api.getChat(channelId);
    console.log(`✅ Connected to Telegram Channel: "${chat.title}" (${chat.id})\n`);
  } catch (err: any) {
    console.error(`❌ Could not access channel ${channelId}:`, err.message);
    console.log("👉 Make sure @fabric_os_bot is added to the channel as an Administrator!");
    process.exit(1);
  }

  // Test Tor Proxy
  const torActive = noProxy ? false : await checkProxy(proxy);
  if (!noProxy) {
    console.log(`🛡️  Tor SOCKS5 Proxy: ${torActive ? "ACTIVE & ROTATING ✅" : "UNAVAILABLE (falling back to direct) ⚠️"}`);
  }

  // Load Checkpoint & Queue
  const checkpoint = JSON.parse(fs.readFileSync(DEFAULT_CHECKPOINT_FILE, "utf-8"));
  const checkpointEntries = Object.entries(checkpoint.processedUrls);

  const pendingItems: Array<{ url: string; reelId: string; title: string; firestoreId?: string; notionUrl?: string }> = [];

  for (const [url, entry] of checkpointEntries) {
    const item = entry as any;
    if (!tracker.archivedUrls[url] && !item.telegramUrl) {
      pendingItems.push({
        url,
        reelId: extractReelId(url),
        title: item.title || "Instagram Reel",
        firestoreId: item.firestoreId,
        notionUrl: item.notionUrl,
      });
    }
  }

  console.log(`📦 Total Processed in Garden: ${checkpointEntries.length}`);
  console.log(`📹 Already in Telegram Vault:  ${Object.keys(tracker.archivedUrls).length}`);
  console.log(`⏳ Pending Video Archival:    ${pendingItems.length}`);

  const queue = limit ? pendingItems.slice(0, limit) : pendingItems;
  console.log(`⚡ Processing queue of ${queue.length} item(s)...\n`);

  let success = 0;
  let errors = 0;

  for (let idx = 0; idx < queue.length; idx++) {
    const item = queue[idx];
    console.log(`\n[${idx + 1}/${queue.length}] 📥 "${item.title}"`);
    console.log(`   Reel ID: ${item.reelId} | ${item.url}`);

    let downloadedPath: string | null = null;

    try {
      // 1. Download via Tor yt-dlp
      process.stdout.write("   ⬇️  Downloading full video (.mp4)... ");
      const dl = await downloadVideo(item.url, TEMP_MEDIA_DIR, torActive ? proxy : undefined);
      downloadedPath = dl.filePath;
      const mbSize = (dl.sizeBytes / (1024 * 1024)).toFixed(2);
      console.log(`Done! (${mbSize} MB)`);

      // 2. Upload full video directly to Telegram Channel
      process.stdout.write("   ☁️  Uploading to Telegram Cloud Channel... ");
      const caption = `🎬 ${item.title}\n\n🔗 ${item.url}`;
      const msg = await bot.api.sendVideo(channelId, new InputFile(downloadedPath), {
        caption,
        supports_streaming: true,
      });
      console.log("Uploaded! ✅");

      const fileId = msg.video.file_id;
      const messageId = msg.message_id;
      // Channel direct message link (strip -100 prefix)
      const cleanChannelNum = channelId.replace(/^-100/, "");
      const tgUrl = `https://t.me/c/${cleanChannelNum}/${messageId}`;

      console.log(`   📱 Telegram Stream Link: ${tgUrl}`);
      console.log(`   🔑 Telegram File ID: ${fileId.slice(0, 20)}...`);

      // 3. Update Firestore
      if (item.firestoreId) {
        try {
          await updateKnowledgeItemStreamUrl(item.firestoreId, tgUrl, "telegram-cloud", fileId, "video");
          console.log(`   🔥 Updated Firestore item (${item.firestoreId})`);
        } catch (fErr: any) {
          console.warn(`   ⚠️ Firestore warning:`, fErr.message);
        }
      }

      // 4. Update Notion
      if (item.notionUrl) {
        try {
          await appendMediaStreamToNotionPage(item.notionUrl, tgUrl, "video");
          console.log(`   📓 Appended playable link to Notion`);
        } catch (nErr: any) {
          console.warn(`   ⚠️ Notion warning:`, nErr.message);
        }
      }

      // 5. Update Local Tracker
      tracker.archivedUrls[item.url] = {
        reelId: item.reelId,
        fileId,
        messageId,
        telegramUrl: tgUrl,
        archivedAt: new Date().toISOString(),
      };
      tracker.totalArchived = Object.keys(tracker.archivedUrls).length;
      tracker.totalBytesUploaded += dl.sizeBytes;
      saveVaultTracker(tracker);

      success++;
    } catch (err: any) {
      errors++;
      console.error(`   ❌ Archival failed: ${err.message}`);
    } finally {
      // Clean up local temp file immediately
      if (downloadedPath && fs.existsSync(downloadedPath)) {
        try {
          fs.unlinkSync(downloadedPath);
        } catch {}
      }
    }

    if (idx + 1 < queue.length) {
      await sleep(delayMs);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Video Archival Run Complete!");
  console.log(`✅ Uploaded to Telegram Vault: ${success}`);
  console.log(`⚠️ Errors: ${errors}`);
  console.log(`📹 Total Videos Stored in Vault: ${tracker.totalArchived}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
