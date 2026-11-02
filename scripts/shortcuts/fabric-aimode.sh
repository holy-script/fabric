#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fabric AI Mode
# @raycast.mode fullOutput
# @raycast.packageName Fabric OS

# Optional parameters:
# @raycast.icon 🌐
# @raycast.argument1 { "type": "text", "placeholder": "Research query...", "optional": false }

# Documentation:
# @raycast.description Run an autonomous Google AI Mode research query via Fabric OS
# @raycast.author Fabric OS
# @raycast.authorURL https://github.com/holyscript/fabric

FABRIC_URL="${FABRIC_API_URL:-http://localhost:3000}"
QUERY="$1"

if [ -z "$QUERY" ]; then
  echo "⚠️ Error: Please specify a research query."
  exit 1
fi

PAYLOAD=$(cat <<EOF
{
  "action": "aimode",
  "query": "$QUERY"
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
    MD=$(echo "$BODY" | jq -r '.result.markdown // .message')
    ENGINE=$(echo "$BODY" | jq -r '.result.engineUsed // "ai"')
    echo "# 🌐 Fabric AI Mode: $QUERY"
    echo "Engine: $ENGINE"
    echo ""
    echo "$MD"
    echo ""
    echo "## Citations:"
    echo "$BODY" | jq -r '.result.citations[]? | "- [" + .title + "](" + .url + ")"' 2>/dev/null
  else
    echo "$BODY"
  fi
else
  echo "❌ AI Mode Failed ($HTTP_CODE): $BODY"
  exit 1
fi
