import { describe, test, expect, beforeAll } from "bun:test";
import handler, { renderIslandHtml } from "../api/island.js";
import {
  getIslandTelemetry,
  mapFociColor,
  formatSSEEvent,
  formatSSERetry,
  formatSSEComment,
} from "../src/services/island-stream.js";

describe("Dynamic Island Companion HUD QC Suite", () => {
  let html = "";
  let statusCode = 0;
  let headers: Record<string, string> = {};

  beforeAll(async () => {
    const req = {
      url: "/api/island",
      headers: { host: "localhost:3000" },
      method: "GET",
    };

    const res = {
      statusCode: 200,
      setHeader: (key: string, val: string) => {
        headers[key.toLowerCase()] = val;
      },
      end: (data: string) => {
        html = data;
        statusCode = res.statusCode;
      },
    };

    await handler(req as any, res as any);
  });

  test("1. Serves standalone Apple-grade Dynamic Island HTML with 200 OK", () => {
    expect(statusCode).toBe(200);
    expect(headers["content-type"]).toContain("text/html");
    expect(html.length).toBeGreaterThan(10000);

    // Verify root island shell
    expect(html.includes('id="dynamicIsland"')).toBe(true);
    expect(html.includes('class="island"')).toBe(true);
  });

  test("2. iPad PWA-readiness and dark OLED aesthetic meta tags", () => {
    // Apple PWA meta tags
    expect(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">')).toBe(true);
    expect(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">')).toBe(true);
    expect(html.includes('<meta name="apple-mobile-web-app-title" content="Fabric Island">')).toBe(true);
    expect(html.includes('viewport-fit=cover')).toBe(true);
    expect(html.includes('<meta name="theme-color" content="#050508">')).toBe(true);
    expect(html.includes('manifest')).toBe(true);

    // OLED dark background aesthetic
    expect(html.includes("#050508")).toBe(true);
    expect(html.includes("env(safe-area-inset-top")).toBe(true);
  });

  test("3. Compact Notch Mode with pill shape and smooth expansion", () => {
    expect(html.includes('id="compactView"')).toBe(true);
    expect(html.includes('id="compactDot"')).toBe(true);
    expect(html.includes('id="compactWaveCanvas"')).toBe(true);
    expect(html.includes('id="compactCenterText"')).toBe(true);
    expect(html.includes('id="compactTimerBadge"')).toBe(true);

    // CSS pill height 38px & spring physics transitions
    expect(html.includes("height: 38px")).toBe(true);
    expect(html.includes("height: 140px")).toBe(true);
    expect(html.includes("cubic-bezier(0.16, 1, 0.3, 1)")).toBe(true);
  });

  test("4. Canvas fluid sine wave reflecting FOCI mental states", () => {
    expect(html.includes('id="breathingCanvas"')).toBe(true);
    expect(html.includes('id="waveBpm"')).toBe(true);
    expect(html.includes('id="waveCoherence"')).toBe(true);

    // Color definitions for mental states
    expect(html.includes("#06b6d4")).toBe(true); // flow: cyan
    expect(html.includes("#a855f7")).toBe(true); // focus: purple
    expect(html.includes("#10b981")).toBe(true); // calm: emerald
    expect(html.includes("#f59e0b")).toBe(true); // stress: amber
  });

  test("5. Focus Sprint Timer with radial progress", () => {
    expect(html.includes('id="radialProgress"')).toBe(true);
    expect(html.includes('id="timerDigits"')).toBe(true);
    expect(html.includes('id="timerLabel"')).toBe(true);
    expect(html.includes("radial-svg")).toBe(true);
  });

  test("6. Live Task DAG Pill with pulsing status indicator", () => {
    expect(html.includes('id="taskDagPill"')).toBe(true);
    expect(html.includes('id="dagPulseDot"')).toBe(true);
    expect(html.includes('id="dagText"')).toBe(true);
    expect(html.includes("pulseGlow")).toBe(true);
    expect(html.includes("Step 2/4: AI Mode Ingestion")).toBe(true);
  });

  test("7. Quick Action Dock with 4 high-grade 1-tap buttons", () => {
    expect(html.includes('id="btnSpark"')).toBe(true);
    expect(html.includes('id="btnSettle"')).toBe(true);
    expect(html.includes('id="btnAiMode"')).toBe(true);
    expect(html.includes('id="btnNlm"')).toBe(true);

    expect(html.includes("⚡</span> Spark")).toBe(true);
    expect(html.includes("🏁</span> Settle")).toBe(true);
    expect(html.includes("🧠</span> AI Mode")).toBe(true);
    expect(html.includes("🎙️</span> NotebookLM")).toBe(true);
  });

  test("8. All inline script tags parse with zero JavaScript syntax errors", () => {
    const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scriptMatches.length).toBeGreaterThan(0);

    for (const match of scriptMatches) {
      const code = match[1].trim();
      if (!code) continue;

      expect(() => {
        new Function(code);
      }).not.toThrow();
    }
  });

  test("9. FOCI mental state color mapping conforms to specification", () => {
    expect(mapFociColor("flow")).toEqual({ hex: "#06b6d4", name: "cyan" });
    expect(mapFociColor("focus")).toEqual({ hex: "#a855f7", name: "purple" });
    expect(mapFociColor("calm")).toEqual({ hex: "#10b981", name: "emerald" });
    expect(mapFociColor("stress")).toEqual({ hex: "#f59e0b", name: "amber" });
    expect(mapFociColor("distraction")).toEqual({ hex: "#f59e0b", name: "amber" });
    expect(mapFociColor("fatigue")).toEqual({ hex: "#f59e0b", name: "amber" });
  });

  test("10. SSE formatting generates valid EventSource frames", () => {
    const samplePayload = {
      test: "dynamic_island_telemetry",
      val: 42,
    };

    const sseEvent = formatSSEEvent(samplePayload, "telemetry");
    expect(sseEvent).toBe(`event: telemetry\ndata: {"test":"dynamic_island_telemetry","val":42}\n\n`);

    const retryFrame = formatSSERetry(3000);
    expect(retryFrame).toBe("retry: 3000\n\n");

    const commentFrame = formatSSEComment("Fabric Live Stream");
    expect(commentFrame).toBe(": Fabric Live Stream\n\n");
  });

  test("11. getIslandTelemetry produces comprehensive telemetry structure", async () => {
    const telemetry = await getIslandTelemetry();

    expect(telemetry).toHaveProperty("timestamp");
    expect(telemetry).toHaveProperty("session");
    expect(telemetry).toHaveProperty("foci");
    expect(telemetry).toHaveProperty("task");
    expect(telemetry).toHaveProperty("sentinel");
    expect(telemetry).toHaveProperty("system");

    // FOCI verification
    expect(["flow", "focus", "calm", "stress", "distraction", "fatigue"]).toContain(telemetry.foci.mentalState);
    expect(["#06b6d4", "#a855f7", "#10b981", "#f59e0b"]).toContain(telemetry.foci.color);
    expect(telemetry.foci.respirationRate).toBeGreaterThan(0);

    // HTN Task DAG verification
    expect(telemetry.task.active).toBe(true);
    expect(telemetry.task.stepPillText).toContain("Step");
    expect(telemetry.task.stepTitle).toBeDefined();

    // Sentinel unread verification
    expect(typeof telemetry.sentinel.unreadCount).toBe("number");
    expect(Array.isArray(telemetry.sentinel.alerts)).toBe(true);
  });

  test("12. Endpoint /api/island?json=1 serves pure telemetry JSON", async () => {
    let jsonOutput = "";
    let localHeaders: Record<string, string> = {};

    const req = {
      url: "/api/island?json=1",
      headers: { host: "localhost:3000" },
      method: "GET",
    };

    const res = {
      statusCode: 200,
      setHeader: (key: string, val: string) => {
        localHeaders[key.toLowerCase()] = val;
      },
      end: (data: string) => {
        jsonOutput = data;
      },
    };

    await handler(req as any, res as any);

    expect(localHeaders["content-type"]).toContain("application/json");
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.task.stepPillText).toBeDefined();
    expect(parsed.foci.color).toBeDefined();
  });

  test("13. Quick Action POST responds with confirmation and telemetry payload", async () => {
    let actionOutput = "";
    const req = {
      url: "/api/island?action=spark",
      headers: { host: "localhost:3000" },
      method: "POST",
    };

    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data: string) => {
        actionOutput = data;
      },
    };

    await handler(req as any, res as any);
    const parsed = JSON.parse(actionOutput);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("spark");
    expect(parsed.telemetry).toBeDefined();
  });

  test("14. SSE stream endpoint (/api/island?stream=1&single=1) outputs SSE headers and telemetry event", async () => {
    const writtenChunks: string[] = [];
    let sseHeaders: Record<string, string> = {};

    const req = {
      url: "/api/island?stream=1&single=1",
      headers: { host: "localhost:3000" },
      method: "GET",
      on: (_evt: string, _cb: Function) => {},
    };

    const res = {
      statusCode: 200,
      writeHead: (_code: number, hdr: Record<string, string>) => {
        sseHeaders = hdr;
      },
      write: (chunk: string) => {
        writtenChunks.push(chunk);
      },
      end: () => {},
    };

    await handler(req as any, res as any);

    expect(sseHeaders["Content-Type"]).toContain("text/event-stream");
    expect(sseHeaders["Cache-Control"]).toBe("no-cache, no-transform");

    const fullStream = writtenChunks.join("");
    expect(fullStream.includes("retry: 3000")).toBe(true);
    expect(fullStream.includes("event: telemetry")).toBe(true);
    expect(fullStream.includes('"stepPillText":')).toBe(true);
  });
});
