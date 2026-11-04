#!/bin/bash
set -euo pipefail

# Fabric OS — Native macOS Floating Notch Panel Compiler
# Compiles scripts/shortcuts/FabricNotch.swift into dist/FabricNotch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SOURCE_FILE="$PROJECT_ROOT/scripts/shortcuts/FabricNotch.swift"
DIST_DIR="$PROJECT_ROOT/dist"
OUTPUT_BIN="$DIST_DIR/FabricNotch"

echo "⚡ [FabricNotch] Building Native macOS Floating Notch Panel..."
echo "  • Source: $SOURCE_FILE"
echo "  • Output: $OUTPUT_BIN"

mkdir -p "$DIST_DIR"

# Detect macOS SDK
SDK_PATH="$(xcrun --show-sdk-path 2>/dev/null || true)"
SDK_FLAG=""
if [ -n "$SDK_PATH" ]; then
  SDK_FLAG="-sdk $SDK_PATH"
fi

# Detect Target Architecture
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  TARGET="arm64-apple-macos13.0"
else
  TARGET="x86_64-apple-macos13.0"
fi

START_TIME=$(python3 -c "import time; print(int(time.time() * 1000))")

# Compile using swiftc with optimization
swiftc -O \
  -target "$TARGET" \
  $SDK_FLAG \
  -parse-as-library \
  "$SOURCE_FILE" \
  -o "$OUTPUT_BIN"

chmod +x "$OUTPUT_BIN"

END_TIME=$(python3 -c "import time; print(int(time.time() * 1000))")
DURATION=$(( END_TIME - START_TIME ))

echo "✅ [FabricNotch] Compilation succeeded in ${DURATION}ms."
echo "  • Binary size: $(du -h "$OUTPUT_BIN" | cut -f1)"

# Run built-in self-test diagnostics
echo "🧪 [FabricNotch] Running automated diagnostic check..."
"$OUTPUT_BIN" --check

echo "🚀 [FabricNotch] Ready! Run '$OUTPUT_BIN' to launch native floating notch HUD."
