/**
 * FOCI Wearable BLE Integration - Core Types & Telemetry Data Structures
 * 
 * FOCI (by TinyLogics) is a waist-worn clip wearable that uses micro-motion
 * accelerometer sensors to track diaphragmatic breathing, posture, and
 * cognitive mental states: Focus, Calm, Distraction, Stress, Flow, Fatigue.
 */

export type FociMentalState =
  | "focus"
  | "calm"
  | "distraction"
  | "stress"
  | "flow"
  | "fatigue";

export type FociPostureState =
  | "good"
  | "slouch"
  | "tilted"
  | "active"
  | "unknown";

export interface FociBreathMetrics {
  /** Respiration rate in breaths per minute (typically 6 - 25 bpm) */
  respirationRate: number;
  /** Breath wave peak-to-trough amplitude (0.0 to 1.0 normalized) */
  breathWaveAmplitude: number;
  /** Inhalation to exhalation duration ratio (e.g. 0.5 = 1:2 diaphragmatic pattern) */
  inhalationExhalationRatio: number;
  /** Sub-sampled raw micro-motion accelerometer wave samples (e.g. 10 Hz) */
  breathWaveSamples: number[];
  /** Estimated diaphragmatic movement depth percentage (0 - 100%) */
  diaphragmaticDepth: number;
  /** Rhythm smoothness index / heart-breath coherence (0 - 100%) */
  fluidity: number;
}

export interface FociDeviceStatus {
  deviceId: string;
  deviceName: string;
  batteryLevel: number; // 0 - 100%
  isCharging: boolean;
  isConnected: boolean;
  firmwareVersion?: string;
  rssi?: number;
  lastSeen: Date | string;
}

export interface FociTelemetryPacket {
  packetId?: number;
  timestamp: Date | string | number;
  deviceId: string;
  mentalState: FociMentalState;
  /** Confidence score between 0.0 and 1.0 */
  mentalStateConfidence: number;
  breath: FociBreathMetrics;
  posture?: FociPostureState;
  batteryLevel?: number;
  rawHex?: string;
}

export interface FociFocusBlock {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  dominantState: FociMentalState;
  /** Percentage of time spent in each mental state (0 - 100) */
  stateBreakdown: Record<FociMentalState, number>;
  averageRespirationRate: number;
  calmScore: number; // 0 - 100
  focusScore: number; // 0 - 100
  stressAlertTriggered: boolean;
  vitalityImpact: number;
  energyDelta: number;
  sampleCount: number;
}

export interface FociAlertPayload {
  userId: string;
  deviceId: string;
  timestamp: Date;
  alertType: "prolonged_stress" | "prolonged_distraction" | "posture_warning";
  durationMinutes: number;
  currentRespirationRate: number;
  message: string;
  prescribedReset: string;
}

export interface FociGattServiceSpec {
  serviceUuid: string;
  name: string;
  characteristics: {
    uuid: string;
    name: string;
    properties: ("read" | "write" | "writeWithoutResponse" | "notify" | "indicate")[];
    description: string;
  }[];
}
