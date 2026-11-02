import { describe, it, expect } from "bun:test";
import { answerConversationalQuery, classifyMessageIntent } from "../src/ai/conversation.js";

describe("Conversational RAG & Search QC Suite", () => {
  it("classifies explicit questions as conversation", async () => {
    const intent = await classifyMessageIntent("Hey in my KB do we have any stuff regarding game dev?", false);
    expect(intent).toBe("conversation");
  });

  it("queries the knowledge graph and returns relevant cited nodes within timeout", async () => {
    const res = await answerConversationalQuery("1131646846", "game dev");
    expect(res).toBeDefined();
    expect(typeof res.text).toBe("string");
    expect(res.text.length).toBeGreaterThan(10);
    expect(res.citedNodes).toBeDefined();
    expect(Array.isArray(res.citedNodes)).toBe(true);
    expect(res.citedNodes.length).toBeGreaterThan(0);
  }, 10000);
});

