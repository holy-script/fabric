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

  test("generates full HTML with all 5 functional tabs and navigation buttons", () => {
    expect(statusCode).toBe(200);
    expect(html.length).toBeGreaterThan(50000);

    // Verify all 5 tabs are present in HTML DOM
    expect(html.includes('id="tabContentHud"')).toBe(true);
    expect(html.includes('id="tabContentWorkbench"')).toBe(true);
    expect(html.includes('id="tabContentGraph"')).toBe(true);
    expect(html.includes('id="tabContentAcademy"')).toBe(true);
    expect(html.includes('id="tabContentTasks"')).toBe(true);

    // Verify navigation buttons for all 5 tabs
    expect(html.includes('id="navTabHud"')).toBe(true);
    expect(html.includes('id="navTabWorkbench"')).toBe(true);
    expect(html.includes('id="navTabGraph"')).toBe(true);
    expect(html.includes('id="navTabAcademy"')).toBe(true);
    expect(html.includes('id="navTabTasks"')).toBe(true);

    // Verify canvas, graph and Academy/HTN elements
    expect(html.includes('id="graphCanvas"')).toBe(true);
    expect(html.includes('id="nodeInspector"')).toBe(true);
    expect(html.includes('id="radarChart"')).toBe(true);

    // Verify IITM Quiz 1 Academy elements
    expect(html.includes('id="academyBtnCN"')).toBe(true);
    expect(html.includes('id="academyBtnCSD"')).toBe(true);
    expect(html.includes('id="academyBtnBDBN"')).toBe(true);
    expect(html.includes('id="academyQText"')).toBe(true);
    expect(html.includes('id="academySolutionDrawer"')).toBe(true);
    expect(html.includes('id="formulaSheetBody"')).toBe(true);

    // Verify HTN Task DAG elements
    expect(html.includes('id="dagPlanSelect"')).toBe(true);
    expect(html.includes('id="dagCanvasContainer"')).toBe(true);
    expect(html.includes('id="dagSvg"')).toBe(true);
    expect(html.includes('id="dagStepInspector"')).toBe(true);
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

  test("serialized data injection contains valid graph, radar, iitm bank and task plan objects", () => {
    expect(html.includes("window.__GRAPH_DATA__ =")).toBe(true);
    expect(html.includes("window.__ARISTOTLE_10__ =")).toBe(true);
    expect(html.includes("window.__IITM_BANK__ =")).toBe(true);
    expect(html.includes("window.__TASK_PLANS__ =")).toBe(true);

    const graphMatch = html.match(/window\.__GRAPH_DATA__\s*=\s*(\{[\s\S]*?\});/);
    expect(graphMatch).not.toBeNull();
    if (graphMatch) {
      const parsedGraph = JSON.parse(graphMatch[1]);
      expect(Array.isArray(parsedGraph.nodes)).toBe(true);
      expect(Array.isArray(parsedGraph.edges)).toBe(true);
      // Ensure robust graph summary does not degrade to 5-node dummy
      expect(parsedGraph.nodes.length).toBeGreaterThan(50);
      expect(parsedGraph.edges.length).toBeGreaterThan(50);
    }

    const bankMatch = html.match(/window\.__IITM_BANK__\s*=\s*(\{[\s\S]*?\});/);
    expect(bankMatch).not.toBeNull();
    if (bankMatch) {
      const parsedBank = JSON.parse(bankMatch[1]);
      expect(parsedBank["Computer_Networks"]).toBeDefined();
      expect(parsedBank["Computer_Systems_Design"]).toBeDefined();
      expect(parsedBank["BDBN"]).toBeDefined();
    }

    const plansMatch = html.match(/window\.__TASK_PLANS__\s*=\s*(\[[\s\S]*?\]);/);
    expect(plansMatch).not.toBeNull();
    if (plansMatch) {
      const parsedPlans = JSON.parse(plansMatch[1]);
      expect(Array.isArray(parsedPlans)).toBe(true);
      expect(parsedPlans.length).toBeGreaterThan(0);
      expect(parsedPlans[0].steps).toBeDefined();
    }
  });

  test("getGraphSummary returns bundled fallback data with full graph connectivity", async () => {
    const { getGraphSummary } = await import("../src/graph/query.js");
    const summary = await getGraphSummary(false);
    expect(summary.nodes.length).toBeGreaterThanOrEqual(90);
    expect(summary.edges.length).toBeGreaterThanOrEqual(150);
    expect(summary.clusters.length).toBeGreaterThanOrEqual(10);
  });
});
