import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { logToBlackboard } from "./ambient.js";

const execFileAsync = promisify(execFile);

export type SpinMode = "auto" | "plan" | "accept-edits";
export type ProjectStatus = "scaffolded" | "spinning" | "active" | "completed" | "failed";

export interface SpinProjectOptions {
  projectName: string;
  projectDir?: string;
  initialPrompt: string;
  mode?: SpinMode;
  model?: string;
  dangerouslySkipPermissions?: boolean;
  outputFormat?: "text" | "json" | "stream-json";
  extraArgs?: string[];
  background?: boolean;
  binaryPath?: string;
  stateDir?: string;
  runner?: (
    cmd: string,
    args: string[],
    options: { cwd: string; env?: NodeJS.ProcessEnv; detached?: boolean }
  ) => Promise<{ code: number; stdout: string; stderr: string; pid?: number }>;
}

export interface ProjectMetadata {
  projectName: string;
  projectDir: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  initialPrompt: string;
  mode: SpinMode;
  pid?: number;
  exitCode?: number | null;
  lastOutput?: string;
  lastError?: string;
  gitInitialized: boolean;
  filesScaffolded: string[];
}

export const DEFAULT_PROJECTS_DIR = path.resolve(
  process.env.HOME || "/Users/holyscript",
  "Desktop/projects"
);
export const DEFAULT_STATE_DIR = path.resolve(process.cwd(), "data/projects");

/**
 * Discovers the Google Antigravity CLI binary (`agy`) on the current system.
 */
export function findAgyBinary(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  if (process.env.AGY_BIN_PATH && fs.existsSync(process.env.AGY_BIN_PATH)) {
    return process.env.AGY_BIN_PATH;
  }

  const candidatePaths = [
    path.join(process.env.HOME || "/Users/holyscript", ".gemini/bin/agy"),
    "/Users/holyscript/.gemini/bin/agy",
    "/usr/local/bin/agy",
    "/opt/homebrew/bin/agy",
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to checking PATH via which
  try {
    const { execSync } = require("child_process");
    const resolved = execSync("which agy", { encoding: "utf-8" }).trim();
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // Ignore error if not in PATH
  }

  return null;
}

/**
 * Constructs the command-line arguments for invoking `agy`.
 */
export function buildAgyArgs(options: {
  initialPrompt: string;
  projectDir: string;
  mode?: SpinMode;
  model?: string;
  dangerouslySkipPermissions?: boolean;
  outputFormat?: "text" | "json" | "stream-json";
  extraArgs?: string[];
}): string[] {
  const args: string[] = [];

  // Initial prompt to execute in print/headless mode
  args.push("-p", options.initialPrompt);

  // Add project workspace directory
  args.push("--add-dir", options.projectDir);

  // Set agent mode (auto, plan, accept-edits)
  if (options.mode) {
    args.push("--mode", options.mode);
  }

  // Model override if specified
  if (options.model) {
    args.push("--model", options.model);
  }

  // Auto-approve tool permissions for headless agent harnesses
  if (options.dangerouslySkipPermissions !== false) {
    args.push("--dangerously-skip-permissions");
  }

  // Output formatting
  if (options.outputFormat) {
    args.push("--output-format", options.outputFormat);
  }

  // Extra CLI flags
  if (options.extraArgs && options.extraArgs.length > 0) {
    args.push(...options.extraArgs);
  }

  return args;
}

/**
 * Sanitizes project names for safe file system directories.
 */
export function sanitizeProjectName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_\-\.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
}

/**
 * Scaffolds the workspace directory with standard architecture files:
 * - Git repository initialization
 * - README.md
 * - .gitignore
 * - AGENTS.md (Aristotelian & 4F handoff architecture)
 * - .gemini/settings.json
 */
export async function scaffoldWorkspace(
  projectDir: string,
  projectName: string,
  initialPrompt: string,
  mode: SpinMode = "auto"
): Promise<{ createdFiles: string[]; gitInitialized: boolean }> {
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const createdFiles: string[] = [];
  let gitInitialized = false;

  // 1. Git Initialization
  const gitDir = path.join(projectDir, ".git");
  if (!fs.existsSync(gitDir)) {
    try {
      await execFileAsync("git", ["init", "-b", "main"], { cwd: projectDir });
      gitInitialized = true;
    } catch {
      try {
        await execFileAsync("git", ["init"], { cwd: projectDir });
        gitInitialized = true;
      } catch (err) {
        console.warn(`[AntigravityHarness] Failed to initialize git in ${projectDir}:`, err);
      }
    }
  } else {
    gitInitialized = true;
  }

  // 2. README.md
  const readmePath = path.join(projectDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `# ${projectName}

> Autonomous Agent Workspace spun by Fabric OS Antigravity Harness
> **Initial Directive:** ${initialPrompt}

---

## 🚀 Architecture & Overview
This workspace is managed by Google Antigravity (\`agy\`) and Fabric OS.
- **Execution Mode:** \`${mode}\`
- **Created At:** ${new Date().toISOString()}

## 🛠️ Pair Programming & Agent Handoff
To resume or interact with an agent on this workspace:
\`\`\`bash
agy --add-dir "${projectDir}"
\`\`\`

See \`AGENTS.md\` for the autonomous agent coordination guidelines.
`;
    fs.writeFileSync(readmePath, readmeContent, "utf-8");
    createdFiles.push("README.md");
  }

  // 3. .gitignore
  const gitignorePath = path.join(projectDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `# Dependencies & Build Artifacts
node_modules/
dist/
build/
.cache/
coverage/

# Environment & Secrets
.env
.env.local
*.log

# OS & Editor Metadata
.DS_Store
Thumbs.db
.idea/
.vscode/
`;
    fs.writeFileSync(gitignorePath, gitignoreContent, "utf-8");
    createdFiles.push(".gitignore");
  }

  // 4. AGENTS.md (Agent Handoff & Architecture Dossier)
  const agentsPath = path.join(projectDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    const agentsContent = `# ${projectName} — Agent Handoff & Architecture Dossier

> **Spun By:** Fabric OS Antigravity Agent Harness  
> **Timestamp:** ${new Date().toISOString()}  
> **Execution Mode:** \`${mode}\`  
> **Initial Prompt:** "${initialPrompt}"

---

## 🌟 1. Executive Summary & Directive
This workspace was autonomously initialized to execute the following core objective:
> **"${initialPrompt}"**

All participating agents and subagents should optimize for clean architecture, verified test coverage, and documentation fidelity.

---

## 🏛️ 2. Operational Rules for AI Agents
1. **Preserve Documentation Integrity**: Do not destroy architectural rationale or overwrite AGENTS.md without incorporating prior epochs.
2. **Deterministic Verification**: Verify code changes with unit tests and type checks before reporting completion.
3. **4F Balance**: Minimize cognitive dispersion across Focus, Facts, Funds, and Feedback.
4. **Clean Handoff**: Document all new modules, configurations, and environment prerequisites.
`;
    fs.writeFileSync(agentsPath, agentsContent, "utf-8");
    createdFiles.push("AGENTS.md");
  }

  // 5. .gemini/ Configuration
  const geminiDir = path.join(projectDir, ".gemini");
  if (!fs.existsSync(geminiDir)) {
    fs.mkdirSync(geminiDir, { recursive: true });
  }

  const geminiSettingsPath = path.join(geminiDir, "settings.json");
  if (!fs.existsSync(geminiSettingsPath)) {
    const geminiSettings = {
      project: projectName,
      mode: mode,
      autonomous: true,
      harness: "fabric-os",
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(geminiSettingsPath, JSON.stringify(geminiSettings, null, 2), "utf-8");
    createdFiles.push(".gemini/settings.json");
  }

  return { createdFiles, gitInitialized };
}

/**
 * Saves project session metadata into local store and syncs to blackboard.
 */
export async function saveProjectMetadata(
  metadata: ProjectMetadata,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<void> {
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const filePath = path.join(stateDir, `${metadata.projectName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf-8");

  // Sync to ambient blackboard
  try {
    await logToBlackboard("antigravity_latest_project", metadata);
    const all = await listProjects(stateDir);
    await logToBlackboard(
      "antigravity_projects",
      all.map((p) => ({
        projectName: p.projectName,
        projectDir: p.projectDir,
        status: p.status,
        mode: p.mode,
        updatedAt: p.updatedAt,
      }))
    );
  } catch {
    // Non-fatal if blackboard fails
  }
}

/**
 * Retrieves status for a given project.
 */
export async function getProjectStatus(
  projectName: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<ProjectMetadata | null> {
  const safeName = sanitizeProjectName(projectName);
  const filePath = path.join(stateDir, `${safeName}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ProjectMetadata;
  } catch (err) {
    console.warn(`[AntigravityHarness] Failed to read project ${safeName}:`, err);
    return null;
  }
}

/**
 * Lists all projects known to the harness.
 */
export async function listProjects(stateDir: string = DEFAULT_STATE_DIR): Promise<ProjectMetadata[]> {
  if (!fs.existsSync(stateDir)) {
    return [];
  }

  const files = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
  const projects: ProjectMetadata[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(stateDir, file), "utf-8");
      projects.push(JSON.parse(content));
    } catch {
      // Ignore corrupt files
    }
  }

  return projects.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Spins up a new autonomous project workspace:
 * 1. Scaffolds directory, Git repo, README, .gitignore, AGENTS.md, .gemini config.
 * 2. Formulates CLI arguments and launches `agy` via custom runner, background leash, or sync execution.
 * 3. Captures output and logs session metadata to disk and the Fabric blackboard.
 */
export async function spinProject(options: SpinProjectOptions): Promise<ProjectMetadata> {
  const safeProjectName = sanitizeProjectName(options.projectName);
  const targetDir =
    options.projectDir || path.resolve(DEFAULT_PROJECTS_DIR, safeProjectName);
  const stateDir = options.stateDir || DEFAULT_STATE_DIR;
  const mode = options.mode || "auto";

  // 1. Scaffold workspace
  const { createdFiles, gitInitialized } = await scaffoldWorkspace(
    targetDir,
    safeProjectName,
    options.initialPrompt,
    mode
  );

  const initialMetadata: ProjectMetadata = {
    projectName: safeProjectName,
    projectDir: targetDir,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "scaffolded",
    initialPrompt: options.initialPrompt,
    mode: mode,
    gitInitialized,
    filesScaffolded: createdFiles,
  };

  await saveProjectMetadata(initialMetadata, stateDir);

  // 2. Discover `agy` CLI binary
  const binary = findAgyBinary(options.binaryPath);
  if (!binary && !options.runner) {
    initialMetadata.status = "failed";
    initialMetadata.lastError =
      "Google Antigravity CLI binary (`agy`) was not found on this system.";
    initialMetadata.updatedAt = new Date().toISOString();
    await saveProjectMetadata(initialMetadata, stateDir);
    return initialMetadata;
  }

  const agyArgs = buildAgyArgs({
    initialPrompt: options.initialPrompt,
    projectDir: targetDir,
    mode: mode,
    model: options.model,
    dangerouslySkipPermissions: options.dangerouslySkipPermissions,
    outputFormat: options.outputFormat || "text",
    extraArgs: options.extraArgs,
  });

  const cmdToRun = binary || "agy";

  // 3. Execution via injected Runner (for testing or customized isolation)
  if (options.runner) {
    try {
      initialMetadata.status = "spinning";
      initialMetadata.updatedAt = new Date().toISOString();
      await saveProjectMetadata(initialMetadata, stateDir);

      const runRes = await options.runner(cmdToRun, agyArgs, {
        cwd: targetDir,
        env: process.env,
      });

      initialMetadata.exitCode = runRes.code;
      initialMetadata.lastOutput = runRes.stdout;
      initialMetadata.lastError = runRes.stderr;
      initialMetadata.pid = runRes.pid;
      initialMetadata.status = runRes.code === 0 ? "completed" : "failed";
      initialMetadata.updatedAt = new Date().toISOString();

      await saveProjectMetadata(initialMetadata, stateDir);
      return initialMetadata;
    } catch (err: any) {
      initialMetadata.status = "failed";
      initialMetadata.lastError = err?.message || String(err);
      initialMetadata.updatedAt = new Date().toISOString();
      await saveProjectMetadata(initialMetadata, stateDir);
      return initialMetadata;
    }
  }

  // 4. Background Leashed Execution
  if (options.background) {
    const logsDir = path.join(stateDir, "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, `${safeProjectName}.log`);
    const logFd = fs.openSync(logFile, "a");

    const child = spawn(cmdToRun, agyArgs, {
      cwd: targetDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env },
    });

    child.unref();

    initialMetadata.pid = child.pid;
    initialMetadata.status = "spinning";
    initialMetadata.updatedAt = new Date().toISOString();
    initialMetadata.lastOutput = `Leashed in background with PID ${child.pid}. Logs: ${logFile}`;

    await saveProjectMetadata(initialMetadata, stateDir);
    return initialMetadata;
  }

  // 5. Synchronous Process Execution
  return new Promise<ProjectMetadata>((resolve) => {
    let stdoutData = "";
    let stderrData = "";

    initialMetadata.status = "spinning";
    initialMetadata.updatedAt = new Date().toISOString();
    saveProjectMetadata(initialMetadata, stateDir);

    const child = spawn(cmdToRun, agyArgs, {
      cwd: targetDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    initialMetadata.pid = child.pid;

    child.stdout?.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    child.on("error", async (err) => {
      initialMetadata.status = "failed";
      initialMetadata.lastError = err.message;
      initialMetadata.updatedAt = new Date().toISOString();
      await saveProjectMetadata(initialMetadata, stateDir);
      resolve(initialMetadata);
    });

    child.on("close", async (code) => {
      initialMetadata.exitCode = code;
      initialMetadata.lastOutput = stdoutData;
      initialMetadata.lastError = stderrData;
      initialMetadata.status = code === 0 ? "completed" : "failed";
      initialMetadata.updatedAt = new Date().toISOString();
      await saveProjectMetadata(initialMetadata, stateDir);
      resolve(initialMetadata);
    });
  });
}
