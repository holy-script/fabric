#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fabric Settle
# @raycast.mode compact
# @raycast.packageName Fabric OS

# Optional parameters:
# @raycast.icon 🏁
# @raycast.argument1 { "type": "text", "placeholder": "Energy Delta (-5 to +5, e.g. 2)", "optional": true }
# @raycast.argument2 { "type": "text", "placeholder": "Facts Yield / Outcome Summary", "optional": true }

# Documentation:
# @raycast.description Settle the active focus block and record 4F telemetry
# @raycast.author Fabric OS
# @raycast.authorURL https://github.com/holyscript/fabric

FABRIC_URL="${FABRIC_API_URL:-http://localhost:3000}"
ENERGY="${1:-0}"
FACTS="${2:-Completed focused execution block}"

PAYLOAD=$(cat <<EOF
{
  "action": "settle",
  "energyDelta": $ENERGY,
  "factsYield": "$FACTS"
}
EOF
)

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$FABRIC_URL/api/quick" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$PAYLOAD" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  if command -v jq >/dev/null 2>&1; then
    MSG=$(echo "$BODY" | jq -r '.message // .status')
    echo "$MSG"
  else
    echo "🏁 Settled focus session (Energy: $ENERGY)"
  fi
else
  echo "❌ Settle Failed ($HTTP_CODE): $BODY"
  exit 1
fi
