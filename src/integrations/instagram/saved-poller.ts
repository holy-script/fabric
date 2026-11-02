import fs from "fs";
import path from "path";
import { getInstagramSettings, setInstagramSettings } from "../../db/firestore.js";

export interface SavedReelItem {
  id: string;
  code: string;
  url: string;
  caption: string;
  title: string;
  author: string;
  timestamp: number;
  savedAt: Date;
  isVideo?: boolean;
  thumbnailUrl?: string;
  rawItem?: any;
}

export interface InstagramSessionData {
  sessionId: string;
  dsUserId?: string;
  csrfToken?: string;
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const INSTAGRAM_APP_ID = "936619743392459"; // Standard Instagram web client app ID

const CHECKPOINT_FILE = path.resolve(process.cwd(), ".reels_import_checkpoint.json");
const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");

/**
 * Parses a cookie string or extracts components from raw session inputs.
 */
export function parseCookieString(raw: string): InstagramSessionData {
  const trimmed = raw.trim();

  let sessionId = "";
  let dsUserId: string | undefined;
  let csrfToken: string | undefined;

  if (trimmed.includes(";") || trimmed.includes("=")) {
    const parts = trimmed.split(";");
    for (const part of parts) {
      const [k, ...v] = part.trim().split("=");
      const key = k?.trim().toLowerCase();
      const val = v.join("=").trim();
      if (key === "sessionid") sessionId = val;
      else if (key === "ds_user_id") dsUserId = val;
      else if (key === "csrftoken") csrfToken = val;
    }
  } else {
    sessionId = trimmed;
  }

  // Derive ds_user_id from session ID prefix if not explicitly present
  // e.g. "6789012345%3AXyZ..." or "6789012345:XyZ..."
  if (!dsUserId && sessionId) {
    const match = sessionId.match(/^(\d+)(?:%3A|:)/);
    if (match && match[1]) {
      dsUserId = match[1];
    }
  }

  return { sessionId, dsUserId, csrfToken };
}

/**
 * Constructs realistic Cookie header for Instagram Web API requests.
 */
export function buildCookieHeader(
  sessionId: string,
  dsUserId?: string,
  csrfToken?: string
): string {
  const trimmed = sessionId.trim();
  if (trimmed.includes(";") && trimmed.toLowerCase().includes("sessionid=")) {
    return trimmed;
  }

  const parsed = parseCookieString(trimmed);
  const finalSessionId = parsed.sessionId || trimmed;
  const finalUserId = dsUserId || parsed.dsUserId || "";
  const finalCsrf = csrfToken || parsed.csrfToken || "ig_csrf_token";

  let header = `sessionid=${finalSessionId};`;
  if (finalUserId) {
    header += ` ds_user_id=${finalUserId};`;
  }
  header += ` csrftoken=${finalCsrf};`;
  return header;
}

/**
 * Retrieves the Instagram session ID from environment or Firestore.
 */
export async function getStoredInstagramSession(): Promise<InstagramSessionData | null> {
  // 1. Check environment variable
  if (process.env.INSTAGRAM_SESSION_ID) {
    const parsed = parseCookieString(process.env.INSTAGRAM_SESSION_ID);
    if (parsed.sessionId) {
      return parsed;
    }
  }

  // 2. Check Firestore settings/instagram
  try {
    const settings = await getInstagramSettings();
    if (settings?.sessionId) {
      const parsed = parseCookieString(settings.sessionId);
      return {
        sessionId: parsed.sessionId || settings.sessionId,
        dsUserId: settings.dsUserId || parsed.dsUserId,
        csrfToken: settings.csrfToken || parsed.csrfToken,
      };
    }
  } catch (err) {
    console.warn("⚠️ Could not read Instagram settings from Firestore:", err);
  }

  return null;
}

/**
 * Saves Instagram session credentials to Firestore settings/instagram.
 */
export async function saveStoredInstagramSession(
  rawSessionInput: string,
  username?: string
): Promise<InstagramSessionData> {
  const parsed = parseCookieString(rawSessionInput);
  if (!parsed.sessionId) {
    throw new Error("Invalid session string: no sessionid found.");
  }

  await setInstagramSettings({
    sessionId: parsed.sessionId,
    dsUserId: parsed.dsUserId,
    csrfToken: parsed.csrfToken,
    ...(username ? { username } : {}),
  });

  return parsed;
}

/**
 * Parses raw Instagram API item into standard SavedReelItem.
 */
export function parseInstagramItem(item: any): SavedReelItem | null {
  if (!item || typeof item !== "object") return null;

  // Instagram items can be nested under .media or .node (GraphQL) or direct
  const media = item.media || item.node || item;
  const code = media.code || media.shortcode;
  if (!code || typeof code !== "string") return null;

  const url = `https://www.instagram.com/reel/${code}/`;

  // Caption extraction
  let caption = "";
  if (typeof media.caption === "string") {
    caption = media.caption;
  } else if (media.caption?.text && typeof media.caption.text === "string") {
    caption = media.caption.text;
  } else if (media.edge_media_to_caption?.edges?.[0]?.node?.text) {
    caption = media.edge_media_to_caption.edges[0].node.text;
  }

  // Author extraction
  let author = "instagram_creator";
  if (media.user?.username) {
    author = media.user.username;
  } else if (media.owner?.username) {
    author = media.owner.username;
  }

  // Title extraction: first line of caption or derived
  let title = "";
  if (caption) {
    const lines = caption.split("\n").map((l: string) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      const firstLine = lines[0].replace(/[#@][\w.-]+/g, "").trim();
      title = firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
    }
  }
  if (!title) {
    title = `Reel by @${author} (${code})`;
  }

  // Timestamp
  const timestamp =
    media.taken_at ||
    media.taken_at_timestamp ||
    media.device_timestamp ||
    Math.floor(Date.now() / 1000);
  const savedAt = new Date(timestamp * 1000);

  // Thumbnail
  const thumbnailUrl =
    media.image_versions2?.candidates?.[0]?.url ||
    media.display_url ||
    media.thumbnail_src;

  const isVideo =
    media.media_type === 2 ||
    media.is_video === true ||
    media.product_type === "clips" ||
    Boolean(media.video_versions && media.video_versions.length > 0);

  return {
    id: String(media.id || code),
    code,
    url,
    caption: caption.trim(),
    title: title.trim(),
    author: author.trim(),
    timestamp,
    savedAt,
    isVideo,
    thumbnailUrl,
    rawItem: media,
  };
}

/**
 * Fetches saved reels/posts from Instagram Web API.
 * Endpoint: https://www.instagram.com/api/v1/feed/saved/posts/
 *
 * @param sessionId - Instagram sessionid cookie or full cookie string
 * @param maxItems - Maximum number of items to fetch (default: 20)
 * @returns Array of parsed reel items
 */
export async function fetchNewSavedReels(
  sessionId: string,
  maxItems = 20
): Promise<SavedReelItem[]> {
  const cookieHeader = buildCookieHeader(sessionId);

  const headers: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    "X-IG-App-ID": INSTAGRAM_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.instagram.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Cookie": cookieHeader,
  };

  const results: SavedReelItem[] = [];
  const seenCodes = new Set<string>();
  let nextMaxId: string | undefined;
  let hasMore = true;

  while (results.length < maxItems && hasMore) {
    const url = new URL("https://www.instagram.com/api/v1/feed/saved/posts/");
    if (nextMaxId) {
      url.searchParams.set("max_id", nextMaxId);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err: any) {
      // If primary endpoint failed on network, try GraphQL fallback
      console.warn("Primary Instagram saved endpoint error:", err.message);
      break;
    }

    if (response.status === 401 || response.status === 403 || response.redirected) {
      throw new Error(
        `Instagram authentication failed (${response.status}). Session ID may be expired or invalid. Please update with /syncig session <sessionid>`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      if (text.includes("login") || text.includes("checkpoint")) {
        throw new Error(
          "Instagram returned login/checkpoint challenge. Please refresh your sessionid from a logged-in browser."
        );
      }
      throw new Error(
        `Instagram returned unexpected response format: ${contentType || "unknown"}`
      );
    }

    const data = (await response.json()) as any;

    const rawItems: any[] = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.saved_items)
      ? data.saved_items
      : [];

    if (rawItems.length === 0) {
      break;
    }

    for (const raw of rawItems) {
      const parsed = parseInstagramItem(raw);
      if (parsed && !seenCodes.has(parsed.code)) {
        seenCodes.add(parsed.code);
        results.push(parsed);
        if (results.length >= maxItems) break;
      }
    }

    nextMaxId = data.next_max_id;
    hasMore = Boolean(data.more_available && nextMaxId);
  }

  // GraphQL fallback if primary returned 0 items
  if (results.length === 0) {
    try {
      const gqlResults = await fetchSavedPostsViaGraphQL(cookieHeader, maxItems);
      for (const item of gqlResults) {
        if (!seenCodes.has(item.code)) {
          seenCodes.add(item.code);
          results.push(item);
          if (results.length >= maxItems) break;
        }
      }
    } catch {
      // GraphQL fallback silent if already handled
    }
  }

  return results;
}

/**
 * GraphQL Query fallback for Instagram saved items.
 * Query hash: d6342801a8040d65a886b6a0753faeb4 (edge_saved_media)
 */
async function fetchSavedPostsViaGraphQL(
  cookieHeader: string,
  limit: number
): Promise<SavedReelItem[]> {
  const queryHash = "d6342801a8040d65a886b6a0753faeb4";
  const variables = JSON.stringify({ first: Math.min(limit, 50) });
  const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(
    variables
  )}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      "X-IG-App-ID": INSTAGRAM_APP_ID,
      "Accept": "*/*",
      "Referer": "https://www.instagram.com/",
      "Cookie": cookieHeader,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as any;
  const edges: any[] = data?.data?.user?.edge_saved_media?.edges || [];
  const items: SavedReelItem[] = [];

  for (const edge of edges) {
    const parsed = parseInstagramItem(edge.node);
    if (parsed) items.push(parsed);
  }

  return items;
}

/**
 * Verifies if an Instagram session ID is currently active and valid.
 */
export async function verifyInstagramSession(
  sessionId: string
): Promise<{ valid: boolean; username?: string; count?: number; error?: string }> {
  try {
    const items = await fetchNewSavedReels(sessionId, 2);
    return {
      valid: true,
      count: items.length,
      username: items[0]?.author,
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || "Failed to verify session",
    };
  }
}

/**
 * Checks if a given reel URL has already been processed in local checkpoints or trackers.
 */
export function isReelAlreadyIngestedLocally(url: string): boolean {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].replace(/\/+$/, "") + "/";

  // 1. Check .reels_import_checkpoint.json
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
      if (checkpoint?.processedUrls && checkpoint.processedUrls[cleanUrl]) {
        return true;
      }
    } catch {}
  }

  // 2. Check .telegram_vault_tracker.json
  if (fs.existsSync(VAULT_TRACKER_FILE)) {
    try {
      const tracker = JSON.parse(fs.readFileSync(VAULT_TRACKER_FILE, "utf-8"));
      if (tracker?.archivedUrls && tracker.archivedUrls[cleanUrl]) {
        return true;
      }
    } catch {}
  }

  return false;
}
