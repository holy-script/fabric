import { GoogleGenerativeAI } from "@google/generative-ai";
import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "../config/env.js";
import { SYSTEM_MEDIA_INSIGHT_PARSER } from "../ai/prompts.js";
import type { KnowledgeCategory, KnowledgeItem } from "../db/types.js";

const execFileAsync = promisify(execFile);
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

export type MediaType = "instagram" | "youtube";

export interface MediaDetection {
  url: string;
  type: MediaType;
  id: string;
}

export interface MediaMetadata {
  url: string;
  type: MediaType;
  title?: string;
  author?: string;
  caption?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface MediaInsightResult extends Omit<KnowledgeItem, "id"> {
  author?: string;
  sourceUrl: string;
  mediaType: MediaType;
  keyInsights: string[];
  rawTitle?: string;
}

export interface MediaExtraContext {
  title?: string;
  author?: string;
  caption?: string;
  audioBase64?: string;
  audioMimeType?: string;
}

// Regex patterns for Instagram and YouTube links
const INSTAGRAM_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)(?:\/[^\s]*)?/i;

const YOUTUBE_REGEX =
  /https?:\/\/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11}|[A-Za-z0-9_-]+)(?:[^\s]*)?/i;

/**
 * Detects if a text string contains an Instagram Reel/Post or YouTube link.
 * Returns the matched URL, media type, and media identifier, or null if none found.
 */
export function findMediaUrl(text: string): MediaDetection | null {
  if (!text) return null;

  // Check YouTube first
  const ytMatch = text.match(YOUTUBE_REGEX);
  if (ytMatch) {
    const rawUrl = ytMatch[0];
    const id = ytMatch[1];
    return {
      url: rawUrl,
      type: "youtube",
      id,
    };
  }

  // Check Instagram
  const igMatch = text.match(INSTAGRAM_REGEX);
  if (igMatch) {
    const rawUrl = igMatch[0];
    const id = igMatch[1];
    return {
      url: rawUrl,
      type: "instagram",
      id,
    };
  }

  return null;
}

/**
 * Checks if a string contains any supported media URL.
 */
export function isMediaUrl(text: string): boolean {
  return findMediaUrl(text) !== null;
}

/**
 * Fetches public oEmbed metadata for YouTube.
 */
async function fetchYouTubeOEmbed(url: string): Promise<Partial<MediaMetadata>> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      url
    )}&format=json`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as any;
    return {
      title: data.title,
      author: data.author_name,
      thumbnailUrl: data.thumbnail_url,
    };
  } catch (err) {
    console.warn("YouTube oEmbed fetch failed, attempting fallback:", err);
    return {};
  }
}

/**
 * Fetches public oEmbed metadata for Instagram.
 */
async function fetchInstagramOEmbed(url: string): Promise<Partial<MediaMetadata>> {
  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(
      url
    )}`;
    const res = await fetch(oembedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return {};
    const data = (await res.json()) as any;
    return {
      title: data.title,
      author: data.author_name,
      thumbnailUrl: data.thumbnail_url,
    };
  } catch (err) {
    console.warn("Instagram oEmbed fetch failed, attempting fallback:", err);
    return {};
  }
}

/**
 * Executes yt-dlp to extract rich metadata if installed on PATH.
 */
async function fetchYtDlpMetadata(url: string): Promise<Partial<MediaMetadata>> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--dump-json",
        "--skip-download",
        "--no-warnings",
        "--no-playlist",
        url,
      ],
      { timeout: 8000 }
    );
    const data = JSON.parse(stdout);
    return {
      title: data.title,
      author: data.uploader || data.channel || data.creator,
      description: data.description,
      caption: data.description,
      thumbnailUrl: data.thumbnail,
    };
  } catch {
    // yt-dlp may not be installed or post may require login
    return {};
  }
}

/**
 * Fetches open-graph metadata from public HTML as a fallback.
 */
async function fetchHtmlFallback(url: string): Promise<Partial<MediaMetadata>> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return {};
    const html = await res.text();

    const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1];
    const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];
    const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1];

    return {
      title: ogTitle || titleTag,
      description: ogDesc,
      caption: ogDesc,
    };
  } catch {
    return {};
  }
}

/**
 * Fetches full metadata for a detected media URL using oEmbed, yt-dlp, and HTML scraping fallbacks.
 */
export async function fetchMediaMetadata(
  url: string,
  type?: MediaType
): Promise<MediaMetadata> {
  const detected = type ? { url, type, id: "" } : findMediaUrl(url);
  const mediaType = detected?.type || "instagram";

  let oembedData: Partial<MediaMetadata> = {};
  if (mediaType === "youtube") {
    oembedData = await fetchYouTubeOEmbed(url);
  } else {
    oembedData = await fetchInstagramOEmbed(url);
  }

  // If oEmbed didn't yield description/caption or title, try yt-dlp
  let ytDlpData: Partial<MediaMetadata> = {};
  if (!oembedData.title || !oembedData.caption) {
    ytDlpData = await fetchYtDlpMetadata(url);
  }

  // If still missing title, try HTML fallback
  let htmlData: Partial<MediaMetadata> = {};
  if (!oembedData.title && !ytDlpData.title) {
    htmlData = await fetchHtmlFallback(url);
  }

  const shortcode = detected?.id || url.split("/").filter(Boolean).pop() || "media";

  return {
    url,
    type: mediaType,
    title:
      oembedData.title ||
      ytDlpData.title ||
      htmlData.title ||
      (mediaType === "instagram" ? `Instagram Reel (${shortcode})` : `YouTube Video (${shortcode})`),
    author:
      oembedData.author ||
      ytDlpData.author ||
      (mediaType === "instagram" ? "Instagram Creator" : "YouTube Creator"),
    caption: oembedData.caption || ytDlpData.caption || htmlData.caption,
    description: ytDlpData.description || htmlData.description,
    thumbnailUrl: oembedData.thumbnailUrl || ytDlpData.thumbnailUrl,
  };
}

function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

/**
 * Calls Gemini Flash with resilient model fallback (gemini-2.5-flash -> gemini-3.5-flash -> gemini-3.8-flash).
 */
async function generateGeminiContent(promptParts: any[] | string) {
  const models = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"];
  let lastError: any = null;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptParts);
      return result;
    } catch (err: any) {
      lastError = err;
      // If 404/not available, try next model in fallback list
      if (
        err?.message?.includes("404") ||
        err?.message?.includes("not found") ||
        err?.message?.includes("no longer available") ||
        err?.status === 404
      ) {
        continue;
      }
      // If temporary overload 503, retry next fallback
      if (err?.status === 503 || err?.message?.includes("high demand")) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini Flash model endpoints failed.");
}

/**
 * Extracts high-signal knowledge items from an Instagram Reel or YouTube link using Gemini Flash.
 * Categorizes into "strategy", "tool", "insight", or "win".
 * Returns a structured KnowledgeItem ready for Firestore and Notion.
 */
export async function extractMediaInsight(
  url: string,
  userId: string,
  extraContext?: MediaExtraContext
): Promise<MediaInsightResult> {
  const detected = findMediaUrl(url);
  const mediaType: MediaType = detected?.type || "instagram";

  // Fetch metadata
  const metadata = await fetchMediaMetadata(url, mediaType);

  // Merge extra context if provided (e.g. from saved_posts.json)
  const resolvedTitle = extraContext?.title || metadata.title || "Media Knowledge Digest";
  const resolvedAuthor = extraContext?.author || metadata.author || "Creator";
  const resolvedCaption =
    extraContext?.caption || metadata.caption || metadata.description || "";

  const userPrompt = `Media Type: ${mediaType === "youtube" ? "YouTube Video / Short" : "Instagram Reel / Post"}
URL: ${url}
Title / Raw Heading: ${resolvedTitle}
Creator / Author: ${resolvedAuthor}
Caption / Description:
${resolvedCaption || "(No caption provided. Synthesize insights based on topic, title, and context.)"}`;

  const promptParts: any[] = [
    `${SYSTEM_MEDIA_INSIGHT_PARSER}

Analyze and digest the following media content into the strict JSON schema:

${userPrompt}`,
  ];

  // If audio is provided, pass inline audio data to Gemini
  if (extraContext?.audioBase64) {
    promptParts.push({
      inlineData: {
        mimeType: extraContext.audioMimeType || "audio/mp3",
        data: extraContext.audioBase64,
      },
    });
  }

  const result = await generateGeminiContent(promptParts);
  const rawText = result.response.text();
  const cleaned = cleanJsonOutput(rawText);

  let parsed: {
    category: KnowledgeCategory;
    title: string;
    keyInsights: string[];
    actionableTakeaway: string;
    tags: string[];
  };

  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn("Failed to parse Gemini JSON output, using structured fallback:", err);
    parsed = {
      category: "strategy",
      title: resolvedTitle.slice(0, 80),
      keyInsights: [
        "Core media principle extracted from video",
        "Key execution pattern demonstrated by creator",
        "Framework for integration into personal telemetry",
      ],
      actionableTakeaway: "Apply the demonstrated workflow in your next focused session.",
      tags: ["media", mediaType, "learning"],
    };
  }

  // Ensure category is valid
  const validCategories: KnowledgeCategory[] = ["strategy", "tool", "insight", "win", "gotcha"];
  const category: KnowledgeCategory = validCategories.includes(parsed.category)
    ? parsed.category
    : "strategy";

  const keyInsights = Array.isArray(parsed.keyInsights) && parsed.keyInsights.length > 0
    ? parsed.keyInsights.slice(0, 3)
    : [
        "Core insight synthesized from media",
        "High-leverage method or pattern",
        "Personal optimization vector",
      ];

  const tags = (Array.isArray(parsed.tags) ? parsed.tags : ["media", mediaType])
    .map((t) => t.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);

  const actionableTakeaway =
    parsed.actionableTakeaway || "Integrate this technique into your next practice block.";

  // Format content with the 3 bullet points + media source link
  const bulletsFormatted = keyInsights.map((k) => `• ${k}`).join("\n");
  const content = `${bulletsFormatted}\n\nSource: [${resolvedAuthor || "Media"}](${url})`;

  return {
    userId,
    timestamp: new Date(),
    category,
    title: parsed.title || resolvedTitle,
    content,
    tags,
    actionableTakeaway,
    author: resolvedAuthor,
    sourceUrl: url,
    mediaType,
    keyInsights,
    rawTitle: resolvedTitle,
  };
}
