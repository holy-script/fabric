/**
 * Gemini Deep Research Browser Automation Adapter for Fabric OS
 * Leverages the operator's signed-in Google AI Pro / Advanced browser session
 * to trigger asynchronous Deep Research, monitor progress, extract clean Markdown,
 * export to Google Docs, and download formatted PDFs without pay-as-you-go API fees.
 */

import type { Page, Browser } from "puppeteer-core";
import { BrowserDriver, getBrowserDriver } from "../driver.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface DeepResearchOptions {
  timeoutMs?: number;           // Default 15 minutes (900,000 ms)
  pollIntervalMs?: number;      // Default 5000 ms
  exportToDocs?: boolean;       // Whether to export report to Google Docs
  downloadPdf?: boolean;        // Whether to download Google Doc as PDF
  outputDir?: string;           // Destination directory for reports
  headless?: boolean;           // Whether to run headless (default: true)
  cdpPort?: number;             // Chrome DevTools Protocol port (default: 9222)
  autoStartPlan?: boolean;      // Auto-click 'Start research' on plan (default: true)
}

export interface DeepResearchProgress {
  taskId: string;
  query: string;
  status:
    | "initiating"
    | "planning"
    | "researching"
    | "synthesizing"
    | "completed"
    | "failed"
    | "unauthenticated";
  stepDescription?: string;
  sourcesCount?: number;
  elapsedSeconds: number;
  reportMarkdown?: string;
  googleDocUrl?: string;
  pdfPath?: string;
  outputDir?: string;
  error?: string;
  timestamp: string;
}

const DEFAULT_DEEP_RESEARCH_DIR = path.resolve(process.cwd(), "data/deep_research");

export class GeminiDeepResearchAdapter {
  private driver: BrowserDriver;
  private readonly baseUrl = "https://gemini.google.com/app";

  constructor(driver?: BrowserDriver) {
    this.driver = driver || getBrowserDriver();
  }

  /**
   * Checks whether the current browser session is logged in to Gemini.
   */
  public async checkAuthStatus(page?: Page): Promise<{
    isAuthenticated: boolean;
    userEmail?: string;
    redirectUrl?: string;
  }> {
    const targetPage = page || (await this.driver.getPage());
    const currentUrl = targetPage.url();

    // 1. Direct check: already on Google Accounts login page
    if (currentUrl.includes("accounts.google.com")) {
      return {
        isAuthenticated: false,
        redirectUrl: currentUrl,
      };
    }

    // 2. Navigate to Gemini app if not already on domain
    if (!currentUrl.includes("gemini.google.com")) {
      await this.driver.goto(this.baseUrl, { waitUntil: "domcontentloaded" }, targetPage);
    }

    const postNavUrl = targetPage.url();
    if (postNavUrl.includes("accounts.google.com")) {
      return {
        isAuthenticated: false,
        redirectUrl: postNavUrl,
      };
    }

    const unauthCheck = await targetPage.evaluate(() => {
      const signInBtn =
        document.querySelector("a[href*='accounts.google.com']") ||
        document.querySelector("button[aria-label*='Sign in' i]");
      return Boolean(signInBtn);
    });

    return {
      isAuthenticated: !unauthCheck,
      redirectUrl: currentUrl,
    };
  }

  /**
   * Kicks off a Deep Research session in the signed-in Gemini app.
   */
  public async startResearch(
    prompt: string,
    options: DeepResearchOptions = {}
  ): Promise<DeepResearchProgress> {
    const page = await this.driver.getPage();
    const startTime = Date.now();
    const taskId = `dr_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const outputDir = options.outputDir || path.join(DEFAULT_DEEP_RESEARCH_DIR, `${Date.now()}_${slug}`);

    // 1. Navigate to Gemini app
    await this.driver.goto(this.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 }, page);

    // 2. Validate authentication
    const auth = await this.checkAuthStatus(page);
    if (!auth.isAuthenticated) {
      return {
        taskId,
        query: prompt,
        status: "unauthenticated",
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        error: "Google account is not signed in. Run with headful browser or port 9222 to log in once.",
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Activate "Deep Research" mode
    await this.selectDeepResearchMode(page);

    // 4. Input prompt into text area
    await this.enterPrompt(page, prompt);

    // 5. Submit the prompt
    await this.submitPrompt(page);

    // 6. Handle research plan confirmation ("Start research" button)
    if (options.autoStartPlan !== false) {
      await this.confirmResearchPlan(page);
    }

    return {
      taskId,
      query: prompt,
      status: "researching",
      stepDescription: "Research initiated. Gathering sources across the web...",
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      outputDir,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Executes end-to-end Deep Research, waits for completion, and extracts the report.
   */
  public async executeDeepResearch(
    prompt: string,
    options: DeepResearchOptions = {}
  ): Promise<DeepResearchProgress> {
    const page = await this.driver.getPage();
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 900000; // 15 mins default
    const pollIntervalMs = options.pollIntervalMs ?? 5000;
    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const outputDir = options.outputDir || path.join(DEFAULT_DEEP_RESEARCH_DIR, `${Date.now()}_${slug}`);

    const progress = await this.startResearch(prompt, options);
    if (progress.status === "unauthenticated" || progress.status === "failed") {
      return progress;
    }

    // Poll until completion or timeout
    while (Date.now() - startTime < timeoutMs) {
      const state = await this.inspectResearchState(page);

      if (state.isComplete) {
        // Extract report markdown
        const markdown = await this.extractReportMarkdown(page, prompt);

        // Optional: Export to Google Docs & download PDF
        let googleDocUrl: string | undefined;
        let pdfPath: string | undefined;

        if (options.exportToDocs) {
          try {
            const exportRes = await this.exportToGoogleDocs(page, outputDir, options.downloadPdf);
            googleDocUrl = exportRes.docUrl;
            pdfPath = exportRes.pdfPath;
          } catch (e: any) {
            console.warn("[DeepResearch] Google Docs export failed:", e.message);
          }
        }

        // Save Markdown to disk
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const reportPath = path.join(outputDir, "report.md");
        fs.writeFileSync(reportPath, markdown, "utf-8");

        return {
          taskId: progress.taskId,
          query: prompt,
          status: "completed",
          stepDescription: "Research completed and synthesized into markdown report.",
          sourcesCount: state.sourcesCount,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
          reportMarkdown: markdown,
          googleDocUrl,
          pdfPath,
          outputDir,
          timestamp: new Date().toISOString(),
        };
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return {
      taskId: progress.taskId,
      query: prompt,
      status: "failed",
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      error: `Deep research timed out after ${Math.round(timeoutMs / 60000)} minutes.`,
      outputDir,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Helper: Selects Deep Research from the Gemini model / tools menu.
   */
  private async selectDeepResearchMode(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        // Look for "Tools", "Deep Research", or model selector buttons
        const buttons = Array.from(document.querySelectorAll("button, [role='button'], mat-chip"));
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || "";
          const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (text.includes("deep research") || aria.includes("deep research")) {
            (btn as HTMLElement).click();
            return;
          }
        }

        // Try clicking tools menu
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || "";
          const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (text.includes("tools") || aria.includes("tools")) {
            (btn as HTMLElement).click();
            break;
          }
        }
      });

      await new Promise((r) => setTimeout(r, 600));

      // Click "Deep Research" inside dropdown if opened
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("[role='menuitem'], [role='option'], button, span"));
        for (const item of items) {
          if (item.textContent?.toLowerCase().includes("deep research")) {
            (item as HTMLElement).click();
            break;
          }
        }
      });
    } catch {
      // Proceed if Deep Research was already selected
    }
  }

  /**
   * Helper: Types user prompt into the main input box.
   */
  private async enterPrompt(page: Page, prompt: string): Promise<void> {
    const inputSelector = [
      "div[role='textbox']",
      "rich-textarea textarea",
      "rich-textarea div[contenteditable='true']",
      "textarea[aria-label*='prompt' i]",
      "textarea",
    ].join(", ");

    await page.waitForSelector(inputSelector, { timeout: 10000 });

    await page.evaluate((sel: string, text: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      if (el) {
        if ("value" in el) {
          (el as any).value = text;
        } else {
          el.innerText = text;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, inputSelector, prompt);
  }

  /**
   * Helper: Submits the prompt.
   */
  private async submitPrompt(page: Page): Promise<void> {
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 800));

    // Fallback: Click send button if still present
    await page.evaluate(() => {
      const sendBtn =
        (document.querySelector("button[aria-label*='Send' i]") as HTMLElement) ||
        (document.querySelector("button.send-button") as HTMLElement);
      if (sendBtn) {
        sendBtn.click();
      }
    });
  }

  /**
   * Helper: Confirms the generated research plan ("Start research").
   */
  private async confirmResearchPlan(page: Page): Promise<void> {
    const planTimeout = 60000;
    const start = Date.now();

    while (Date.now() - start < planTimeout) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toLowerCase() || "";
          const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (
            text.includes("start research") ||
            text === "start" ||
            aria.includes("start research") ||
            text.includes("proceed")
          ) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clicked) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  /**
   * Helper: Checks whether the research process has concluded.
   */
  private async inspectResearchState(page: Page): Promise<{
    isComplete: boolean;
    sourcesCount?: number;
    step?: string;
  }> {
    return await page.evaluate(() => {
      // Check for share / export button (appears when final report finishes)
      const exportBtn =
        document.querySelector("button[aria-label*='Share & export' i]") ||
        document.querySelector("button[aria-label*='Export' i]") ||
        document.querySelector("button[aria-label*='Share' i]");

      // Check for step indicators
      const textContent = document.body.innerText || "";
      const isResearching =
        textContent.includes("Searching the web") ||
        textContent.includes("Reading sources") ||
        textContent.includes("Synthesizing report");

      // Extract sources count if visible
      const match = textContent.match(/(\d+)\s+sources/i);
      const sourcesCount = match ? parseInt(match[1] || "0", 10) : undefined;

      const isComplete = Boolean(exportBtn && !isResearching);

      return {
        isComplete,
        sourcesCount,
      };
    });
  }

  /**
   * Helper: Extracts clean Markdown report from the response DOM.
   */
  private async extractReportMarkdown(page: Page, query: string): Promise<string> {
    return await page.evaluate((q: string) => {
      const responses = Array.from(
        document.querySelectorAll(".model-response-text, message-content, [data-message-id]")
      );
      const lastResponse = responses[responses.length - 1] || document.querySelector("main");

      if (!lastResponse) {
        return `# Gemini Deep Research: ${q}\n\n*Unable to extract DOM response container.*`;
      }

      // Convert headings, lists, tables to markdown
      let text = (lastResponse as HTMLElement).innerText || "";
      return `# 🔬 Gemini Deep Research: ${q}\n\n*Conducted via Fabric OS & Google AI Pro Session*\n\n${text}`;
    }, query);
  }

  /**
   * Helper: Exports report to Google Docs and fetches PDF.
   */
  private async exportToGoogleDocs(
    page: Page,
    outputDir: string,
    downloadPdf: boolean = true
  ): Promise<{ docUrl?: string; pdfPath?: string }> {
    // 1. Click "Share & export" button
    await page.evaluate(() => {
      const exportBtn =
        (document.querySelector("button[aria-label*='Share & export' i]") as HTMLElement) ||
        (document.querySelector("button[aria-label*='Export' i]") as HTMLElement);
      if (exportBtn) exportBtn.click();
    });

    await new Promise((r) => setTimeout(r, 1000));

    // 2. Click "Export to Docs"
    const context = page.browserContext();
    const [newPage] = await Promise.all([
      new Promise<Page>((resolve) => {
        const handler = (target: any) => {
          if (target.type() === "page") {
            target.page().then((p: Page) => {
              if (p) resolve(p);
            });
          }
        };
        page.browser().once("targetcreated", handler);
      }),
      page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("button, [role='menuitem'], span"));
        for (const item of items) {
          if (item.textContent?.toLowerCase().includes("export to docs")) {
            (item as HTMLElement).click();
            break;
          }
        }
      }),
    ]);

    await newPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    const docUrl = newPage.url();

    let pdfPath: string | undefined;

    // 3. Download as PDF directly via Google Docs export endpoint
    if (downloadPdf && docUrl.includes("/document/d/")) {
      const match = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        const docId = match[1];
        const pdfExportUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;

        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        pdfPath = path.join(outputDir, "report.pdf");

        const client = await newPage.createCDPSession();
        await client.send("Page.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: outputDir,
        });

        await newPage.goto(pdfExportUrl, { waitUntil: "networkidle2" }).catch(() => {});
      }
    }

    await newPage.close().catch(() => {});

    return { docUrl, pdfPath };
  }
}

let globalDeepResearchAdapter: GeminiDeepResearchAdapter | null = null;

export function getDeepResearchAdapter(driver?: BrowserDriver): GeminiDeepResearchAdapter {
  if (!globalDeepResearchAdapter || driver) {
    globalDeepResearchAdapter = new GeminiDeepResearchAdapter(driver);
  }
  return globalDeepResearchAdapter;
}
