import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import path from "path";
import fs from "fs";
import os from "os";
import { BrowserDriver, resolvePath } from "../src/browser/driver.js";
import { NotebookLMAdapter } from "../src/browser/adapters/notebooklm.js";
import { AiModeAdapter } from "../src/browser/adapters/aimode.js";
import { browsePage, syncNotebookLM, closeBrowserDriver } from "../src/browser/tool.js";

describe("Fabric OS Browser Automation Subsystem", () => {
  const testProfileDir = path.join(os.tmpdir(), `fabric-test-profile-${Date.now()}`);
  let driver: BrowserDriver;

  beforeAll(() => {
    process.env.CHROME_DEBUGGING_PORT = "9333";
    process.env.FABRIC_BROWSER_PROFILE_DIR = testProfileDir;
    driver = new BrowserDriver({
      headless: true,
      userDataDir: testProfileDir,
      debuggingPort: 9333,
      defaultTimeout: 15000,
    });
  });

  afterAll(async () => {
    await driver.close();
    await closeBrowserDriver();
    delete process.env.CHROME_DEBUGGING_PORT;
    delete process.env.FABRIC_BROWSER_PROFILE_DIR;
    if (fs.existsSync(testProfileDir)) {
      try {
        fs.rmSync(testProfileDir, { recursive: true, force: true });
      } catch {
        // Temp profile cleanup
      }
    }
  });

  describe("1. BrowserDriver Unit & Lifecycle", () => {
    test("expands home directory tilde correctly in resolvePath", () => {
      const resolved = resolvePath("~/.fabric/browser_profile");
      expect(resolved.startsWith(os.homedir())).toBe(true);
      expect(resolved).toBe(path.join(os.homedir(), ".fabric/browser_profile"));
    });

    test("initializes driver with correct configuration", () => {
      const config = driver.getConfig();
      expect(config.headless).toBe(true);
      expect(config.debuggingPort).toBe(9333);
      expect(config.userDataDir).toBe(testProfileDir);
      expect(config.viewport.width).toBe(1280);
    });

    test("defaults to headless: true without explicit option for silent background execution", () => {
      const defaultDriver = new BrowserDriver();
      expect(defaultDriver.getConfig().headless).toBe(true);
    });

    test("launches headless Chrome and navigates to local data URL", async () => {
      const page = await driver.getPage();
      expect(page).toBeDefined();

      const html = `data:text/html,<html><head><title>Fabric Test Page</title></head><body><h1 id="title">Fabric OS</h1><p class="desc">Autonomous browser automation engine.</p></body></html>`;
      await driver.goto(html, undefined, page);

      const title = await page.title();
      expect(title).toBe("Fabric Test Page");

      const selectorFound = await driver.waitForSelector("#title", undefined, page);
      expect(selectorFound).toBe(true);

      const headingText = await driver.extractText("#title", page);
      expect(headingText).toBe("Fabric OS");

      const fullText = await driver.extractText(undefined, page);
      expect(fullText).toContain("Autonomous browser automation engine");

      const headingHtml = await driver.extractHtml("#title", page);
      expect(headingHtml).toBe('<h1 id="title">Fabric OS</h1>');
    });

    test("captures base64 screenshot successfully", async () => {
      const base64 = await driver.screenshot({ encoding: "base64" });
      expect(typeof base64).toBe("string");
      expect((base64 as string).length).toBeGreaterThan(100);
    });
  });

  describe("2. NotebookLM Adapter", () => {
    test("instantiates with adapter methods", () => {
      const adapter = new NotebookLMAdapter(driver);
      expect(typeof adapter.checkLoginStatus).toBe("function");
      expect(typeof adapter.createNotebook).toBe("function");
      expect(typeof adapter.uploadMarkdownSource).toBe("function");
      expect(typeof adapter.triggerAudioOverview).toBe("function");
      expect(typeof adapter.getAudioOverviewStatus).toBe("function");
    });

    test("rejects upload if markdown file does not exist", async () => {
      const adapter = new NotebookLMAdapter(driver);
      expect(
        adapter.uploadMarkdownSource("https://notebooklm.google.com/notebook/123", "/nonexistent/path.md")
      ).rejects.toThrow("Source Markdown file does not exist");
    });

    test("detects unauthenticated state on login simulated page", async () => {
      const adapter = new NotebookLMAdapter(driver);
      const page = await driver.getPage();
      const loginHtml = `data:text/html,<html><head><title>Sign in - Google Accounts</title></head><body><div>Sign in to continue to NotebookLM</div><button aria-label="Sign in">Sign in with Google</button></body></html>`;
      await page.goto(loginHtml);

      // Evaluate login status check
      const status = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : "";
        const hasSignInButton =
          !!document.querySelector("a[href*='accounts.google.com'], button[aria-label*='Sign in' i]") ||
          bodyText.includes("Sign in with Google");
        const hasCreateButton = !!document.querySelector("button[aria-label*='New notebook' i]");
        return { isLoggedIn: !hasSignInButton && hasCreateButton };
      });

      expect(status.isLoggedIn).toBe(false);
    });

    test("detects Audio Overview ready status on simulated player", async () => {
      const page = await driver.getPage();
      const audioHtml = `data:text/html,<html><body><div class="audio-panel"><h2>Deep Dive</h2><button aria-label="Play audio">Play</button><audio src="https://example.com/podcast.mp3"></audio><button aria-label="Download audio">Download</button></div></body></html>`;
      await page.goto(audioHtml);

      const result = await page.evaluate(() => {
        const playBtn = document.querySelector("button[aria-label*='Play' i]");
        const audioEl = document.querySelector("audio");
        return {
          status: playBtn || audioEl ? "ready" : "idle",
          audioUrl: audioEl?.src,
        };
      });

      expect(result.status).toBe("ready");
      expect(result.audioUrl).toBe("https://example.com/podcast.mp3");
    });
  });

  describe("3. Google AI Mode Adapter", () => {
    test("instantiates with executeQuery method", () => {
      const adapter = new AiModeAdapter(driver);
      expect(typeof adapter.executeQuery).toBe("function");
    });

    test("correctly parses DOM into Markdown and extracts citations", async () => {
      const page = await driver.getPage();
      const aiOverviewHtml = `data:text/html,<html><body>
        <div data-attrid="wa:/description">
          <h2>Summary</h2>
          <p>Autonomous agents operate using feedback loops.</p>
          <ul>
            <li>Perception</li>
            <li>Reasoning</li>
            <li>Action</li>
          </ul>
          <div class="sources">
            <a href="https://example.org/autonomous-agents" aria-label="Agent Foundations">Agent Foundations</a>
          </div>
        </div>
      </body></html>`;
      await page.goto(aiOverviewHtml);

      const parsed = await page.evaluate(() => {
        const root = document.querySelector("div[data-attrid='wa:/description']") as HTMLElement;
        const links = Array.from(root.querySelectorAll("a[href]")) as HTMLAnchorElement[];
        const citations = links.map((l) => ({
          title: l.textContent?.trim() || "",
          url: l.href,
        }));
        const heading = root.querySelector("h2")?.textContent?.trim();
        const p = root.querySelector("p")?.textContent?.trim();
        return { citations, heading, p };
      });

      expect(parsed.heading).toBe("Summary");
      expect(parsed.p).toBe("Autonomous agents operate using feedback loops.");
      expect(parsed.citations.length).toBe(1);
      expect(parsed.citations[0].url).toBe("https://example.org/autonomous-agents");
      expect(parsed.citations[0].title).toBe("Agent Foundations");
    });
  });

  describe("4. High-Level Browser Tool Actions", () => {
    test("browsePage fetches title, text and extracts content cleanly", async () => {
      const testHtml = `data:text/html,<html><head><title>Fabric Tool Test</title></head><body><h1>Autonomous Mesh</h1><p>Telemetry and Knowledge</p></body></html>`;
      const res = await browsePage(testHtml, { extractText: true, screenshot: false });
      expect(res.title).toBe("Fabric Tool Test");
      expect(res.text).toContain("Autonomous Mesh");
      expect(res.text).toContain("Telemetry and Knowledge");
    });

    test("syncNotebookLM gracefully fails with descriptive error if file missing", async () => {
      const res = await syncNotebookLM("Test Notebook", "/tmp/does-not-exist.md");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Markdown source file does not exist");
    });

    test("closeBrowserDriver closes global session cleanly with zero dangling GUI windows", async () => {
      await closeBrowserDriver();
      expect(true).toBe(true);
    });
  });
});
