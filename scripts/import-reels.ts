#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { extractMediaInsight, findMediaUrl } from "../src/media/extractor.js";
import { createKnowledgeItem } from "../src/db/firestore.js";
import { isNotionConfigured, syncKnowledgeItemToNotion } from "../src/notion/client.js";

const execFileAsync = promisify(execFile);

interface ParsedPostItem {
  url: string;
  title?: string;
  author?: string;
  savedAt?: Date;
}

/**
 * Robust parser for various Instagram saved_posts.json structures
 */
export function parseInstagramExport(rawJson: any): ParsedPostItem[] {
  const items: ParsedPostItem[] = [];
  const seenUrls = new Set<string>();

  function addIfValid(url: string, title?: string, author?: string, timestamp?: number | string) {
    if (!url || typeof url !== "string") return;
    const detected = findMediaUrl(url);
    if (!detected || detected.type !== "instagram") return;

    // Normalize URL
    const cleanUrl = detected.url.split("?")[0].replace(/\/+$/, "") + "/";
    if (seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);

    let savedAt: Date | undefined;
    if (typeof timestamp === "number") {
      savedAt = new Date(timestamp * 1000);
    } else if (typeof timestamp === "string") {
      savedAt = new Date(timestamp);
    }

    items.push({
      url: cleanUrl,
      title: title?.trim() || undefined,
      author: author?.trim() || title?.trim() || undefined,
      savedAt: savedAt && !isNaN(savedAt.getTime()) ? savedAt : undefined,
    });
  }

  // Handle { saved_saved_media: [ ... ] }
  if (rawJson && typeof rawJson === "object" && Array.isArray(rawJson.saved_saved_media)) {
    for (const entry of rawJson.saved_saved_media) {
      const stringMap = entry.string_map_data || {};
      const url =
        stringMap.URL?.value ||
        stringMap.URL?.href ||
        stringMap.Link?.value ||
        entry.url ||
        entry.href;

      const title = entry.title || undefined;
      const author = entry.title || stringMap["Account name"]?.value;
      const savedOn = stringMap["Saved on"]?.timestamp || stringMap["Saved on"]?.value;

      addIfValid(url, title, author, savedOn);
    }
    return items;
  }

  // Handle direct array of objects or strings
  if (Array.isArray(rawJson)) {
    for (const entry of rawJson) {
      if (typeof entry === "string") {
        addIfValid(entry);
      } else if (entry && typeof entry === "object") {
        const stringMap = entry.string_map_data || {};
        const url =
          stringMap.URL?.value ||
          stringMap.URL?.href ||
          stringMap.Link?.value ||
          entry.url ||
          entry.href ||
          entry.value;

        const title = entry.title || undefined;
        const author = entry.title || stringMap["Account name"]?.value;
        const savedOn = stringMap["Saved on"]?.timestamp || stringMap["Saved on"]?.value;

        addIfValid(url, title, author, savedOn);
      }
    }
    return items;
  }

  // Fallback: Deep recursive scan for any Instagram URLs in object
  function deepScan(node: any) {
    if (!node) return;
    if (typeof node === "string") {
      const detected = findMediaUrl(node);
      if (detected && detected.type === "instagram") {
        addIfValid(detected.url);
      }
    } else if (Array.isArray(node)) {
      for (const val of node) deepScan(val);
    } else if (typeof node === "object") {
      for (const key of Object.keys(node)) {
        deepScan(node[key]);
      }
    }
  }

  deepScan(rawJson);
  return items;
}

/**
 * Checks if yt-dlp is available on system PATH
 */
async function isYtDlpAvailable(): Promise<boolean> {
  try {
    await execFileAsync("yt-dlp", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to download audio using yt-dlp if possible.
 */
async function tryDownloadAudio(
  url: string,
  tempDir: string
): Promise<{ base64?: string; mimeType?: string } | null> {
  const randomId = Math.random().toString(36).substring(2, 9);
  const outPath = path.join(tempDir, `audio_${randomId}.mp3`);

  try {
    await execFileAsync(
      "yt-dlp",
      [
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "5",
        "--no-playlist",
        "--no-warnings",
        "-o",
        outPath,
        url,
      ],
      { timeout: 15000 }
    );

    if (fs.existsSync(outPath)) {
      const buffer = fs.readFileSync(outPath);
      const base64 = buffer.toString("base64");
      try {
        fs.unlinkSync(outPath);
      } catch {}
      return { base64, mimeType: "audio/mp3" };
    }
  } catch {
    // If audio extraction fails (e.g. login required), fallback silently
    if (fs.existsSync(outPath)) {
      try {
        fs.unlinkSync(outPath);
      } catch {}
    }
  }

  return null;
}

/**
 * Renders a CLI progress bar
 */
function renderProgressBar(
  current: number,
  total: number,
  stats: { success: number; errors: number; notion: number },
  currentUrl?: string
) {
  const width = 30;
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.min(width, Math.floor(ratio * width));
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const percent = (ratio * 100).toFixed(1);

  const displayUrl = currentUrl ? (currentUrl.length > 40 ? currentUrl.slice(0, 37) + "..." : currentUrl) : "";

  process.stdout.write(
    `\r[${bar}] ${current}/${total} (${percent}%) | ✅ ${stats.success} | ⚠️ ${stats.errors} | 📓 ${stats.notion} | ${displayUrl}          `
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
📱 The Fabric: Instagram Reels Bulk Import Tool
==============================================
Usage:
  bun run scripts/import-reels.ts <path-to-saved_posts.json> [options]

Options:
  --user <id>         User ID for telemetry and knowledge garden (default: env.TELEGRAM_USER_ID or "default")
  --concurrency <n>   Max parallel digestion jobs (default: 2)
  --delay <ms>        Delay between batches in ms (default: 1500)
  --limit <n>         Max number of reels to import
  --dry-run           Parse and list URLs without saving

Example:
  bun run scripts/import-reels.ts ~/Downloads/saved_posts.json --concurrency 2
    `);
    process.exit(0);
  }

  const filePath = path.resolve(process.cwd(), args[0]);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // Parse options
  let userId = process.env.TELEGRAM_USER_ID || process.env.FABRIC_USER_ID || "default";
  let concurrency = 2;
  let delayMs = 1500;
  let limit: number | undefined;
  let dryRun = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--user" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[i + 1], 10) || 2;
      i++;
    } else if (args[i] === "--delay" && args[i + 1]) {
      delayMs = parseInt(args[i + 1], 10) || 1500;
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  console.log(`\n📂 Reading Instagram export: ${filePath}`);
  const fileContent = fs.readFileSync(filePath, "utf-8");
  let rawJson: any;

  try {
    rawJson = JSON.parse(fileContent);
  } catch (err) {
    console.error("❌ Failed to parse JSON file:", err);
    process.exit(1);
  }

  let posts = parseInstagramExport(rawJson);
  console.log(`🔍 Extracted ${posts.length} unique Instagram Reel(s) / Post(s).`);

  if (limit && limit > 0 && limit < posts.length) {
    posts = posts.slice(0, limit);
    console.log(`⚡ Limiting import to first ${limit} item(s).`);
  }

  if (posts.length === 0) {
    console.log("No valid Instagram links found in the provided JSON file.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\n🧪 [DRY RUN] Found the following reels to import:");
    posts.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.url} ${p.author ? `(@${p.author})` : ""}`);
    });
    console.log(`\nDry run finished. Total: ${posts.length}`);
    process.exit(0);
  }

  const ytDlpReady = await isYtDlpAvailable();
  console.log(`🛠️ yt-dlp audio extractor: ${ytDlpReady ? "Available ✅" : "Not on PATH (using oEmbed metadata fallback)"}`);
  console.log(`📓 Notion auto-sync: ${isNotionConfigured() ? "Configured & Active ✅" : "Disabled"}`);
  console.log(`👤 Target User ID: ${userId}`);
  console.log(`⚙️ Concurrency: ${concurrency} | Batch delay: ${delayMs}ms\n`);

  const tempDir = path.join(os.tmpdir(), "fabric-reels-import");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const stats = {
    total: posts.length,
    success: 0,
    errors: 0,
    notion: 0,
  };

  const results: Array<{
    url: string;
    title: string;
    category: string;
    notionUrl?: string;
  }> = [];

  let completedCount = 0;

  // Process a single reel item
  async function processItem(item: ParsedPostItem) {
    renderProgressBar(completedCount, stats.total, stats, item.url);

    try {
      // 1. Try audio download if yt-dlp is available
      let audioData: { base64?: string; mimeType?: string } | null = null;
      if (ytDlpReady) {
        audioData = await tryDownloadAudio(item.url, tempDir);
      }

      // 2. Digest with Gemini Flash
      const insight = await extractMediaInsight(item.url, userId, {
        title: item.title,
        author: item.author,
        audioBase64: audioData?.base64,
        audioMimeType: audioData?.mimeType,
      });

      // 3. Save to Firestore
      const docId = await createKnowledgeItem(insight);
      stats.success++;

      // 4. Sync to Notion if configured
      let notionUrl: string | undefined;
      if (isNotionConfigured()) {
        try {
          const notionRes = await syncKnowledgeItemToNotion({
            ...insight,
            id: docId,
          });
          notionUrl = notionRes.url;
          stats.notion++;
        } catch (notionErr) {
          // Notion error does not halt the pipeline
        }
      }

      results.push({
        url: item.url,
        title: insight.title,
        category: insight.category,
        notionUrl,
      });
    } catch (err) {
      stats.errors++;
      console.error(`\n⚠️ Failed to ingest ${item.url}:`, err instanceof Error ? err.message : err);
    } finally {
      completedCount++;
      renderProgressBar(completedCount, stats.total, stats);
    }
  }

  // Worker pool for concurrency control
  let itemIndex = 0;
  async function worker() {
    while (itemIndex < posts.length) {
      const current = posts[itemIndex++];
      await processItem(current);
      if (delayMs > 0 && itemIndex < posts.length) {
        await sleep(delayMs);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, posts.length) }, () => worker());
  await Promise.all(workers);

  // Final render
  renderProgressBar(stats.total, stats.total, stats);
  console.log("\n\n" + "=".repeat(60));
  console.log("🎉 Bulk Ingestion Complete!");
  console.log(`📦 Processed: ${stats.total}`);
  console.log(`✅ Ingested to Knowledge Garden: ${stats.success}`);
  console.log(`📓 Synced to Notion: ${stats.notion}`);
  if (stats.errors > 0) {
    console.log(`⚠️ Errors: ${stats.errors}`);
  }
  console.log("=".repeat(60));

  if (results.length > 0) {
    console.log("\nRecent Ingestions:");
    results.slice(0, 10).forEach((r, idx) => {
      console.log(
        `  ${idx + 1}. [${r.category.toUpperCase()}] ${r.title} ${
          r.notionUrl ? `-> ${r.notionUrl}` : ""
        }`
      );
    });
    if (results.length > 10) {
      console.log(`  ... and ${results.length - 10} more.`);
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal execution error:", err);
  process.exit(1);
});
