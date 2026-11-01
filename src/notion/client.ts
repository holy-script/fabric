import type { KnowledgeItem } from "../db/types.js";

interface NotionDatabaseInfo {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
}

interface NotionDBSchema {
  titleKey: string;
  categoryKey: string;
  tagsKey: string;
  takeawayKey: string;
  dateKey: string | null;
}

let cachedSchema: {
  dbId: string;
  schema: NotionDBSchema;
  fetchedAt: number;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if Notion credentials and database ID are configured in environment variables.
 */
export function isNotionConfigured(): boolean {
  return Boolean(
    process.env.NOTION_API_KEY?.trim() && process.env.NOTION_DATABASE_ID?.trim()
  );
}

/**
 * Normalizes the database ID in case user provides dashed UUID or full URL.
 */
export function getNotionDatabaseId(): string {
  let raw = process.env.NOTION_DATABASE_ID?.trim() || "";
  if (raw.includes("notion.so/")) {
    const urlParts = raw.split("?")[0].split("/");
    raw = urlParts[urlParts.length - 1] || raw;
  }
  return raw.replace(/-/g, "");
}

function getNotionApiKey(): string {
  return process.env.NOTION_API_KEY?.trim() || "";
}

function getNotionHeaders() {
  return {
    Authorization: `Bearer ${getNotionApiKey()}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

/**
 * Resolves database property keys to match the user's Notion database schema.
 */
function resolveSchemaKeys(properties: Record<string, any>): NotionDBSchema {
  let titleKey = "Name";
  let categoryKey = "Category";
  let tagsKey = "Tags";
  let takeawayKey = "Takeaway";
  let dateKey: string | null = null;

  for (const [name, prop] of Object.entries(properties)) {
    const type = prop.type;
    const lower = name.toLowerCase();

    if (type === "title") {
      titleKey = name;
    } else if (type === "select" && (lower === "category" || lower === "type")) {
      categoryKey = name;
    } else if (type === "multi_select" && (lower === "tags" || lower === "tag")) {
      tagsKey = name;
    } else if (
      type === "rich_text" &&
      (lower === "takeaway" ||
        lower === "actionable takeaway" ||
        lower === "actionable_takeaway" ||
        lower === "takeaways")
    ) {
      takeawayKey = name;
    } else if (
      type === "date" &&
      (lower === "date" || lower === "timestamp" || lower === "created")
    ) {
      dateKey = name;
    }
  }

  return { titleKey, categoryKey, tagsKey, takeawayKey, dateKey };
}

/**
 * Fetches database metadata and properties from the Notion API.
 */
export async function getNotionDatabaseInfo(): Promise<NotionDatabaseInfo> {
  if (!isNotionConfigured()) {
    throw new Error(
      "Notion is not configured. Missing NOTION_API_KEY or NOTION_DATABASE_ID."
    );
  }

  const databaseId = getNotionDatabaseId();
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: "GET",
    headers: getNotionHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Notion API returned HTTP ${res.status}: ${errorBody}`);
  }

  const data = (await res.json()) as any;
  const title =
    data.title?.map((t: any) => t.plain_text).join("") || "Untitled Database";

  return {
    id: data.id,
    title,
    url: data.url || `https://www.notion.so/${data.id.replace(/-/g, "")}`,
    properties: data.properties || {},
  };
}

async function getSchema(databaseId: string): Promise<NotionDBSchema> {
  const now = Date.now();
  if (
    cachedSchema &&
    cachedSchema.dbId === databaseId &&
    now - cachedSchema.fetchedAt < CACHE_TTL_MS
  ) {
    return cachedSchema.schema;
  }

  try {
    const info = await getNotionDatabaseInfo();
    const schema = resolveSchemaKeys(info.properties);
    cachedSchema = { dbId: databaseId, schema, fetchedAt: now };
    return schema;
  } catch (err) {
    console.warn("Could not fetch Notion database schema, using fallback defaults:", err);
    return {
      titleKey: "Name",
      categoryKey: "Category",
      tagsKey: "Tags",
      takeawayKey: "Takeaway",
      dateKey: "Date",
    };
  }
}

function formatCategory(category: string): string {
  switch (category.toLowerCase()) {
    case "win":
      return "Win";
    case "gotcha":
      return "Gotcha";
    case "tool":
      return "Tool";
    case "strategy":
      return "Strategy";
    case "insight":
      return "Insight";
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

function getCategoryEmoji(category: string): string {
  switch (category.toLowerCase()) {
    case "win":
      return "🏆";
    case "gotcha":
      return "⚠️";
    case "tool":
      return "🛠️";
    case "strategy":
      return "♟️";
    case "insight":
      return "💡";
    default:
      return "📌";
  }
}

/**
 * Creates a page in the Notion database corresponding to a KnowledgeItem.
 *
 * Properties populated:
 * - Title (Name)
 * - Category (select: Win, Gotcha, Tool, Strategy, Insight)
 * - Tags (multi-select)
 * - Actionable Takeaway / Takeaway (rich text)
 * - Date (if present in schema)
 *
 * Children blocks:
 * - Content paragraphs
 * - Actionable Takeaway callout box
 */
export async function syncKnowledgeItemToNotion(
  item: KnowledgeItem
): Promise<{ id: string; url: string }> {
  if (!isNotionConfigured()) {
    throw new Error(
      "Notion is not configured. Missing NOTION_API_KEY or NOTION_DATABASE_ID."
    );
  }

  const databaseId = getNotionDatabaseId();
  const schema = await getSchema(databaseId);

  const properties: Record<string, any> = {
    [schema.titleKey]: {
      title: [
        {
          type: "text",
          text: {
            content: (item.title || "Untitled Knowledge Item").slice(0, 2000),
          },
        },
      ],
    },
    [schema.categoryKey]: {
      select: {
        name: formatCategory(item.category),
      },
    },
    [schema.tagsKey]: {
      multi_select: (item.tags || [])
        .map((tag) => ({
          name: tag.replace(/,/g, "").trim().slice(0, 100),
        }))
        .filter((t) => t.name.length > 0),
    },
  };

  if (item.actionableTakeaway && schema.takeawayKey) {
    properties[schema.takeawayKey] = {
      rich_text: [
        {
          type: "text",
          text: {
            content: item.actionableTakeaway.slice(0, 2000),
          },
        },
      ],
    };
  }

  if (schema.dateKey) {
    const timestamp =
      item.timestamp instanceof Date
        ? item.timestamp
        : new Date(item.timestamp || Date.now());
    properties[schema.dateKey] = {
      date: {
        start: timestamp.toISOString().split("T")[0],
      },
    };
  }

  // Children blocks: Content paragraphs + callout for takeaway
  const children: any[] = [];

  if (item.sourceUrl) {
    children.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "🔗 Source: " + item.sourceUrl,
              link: { url: item.sourceUrl },
            },
          },
          ...(item.author
            ? [
                {
                  type: "text",
                  text: { content: ` | Creator: @${item.author}` },
                },
              ]
            : []),
        ],
      },
    });
  }

  if (item.content) {
    const paragraphs = item.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paragraphs.length === 0 && item.content.trim().length > 0) {
      paragraphs.push(item.content.trim());
    }

    for (const paragraph of paragraphs) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: paragraph.slice(0, 2000),
              },
            },
          ],
        },
      });
    }
  }

  if (item.actionableTakeaway) {
    children.push({
      object: "block",
      type: "callout",
      callout: {
        icon: {
          type: "emoji",
          emoji: "💡",
        },
        rich_text: [
          {
            type: "text",
            text: {
              content: `Actionable Takeaway: ${item.actionableTakeaway.slice(0, 1980)}`,
            },
          },
        ],
      },
    });
  }

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: getNotionHeaders(),
    body: JSON.stringify({
      parent: {
        database_id: databaseId,
      },
      icon: {
        type: "emoji",
        emoji: getCategoryEmoji(item.category),
      },
      properties,
      children: children.length > 0 ? children : undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Notion API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as any;
  return {
    id: data.id,
    url: data.url || `https://www.notion.so/${data.id.replace(/-/g, "")}`,
  };
}
