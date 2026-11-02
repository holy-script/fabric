import fs from "fs";
import path from "path";

export type AmbientAppCategory =
  | "browser"
  | "ide"
  | "terminal"
  | "communication"
  | "media"
  | "design"
  | "productivity"
  | "system"
  | "other";

export type TranceState =
  | "idle"
  | "warming_up"
  | "active"
  | "deep_flow"
  | "trance"
  | "sedentary_lock";

export type DynamicIslandStatus = "normal" | "flow" | "warning" | "alert";

export interface DynamicIslandPayload {
  status: DynamicIslandStatus;
  headline: string;
  subtext: string;
  badge: string;
  icon: string;
  actionPrompt?: string;
}

export interface FrontmostAppInfo {
  name: string;
  windowTitle?: string;
  url?: string;
  category: AmbientAppCategory;
  bundleId?: string;
}

export interface GitContext {
  repository: string;
  branch: string;
  isClean: boolean;
  uncommittedChangesCount: number;
  repoPath?: string;
  headCommit?: string;
}

export interface FocusTranceInfo {
  sedentaryMinutes: number;
  continuousActivitySeconds: number;
  idleSeconds: number;
  tranceState: TranceState;
  lastBreakTimestamp: string;
  standingDetected: boolean;
}

export interface WorkspaceErrorEntry {
  timestamp: string;
  snippet: string;
  source?: string;
  exitCode?: number;
}

export interface AmbientContext {
  timestamp: string;
  frontmostApp: FrontmostAppInfo;
  git: GitContext;
  focus: FocusTranceInfo;
  blackboard: Record<string, any>;
  recentErrors: WorkspaceErrorEntry[];
  dynamicIsland: DynamicIslandPayload;
  system?: {
    loadAverage?: number[];
    memoryUsagePercent?: number;
    batteryLevel?: number;
    isCharging?: boolean;
  };
}

export const DEFAULT_AMBIENT_STATE_PATH = path.resolve(
  process.cwd(),
  ".ambient_state.json"
);

/**
 * Pure function: categorizes application name into standardized domain buckets.
 */
export function categorizeApp(appName: string): AmbientAppCategory {
  if (!appName) return "other";
  const name = appName.toLowerCase().trim();

  // Browsers
  if (
    /chrome|google chrome|safari|arc|brave|firefox|edge|microsoft edge|opera|vivaldi|zen/i.test(
      name
    )
  ) {
    return "browser";
  }

  // IDEs & Code Editors
  if (
    /code|visual studio code|cursor|webstorm|intellij|pycharm|sublime text|neovim|nvim|vim|emacs|zed|xcode|android studio/i.test(
      name
    )
  ) {
    return "ide";
  }

  // Terminals
  if (
    /terminal|iterm|iterm2|kitty|ghostty|alacritty|warp|hyper|wezterm/i.test(
      name
    )
  ) {
    return "terminal";
  }

  // Communication & Messaging
  if (
    /slack|discord|telegram|signal|whatsapp|messages|zoom|teams|skype/i.test(
      name
    )
  ) {
    return "communication";
  }

  // Design & Media
  if (/figma|sketch|photoshop|illustrator|canva|blender|framer/i.test(name)) {
    return "design";
  }

  // Audio / Video Media
  if (/spotify|music|apple music|vlc|youtube music|quicktime/i.test(name)) {
    return "media";
  }

  // Productivity / Notes
  if (/notion|obsidian|craft|bear|linear|jira|calendar|mail/i.test(name)) {
    return "productivity";
  }

  // System processes
  if (/finder|system settings|system preferences|dock|loginwindow/i.test(name)) {
    return "system";
  }

  return "other";
}

/**
 * Pure function: calculates the cognitive trance / sedentary state from continuous activity and idle seconds.
 */
export function calculateTranceState(
  continuousSeconds: number,
  idleSeconds: number
): TranceState {
  if (idleSeconds >= 60) {
    return "idle";
  }
  const minutes = continuousSeconds / 60;
  if (minutes < 15) {
    return "warming_up";
  }
  if (minutes < 30) {
    return "active";
  }
  if (minutes < 60) {
    return "deep_flow";
  }
  if (minutes < 90) {
    return "trance";
  }
  return "sedentary_lock";
}

/**
 * Pure function: parses AppleScript output containing window title and optional browser URL.
 */
export function parseOsascriptBrowserOutput(raw: string): {
  title?: string;
  url?: string;
} {
  if (!raw) return {};
  const cleaned = raw.trim();
  if (!cleaned) return {};

  // AppleScript list format: "Title, http://..." or "Title"
  // Look for URL pattern at the end
  const urlMatch = cleaned.match(/,\s*(https?:\/\/[^\s,]+)$/i);
  if (urlMatch) {
    const url = urlMatch[1].trim();
    const title = cleaned.slice(0, urlMatch.index).trim();
    return {
      title: title || undefined,
      url: url || undefined,
    };
  }

  // If the entire string is a URL
  if (/^https?:\/\//i.test(cleaned)) {
    return { url: cleaned };
  }

  // Split by first comma if format was: "Title, url"
  const commaIdx = cleaned.lastIndexOf(",");
  if (commaIdx !== -1) {
    const maybeUrl = cleaned.slice(commaIdx + 1).trim();
    if (/^https?:\/\//i.test(maybeUrl) || maybeUrl.startsWith("data:") || maybeUrl.startsWith("file://")) {
      const title = cleaned.slice(0, commaIdx).trim();
      return {
        title: title || undefined,
        url: maybeUrl || undefined,
      };
    }
  }

  return { title: cleaned };
}

/**
 * Pure function: parses `git status --porcelain` output into clean status and change count.
 */
export function parseGitStatus(porcelainOutput: string): {
  isClean: boolean;
  uncommittedChangesCount: number;
} {
  if (!porcelainOutput || !porcelainOutput.trim()) {
    return { isClean: true, uncommittedChangesCount: 0 };
  }
  const lines = porcelainOutput
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    isClean: lines.length === 0,
    uncommittedChangesCount: lines.length,
  };
}

/**
 * Pure function: synthesizes Dynamic Island payload based on ambient environment state.
 */
export function generateDynamicIslandPayload(
  frontmost: FrontmostAppInfo,
  git: GitContext,
  focus: FocusTranceInfo,
  recentErrors: WorkspaceErrorEntry[] = []
): DynamicIslandPayload {
  // 1. Check for recent fatal errors (within 5 minutes)
  const now = Date.now();
  const recentFatal = recentErrors.find((e) => {
    const errorTime = new Date(e.timestamp).getTime();
    return (
      (now - errorTime) < 5 * 60 * 1000 &&
      (e.exitCode !== undefined && e.exitCode !== 0)
    );
  }) || recentErrors[0];

  if (recentFatal) {
    const errorAgeSec = Math.max(0, Math.round((now - new Date(recentFatal.timestamp).getTime()) / 1000));
    if (errorAgeSec < 300) {
      return {
        status: "alert",
        headline: "Terminal / Test Failure",
        subtext: recentFatal.snippet.slice(0, 75).replace(/\n/g, " "),
        badge: "ALERT",
        icon: "🚨",
        actionPrompt: "Inspect blackboard.last_error for resolution",
      };
    }
  }

  // 2. Sedentary Lock: Continuous posture strain (> 90m)
  if (focus.tranceState === "sedentary_lock") {
    return {
      status: "warning",
      headline: `Sedentary Lock (${focus.sedentaryMinutes}m)`,
      subtext: "Continuous physical immobilization detected. Stand up and stretch.",
      badge: "BREAK",
      icon: "🚶",
      actionPrompt: "Take a 2-minute posture / hydration break",
    };
  }

  // 3. Trance State: Approaching strain (60-90m)
  if (focus.tranceState === "trance") {
    return {
      status: "warning",
      headline: `Deep Trance (${focus.sedentaryMinutes}m)`,
      subtext: `Working in ${frontmost.name}. Reset cognitive fatigue.`,
      badge: "TRANCE",
      icon: "⏳",
      actionPrompt: "Hydrate and rest eyes",
    };
  }

  // 4. Deep Flow (30-60m)
  if (focus.tranceState === "deep_flow") {
    return {
      status: "flow",
      headline: `Deep Flow: ${git.repository || frontmost.name} [${git.branch || "active"}]`,
      subtext: frontmost.windowTitle
        ? `${frontmost.name}: ${frontmost.windowTitle}`
        : `${frontmost.name} • ${focus.sedentaryMinutes}m continuous`,
      badge: "FLOW",
      icon: "⚡",
      actionPrompt: "Maintain deep focus uninterrupted",
    };
  }

  // 5. Normal / Active
  const repoName = git.repository && git.repository !== "none" ? git.repository : "Fabric";
  const branchTag = git.branch && git.branch !== "none" ? ` [${git.branch}]` : "";
  const subtitle = frontmost.windowTitle || (focus.tranceState === "idle" ? "Idle / Standby" : "Active");

  return {
    status: "normal",
    headline: `${repoName}${branchTag} • ${frontmost.name}`,
    subtext: subtitle,
    badge: git.branch && git.branch !== "none" ? git.branch : "READY",
    icon: "🌌",
    actionPrompt: "Ambient watcher active",
  };
}

/**
 * Provides a default safe fallback ambient context when no daemon state is yet available.
 */
export function getDefaultAmbientContext(): AmbientContext {
  const frontmost: FrontmostAppInfo = {
    name: "Visual Studio Code",
    category: "ide",
    windowTitle: "Fabric OS",
  };
  const git: GitContext = {
    repository: "fabric",
    branch: "main",
    isClean: true,
    uncommittedChangesCount: 0,
  };
  const focus: FocusTranceInfo = {
    sedentaryMinutes: 0,
    continuousActivitySeconds: 0,
    idleSeconds: 0,
    tranceState: "warming_up",
    lastBreakTimestamp: new Date().toISOString(),
    standingDetected: false,
  };
  const dynamicIsland = generateDynamicIslandPayload(frontmost, git, focus);

  return {
    timestamp: new Date().toISOString(),
    frontmostApp: frontmost,
    git,
    focus,
    blackboard: {},
    recentErrors: [],
    dynamicIsland,
  };
}

/**
 * Retrieves the current ambient context from the local state file.
 * Resilient against missing files, corrupted JSON, or concurrent writes.
 */
export async function getCurrentAmbientContext(options?: {
  statePath?: string;
  forceRefresh?: boolean;
}): Promise<AmbientContext> {
  const filePath = options?.statePath || DEFAULT_AMBIENT_STATE_PATH;

  try {
    if (!fs.existsSync(filePath)) {
      return getDefaultAmbientContext();
    }

    const raw = await fs.promises.readFile(filePath, "utf-8");
    if (!raw.trim()) {
      return getDefaultAmbientContext();
    }

    const data = JSON.parse(raw) as Partial<AmbientContext>;
    const defaultCtx = getDefaultAmbientContext();

    const frontmost: FrontmostAppInfo = {
      ...defaultCtx.frontmostApp,
      ...(data.frontmostApp || {}),
    };

    const git: GitContext = {
      ...defaultCtx.git,
      ...(data.git || {}),
    };

    const focus: FocusTranceInfo = {
      ...defaultCtx.focus,
      ...(data.focus || {}),
    };

    const recentErrors = Array.isArray(data.recentErrors)
      ? data.recentErrors
      : [];

    const dynamicIsland =
      data.dynamicIsland ||
      generateDynamicIslandPayload(frontmost, git, focus, recentErrors);

    return {
      timestamp: data.timestamp || new Date().toISOString(),
      frontmostApp: frontmost,
      git,
      focus,
      blackboard: data.blackboard || {},
      recentErrors,
      dynamicIsland,
      system: data.system,
    };
  } catch (err) {
    console.warn(
      `[AmbientService] Failed to read ambient state from ${filePath}:`,
      err instanceof Error ? err.message : err
    );
    return getDefaultAmbientContext();
  }
}

/**
 * Atomically updates the ambient context and persists it to `.ambient_state.json`.
 */
export async function updateAmbientContext(
  partial: Partial<AmbientContext>,
  statePath?: string
): Promise<AmbientContext> {
  const filePath = statePath || DEFAULT_AMBIENT_STATE_PATH;
  const current = await getCurrentAmbientContext({ statePath: filePath });

  const updatedFrontmost: FrontmostAppInfo = {
    ...current.frontmostApp,
    ...(partial.frontmostApp || {}),
  };

  const updatedGit: GitContext = {
    ...current.git,
    ...(partial.git || {}),
  };

  const updatedFocus: FocusTranceInfo = {
    ...current.focus,
    ...(partial.focus || {}),
  };

  const updatedErrors = partial.recentErrors !== undefined
    ? partial.recentErrors
    : current.recentErrors;

  const updatedBlackboard = {
    ...current.blackboard,
    ...(partial.blackboard || {}),
  };

  const updatedDynamicIsland =
    partial.dynamicIsland ||
    generateDynamicIslandPayload(
      updatedFrontmost,
      updatedGit,
      updatedFocus,
      updatedErrors
    );

  const merged: AmbientContext = {
    timestamp: partial.timestamp || new Date().toISOString(),
    frontmostApp: updatedFrontmost,
    git: updatedGit,
    focus: updatedFocus,
    blackboard: updatedBlackboard,
    recentErrors: updatedErrors,
    dynamicIsland: updatedDynamicIsland,
    system: partial.system || current.system,
  };

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tempPath, JSON.stringify(merged, null, 2), "utf-8");
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    console.warn(
      `[AmbientService] Failed to persist ambient state to ${filePath}:`,
      err instanceof Error ? err.message : err
    );
  }

  return merged;
}

/**
 * Logs a key-value pair to Fabric's ambient blackboard.
 */
export async function logToBlackboard(
  key: string,
  value: any,
  statePath?: string
): Promise<void> {
  const current = await getCurrentAmbientContext({ statePath });
  const updatedBlackboard = {
    ...current.blackboard,
    [key]: value,
  };
  await updateAmbientContext({ blackboard: updatedBlackboard }, statePath);
}

/**
 * Retrieves a key from the ambient blackboard.
 */
export async function getBlackboardValue<T = any>(
  key: string,
  statePath?: string
): Promise<T | undefined> {
  const current = await getCurrentAmbientContext({ statePath });
  return current.blackboard[key] as T | undefined;
}

/**
 * Retrieves the complete ambient blackboard.
 */
export async function getBlackboard(
  statePath?: string
): Promise<Record<string, any>> {
  const current = await getCurrentAmbientContext({ statePath });
  return current.blackboard;
}

/**
 * Captures a workspace or terminal error snippet and logs it to Fabric's blackboard.
 */
export async function captureWorkspaceError(
  snippet: string,
  meta?: { source?: string; exitCode?: number },
  statePath?: string
): Promise<void> {
  const current = await getCurrentAmbientContext({ statePath });
  const entry: WorkspaceErrorEntry = {
    timestamp: new Date().toISOString(),
    snippet: snippet.trim(),
    source: meta?.source || "terminal",
    exitCode: meta?.exitCode,
  };

  const recentErrors = [entry, ...(current.recentErrors || [])].slice(0, 20);

  const blackboardUpdates: Record<string, any> = {
    last_error: entry,
  };

  if (meta?.exitCode !== undefined && meta.exitCode !== 0) {
    blackboardUpdates.fatal_test_failure = entry;
  }

  await updateAmbientContext(
    {
      recentErrors,
      blackboard: {
        ...current.blackboard,
        ...blackboardUpdates,
      },
    },
    statePath
  );
}

/**
 * Formats ambient context into a succinct Markdown string for LLM system prompts
 * (used by the AI conversation engine and HTN task planner).
 */
export function formatAmbientPromptContext(ctx?: AmbientContext): string {
  if (!ctx) return "";

  const lines: string[] = [];
  lines.push("### 🌿 LIVE AMBIENT CONTEXT:");
  lines.push(
    `- **Active Application:** ${ctx.frontmostApp.name} (${ctx.frontmostApp.category})${
      ctx.frontmostApp.windowTitle ? ` • "${ctx.frontmostApp.windowTitle}"` : ""
    }${ctx.frontmostApp.url ? ` • URL: ${ctx.frontmostApp.url}` : ""}`
  );

  lines.push(
    `- **Git Workspace:** ${ctx.git.repository} [${ctx.git.branch}] ${
      ctx.git.isClean
        ? "✓ clean"
        : `⚡ ${ctx.git.uncommittedChangesCount} uncommitted change(s)`
    }`
  );

  lines.push(
    `- **Cognitive / Posture State:** ${ctx.focus.tranceState.toUpperCase()} (${
      ctx.focus.sedentaryMinutes
    }m continuous activity, ${ctx.focus.idleSeconds}s idle)`
  );

  if (ctx.dynamicIsland) {
    lines.push(
      `- **Dynamic Island HUD:** ${ctx.dynamicIsland.icon} ${ctx.dynamicIsland.headline} — "${ctx.dynamicIsland.subtext}"`
    );
  }

  const blackboardKeys = Object.keys(ctx.blackboard || {});
  if (blackboardKeys.length > 0) {
    const summary = blackboardKeys
      .slice(0, 5)
      .map((k) => `${k}: ${JSON.stringify(ctx.blackboard[k]).slice(0, 50)}`)
      .join(", ");
    lines.push(`- **Blackboard State:** { ${summary} }`);
  }

  if (ctx.recentErrors && ctx.recentErrors.length > 0) {
    const err = ctx.recentErrors[0];
    lines.push(
      `- **Recent Failure Alert:** [Exit ${err.exitCode ?? 1}] "${err.snippet.slice(0, 100)}"`
    );
  }

  return lines.join("\n");
}
