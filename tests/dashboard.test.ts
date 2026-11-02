import { describe, test, expect, beforeAll } from "bun:test";
import handler from "../api/dashboard.js";

describe("Visual HUD & Dashboard QC Suite", () => {
  let html = "";
  let statusCode = 0;

  beforeAll(async () => {
    const req = {
      url: "/api/dashboard",
      headers: { host: "localhost:3000" },
    };

    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data: string) => {
        html = data;
        statusCode = res.statusCode;
      },
    };

    await handler(req as any, res as any);
  });

  test("generates full HTML with all 3 functional tabs", () => {
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

  test("all inline script tags parse with zero JavaScript syntax errors", () => {
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

  test("serialized data injection contains valid graph and radar objects", () => {
    expect(html.includes("window.__GRAPH_DATA__ =")).toBe(true);
    expect(html.includes("window.__ARISTOTLE_10__ =")).toBe(true);

    const graphMatch = html.match(/window\.__GRAPH_DATA__\s*=\s*(\{[\s\S]*?\});/);
    expect(graphMatch).not.toBeNull();
    if (graphMatch) {
      const parsedGraph = JSON.parse(graphMatch[1]);
      expect(Array.isArray(parsedGraph.nodes)).toBe(true);
      expect(Array.isArray(parsedGraph.edges)).toBe(true);
      expect(parsedGraph.nodes.length).toBeGreaterThan(0);
    }
  });
});
