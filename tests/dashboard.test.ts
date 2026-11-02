import { describe, test, expect } from "bun:test";
import handler from "../api/dashboard.js";

describe("Visual HUD & Dashboard QC Suite", () => {
  test("generates full HTML with all 3 functional tabs", async () => {
    const req = {
      url: "/api/dashboard?userId=1131646846",
      headers: { host: "localhost:3000" },
    };

    let html = "";
    let statusCode = 0;
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data: string) => {
        html = data;
        statusCode = res.statusCode;
      },
    };

    await handler(req as any, res as any);

    expect(statusCode).toBe(200);
    expect(html.length).toBeGreaterThan(50000);

    // Verify all 3 tabs are present in HTML DOM
    expect(html.includes('id="tabContentHud"')).toBe(true);
    expect(html.includes('id="tabContentWorkbench"')).toBe(true);
    expect(html.includes('id="tabContentGraph"')).toBe(true);

    // Verify navigation buttons
    expect(html.includes('id="navTabHud"')).toBe(true);
    expect(html.includes('id="navTabWorkbench"')).toBe(true);
    expect(html.includes('id="navTabGraph"')).toBe(true);

    // Verify canvas and graph elements
    expect(html.includes('id="graphCanvas"')).toBe(true);
    expect(html.includes('id="nodeInspector"')).toBe(true);
    expect(html.includes('id="radarChart"')).toBe(true);
  });

  test("all inline script tags parse with zero JavaScript syntax errors", async () => {
    const req = {
      url: "/api/dashboard?userId=1131646846",
      headers: { host: "localhost:3000" },
    };

    let html = "";
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data: string) => {
        html = data;
      },
    };

    await handler(req as any, res as any);

    const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    expect(scriptMatches.length).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < scriptMatches.length; i++) {
      const s = scriptMatches[i];
      if (s.includes("src=")) continue; // Skip external CDNs

      const content = s.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
      // Evaluate syntax by passing to Function constructor
      expect(() => {
        new Function(content);
      }).not.toThrow();
    }
  });

  test("serialized data injection contains valid graph and radar objects", async () => {
    const req = {
      url: "/api/dashboard",
      headers: { host: "localhost:3000" },
    };

    let html = "";
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data: string) => {
        html = data;
      },
    };

    await handler(req as any, res as any);

    expect(html.includes("window.__GRAPH_DATA__ =")).toBe(true);
    expect(html.includes("window.__ARISTOTLE_10__ =")).toBe(true);
    expect(html.includes("window.switchMainTab = switchMainTab;")).toBe(true);
    expect(html.includes("window.resizeGraphCanvas = resizeGraphCanvas;")).toBe(true);
  });
});

