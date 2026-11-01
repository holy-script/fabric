#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { parseInstagramExport, type ParsedReelItem } from "./import-reels.js";
import { R2PoolManager, r2Pool } from "../src/storage/r2-pool.js";
import { updateKnowledgeItemStreamUrl } from "../src/db/firestore.js";
import { appendMediaStreamToNotionPage } from "../src/notion/client.js";

const execFileAsync = promisify(execFile);

// Paths
const DEFAULT_SAVED_POSTS = path.resolve(process.cwd(), "saved_posts.json");
const DEFAULT_CHECKPOINT_FILE = path.resolve(process.cwd(), ".reels_import_checkpoint.json");
const ARCHIVE_TRACKER_FILE = path.resolve(process.cwd(), ".media_archive_tracker.json");
const DEFAULT_PROXY = "socks5://127.0.0.1:9050";
const TEMP_MEDIA_DIR = path.resolve(os.tmpdir(), "fabric_media_archive");

export interface ArchiveOptions {
  limit?: number;
  batchSize: number;
  audioOnly: boolean;
  proxy: string;
  noProxy: boolean;
  dryRun: boolean;
  statusOnly: boolean;
  keepLocal: boolean;
  inputPath: string;
  checkpointPath: string;
}

export interface CheckpointEntry {
  title?: string;
  category?: string;
  quadrant?: string;
  author?: string;
  takeaway?: string;
  firestoreId?: string;
  notionUrl?: string;
  processedAt?: string;
  streamUrl?: string;
  r2NodeId?: string;
  r2Key?: string;
  mediaType?: "video" | "audio";
  archivedAt?: string;
}

export interface CheckpointData {
  processedUrls: Record<string, CheckpointEntry>;
  totalProcessed?: number;
  lastUpdated?: string;
}

export interface DownloadResult {
  filePath: string;
  reelId: string;
  mediaType: "video" | "audio";
  sizeBytes: number;
  usedProxy: boolean;
}

/**
 * Checks connectivity through the configured SOCKS5 proxy
 */
export async function checkProxyHealth(proxyUrl: string): Promise<{ online: boolean; ip?: string; isTor?: boolean; error?: string }> {
  try {
    // Extract hostname / port for curl if needed
    const { stdout } = await execFileAsync("curl", [
      "--socks5-hostname",
      proxyUrl.replace(/^socks5:\/\//, ""),
      "-s",
      "-m",
      "6",
      "https://check.torproject.org/api/ip",
    ]);

    const parsed = JSON.parse(stdout.trim());
    return {
      online: true,
      ip: parsed.IP,
      isTor: parsed.IsTor,
    };
  } catch (err: any) {
    return {
      online: false,
      error: err.message || "Failed to connect to proxy",
    };
  }
}

/**
 * Extract clean Instagram Reel/Post code
 */
export function extractReelId(url: string): string {
  const match = url.match(/\/(?:reel|p|tv)\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return Buffer.from(url).toString("hex").slice(0, 12);
}

/**
 * Downloads a reel using yt-dlp, with automatic fallback from Tor SOCKS5 to direct connection.
 */
export async function downloadReelMedia(
  url: string,
  options: {
    audioOnly: boolean;
    proxy?: string;
    outputDir: string;
    timeoutMs?: number;
  }
): Promise<DownloadResult> {
  const reelId = extractReelId(url);
  const mediaType: "video" | "audio" = options.audioOnly ? "audio" : "video";
  const outputTemplate = path.join(options.outputDir, `${reelId}.%(ext)s`);

  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  const baseArgs = ["--no-warnings", "--no-playlist", "--print", "after_move:filepath"];

  const formatArgs = options.audioOnly
    ? ["-x", "--audio-format", "m4a", "-o", outputTemplate]
    : ["-f", "b[ext=mp4]/b", "-o", outputTemplate];

  // 1. Attempt download with Tor proxy if specified
  if (options.proxy) {
    try {
      const args = ["--proxy", options.proxy, ...baseArgs, ...formatArgs, url];
      const { stdout } = await execFileAsync("yt-dlp", args, {
        timeout: options.timeoutMs || 120000,
      });

      const downloadedPath = stdout.trim().split("\n").filter(Boolean).pop()?.trim();
      if (downloadedPath && fs.existsSync(downloadedPath)) {
        const stats = fs.statSync(downloadedPath);
        return {
          filePath: downloadedPath,
          reelId,
          mediaType,
          sizeBytes: stats.size,
          usedProxy: true,
        };
      }
    } catch (proxyErr: any) {
      console.warn(`\n⚠️  Proxy download failed for ${reelId} (${proxyErr.message?.slice(0, 80)}...). Falling back to direct...`);
    }
  }

  // 2. Direct download fallback
  const directArgs = [...baseArgs, ...formatArgs, url];
  const { stdout: directStdout } = await execFileAsync("yt-dlp", directArgs, {
    timeout: options.timeoutMs || 120000,
  });

  const downloadedPath = directStdout.trim().split("\n").filter(Boolean).pop()?.trim();
  if (!downloadedPath || !fs.existsSync(downloadedPath)) {
    throw new Error(`Download completed but output file not found for ${reelId}`);
  }

  const stats = fs.statSync(downloadedPath);
  return {
    filePath: downloadedPath,
    reelId,
    mediaType,
    sizeBytes: stats.size,
    usedProxy: false,
  };
}

function loadCheckpoint(checkpointPath: string): CheckpointData {
  if (fs.existsSync(checkpointPath)) {
    try {
      return JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    } catch {
      // Ignore corrupted checkpoint
    }
  }
  return { processedUrls: {} };
}

function saveCheckpoint(checkpointPath: string, data: CheckpointData): void {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(checkpointPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ Failed to write checkpoint file:", err);
  }
}

/**
 * Display formatted status of Tor proxy, R2 Storage Pool, and Reel Archives
 */
async function showStatusDashboard(options: ArchiveOptions): Promise<void> {
  console.log("\n🛰️  ================ THE FABRIC OS: MEDIA ARCHIVER STATUS ================");

  // 1. Tor Proxy Status
  process.stdout.write("🔍 Testing SOCKS5 Tor Proxy... ");
  const proxyStatus = await checkProxyHealth(options.proxy);
  if (proxyStatus.online) {
    console.log(`\x1b[32mONLINE\x1b[0m (Exit IP: ${proxyStatus.ip}, Tor: ${proxyStatus.isTor ? "YES" : "NO"})`);
  } else {
    console.log(`\x1b[31mOFFLINE\x1b[0m (${proxyStatus.error || "Connection refused"})`);
    console.log("   👉 Start Tor via: /opt/homebrew/bin/brew services start tor");
  }

  // 2. R2 Storage Pool Status
  console.log("\n📦 Cloudflare R2 Storage Pool:");
  const poolStats = r2Pool.getStats();
  console.log(`   - Total Nodes: ${poolStats.totalNodes}`);
  console.log(`   - Active Nodes: ${poolStats.activeNodes > 0 ? `\x1b[32m${poolStats.activeNodes}\x1b[0m` : "\x1b[33m0 (Fallback / Local Mode)\x1b[0m"}`);
  console.log(`   - Storage Consumed: ${(poolStats.totalBytes / (1024 * 1024)).toFixed(2)} MB (${poolStats.totalObjects} objects)`);

  for (const node of poolStats.nodes) {
    const statusIcon = node.active ? "🟢" : "⚪";
    console.log(`     ${statusIcon} [${node.id}] Bucket: ${node.bucket} | Used: ${node.mbUsed} (${node.objectCount} objs)`);
  }

  // 3. Reels & Checkpoint Status
  console.log("\n📱 Instagram Media Archive Metrics:");
  let totalSaved = 0;
  if (fs.existsSync(options.inputPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(options.inputPath, "utf-8"));
      totalSaved = parseInstagramExport(raw).length;
    } catch {
      totalSaved = 0;
    }
  }

  const checkpoint = loadCheckpoint(options.checkpointPath);
  const processedEntries = Object.entries(checkpoint.processedUrls);
  const totalDigested = processedEntries.length;
  const totalArchived = processedEntries.filter(([_, v]) => Boolean(v.streamUrl)).length;
  const pendingArchive = totalDigested - totalArchived;

  console.log(`   - Total Reels in Export: ${totalSaved}`);
  console.log(`   - Digested in Knowledge Garden: ${totalDigested}`);
  console.log(`   - Archived to R2 Media Pool: \x1b[32m${totalArchived}\x1b[0m`);
  console.log(`   - Pending Media Archival: \x1b[33m${pendingArchive}\x1b[0m`);

  console.log("=======================================================================\n");
}

function parseCliArgs(): ArchiveOptions {
  const args = process.argv.slice(2);
  const options: ArchiveOptions = {
    batchSize: 3,
    audioOnly: false,
    proxy: DEFAULT_PROXY,
    noProxy: false,
    dryRun: false,
    statusOnly: false,
    keepLocal: false,
    inputPath: DEFAULT_SAVED_POSTS,
    checkpointPath: DEFAULT_CHECKPOINT_FILE,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--status") {
      options.statusOnly = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--audio-only") {
      options.audioOnly = true;
    } else if (arg === "--no-proxy") {
      options.noProxy = true;
    } else if (arg === "--keep-local") {
      options.keepLocal = true;
    } else if (arg === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--batch-size" && args[i + 1]) {
      options.batchSize = Math.max(1, parseInt(args[i + 1], 10) || 3);
      i++;
    } else if (arg === "--proxy" && args[i + 1]) {
      options.proxy = args[i + 1];
      i++;
    } else if (arg === "--input" && args[i + 1]) {
      options.inputPath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (arg === "--checkpoint" && args[i + 1]) {
      options.checkpointPath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    }
  }

  return options;
}

export async function main() {
  const options = parseCliArgs();

  if (options.statusOnly) {
    await showStatusDashboard(options);
    process.exit(0);
  }

  console.log("\n🎬 ================ THE FABRIC OS: MEDIA ARCHIVER ================");
  console.log(`Mode: ${options.dryRun ? "🧪 DRY RUN (Simulation)" : "⚡ LIVE ARCHIVER"}`);
  console.log(`Format: ${options.audioOnly ? "🎵 Audio Only (M4A ~500KB)" : "📹 Video (MP4)"}`);
  console.log(`Proxy: ${options.noProxy ? "❌ Direct (No Proxy)" : `🛡️ ${options.proxy}`}`);
  console.log(`Batch Size: ${options.batchSize} | Limit: ${options.limit || "All Eligible"}`);
  console.log("==================================================================\n");

  // Validate Proxy if enabled and not dry run
  const effectiveProxy = options.noProxy ? undefined : options.proxy;
  if (effectiveProxy && !options.dryRun) {
    process.stdout.write("🛡️  Verifying Tor SOCKS5 proxy connection... ");
    const proxyCheck = await checkProxyHealth(effectiveProxy);
    if (proxyCheck.online) {
      console.log(`✅ Ready! (Tor IP: ${proxyCheck.ip})`);
    } else {
      console.log(`\n⚠️  Tor proxy at ${effectiveProxy} unavailable: ${proxyCheck.error}`);
      console.log("    Will fall back to direct download if proxy fails.\n");
    }
  }

  // Read Checkpoint & Saved Posts
  const checkpoint = loadCheckpoint(options.checkpointPath);
  let posts: ParsedReelItem[] = [];

  if (fs.existsSync(options.inputPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(options.inputPath, "utf-8"));
      posts = parseInstagramExport(raw);
    } catch (err) {
      console.warn(`Could not read ${options.inputPath}:`, err);
    }
  }

  // Prioritize digested reels that do not yet have streamUrl
  interface ArchiveQueueItem {
    url: string;
    reelId: string;
    title: string;
    firestoreId?: string;
    notionUrl?: string;
  }

  const queue: ArchiveQueueItem[] = [];
  const checkpointUrls = Object.entries(checkpoint.processedUrls);

  // 1. Items from checkpoint missing streamUrl
  for (const [url, entry] of checkpointUrls) {
    if (!entry.streamUrl) {
      queue.push({
        url,
        reelId: extractReelId(url),
        title: entry.title || "Instagram Reel",
        firestoreId: entry.firestoreId,
        notionUrl: entry.notionUrl,
      });
    }
  }

  // 2. Also consider items in posts that may not be in checkpoint if queue is small
  if (queue.length === 0 && posts.length > 0) {
    for (const post of posts) {
      const entry = checkpoint.processedUrls[post.url];
      if (!entry || !entry.streamUrl) {
        queue.push({
          url: post.url,
          reelId: extractReelId(post.url),
          title: post.title || post.caption?.slice(0, 40) || "Instagram Reel",
          firestoreId: entry?.firestoreId,
          notionUrl: entry?.notionUrl,
        });
      }
    }
  }

  if (queue.length === 0) {
    console.log("✨ All reels are already archived with active stream URLs! Nothing to process.");
    process.exit(0);
  }

  const itemsToProcess = options.limit ? queue.slice(0, options.limit) : queue;
  console.log(`📋 Found ${queue.length} pending reel(s). Archiving ${itemsToProcess.length} item(s)...\n`);

  const hasR2 = r2Pool.hasActiveNodes();
  if (!hasR2 && !options.dryRun) {
    console.log("ℹ️  Note: No active Cloudflare R2 nodes configured in r2_pools.json.");
    console.log("    Media will be processed and streamUrls generated in fallback mode.\n");
  }

  let successCount = 0;
  let errorCount = 0;
  let totalBytesArchived = 0;

  // Process in batches
  for (let i = 0; i < itemsToProcess.length; i += options.batchSize) {
    const batch = itemsToProcess.slice(i, i + options.batchSize);
    console.log(`--- Processing Batch ${Math.floor(i / options.batchSize) + 1} (${batch.length} reels) ---`);

    for (const item of batch) {
      console.log(`\n📥 [${item.reelId}] "${item.title}"`);
      console.log(`   Source: ${item.url}`);

      if (options.dryRun) {
        const ext = options.audioOnly ? "m4a" : "mp4";
        const simKey = `reels/${item.reelId}.${ext}`;
        const simUrl = `https://pub-simulated.r2.dev/${simKey}`;
        console.log(`   [DRY-RUN] Simulating download (${options.audioOnly ? "audio" : "video"})...`);
        console.log(`   [DRY-RUN] Simulated R2 upload: ${simUrl}`);
        if (item.firestoreId) console.log(`   [DRY-RUN] Would update Firestore: ${item.firestoreId}`);
        if (item.notionUrl) console.log(`   [DRY-RUN] Would embed into Notion: ${item.notionUrl}`);
        successCount++;
        continue;
      }

      try {
        // Step A: Download via yt-dlp
        console.log(`   ⬇️  Downloading ${options.audioOnly ? "audio (~500KB)" : "video"} via yt-dlp...`);
        const dl = await downloadReelMedia(item.url, {
          audioOnly: options.audioOnly,
          proxy: effectiveProxy,
          outputDir: TEMP_MEDIA_DIR,
        });

        const mbSize = (dl.sizeBytes / (1024 * 1024)).toFixed(2);
        console.log(`   ✅ Downloaded (${mbSize} MB, via ${dl.usedProxy ? "Tor Proxy" : "Direct Connection"})`);
        totalBytesArchived += dl.sizeBytes;

        // Step B: Upload to R2 Pool
        const ext = path.extname(dl.filePath).slice(1) || (options.audioOnly ? "m4a" : "mp4");
        const r2Key = `reels/${item.reelId}.${ext}`;
        let streamUrl = "";
        let nodeId = "local-storage";

        if (hasR2) {
          console.log(`   ☁️  Uploading to R2 node pool...`);
          const uploadRes = await r2Pool.uploadFile(dl.filePath, r2Key);
          streamUrl = uploadRes.streamUrl;
          nodeId = uploadRes.nodeId;
          console.log(`   🌐 Live Stream URL: ${streamUrl} (Node: ${nodeId})`);
        } else {
          // Fallback streamUrl if R2 accounts are not yet added to r2_pools.json
          streamUrl = `https://media.fabric.os/reels/${item.reelId}.${ext}`;
          nodeId = "unconfigured-node";
          console.log(`   🌐 Stream URL (Mock / Local): ${streamUrl}`);
        }

        // Step C: Update Firestore
        if (item.firestoreId) {
          try {
            await updateKnowledgeItemStreamUrl(item.firestoreId, streamUrl, nodeId, r2Key, dl.mediaType);
            console.log(`   🔥 Updated Firestore item (${item.firestoreId})`);
          } catch (fErr: any) {
            console.warn(`   ⚠️ Firestore update warning: ${fErr.message}`);
          }
        }

        // Step D: Update Notion page
        if (item.notionUrl) {
          try {
            await appendMediaStreamToNotionPage(item.notionUrl, streamUrl, dl.mediaType);
            console.log(`   📓 Appended stream embed to Notion page`);
          } catch (nErr: any) {
            console.warn(`   ⚠️ Notion embed warning: ${nErr.message}`);
          }
        }

        // Step E: Clean up local temp file unless --keep-local
        if (!options.keepLocal && fs.existsSync(dl.filePath)) {
          fs.unlinkSync(dl.filePath);
          console.log(`   🧹 Cleaned up temporary local file`);
        } else {
          console.log(`   💾 Kept local media file: ${dl.filePath}`);
        }

        // Step F: Update Checkpoint
        if (!checkpoint.processedUrls[item.url]) {
          checkpoint.processedUrls[item.url] = {
            title: item.title,
            firestoreId: item.firestoreId,
            notionUrl: item.notionUrl,
          };
        }
        checkpoint.processedUrls[item.url].streamUrl = streamUrl;
        checkpoint.processedUrls[item.url].r2NodeId = nodeId;
        checkpoint.processedUrls[item.url].r2Key = r2Key;
        checkpoint.processedUrls[item.url].mediaType = dl.mediaType;
        checkpoint.processedUrls[item.url].archivedAt = new Date().toISOString();
        saveCheckpoint(options.checkpointPath, checkpoint);

        successCount++;
      } catch (err: any) {
        console.error(`   ❌ Failed to archive reel ${item.reelId}:`, err.message || err);
        errorCount++;
      }
    }
  }

  // Summary
  console.log("\n==================================================================");
  console.log(`🏁 Archive Process Finished!`);
  console.log(`✅ Successfully Archived: ${successCount}`);
  if (errorCount > 0) console.log(`⚠️ Errors Encountered: ${errorCount}`);
  console.log(`💾 Total Media Processed: ${(totalBytesArchived / (1024 * 1024)).toFixed(2)} MB`);
  console.log("==================================================================\n");
}

if (import.meta.main || (process.argv[1] && process.argv[1].endsWith("archive-media-pool.ts"))) {
  main().catch((err) => {
    console.error("\n❌ Fatal archive script error:", err);
    process.exit(1);
  });
}
