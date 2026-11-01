#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../src/config/env.js";
import { createKnowledgeItem } from "../src/db/firestore.js";
import { isNotionConfigured, syncKnowledgeItemToNotion } from "../src/notion/client.js";
import type { KnowledgeCategory, KnowledgeItem } from "../src/db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const CHECKPOINT_FILE = path.resolve(process.cwd(), ".reels_import_checkpoint.json");

export interface ParsedReelItem {
  url: string;
  caption: string;
  title?: string;
  author?: string;
  timestamp?: number;
  savedAt?: Date;
}

export interface DigestedReelResult {
  url: string;
  title: string;
  category: KnowledgeCategory;
  quadrant: "Focus" | "Facts" | "Funds" | "Feedback";
  tags: string[];
  summary: string;
  actionableTakeaway: string;
  author?: string;
  savedAt?: Date;
  firestoreId?: string;
  notionUrl?: string;
}

interface CheckpointData {
  processedUrls: Record<string, {
    title: string;
    category: string;
    firestoreId?: string;
    notionUrl?: string;
    processedAt: string;
  }>;
  totalProcessed: number;
  lastUpdated: string;
}

function loadCheckpoint(): CheckpointData {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
    } catch {
      // Ignore corrupted checkpoint
    }
  }
  return {
    processedUrls: {},
    totalProcessed: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function saveCheckpoint(data: CheckpointData) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ Failed to write checkpoint file:", err);
  }
}

/**
 * Universal Instagram export parser supporting:
 * 1. Modern Meta export with `label_values` (2024-2026 schema)
 * 2. Legacy `saved_saved_media` with `string_map_data`
 * 3. Flat array of strings / URLs
 */
export function parseInstagramExport(rawJson: any): ParsedReelItem[] {
  const items: ParsedReelItem[] = [];
  const seenUrls = new Set<string>();

  function registerItem(
    url: string,
    caption?: string,
    title?: string,
    author?: string,
    timestamp?: number | string
  ) {
    if (!url || typeof url !== "string") return;
    if (!url.includes("instagram.com/")) return;

    // Normalize URL to https://www.instagram.com/reel/CODE/ or /p/CODE/
    const cleanUrl = url.split("?")[0].replace(/\/+$/, "") + "/";
    if (seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);

    let savedAt: Date | undefined;
    let tsNum: number | undefined;
    if (typeof timestamp === "number") {
      tsNum = timestamp;
      savedAt = new Date(timestamp * 1000);
    } else if (typeof timestamp === "string") {
      const parsed = Date.parse(timestamp);
      if (!isNaN(parsed)) {
        savedAt = new Date(parsed);
        tsNum = Math.floor(parsed / 1000);
      }
    }

    items.push({
      url: cleanUrl,
      caption: caption?.trim() || "",
      title: title?.trim() || undefined,
      author: author?.trim() || undefined,
      timestamp: tsNum,
      savedAt: savedAt && !isNaN(savedAt.getTime()) ? savedAt : undefined,
    });
  }

  // 1. Direct array of objects (modern 2024-2026 export with `label_values`)
  if (Array.isArray(rawJson)) {
    for (const entry of rawJson) {
      if (typeof entry === "string") {
        registerItem(entry);
        continue;
      }
      if (!entry || typeof entry !== "object") continue;

      let url = "";
      let caption = "";
      let title = "";
      let author = "";
      const timestamp = entry.timestamp;

      // Modern format: label_values
      if (Array.isArray(entry.label_values)) {
        for (const lv of entry.label_values) {
          if (lv.label === "URL") {
            url = lv.value || lv.href || "";
          } else if (lv.label === "Caption" && lv.value) {
            caption = lv.value;
          } else if (lv.label === "Title" && lv.value) {
            title = lv.value;
          } else if (lv.title === "Owner" && Array.isArray(lv.dict)) {
            for (const d of lv.dict) {
              if (Array.isArray(d.dict)) {
                for (const sub of d.dict) {
                  if (sub.label === "Username" && sub.value) author = sub.value;
                  else if (sub.label === "Name" && sub.value && !author) author = sub.value;
                }
              }
            }
          }
        }
      }

      // Legacy format fallback: string_map_data
      if (!url && entry.string_map_data) {
        const sm = entry.string_map_data;
        url = sm.URL?.value || sm.URL?.href || sm.Link?.value || entry.url || entry.href || "";
        title = entry.title || "";
        author = entry.title || sm["Account name"]?.value || "";
        const savedOn = sm["Saved on"]?.timestamp || sm["Saved on"]?.value;
        registerItem(url, caption, title, author, savedOn || timestamp);
        continue;
      }

      registerItem(url, caption, title, author, timestamp);
    }
    return items;
  }

  // 2. Legacy { saved_saved_media: [ ... ] }
  if (rawJson && typeof rawJson === "object" && Array.isArray(rawJson.saved_saved_media)) {
    for (const entry of rawJson.saved_saved_media) {
      const sm = entry.string_map_data || {};
      const url = sm.URL?.value || sm.URL?.href || sm.Link?.value || entry.url || entry.href;
      const title = entry.title || undefined;
      const author = entry.title || sm["Account name"]?.value;
      const savedOn = sm["Saved on"]?.timestamp || sm["Saved on"]?.value;
      registerItem(url, "", title, author, savedOn);
    }
  }

  return items;
}

/**
 * Calls Gemini 3.8 Flash to analyze and synthesize a batch of reels into 4F Knowledge Cards.
 */
async function digestReelsBatch(
  batch: ParsedReelItem[],
  maxRetries = 3
): Promise<Array<{
  index: number;
  title: string;
  category: KnowledgeCategory;
  quadrant: "Focus" | "Facts" | "Funds" | "Feedback";
  tags: string[];
  summary: string;
  actionableTakeaway: string;
}>> {
  const models = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];

  const promptItems = batch.map((item, idx) => ({
    batchIndex: idx,
    url: item.url,
    creator: item.author || "Unknown Creator",
    caption: item.caption.slice(0, 1500) || "(No caption provided. Infer topic from creator handle & URL context.)",
  }));

  const systemInstruction = `You are the Master Knowledge Curator for "The Fabric OS", a personal executive cognitive operating system built around the 4F Framework:
- Focus: Time, deliberate attention, flow, distraction reduction, deep work.
- Facts: Concrete knowledge, tools, GitHub repos, technical patterns, code, design, frameworks.
- Funds: Capital, financial wisdom, vitality, biomechanics, nutrition, physical health/longevity.
- Feedback: Self-reflection, relationships, communication, psychological models, emotional balance (-5 to +5 Doctrine of the Mean).

Task:
Analyze each Instagram post/reel in the provided batch. Extract dense, high-signal knowledge and return a JSON array of objects.

JSON Object Schema per item:
{
  "batchIndex": number (matching the input batchIndex),
  "title": string (punchy, high-signal, professional title summarizing the core principle or tool, max 80 chars),
  "category": "strategy" | "tool" | "insight" | "win",
  "quadrant": "Focus" | "Facts" | "Funds" | "Feedback",
  "tags": string[] (3-5 lower-case tags, e.g. ["biomechanics", "squat", "mobility", "fitness"]),
  "summary": string (2 crisp sentences capturing the core insight, method, or revelation),
  "actionableTakeaway": string (1 concrete, practical action the user can immediately implement or remember)
}

Rules:
1. Filter out pure hype, clickbait, and shallow fluff. Dig for the underlying lesson or system.
2. Return strictly a JSON array inside \`\`\`json ... \`\`\` code block.
3. Every input item must have a corresponding entry in the output array.`;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await model.generateContent([
          systemInstruction,
          `\n\nBatch of ${batch.length} Instagram Posts to Digest:\n` +
            JSON.stringify(promptItems, null, 2),
        ]);

        const text = response.response.text();
        let cleaned = text.trim();
        if (cleaned.startsWith("```json")) {
          cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
        } else if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
        }

        const parsed = JSON.parse(cleaned.trim());
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err: any) {
        if (attempt === maxRetries) {
          // Fall through to next model
          break;
        }
        await sleep(1000 * attempt);
      }
    }
  }

  return [];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderProgressBar(
  current: number,
  total: number,
  stats: { success: number; skipped: number; errors: number; notion: number },
  extraInfo?: string
) {
  const width = 25;
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.min(width, Math.floor(ratio * width));
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const percent = (ratio * 100).toFixed(1);

  const displayExtra = extraInfo
    ? extraInfo.length > 35
      ? extraInfo.slice(0, 32) + "..."
      : extraInfo
    : "";

  process.stdout.write(
    `\r[${bar}] ${current}/${total} (${percent}%) | ✅ ${stats.success} | ⏩ ${stats.skipped} | 📓 ${stats.notion} | ⚠️ ${stats.errors} | ${displayExtra}   `
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
📱 The Fabric OS: Instagram Knowledge Garden Importer
=====================================================
Digests Instagram Saved Reels/Posts into high-signal 4F Knowledge Cards
using Gemini 3.8 Flash, storing in Firestore and syncing to Notion.

Usage:
  bun run scripts/import-reels.ts <path-to-saved_posts.json> [options]

Options:
  --limit <n>            Process only the first N items (e.g. --limit 25)
  --batch-size <n>       Number of reels per Gemini batch call (default: 12)
  --no-notion            Disable Notion synchronization (Firestore only)
  --no-firestore         Disable Firestore synchronization (Notion only)
  --stats-only           Display comprehensive analytics of saved posts without importing
  --dry-run              Simulate parsing and batch generation without saving
  --reset-checkpoint     Clear previous import progress to start fresh
  --user <id>            Target Fabric User ID (default: "fabric_user")

Examples:
  bun run scripts/import-reels.ts saved_posts.json --stats-only
  bun run scripts/import-reels.ts saved_posts.json --limit 10 --dry-run
  bun run scripts/import-reels.ts saved_posts.json --limit 50
    `);
    process.exit(0);
  }

  const filePath = path.resolve(process.cwd(), args[0]);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // Parse arguments
  let limit: number | undefined;
  let batchSize = 12;
  let syncNotion = true;
  let syncFirestore = true;
  let statsOnly = false;
  let dryRun = false;
  let resetCheckpoint = false;
  let userId = process.env.TELEGRAM_USER_ID || process.env.FABRIC_USER_ID || "fabric_user";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--batch-size" && args[i + 1]) {
      batchSize = Math.max(1, Math.min(25, parseInt(args[i + 1], 10) || 12));
      i++;
    } else if (args[i] === "--no-notion") {
      syncNotion = false;
    } else if (args[i] === "--no-firestore") {
      syncFirestore = false;
    } else if (args[i] === "--stats-only") {
      statsOnly = true;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--reset-checkpoint") {
      resetCheckpoint = true;
    } else if (args[i] === "--user" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    }
  }

  if (resetCheckpoint && fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
    console.log("🔄 Reset import checkpoint file.");
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

  const allPosts = parseInstagramExport(rawJson);
  console.log(`🔍 Total parsed Instagram items: ${allPosts.length}`);

  // Comprehensive stats mode
  if (statsOnly) {
    console.log("\n📊 --- INSTAGRAM SAVED ARCHIVE ANALYTICS ---");
    const reels = allPosts.filter((p) => p.url.includes("/reel/"));
    const posts = allPosts.filter((p) => !p.url.includes("/reel/"));
    const withCaptions = allPosts.filter((p) => p.caption.length > 0);

    const authorCounts: Record<string, number> = {};
    for (const p of allPosts) {
      const a = p.author || "unknown";
      authorCounts[a] = (authorCounts[a] || 0) + 1;
    }

    const timestamps = allPosts
      .map((p) => p.timestamp)
      .filter((t): t is number => typeof t === "number")
      .sort((a, b) => a - b);

    console.log(`Total Saves: ${allPosts.length}`);
    console.log(`  - Reels: ${reels.length} (${((reels.length / allPosts.length) * 100).toFixed(1)}%)`);
    console.log(`  - Standard Posts: ${posts.length}`);
    console.log(`  - With Full Captions: ${withCaptions.length} (${((withCaptions.length / allPosts.length) * 100).toFixed(1)}%)`);
    if (timestamps.length > 0) {
      console.log(`Date Range: ${new Date(timestamps[0] * 1000).toLocaleDateString()} -> ${new Date(timestamps[timestamps.length - 1] * 1000).toLocaleDateString()}`);
    }
    console.log(`Unique Creators Saved: ${Object.keys(authorCounts).length}`);

    const topAuthors = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    console.log("\nTop 15 Most Saved Creators:");
    topAuthors.forEach(([auth, count], idx) => {
      console.log(`  ${idx + 1}. @${auth}: ${count} saves`);
    });
    console.log("-------------------------------------------\n");
    process.exit(0);
  }

  // Checkpoint loading
  const checkpoint = loadCheckpoint();
  const alreadyProcessed = checkpoint.processedUrls;

  // Filter out already processed items
  let pendingPosts = allPosts.filter((p) => !alreadyProcessed[p.url]);
  const previouslySkipped = allPosts.length - pendingPosts.length;

  if (previouslySkipped > 0) {
    console.log(`⏩ Checkpoint: Found ${previouslySkipped} already processed post(s).`);
  }

  if (limit && limit > 0 && limit < pendingPosts.length) {
    pendingPosts = pendingPosts.slice(0, limit);
    console.log(`⚡ Processing limit: ${limit} pending item(s).`);
  }

  if (pendingPosts.length === 0) {
    console.log("🎉 All items have already been processed according to checkpoint!");
    process.exit(0);
  }

  const notionReady = syncNotion && isNotionConfigured();
  console.log(`\n⚙️ Configuration:`);
  console.log(`  - Mode: ${dryRun ? "🧪 DRY RUN (No writes)" : "🚀 LIVE INGESTION"}`);
  console.log(`  - Items to Process: ${pendingPosts.length}`);
  console.log(`  - Batch Size: ${batchSize} reels / Gemini call`);
  console.log(`  - Firestore Storage: ${syncFirestore ? "Active ✅" : "Disabled"}`);
  console.log(`  - Notion Auto-Sync: ${notionReady ? "Active ✅" : "Disabled"}`);
  console.log(`  - Target User: ${userId}\n`);

  const stats = {
    total: pendingPosts.length,
    success: 0,
    skipped: previouslySkipped,
    errors: 0,
    notion: 0,
  };

  const results: DigestedReelResult[] = [];

  // Process in batches
  for (let i = 0; i < pendingPosts.length; i += batchSize) {
    const chunk = pendingPosts.slice(i, i + batchSize);
    renderProgressBar(i, stats.total, stats, `Batch ${Math.floor(i / batchSize) + 1}...`);

    if (dryRun) {
      // Simulate
      const parsedBatch = await digestReelsBatch(chunk);
      for (const p of parsedBatch) {
        const original = chunk[p.batchIndex] || chunk[0];
        results.push({
          url: original.url,
          title: p.title,
          category: p.category,
          quadrant: p.quadrant,
          tags: p.tags,
          summary: p.summary,
          actionableTakeaway: p.actionableTakeaway,
          author: original.author,
          savedAt: original.savedAt,
        });
        stats.success++;
      }
      renderProgressBar(Math.min(i + batchSize, stats.total), stats.total, stats);
      continue;
    }

    // Live execution
    const digestedBatch = await digestReelsBatch(chunk);

    for (const item of digestedBatch) {
      const original = chunk[item.batchIndex];
      if (!original) continue;

      try {
        let firestoreId: string | undefined;
        let notionUrl: string | undefined;

        // 1. Save to Firestore
        if (syncFirestore) {
          const knowledgeItem: KnowledgeItem = {
            userId,
            timestamp: original.savedAt || new Date(),
            category: item.category,
            title: item.title,
            content: item.summary,
            tags: Array.from(new Set([...item.tags, item.quadrant.toLowerCase()])),
            actionableTakeaway: item.actionableTakeaway,
            sourceUrl: original.url,
            sourceType: "instagram",
            author: original.author,
            quadrant: item.quadrant,
          };
          firestoreId = await createKnowledgeItem(knowledgeItem);
          stats.success++;
        }

        // 2. Sync to Notion (with safe rate limit delay: 350ms)
        if (notionReady) {
          try {
            await sleep(350);
            const notionRes = await syncKnowledgeItemToNotion({
              userId,
              timestamp: original.savedAt || new Date(),
              category: item.category,
              title: item.title,
              content: item.summary,
              tags: Array.from(new Set([...item.tags, item.quadrant.toLowerCase()])),
              actionableTakeaway: item.actionableTakeaway,
              sourceUrl: original.url,
              author: original.author,
              quadrant: item.quadrant,
            });
            notionUrl = notionRes.url;
            stats.notion++;
          } catch (notionErr: any) {
            // Notion error shouldn't crash the script
          }
        }

        // 3. Update checkpoint
        checkpoint.processedUrls[original.url] = {
          title: item.title,
          category: item.category,
          firestoreId,
          notionUrl,
          processedAt: new Date().toISOString(),
        };
        checkpoint.totalProcessed++;

        results.push({
          url: original.url,
          title: item.title,
          category: item.category,
          quadrant: item.quadrant,
          tags: item.tags,
          summary: item.summary,
          actionableTakeaway: item.actionableTakeaway,
          author: original.author,
          savedAt: original.savedAt,
          firestoreId,
          notionUrl,
        });
      } catch (err) {
        stats.errors++;
      }
    }

    // Save checkpoint after every batch
    saveCheckpoint(checkpoint);
    renderProgressBar(Math.min(i + batchSize, stats.total), stats.total, stats);

    // Courtesy pause between Gemini batch requests
    if (i + batchSize < pendingPosts.length) {
      await sleep(1000);
    }
  }

  renderProgressBar(stats.total, stats.total, stats);
  console.log("\n\n" + "=".repeat(60));
  console.log(dryRun ? "🧪 Dry Run Complete!" : "🎉 Instagram Ingestion Complete!");
  console.log(`📦 Processed this run: ${results.length}`);
  console.log(`✅ Saved to Knowledge Garden (Firestore): ${stats.success}`);
  console.log(`📓 Synced to Notion Database: ${stats.notion}`);
  console.log(`⏩ Previously Processed: ${stats.skipped}`);
  if (stats.errors > 0) {
    console.log(`⚠️ Errors: ${stats.errors}`);
  }
  console.log("=".repeat(60));

  if (results.length > 0) {
    console.log("\n🌟 Sample Digested Cards:");
    results.slice(0, 5).forEach((r, idx) => {
      console.log(`\n[${idx + 1}] [${r.quadrant.toUpperCase()} / ${r.category.toUpperCase()}] ${r.title}`);
      console.log(`    👤 Creator: @${r.author || "unknown"}`);
      console.log(`    💡 Takeaway: ${r.actionableTakeaway}`);
      console.log(`    🏷️ Tags: ${r.tags.join(", ")}`);
      if (r.notionUrl) console.log(`    📓 Notion: ${r.notionUrl}`);
    });
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal execution error:", err);
  process.exit(1);
});
