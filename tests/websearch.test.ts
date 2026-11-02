import { describe, it, expect } from "bun:test";
import { searchWeb, searchWebDetailed } from "../src/services/websearch.js";

describe("Multi-Engine Web Search QC Suite", () => {
  it("executes fast instant search and returns structured results", async () => {
    const res = await searchWebDetailed("Unreal Engine", 3);
    expect(res).toBeDefined();
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].title).toBeDefined();
    expect(res.results[0].url.startsWith("http")).toBe(true);
    expect(["google_ai_mode", "google_cse", "duckduckgo_api", "duckduckgo_html"]).toContain(res.engineUsed);
  });

  it("handles long-tail queries with clean snippet extraction", async () => {
    const results = await searchWeb("game feel collision juice tips", 2);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].title.length).toBeGreaterThan(3);
      expect(results[0].snippet.length).toBeGreaterThan(10);
    }
  });

  it("handles empty queries gracefully", async () => {
    const res = await searchWebDetailed("", 3);
    expect(res.results).toEqual([]);
    expect(res.engineUsed).toBe("none");
  });
});
