#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fabric Insomnia (Closed-Lid)
# @raycast.mode compact
# @raycast.packageName Fabric OS

# Optional parameters:
# @raycast.icon 🌙
# @raycast.argument1 { "type": "dropdown", "placeholder": "Action", "optional": true, "data": [{"title": "Toggle", "value": "--toggle"}, {"title": "Start", "value": "--start"}, {"title": "Stop", "value": "--stop"}, {"title": "Status", "value": "--status"}, {"title": "Safety Check", "value": "--check"}] }

# Documentation:
# @raycast.description Closed-lid power governor and caffeinate sleep assertion manager
# @raycast.author Fabric OS
# @raycast.authorURL https://github.com/holyscript/fabric

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSOMNIA_TS="$PROJECT_ROOT/scripts/fabric-insomnia.ts"

# Resolve bun or node binary
BUN_BIN=""
if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [ -f "$HOME/.bun/bin/bun" ]; then
  BUN_BIN="$HOME/.bun/bin/bun"
elif [ -f "/opt/homebrew/bin/bun" ]; then
  BUN_BIN="/opt/homebrew/bin/bun"
elif [ -f "/usr/local/bin/bun" ]; then
  BUN_BIN="/usr/local/bin/bun"
elif command -v node >/dev/null 2>&1; then
  BUN_BIN="$(command -v node)"
else
  echo "❌ Error: Neither bun nor node was found in PATH."
  exit 1
fi

ACTION="${1:---toggle}"

cd "$PROJECT_ROOT" || exit 1
exec "$BUN_BIN" run "$INSOMNIA_TS" "$ACTION" "${@:2}"
