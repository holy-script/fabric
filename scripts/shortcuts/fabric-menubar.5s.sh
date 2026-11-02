#!/usr/bin/env bash
# <xbar.title>Fabric 4F Dynamic Island</xbar.title>
# <xbar.version>v1.0</xbar.version>
# <xbar.author>Fabric Meta-OS</xbar.author>
# <xbar.desc>Live 4F Vitality & Cognitive State in macOS Menu Bar</xbar.desc>
# <xbar.dependencies>curl,jq</xbar.dependencies>

FABRIC_HOST="${FABRIC_HOST:-https://fabric-one-sage.vercel.app}"
USER_ID="${TELEGRAM_USER_ID:-1131646846}"

STATUS_JSON=$(curl -s --max-time 3 "${FABRIC_HOST}/api/quick?action=status&userId=${USER_ID}" 2>/dev/null)

if [ -z "$STATUS_JSON" ]; then
  echo "⚡ Fabric Offline | color=#71717a"
  echo "---"
  echo "Open Dashboard | href=${FABRIC_HOST}"
  exit 0
fi

SCORE=$(echo "$STATUS_JSON" | grep -o '"vitalityScore":[^,]*' | cut -d: -f2 | tr -d ' "')
FLOW=$(echo "$STATUS_JSON" | grep -o '"tranceState":"[^"]*' | cut -d: -f2 | tr -d ' "')
BATTERY=$(echo "$STATUS_JSON" | grep -o '"batteryLevel":[^,}]*' | cut -d: -f2 | tr -d ' "')

SCORE_VAL=${SCORE:-0}
FLOW_NAME=${FLOW:-Calm}

# Menu Bar Title
echo "⚡ ${SCORE_VAL} • ${FLOW_NAME} | font=JetBrainsMono-Bold size=12 color=#06b6d4 dropdown=false"
echo "---"
echo "🔮 Dynamic Island HUD | href=${FABRIC_HOST}/island font=PlusJakartaSans-Bold"
echo "📊 Cockpit Dashboard | href=${FABRIC_HOST}/dashboard"
echo "📖 Architecture & Explainability | href=${FABRIC_HOST}/docs"
echo "🎓 IITM Quiz 1 Academy | href=${FABRIC_HOST}#iitm-academy"
echo "---"
echo "⚡ Quick Actions | size=11 color=#a1a1aa"
echo "-- 🚀 Spark 90m Focus Sprint | bash='$0' param1='spark' terminal=false refresh=true"
echo "-- 🌙 Settle Session & Evening Log | bash='$0' param1='settle' terminal=false refresh=true"
echo "-- 🔕 Toggle DND & Deep Shield | bash='$0' param1='dnd' terminal=false refresh=true"
echo "---"
echo "🔄 Refresh Fabric State | refresh=true"

# Handle quick action invocations
if [ "$1" = "spark" ]; then
  curl -s -X POST "${FABRIC_HOST}/api/quick?action=spark&userId=${USER_ID}" >/dev/null 2>&1
elif [ "$1" = "settle" ]; then
  curl -s -X POST "${FABRIC_HOST}/api/quick?action=settle&userId=${USER_ID}" >/dev/null 2>&1
elif [ "$1" = "dnd" ]; then
  curl -s -X POST "${FABRIC_HOST}/api/quick?action=dnd&userId=${USER_ID}" >/dev/null 2>&1
fi

