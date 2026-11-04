#!/bin/bash
set -euo pipefail

# Fabric OS — Unified Native macOS Desktop App & Daemon Controller Compiler
# Compiles scripts/shortcuts/FabricNotch.swift into dist/FabricNotch, dist/Fabric,
# dist/FabricNotch.app, and dist/Fabric.app.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SOURCE_FILE="$PROJECT_ROOT/scripts/shortcuts/FabricNotch.swift"
DIST_DIR="$PROJECT_ROOT/dist"
OUTPUT_BIN="$DIST_DIR/FabricNotch"
FABRIC_BIN="$DIST_DIR/Fabric"

echo "⚡ [FabricNotch] Building Unified Native macOS Desktop App & Controller..."
echo "  • Source: $SOURCE_FILE"
echo "  • Primary Binary: $OUTPUT_BIN"
echo "  • Fabric Binary:  $FABRIC_BIN"

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
cp "$OUTPUT_BIN" "$FABRIC_BIN"
chmod +x "$FABRIC_BIN"

END_TIME=$(python3 -c "import time; print(int(time.time() * 1000))")
DURATION=$(( END_TIME - START_TIME ))

echo "✅ [FabricNotch] Compilation succeeded in ${DURATION}ms."
echo "  • Binary size: $(du -h "$OUTPUT_BIN" | cut -f1)"

# Run built-in self-test diagnostics
echo "🧪 [FabricNotch] Running automated diagnostic check..."
"$OUTPUT_BIN" --check

# ============================================================
# Package 1: dist/FabricNotch.app Bundle
# ============================================================
NOTCH_APP_DIR="$DIST_DIR/FabricNotch.app"
NOTCH_CONTENTS="$NOTCH_APP_DIR/Contents"
NOTCH_MACOS="$NOTCH_CONTENTS/MacOS"
NOTCH_RES="$NOTCH_CONTENTS/Resources"

echo "📦 [FabricNotch] Packaging FabricNotch Application Bundle ($NOTCH_APP_DIR)..."
mkdir -p "$NOTCH_MACOS" "$NOTCH_RES"
cp "$OUTPUT_BIN" "$NOTCH_MACOS/FabricNotch"
chmod +x "$NOTCH_MACOS/FabricNotch"
echo "APPL????" > "$NOTCH_CONTENTS/PkgInfo"

cat <<EOF > "$NOTCH_CONTENTS/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>FabricNotch</string>
    <key>CFBundleIdentifier</key>
    <string>com.fabric.notch</string>
    <key>CFBundleName</key>
    <string>Fabric Notch</string>
    <key>CFBundleDisplayName</key>
    <string>Fabric Notch</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
</dict>
</plist>
EOF

# ============================================================
# Package 2: dist/Fabric.app Universal Master Bundle
# ============================================================
FABRIC_APP_DIR="$DIST_DIR/Fabric.app"
FABRIC_CONTENTS="$FABRIC_APP_DIR/Contents"
FABRIC_MACOS="$FABRIC_CONTENTS/MacOS"
FABRIC_RES="$FABRIC_CONTENTS/Resources"

echo "📦 [Fabric] Packaging Fabric Universal Application Bundle ($FABRIC_APP_DIR)..."
mkdir -p "$FABRIC_MACOS" "$FABRIC_RES"
cp "$OUTPUT_BIN" "$FABRIC_MACOS/Fabric"
chmod +x "$FABRIC_MACOS/Fabric"
echo "APPL????" > "$FABRIC_CONTENTS/PkgInfo"

cat <<EOF > "$FABRIC_CONTENTS/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Fabric</string>
    <key>CFBundleIdentifier</key>
    <string>com.fabric.app</string>
    <key>CFBundleName</key>
    <string>Fabric</string>
    <key>CFBundleDisplayName</key>
    <string>Fabric OS</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
</dict>
</plist>
EOF

echo "✨ [FabricNotch] Bundles packaged successfully:"
echo "  • $NOTCH_APP_DIR"
echo "  • $FABRIC_APP_DIR"
echo "🚀 [FabricNotch] Ready! Run 'open $FABRIC_APP_DIR' or '$OUTPUT_BIN' to launch."
