import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import {
  GeminiDeepResearchAdapter,
  getDeepResearchAdapter,
} from "../src/browser/adapters/deep-research.js";

describe("Fabric OS — Gemini Deep Research Subsystem QC Suite", () => {
  const projectRoot = process.cwd();

  describe("1. Adapter Instantiation & Configuration", () => {
    test("instantiates GeminiDeepResearchAdapter with default driver", () => {
      const adapter = getDeepResearchAdapter();
      expect(adapter).toBeInstanceOf(GeminiDeepResearchAdapter);
    });

    test("singleton accessor returns the same instance unless driver is overridden", () => {
      const a1 = getDeepResearchAdapter();
      const a2 = getDeepResearchAdapter();
      expect(a1).toBe(a2);
    });
  });

  describe("2. Auth Checking & URL Resolution", () => {
    test("checkAuthStatus detects unauthenticated state on simulated login redirect", async () => {
      const adapter = getDeepResearchAdapter();

      // Mock page with accounts.google.com URL
      const mockPage: any = {
        url: () => "https://accounts.google.com/signin/v2/identifier",
        evaluate: async () => false,
      };

      const status = await adapter.checkAuthStatus(mockPage);
      expect(status.isAuthenticated).toBe(false);
      expect(status.redirectUrl).toContain("accounts.google.com");
    });

    test("checkAuthStatus detects authenticated state when on gemini app without sign-in prompts", async () => {
      const adapter = getDeepResearchAdapter();

      // Mock page on gemini app without sign-in button
      const mockPage: any = {
        url: () => "https://gemini.google.com/app",
        evaluate: async () => false, // no sign in button found
      };

      const status = await adapter.checkAuthStatus(mockPage);
      expect(status.isAuthenticated).toBe(true);
      expect(status.redirectUrl).toBe("https://gemini.google.com/app");
    });
  });

  describe("3. CLI Runner Interface", () => {
    test("scripts/deep-research.ts executes with --help and displays usage", () => {
      const cliPath = path.join(projectRoot, "scripts/deep-research.ts");
      expect(fs.existsSync(cliPath)).toBe(true);

      const output = execSync(`bun run "${cliPath}" --help`, { encoding: "utf-8" });
      expect(output).toContain("Fabric OS — Gemini Deep Research Runner");
      expect(output).toContain("--query");
      expect(output).toContain("--export-docs");
      expect(output).toContain("--pdf");
      expect(output).toContain("--check-auth");
    });

    test("scripts/launch-research-browser.sh exists and is executable", () => {
      const scriptPath = path.join(projectRoot, "scripts/launch-research-browser.sh");
      expect(fs.existsSync(scriptPath)).toBe(true);
      const stat = fs.statSync(scriptPath);
      expect((stat.mode & 0o111) !== 0).toBe(true);
    });
  });

  describe("4. Skill & MCP Tool Integrity", () => {
    test("skills/gemini-deep-research/SKILL.md exists with valid YAML frontmatter", () => {
      const skillPath = path.join(projectRoot, "skills/gemini-deep-research/SKILL.md");
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, "utf-8");
      expect(content).toContain("name: gemini-deep-research");
      expect(content).toContain("triggers:");
      expect(content).toContain("- /deep-research");
      expect(content).toContain("fabric_deep_research");
    });

    test("Fabric MCP server schema includes fabric_deep_research definition", () => {
      const schemaPath = path.join(
        process.env.HOME || "",
        ".gemini/antigravity/mcp/fabric/fabric_deep_research.json"
      );
      expect(fs.existsSync(schemaPath)).toBe(true);

      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      expect(schema.name).toBe("fabric_deep_research");
      expect(schema.parameters.properties.query).toBeDefined();
      expect(schema.parameters.required).toContain("query");
    });
  });
});

