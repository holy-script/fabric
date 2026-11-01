#!/usr/bin/env bun
/**
 * The Fabric: 4F Meta-OS — Automated Passive Git Telemetry Installer
 *
 * Installs a universal post-commit Git hook that passively captures:
 * - Repository & branch identity
 * - Commit author & full message
 * - Diff stats & file alterations
 * - Estimated focus time (delta from prior commit or 30m quantum)
 * - Gemini 3.5 Flash semantic analysis -> Firestore Builder Trade
 * - Instant Telegram notification
 *
 * Usage:
 *   bun run scripts/install-git-telemetry.ts [options]
 *
 * Options:
 *   --current         Install in current repo (.git/hooks/post-commit) [default]
 *   --global          Install machine-wide for ALL repos (~/.git-hooks + core.hooksPath)
 *   --templates       Install into ~/.git-templates/hooks/post-commit
 *   --url <url>       Configure custom webhook URL
 *   --user <id>       Configure Telegram user ID
 *   --test            Send a verification telemetry payload
 *   --uninstall       Remove post-commit hook and reset git config
 *   --help, -h        Display help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import * as readline from "node:readline";

const DEFAULT_WEBHOOK_URL = "https://fabric-one-sage.vercel.app/api/webhooks/github";

const POST_COMMIT_HOOK_CONTENT = `#!/bin/sh
# ==============================================================================
# The Fabric: 4F Meta-OS — Automated Passive Git Telemetry Hook
# Non-blocking, failsafe background telemetry ingress.
# ==============================================================================

set +e

(
  # 1. Verify git repository root
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$REPO_ROOT" ]; then
    exit 0
  fi

  # 2. Extract repository & commit metadata
  REPO_NAME=$(basename "$REPO_ROOT")
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
  COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null)
  if [ -z "$COMMIT_HASH" ]; then
    exit 0
  fi

  COMMIT_AUTHOR=$(git log -1 --pretty=format:'%an' "$COMMIT_HASH" 2>/dev/null || echo "developer")
  COMMIT_EMAIL=$(git log -1 --pretty=format:'%ae' "$COMMIT_HASH" 2>/dev/null || echo "")
  COMMIT_MSG=$(git log -1 --pretty=format:'%B' "$COMMIT_HASH" 2>/dev/null || echo "Commit update")
  COMMIT_TIME=$(git log -1 --pretty=format:'%cI' "$COMMIT_HASH" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

  # 3. Compute diff stats and estimate focus time
  HAS_PARENT=$(git rev-parse --verify HEAD~1 2>/dev/null)
  if [ -n "$HAS_PARENT" ]; then
    DIFF_STAT=$(git diff --stat HEAD~1 HEAD 2>/dev/null | head -n 30)
    DIFF_SHORT=$(git diff --shortstat HEAD~1 HEAD 2>/dev/null)

    # Estimate focus time from timestamp delta
    CURR_TS=$(git log -1 --pretty=format:'%ct' "$COMMIT_HASH" 2>/dev/null)
    PREV_TS=$(git log -1 --pretty=format:'%ct' HEAD~1 2>/dev/null)

    if [ -n "$CURR_TS" ] && [ -n "$PREV_TS" ] && [ "$CURR_TS" -gt "$PREV_TS" ]; then
      DIFF_SEC=$((CURR_TS - PREV_TS))
      # If commit occurred between 2 minutes and 4 hours after previous commit:
      if [ "$DIFF_SEC" -ge 120 ] && [ "$DIFF_SEC" -le 14400 ]; then
        FOCUS_HOURS=$(awk -v s="$DIFF_SEC" 'BEGIN { h = s / 3600; if (h < 0.25) h = 0.25; printf "%.1f", h }' 2>/dev/null || echo "0.5")
      else
        FOCUS_HOURS="0.5" # 30m default focus quantum
      fi
    else
      FOCUS_HOURS="0.5"
    fi
  else
    # Initial commit in repository
    EMPTY_TREE="4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    DIFF_STAT=$(git diff --stat "$EMPTY_TREE" HEAD 2>/dev/null | head -n 30)
    DIFF_SHORT=$(git diff --shortstat "$EMPTY_TREE" HEAD 2>/dev/null)
    FOCUS_HOURS="0.5"
  fi

  # 4. Resolve Webhook URL and User ID
  WEBHOOK_URL=$(git config --get fabric.webhook-url 2>/dev/null)
  if [ -z "$WEBHOOK_URL" ]; then
    WEBHOOK_URL="\${FABRIC_WEBHOOK_URL:-${DEFAULT_WEBHOOK_URL}}"
  fi

  USER_ID=$(git config --get fabric.user-id 2>/dev/null)
  if [ -z "$USER_ID" ]; then
    USER_ID="\${FABRIC_USER_ID:-}"
  fi

  # 5. Build JSON payload safely
  PAYLOAD=""
  if command -v python3 >/dev/null 2>&1; then
    PAYLOAD=$(python3 -c '
import sys, json

payload = {
    "source": "local-git-hook",
    "event": "commit",
    "repository": {
        "name": sys.argv[1],
        "full_name": sys.argv[1]
    },
    "repo": sys.argv[1],
    "branch": sys.argv[2],
    "commit": {
        "id": sys.argv[3],
        "hash": sys.argv[3],
        "author": {
            "name": sys.argv[4],
            "email": sys.argv[5]
        },
        "message": sys.argv[6],
        "timestamp": sys.argv[7]
    },
    "diff": {
        "stat": sys.argv[8],
        "shortstat": sys.argv[9]
    },
    "diffStat": sys.argv[8],
    "focusHours": float(sys.argv[10]),
    "userId": sys.argv[11] if sys.argv[11] else None
}
print(json.dumps(payload))
' "$REPO_NAME" "$BRANCH" "$COMMIT_HASH" "$COMMIT_AUTHOR" "$COMMIT_EMAIL" "$COMMIT_MSG" "$COMMIT_TIME" "$DIFF_STAT" "$DIFF_SHORT" "$FOCUS_HOURS" "$USER_ID" 2>/dev/null)
  elif command -v node >/dev/null 2>&1; then
    PAYLOAD=$(node -e '
const [,, repo, branch, hash, author, email, msg, time, stat, short, hours, user] = process.argv;
const payload = {
  source: "local-git-hook",
  event: "commit",
  repository: { name: repo, full_name: repo },
  repo,
  branch,
  commit: { id: hash, hash, author: { name: author, email }, message: msg, timestamp: time },
  diff: { stat, shortstat: short },
  diffStat: stat,
  focusHours: parseFloat(hours) || 0.5,
  userId: user || undefined
};
console.log(JSON.stringify(payload));
' "$REPO_NAME" "$BRANCH" "$COMMIT_HASH" "$COMMIT_AUTHOR" "$COMMIT_EMAIL" "$COMMIT_MSG" "$COMMIT_TIME" "$DIFF_STAT" "$DIFF_SHORT" "$FOCUS_HOURS" "$USER_ID" 2>/dev/null)
  fi

  # Fallback JSON construction if python3/node not found
  if [ -z "$PAYLOAD" ]; then
    ESC_MSG=$(printf '%s' "$COMMIT_MSG" | head -n 5 | tr '\\n' ' ' | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    ESC_STAT=$(printf '%s' "$DIFF_SHORT" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    PAYLOAD=$(cat <<EOF
{
  "source": "local-git-hook",
  "event": "commit",
  "repository": { "name": "$REPO_NAME", "full_name": "$REPO_NAME" },
  "repo": "$REPO_NAME",
  "branch": "$BRANCH",
  "commit": {
    "id": "$COMMIT_HASH",
    "hash": "$COMMIT_HASH",
    "author": { "name": "$COMMIT_AUTHOR", "email": "$COMMIT_EMAIL" },
    "message": "$ESC_MSG",
    "timestamp": "$COMMIT_TIME"
  },
  "diff": { "stat": "$ESC_STAT", "shortstat": "$ESC_STAT" },
  "diffStat": "$ESC_STAT",
  "focusHours": $FOCUS_HOURS
}
EOF
)
  fi

  # 6. Non-blocking asynchronous HTTP POST to Fabric Webhook
  if command -v curl >/dev/null 2>&1 && [ -n "$PAYLOAD" ]; then
    curl -s -S -X POST \\
      -H "Content-Type: application/json" \\
      -H "X-Fabric-Source: local-git-hook" \\
      -d "$PAYLOAD" \\
      --max-time 8 \\
      "$WEBHOOK_URL" >/dev/null 2>&1
  fi

  # 7. Chain to local repo hook if running as global hooksPath
  LOCAL_HOOK="$REPO_ROOT/.git/hooks/post-commit"
  if [ -f "$LOCAL_HOOK" ] && [ -x "$LOCAL_HOOK" ]; then
    CURRENT_SCRIPT=$(realpath "$0" 2>/dev/null || echo "$0")
    LOCAL_REAL=$(realpath "$LOCAL_HOOK" 2>/dev/null || echo "$LOCAL_HOOK")
    if [ "$CURRENT_SCRIPT" != "$LOCAL_REAL" ]; then
      "$LOCAL_HOOK" "$@" >/dev/null 2>&1 || true
    fi
  fi
) >/dev/null 2>&1 &

exit 0
`;

function runGit(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function testTelemetry(customUrl?: string, customUser?: string) {
  console.log("\n🧪 Testing Fabric Git Telemetry Dispatch...");
  const repoRoot = runGit("rev-parse --show-toplevel") || process.cwd();
  const repoName = repoRoot.split("/").pop() || "fabric";
  const branch = runGit("rev-parse --abbrev-ref HEAD") || "main";
  const commitHash = runGit("rev-parse HEAD") || "0000000";
  const commitMsg = runGit("log -1 --pretty=format:'%s'") || "Manual telemetry test dispatch";
  const commitAuthor = runGit("log -1 --pretty=format:'%an'") || "developer";

  const targetUrl = customUrl || runGit("config --get fabric.webhook-url") || DEFAULT_WEBHOOK_URL;
  const targetUser = customUser || runGit("config --get fabric.user-id") || undefined;

  console.log(`   • Webhook:    ${targetUrl}`);
  console.log(`   • Repository: ${repoName} (${branch})`);
  console.log(`   • Commit:     ${commitHash.substring(0, 7)} — ${commitMsg}`);
  if (targetUser) {
    console.log(`   • User ID:    ${targetUser}`);
  }

  const payload = {
    source: "local-git-hook",
    event: "commit",
    repository: { name: repoName, full_name: repoName },
    repo: repoName,
    branch,
    commit: {
      id: commitHash,
      hash: commitHash,
      author: { name: commitAuthor },
      message: commitMsg,
      timestamp: new Date().toISOString(),
    },
    diff: {
      stat: "1 file changed, 10 insertions(+)",
      shortstat: "1 file changed, 10 insertions(+)",
    },
    diffStat: "1 file changed, 10 insertions(+)",
    focusHours: 0.5,
    userId: targetUser,
  };

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fabric-Source": "local-git-hook",
      },
      body: JSON.stringify(payload),
    });

    const body = await res.text();
    console.log(`\n   • Response Status: ${res.status}`);
    console.log(`   • Response Body:   ${body}`);
    console.log("\n✅ Telemetry test completed! Check Telegram & Firestore for your Builder Trade.");
  } catch (err) {
    console.error("\n❌ Telemetry test failed:", err);
  }
}

function installHookToFile(targetFile: string, description: string) {
  const dir = targetFile.substring(0, targetFile.lastIndexOf("/"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (existsSync(targetFile)) {
    const backupPath = `${targetFile}.backup.${Date.now()}`;
    const existing = readFileSync(targetFile, "utf8");
    writeFileSync(backupPath, existing);
    console.log(`   • Backed up existing hook to: ${backupPath}`);
  }

  writeFileSync(targetFile, POST_COMMIT_HOOK_CONTENT, "utf8");
  chmodSync(targetFile, 0o755);

  console.log(`\n✅ Installed: ${description}`);
  console.log(`   • Path: ${targetFile}`);
}

async function main() {
  const args = process.argv.slice(2);

  console.log("===================================================================");
  console.log("🐙 FABRIC OS — PASSIVE GIT TELEMETRY INSTALLER");
  console.log("===================================================================\n");

  if (args.includes("-h") || args.includes("--help")) {
    console.log("Usage: bun run scripts/install-git-telemetry.ts [options]\n");
    console.log("Options:");
    console.log("  --global          Install globally for ALL repositories on machine (~/.git-hooks)");
    console.log("  --current         Install in current git repository (.git/hooks/post-commit)");
    console.log("  --templates       Install into ~/.git-templates/hooks/post-commit");
    console.log("  --url <url>       Set custom Fabric webhook URL");
    console.log("  --user <id>       Set Telegram user ID for notifications");
    console.log("  --test            Send a verification telemetry payload");
    console.log("  --uninstall       Remove post-commit hook");
    process.exit(0);
  }

  // Parse custom url and user
  let customUrl: string | undefined;
  let customUser: string | undefined;

  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    customUrl = args[urlIdx + 1];
  }

  const userIdx = args.indexOf("--user");
  if (userIdx !== -1 && args[userIdx + 1]) {
    customUser = args[userIdx + 1];
  }

  if (customUrl) {
    runGit(`config --global fabric.webhook-url "${customUrl}"`);
    console.log(`⚙️ Configured Global Webhook URL: ${customUrl}`);
  }

  if (customUser) {
    runGit(`config --global fabric.user-id "${customUser}"`);
    console.log(`⚙️ Configured Global User ID: ${customUser}`);
  }

  if (args.includes("--test")) {
    await testTelemetry(customUrl, customUser);
    process.exit(0);
  }

  if (args.includes("--uninstall")) {
    console.log("🧹 Uninstalling Git Telemetry...");
    const globalHookPath = join(homedir(), ".git-hooks", "post-commit");
    if (existsSync(globalHookPath)) {
      unlinkSync(globalHookPath);
      console.log(`   • Removed ${globalHookPath}`);
    }
    const currentHooksPath = runGit("config --global core.hooksPath");
    if (currentHooksPath) {
      runGit("config --global --unset core.hooksPath");
      console.log("   • Unset git config --global core.hooksPath");
    }

    const repoRoot = runGit("rev-parse --show-toplevel");
    if (repoRoot) {
      const localHook = join(repoRoot, ".git", "hooks", "post-commit");
      if (existsSync(localHook)) {
        unlinkSync(localHook);
        console.log(`   • Removed ${localHook}`);
      }
    }

    console.log("\n✅ Uninstallation complete.");
    process.exit(0);
  }

  let mode = "";
  if (args.includes("--global")) mode = "global";
  else if (args.includes("--current")) mode = "current";
  else if (args.includes("--templates")) mode = "templates";

  if (!mode) {
    console.log("Select an installation mode:");
    console.log("  1) Global   — Captures commits across ALL repositories on this machine (Recommended)");
    console.log("  2) Current  — Install in current git repository only (.git/hooks/post-commit)");
    console.log("  3) Template — Install in ~/.git-templates/hooks/post-commit");
    console.log("  4) Test     — Send a live telemetry test payload");
    console.log("  5) Exit");

    const answer = await promptUser("\nEnter choice [1-5] (default 1): ");
    switch (answer.trim()) {
      case "2":
        mode = "current";
        break;
      case "3":
        mode = "templates";
        break;
      case "4":
        await testTelemetry(customUrl, customUser);
        process.exit(0);
      case "5":
        console.log("Exited without changes.");
        process.exit(0);
      default:
        mode = "global";
        break;
    }
  }

  if (mode === "global") {
    const hooksDir = join(homedir(), ".git-hooks");
    const targetHook = join(hooksDir, "post-commit");
    installHookToFile(targetHook, "Universal Global Git Telemetry");
    runGit(`config --global core.hooksPath "${hooksDir}"`);
    console.log(`   • Configured: git config --global core.hooksPath = "${hooksDir}"`);
    console.log(`   • Scope: ALL Git repositories on this machine!`);
  } else if (mode === "current") {
    const repoRoot = runGit("rev-parse --show-toplevel");
    if (!repoRoot) {
      console.error("❌ Not in a git repository. Use --global for machine-wide setup.");
      process.exit(1);
    }
    const targetHook = join(repoRoot, ".git", "hooks", "post-commit");
    installHookToFile(targetHook, `Local Repository Hook (${repoRoot.split("/").pop()})`);
  } else if (mode === "templates") {
    const templatesDir = join(homedir(), ".git-templates", "hooks");
    const targetHook = join(templatesDir, "post-commit");
    installHookToFile(targetHook, "Git Template Hook");
    runGit(`config --global init.templateDir "${join(homedir(), ".git-templates")}"`);
    console.log(`   • Configured: git config --global init.templateDir`);
  }

  console.log("\n🚀 Git Telemetry is now ACTIVE!");
  console.log("   • Every commit will passively compute diffs, focus time, and log 4F trades.");
  console.log("   • Never blocks your git operations (background execution).");
  console.log(`   • To test now: bun run scripts/install-git-telemetry.ts --test\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
