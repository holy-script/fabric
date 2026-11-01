#!/usr/bin/env bash
# ==============================================================================
# The Fabric: 4F Meta-OS — Passive Git Telemetry Hook Installer
#
# Automatically captures architectural achievements & coding focus time upon
# git commit, parses them via Gemini 3.5 Flash, and logs Builder Trades in 4F.
#
# Usage:
#   ./scripts/install-git-hook.sh [options]
#
# Options:
#   --current         Install hook into current git repository (.git/hooks/post-commit) [default]
#   --global          Install globally for ALL repositories on machine via core.hooksPath (~/.git-hooks)
#   --templates       Install into ~/.git-templates/hooks/post-commit and set init.templateDir
#   --url <url>       Configure custom Fabric webhook ingress URL
#   --user <id>       Configure Telegram user ID for telemetry attribution & notifications
#   --test            Send a test telemetry event to webhook without committing
#   --uninstall       Remove hook and reset configuration
#   --help, -h        Show this help message
# ==============================================================================

set -e

# Default Webhook URL
DEFAULT_WEBHOOK_URL="https://fabric-one-sage.vercel.app/api/webhooks/github"

# Text Styling
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ------------------------------------------------------------------------------
# Embedded Post-Commit Hook Template
# ------------------------------------------------------------------------------
generate_hook_script() {
  cat << 'HOOK_EOF'
#!/bin/sh
# ==============================================================================
# The Fabric: 4F Meta-OS — Automated Passive Git Telemetry Hook
# Non-blocking, failsafe background telemetry ingress.
# ==============================================================================

# Ensure no error terminates this script or blocks git
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
    WEBHOOK_URL="${FABRIC_WEBHOOK_URL:-https://fabric-one-sage.vercel.app/api/webhooks/github}"
  fi

  USER_ID=$(git config --get fabric.user-id 2>/dev/null)
  if [ -z "$USER_ID" ]; then
    USER_ID="${FABRIC_USER_ID:-}"
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
    ESC_MSG=$(printf '%s' "$COMMIT_MSG" | head -n 5 | tr '\n' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g')
    ESC_STAT=$(printf '%s' "$DIFF_SHORT" | sed 's/\\/\\\\/g; s/"/\\"/g')
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
    curl -s -S -X POST \
      -H "Content-Type: application/json" \
      -H "X-Fabric-Source: local-git-hook" \
      -d "$PAYLOAD" \
      --max-time 8 \
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

# Post-commit must return 0 immediately so git is never blocked
exit 0
HOOK_EOF
}

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------
print_banner() {
  echo -e "${CYAN}===================================================================${NC}"
  echo -e "${BOLD}🐙 FABRIC OS — PASSIVE GIT TELEMETRY INSTALLER${NC}"
  echo -e "${CYAN}===================================================================${NC}"
}

show_help() {
  print_banner
  echo -e "Usage: ./scripts/install-git-hook.sh [options]\n"
  echo -e "Options:"
  echo -e "  ${GREEN}--current${NC}         Install into current git repository (.git/hooks/post-commit)"
  echo -e "  ${GREEN}--global${NC}          Install globally for ALL repositories on machine (~/.git-hooks)"
  echo -e "  ${GREEN}--templates${NC}       Install into ~/.git-templates/hooks/post-commit (for newly cloned repos)"
  echo -e "  ${GREEN}--url <url>${NC}       Set custom Fabric webhook URL (saved to git config fabric.webhook-url)"
  echo -e "  ${GREEN}--user <id>${NC}       Set Telegram user ID for notifications (saved to git config fabric.user-id)"
  echo -e "  ${GREEN}--test${NC}            Send a test telemetry payload using current HEAD commit"
  echo -e "  ${GREEN}--uninstall${NC}       Remove installed post-commit hook and reset hooksPath"
  echo -e "  ${GREEN}--help, -h${NC}        Show this help message\n"
}

# Check git command existence
if ! command -v git >/dev/null 2>&1; then
  echo -e "${RED}❌ Git is not installed or not in PATH.${NC}"
  exit 1
fi

MODE="current"
CUSTOM_URL=""
CUSTOM_USER=""
DO_TEST=false
DO_UNINSTALL=false

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --current)
      MODE="current"
      shift
      ;;
    --global)
      MODE="global"
      shift
      ;;
    --templates)
      MODE="templates"
      shift
      ;;
    --url)
      CUSTOM_URL="$2"
      shift 2
      ;;
    --user)
      CUSTOM_USER="$2"
      shift 2
      ;;
    --test)
      DO_TEST=true
      shift
      ;;
    --uninstall)
      DO_UNINSTALL=true
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      show_help
      exit 1
      ;;
  esac
done

print_banner

# ------------------------------------------------------------------------------
# Test Telemetry Payload
# ------------------------------------------------------------------------------
if [ "$DO_TEST" = true ]; then
  echo -e "\n🧪 ${BOLD}Testing Fabric Git Telemetry Dispatch...${NC}"
  
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  REPO_NAME=$(basename "$REPO_ROOT")
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "0000000")
  COMMIT_MSG=$(git log -1 --pretty=format:'%s' 2>/dev/null || echo "Test telemetry verification")
  COMMIT_AUTHOR=$(git log -1 --pretty=format:'%an' 2>/dev/null || echo "developer")
  
  TARGET_URL=$(git config --get fabric.webhook-url 2>/dev/null || echo "$DEFAULT_WEBHOOK_URL")
  if [ -n "$CUSTOM_URL" ]; then
    TARGET_URL="$CUSTOM_URL"
  fi
  TARGET_USER=$(git config --get fabric.user-id 2>/dev/null || echo "")
  if [ -n "$CUSTOM_USER" ]; then
    TARGET_USER="$CUSTOM_USER"
  fi

  echo -e "   • Target Webhook: ${BLUE}$TARGET_URL${NC}"
  echo -e "   • Repository:     ${GREEN}$REPO_NAME${NC} (${BRANCH})"
  echo -e "   • Commit:         ${COMMIT_HASH:0:7} — $COMMIT_MSG"
  if [ -n "$TARGET_USER" ]; then
    echo -e "   • User ID:        $TARGET_USER"
  fi

  TEST_PAYLOAD=$(cat <<EOF
{
  "source": "local-git-hook",
  "event": "commit",
  "repository": { "name": "$REPO_NAME", "full_name": "$REPO_NAME" },
  "repo": "$REPO_NAME",
  "branch": "$BRANCH",
  "commit": {
    "id": "$COMMIT_HASH",
    "hash": "$COMMIT_HASH",
    "author": { "name": "$COMMIT_AUTHOR" },
    "message": "$COMMIT_MSG",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  },
  "diff": { "stat": "1 file changed, 10 insertions(+)", "shortstat": "1 file changed, 10 insertions(+)" },
  "diffStat": "1 file changed, 10 insertions(+)",
  "focusHours": 0.5,
  "userId": $([ -n "$TARGET_USER" ] && echo "\"$TARGET_USER\"" || echo "null")
}
EOF
)

  echo -e "   • Sending request..."
  RESPONSE=$(curl -s -S -X POST \
    -H "Content-Type: application/json" \
    -H "X-Fabric-Source: local-git-hook" \
    -d "$TEST_PAYLOAD" \
    --max-time 15 \
    "$TARGET_URL" 2>&1 || true)

  echo -e "   • Response: ${CYAN}$RESPONSE${NC}"
  echo -e "\n${GREEN}✅ Test telemetry completed! Check your Telegram bot and Firestore trades.${NC}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Uninstall Mode
# ------------------------------------------------------------------------------
if [ "$DO_UNINSTALL" = true ]; then
  echo -e "\n🧹 ${YELLOW}Uninstalling Fabric Git Telemetry...${NC}"
  
  if [ "$MODE" = "global" ]; then
    HOOK_DIR="$HOME/.git-hooks"
    if [ -f "$HOOK_DIR/post-commit" ]; then
      rm -f "$HOOK_DIR/post-commit"
      echo -e "   • Removed $HOOK_DIR/post-commit"
    fi
    CURRENT_HOOKS_PATH=$(git config --global core.hooksPath 2>/dev/null || echo "")
    if [ "$CURRENT_HOOKS_PATH" = "$HOOK_DIR" ]; then
      git config --global --unset core.hooksPath
      echo -e "   • Reset git config --global core.hooksPath"
    fi
  else
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
    if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/.git/hooks/post-commit" ]; then
      rm -f "$REPO_ROOT/.git/hooks/post-commit"
      echo -e "   • Removed $REPO_ROOT/.git/hooks/post-commit"
    fi
  fi

  echo -e "\n${GREEN}✅ Uninstall complete.${NC}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Configuration Settings (URL & User ID)
# ------------------------------------------------------------------------------
if [ -n "$CUSTOM_URL" ]; then
  if [ "$MODE" = "global" ]; then
    git config --global fabric.webhook-url "$CUSTOM_URL"
  else
    git config fabric.webhook-url "$CUSTOM_URL"
  fi
  echo -e "⚙️  Configured Webhook URL: ${BLUE}$CUSTOM_URL${NC}"
fi

if [ -n "$CUSTOM_USER" ]; then
  if [ "$MODE" = "global" ]; then
    git config --global fabric.user-id "$CUSTOM_USER"
  else
    git config fabric.user-id "$CUSTOM_USER"
  fi
  echo -e "⚙️  Configured User ID: ${BLUE}$CUSTOM_USER${NC}"
fi

# ------------------------------------------------------------------------------
# Installation Targets
# ------------------------------------------------------------------------------
case "$MODE" in
  current)
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
    if [ -z "$REPO_ROOT" ]; then
      echo -e "${RED}❌ Current directory is not a git repository.${NC}"
      echo -e "   Navigate to a git repo, or use ${YELLOW}--global${NC} to install machine-wide."
      exit 1
    fi

    HOOKS_DIR="$REPO_ROOT/.git/hooks"
    mkdir -p "$HOOKS_DIR"
    TARGET_HOOK="$HOOKS_DIR/post-commit"

    if [ -f "$TARGET_HOOK" ]; then
      BACKUP_HOOK="$TARGET_HOOK.fabric-backup.$(date +%s)"
      cp "$TARGET_HOOK" "$BACKUP_HOOK"
      echo -e "   • Backed up existing hook to: $BACKUP_HOOK"
    fi

    generate_hook_script > "$TARGET_HOOK"
    chmod +x "$TARGET_HOOK"

    echo -e "\n${GREEN}✅ Successfully installed post-commit telemetry hook in current repository!${NC}"
    echo -e "   • Path:   ${CYAN}$TARGET_HOOK${NC}"
    echo -e "   • Repo:   ${BOLD}$(basename "$REPO_ROOT")${NC}"
    echo -e "   • Status: Active upon next git commit"
    ;;

  global)
    HOOKS_DIR="$HOME/.git-hooks"
    mkdir -p "$HOOKS_DIR"
    TARGET_HOOK="$HOOKS_DIR/post-commit"

    if [ -f "$TARGET_HOOK" ]; then
      BACKUP_HOOK="$TARGET_HOOK.fabric-backup.$(date +%s)"
      cp "$TARGET_HOOK" "$BACKUP_HOOK"
      echo -e "   • Backed up existing global hook to: $BACKUP_HOOK"
    fi

    generate_hook_script > "$TARGET_HOOK"
    chmod +x "$TARGET_HOOK"

    git config --global core.hooksPath "$HOOKS_DIR"

    echo -e "\n${GREEN}🚀 Successfully installed UNIVERSAL global Git Telemetry!${NC}"
    echo -e "   • Hook File:      ${CYAN}$TARGET_HOOK${NC}"
    echo -e "   • Git Config:     ${BOLD}core.hooksPath = $HOOKS_DIR${NC}"
    echo -e "   • Scope:          ${BOLD}Every Git repository on this machine!${NC}"
    echo -e "   • Non-blocking:   Zero delays to git commits (background dispatch)"
    ;;

  templates)
    TEMPLATES_DIR="$HOME/.git-templates/hooks"
    mkdir -p "$TEMPLATES_DIR"
    TARGET_HOOK="$TEMPLATES_DIR/post-commit"

    generate_hook_script > "$TARGET_HOOK"
    chmod +x "$TARGET_HOOK"

    git config --global init.templateDir "$HOME/.git-templates"

    echo -e "\n${GREEN}✅ Successfully installed template Git hook!${NC}"
    echo -e "   • Path:       ${CYAN}$TARGET_HOOK${NC}"
    echo -e "   • Git Config: ${BOLD}init.templateDir = $HOME/.git-templates${NC}"
    echo -e "   • Scope:      Automatically copied into newly initialized or cloned repositories"
    ;;
esac

echo -e "\n💡 ${BOLD}Quick Tip:${NC} Run ${CYAN}./scripts/install-git-hook.sh --test${NC} to verify your live connection.\n"
