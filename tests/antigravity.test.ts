import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import {
  findAgyBinary,
  buildAgyArgs,
  sanitizeProjectName,
  scaffoldWorkspace,
  saveProjectMetadata,
  getProjectStatus,
  listProjects,
  spinProject,
  type ProjectMetadata,
} from "../src/services/antigravity.js";
import antigravityApiHandler from "../api/antigravity.js";
import { handleSpin } from "../src/bot/commands/spin.js";

// Helper to create an isolated temporary workspace for tests
function createTempTestDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fabric-agy-${prefix}-`));
}

// Helper to mock HTTP requests/responses for Serverless API testing
function createMockHttp(
  method: string,
  url: string,
  body?: any,
  headers: Record<string, string> = {}
) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000", "content-type": "application/json", ...headers };

  let responseData = "";
  let statusCode = 200;
  const resHeaders: Record<string, string> = {};

  const res = {
    statusCode: 200,
    writeHead: (code: number, headers?: any) => {
      res.statusCode = code;
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          resHeaders[k.toLowerCase()] = String(v);
        }
      }
    },
    setHeader: (name: string, val: string) => {
      resHeaders[name.toLowerCase()] = val;
    },
    end: (data: string = "") => {
      responseData = data;
      statusCode = res.statusCode;
    },
  };

  const execute = async (): Promise<{
    status: number;
    body: any;
    headers: Record<string, string>;
  }> => {
    const promise = antigravityApiHandler(req, res as any);
    if (body !== undefined) {
      req.emit("data", typeof body === "string" ? body : JSON.stringify(body));
    }
    req.emit("end");
    await promise;

    let parsed = null;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = responseData;
    }
    return { status: statusCode, body: parsed, headers: resHeaders };
  };

  return { req, res, execute };
}

describe("Fabric OS — Google Antigravity Agent Harness & Project Spinner Suite", () => {
  let tempStateDir: string;
  let tempProjectDir: string;

  beforeEach(() => {
    tempStateDir = createTempTestDir("state");
    tempProjectDir = createTempTestDir("project");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // 1. Binary Discovery & Argument Formulation
  // =========================================================================
  describe("1. Binary Discovery & Argument Formulation", () => {
    it("discovers the local agy binary or accepts a custom binary path", () => {
      const realOrFallback = findAgyBinary();
      // On this machine, /Users/holyscript/.gemini/bin/agy exists
      if (fs.existsSync("/Users/holyscript/.gemini/bin/agy")) {
        expect(realOrFallback).toBe("/Users/holyscript/.gemini/bin/agy");
      }

      // Explicit custom binary path test
      const customPath = "/Users/holyscript/.gemini/bin/agy";
      if (fs.existsSync(customPath)) {
        expect(findAgyBinary(customPath)).toBe(customPath);
      }
      expect(findAgyBinary("/non/existent/path/to/agy")).toBe(realOrFallback);
    });

    it("constructs agy CLI arguments with prompt, projectDir, mode, and flags", () => {
      const args = buildAgyArgs({
        initialPrompt: "Build a React WebGL shader",
        projectDir: "/Users/holyscript/Desktop/projects/shader-lab",
        mode: "auto",
        dangerouslySkipPermissions: true,
        outputFormat: "text",
      });

      expect(args).toContain("-p");
      expect(args).toContain("Build a React WebGL shader");
      expect(args).toContain("--add-dir");
      expect(args).toContain("/Users/holyscript/Desktop/projects/shader-lab");
      expect(args).toContain("--mode");
      expect(args).toContain("auto");
      expect(args).toContain("--dangerously-skip-permissions");
      expect(args).toContain("--output-format");
      expect(args).toContain("text");
    });

    it("includes extraArgs and model overrides when specified", () => {
      const args = buildAgyArgs({
        initialPrompt: "Synthesize microservice",
        projectDir: "/tmp/project",
        mode: "plan",
        model: "gemini-2.5-pro",
        extraArgs: ["--effort", "high", "--new-project"],
      });

      expect(args).toContain("--model");
      expect(args).toContain("gemini-2.5-pro");
      expect(args).toContain("--mode");
      expect(args).toContain("plan");
      expect(args).toContain("--effort");
      expect(args).toContain("high");
      expect(args).toContain("--new-project");
    });

    it("sanitizes project names for file system safety", () => {
      expect(sanitizeProjectName("  quantum vault / alpha!  ")).toBe("quantum-vault-alpha");
      expect(sanitizeProjectName("my_cool_project-v1.0")).toBe("my_cool_project-v1.0");
      expect(sanitizeProjectName("../../../etc/passwd")).toBe("etc-passwd");
    });
  });

  // =========================================================================
  // 2. Workspace Scaffolding & Git Initialization
  // =========================================================================
  describe("2. Workspace Directory Scaffolding", () => {
    it("scaffolds README.md, .gitignore, AGENTS.md, .gemini/settings.json and inits git", async () => {
      const testDir = path.join(tempProjectDir, "sekiro-sun-poc");
      const { createdFiles, gitInitialized } = await scaffoldWorkspace(
        testDir,
        "sekiro-sun-poc",
        "Build a high-speed fighting game engine",
        "auto"
      );

      expect(createdFiles).toContain("README.md");
      expect(createdFiles).toContain(".gitignore");
      expect(createdFiles).toContain("AGENTS.md");
      expect(createdFiles).toContain(".gemini/settings.json");
      expect(gitInitialized).toBe(true);

      // Verify Git directory
      expect(fs.existsSync(path.join(testDir, ".git"))).toBe(true);

      // Verify README content
      const readme = fs.readFileSync(path.join(testDir, "README.md"), "utf-8");
      expect(readme).toContain("# sekiro-sun-poc");
      expect(readme).toContain("Build a high-speed fighting game engine");
      expect(readme).toContain("agy --add-dir");

      // Verify AGENTS.md content
      const agentsMd = fs.readFileSync(path.join(testDir, "AGENTS.md"), "utf-8");
      expect(agentsMd).toContain("Agent Handoff & Architecture Dossier");
      expect(agentsMd).toContain("4F Balance");
      expect(agentsMd).toContain("Build a high-speed fighting game engine");

      // Verify .gitignore content
      const gitignore = fs.readFileSync(path.join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain("node_modules/");
      expect(gitignore).toContain(".env");

      // Verify .gemini/settings.json content
      const geminiConfig = JSON.parse(
        fs.readFileSync(path.join(testDir, ".gemini/settings.json"), "utf-8")
      );
      expect(geminiConfig.project).toBe("sekiro-sun-poc");
      expect(geminiConfig.autonomous).toBe(true);
      expect(geminiConfig.harness).toBe("fabric-os");
    });

    it("is idempotent and does not overwrite existing workspace files", async () => {
      const testDir = path.join(tempProjectDir, "existing-vault");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "README.md"), "# Original Readme", "utf-8");

      const { createdFiles } = await scaffoldWorkspace(
        testDir,
        "existing-vault",
        "Secondary directive",
        "plan"
      );

      expect(createdFiles).not.toContain("README.md");
      const readme = fs.readFileSync(path.join(testDir, "README.md"), "utf-8");
      expect(readme).toBe("# Original Readme");
    });
  });

  // =========================================================================
  // 3. Metadata Persistence & Project Roster
  // =========================================================================
  describe("3. Metadata Persistence & Project Roster", () => {
    it("saves and retrieves project session metadata correctly", async () => {
      const meta: ProjectMetadata = {
        projectName: "quantum-crypto",
        projectDir: "/path/to/quantum-crypto",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        initialPrompt: "Build lattice crypto primitives",
        mode: "auto",
        gitInitialized: true,
        filesScaffolded: ["README.md", "AGENTS.md"],
      };

      await saveProjectMetadata(meta, tempStateDir);

      const retrieved = await getProjectStatus("quantum-crypto", tempStateDir);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.projectName).toBe("quantum-crypto");
      expect(retrieved?.status).toBe("active");
      expect(retrieved?.initialPrompt).toBe("Build lattice crypto primitives");
    });

    it("lists multiple projects sorted by most recently updated", async () => {
      const p1: ProjectMetadata = {
        projectName: "proj-1",
        projectDir: "/path/1",
        createdAt: "2026-11-01T00:00:00Z",
        updatedAt: "2026-11-01T00:00:00Z",
        status: "completed",
        initialPrompt: "Prompt 1",
        mode: "auto",
        gitInitialized: true,
        filesScaffolded: [],
      };
      const p2: ProjectMetadata = {
        projectName: "proj-2",
        projectDir: "/path/2",
        createdAt: "2026-11-02T00:00:00Z",
        updatedAt: "2026-11-04T12:00:00Z",
        status: "spinning",
        initialPrompt: "Prompt 2",
        mode: "plan",
        gitInitialized: true,
        filesScaffolded: [],
      };

      await saveProjectMetadata(p1, tempStateDir);
      await saveProjectMetadata(p2, tempStateDir);

      const list = await listProjects(tempStateDir);
      expect(list.length).toBe(2);
      expect(list[0].projectName).toBe("proj-2"); // Most recent
      expect(list[1].projectName).toBe("proj-1");
    });
  });

  // =========================================================================
  // 4. Project Spinning with Mocked Runner & Execution Capture
  // =========================================================================
  describe("4. Project Spinning & Execution Capture", () => {
    it("spins project with injected runner and records success output", async () => {
      const mockRunner = async (cmd: string, args: string[], options: any) => {
        expect(cmd).toBeDefined();
        expect(args).toContain("-p");
        expect(args).toContain("Create an interactive canvas");
        return {
          code: 0,
          stdout: "Agent turn completed successfully. Created 4 files.",
          stderr: "",
          pid: 9942,
        };
      };

      const result = await spinProject({
        projectName: "canvas-flow",
        projectDir: path.join(tempProjectDir, "canvas-flow"),
        initialPrompt: "Create an interactive canvas",
        mode: "auto",
        stateDir: tempStateDir,
        runner: mockRunner,
      });

      expect(result.projectName).toBe("canvas-flow");
      expect(result.status).toBe("completed");
      expect(result.exitCode).toBe(0);
      expect(result.pid).toBe(9942);
      expect(result.lastOutput).toContain("Agent turn completed successfully");
      expect(result.gitInitialized).toBe(true);

      // Verify file persistence
      const saved = await getProjectStatus("canvas-flow", tempStateDir);
      expect(saved?.status).toBe("completed");
    });

    it("captures execution failure and records error details", async () => {
      const mockFailingRunner = async () => {
        return {
          code: 1,
          stdout: "",
          stderr: "SyntaxError in agent planning module",
          pid: 9943,
        };
      };

      const result = await spinProject({
        projectName: "failing-service",
        projectDir: path.join(tempProjectDir, "failing-service"),
        initialPrompt: "Synthesize microservice",
        stateDir: tempStateDir,
        runner: mockFailingRunner,
      });

      expect(result.status).toBe("failed");
      expect(result.exitCode).toBe(1);
      expect(result.lastError).toContain("SyntaxError in agent planning module");
    });

    it("handles runner exception gracefully without crashing", async () => {
      const mockCrashingRunner = async () => {
        throw new Error("CLI process spawned out of memory");
      };

      const result = await spinProject({
        projectName: "oom-service",
        projectDir: path.join(tempProjectDir, "oom-service"),
        initialPrompt: "Heavy computation",
        stateDir: tempStateDir,
        runner: mockCrashingRunner,
      });

      expect(result.status).toBe("failed");
      expect(result.lastError).toContain("CLI process spawned out of memory");
    });
  });

  // =========================================================================
  // 5. Serverless API Endpoint Verification (api/antigravity.ts)
  // =========================================================================
  describe("5. Serverless API Endpoint (/api/antigravity)", () => {
    it("handles GET request to list projects", async () => {
      const mockHttp = createMockHttp("GET", "/api/antigravity");
      const res = await mockHttp.execute();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.projects)).toBe(true);
    });

    it("handles GET request for specific project status", async () => {
      // Seed a project in tempStateDir
      const meta: ProjectMetadata = {
        projectName: "api-seed-project",
        projectDir: "/test/dir",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        initialPrompt: "API check",
        mode: "auto",
        gitInitialized: true,
        filesScaffolded: [],
      };
      await saveProjectMetadata(meta);

      const mockHttp = createMockHttp("GET", "/api/antigravity?action=status&projectName=api-seed-project");
      const res = await mockHttp.execute();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.project.projectName).toBe("api-seed-project");
    });

    it("returns 404 for unknown project status", async () => {
      const mockHttp = createMockHttp("GET", "/api/antigravity?action=status&projectName=totally-imaginary-proj-999");
      const res = await mockHttp.execute();

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("not found");
    });

    it("validates POST payload and returns 400 when required fields are missing", async () => {
      const mockHttp = createMockHttp("POST", "/api/antigravity", {
        action: "spin",
        // Missing initialPrompt
        projectName: "incomplete-payload",
      });
      const res = await mockHttp.execute();

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("Missing required 'initialPrompt'");
    });

    it("handles POST spin action and returns 201 with project metadata", async () => {
      const mockHttp = createMockHttp("POST", "/api/antigravity", {
        action: "spin",
        projectName: "api-spun-microservice",
        initialPrompt: "Build a high-performance REST endpoint in Bun",
        projectDir: path.join(tempProjectDir, "api-spun-microservice"),
        mode: "auto",
        stateDir: tempStateDir,
        background: true,
      });

      const res = await mockHttp.execute();

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.project.projectName).toBe("api-spun-microservice");
      expect(res.body.project.status).toBe("spinning");
      expect(res.body.project.gitInitialized).toBe(true);
    });

    it("handles OPTIONS request for CORS preflight", async () => {
      const mockHttp = createMockHttp("OPTIONS", "/api/antigravity");
      const res = await mockHttp.execute();

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });
  });

  // =========================================================================
  // 6. Telegram Bot Command Verification (/spin)
  // =========================================================================
  describe("6. Telegram Bot Command (/spin)", () => {
    it("replies with usage guide when invoked with no arguments", async () => {
      let replyText = "";
      const ctx: any = {
        message: { text: "/spin" },
        from: { id: 123456 },
        reply: async (text: string) => {
          replyText = text;
        },
      };

      await handleSpin(ctx);

      expect(replyText).toContain("Fabric OS: Antigravity Project Spinner");
      expect(replyText).toContain("/spin <projectName> [initial prompt]");
      expect(replyText).toContain("Examples:");
    });

    it("handles /spin list command", async () => {
      let replyText = "";
      const ctx: any = {
        message: { text: "/spin list" },
        from: { id: 123456 },
        reply: async (text: string) => {
          replyText = text;
        },
      };

      await handleSpin(ctx);

      expect(replyText.length).toBeGreaterThan(0);
      // Either lists projects or indicates none found
      expect(replyText).toMatch(/(Antigravity Project Workspaces|No Antigravity projects)/);
    });

    it("spins a project and replies with confirmation card and action keyboard", async () => {
      let initialStatusText = "";
      let editedText = "";
      let attachedKeyboard: any = null;

      const ctx: any = {
        message: { text: "/spin test-bot-vault Create a local SQLite encrypted vault" },
        from: { id: 123456 },
        chat: { id: 987654 },
        reply: async (text: string) => {
          initialStatusText = text;
          return { message_id: 111 };
        },
        api: {
          editMessageText: async (chatId: number, messageId: number, text: string, options: any) => {
            editedText = text;
            attachedKeyboard = options?.reply_markup;
          },
        },
      };

      await handleSpin(ctx);

      expect(initialStatusText).toContain("Spinning Workspace for `test-bot-vault`");
      expect(editedText).toContain("Antigravity Workspace Spun Successfully!");
      expect(editedText).toContain("test-bot-vault");
      expect(editedText).toContain("agy --add-dir");
      expect(attachedKeyboard).toBeDefined();
    });
  });
});
