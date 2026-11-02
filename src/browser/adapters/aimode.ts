/**
 * Google AI Mode Service Adapter for Fabric OS
 * Automates executing queries on Google AI Mode (AI Overviews & Search Generative Experience),
 * waits for generative streaming to complete, parses structured markdown, citations,
 * and extracts shareable URLs.
 */

import type { Page } from "puppeteer-core";
import { BrowserDriver, getBrowserDriver } from "../driver.js";

export interface AiModeCitation {
  title: string;
  url: string;
  source?: string;
  snippet?: string;
}

export interface AiModeResult {
  query: string;
  markdown: string;
  citations: AiModeCitation[];
  shareUrl?: string;
  rawText: string;
  timestamp: string;
}

export interface AiModeOptions {
  timeout?: number;
  waitForStreamMs?: number;
  language?: string;
}

export class AiModeAdapter {
  private driver: BrowserDriver;

  constructor(driver?: BrowserDriver) {
    this.driver = driver || getBrowserDriver();
  }

  /**
   * Dismisses Google cookie / GDPR consent dialog if present.
   */
  private async handleConsentDialog(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        // Look for common Google consent button IDs & labels
        const acceptBtn =
          (document.querySelector("#L2AGYb") as HTMLElement) ||
          (document.querySelector("button[aria-label*='Accept all' i]") as HTMLElement) ||
          (document.querySelector("button[aria-label*='I agree' i]") as HTMLElement);

        if (acceptBtn) {
          acceptBtn.click();
          return;
        }

        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const t = btn.textContent?.trim().toLowerCase() || "";
          if (t === "accept all" || t === "i agree" || t === "agree") {
            btn.click();
            break;
          }
        }
      });
    } catch {
      // Ignore if no consent modal
    }
  }

  /**
   * Executes a search query in Google AI Mode, waits for streaming completion,
   * extracts markdown content, citations, and share link.
   */
  public async executeQuery(
    query: string,
    options: AiModeOptions = {}
  ): Promise<AiModeResult> {
    const page = await this.driver.getPage();
    const timeout = options.timeout || 30000;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${options.language || "en"}`;

    await this.driver.goto(searchUrl, { waitUntil: "domcontentloaded", timeout }, page);
    await this.handleConsentDialog(page);

    // Check if an AI Overview "Generate" prompt exists and click it
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || "";
        if (text === "generate" || text.includes("get an ai overview")) {
          (btn as HTMLElement).click();
          break;
        }
      }
    });

    // Wait for the AI Overview container to appear
    const aiOverviewSelector = [
      "div[data-attrid='wa:/description']",
      "div[data-sge-overview]",
      "div[aria-label*='AI Overview' i]",
      "div[data-sge-content]",
      "div[role='region'][aria-label*='AI' i]",
      "div[data-md='100']",
    ].join(", ");

    let containerFound = await this.driver.waitForSelector(
      aiOverviewSelector,
      { timeout: 12000 },
      page
    );

    // If specific selectors didn't match, check for AI Overview heading
    if (!containerFound) {
      containerFound = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, div, span"));
        return headings.some(
          (h) => h.textContent?.trim().toLowerCase() === "ai overview"
        );
      });
    }

    // Wait for generative streaming to stabilize
    await this.waitForStreamingCompletion(page, options.waitForStreamMs || 10000);

    // Click "Show more" button if available to expand truncated AI overview
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
        for (const btn of buttons) {
          const t = btn.textContent?.trim().toLowerCase() || "";
          const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (t.includes("show more") || aria.includes("show more")) {
            (btn as HTMLElement).click();
            break;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 600));
    } catch {
      // Non-fatal
    }

    // Extract citations
    const citations = await this.extractCitations(page);

    // Extract Markdown and raw text
    const { markdown, rawText } = await this.extractMarkdownAndText(page, query);

    // Attempt to extract or trigger a share URL
    const shareUrl = await this.extractShareUrl(page, searchUrl);

    return {
      query,
      markdown,
      citations,
      shareUrl,
      rawText,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Polls until the AI overview stream has finished updating.
   */
  private async waitForStreamingCompletion(page: Page, maxWaitMs: number): Promise<void> {
    const startTime = Date.now();
    let lastLength = 0;
    let stableCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
      const currentLength = await page.evaluate(() => {
        // Look inside AI overview container
        const el =
          document.querySelector("div[data-attrid='wa:/description'], div[data-sge-overview], div[aria-label*='AI Overview' i]") ||
          document.querySelector("div[role='region'][aria-label*='AI' i]");

        if (el) return el.textContent?.length || 0;

        // Fallback to searching around "AI Overview" text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue?.includes("AI Overview")) {
            return node.parentElement?.parentElement?.textContent?.length || 0;
          }
        }

        return document.body ? document.body.innerText.length : 0;
      });

      if (currentLength > 50 && currentLength === lastLength) {
        stableCount++;
        if (stableCount >= 3) {
          // Stable for 3 checks (1.5 seconds)
          break;
        }
      } else {
        stableCount = 0;
        lastLength = currentLength;
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  /**
   * Extracts citations and external references linked within the AI Overview.
   */
  private async extractCitations(page: Page): Promise<AiModeCitation[]> {
    return await page.evaluate(() => {
      const results: Array<{ title: string; url: string; source?: string; snippet?: string }> = [];
      const seenUrls = new Set<string>();

      // Look in AI Overview citation cards or carousel
      const containers = Array.from(
        document.querySelectorAll(
          "div[data-attrid='wa:/description'], div[data-sge-overview], div[aria-label*='AI Overview' i], div[data-sge-content]"
        )
      );

      const searchRoot = containers.length > 0 ? containers[0] : document.body;
      const links = Array.from(searchRoot.querySelectorAll("a[href]")) as HTMLAnchorElement[];

      for (const link of links) {
        const href = link.href;
        if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;

        // Ignore internal google search navigation links
        try {
          const urlObj = new URL(href);
          if (
            urlObj.hostname.includes("google.com") &&
            (urlObj.pathname.startsWith("/search") ||
              urlObj.pathname.startsWith("/preferences") ||
              urlObj.pathname.startsWith("/intl"))
          ) {
            continue;
          }

          if (seenUrls.has(href)) continue;
          seenUrls.add(href);

          const title =
            link.getAttribute("aria-label")?.trim() ||
            link.querySelector("[role='heading'], div, span")?.textContent?.trim() ||
            link.textContent?.trim() ||
            urlObj.hostname;

          const source =
            link.querySelector(".site-name, cite, [data-domain]")?.textContent?.trim() ||
            urlObj.hostname.replace(/^www\./, "");

          results.push({
            title: title.slice(0, 150),
            url: href,
            source,
          });
        } catch {
          // Skip invalid URLs
        }
      }

      return results;
    });
  }

  /**
   * Converts the AI overview DOM structure into formatted Markdown.
   */
  private async extractMarkdownAndText(
    page: Page,
    query: string
  ): Promise<{ markdown: string; rawText: string }> {
    return await page.evaluate((q: string) => {
      // Find root of AI overview
      const root =
        (document.querySelector("div[data-attrid='wa:/description']") as HTMLElement) ||
        (document.querySelector("div[data-sge-overview]") as HTMLElement) ||
        (document.querySelector("div[aria-label*='AI Overview' i]") as HTMLElement) ||
        (document.querySelector("div[role='region'][aria-label*='AI' i]") as HTMLElement);

      if (!root) {
        // Fallback: extract generic top text
        const bodyText = document.body ? document.body.innerText.slice(0, 3000) : "";
        return {
          markdown: `### 🌐 Search Query: ${q}\n\n${bodyText}`,
          rawText: bodyText,
        };
      }

      const rawText = root.innerText.trim();

      // Convert DOM to structured Markdown
      function domToMarkdown(element: Node): string {
        if (element.nodeType === Node.TEXT_NODE) {
          return element.nodeValue || "";
        }

        if (element.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const el = element as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // Skip hidden or citation chips in text flow
        if (el.getAttribute("aria-hidden") === "true" || el.classList.contains("citation-chip")) {
          return "";
        }

        let inner = "";
        for (const child of Array.from(el.childNodes)) {
          inner += domToMarkdown(child);
        }

        switch (tag) {
          case "h1":
            return `\n\n# ${inner.trim()}\n\n`;
          case "h2":
            return `\n\n## ${inner.trim()}\n\n`;
          case "h3":
            return `\n\n### ${inner.trim()}\n\n`;
          case "h4":
          case "h5":
          case "h6":
            return `\n\n#### ${inner.trim()}\n\n`;
          case "p":
            return `\n\n${inner.trim()}\n\n`;
          case "li":
            return `\n* ${inner.trim()}`;
          case "ul":
          case "ol":
            return `\n${inner}\n`;
          case "strong":
          case "b":
            return ` **${inner.trim()}** `;
          case "em":
          case "i":
            return ` *${inner.trim()}* `;
          case "code":
            return ` \`${inner.trim()}\` `;
          case "pre":
            return `\n\`\`\`\n${inner.trim()}\n\`\`\`\n`;
          case "blockquote":
            return `\n> ${inner.trim()}\n`;
          default:
            return inner;
        }
      }

      const rawMd = domToMarkdown(root)
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const finalMarkdown = `# 🌐 Google AI Mode: ${q}\n\n${rawMd}`;

      return {
        markdown: finalMarkdown,
        rawText,
      };
    }, query);
  }

  /**
   * Generates or extracts a share link for the AI Mode answer.
   */
  private async extractShareUrl(page: Page, fallbackUrl: string): Promise<string> {
    try {
      const shareUrl = await page.evaluate(() => {
        // Check for share button
        const shareBtn = document.querySelector(
          "button[aria-label*='Share' i], [role='button'][aria-label*='Share' i]"
        ) as HTMLElement | null;

        if (shareBtn) {
          shareBtn.click();
        }

        // Check if an input or link with share.google appears
        const shareInput = document.querySelector(
          "input[value*='share.google'], a[href*='share.google']"
        ) as HTMLInputElement | HTMLAnchorElement | null;

        if (shareInput) {
          return "value" in shareInput ? shareInput.value : shareInput.href;
        }

        return null;
      });

      if (shareUrl) return shareUrl;
    } catch {
      // Fallback
    }

    return fallbackUrl;
  }
}

let globalAiModeAdapter: AiModeAdapter | null = null;

export function getAiModeAdapter(driver?: BrowserDriver): AiModeAdapter {
  if (!globalAiModeAdapter || driver) {
    globalAiModeAdapter = new AiModeAdapter(driver);
  }
  return globalAiModeAdapter;
}
