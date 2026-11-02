import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { Bot, InputFile } from "grammy";
import { config } from "../../config/env.js";
import {
  createKnowledgeItem,
  updateKnowledgeItemStreamUrl,
  updateKnowledgeItemNotion,
  getVaultChannelId,
} from "../../db/firestore.js";
import {
  isNotionConfigured,
  syncKnowledgeItemToNotion,
  appendMediaStreamToNotionPage,
} from "../../notion/client.js";
import { extractMediaInsight } from "../../media/extractor.js";
import type { SavedReelItem } from "./saved-poller.js";
import type { KnowledgeCategory, KnowledgeItem } from "../../db/types.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_TOR_PROXY = "socks5://127.0.0.1:9050";
export const TEMP_MEDIA_DIR = path.resolve(os.tmpdir(), "fabric_tg_vault");
export const CHECKPOINT_FILE = path.resolve(process.cwd(), ".reels_import_checkpoint.json");
export const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
  fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

export interface IngestOptions {
  userId?: string;
  skipVault?: boolean;
  skipTor?: boolean;
  proxyUrl?: string;
  channelId?: string;
  bot?: Bot;
}

export interface IngestedReelResult {
  url: string;
  reelId: string;
  title: string;
  category: KnowledgeCategory;
  quadrant: "Focus" | "Facts" | "Funds" | "Feedback";
  author: string;
  takeaway: string;
  firestoreId?: string;
  notionUrl?: string;
  telegramUrl?: string;
  fileId?: string;
}

export interface VaultTrackerData {
  channelId: string;
  totalArchived: number;
  totalBytesUploaded: number;
  lastUpdated: string;
  archivedUrls: Record<
    string,
    {
      reelId: string;
      fileId: string;
      messageId: number;
      telegramUrl: string;
      archivedAt: string;
    }
  >;
}

export interface CheckpointData {
  processedUrls: Record<
    string,
    {
      title: string;
      category: string;
      quadrant?: string;
      author?: string;
      takeaway?: string;
      firestoreId?: string;
      notionUrl?: string;
      processedAt: string;
    }
  >;
  totalProcessed: number;
  lastUpdated: string;
}

export function extractReelId(url: string): string {
  const match = url.match(/\/(?:reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/i);
  return match && match[1] ? match[1] : "reel";
}

export function loadCheckpoint(): CheckpointData {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
    } catch {}
  }
  return {
    processedUrls: {},
    totalProcessed: 0,
    lastUpdated: new Date().toISOString(),
  };
}

export function saveCheckpoint(data: CheckpointData): void {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ Could not write checkpoint file:", err);
  }
}

export function loadVaultTracker(): VaultTrackerData {
  if (fs.existsSync(VAULT_TRACKER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VAULT_TRACKER_FILE, "utf-8"));
    } catch {}
  }
  return {
    channelId: config.telegramVaultChannelId || "",
    totalArchived: 0,
    totalBytesUploaded: 0,
    lastUpdated: new Date().toISOString(),
    archivedUrls: {},
  };
}

export function saveVaultTracker(data: VaultTrackerData): void {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(VAULT_TRACKER_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ Could not write vault tracker file:", err);
  }
}

export async function checkTorProxy(proxyUrl = DEFAULT_TOR_PROXY): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "--socks5-hostname",
      proxyUrl.replace(/^socks5:\/\//, ""),
      "-s",
      "-m",
      "4",
      "https://check.torproject.org/api/ip",
    ]);
    const parsed = JSON.parse(stdout.trim());
    return Boolean(parsed.IsTor);
  } catch {
    return false;
  }
}

export async function downloadReelVideo(
  url: string,
  outputDir = TEMP_MEDIA_DIR,
  proxy?: string
): Promise<{ filePath: string; sizeBytes: number }> {
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
    const matches = fs.readdirSync(outputDir).filter((f) => f.startsWith(reelId));
    if (matches.length > 0) {
      const matchPath = path.join(outputDir, matches[0]);
      const stat = fs.statSync(matchPath);
      return { filePath: matchPath, sizeBytes: stat.size };
    }
    throw new Error(`Downloaded video file not found for reel ${reelId}`);
  }

  const stat = fs.statSync(outTemplate);
  return { filePath: outTemplate, sizeBytes: stat.size };
}

function inferQuadrant(
  category: KnowledgeCategory,
  tags: string[] = []
): "Focus" | "Facts" | "Funds" | "Feedback" {
  const t = tags.map((x) => x.toLowerCase());
  if (
    t.some((x) =>
      ["focus", "time", "deepwork", "productivity", "study", "habit", "discipline"].includes(x)
    )
  ) {
    return "Focus";
  }
  if (
    t.some((x) =>
      [
        "vitality",
        "health",
        "funds",
        "money",
        "investing",
        "workout",
        "fitness",
        "nutrition",
        "sleep",
        "biomechanics",
      ].includes(x)
    )
  ) {
    return "Funds";
  }
  if (
    t.some((x) =>
      [
        "feedback",
        "mindset",
        "psychology",
        "mental",
        "communication",
        "relationship",
        "stoic",
        "reflection",
      ].includes(x)
    )
  ) {
    return "Feedback";
  }
  if (
    category === "tool" ||
    t.some((x) =>
      ["tool", "code", "dev", "ai", "tech", "repo", "architecture", "facts"].includes(x)
    )
  ) {
    return "Facts";
  }
  return "Facts";
}

/**
 * Ingests a single saved reel:
 * 1. Extracts 4F insight via Gemini Flash.
 * 2. Saves to Firestore knowledge collection.
 * 3. Syncs to Notion (if configured).
 * 4. Downloads via Tor yt-dlp and uploads to Telegram Vault channel (if channel configured).
 * 5. Updates checkpoints and trackers.
 */
export async function ingestSavedReel(
  item: SavedReelItem,
  options: IngestOptions = {}
): Promise<IngestedReelResult> {
  const userId = options.userId || config.telegramUserId || "1131646846";
  const reelId = item.code || extractReelId(item.url);
  const cleanUrl = item.url.split("?")[0].replace(/\/+$/, "") + "/";

  // 1. Synthesize 4F Knowledge Item
  const insight = await extractMediaInsight(cleanUrl, userId, {
    title: item.title,
    author: item.author,
    caption: item.caption,
  });

  const quadrant = inferQuadrant(insight.category, insight.tags);

  const knowledgeItem: KnowledgeItem = {
    userId,
    timestamp: item.savedAt || new Date(),
    category: insight.category,
    title: insight.title,
    content: insight.content,
    tags: Array.from(new Set([...insight.tags, quadrant.toLowerCase()])),
    actionableTakeaway: insight.actionableTakeaway,
    sourceUrl: cleanUrl,
    sourceType: "instagram",
    author: item.author || insight.author,
    quadrant,
  };

  // 2. Save to Firestore
  const firestoreId = await createKnowledgeItem(knowledgeItem);

  // 3. Sync to Notion
  let notionUrl: string | undefined;
  if (isNotionConfigured()) {
    try {
      const notionRes = await syncKnowledgeItemToNotion({
        ...knowledgeItem,
        id: firestoreId,
      });
      notionUrl = notionRes.url;
      await updateKnowledgeItemNotion(firestoreId, notionRes.url, notionRes.id);
    } catch (err: any) {
      console.warn(`⚠️ Notion sync warning for ${cleanUrl}:`, err.message);
    }
  }

  // 4. Update Checkpoint
  const checkpoint = loadCheckpoint();
  checkpoint.processedUrls[cleanUrl] = {
    title: insight.title,
    category: insight.category,
    quadrant,
    author: item.author,
    takeaway: insight.actionableTakeaway,
    firestoreId,
    notionUrl,
    processedAt: new Date().toISOString(),
  };
  checkpoint.totalProcessed = Object.keys(checkpoint.processedUrls).length;
  saveCheckpoint(checkpoint);

  let telegramUrl: string | undefined;
  let fileId: string | undefined;

  // 5. Telegram Vault Archival (Full Video .mp4)
  if (!options.skipVault) {
    const channelId =
      options.channelId ||
      config.telegramVaultChannelId ||
      (await getVaultChannelId(userId));

    if (channelId) {
      const bot = options.bot || new Bot(config.telegramToken);
      let downloadedPath: string | null = null;

      try {
        // Test Tor proxy
        const useTor = !options.skipTor;
        const torActive = useTor
          ? await checkTorProxy(options.proxyUrl || DEFAULT_TOR_PROXY)
          : false;

        const proxy = torActive ? options.proxyUrl || DEFAULT_TOR_PROXY : undefined;

        // Download video
        const dl = await downloadReelVideo(cleanUrl, TEMP_MEDIA_DIR, proxy);
        downloadedPath = dl.filePath;

        // Upload to channel
        const caption = `🎬 ${insight.title}\n👤 @${item.author}\n\n🔗 ${cleanUrl}`;
        const msg = await bot.api.sendVideo(channelId, new InputFile(downloadedPath), {
          caption,
          supports_streaming: true,
        });

        fileId = msg.video.file_id;
        const cleanChannelNum = channelId.replace(/^-100/, "");
        telegramUrl = `https://t.me/c/${cleanChannelNum}/${msg.message_id}`;

        // Update Firestore stream URL
        await updateKnowledgeItemStreamUrl(
          firestoreId,
          telegramUrl,
          "telegram-cloud",
          fileId,
          "video"
        );

        // Append to Notion
        if (notionUrl) {
          try {
            await appendMediaStreamToNotionPage(notionUrl, telegramUrl, "video");
          } catch (nErr: any) {
            console.warn("⚠️ Could not append stream link to Notion:", nErr.message);
          }
        }

        // Update Vault Tracker
        const tracker = loadVaultTracker();
        tracker.channelId = channelId;
        tracker.archivedUrls[cleanUrl] = {
          reelId,
          fileId,
          messageId: msg.message_id,
          telegramUrl,
          archivedAt: new Date().toISOString(),
        };
        tracker.totalArchived = Object.keys(tracker.archivedUrls).length;
        tracker.totalBytesUploaded += dl.sizeBytes;
        saveVaultTracker(tracker);
      } catch (vaultErr: any) {
        console.warn(`⚠️ Telegram Vault archival warning for ${cleanUrl}:`, vaultErr.message);
      } finally {
        if (downloadedPath && fs.existsSync(downloadedPath)) {
          try {
            fs.unlinkSync(downloadedPath);
          } catch {}
        }
      }
    }
  }

  return {
    url: cleanUrl,
    reelId,
    title: insight.title,
    category: insight.category,
    quadrant,
    author: item.author,
    takeaway: insight.actionableTakeaway || "",
    firestoreId,
    notionUrl,
    telegramUrl,
    fileId,
  };
}
