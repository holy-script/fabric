#!/usr/bin/env bash
# Fabric OS — Launch Research Chrome with CDP Debugging
# Opens Chrome with remote debugging enabled on port 9222 and navigation to Gemini.
# Allows local Fabric OS agents and Deep Research adapters to attach seamlessly.

PORT=9222
PROFILE_DIR="${HOME}/.fabric/browser_profile"
mkdir -p "${PROFILE_DIR}"

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -f "${CHROME_APP}" ]; then
  echo "❌ Google Chrome not found at ${CHROME_APP}"
  exit 1
fi

echo "🚀 Launching Google Chrome for Fabric Research..."
echo "  • Debugging Port: ${PORT}"
echo "  • Profile Dir:    ${PROFILE_DIR}"
echo "  • URL:            https://gemini.google.com"

"${CHROME_APP}" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  "https://gemini.google.com" &

echo "✅ Chrome launched! Please log in to your Google Account once if prompted."

