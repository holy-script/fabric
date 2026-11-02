#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fabric Spark
# @raycast.mode compact
# @raycast.packageName Fabric OS

# Optional parameters:
# @raycast.icon ⚡
# @raycast.argument1 { "type": "text", "placeholder": "Task (e.g. Deep Work on API)", "optional": false }
# @raycast.argument2 { "type": "text", "placeholder": "Duration hours/mins (e.g. 1.5, 90m)", "optional": true }

# Documentation:
# @raycast.description Spark an uninterrupted flow session in Fabric OS
# @raycast.author Fabric OS
# @raycast.authorURL https://github.com/holyscript/fabric

FABRIC_URL="${FABRIC_API_URL:-http://localhost:3000}"
TASK="$1"
DURATION="${2:-1.0}"

if [ -z "$TASK" ]; then
  echo "⚠️ Error: Please specify a task description."
  exit 1
fi

PAYLOAD=$(cat <<EOF
{
  "action": "spark",
  "task": "$TASK",
  "duration": "$DURATION"
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
    echo "⚡ Sparked: $TASK ($DURATION)"
  fi
else
  echo "❌ Failed ($HTTP_CODE): $BODY"
  exit 1
fi
