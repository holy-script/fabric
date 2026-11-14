/**
 * High-Level Browser Action Runner for Fabric OS
 * Orchestrates web browsing, Google AI Mode intelligence synthesis,
 * and NotebookLM knowledge ingestion for Agent mesh and Telegram bots.
 */

import path from "path";
import fs from "fs";
import { BrowserDriver, getBrowserDriver } from "./driver.js";
import { NotebookLMAdapter, getNotebookLMAdapter, type AudioOverviewStatus } from "./adapters/notebooklm.js";
import { AiModeAdapter, getAiModeAdapter, type AiModeResult, type AiModeOptions } from "./adapters/aimode.js";
import {
  GeminiDeepResearchAdapter,
  getDeepResearchAdapter,
  type DeepResearchOptions,
  type DeepResearchProgress,
} from "./adapters/deep-research.js";

export interface BrowsePageOptions {
  screenshot?: boolean;
  screenshotPath?: string;
  fullPage?: boolean;
  extractText?: boolean;
  waitForSelector?: string;
  timeout?: number;
}

export interface BrowsePageResult {
  url: string;
  title: string;
  status: number;
  text?: string;
  screenshotPath?: string;
  screenshotBase64?: string;
}

export interface SyncNotebookLMOptions {
  autoGeneratePodcast?: boolean;
}

export interface SyncNotebookLMResult {
  success: boolean;
  notebookId?: string;
  notebookUrl?: string;
  title: string;
  sourceTitle?: string;
  audioStatus?: string;
  error?: string;
}

/**
 * Browses an arbitrary web page, extracts readable text, and captures optional screenshots.
 */
export async function browsePage(
  url: string,
  options: BrowsePageOptions = {}
): Promise<BrowsePageResult> {
  const driver = getBrowserDriver();
  const page = await driver.getPage();

  const response = await driver.goto(url, { timeout: options.timeout || 30000 }, page);
  const status = response ? (await page.evaluate(() => 200)) : 200;
  const title = await page.title();

  if (options.waitForSelector) {
    await driver.waitForSelector(options.waitForSelector, { timeout: 10000 }, page);
  }

  let text: string | undefined;
  if (options.extractText !== false) {
    text = await driver.extractText(undefined, page);
  }

  let screenshotPath: string | undefined;
  let screenshotBase64: string | undefined;

  if (options.screenshot) {
    if (options.screenshotPath) {
      screenshotPath = path.resolve(options.screenshotPath);
      await driver.screenshot({ path: screenshotPath, fullPage: options.fullPage }, page);
    } else {
      const defaultDir = path.resolve(process.cwd(), "data/screenshots");
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }
      const safeName = url.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
      screenshotPath = path.join(defaultDir, `${Date.now()}_${safeName}.png`);
      const base64 = (await driver.screenshot(
        { path: screenshotPath, fullPage: options.fullPage, encoding: "base64" },
        page
      )) as string;
      screenshotBase64 = base64;
    }
  }

  return {
    url: page.url(),
    title,
    status,
    text,
    screenshotPath,
    screenshotBase64,
  };
}

/**
 * Cleanly closes the active global browser driver instance.
 */
export async function closeBrowserDriver(): Promise<void> {
  const driver = getBrowserDriver();
  await driver.close();
}

/**
 * Executes a search query in Google AI Mode, extracts the generative response,
 * structured citations, and share URL.
 */
export async function runAiModeQuery(
  query: string,
  options?: AiModeOptions
): Promise<AiModeResult> {
  const adapter = getAiModeAdapter();
  return await adapter.executeQuery(query, options);
}

/**
 * Orchestrates complete end-to-end sync to Google NotebookLM:
 * 1. Validates Google authentication session
 * 2. Creates a dedicated notebook
 * 3. Uploads local markdown file as study source
 * 4. Triggers Audio Overview (dual-host podcast) if requested
 */
export async function syncNotebookLM(
  title: string,
  markdownPath: string,
  autoGeneratePodcast: boolean = false
): Promise<SyncNotebookLMResult> {
  const resolvedPath = path.resolve(markdownPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: false,
      title,
      error: `Markdown source file does not exist at "${resolvedPath}"`,
    };
  }

  const adapter = getNotebookLMAdapter();

  try {
    // 1. Check Login
    const loginStatus = await adapter.checkLoginStatus();
    if (!loginStatus.isLoggedIn) {
      return {
        success: false,
        title,
        error:
          loginStatus.message ||
          "User not logged in to Google NotebookLM. Please sign in via Google Chrome with your profile.",
      };
    }

    // 2. Create Notebook
    const notebook = await adapter.createNotebook(title);

    // 3. Upload Markdown Source
    const uploadResult = await adapter.uploadMarkdownSource(notebook.url, resolvedPath);

    // 4. Trigger Audio Overview podcast if requested
    let audioStatusText: string = "idle";
    if (autoGeneratePodcast) {
      try {
        const audioTrigger = await adapter.triggerAudioOverview(notebook.url);
        audioStatusText = audioTrigger.status;
      } catch (audioErr: any) {
        audioStatusText = `Trigger failed: ${audioErr.message}`;
      }
    }

    return {
      success: true,
      notebookId: notebook.notebookId,
      notebookUrl: notebook.url,
      title: notebook.title,
      sourceTitle: uploadResult.sourceTitle,
      audioStatus: audioStatusText,
    };
  } catch (err: any) {
    return {
      success: false,
      title,
      error: `NotebookLM sync failed: ${err.message}`,
    };
  }
}

/**
 * Triggers Gemini Deep Research using the local browser context and Google AI Pro session.
 * Generates comprehensive multi-source synthesis, saves markdown report, and optional Google Doc PDF.
 */
export async function runDeepResearch(
  prompt: string,
  options: DeepResearchOptions = {}
): Promise<DeepResearchProgress> {
  const adapter = getDeepResearchAdapter();
  return await adapter.executeDeepResearch(prompt, options);
}

export { getDeepResearchAdapter };
export type { DeepResearchOptions, DeepResearchProgress };

