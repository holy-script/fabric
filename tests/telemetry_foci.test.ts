import { describe, test, expect } from "bun:test";
import {
  decodeFociPacket,
  encodeFociPacket,
  generateSyntheticPacket,
} from "../src/integrations/foci/protocol.js";
import { calculateRecoveryScore, calculateVitalityScale } from "../src/services/wearables.js";

describe("Hardware Telemetry & Wearables QC Suite", () => {
  test("synthetic FOCI packet matches binary encoding and decoding roundtrip", () => {
    const syn = generateSyntheticPacket({
      stateOverride: "flow",
      respirationBpm: 12.0,
    });

    expect(syn.mentalState).toBe("flow");
    expect(syn.breath.respirationRate).toBe(12.0);

    const binaryFrame = encodeFociPacket(syn, 99);
    expect(binaryFrame.length).toBe(20);

    const decoded = decodeFociPacket(binaryFrame, "FOCI-TEST-DEVICE");
    expect(decoded.packetId).toBe(99);
    expect(decoded.mentalState).toBe("flow");
    expect(Math.abs(decoded.breath.respirationRate - 12.0)).toBeLessThanOrEqual(1.0);
  });

  test("calculateRecoveryScore produces clinical composite weighting", () => {
    // Optimal recovery case
    const optimal = calculateRecoveryScore({
      restingHeartRate: 54,
      hrvMs: 85,
      sleepHours: 8.0,
      sleepEfficiency: 92,
    });

    expect(optimal).toBeGreaterThanOrEqual(80);
    expect(optimal).toBeLessThanOrEqual(100);

    // Strained case
    const strained = calculateRecoveryScore({
      restingHeartRate: 78,
      hrvMs: 32,
      sleepHours: 4.5,
      sleepEfficiency: 68,
    });

    expect(strained).toBeLessThan(65);
    expect(strained).toBeGreaterThanOrEqual(0);
  });

  test("calculateVitalityScale maps recovery correctly to -5 to +5 Aristotelian Mean", () => {
    const peakScale = calculateVitalityScale(95, 8.5);
    expect(peakScale).toBeGreaterThanOrEqual(2);
    expect(peakScale).toBeLessThanOrEqual(5);

    const lowScale = calculateVitalityScale(35, 4.0);
    expect(lowScale).toBeLessThanOrEqual(-2);
    expect(lowScale).toBeGreaterThanOrEqual(-5);
  });
});

