/**
 * Browser Automation Driver for Fabric OS
 * Lifecycle manager for Google Chrome via puppeteer-core.
 * Connects to existing remote debugging port (9222) or launches a dedicated instance
 * with persistent session profile in ~/.fabric/browser_profile.
 */

import puppeteer, {
  type Browser,
  type Page,
  type PuppeteerLifeCycleEvent,
  type ScreenshotOptions as PuppeteerScreenshotOptions,
} from "puppeteer-core";
import path from "path";
import os from "os";
import fs from "fs";

export interface BrowserDriverConfig {
  executablePath?: string;
  userDataDir?: string;
  debuggingPort?: number;
  headless?: boolean | "shell";
  defaultTimeout?: number;
  viewport?: { width: number; height: number };
  extraArgs?: string[];
}

export interface NavigationOptions {
  timeout?: number;
  waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[];
}

export interface ScreenshotOptions {
  path?: string;
  fullPage?: boolean;
  encoding?: "binary" | "base64";
  type?: "png" | "jpeg" | "webp";
  quality?: number;
}

export function resolvePath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

function getDefaultChromePath(): string {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  // Platform specific default fallbacks
  const macPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (process.platform === "darwin" && fs.existsSync(macPath)) {
    return macPath;
  }

  const linuxPaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  for (const lp of linuxPaths) {
    if (fs.existsSync(lp)) return lp;
  }

  const winPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (process.platform === "win32" && fs.existsSync(winPath)) {
    return winPath;
  }

  return macPath; // default
}

export class BrowserDriver {
  private browser: Browser | null = null;
  private activePage: Page | null = null;
  private isExternal: boolean = false;
  private config: Required<BrowserDriverConfig>;

  constructor(options: BrowserDriverConfig = {}) {
    const defaultHeadless =
      process.env.FABRIC_BROWSER_HEADLESS !== undefined
        ? process.env.FABRIC_BROWSER_HEADLESS !== "false"
        : true;

    this.config = {
      executablePath: options.executablePath || getDefaultChromePath(),
      userDataDir: resolvePath(
        options.userDataDir ||
          process.env.FABRIC_BROWSER_PROFILE_DIR ||
          "~/.fabric/browser_profile"
      ),
      debuggingPort:
        options.debuggingPort ||
        Number(process.env.CHROME_DEBUGGING_PORT) ||
        9222,
      headless: options.headless !== undefined ? options.headless : defaultHeadless,
      defaultTimeout: options.defaultTimeout || 30000,
      viewport: options.viewport || { width: 1280, height: 800 },
      extraArgs: options.extraArgs || [],
    };
  }

  public getConfig(): Readonly<Required<BrowserDriverConfig>> {
    return { ...this.config };
  }

  /**
   * Connects to an existing Chrome remote debugging instance if running on port,
   * otherwise launches a new Chrome instance with persistent session data.
   */
  public async connectOrLaunch(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    const { debuggingPort, userDataDir, executablePath, headless, viewport, extraArgs } =
      this.config;

    // 1. Try connecting to existing remote debugging endpoint
    try {
      const versionUrl = `http://127.0.0.1:${debuggingPort}/json/version`;
      const res = await fetch(versionUrl, { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        this.browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${debuggingPort}`,
          defaultViewport: viewport,
        });
        this.isExternal = true;
        return this.browser;
      }
    } catch {
      // Remote port not open, will launch instance
    }

    // 2. Launch instance with persistent user data dir
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const launchArgs = [
      `--remote-debugging-port=${debuggingPort}`,
      `--window-size=${viewport.width},${viewport.height}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-dev-shm-usage",
      ...extraArgs,
    ];

    try {
      this.browser = await puppeteer.launch({
        executablePath,
        headless,
        userDataDir,
        args: launchArgs,
        defaultViewport: viewport,
      });
      this.isExternal = false;
      return this.browser;
    } catch (err: any) {
      throw new Error(
        `Failed to launch Chrome at "${executablePath}". Check path or permissions. Error: ${err.message}`
      );
    }
  }

  /**
   * Returns current active page or creates a new one.
   */
  public async getPage(): Promise<Page> {
    const browser = await this.connectOrLaunch();

    if (this.activePage && !this.activePage.isClosed()) {
      return this.activePage;
    }

    const pages = await browser.pages();
    if (pages.length > 0 && pages[0] && !pages[0].isClosed()) {
      this.activePage = pages[0];
    } else {
      this.activePage = await browser.newPage();
    }

    this.activePage.setDefaultTimeout(this.config.defaultTimeout);
    return this.activePage;
  }

  /**
   * Opens a new isolated tab.
   */
  public async newPage(): Promise<Page> {
    const browser = await this.connectOrLaunch();
    const page = await browser.newPage();
    page.setDefaultTimeout(this.config.defaultTimeout);
    this.activePage = page;
    return page;
  }

  /**
   * Safely navigates to URL with timeout and lifecycle event handling.
   */
  public async goto(
    url: string,
    options?: NavigationOptions,
    page?: Page
  ): Promise<Page> {
    const targetPage = page || (await this.getPage());
    const waitUntil = options?.waitUntil || "domcontentloaded";
    const timeout = options?.timeout ?? this.config.defaultTimeout;

    try {
      await targetPage.goto(url, {
        waitUntil,
        timeout,
      });
      return targetPage;
    } catch (err: any) {
      throw new Error(`Browser navigation to "${url}" failed: ${err.message}`);
    }
  }

  /**
   * Safely waits for selector with configurable timeout.
   */
  public async waitForSelector(
    selector: string,
    options?: { timeout?: number; visible?: boolean },
    page?: Page
  ): Promise<boolean> {
    const targetPage = page || (await this.getPage());
    const timeout = options?.timeout ?? 10000;
    const visible = options?.visible ?? false;

    try {
      await targetPage.waitForSelector(selector, { timeout, visible });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Captures screenshot to buffer, file, or base64.
   */
  public async screenshot(
    options: ScreenshotOptions = {},
    page?: Page
  ): Promise<Buffer | string> {
    const targetPage = page || (await this.getPage());

    const puppeteerOpts: PuppeteerScreenshotOptions = {
      fullPage: options.fullPage ?? false,
      type: options.type || "png",
      ...(options.type === "jpeg" || options.type === "webp"
        ? { quality: options.quality ?? 80 }
        : {}),
      ...(options.path ? { path: options.path } : {}),
      ...(options.encoding === "base64" ? { encoding: "base64" } : {}),
    };

    if (options.path) {
      const dir = path.dirname(options.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const result = await targetPage.screenshot(puppeteerOpts);
    return result as Buffer | string;
  }

  /**
   * Extracts clean inner text from selector or entire document body.
   */
  public async extractText(selector?: string, page?: Page): Promise<string> {
    const targetPage = page || (await this.getPage());

    return await targetPage.evaluate((sel?: string) => {
      if (sel) {
        const el = document.querySelector(sel);
        return el ? (el as HTMLElement).innerText?.trim() || "" : "";
      }
      return document.body ? document.body.innerText?.trim() || "" : "";
    }, selector);
  }

  /**
   * Extracts HTML from selector or root.
   */
  public async extractHtml(selector?: string, page?: Page): Promise<string> {
    const targetPage = page || (await this.getPage());

    return await targetPage.evaluate((sel?: string) => {
      if (sel) {
        const el = document.querySelector(sel);
        return el ? el.outerHTML : "";
      }
      return document.documentElement ? document.documentElement.outerHTML : "";
    }, selector);
  }

  /**
   * Evaluates a function in page context.
   */
  public async evaluate<T>(
    fn: (...args: any[]) => T | Promise<T>,
    ...args: any[]
  ): Promise<T> {
    const page = await this.getPage();
    return await page.evaluate(fn, ...args);
  }

  /**
   * Returns current connection state.
   */
  public isConnected(): boolean {
    return this.browser !== null && this.browser.connected;
  }

  /**
   * Returns whether driver is connected to external debugging port.
   */
  public isExternalSession(): boolean {
    return this.isExternal;
  }

  /**
   * Graceful shutdown.
   * Disconnects if attached to an external Chrome instance, or closes if launched.
   */
  public async close(): Promise<void> {
    if (!this.browser) return;

    try {
      if (this.isExternal) {
        await this.browser.disconnect();
      } else {
        await this.browser.close();
      }
    } catch (err: any) {
      console.warn(`[BrowserDriver] Error closing browser: ${err.message}`);
    } finally {
      this.browser = null;
      this.activePage = null;
      this.isExternal = false;
    }
  }
}

// Global driver instance
let globalDriver: BrowserDriver | null = null;

export function getBrowserDriver(config?: BrowserDriverConfig): BrowserDriver {
  if (!globalDriver || config) {
    globalDriver = new BrowserDriver(config);
  }
  return globalDriver;
}

export async function resetBrowserDriver(): Promise<void> {
  if (globalDriver) {
    await globalDriver.close();
    globalDriver = null;
  }
}
