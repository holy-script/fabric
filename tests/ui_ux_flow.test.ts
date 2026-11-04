/**
 * Fabric OS - Automated End-to-End Headless UI/UX Flow & Leakage Testing Suite
 *
 * Exercises:
 *  - Flow 1: Master 6-Tab Switcher Navigation (Telemetry, Workbench, Vault Mesh, Academy, HTN Tasks, Sonic Mind)
 *  - Flow 2: Socratic Voice Dock Interaction (Expand, Persona Selector/Pills, Canvas Visualizer, Transcript)
 *  - Flow 3: Dynamic Island HUD (/island) Responsive States (Compact 430x44 -> Expanded 140px, Sine Waveform Canvas)
 *  - Flow 4: Leakage & Resilience Checks (0 unhandled JS errors, 0 ReferenceErrors, 0 layout overflows)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { Page } from "puppeteer-core";
import dashboardHandler from "../api/dashboard.js";
import islandHandler from "../api/island.js";
import { BrowserDriver } from "../src/browser/driver.js";

describe("Fabric OS Headless UI/UX Flow & Leakage Regression Suite", () => {
  let server: http.Server;
  let serverPort: number;
  let driver: BrowserDriver;
  let page: Page;
  let testProfileDir: string;

  const capturedPageErrors: Error[] = [];
  const capturedConsoleErrors: string[] = [];

  beforeAll(async () => {
    testProfileDir = path.join(os.tmpdir(), `fabric-uiux-test-${Date.now()}`);

    // Spin up local mock HTTP server to serve dashboard and island endpoints
    server = http.createServer(async (req, res) => {
      const url = req.url || "/";
      try {
        if (url.startsWith("/dashboard")) {
          await dashboardHandler(req as any, res as any);
        } else if (url.startsWith("/island") || url.startsWith("/api/island")) {
          // If SSE stream is requested, supply initial packet and terminate cleanly for test environment
          if (url.includes("stream=1") || (req.headers.accept && req.headers.accept.includes("text/event-stream"))) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache",
              "Access-Control-Allow-Origin": "*",
            });
            res.write("event: telemetry\ndata: {}\n\n");
            res.end();
            return;
          }
          await islandHandler(req as any, res as any);
        } else if (url.startsWith("/api/voice")) {
          // Mock Socratic Polymath voice channel response
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(
            JSON.stringify({
              ok: true,
              sessionId: "test-voice-session-uuid",
              replyDelta: {
                fullText: "The unexamined code is not worth executing. What invariant must hold?",
                persona: "socratic",
              },
            })
          );
        } else if (url.startsWith("/favicon.ico")) {
          res.statusCode = 204;
          res.end();
        } else {
          res.statusCode = 404;
          res.end("Not Found");
        }
      } catch (err: any) {
        res.statusCode = 500;
        res.end(err?.message || "Server Error");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    // Initialize headless browser with strict headless execution
    driver = new BrowserDriver({
      headless: true,
      userDataDir: testProfileDir,
      debuggingPort: 9444,
      defaultTimeout: 15000,
      viewport: { width: 1280, height: 900 },
    });

    page = await driver.getPage();

    // Listen to page errors and console errors to catch any leaks
    page.on("pageerror", (err) => {
      capturedPageErrors.push(err);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        capturedConsoleErrors.push(msg.text());
      }
    });
  });

  afterAll(async () => {
    try {
      if (driver) {
        await driver.close();
      }
    } catch {
      // Driver cleanup
    }

    if (server) {
      await new Promise<void>((resolve) => {
        if ("closeAllConnections" in server && typeof (server as any).closeAllConnections === "function") {
          (server as any).closeAllConnections();
        }
        server.close(() => resolve());
      });
    }

    if (testProfileDir && fs.existsSync(testProfileDir)) {
      try {
        fs.rmSync(testProfileDir, { recursive: true, force: true });
      } catch {
        // Temp profile cleanup
      }
    }
  });

  describe("Flow 1: Master 6-Tab Switcher Navigation", () => {
    const tabs = [
      { id: "hud", btnSelector: "#navTabHud", panelSelector: "#tabContentHud", label: "4F Telemetry" },
      { id: "workbench", btnSelector: "#navTabWorkbench", panelSelector: "#tabContentWorkbench", label: "Workbench & Bio" },
      { id: "graph", btnSelector: "#navTabGraph", panelSelector: "#tabContentGraph", label: "Vault Mesh" },
      { id: "academy", btnSelector: "#navTabAcademy", panelSelector: "#tabContentAcademy", label: "IITM Academy" },
      { id: "tasks", btnSelector: "#navTabTasks", panelSelector: "#tabContentTasks", label: "HTN Tasks" },
      { id: "sonic", btnSelector: "#navTabSonic", panelSelector: "#tabContentSonic", label: "Sonic Mind" },
    ];

    test("loads Dashboard successfully and renders all 6 tab navigation pills", async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/dashboard`, { waitUntil: "networkidle0" });
      const title = await page.title();
      expect(title).toContain("Fabric HUD");

      for (const tab of tabs) {
        const exists = await page.$(tab.btnSelector);
        expect(exists).not.toBeNull();
      }
    });

    for (const targetTab of tabs) {
      test(`activates tab '${targetTab.label}', updates CSS classes and displays panel with zero occlusion`, async () => {
        if (!page || page.isClosed()) {
          page = await driver.getPage();
        }
        if (!page.url().includes("/dashboard")) {
          await page.goto(`http://127.0.0.1:${serverPort}/dashboard`, { waitUntil: "networkidle0" });
        }
        // Ensure element is visible and interactive
        await page.waitForSelector(targetTab.btnSelector, { visible: true });
        await page.click(targetTab.btnSelector);
        // Small delay to let any RAF / layout transition finalize
        await new Promise((r) => setTimeout(r, 60));

        const tabState = await page.evaluate(
          (activeBtnSel, activePanelSel, allPanelSels) => {
            const activeBtn = document.querySelector(activeBtnSel);
            const activePanel = document.querySelector(activePanelSel);

            const isBtnActive =
              activeBtn?.classList.contains("bg-zinc-800") &&
              activeBtn?.classList.contains("text-cyan-400");

            const isPanelVisible =
              activePanel &&
              !activePanel.classList.contains("hidden") &&
              window.getComputedStyle(activePanel).display !== "none";

            // Verify none of the other 5 panels are occluding or visible
            const occludingPanels = allPanelSels
              .filter((sel) => sel !== activePanelSel)
              .filter((sel) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                const hasNoHidden = !el.classList.contains("hidden");
                const isDisplay = window.getComputedStyle(el).display !== "none";
                return hasNoHidden && isDisplay;
              });

            return {
              isBtnActive,
              isPanelVisible,
              occludingCount: occludingPanels.length,
            };
          },
          targetTab.btnSelector,
          targetTab.panelSelector,
          tabs.map((t) => t.panelSelector)
        );

        expect(tabState.isBtnActive).toBe(true);
        expect(tabState.isPanelVisible).toBe(true);
        expect(tabState.occludingCount).toBe(0);
      });
    }
  });

  describe("Flow 2: Socratic Voice Dock Interaction", () => {
    test("clicking header '🎙️ Voice' button expands floating dock with persona selector, canvas and transcript", async () => {
      if (!page || page.isClosed()) {
        page = await driver.getPage();
      }
      if (!page.url().includes("/dashboard")) {
        await page.goto(`http://127.0.0.1:${serverPort}/dashboard`, { waitUntil: "networkidle0" });
      }
      // Ensure we are on dashboard
      const voiceBtn = await page.$("#dashboardVoiceBtn");
      expect(voiceBtn).not.toBeNull();

      // Click voice button
      await page.click("#dashboardVoiceBtn");
      await new Promise((r) => setTimeout(r, 80));

      const dockDetails = await page.evaluate(() => {
        const panel = document.getElementById("dashboardVoicePanel");
        const personaSelect = document.getElementById("dashVoicePersonaSelect");
        const canvas = document.getElementById("dashVoiceCanvas") as HTMLCanvasElement | null;
        const transcript = document.getElementById("dashVoiceTranscript");
        const status = document.getElementById("dashVoiceStatus");

        const isVisible =
          panel &&
          !panel.classList.contains("hidden") &&
          window.getComputedStyle(panel).display !== "none";

        return {
          isVisible,
          hasPersonaSelect: !!personaSelect,
          hasCanvas: !!canvas && canvas.width > 0 && canvas.height > 0,
          hasTranscript: !!transcript && (transcript.textContent?.trim().length || 0) > 0,
          statusText: status?.textContent || "",
        };
      });

      expect(dockDetails.isVisible).toBe(true);
      expect(dockDetails.hasPersonaSelect).toBe(true);
      expect(dockDetails.hasCanvas).toBe(true);
      expect(dockDetails.hasTranscript).toBe(true);
      expect(dockDetails.statusText.length).toBeGreaterThan(0);
    });

    test("clicking persona pill '📐 Architect' updates active persona and status label", async () => {
      const architectPill = await page.$('.persona-pill[data-persona="architect"]');
      expect(architectPill).not.toBeNull();

      await page.click('.persona-pill[data-persona="architect"]');
      await new Promise((r) => setTimeout(r, 50));

      const updated = await page.evaluate(() => {
        const status = document.getElementById("dashVoiceStatus");
        const select = document.getElementById("dashVoicePersonaSelect") as HTMLSelectElement | null;
        const pill = document.querySelector('.persona-pill[data-persona="architect"]');
        return {
          statusText: status?.textContent || "",
          selectValue: select?.value,
          hasActiveClass: pill?.classList.contains("bg-purple-600"),
        };
      });

      expect(updated.statusText).toContain("ARCHITECT");
      expect(updated.selectValue).toBe("architect");
      expect(updated.hasActiveClass).toBe(true);
    });

    test("clicking persona pill '⚔️ Sceptic' updates active persona and status label", async () => {
      const scepticPill = await page.$('.persona-pill[data-persona="sceptic"]');
      expect(scepticPill).not.toBeNull();

      await page.click('.persona-pill[data-persona="sceptic"]');
      await new Promise((r) => setTimeout(r, 50));

      const updated = await page.evaluate(() => {
        const status = document.getElementById("dashVoiceStatus");
        const select = document.getElementById("dashVoicePersonaSelect") as HTMLSelectElement | null;
        const pill = document.querySelector('.persona-pill[data-persona="sceptic"]');
        return {
          statusText: status?.textContent || "",
          selectValue: select?.value,
          hasActiveClass: pill?.classList.contains("bg-purple-600"),
        };
      });

      expect(updated.statusText).toContain("SCEPTIC");
      expect(updated.selectValue).toBe("sceptic");
      expect(updated.hasActiveClass).toBe(true);
    });

    test("toggling voice dock closed re-hides panel cleanly", async () => {
      await page.click("#dashboardVoiceBtn");
      await new Promise((r) => setTimeout(r, 60));

      const isHidden = await page.evaluate(() => {
        const panel = document.getElementById("dashboardVoicePanel");
        return panel?.classList.contains("hidden") || window.getComputedStyle(panel!).display === "none";
      });

      expect(isHidden).toBe(true);
    });
  });

  describe("Flow 3: Dynamic Island HUD (/island) Responsive States", () => {
    test("renders /island in compact mode (430x44) with mini respiration wave canvas", async () => {
      await page.setViewport({ width: 430, height: 44 });
      await page.goto(`http://127.0.0.1:${serverPort}/island`, { waitUntil: "domcontentloaded" });

      const compactState = await page.evaluate(() => {
        const island = document.getElementById("dynamicIsland");
        const compactView = document.getElementById("compactView");
        const expandedView = document.getElementById("expandedView");
        const miniCanvas = document.getElementById("compactWaveCanvas") as HTMLCanvasElement | null;

        const isExpanded = island?.classList.contains("expanded") || false;
        const compactDisplay = compactView ? window.getComputedStyle(compactView).display : "none";
        const expandedDisplay = expandedView ? window.getComputedStyle(expandedView).display : "none";

        return {
          isExpanded,
          compactDisplay,
          expandedDisplay,
          hasMiniCanvas: !!miniCanvas,
          canvasWidth: miniCanvas?.width || 0,
          canvasHeight: miniCanvas?.height || 0,
        };
      });

      expect(compactState.isExpanded).toBe(false);
      expect(compactState.compactDisplay).toBe("flex");
      expect(compactState.expandedDisplay).toBe("none");
      expect(compactState.hasMiniCanvas).toBe(true);
      expect(compactState.canvasWidth).toBe(44);
      expect(compactState.canvasHeight).toBe(20);
    });

    test("clicking Dynamic Island expands HUD to 140px with full breathing waveform canvas", async () => {
      // Expand viewport for full inspection
      await page.setViewport({ width: 430, height: 844 });
      await page.click("#dynamicIsland");
      await new Promise((r) => setTimeout(r, 200));

      const expandedState = await page.evaluate(() => {
        const island = document.getElementById("dynamicIsland");
        const compactView = document.getElementById("compactView");
        const expandedView = document.getElementById("expandedView");
        const breathingCanvas = document.getElementById("breathingCanvas") as HTMLCanvasElement | null;

        const isExpanded = island?.classList.contains("expanded") || false;
        const compactDisplay = compactView ? window.getComputedStyle(compactView).display : "none";
        const expandedDisplay = expandedView ? window.getComputedStyle(expandedView).display : "none";

        return {
          isExpanded,
          compactDisplay,
          expandedDisplay,
          hasBreathingCanvas: !!breathingCanvas,
          canvasWidth: breathingCanvas?.width || 0,
          canvasHeight: breathingCanvas?.height || 0,
        };
      });

      expect(expandedState.isExpanded).toBe(true);
      expect(expandedState.compactDisplay).toBe("none");
      expect(expandedState.expandedDisplay).toBe("flex");
      expect(expandedState.hasBreathingCanvas).toBe(true);
      expect(expandedState.canvasWidth).toBe(260);
      expect(expandedState.canvasHeight).toBe(38);
    });
  });

  describe("Flow 4: Leakage & Resilience Checks", () => {
    test("verifies ZERO uncaught page errors, reference errors or syntax errors during navigation", () => {
      expect(capturedPageErrors).toHaveLength(0);
    });

    test("verifies ZERO unhandled console error messages across all flows", () => {
      if (capturedConsoleErrors.length > 0) {
        console.log("Captured console errors:", capturedConsoleErrors);
      }
      expect(capturedConsoleErrors).toHaveLength(0);
    });

    test("verifies ZERO broken layout overflows on Dashboard (desktop and tablet)", async () => {
      // Test desktop 1280px
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(`http://127.0.0.1:${serverPort}/dashboard`, { waitUntil: "networkidle0" });

      const desktopOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(desktopOverflow).toBe(false);

      // Test tablet 768px
      await page.setViewport({ width: 768, height: 1024 });
      await new Promise((r) => setTimeout(r, 60));
      const tabletOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(tabletOverflow).toBe(false);
    });

    test("verifies ZERO broken layout overflows on Dynamic Island (mobile 430px and desktop 1280px)", async () => {
      // Mobile 430px
      await page.setViewport({ width: 430, height: 932 });
      await page.goto(`http://127.0.0.1:${serverPort}/island`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#dynamicIsland", { visible: true });
      await page.waitForFunction(() => window.innerWidth === 430);

      const mobileIslandOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(mobileIslandOverflow).toBe(false);

      // Desktop 1280px
      await page.setViewport({ width: 1280, height: 900 });
      await page.waitForFunction(() => window.innerWidth === 1280);
      const desktopIslandOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(desktopIslandOverflow).toBe(false);
    });
  });
});
