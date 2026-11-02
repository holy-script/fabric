#!/usr/bin/env python3
"""
FOCI Wearable BLE Bridge & Telemetry Forwarder
Part of The Fabric: 4F Meta-OS (Personal Telemetry & Biometrics Engine)

Connects to TinyLogics FOCI / FOCI 2 over Bluetooth Low Energy (BLE),
decodes 20-byte micro-motion diaphragmatic breathing & cognitive state packets,
and posts real-time telemetry to Fabric's health webhook.

Usage:
  # Scan for nearby BLE devices:
  python3 scripts/foci-ble-bridge.py --scan

  # Connect to discovered FOCI device & stream:
  python3 scripts/foci-ble-bridge.py

  # Connect to specific device MAC/UUID:
  python3 scripts/foci-ble-bridge.py --device "XX:XX:XX:XX:XX:XX"

  # Run in synthetic simulation mode (no hardware required):
  python3 scripts/foci-ble-bridge.py --synthetic
"""

import sys
import os
import time
import math
import json
import argparse
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

# HTTP client fallback: requests or urllib.request
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error

# BLE library: bleak
try:
    from bleak import BleakScanner, BleakClient
    from bleak.backends.characteristic import BleakGATTCharacteristic
    HAS_BLEAK = True
except ImportError:
    HAS_BLEAK = False
    BleakScanner = None
    BleakClient = None
    BleakGATTCharacteristic = Any

# ============================================================================
# PROTOCOL CONSTANTS & UUIDs
# ============================================================================

NORDIC_UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NORDIC_UART_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e" # Write
NORDIC_UART_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e" # Notify

FOCI_CUSTOM_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"
FOCI_STREAM_CHAR_UUID    = "0000fff4-0000-1000-8000-00805f9b34fb" # Notify
FOCI_COMMAND_CHAR_UUID   = "0000fff1-0000-1000-8000-00805f9b34fb" # Write

FOCI_NOTIFY_UUIDS = [
    NORDIC_UART_TX_CHAR_UUID.lower(),
    FOCI_STREAM_CHAR_UUID.lower(),
]

MENTAL_STATES = {
    0x00: "calm",
    0x01: "focus",
    0x02: "flow",
    0x03: "distraction",
    0x04: "stress",
    0x05: "fatigue",
}

STATE_EMOJIS = {
    "flow": "🌊",
    "focus": "🎯",
    "calm": "🧘",
    "distraction": "🌀",
    "stress": "🔥",
    "fatigue": "💤",
}

POSTURE_STATES = {
    0x00: "good",
    0x01: "slouch",
    0x02: "tilted",
    0x03: "active",
}

# Terminal ANSI colors
C_RESET  = "\033[0m"
C_BOLD   = "\033[1m"
C_CYAN   = "\033[36m"
C_GREEN  = "\033[32m"
C_YELLOW = "\033[33m"
C_RED    = "\033[31m"
C_BLUE   = "\033[34m"
C_MAGENTA= "\033[35m"

# ============================================================================
# PACKET DECODING LOGIC
# ============================================================================

def decode_foci_frame(data: bytes, device_id: str = "FOCI-BLE") -> Dict[str, Any]:
    """
    Decodes the 20-byte FOCI notification frame into structured telemetry.
    """
    if len(data) < 12:
        return {
            "deviceId": device_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mentalState": "focus",
            "mentalStateConfidence": 0.5,
            "breath": {
                "respirationRate": 14.0,
                "breathWaveAmplitude": 0.5,
                "inhalationExhalationRatio": 0.5,
                "breathWaveSamples": [0.1, 0.2, 0.3],
                "diaphragmaticDepth": 60,
                "fluidity": 65,
            },
            "posture": "good",
            "batteryLevel": 85,
            "rawHex": data.hex(),
        }

    header = data[0]
    packet_type = data[1]
    sequence = data[2]

    # Cognitive mental state
    state_byte = data[3]
    mental_state = MENTAL_STATES.get(state_byte, "focus")
    confidence = min(1.0, max(0.0, data[4] / 100.0 if len(data) > 4 else 0.8))

    # Breath metrics
    respiration_rate = float(data[5]) if data[5] > 0 else 14.0

    amp_raw = (data[6] << 8) | data[7] if len(data) > 7 else 500
    amplitude = min(1.0, max(0.0, amp_raw / 1000.0))

    ie_ratio = (data[8] / 10.0) if len(data) > 8 else 0.5
    depth = int(data[9]) if len(data) > 9 else 70

    posture_byte = data[10] if len(data) > 10 else 0
    posture = POSTURE_STATES.get(posture_byte, "good")

    battery = int(data[11]) if len(data) > 11 else 88

    # Waveform samples (Bytes 12-17: 3x 16-bit signed ints)
    samples = []
    if len(data) >= 18:
        for offset in range(12, 18, 2):
            raw_val = (data[offset] << 8) | data[offset + 1]
            signed_val = raw_val - 0x10000 if raw_val > 0x7FFF else raw_val
            samples.append(round(signed_val / 32768.0, 3))
    else:
        samples = [0.2, 0.4, -0.3]

    fluidity = round(min(100, max(10, depth * 0.7 + (1.0 - abs(respiration_rate - 12) / 15) * 30)))

    return {
        "packetId": sequence,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "deviceId": device_id,
        "mentalState": mental_state,
        "mentalStateConfidence": confidence,
        "breath": {
            "respirationRate": respiration_rate,
            "breathWaveAmplitude": amplitude if amplitude > 0 else 0.65,
            "inhalationExhalationRatio": ie_ratio,
            "breathWaveSamples": samples,
            "diaphragmaticDepth": depth,
            "fluidity": fluidity,
        },
        "posture": posture,
        "batteryLevel": battery,
        "rawHex": data.hex(),
    }

# ============================================================================
# HTTP WEBHOOK DISPATCHER
# ============================================================================

def send_telemetry_webhook(webhook_url: str, payload: Dict[str, Any], token: Optional[str] = None) -> bool:
    """
    Sends the decoded FOCI telemetry payload to Fabric's health webhook.
    """
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Fabric-FOCI-BLE-Bridge/1.0",
    }
    if token:
        headers["x-fabric-token"] = token
        headers["Authorization"] = f"Bearer {token}"

    data_bytes = json.dumps(payload).encode("utf-8")

    if HAS_REQUESTS:
        try:
            resp = requests.post(webhook_url, json=payload, headers=headers, timeout=4.0)
            return resp.status_code in [200, 201, 202]
        except Exception:
            return False
    else:
        try:
            req = urllib.request.Request(webhook_url, data=data_bytes, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                return resp.status in [200, 201, 202]
        except Exception:
            return False

# ============================================================================
# TERMINAL VISUAL HUD
# ============================================================================

def render_ascii_waveform(samples: List[float], width: int = 12) -> str:
    """Draws a mini ASCII breath waveform."""
    chars = [" ", " ", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
    res = ""
    for s in samples:
        idx = int((s + 1.0) / 2.0 * (len(chars) - 1))
        idx = max(0, min(len(chars) - 1, idx))
        res += chars[idx]
    return res

def print_telemetry_hud(packet: Dict[str, Any], webhook_ok: bool):
    st = packet["mentalState"]
    emoji = STATE_EMOJIS.get(st, "🎯")
    bpm = packet["breath"]["respirationRate"]
    depth = packet["breath"]["diaphragmaticDepth"]
    ie = packet["breath"]["inhalationExhalationRatio"]
    posture = packet.get("posture", "good")
    bat = packet.get("batteryLevel", 90)
    samples = packet["breath"].get("breathWaveSamples", [0.0])
    wave_str = render_ascii_waveform(samples)

    wh_tag = f"{C_GREEN}[200 OK]{C_RESET}" if webhook_ok else f"{C_RED}[SYNC ERR]{C_RESET}"

    color = C_GREEN if st in ["flow", "calm"] else (C_CYAN if st == "focus" else C_YELLOW if st == "distraction" else C_RED)

    out = (
        f"{C_BOLD}{color}{emoji} {st.upper():<11}{C_RESET} | "
        f"🌬️ {bpm:>4.1f} bpm | "
        f"Depth: {depth:>2}% | "
        f"I:E: {ie:.1f} | "
        f"Wave: [{wave_str}] | "
        f"Posture: {posture:<6} | "
        f"🔋 {bat}% | "
        f"{wh_tag}"
    )
    print(out)

# ============================================================================
# BLE DEVICE DISCOVERY & SCANNER
# ============================================================================

async def scan_ble_devices(timeout: float = 6.0):
    if not HAS_BLEAK:
        print(f"{C_RED}❌ Error: 'bleak' library is not installed.{C_RESET}")
        print("Please run: pip install bleak requests")
        sys.exit(1)

    print(f"\n{C_CYAN}🔍 Scanning for nearby BLE devices ({timeout}s)...{C_RESET}")
    devices = await BleakScanner.discover(timeout=timeout)

    foci_candidates = []
    print(f"\nFound {len(devices)} active BLE device(s):")
    print("-" * 65)
    for d in devices:
        name = d.name or "Unknown"
        is_foci = "foci" in name.lower() or "tinylogics" in name.lower()
        star = "🌟 [FOCI DETECTED]" if is_foci else ""
        if is_foci:
            foci_candidates.append(d)
        print(f" • {d.address:<38} | {name:<20} {star}")
    print("-" * 65)

    if foci_candidates:
        print(f"{C_GREEN}✅ Detected {len(foci_candidates)} FOCI device candidate(s).{C_RESET}")
    else:
        print(f"{C_YELLOW}ℹ️ No device explicitly named 'FOCI' was discovered.{C_RESET}")
        print("Tip: Make sure FOCI is charged, awake (clip it or tap it), and not paired with phone app.")

# ============================================================================
# BLE STREAMING ENGINE
# ============================================================================

class FociBleBridge:
    def __init__(self, target_address: Optional[str], webhook_url: str, token: Optional[str], user_id: str):
        self.target_address = target_address
        self.webhook_url = webhook_url
        self.token = token
        self.user_id = user_id
        self.client: Optional[BleakClient] = None
        self.is_running = True
        self.notify_char: Optional[BleakGATTCharacteristic] = None

    def on_notification(self, char: BleakGATTCharacteristic, data: bytearray):
        try:
            packet = decode_foci_frame(bytes(data), device_id=self.target_address or "FOCI-BLE")
            packet["userId"] = self.user_id
            packet["source"] = "foci"

            ok = send_telemetry_webhook(self.webhook_url, packet, self.token)
            print_telemetry_hud(packet, ok)
        except Exception as e:
            print(f"{C_RED}Frame decode error:{C_RESET} {e}")

    async def find_foci_device(self) -> Optional[str]:
        if self.target_address:
            return self.target_address

        print(f"{C_CYAN}🔍 Auto-scanning for FOCI wearable...{C_RESET}")
        devices = await BleakScanner.discover(timeout=5.0)
        for d in devices:
            name = (d.name or "").lower()
            if "foci" in name or "tinylogics" in name:
                print(f"{C_GREEN}🎯 Located FOCI device: {d.name} ({d.address}){C_RESET}")
                return d.address
        return None

    async def connect_and_listen(self):
        backoff = 2
        while self.is_running:
            address = await self.find_foci_device()
            if not address:
                print(f"{C_YELLOW}⏳ FOCI not found. Retrying in {backoff}s...{C_RESET}")
                await asyncio.sleep(backoff)
                backoff = min(30, backoff * 1.5)
                continue

            print(f"{C_CYAN}🔗 Connecting to BLE Device: {address}...{C_RESET}")
            try:
                def disconnected_callback(client):
                    print(f"\n{C_RED}⚠️ FOCI Disconnected! Attempting auto-reconnect...{C_RESET}")

                async with BleakClient(address, disconnected_callback=disconnected_callback) as client:
                    self.client = client
                    backoff = 2
                    print(f"{C_GREEN}✅ Connected to FOCI over BLE! Inspecting GATT services...{C_RESET}")

                    # Locate notification characteristic
                    target_char_uuid = None
                    for service in client.services:
                        for char in service.characteristics:
                            char_uuid = str(char.uuid).lower()
                            if char_uuid in FOCI_NOTIFY_UUIDS or "notify" in char.properties:
                                target_char_uuid = char.uuid
                                break
                        if target_char_uuid:
                            break

                    if not target_char_uuid:
                        target_char_uuid = NORDIC_UART_TX_CHAR_UUID

                    print(f"{C_CYAN}📡 Subscribing to GATT Notify Characteristic: {target_char_uuid}{C_RESET}")
                    await client.start_notify(target_char_uuid, self.on_notification)

                    # Send start streaming command if RX char available
                    for service in client.services:
                        for char in service.characteristics:
                            if str(char.uuid).lower() in [NORDIC_UART_RX_CHAR_UUID.lower(), FOCI_COMMAND_CHAR_UUID.lower()]:
                                start_cmd = bytes([0xAA, 0x01, 0x01, 0x00, 0x00, 0xAB])
                                try:
                                    await client.write_gatt_char(char.uuid, start_cmd)
                                    print(f"{C_GREEN}🚀 Sent stream enable command to FOCI.{C_RESET}")
                                except Exception:
                                    pass

                    print(f"\n{C_BOLD}🟢 FOCI TELEMETRY LIVE INGRESS ACTIVE{C_RESET}")
                    print(f"Streaming to: {self.webhook_url}\n")

                    while client.is_connected and self.is_running:
                        await asyncio.sleep(1.0)

            except Exception as e:
                print(f"{C_YELLOW}⚠️ Connection failed: {e}. Retrying in {backoff}s...{C_RESET}")
                await asyncio.sleep(backoff)
                backoff = min(30, backoff * 1.5)

# ============================================================================
# SYNTHETIC TEST SIMULATOR
# ============================================================================

async def run_synthetic_simulation(webhook_url: str, token: Optional[str], user_id: str, interval: float = 1.0):
    print(f"\n{C_BOLD}{C_CYAN}🧪 STARTING FOCI SYNTHETIC TELEMETRY GENERATOR{C_RESET}")
    print(f"Target Webhook: {webhook_url}")
    print(f"Target User ID: {user_id}")
    print(f"Interval:       {interval}s\n")
    print(f"{C_BOLD}{'STATE':<13} | {'RESPIRATION':<12} | {'DEPTH':<9} | {'I:E':<7} | {'WAVEFORM':<14} | {'POSTURE':<10} | {'BATTERY':<5} | {'WEBHOOK'}{C_RESET}")
    print("-" * 95)

    states = ["focus", "flow", "calm", "distraction", "stress", "fatigue"]
    state_durations = [30, 25, 20, 15, 12, 10]
    state_idx = 0
    state_timer = 0
    t = 0.0

    while True:
        current_state = states[state_idx]
        state_timer += interval
        if state_timer >= state_durations[state_idx]:
            state_timer = 0
            state_idx = (state_idx + 1) % len(states)

        # Biological simulation parameters
        bpm = 13.0
        depth = 75
        ie = 0.5
        amp = 0.7
        posture = "good"

        if current_state == "flow":
            bpm = 10.8 + math.sin(t / 8.0) * 1.2
            depth = 88
            ie = 0.45
            amp = 0.85
        elif current_state == "calm":
            bpm = 8.5 + math.sin(t / 10.0) * 0.8
            depth = 92
            ie = 0.4
            amp = 0.9
        elif current_state == "focus":
            bpm = 13.2 + math.sin(t / 6.0) * 1.0
            depth = 74
            ie = 0.55
            amp = 0.75
        elif current_state == "distraction":
            bpm = 16.5 + math.sin(t / 3.0) * 2.5
            depth = 52
            ie = 0.75
            amp = 0.5
            posture = "tilted"
        elif current_state == "stress":
            bpm = 21.0 + math.sin(t / 2.0) * 3.5
            depth = 30
            ie = 1.1
            amp = 0.35
            posture = "slouch"
        elif current_state == "fatigue":
            bpm = 9.2 + math.sin(t / 15.0) * 0.6
            depth = 44
            ie = 0.6
            amp = 0.38
            posture = "slouch"

        freq = bpm / 60.0
        samples = [
            round(math.sin(2 * math.pi * freq * (t + i * 0.33)) * amp, 3)
            for i in range(3)
        ]

        packet = {
            "packetId": int(t) % 256,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "deviceId": "FOCI-SYNTHETIC-SIM",
            "userId": user_id,
            "source": "foci",
            "mentalState": current_state,
            "mentalStateConfidence": round(0.85 + (math.sin(t) * 0.1), 2),
            "breath": {
                "respirationRate": round(bpm, 1),
                "breathWaveAmplitude": round(amp, 2),
                "inhalationExhalationRatio": round(ie, 2),
                "breathWaveSamples": samples,
                "diaphragmaticDepth": depth,
                "fluidity": round(min(100, max(15, depth * 0.6 + (1 - abs(bpm - 12) / 16) * 40))),
            },
            "posture": posture,
            "batteryLevel": max(15, 94 - int((t / 120.0) % 20)),
        }

        ok = send_telemetry_webhook(webhook_url, packet, token)
        print_telemetry_hud(packet, ok)

        t += interval
        await asyncio.sleep(interval)

# ============================================================================
# MAIN ENTRYPOINT
# ============================================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="TinyLogics FOCI Wearable BLE Bridge for The Fabric (4F Meta-OS)"
    )
    parser.add_argument("--scan", action="store_true", help="Scan and list nearby BLE devices, then exit")
    parser.add_argument("--device", type=str, default=None, help="Target device MAC address or UUID")
    parser.add_argument(
        "--webhook",
        type=str,
        default=os.environ.get("FABRIC_WEBHOOK_URL", "http://localhost:3000/api/webhooks/health?source=foci"),
        help="Target Fabric Health webhook endpoint",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=os.environ.get("FABRIC_TOKEN", os.environ.get("FABRIC_WEBHOOK_SECRET", None)),
        help="Optional Fabric authorization token",
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default=os.environ.get("TELEGRAM_USER_ID", "1131646846"),
        help="Target Fabric Telegram User ID",
    )
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Run simulated FOCI breathing stream without requiring physical hardware",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Telemetry packet interval in seconds (default: 1.0s)",
    )
    return parser.parse_args()

def main():
    args = parse_args()

    if args.scan:
        asyncio.run(scan_ble_devices())
        return

    if args.synthetic:
        try:
            asyncio.run(run_synthetic_simulation(args.webhook, args.token, args.user_id, args.interval))
        except KeyboardInterrupt:
            print("\nStopped synthetic simulation.")
        return

    if not HAS_BLEAK:
        print(f"{C_RED}❌ Error: 'bleak' is required for BLE bridge mode.{C_RESET}")
        print("Run: pip install bleak requests")
        print("\nOr test with synthetic simulation: python3 scripts/foci-ble-bridge.py --synthetic")
        sys.exit(1)

    bridge = FociBleBridge(args.device, args.webhook, args.token, args.user_id)
    try:
        asyncio.run(bridge.connect_and_listen())
    except KeyboardInterrupt:
        print(f"\n{C_YELLOW}Shutting down FOCI BLE Bridge.{C_RESET}")

if __name__ == "__main__":
    main()
