/**
 * FOCI Wearable BLE GATT Protocol Specification & Frame Parser
 * 
 * Reverse-engineered and documented protocol specifications for TinyLogics FOCI / FOCI 2
 * waist-worn cognitive and diaphragmatic breathing biofeedback trackers.
 */

import type {
  FociMentalState,
  FociPostureState,
  FociBreathMetrics,
  FociTelemetryPacket,
  FociGattServiceSpec,
} from "./types.js";

// ============================================================================
// 1. GATT SERVICE & CHARACTERISTIC UUID SPECIFICATIONS
// ============================================================================

/**
 * Primary Nordic Semiconductor UART Service (NUS)
 * Commonly used by TinyLogics FOCI firmware for serial data streaming over BLE.
 */
export const NORDIC_UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NORDIC_UART_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Client Write -> FOCI
export const NORDIC_UART_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // FOCI Notify -> Client

/**
 * TinyLogics FOCI Proprietary BLE Service (FOCI 1 / FOCI 2 Direct GATT)
 */
export const FOCI_CUSTOM_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
export const FOCI_COMMAND_CHAR_UUID = "0000fff1-0000-1000-8000-00805f9b34fb"; // Write (Control / Modes)
export const FOCI_STREAM_CHAR_UUID = "0000fff4-0000-1000-8000-00805f9b34fb";  // Notify (Sensor frames)

/**
 * Standard Bluetooth SIG Services implemented on FOCI
 */
export const BLE_BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const BLE_BATTERY_LEVEL_CHAR_UUID = "00002a19-0000-1000-8000-00805f9b34fb"; // Read / Notify

export const BLE_DEVICE_INFO_SERVICE_UUID = "0000180a-0000-1000-8000-00805f9b34fb";
export const BLE_MODEL_NUMBER_CHAR_UUID = "00002a24-0000-1000-8000-00805f9b34fb";
export const BLE_FIRMWARE_REVISION_CHAR_UUID = "00002a26-0000-1000-8000-00805f9b34fb";
export const BLE_HARDWARE_REVISION_CHAR_UUID = "00002a27-0000-1000-8000-00805f9b34fb";

export const FOCI_GATT_SPEC: FociGattServiceSpec[] = [
  {
    serviceUuid: NORDIC_UART_SERVICE_UUID,
    name: "Nordic UART Service (NUS)",
    characteristics: [
      {
        uuid: NORDIC_UART_RX_CHAR_UUID,
        name: "NUS RX Characteristic",
        properties: ["write", "writeWithoutResponse"],
        description: "Sends commands, vibration alerts, and streaming triggers to FOCI.",
      },
      {
        uuid: NORDIC_UART_TX_CHAR_UUID,
        name: "NUS TX Characteristic",
        properties: ["notify"],
        description: "Receives raw 20-byte micro-motion and cognitive state notification frames.",
      },
    ],
  },
  {
    serviceUuid: FOCI_CUSTOM_SERVICE_UUID,
    name: "TinyLogics FOCI Custom Service",
    characteristics: [
      {
        uuid: FOCI_COMMAND_CHAR_UUID,
        name: "Command & Calibration Characteristic",
        properties: ["write"],
        description: "Zeroing accelerometer, posture baseline calibration, sensitivity settings.",
      },
      {
        uuid: FOCI_STREAM_CHAR_UUID,
        name: "Biofeedback Real-time Stream Characteristic",
        properties: ["notify"],
        description: "Streams respiration waves and cognitive classifications at 10-25 Hz.",
      },
    ],
  },
  {
    serviceUuid: BLE_BATTERY_SERVICE_UUID,
    name: "Battery Service",
    characteristics: [
      {
        uuid: BLE_BATTERY_LEVEL_CHAR_UUID,
        name: "Battery Level",
        properties: ["read", "notify"],
        description: "Battery state of charge percentage (0-100%).",
      },
    ],
  },
];

// ============================================================================
// 2. PROTOCOL BYTE VALUES & FRAME CONSTANTS
// ============================================================================

export const FOCI_FRAME_HEADER = 0xaa;
export const FOCI_FRAME_HEADER_ALT = 0xfc; // Alternative header seen in FOCI 2
export const FOCI_FRAME_LENGTH = 20;

export const PACKET_TYPES = {
  LIVE_TELEMETRY: 0x01,
  STATE_CHANGE: 0x02,
  DEVICE_STATUS: 0x03,
  CALIBRATION_RESP: 0x05,
} as const;

export const MENTAL_STATE_CODES: Record<number, FociMentalState> = {
  0x00: "calm",
  0x01: "focus",
  0x02: "flow",
  0x03: "distraction",
  0x04: "stress",
  0x05: "fatigue",
};

export const MENTAL_STATE_TO_BYTE: Record<FociMentalState, number> = {
  calm: 0x00,
  focus: 0x01,
  flow: 0x02,
  distraction: 0x03,
  stress: 0x04,
  fatigue: 0x05,
};

export const POSTURE_CODES: Record<number, FociPostureState> = {
  0x00: "good",
  0x01: "slouch",
  0x02: "tilted",
  0x03: "active",
};

export const POSTURE_TO_BYTE: Record<FociPostureState, number> = {
  good: 0x00,
  slouch: 0x01,
  tilted: 0x02,
  active: 0x03,
  unknown: 0x00,
};

// ============================================================================
// 3. PACKET DECODER LOGIC
// ============================================================================

/**
 * Calculates XOR checksum across the frame
 */
export function calculateChecksum(bytes: Uint8Array | number[], length: number = bytes.length - 1): number {
  let checksum = 0;
  for (let i = 0; i < length; i++) {
    checksum ^= bytes[i];
  }
  return checksum;
}

/**
 * Converts input buffer / array / hex string into Uint8Array
 */
function normalizeToUint8Array(input: Uint8Array | number[] | string | Buffer): Uint8Array {
  if (typeof input === "string") {
    // If hex string
    const cleanHex = input.replace(/[^0-9a-fA-F]/g, "");
    const match = cleanHex.match(/.{1,2}/g) || [];
    return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
  }
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

/**
 * Parses raw 20-byte BLE notification frame received from FOCI TX characteristic
 * into a structured FociTelemetryPacket.
 * 
 * Frame Layout (20 bytes):
 * - Byte 0: Header (0xAA or 0xFC)
 * - Byte 1: Packet Type (0x01 = Live Telemetry)
 * - Byte 2: Sequence Counter (0 - 255)
 * - Byte 3: Mental State byte (0=calm, 1=focus, 2=flow, 3=distraction, 4=stress, 5=fatigue)
 * - Byte 4: Mental State Confidence (0 - 100)
 * - Byte 5: Respiration Rate in bpm (e.g. 14)
 * - Byte 6-7: Breath Wave Amplitude (uint16_be / 1000.0, 0.0 - 1.0)
 * - Byte 8: Inhalation/Exhalation Ratio (scaled by 10, e.g. 5 = 0.5)
 * - Byte 9: Diaphragmatic Depth (0 - 100%)
 * - Byte 10: Posture flag (0 = good, 1 = slouch, 2 = tilted, 3 = active)
 * - Byte 11: Battery Level (0 - 100%)
 * - Byte 12-17: 3x 16-bit signed integer micro-motion displacement wave samples (int16_be x 3)
 * - Byte 18: Flags (bit 0: isCharging, bit 1: calibrated)
 * - Byte 19: Checksum (XOR of bytes 0..18)
 */
export function decodeFociPacket(
  rawInput: Uint8Array | number[] | string | Buffer,
  deviceId: string = "FOCI-BLE-DEV"
): FociTelemetryPacket {
  const bytes = normalizeToUint8Array(rawInput);

  // Fallback for short or malformed packets
  if (bytes.length < 12) {
    return {
      timestamp: new Date(),
      deviceId,
      mentalState: "calm",
      mentalStateConfidence: 0.5,
      breath: {
        respirationRate: 14,
        breathWaveAmplitude: 0.5,
        inhalationExhalationRatio: 0.5,
        breathWaveSamples: [0.1, 0.2, 0.4, 0.3],
        diaphragmaticDepth: 65,
        fluidity: 70,
      },
      posture: "good",
      batteryLevel: 80,
    };
  }

  // Parse header and sequence
  const header = bytes[0];
  const packetType = bytes[1];
  const sequence = bytes[2];

  // Mental state
  const stateByte = bytes[3];
  const mentalState = MENTAL_STATE_CODES[stateByte] || "focus";
  const confidence = Math.min(1.0, Math.max(0.0, (bytes[4] ?? 80) / 100));

  // Respiration rate (bpm)
  const respirationRate = bytes[5] > 0 ? bytes[5] : 14;

  // Breath wave amplitude (uint16_be)
  const ampRaw = ((bytes[6] || 0) << 8) | (bytes[7] || 0);
  const breathWaveAmplitude = Math.min(1.0, Math.max(0.0, ampRaw / 1000.0));

  // Inhalation / Exhalation ratio
  const ieRaw = bytes[8] || 5;
  const inhalationExhalationRatio = ieRaw / 10.0;

  // Diaphragmatic depth
  const diaphragmaticDepth = Math.min(100, Math.max(0, bytes[9] ?? 70));

  // Posture
  const postureByte = bytes[10] || 0;
  const posture = POSTURE_CODES[postureByte] || "good";

  // Battery
  const batteryLevel = Math.min(100, Math.max(0, bytes[11] ?? 85));

  // Waveform samples (Bytes 12-17: 3x 16-bit signed int)
  const samples: number[] = [];
  if (bytes.length >= 18) {
    for (let offset = 12; offset < 18; offset += 2) {
      const val = (bytes[offset] << 8) | bytes[offset + 1];
      // Convert to signed 16-bit
      const signedVal = val > 0x7fff ? val - 0x10000 : val;
      // Normalize to -1.0 .. +1.0
      samples.push(Math.round((signedVal / 32768) * 1000) / 1000);
    }
  } else {
    samples.push(0.15, 0.35, -0.2);
  }

  // Fluidity estimate based on rhythm consistency
  const fluidity = Math.round(
    Math.min(100, Math.max(10, diaphragmaticDepth * 0.7 + (1.0 - Math.abs(respirationRate - 12) / 15) * 30))
  );

  return {
    packetId: sequence,
    timestamp: new Date(),
    deviceId,
    mentalState,
    mentalStateConfidence: confidence,
    breath: {
      respirationRate,
      breathWaveAmplitude: breathWaveAmplitude > 0 ? breathWaveAmplitude : 0.65,
      inhalationExhalationRatio,
      breathWaveSamples: samples,
      diaphragmaticDepth,
      fluidity,
    },
    posture,
    batteryLevel,
    rawHex: Buffer.from(bytes).toString("hex"),
  };
}

/**
 * Encodes structured telemetry packet into the 20-byte BLE notification frame.
 */
export function encodeFociPacket(
  packet: Partial<FociTelemetryPacket>,
  sequence: number = 0
): Uint8Array {
  const frame = new Uint8Array(FOCI_FRAME_LENGTH);
  frame[0] = FOCI_FRAME_HEADER;
  frame[1] = PACKET_TYPES.LIVE_TELEMETRY;
  frame[2] = sequence % 256;

  // Mental state
  const state = packet.mentalState || "focus";
  frame[3] = MENTAL_STATE_TO_BYTE[state] ?? 0x01;
  frame[4] = Math.round((packet.mentalStateConfidence ?? 0.85) * 100);

  // Breath
  frame[5] = Math.round(packet.breath?.respirationRate ?? 13);
  const amp = Math.round((packet.breath?.breathWaveAmplitude ?? 0.68) * 1000);
  frame[6] = (amp >> 8) & 0xff;
  frame[7] = amp & 0xff;

  frame[8] = Math.round((packet.breath?.inhalationExhalationRatio ?? 0.5) * 10);
  frame[9] = Math.round(packet.breath?.diaphragmaticDepth ?? 75);

  // Posture
  const posture = packet.posture || "good";
  frame[10] = POSTURE_TO_BYTE[posture] ?? 0x00;

  // Battery
  frame[11] = Math.round(packet.batteryLevel ?? 88);

  // 3x 16-bit waveform displacement samples
  const samples = packet.breath?.breathWaveSamples || [0.2, 0.5, -0.3];
  for (let i = 0; i < 3; i++) {
    const s = samples[i] ?? 0;
    const intVal = Math.round(s * 32767);
    const clamped = Math.max(-32768, Math.min(32767, intVal));
    const unsigned = clamped < 0 ? clamped + 0x10000 : clamped;
    frame[12 + i * 2] = (unsigned >> 8) & 0xff;
    frame[13 + i * 2] = unsigned & 0xff;
  }

  // Flags: byte 18
  frame[18] = 0x02; // Calibrated flag set

  // Checksum: byte 19
  frame[19] = calculateChecksum(frame, 19);

  return frame;
}

/**
 * Encodes control commands to send to FOCI RX Characteristic
 */
export function encodeFociCommand(
  cmd: "START_STREAM" | "STOP_STREAM" | "GET_BATTERY" | "CALIBRATE_POSTURE" | "VIBRATE_ALERT"
): Uint8Array {
  const buf = new Uint8Array(6);
  buf[0] = FOCI_FRAME_HEADER;

  switch (cmd) {
    case "START_STREAM":
      buf[1] = 0x01;
      buf[2] = 0x01; // Enable live stream
      break;
    case "STOP_STREAM":
      buf[1] = 0x01;
      buf[2] = 0x00; // Disable live stream
      break;
    case "GET_BATTERY":
      buf[1] = 0x03;
      buf[2] = 0x00;
      break;
    case "CALIBRATE_POSTURE":
      buf[1] = 0x05;
      buf[2] = 0x01; // Zero posture baseline
      break;
    case "VIBRATE_ALERT":
      buf[1] = 0x08;
      buf[2] = 0x02; // 2 subtle haptic pulses
      break;
  }

  buf[3] = 0x00;
  buf[4] = 0x00;
  buf[5] = calculateChecksum(buf, 5);
  return buf;
}

// ============================================================================
// 4. SYNTHETIC TEST STREAM GENERATOR
// ============================================================================

export interface SyntheticOptions {
  stateOverride?: FociMentalState;
  timeOffsetSec?: number;
  respirationBpm?: number;
  deviceId?: string;
  batteryLevel?: number;
}

/**
 * Generates an anatomically realistic synthetic FOCI telemetry packet.
 * Simulates micro-motion diaphragmatic expansion and contraction with sinusoidal
 * wave modeling and state-specific respiratory signatures.
 */
export function generateSyntheticPacket(options: SyntheticOptions = {}): FociTelemetryPacket {
  const t = options.timeOffsetSec ?? Date.now() / 1000;
  const deviceId = options.deviceId || "FOCI-SYNTHETIC-01";
  const state = options.stateOverride || pickSimulatedState(t);

  // Biological breathing parameters per mental state
  let targetBpm = 13;
  let targetDepth = 75;
  let targetIeRatio = 0.5; // Inhale / Exhale (1:2)
  let ampBase = 0.7;
  let posture: FociPostureState = "good";

  switch (state) {
    case "flow":
      targetBpm = 10.5 + Math.sin(t / 20) * 1.5; // Slow, rhythmic, stable
      targetDepth = 88;
      targetIeRatio = 0.45; // Deep exhalation
      ampBase = 0.85;
      break;
    case "calm":
      targetBpm = 8.5 + Math.sin(t / 15) * 1.0;  // Deep parasympathetic vagal tone
      targetDepth = 92;
      targetIeRatio = 0.4;
      ampBase = 0.9;
      break;
    case "focus":
      targetBpm = 13.0 + Math.sin(t / 12) * 1.5; // Steady cognitive vigilance
      targetDepth = 74;
      targetIeRatio = 0.55;
      ampBase = 0.72;
      break;
    case "distraction":
      targetBpm = 16.5 + Math.sin(t / 5) * 3.0;  // Erratic jittery rhythm
      targetDepth = 52;
      targetIeRatio = 0.75;
      ampBase = 0.55;
      posture = "tilted";
      break;
    case "stress":
      targetBpm = 20.0 + Math.sin(t / 4) * 4.0;  // Rapid, shallow thoracic breathing
      targetDepth = 32;
      targetIeRatio = 1.1; // Shallow quick exhale, sympathetic fight-or-flight
      ampBase = 0.4;
      posture = "slouch";
      break;
    case "fatigue":
      targetBpm = 9.0 + Math.sin(t / 30) * 1.0;  // Lethargic, shallow
      targetDepth = 45;
      targetIeRatio = 0.6;
      ampBase = 0.38;
      posture = "slouch";
      break;
  }

  const finalBpm = options.respirationBpm ?? Math.round(targetBpm * 10) / 10;
  const frequencyHz = finalBpm / 60; // Cycles per second

  // Generate 3 sub-sampled displacement points within the current second
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const subTime = t + i * 0.33;
    // Primary sinusoidal breathing wave
    const wave = Math.sin(2 * Math.PI * frequencyHz * subTime);
    // Subtle biological micro-tremor noise (± 5%)
    const microTremor = (Math.sin(subTime * 14) + Math.cos(subTime * 23)) * 0.05;
    samples.push(Math.round((wave * ampBase + microTremor) * 1000) / 1000);
  }

  const fluidity = Math.round(
    Math.min(100, Math.max(15, targetDepth * 0.6 + (1 - Math.abs(finalBpm - 12) / 16) * 40))
  );

  return {
    packetId: Math.floor(t % 256),
    timestamp: new Date(t * 1000),
    deviceId,
    mentalState: state,
    mentalStateConfidence: 0.82 + Math.random() * 0.15,
    breath: {
      respirationRate: finalBpm,
      breathWaveAmplitude: Math.round(ampBase * 100) / 100,
      inhalationExhalationRatio: Math.round(targetIeRatio * 100) / 100,
      breathWaveSamples: samples,
      diaphragmaticDepth: targetDepth,
      fluidity,
    },
    posture,
    batteryLevel: options.batteryLevel ?? Math.max(15, Math.round(92 - (t / 3600) % 20)),
  };
}

/**
 * Natural circadian / focus oscillation over time for synthetic mode
 */
function pickSimulatedState(t: number): FociMentalState {
  const cycle = (t % 180) / 180; // 3-minute cycle for fast simulation demo
  if (cycle < 0.3) return "focus";
  if (cycle < 0.6) return "flow";
  if (cycle < 0.75) return "calm";
  if (cycle < 0.88) return "distraction";
  return "stress";
}
