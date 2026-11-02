/**
 * NotebookLM Service Adapter for Fabric OS
 * Automates interactions with Google NotebookLM (https://notebooklm.google.com).
 * Supports session validation, notebook creation, markdown source ingestion,
 * and Audio Overview (dual-host podcast) generation tracking.
 */

import type { Page } from "puppeteer-core";
import { BrowserDriver, getBrowserDriver } from "../driver.js";
import fs from "fs";
import path from "path";

export interface NotebookLMLoginStatus {
  isLoggedIn: boolean;
  userEmail?: string;
  redirectUrl?: string;
  message?: string;
}

export interface NotebookInfo {
  notebookId: string;
  url: string;
  title: string;
}

export interface SourceUploadResult {
  success: boolean;
  notebookUrl: string;
  sourceTitle: string;
  filePath: string;
  bytesUploaded: number;
  message?: string;
}

export interface AudioTriggerResult {
  status: "generating" | "already_generating" | "ready";
  message: string;
}

export interface AudioOverviewStatus {
  status: "idle" | "generating" | "ready" | "error";
  audioUrl?: string;
  canDownload: boolean;
  message?: string;
}

export class NotebookLMAdapter {
  private driver: BrowserDriver;
  private readonly baseUrl = "https://notebooklm.google.com";

  constructor(driver?: BrowserDriver) {
    this.driver = driver || getBrowserDriver();
  }

  /**
   * Helper to ensure target notebook URL is loaded.
   */
  private async navigateToNotebook(page: Page, notebookUrlOrTitle: string): Promise<string> {
    if (notebookUrlOrTitle.startsWith("http")) {
      if (page.url() !== notebookUrlOrTitle) {
        await page.goto(notebookUrlOrTitle, { waitUntil: "domcontentloaded" });
      }
      return notebookUrlOrTitle;
    }

    // If it's a title or ID, navigate to base then look for it
    if (notebookUrlOrTitle.match(/^[a-zA-Z0-9_-]{20,}$/)) {
      const url = `${this.baseUrl}/notebook/${notebookUrlOrTitle}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return url;
    }

    await page.goto(this.baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

    // Try finding notebook card with title
    const foundUrl = await page.evaluate((title: string) => {
      const links = Array.from(document.querySelectorAll("a[href*='/notebook/']"));
      for (const link of links) {
        if (link.textContent?.toLowerCase().includes(title.toLowerCase())) {
          return (link as HTMLAnchorElement).href;
        }
      }
      return null;
    }, notebookUrlOrTitle);

    if (foundUrl) {
      await page.goto(foundUrl, { waitUntil: "domcontentloaded" });
      return foundUrl;
    }

    throw new Error(`Notebook with title or ID "${notebookUrlOrTitle}" not found on NotebookLM dashboard.`);
  }

  /**
   * Checks whether the user is authenticated to Google on NotebookLM.
   */
  public async checkLoginStatus(): Promise<NotebookLMLoginStatus> {
    const page = await this.driver.getPage();
    await this.driver.goto(this.baseUrl, { waitUntil: "domcontentloaded" }, page);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});

    const currentUrl = page.url();

    // Check for redirection to Google Accounts
    if (
      currentUrl.includes("accounts.google.com") ||
      currentUrl.includes("signin") ||
      currentUrl.includes("ServiceLogin")
    ) {
      return {
        isLoggedIn: false,
        redirectUrl: currentUrl,
        message: "User redirected to Google Sign-In. Authentication required.",
      };
    }

    // Inspect DOM for sign-in or authenticated UI
    const status = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : "";

      // Check for sign in indicators
      const hasSignInButton =
        !!document.querySelector("a[href*='accounts.google.com'], button[aria-label*='Sign in' i]") ||
        bodyText.includes("Sign in with Google") ||
        bodyText.includes("Sign in to NotebookLM");

      // Check for authenticated UI markers
      const hasCreateButton =
        !!document.querySelector("button[aria-label*='New notebook' i], button[aria-label*='Create' i]") ||
        bodyText.includes("New notebook") ||
        bodyText.includes("Create notebook");

      const avatarEl = document.querySelector(
        "img[alt*='Google Account' i], [aria-label*='Google Account' i], a[aria-label*='Google Account' i]"
      );
      const userEmail = avatarEl?.getAttribute("aria-label") || undefined;

      return {
        hasSignInButton,
        hasCreateButton,
        userEmail,
        hasNotebooks: !!document.querySelector("a[href*='/notebook/']"),
      };
    });

    if (status.hasSignInButton && !status.hasCreateButton) {
      return {
        isLoggedIn: false,
        redirectUrl: currentUrl,
        message: "Sign-in button detected. Please log in to Google Chrome first.",
      };
    }

    if (status.hasCreateButton || status.hasNotebooks || currentUrl.includes("notebooklm.google.com")) {
      return {
        isLoggedIn: true,
        userEmail: status.userEmail,
        message: "Authenticated successfully to NotebookLM.",
      };
    }

    return {
      isLoggedIn: false,
      redirectUrl: currentUrl,
      message: "Unable to confirm NotebookLM authentication status.",
    };
  }

  /**
   * Creates a new notebook on NotebookLM and renames it to `title`.
   */
  public async createNotebook(title: string): Promise<NotebookInfo> {
    const page = await this.driver.getPage();
    await this.driver.goto(this.baseUrl, { waitUntil: "domcontentloaded" }, page);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

    // Click "New notebook" or "Create notebook" button
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || "";
        const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
        if (
          text.includes("new notebook") ||
          text.includes("create notebook") ||
          aria.includes("new notebook") ||
          aria.includes("create notebook")
        ) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      // Fallback selector
      const button = await page.$("button[aria-label*='New notebook' i], button[aria-label*='Create' i]");
      if (button) {
        await button.click();
      } else {
        throw new Error("Could not find 'New notebook' button on NotebookLM dashboard. Verify login state.");
      }
    }

    // Wait for redirect to /notebook/<notebook_id>
    await page.waitForFunction(
      () => window.location.href.includes("/notebook/"),
      { timeout: 15000 }
    );

    const newUrl = page.url();
    const match = newUrl.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
    const notebookId = match ? match[1] : "unknown";

    // Wait for title input/element to appear and rename
    try {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});

      // Look for title element (often input, textarea, or contenteditable)
      const renamed = await page.evaluate((newTitle: string) => {
        // Try finding title input or textarea
        const titleInput = document.querySelector(
          "input.title-input, textarea.title-textarea, input[aria-label*='title' i], textarea[aria-label*='title' i]"
        ) as HTMLInputElement | HTMLTextAreaElement | null;

        if (titleInput) {
          titleInput.value = newTitle;
          titleInput.dispatchEvent(new Event("input", { bubbles: true }));
          titleInput.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }

        // Try editable header
        const headers = Array.from(document.querySelectorAll("h1, h2, [contenteditable='true']"));
        for (const h of headers) {
          if (h.textContent?.includes("Untitled notebook") || h.getAttribute("contenteditable") === "true") {
            h.textContent = newTitle;
            h.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          }
        }

        return false;
      }, title);

      if (!renamed) {
        // Click on title text if plain text element
        const untitledEl = await page.$("xpath///span[contains(., 'Untitled notebook')] | //div[contains(., 'Untitled notebook')]");
        if (untitledEl) {
          await untitledEl.click();
          await page.keyboard.down("Meta");
          await page.keyboard.press("KeyA");
          await page.keyboard.up("Meta");
          await page.keyboard.type(title);
          await page.keyboard.press("Enter");
        }
      }
    } catch {
      // Non-critical if renaming fails; notebook is still created
    }

    return {
      notebookId,
      url: newUrl,
      title,
    };
  }

  /**
   * Uploads or pastes a local Markdown source bundle into the specified notebook.
   */
  public async uploadMarkdownSource(
    notebookUrlOrTitle: string,
    filePath: string
  ): Promise<SourceUploadResult> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Source Markdown file does not exist at "${resolvedPath}"`);
    }

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const sourceTitle = path.basename(resolvedPath, path.extname(resolvedPath));

    const page = await this.driver.getPage();
    const notebookUrl = await this.navigateToNotebook(page, notebookUrlOrTitle);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

    // 1. Check if "Add sources" modal is open, or click "Add source" button
    const modalOpen = await page.evaluate(() => {
      return !!document.querySelector("div[role='dialog'], mat-dialog-container");
    });

    if (!modalOpen) {
      const addClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toLowerCase() || "";
          const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
          if (text.includes("add source") || aria.includes("add source") || text.includes("sources")) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!addClicked) {
        const btn = await page.$("button[aria-label*='Add source' i]");
        if (btn) await btn.click();
      }

      await page.waitForSelector("div[role='dialog'], mat-dialog-container", { timeout: 5000 }).catch(() => {});
    }

    // 2. Click "Copied text" or "Paste text" option in the source dialog
    const pasteOptionClicked = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("button, [role='button'], div.source-type-card"));
      for (const card of cards) {
        const text = card.textContent?.toLowerCase() || "";
        const aria = card.getAttribute("aria-label")?.toLowerCase() || "";
        if (
          text.includes("copied text") ||
          text.includes("paste text") ||
          aria.includes("copied text") ||
          aria.includes("paste text")
        ) {
          (card as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!pasteOptionClicked) {
      // Fallback: Check if file input is available for direct upload
      const fileInput = await page.$("input[type='file']");
      if (fileInput) {
        await fileInput.uploadFile(resolvedPath);
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
        return {
          success: true,
          notebookUrl,
          sourceTitle,
          filePath: resolvedPath,
          bytesUploaded: Buffer.byteLength(content, "utf-8"),
          message: "Uploaded markdown source via file input.",
        };
      }
    }

    // Wait for text paste input / textarea
    await page.waitForSelector("textarea, [contenteditable='true']", { timeout: 6000 }).catch(() => {});

    // 3. Fill in title and paste markdown content
    await page.evaluate((title: string, markdown: string) => {
      // Look for title input in dialog
      const inputs = Array.from(document.querySelectorAll("div[role='dialog'] input, mat-dialog-container input"));
      const titleInput = inputs.find((i) => (i as HTMLInputElement).type === "text") as HTMLInputElement | undefined;
      if (titleInput) {
        titleInput.value = title;
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Look for content textarea or contenteditable
      const textarea = document.querySelector(
        "div[role='dialog'] textarea, mat-dialog-container textarea, div[role='dialog'] [contenteditable='true']"
      ) as HTMLTextAreaElement | HTMLElement | null;

      if (textarea) {
        if ("value" in textarea) {
          (textarea as HTMLTextAreaElement).value = markdown;
        } else {
          textarea.textContent = markdown;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, sourceTitle, content);

    // 4. Click Insert / Save / Done button
    const saved = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll("div[role='dialog'] button, mat-dialog-container button")
      );
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || "";
        if (text.includes("insert") || text.includes("save") || text.includes("done") || text.includes("add")) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!saved) {
      const insertBtn = await page.$("button[aria-label*='Insert' i], button:has-text('Insert')");
      if (insertBtn) await insertBtn.click();
    }

    // Wait for source processing
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 6000 }).catch(() => {});

    return {
      success: true,
      notebookUrl,
      sourceTitle,
      filePath: resolvedPath,
      bytesUploaded: Buffer.byteLength(content, "utf-8"),
      message: `Markdown source "${sourceTitle}" inserted successfully.`,
    };
  }

  /**
   * Triggers generation of the dual-host Deep Dive Audio Overview.
   */
  public async triggerAudioOverview(notebookUrlOrTitle: string): Promise<AudioTriggerResult> {
    const page = await this.driver.getPage();
    await this.navigateToNotebook(page, notebookUrlOrTitle);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

    // Look for "Generate" button in the Audio Overview / Studio panel
    const triggered = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || "";
        const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
        const parentText = btn.parentElement?.textContent?.toLowerCase() || "";

        if (
          text === "generate" ||
          aria.includes("generate audio") ||
          (text.includes("generate") && (parentText.includes("audio overview") || parentText.includes("deep dive")))
        ) {
          (btn as HTMLElement).click();
          return "triggered";
        }

        if (parentText.includes("generating") || text.includes("generating")) {
          return "already_generating";
        }
      }
      return "not_found";
    });

    if (triggered === "triggered") {
      return {
        status: "generating",
        message: "Audio Overview generation triggered successfully.",
      };
    }

    if (triggered === "already_generating") {
      return {
        status: "already_generating",
        message: "Audio Overview is already in progress.",
      };
    }

    // Check if player is already ready
    const status = await this.getAudioOverviewStatus(notebookUrlOrTitle);
    if (status.status === "ready") {
      return {
        status: "ready",
        message: "Audio Overview is already generated and ready for playback.",
      };
    }

    throw new Error("Could not find Audio Overview 'Generate' button. Verify that at least one source is uploaded.");
  }

  /**
   * Retrieves the current Audio Overview state: idle, generating, ready, or error.
   */
  public async getAudioOverviewStatus(notebookUrlOrTitle: string): Promise<AudioOverviewStatus> {
    const page = await this.driver.getPage();
    await this.navigateToNotebook(page, notebookUrlOrTitle);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});

    const result = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : "";

      // 1. Check for audio player or play button
      const playBtn = document.querySelector(
        "button[aria-label*='Play' i], button[aria-label*='Play audio' i], .audio-player"
      );
      const audioEl = document.querySelector("audio");
      const hasDownloadBtn = !!document.querySelector(
        "button[aria-label*='Download' i], a[download], a[href*='.mp3']"
      );

      if (playBtn || audioEl || body.includes("Deep Dive") && body.includes("0:00 /")) {
        const audioSrc = audioEl?.src || undefined;
        return {
          status: "ready" as const,
          audioUrl: audioSrc,
          canDownload: hasDownloadBtn || !!audioSrc,
          message: "Audio Overview ready.",
        };
      }

      // 2. Check for generation in progress
      const isGenerating =
        body.includes("Generating Audio Overview") ||
        body.includes("Generating...") ||
        !!document.querySelector("[role='progressbar'], .mat-mdc-progress-bar, [aria-label*='Generating' i]");

      if (isGenerating) {
        return {
          status: "generating" as const,
          canDownload: false,
          message: "Audio Overview is actively generating (typically takes 2-5 minutes).",
        };
      }

      // 3. Check for errors
      if (body.includes("Couldn't generate audio") || body.includes("Error generating audio")) {
        return {
          status: "error" as const,
          canDownload: false,
          message: "Failed to generate Audio Overview.",
        };
      }

      // 4. Check for idle "Generate" button
      const hasGenerateBtn = Array.from(document.querySelectorAll("button")).some((b) =>
        b.textContent?.toLowerCase().includes("generate")
      );

      if (hasGenerateBtn) {
        return {
          status: "idle" as const,
          canDownload: false,
          message: "Audio Overview not yet generated. Ready to click Generate.",
        };
      }

      return {
        status: "idle" as const,
        canDownload: false,
        message: "Audio Overview panel idle.",
      };
    });

    return result;
  }
}

let globalNotebookLMAdapter: NotebookLMAdapter | null = null;

export function getNotebookLMAdapter(driver?: BrowserDriver): NotebookLMAdapter {
  if (!globalNotebookLMAdapter || driver) {
    globalNotebookLMAdapter = new NotebookLMAdapter(driver);
  }
  return globalNotebookLMAdapter;
}
