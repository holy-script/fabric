#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fabric Status Pulse
# @raycast.mode inline
# @raycast.packageName Fabric OS
# @raycast.refreshTime 1m

# Optional parameters:
# @raycast.icon 💓

# Documentation:
# @raycast.description Instant one-line system pulse and 4F telemetry HUD
# @raycast.author Fabric OS
# @raycast.authorURL https://github.com/holyscript/fabric

FABRIC_URL="${FABRIC_API_URL:-http://localhost:3000}"

PULSE=$(curl -s "$FABRIC_URL/api/quick?action=status&format=text" 2>/dev/null)

if [ -n "$PULSE" ]; then
  echo "$PULSE"
else
  echo "⚠️ Fabric OS offline"
fi
