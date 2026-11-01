import { getUserState } from "../db/firestore.js";
import { isNotionConfigured } from "./client.js";

const DEFAULT_FABRIC_OS_PAGE_ID = "40bb60bd-d61f-80e6-96bf-c734d5dc7709";

export { isNotionConfigured };

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
 * Resolves the Notion parent page ID for "Fabric OS".
 * Checks NOTION_PARENT_PAGE_ID env var, then searches Notion for "Fabric OS",
 * and falls back to the default parent ID 40bb60bd-d61f-80e6-96bf-c734d5dc7709.
 */
export async function getFabricOSPageId(): Promise<string> {
  const envId = process.env.NOTION_PARENT_PAGE_ID?.trim();
  if (envId) {
    return envId.replace(/-/g, "");
  }

  if (isNotionConfigured()) {
    try {
      const res = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: getNotionHeaders(),
        body: JSON.stringify({
          query: "Fabric OS",
          filter: { value: "page", property: "object" },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const fabricPage = data.results?.find((p: any) => {
          const title =
            p.properties?.title?.title?.[0]?.plain_text ||
            p.properties?.Name?.title?.[0]?.plain_text ||
            "";
          return title.toLowerCase().includes("fabric os");
        });

        if (fabricPage?.id) {
          return fabricPage.id.replace(/-/g, "");
        }
      }
    } catch (err) {
      console.warn("Could not query Notion search for Fabric OS page:", err);
    }
  }

  return DEFAULT_FABRIC_OS_PAGE_ID.replace(/-/g, "");
}

/**
 * Tokenizes plain text into Notion rich_text objects supporting bold (*text*, **text**) and inline code (`code`).
 */
function toRichText(rawText: string): any[] {
  if (!rawText) return [];
  const text = rawText.slice(0, 2000);
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g;
  const matches = text.match(regex);
  if (!matches) {
    return [{ type: "text", text: { content: text } }];
  }

  const result: any[] = [];
  for (const part of matches) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      result.push({
        type: "text",
        text: { content: part.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      result.push({
        type: "text",
        text: { content: part.slice(1, -1) },
        annotations: { bold: true },
      });
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      result.push({
        type: "text",
        text: { content: part.slice(1, -1) },
        annotations: { code: true },
      });
    } else if (part.length > 0) {
      result.push({
        type: "text",
        text: { content: part },
      });
    }
  }

  return result.length > 0 ? result : [{ type: "text", text: { content: text } }];
}

/**
 * Converts markdown text into structured Notion block objects.
 */
function parseMarkdownToBlocks(text: string): any[] {
  const blocks: any[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: toRichText(line.slice(4)) },
      });
    } else if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: toRichText(line.slice(3)) },
      });
    } else if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: toRichText(line.slice(2)) },
      });
    } else if (line === "---" || line === "___" || line === "***") {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {},
      });
    } else if (line.startsWith("> ")) {
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: toRichText(line.slice(2)) },
      });
    } else if (/^[-•]\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: toRichText(line.replace(/^[-•]\s+/, "")) },
      });
    } else if (/^\d+\.\s+/.test(line)) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: toRichText(line.replace(/^\d+\.\s+/, "")) },
      });
    } else if (line.includes("Malware Alert") || line.includes("⚠️ *Malware")) {
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "⚠️" },
          color: "red_background",
          rich_text: toRichText(line),
        },
      });
    } else if (line.includes("Highest Return") || line.includes("🏆 *Highest")) {
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "🏆" },
          color: "green_background",
          rich_text: toRichText(line),
        },
      });
    } else if (line.includes("Operational Directive") || line.includes("🎯 *Operational")) {
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "🎯" },
          color: "purple_background",
          rich_text: toRichText(line),
        },
      });
    } else if (line.includes("[█") || line.includes("[░")) {
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "⚖️" },
          color: "yellow_background",
          rich_text: toRichText(line),
        },
      });
    } else if (/^(?:🏛️|📊|📈|🎯|⚡|🌱|🛡️|⚖️)\s+\*[^*]+\*/.test(line)) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: toRichText(line) },
      });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: toRichText(line) },
      });
    }
  }

  return blocks;
}

/**
 * Exports or updates the Compounding Portfolio Showcase page in Notion under Fabric OS.
 *
 * @param userId - User ID to fetch personal telemetry from Firestore
 * @param portfolioSummary - AI-synthesized portfolio text
 * @returns Object with Notion page ID and URL
 */
export async function exportPortfolioToNotion(
  userId: string,
  portfolioSummary: string
): Promise<{ id: string; url: string }> {
  if (!isNotionConfigured()) {
    throw new Error("Notion is not configured. Missing NOTION_API_KEY or NOTION_DATABASE_ID.");
  }

  const parentId = await getFabricOSPageId();
  const userState = await getUserState(userId).catch(() => null);

  const focusHours = (userState?.totalFocusHours || 0).toFixed(1);
  const factsCount = userState?.totalFactsAcquired || 0;
  const fundsSpent = (userState?.totalFundsSpent || 0).toFixed(0);
  const fundsYield = (userState?.totalFundsYield || 0).toFixed(0);
  const energyDelta = (userState?.averageEnergyDelta || 0).toFixed(2);
  const activePlugins = (userState?.activePlugins || ["monotropic-flow"]).join(", ");

  // 1. Build rich Notion blocks for the Portfolio Showcase
  const blocks: any[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "🏛️" },
        color: "purple_background",
        rich_text: [
          {
            type: "text",
            text: {
              content:
                "THE FABRIC: COMPOUNDING PORTFOLIO SHOWCASE\nA live, evidence-based showcase of compounding personal leverage, telemetry, and polymathic capability across 5 dimensions.",
            },
            annotations: { bold: true },
          },
        ],
      },
    },
    {
      object: "block",
      type: "divider",
      divider: {},
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: toRichText("📊 5-Dimension Compounding Capabilities"),
      },
    },
    // Dimension 1: Volume
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "⏱️" },
        color: "blue_background",
        rich_text: toRichText(
          `*1. Volume & Capital Deployed*\n• Focus Deployed: *${focusHours} Focus Hours* invested into deep builds\n• Verified Facts & Artifacts: *${factsCount} knowledge assets*\n• Funds Trajectory: *\$${fundsSpent} deployed* → *\$${fundsYield} yield*`
        ),
      },
    },
    // Dimension 2: Growth
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "📈" },
        color: "green_background",
        rich_text: toRichText(
          `*2. Growth Trajectory & Systemic Complexity*\n• Evolution: Escalating from atomic tasks into automated multi-agent mesh pipelines.\n• Compounding Index: Self-reinforcing feedback loops across Firestore & Notion Knowledge Garden.`
        ),
      },
    },
    // Dimension 3: Routine & Momentum
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "⚡" },
        color: "yellow_background",
        rich_text: toRichText(
          `*3. Routine & Energy Momentum*\n• Energy Delta Index: *${Number(energyDelta) >= 0 ? "+" : ""}${energyDelta}* net energy per session\n• Active Cognitive Protocols: *${activePlugins}*\n• Resilience: Anti-burnout Aristotelian equilibrium gates active.`
        ),
      },
    },
    // Dimension 4: Expertise Depth
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "🎯" },
        color: "orange_background",
        rich_text: toRichText(
          `*4. Expertise Depth (Specialized Domains)*\n• Technical Core: Distributed agent mesh architecture, TypeScript meta-systems, and real-time LLM synthesis.\n• Execution Standard: High-frequency knowledge extraction with permanent documentation.`
        ),
      },
    },
    // Dimension 5: Polymathic Breadth
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "🌐" },
        color: "pink_background",
        rich_text: toRichText(
          `*5. Polymathic Breadth (Logic × Vitality × Expressionism)*\n• Systemic Integration: Synthesizing algorithmic rigor (Logic), physical stamina & recovery (Vitality), and creative articulation (Expressionism).`
        ),
      },
    },
    {
      object: "block",
      type: "divider",
      divider: {},
    },
    {
      object: "block",
      type: "quote",
      quote: {
        rich_text: toRichText(
          `"Compounding capability is non-linear. The daily exchange of Focus and Energy crystallizes into insurmountable creative infrastructure."`
        ),
      },
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: toRichText("🏛️ Synthesizer Executive Analysis"),
      },
    },
  ];

  // Append parsed report blocks from synthesizer
  const parsedSummaryBlocks = parseMarkdownToBlocks(portfolioSummary);
  blocks.push(...parsedSummaryBlocks);

  // Footer block
  blocks.push(
    {
      object: "block",
      type: "divider",
      divider: {},
    },
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "🔄" },
        color: "gray_background",
        rich_text: toRichText(
          `_Synchronized by The Fabric Synthesizer Agent • Telemetry ID: ${userId} • ${new Date().toUTCString()}_`
        ),
      },
    }
  );

  // 2. Check if a "Compounding Portfolio Showcase" sub-page already exists under Fabric OS
  const childrenRes = await fetch(
    `https://api.notion.com/v1/blocks/${parentId}/children`,
    {
      method: "GET",
      headers: getNotionHeaders(),
    }
  );

  let existingPageId: string | null = null;
  if (childrenRes.ok) {
    const data = (await childrenRes.json()) as any;
    const existing = data.results?.find(
      (b: any) =>
        b.type === "child_page" &&
        b.child_page?.title?.toLowerCase().includes("portfolio")
    );
    if (existing?.id) {
      existingPageId = existing.id;
    }
  }

  if (existingPageId) {
    // Update existing page
    await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
      method: "PATCH",
      headers: getNotionHeaders(),
      body: JSON.stringify({
        icon: { type: "emoji", emoji: "🏛️" },
        properties: {
          title: {
            title: [
              {
                type: "text",
                text: { content: "Compounding Portfolio Showcase" },
              },
            ],
          },
        },
      }),
    });

    // Delete previous children blocks to refresh with latest telemetry
    const oldBlocksRes = await fetch(
      `https://api.notion.com/v1/blocks/${existingPageId}/children`,
      {
        headers: getNotionHeaders(),
      }
    );
    if (oldBlocksRes.ok) {
      const oldBlocksData = (await oldBlocksRes.json()) as any;
      const oldBlocks = oldBlocksData.results || [];
      // Delete in parallel batches of 5 for snappy updates
      for (let i = 0; i < oldBlocks.length; i += 5) {
        const batch = oldBlocks.slice(i, i + 5);
        await Promise.allSettled(
          batch.map((b: any) =>
            fetch(`https://api.notion.com/v1/blocks/${b.id}`, {
              method: "DELETE",
              headers: getNotionHeaders(),
            })
          )
        );
      }
    }

    // Append updated blocks in chunks of 100
    for (let i = 0; i < blocks.length; i += 100) {
      const chunk = blocks.slice(i, i + 100);
      await fetch(
        `https://api.notion.com/v1/blocks/${existingPageId}/children`,
        {
          method: "PATCH",
          headers: getNotionHeaders(),
          body: JSON.stringify({ children: chunk }),
        }
      );
    }

    // Fetch updated page URL
    const pageRes = await fetch(
      `https://api.notion.com/v1/pages/${existingPageId}`,
      {
        headers: getNotionHeaders(),
      }
    );
    const pageData = pageRes.ok ? ((await pageRes.json()) as any) : null;
    const url =
      pageData?.url ||
      `https://notion.so/${existingPageId.replace(/-/g, "")}`;

    return { id: existingPageId, url };
  } else {
    // Create new sub-page under Fabric OS
    const firstChunk = blocks.slice(0, 100);
    const createRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: getNotionHeaders(),
      body: JSON.stringify({
        parent: { page_id: parentId },
        icon: { type: "emoji", emoji: "🏛️" },
        properties: {
          title: {
            title: [
              {
                type: "text",
                text: { content: "Compounding Portfolio Showcase" },
              },
            ],
          },
        },
        children: firstChunk,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Notion portfolio page (${createRes.status}): ${errText}`);
    }

    const createdPage = (await createRes.json()) as any;
    const newPageId = createdPage.id;

    // Append remaining blocks if any
    for (let i = 100; i < blocks.length; i += 100) {
      const chunk = blocks.slice(i, i + 100);
      await fetch(
        `https://api.notion.com/v1/blocks/${newPageId}/children`,
        {
          method: "PATCH",
          headers: getNotionHeaders(),
          body: JSON.stringify({ children: chunk }),
        }
      );
    }

    return {
      id: newPageId,
      url:
        createdPage.url ||
        `https://notion.so/${newPageId.replace(/-/g, "")}`,
    };
  }
}

/**
 * Appends or creates a weekly review entry under a "Weekly Sentinel Audits" section/sub-page in Notion.
 *
 * @param userId - User ID being audited
 * @param reportText - Sentinel audit reconnaissance text
 * @param date - Date of the weekly audit
 * @returns Object with Notion page ID and URL
 */
export async function exportSentinelReconToNotion(
  userId: string,
  reportText: string,
  date: Date = new Date()
): Promise<{ id: string; url: string }> {
  if (!isNotionConfigured()) {
    throw new Error("Notion is not configured. Missing NOTION_API_KEY or NOTION_DATABASE_ID.");
  }

  const fabricParentId = await getFabricOSPageId();
  const dateFormatted = date.toISOString().split("T")[0];

  // 1. Locate or create "Weekly Sentinel Audits" sub-page under Fabric OS
  const fabricChildrenRes = await fetch(
    `https://api.notion.com/v1/blocks/${fabricParentId}/children`,
    {
      headers: getNotionHeaders(),
    }
  );

  let auditsParentId: string | null = null;
  if (fabricChildrenRes.ok) {
    const data = (await fabricChildrenRes.json()) as any;
    const existing = data.results?.find(
      (b: any) =>
        b.type === "child_page" &&
        b.child_page?.title?.toLowerCase().includes("sentinel")
    );
    if (existing?.id) {
      auditsParentId = existing.id;
    }
  }

  if (!auditsParentId) {
    // Create "Weekly Sentinel Audits" sub-page under Fabric OS
    const createParentRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: getNotionHeaders(),
      body: JSON.stringify({
        parent: { page_id: fabricParentId },
        icon: { type: "emoji", emoji: "🛡️" },
        properties: {
          title: {
            title: [
              {
                type: "text",
                text: { content: "Weekly Sentinel Audits" },
              },
            ],
          },
        },
        children: [
          {
            object: "block",
            type: "callout",
            callout: {
              icon: { type: "emoji", emoji: "🛡️" },
              color: "blue_background",
              rich_text: toRichText(
                "Weekly Sentinel Reconnaissance Audits — Automated reviews to prevent burnout, detect behavioral malware, and balance the Aristotelian Mean across 4F dimensions."
              ),
            },
          },
          {
            object: "block",
            type: "divider",
            divider: {},
          },
        ],
      }),
    });

    if (!createParentRes.ok) {
      const errText = await createParentRes.text();
      throw new Error(`Failed to create Sentinel Audits parent page: ${errText}`);
    }

    const createdAuditsPage = (await createParentRes.json()) as any;
    auditsParentId = createdAuditsPage.id;
  }

  // 2. Build rich Notion blocks for this week's audit
  const auditBlocks: any[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "🛡️" },
        color: "blue_background",
        rich_text: toRichText(
          `*SENTINEL RECONNAISSANCE AUDIT • WEEK OF ${dateFormatted}*\nTelemetry audit protecting user ${userId} from behavioral drift and cognitive malware.`
        ),
      },
    },
    {
      object: "block",
      type: "divider",
      divider: {},
    },
  ];

  const parsedReportBlocks = parseMarkdownToBlocks(reportText);
  auditBlocks.push(...parsedReportBlocks);

  auditBlocks.push(
    {
      object: "block",
      type: "divider",
      divider: {},
    },
    {
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "⚖️" },
        color: "gray_background",
        rich_text: toRichText(
          `_Logged automatically by The Fabric Sentinel Agent • ${new Date().toUTCString()}_`
        ),
      },
    }
  );

  // 3. Create sub-page under "Weekly Sentinel Audits"
  const entryTitle = `Sentinel Audit — ${dateFormatted}`;
  const firstChunk = auditBlocks.slice(0, 100);

  const createEntryRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: getNotionHeaders(),
    body: JSON.stringify({
      parent: { page_id: auditsParentId },
      icon: { type: "emoji", emoji: "🛡️" },
      properties: {
        title: {
          title: [
            {
              type: "text",
              text: { content: entryTitle },
            },
          ],
        },
      },
      children: firstChunk,
    }),
  });

  if (!createEntryRes.ok) {
    const errText = await createEntryRes.text();
    throw new Error(`Failed to create Sentinel audit entry page: ${errText}`);
  }

  const entryData = (await createEntryRes.json()) as any;
  const entryId = entryData.id;

  // Append remaining blocks if any
  for (let i = 100; i < auditBlocks.length; i += 100) {
    const chunk = auditBlocks.slice(i, i + 100);
    await fetch(
      `https://api.notion.com/v1/blocks/${entryId}/children`,
      {
        method: "PATCH",
        headers: getNotionHeaders(),
        body: JSON.stringify({ children: chunk }),
      }
    );
  }

  return {
    id: entryId,
    url:
      entryData.url ||
      `https://notion.so/${entryId.replace(/-/g, "")}`,
  };
}
