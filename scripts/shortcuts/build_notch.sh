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

# Package into macOS .app bundle
APP_DIR="$DIST_DIR/FabricNotch.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "📦 [FabricNotch] Packaging macOS Application Bundle ($APP_DIR)..."
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# Copy binary to bundle
cp "$OUTPUT_BIN" "$MACOS_DIR/FabricNotch"
chmod +x "$MACOS_DIR/FabricNotch"

# Generate PkgInfo
echo "APPL????" > "$CONTENTS_DIR/PkgInfo"

# Generate Info.plist
cat <<EOF > "$CONTENTS_DIR/Info.plist"
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

echo "✨ [FabricNotch] Application bundle packaged successfully at $APP_DIR."
echo "🚀 [FabricNotch] Ready! Run 'open $APP_DIR' or '$OUTPUT_BIN' to launch native floating notch HUD."
