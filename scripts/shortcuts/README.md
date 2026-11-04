# Fabric OS — Smart Surface & Quick Action Guide

The Fabric OS Quick Action API (`/api/quick`) provides an ultra-low latency, unified dispatch gateway for external smart surfaces: **Apple Shortcuts**, **Raycast**, **Elgato Stream Deck**, **iPad Action Buttons**, **macOS Daemons**, and **Terminal Scripts**.

---

## ⚡ 1. API Endpoints Overview

- **Base URL:** `http://localhost:3000/api/quick` (or your deployed Vercel domain)
- **Supported Methods:** `GET`, `POST`
- **Supported Actions:**
  - `spark`: Start an uninterrupted focus session block.
  - `settle`: Conclude active session, compute duration, and log 4F trade.
  - `task`: Compile a natural language goal into an HTN DAG plan and launch execution.
  - `aimode`: Query autonomous Google AI Mode intelligence synthesis with citations.
  - `dnd`: Trigger Android Do-Not-Disturb / Zen Mode via ADB.
  - `ambient`: Ingest real-time macOS daemon context (frontmost app, idle time, biometrics).
  - `status`: Return instant one-line system pulse (`format=text` or JSON).

---

## 🍎 2. Apple Shortcuts Import Guide

You can create these 4 core Apple Shortcuts on your Mac, iPhone, or iPad:

### Shortcut 1: "Fabric Spark" ⚡
1. Open the **Shortcuts** app and create a new Shortcut named `Fabric Spark`.
2. Add action: **Ask for Input**
   - Question: `What are you focusing on?`
   - Input Type: `Text`
   - Default: `Deep Work on Architecture`
3. Add action: **Ask for Input**
   - Question: `Planned duration (hours or mins)?`
   - Input Type: `Text`
   - Default: `1.5`
4. Add action: **Get Contents of URL**
   - URL: `http://localhost:3000/api/quick`
   - Method: `POST`
   - Headers:
     - `Content-Type`: `application/json`
   - Request Body: `JSON`
     - Key `action` (Text): `spark`
     - Key `task` (Text): `Provided Input (from Step 2)`
     - Key `duration` (Text): `Provided Input (from Step 3)`
5. Add action: **Get Dictionary Value**
   - Key: `message`
6. Add action: **Show Notification** / **Show Result**:
   - Title: `Fabric OS ⚡`
   - Body: `Dictionary Value`
7. *(Optional)* Assign to **Action Button** (iPhone 15/16 Pro), **Lock Screen Widget**, or **Menu Bar**.

---

### Shortcut 2: "Fabric Settle" 🏁
1. Create a new Shortcut named `Fabric Settle`.
2. Add action: **Choose from Menu** (`Energy Delta`):
   - `+3 (Surging)`
   - `+2 (High Energy)`
   - `+1 (Slight Boost)`
   - `0 (Neutral)`
   - `-1 (Mild Fatigue)`
   - `-2 (Exhausted)`
3. Add action: **Ask for Input**
   - Question: `What facts did you acquire or build?`
   - Input Type: `Text`
4. Add action: **Get Contents of URL**
   - URL: `http://localhost:3000/api/quick`
   - Method: `POST`
   - Request Body: `JSON`
     - `action`: `settle`
     - `energyDelta`: `(Menu selection number)`
     - `factsYield`: `(Step 3 text)`
5. Add action: **Show Notification** displaying `message`.

---

### Shortcut 3: "Fabric Pulse" 💓
1. Create a new Shortcut named `Fabric Pulse`.
2. Add action: **Get Contents of URL**
   - URL: `http://localhost:3000/api/quick?action=status&format=text`
   - Method: `GET`
3. Add action: **Show Notification** / **Show Alert**:
   - Title: `Fabric Pulse`
   - Message: `Contents of URL`

---

### Shortcut 4: "Fabric AI Mode" 🌐
1. Create a new Shortcut named `Fabric AI Mode`.
2. Add action: **Ask for Input**
   - Question: `Research query for AI Mode?`
3. Add action: **Get Contents of URL**
   - URL: `http://localhost:3000/api/quick`
   - Method: `POST`
   - Request Body: `JSON`
     - `action`: `aimode`
     - `query`: `Provided Input`
4. Add action: **Quick Look** on the returned markdown synthesis.

---

## 🚀 3. Raycast Script Commands

The scripts in this directory are standard Raycast Script Commands:

1. Open **Raycast Settings** (`Cmd + ,`).
2. Go to **Extensions** → **Script Commands**.
3. Click **Add Script Directory** and select:
   `/Users/holyscript/Desktop/projects/fabric/scripts/shortcuts`
4. The following commands will immediately appear in Raycast:
   - `Fabric Spark` (⚡) — Prompts for task and duration, then sparks flow block.
   - `Fabric Settle` (🏁) — Prompts for energy delta and facts yield, settles session.
   - `Fabric AI Mode` (🌐) — Runs autonomous Google AI Mode research with rich output.
   - `Fabric Status Pulse` (💓) — Menubar/inline widget showing active task, focus hours, and biometrics.

---

## 🎛️ 4. Elgato Stream Deck / iPad Buttons

- **Key 1 (Spark 90m):**
  - Action: **System → Open Website** or **HTTP Request**
  - URL: `http://localhost:3000/api/quick?action=spark&task=Deep+Work&duration=1.5`
- **Key 2 (Settle +2):**
  - URL: `http://localhost:3000/api/quick?action=settle&energyDelta=2&factsYield=Completed+block`
- **Key 3 (DND Toggle):**
  - URL: `http://localhost:3000/api/quick?action=dnd&enabled=true`
- **Key 4 (Pulse HUD):**
  - URL: `http://localhost:3000/api/quick?action=status&format=text`

---

## 🖥️ 5. macOS Ambient Daemon Ingestion

A lightweight background daemon (launchd / cron) can stream ambient context directly to Fabric OS:

```bash
#!/bin/bash
# Sample macOS ambient collector
FRONT_APP=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)
WINDOW_TITLE=$(osascript -e 'tell application "System Events" to tell (process 1 where frontmost is true) to get name of window 1' 2>/dev/null)
IDLE_TIME=$(ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000000); exit}')

curl -s -X POST http://localhost:3000/api/quick \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"ambient\",
    \"data\": {
      \"frontmostApp\": \"$FRONT_APP\",
      \"activeWindowTitle\": \"$WINDOW_TITLE\",
      \"idleSeconds\": $IDLE_TIME
    }
  }" > /dev/null
```

---

## 💻 6. Unified Native macOS Desktop App & Daemon Controller (`Fabric.app` & `FabricNotch.app`)

Fabric OS includes a native Swift AppKit + SwiftUI desktop application and HUD floating directly at the MacBook camera notch:

- **Source:** [`scripts/shortcuts/FabricNotch.swift`](file:///Users/holyscript/Desktop/projects/fabric/scripts/shortcuts/FabricNotch.swift)
- **Compiler:** [`scripts/shortcuts/build_notch.sh`](file:///Users/holyscript/Desktop/projects/fabric/scripts/shortcuts/build_notch.sh)
- **Application Bundles:** `dist/Fabric.app` and `dist/FabricNotch.app`
- **Binaries:** `dist/Fabric` and `dist/FabricNotch`
- **QC Test Suite:** [`tests/notch.test.ts`](file:///Users/holyscript/Desktop/projects/fabric/tests/notch.test.ts)

### Architecture & Capabilities
- **Floating Camera Bezel HUD:** Borderless panel configured with `.statusBar` level and `.canJoinAllSpaces` / `.fullScreenAuxiliary`, maintaining persistent visibility across all macOS spaces and full-screen apps without an intrusive browser window.
- **Dark OLED Glassmorphism:** Continuous corner radius with deep dark blur, edge glow, and spring physics.
- **Biometric Respiration Wave:** Fluid sine wave animated in real-time via `TimelineView` reflecting FOCI diaphragmatic respiration rate and coherence.
- **Dedicated Process & Daemon Controller:**
  - **4 Monitored Background Workers:**
    1. `macOS Ambient Daemon` (Active app, idle HID & git context)
    2. `Telegram Video Vault Archiver` (Tor SOCKS5 media digestion)
    3. `Insomnia Power Governor` (Closed-lid caffeinate sleep sentinel)
    4. `Cybernetic Governor` (Aristotelian 4F homeostasis & breach interventions)
  - **Live Status & PID Detection:** Displays real-time status (`🟢 Running` with PID, `⚪ Stopped`, `🔴 Error`/Alert).
  - **1-Click Start / Stop:** Individual controls for each daemon.
  - **Prominent 'Force Quit All Daemons':** Immediate child process and daemon cleanup with zero terminal fiddling.
  - **Native macOS Notification Toasts:** Dispatched via `UserNotifications` whenever daemons change state or when cybernetic governor alerts trigger.
  - **Clean App Menu & Context Menu:** Includes a clean `Quit Fabric & Stop All Daemons` (`Cmd+Q`) option.

### Compilation & Launch
```bash
# 1. Compile native binaries & package both .app bundles
./scripts/shortcuts/build_notch.sh

# 2. Run diagnostic QC self-test check (8 assertions)
./dist/Fabric --check

# 3. Query live background daemon status from CLI
./dist/Fabric --daemons

# 4. Dry-run force-quit simulation
./dist/Fabric --force-quit --dry-run

# 5. Launch native application
open dist/Fabric.app
# or
./dist/Fabric
```

---

## 🌙 7. Fabric Insomnia & Closed-Lid Power Governor (`fabric-insomnia.sh`)

Safely run overnight background AI agents (Tor video archiver, HTN swarms, ambient watchers) with MacBook lid closed:

- **Source Daemon:** [`scripts/fabric-insomnia.ts`](file:///Users/holyscript/Desktop/projects/fabric/scripts/fabric-insomnia.ts)
- **Shell / Raycast Launcher:** [`scripts/shortcuts/fabric-insomnia.sh`](file:///Users/holyscript/Desktop/projects/fabric/scripts/shortcuts/fabric-insomnia.sh)
- **Unit Test Suite:** [`tests/insomnia.test.ts`](file:///Users/holyscript/Desktop/projects/fabric/tests/insomnia.test.ts)

### Commands & Options
```bash
# Toggle sleep lock ON / OFF
./scripts/shortcuts/fabric-insomnia.sh --toggle

# Check hardware battery and thermal safety governor
./scripts/shortcuts/fabric-insomnia.sh --check

# View live insomnia status & power telemetry
./scripts/shortcuts/fabric-insomnia.sh --status

# Start background insomnia daemon with specific reason
./scripts/shortcuts/fabric-insomnia.sh --start --reason "Overnight HTN Swarm Execution"

# Stop insomnia daemon and release sleep lock
./scripts/shortcuts/fabric-insomnia.sh --stop
```

### Safety Features
- **Strict Battery Guard:** Auto-releases sleep lock if DC battery drops below 20%.
- **Thermal Governor:** Auto-releases sleep lock if thermal throttling is detected (`pmset -g therm`).
- **Live Blackboard Integration:** Updates `.ambient_state.json` with active status, activating the `🌙 INSOMNIA` badge on Dynamic Island and `FabricNotch`.


