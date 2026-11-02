/**
 * NotebookLM Python CLI / SDK Bridge for The Fabric
 * Automates creating notebooks, uploading Fabric knowledge bundles,
 * generating two-host Audio Overviews (podcasts), and running grounded queries.
 */

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

export interface NotebookLMStatus {
  isInstalled: boolean;
  cliVersion?: string;
  isLoggedIn: boolean;
  error?: string;
}

export interface AudioOverviewJob {
  notebookId: string;
  title: string;
  status: "idle" | "generating" | "completed" | "failed";
  audioPath?: string;
  error?: string;
}

/**
 * Checks if notebooklm CLI is installed and configured in the system.
 */
export async function checkNotebookLMStatus(): Promise<NotebookLMStatus> {
  try {
    const { stdout } = await execFileAsync("notebooklm", ["--version"]);
    const version = stdout.trim();

    // Check if auth tokens or cookies exist
    const authCheck = await execFileAsync("notebooklm", ["auth", "check"]).catch(() => null);
    const isLoggedIn = !!authCheck && !authCheck.stderr?.includes("Not logged in");

    return {
      isInstalled: true,
      cliVersion: version,
      isLoggedIn,
    };
  } catch (err: any) {
    // Check if available as python module
    try {
      const { stdout } = await execFileAsync("python3", ["-m", "notebooklm", "--version"]);
      return {
        isInstalled: true,
        cliVersion: stdout.trim(),
        isLoggedIn: false,
      };
    } catch {
      return {
        isInstalled: false,
        isLoggedIn: false,
        error: "notebooklm-py not found on PATH. Run: pip install notebooklm-py",
      };
    }
  }
}

/**
 * Creates a new Google NotebookLM notebook with a title.
 */
export async function createNotebookLMNotebook(title: string): Promise<string> {
  const { stdout } = await execFileAsync("notebooklm", ["create", title]);
  const match = stdout.match(/([a-zA-Z0-9_-]{20,})/);
  if (!match) {
    throw new Error(`Failed to parse Notebook ID from output: ${stdout}`);
  }
  return match[1];
}

/**
 * Uploads a local file (e.g. Markdown source bundle) to a NotebookLM notebook.
 */
export async function uploadSourceToNotebookLM(notebookId: string, filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Source file does not exist: ${filePath}`);
  }
  await execFileAsync("notebooklm", ["source", "add", notebookId, filePath]);
  return true;
}

/**
 * Triggers generation of the dual-host Audio Overview (Podcast).
 */
export async function generateNotebookLMAudio(notebookId: string): Promise<boolean> {
  await execFileAsync("notebooklm", ["audio", "generate", notebookId]);
  return true;
}

/**
 * Downloads the generated Audio Overview podcast MP3.
 */
export async function downloadNotebookLMAudio(notebookId: string, outputMp3Path: string): Promise<string> {
  const dir = path.dirname(outputMp3Path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await execFileAsync("notebooklm", ["audio", "download", notebookId, "--output", outputMp3Path]);
  return outputMp3Path;
}

/**
 * Queries a NotebookLM notebook for grounded, citation-backed answers.
 */
export async function queryNotebookLM(notebookId: string, question: string): Promise<string> {
  const { stdout } = await execFileAsync("notebooklm", ["ask", notebookId, question]);
  return stdout.trim();
}
