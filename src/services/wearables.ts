import admin from "firebase-admin";
import { biometricsCollection, userStatesCollection } from "../db/firestore.js";

export type WearableSource =
  | "apple_health"
  | "whoop"
  | "garmin"
  | "zepp"
  | "oura"
  | "generic"
  | string;

export interface HeartRateTelemetry {
  resting?: number;
  current?: number;
  max?: number;
  min?: number;
  avg?: number;
}

export interface HrvTelemetry {
  value: number; // in milliseconds
  metric: "rMSSD" | "SDNN";
}

export interface SleepTelemetry {
  totalHours: number;
  deepSleepHours?: number;
  remSleepHours?: number;
  lightSleepHours?: number;
  awakeHours?: number;
  efficiencyPercent?: number; // 0 to 100
  bedtime?: string;
  wakeTime?: string;
}

export interface RecoveryTelemetry {
  score: number; // 0 to 100
  strain?: number; // e.g. Whoop strain 0-21 or activity load
  readinessCategory?: "peak" | "optimal" | "recovering" | "strained";
}

export interface EnergyTelemetry {
  activeCalories?: number; // kcal
  totalCalories?: number; // kcal
  stepCount?: number;
}

export interface DeviceMetadata {
  name?: string;
  manufacturer?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
}

export interface BiometricSnapshot {
  id?: string;
  userId: string;
  timestamp: Date;
  date: string; // YYYY-MM-DD
  source: WearableSource;
  device?: DeviceMetadata;
  heartRate?: HeartRateTelemetry;
  hrv?: HrvTelemetry;
  sleep?: SleepTelemetry;
  recovery?: RecoveryTelemetry;
  respirationRate?: number; // breaths/min
  energy?: EnergyTelemetry;
  raw?: any;
}

/**
 * Calculates a composite Recovery / Readiness score (0-100) when not natively provided
 * by the wearable device (e.g. Apple Watch HealthKit standard export).
 * Uses clinical weightings for Sleep (35%), HRV (40%), and Resting Heart Rate (25%).
 */
export function calculateRecoveryScore(params: {
  restingHeartRate?: number;
  hrvMs?: number;
  sleepHours?: number;
  sleepEfficiency?: number;
  deepSleepHours?: number;
  remSleepHours?: number;
}): number {
  let score = 70;
  let totalWeights = 0;
  let weightedPoints = 0;

  // 1. Sleep Component (Weight: 35%)
  if (params.sleepHours !== undefined && params.sleepHours > 0) {
    let sleepScore = 50;
    if (params.sleepHours >= 7.0 && params.sleepHours <= 9.0) {
      sleepScore = 100;
    } else if (params.sleepHours >= 6.0 && params.sleepHours < 7.0) {
      sleepScore = 75;
    } else if (params.sleepHours >= 5.0 && params.sleepHours < 6.0) {
      sleepScore = 50;
    } else if (params.sleepHours > 9.0) {
      sleepScore = 85;
    } else {
      sleepScore = 30; // severe deprivation < 5h
    }

    // High quality stage bonus (deep & rem > 1.2h each)
    if ((params.deepSleepHours || 0) >= 1.2 && (params.remSleepHours || 0) >= 1.2) {
      sleepScore = Math.min(100, sleepScore + 10);
    }
    // Sleep efficiency adjustment
    if (params.sleepEfficiency && params.sleepEfficiency > 0) {
      if (params.sleepEfficiency >= 88) sleepScore = Math.min(100, sleepScore + 5);
      else if (params.sleepEfficiency < 75) sleepScore = Math.max(20, sleepScore - 15);
    }

    weightedPoints += sleepScore * 0.35;
    totalWeights += 0.35;
  }

  // 2. HRV Component (Weight: 40%)
  if (params.hrvMs !== undefined && params.hrvMs > 0) {
    let hrvScore = 65;
    if (params.hrvMs >= 85) hrvScore = 98;
    else if (params.hrvMs >= 70) hrvScore = 90;
    else if (params.hrvMs >= 55) hrvScore = 80;
    else if (params.hrvMs >= 40) hrvScore = 65;
    else if (params.hrvMs >= 28) hrvScore = 48;
    else hrvScore = 30;

    weightedPoints += hrvScore * 0.40;
    totalWeights += 0.40;
  }

  // 3. Resting Heart Rate Component (Weight: 25%)
  if (params.restingHeartRate !== undefined && params.restingHeartRate > 0) {
    let rhrScore = 70;
    if (params.restingHeartRate <= 50) rhrScore = 98;
    else if (params.restingHeartRate <= 56) rhrScore = 90;
    else if (params.restingHeartRate <= 63) rhrScore = 78;
    else if (params.restingHeartRate <= 70) rhrScore = 65;
    else if (params.restingHeartRate <= 78) rhrScore = 48;
    else rhrScore = 30;

    weightedPoints += rhrScore * 0.25;
    totalWeights += 0.25;
  }

  if (totalWeights > 0) {
    score = Math.round(weightedPoints / totalWeights);
  }

  return Math.max(1, Math.min(100, score));
}

/**
 * Maps recovery score (0 to 100) and sleep duration to the Aristotelian Mean Scale (-5 to +5).
 * 0 is the Golden Mean (sustainable vitality / balanced equilibrium).
 * Positive (+1 to +3): surplus autonomic capacity / primed for heavy physical/cognitive output.
 * Negative (-1 to -5): deficiency / sleep debt / nervous system exhaustion.
 */
export function calculateVitalityScale(recoveryScore: number, sleepHours?: number): number {
  if (sleepHours !== undefined && sleepHours > 0 && sleepHours < 5.0) {
    return Math.max(-5, Math.min(-2, Math.round((recoveryScore - 60) / 10)));
  }

  if (recoveryScore >= 90) return 3;
  if (recoveryScore >= 80) return 2;
  if (recoveryScore >= 70) return 1;
  if (recoveryScore >= 60) return 0; // Golden Mean equilibrium
  if (recoveryScore >= 50) return -1;
  if (recoveryScore >= 40) return -2;
  if (recoveryScore >= 30) return -3;
  if (recoveryScore >= 20) return -4;
  return -5;
}

/**
 * Determines readiness category from recovery score
 */
function getReadinessCategory(score: number): "peak" | "optimal" | "recovering" | "strained" {
  if (score >= 85) return "peak";
  if (score >= 70) return "optimal";
  if (score >= 50) return "recovering";
  return "strained";
}

/**
 * Safely parses Health Auto Export JSON format (Apple Watch / iOS Shortcuts).
 */
function parseHealthAutoExport(payload: any, userId: string): Partial<BiometricSnapshot> | null {
  const metrics = payload?.data?.metrics || payload?.metrics;
  if (!Array.isArray(metrics)) {
    return null;
  }

  let restingHR: number | undefined;
  let currentHR: number | undefined;
  let minHR: number | undefined;
  let maxHR: number | undefined;
  let avgHR: number | undefined;
  let hrvVal: number | undefined;
  let hrvMetric: "rMSSD" | "SDNN" = "SDNN";
  let respiration: number | undefined;
  let activeEnergy: number | undefined;
  let steps: number | undefined;
  let sleepTotal: number | undefined;
  let sleepDeep: number | undefined;
  let sleepRem: number | undefined;
  let sleepLight: number | undefined;
  let sleepAwake: number | undefined;
  let sleepEff: number | undefined;
  let dateStr = new Date().toISOString().split("T")[0];

  for (const metric of metrics) {
    const name = String(metric.name || "").toLowerCase();
    const data = Array.isArray(metric.data) ? metric.data : [];

    if (name === "resting_heart_rate") {
      const last = data[data.length - 1];
      if (last) {
        restingHR = Number(last.qty ?? last.Avg ?? last.value);
        if (last.date && typeof last.date === "string") {
          dateStr = last.date.slice(0, 10);
        }
      }
    } else if (name === "heart_rate") {
      const last = data[data.length - 1];
      if (last) {
        currentHR = Number(last.qty ?? last.Avg ?? last.value);
        avgHR = Number(last.Avg ?? last.qty);
        minHR = Number(last.Min ?? last.min);
        maxHR = Number(last.Max ?? last.max);
      }
    } else if (name === "heart_rate_variability_sdnn" || name === "heart_rate_variability") {
      const last = data[data.length - 1];
      if (last) {
        hrvVal = Number(last.qty ?? last.Avg ?? last.value);
        hrvMetric = name.includes("rmssd") ? "rMSSD" : "SDNN";
      }
    } else if (name === "respiratory_rate") {
      const last = data[data.length - 1];
      if (last) {
        respiration = Number(last.qty ?? last.Avg ?? last.value);
      }
    } else if (name === "active_energy") {
      // Sum or latest total
      let sum = 0;
      for (const d of data) {
        sum += Number(d.qty ?? d.value ?? 0);
      }
      activeEnergy = Math.round(sum > 0 ? sum : Number(data[data.length - 1]?.qty ?? 0));
    } else if (name === "step_count") {
      let sum = 0;
      for (const d of data) {
        sum += Number(d.qty ?? d.value ?? 0);
      }
      steps = Math.round(sum > 0 ? sum : Number(data[data.length - 1]?.qty ?? 0));
    } else if (name === "sleep_analysis") {
      // Check for aggregated format
      const last = data[data.length - 1];
      if (last) {
        if (last.asleep !== undefined || last.inBed !== undefined) {
          sleepTotal = Number(last.asleep ?? (Number(last.inBed || 0) - Number(last.awake || 0)));
          sleepDeep = last.deep !== undefined ? Number(last.deep) : undefined;
          sleepRem = last.rem !== undefined ? Number(last.rem) : undefined;
          sleepLight = last.core !== undefined ? Number(last.core) : undefined;
          sleepAwake = last.awake !== undefined ? Number(last.awake) : undefined;
          if (last.inBed && sleepTotal) {
            sleepEff = Math.round((sleepTotal / Number(last.inBed)) * 100);
          }
        } else {
          // Individual intervals
          let totalHrs = 0;
          let deepHrs = 0;
          let remHrs = 0;
          let lightHrs = 0;
          let awakeHrs = 0;
          let inBedHrs = 0;

          for (const item of data) {
            const val = String(item.value || "").toUpperCase();
            const hrs = Number(item.qty || 0);
            if (val === "ASLEEP" || val === "CORE" || val === "DEEP" || val === "REM") {
              totalHrs += hrs;
            }
            if (val === "DEEP") deepHrs += hrs;
            if (val === "REM") remHrs += hrs;
            if (val === "CORE" || val === "LIGHT") lightHrs += hrs;
            if (val === "AWAKE") awakeHrs += hrs;
            if (val === "IN_BED") inBedHrs += hrs;
          }

          if (totalHrs > 0) {
            sleepTotal = Math.round(totalHrs * 10) / 10;
            sleepDeep = Math.round(deepHrs * 10) / 10;
            sleepRem = Math.round(remHrs * 10) / 10;
            sleepLight = Math.round(lightHrs * 10) / 10;
            sleepAwake = Math.round(awakeHrs * 10) / 10;
            if (inBedHrs > 0) {
              sleepEff = Math.min(100, Math.round((totalHrs / inBedHrs) * 100));
            }
          }
        }
      }
    }
  }

  return {
    userId,
    source: "apple_health",
    date: dateStr,
    device: {
      name: "Apple Watch (HealthKit)",
      manufacturer: "Apple",
      appVersion: "Health Auto Export",
    },
    heartRate: (restingHR || currentHR) ? {
      resting: restingHR,
      current: currentHR,
      avg: avgHR,
      min: minHR,
      max: maxHR,
    } : undefined,
    hrv: hrvVal ? { value: Math.round(hrvVal * 10) / 10, metric: hrvMetric } : undefined,
    sleep: sleepTotal ? {
      totalHours: Math.round(sleepTotal * 10) / 10,
      deepSleepHours: sleepDeep ? Math.round(sleepDeep * 10) / 10 : undefined,
      remSleepHours: sleepRem ? Math.round(sleepRem * 10) / 10 : undefined,
      lightSleepHours: sleepLight ? Math.round(sleepLight * 10) / 10 : undefined,
      awakeHours: sleepAwake ? Math.round(sleepAwake * 10) / 10 : undefined,
      efficiencyPercent: sleepEff,
    } : undefined,
    respirationRate: respiration ? Math.round(respiration * 10) / 10 : undefined,
    energy: (activeEnergy || steps) ? {
      activeCalories: activeEnergy,
      stepCount: steps,
    } : undefined,
  };
}

/**
 * Safely parses Whoop Developer API payload format.
 */
function parseWhoopPayload(payload: any, userId: string): Partial<BiometricSnapshot> | null {
  const data = payload?.data || payload;
  const isWhoop =
    payload?.recovery !== undefined ||
    payload?.cycle_id !== undefined ||
    data?.recovery !== undefined ||
    String(payload?.type || "").includes("whoop") ||
    String(payload?.source || "").toLowerCase().includes("whoop");

  if (!isWhoop) return null;

  const recoveryObj = data.recovery || data;
  const recoveryScoreObj = recoveryObj.score || recoveryObj;
  const sleepObj = data.sleep || payload.sleep || {};
  const sleepScoreObj = sleepObj.score || sleepObj;
  const stageSummary = sleepScoreObj.stage_summary || {};
  const strainObj = data.strain || payload.strain || {};

  const recoveryScore = Number(recoveryScoreObj.recovery_score ?? recoveryScoreObj.score);
  const restingHR = Number(recoveryScoreObj.resting_heart_rate ?? recoveryScoreObj.resting_hr);
  const hrvVal = Number(recoveryScoreObj.hrv_rmssd_milli ?? recoveryScoreObj.hrv);

  // Sleep times from milliseconds
  let sleepTotal: number | undefined;
  let sleepDeep: number | undefined;
  let sleepRem: number | undefined;
  let sleepLight: number | undefined;
  let sleepAwake: number | undefined;

  if (stageSummary.total_slow_wave_sleep_time_milli !== undefined) {
    const sws = Number(stageSummary.total_slow_wave_sleep_time_milli) / 3600000;
    const rem = Number(stageSummary.total_rem_sleep_time_milli || 0) / 3600000;
    const light = Number(stageSummary.total_light_sleep_time_milli || 0) / 3600000;
    const awake = Number(stageSummary.total_awake_time_milli || 0) / 3600000;

    sleepDeep = Math.round(sws * 10) / 10;
    sleepRem = Math.round(rem * 10) / 10;
    sleepLight = Math.round(light * 10) / 10;
    sleepAwake = Math.round(awake * 10) / 10;
    sleepTotal = Math.round((sws + rem + light) * 10) / 10;
  } else if (sleepScoreObj.total_sleep_hours !== undefined) {
    sleepTotal = Number(sleepScoreObj.total_sleep_hours);
  }

  const sleepEff = Number(
    sleepScoreObj.sleep_efficiency_percentage ?? sleepScoreObj.efficiency
  );
  const respiration = Number(
    sleepScoreObj.respiratory_rate ?? recoveryScoreObj.respiratory_rate
  );
  const strainScore = Number(strainObj.score ?? strainObj.day_strain);

  // Active calories from kilojoules or calories
  let activeCalories: number | undefined;
  if (strainObj.kilojoules) {
    activeCalories = Math.round(Number(strainObj.kilojoules) * 0.239006);
  } else if (strainObj.calories) {
    activeCalories = Number(strainObj.calories);
  }

  return {
    userId,
    source: "whoop",
    device: {
      name: "Whoop 4.0",
      manufacturer: "Whoop",
    },
    recovery: !isNaN(recoveryScore) ? {
      score: Math.round(recoveryScore),
      strain: !isNaN(strainScore) ? Math.round(strainScore * 10) / 10 : undefined,
      readinessCategory: getReadinessCategory(recoveryScore),
    } : undefined,
    heartRate: !isNaN(restingHR) ? {
      resting: Math.round(restingHR),
      avg: strainObj.average_heart_rate ? Number(strainObj.average_heart_rate) : undefined,
      max: strainObj.max_heart_rate ? Number(strainObj.max_heart_rate) : undefined,
    } : undefined,
    hrv: !isNaN(hrvVal) ? {
      value: Math.round(hrvVal * 10) / 10,
      metric: "rMSSD",
    } : undefined,
    sleep: sleepTotal !== undefined ? {
      totalHours: sleepTotal,
      deepSleepHours: sleepDeep,
      remSleepHours: sleepRem,
      lightSleepHours: sleepLight,
      awakeHours: sleepAwake,
      efficiencyPercent: !isNaN(sleepEff) ? Math.round(sleepEff) : undefined,
    } : undefined,
    respirationRate: !isNaN(respiration) ? Math.round(respiration * 10) / 10 : undefined,
    energy: activeCalories ? { activeCalories } : undefined,
  };
}

/**
 * Safely parses generic JSON biometrics (iOS Shortcuts, Garmin, Zepp OS/Amazfit, Oura, Tasker, custom).
 */
function parseGenericPayload(payload: any, userId: string): Partial<BiometricSnapshot> {
  const p = payload || {};

  // 1. Resting & Current Heart Rate
  const restingHR = Number(
    p.restingHeartRate ??
    p.resting_heart_rate ??
    p.rhr ??
    p.heartRate?.resting ??
    p.heart_rate?.resting
  );
  const currentHR = Number(
    p.currentHeartRate ??
    p.current_heart_rate ??
    p.heartRate?.current ??
    p.heart_rate?.current ??
    p.heartRate ??
    p.heart_rate
  );
  const maxHR = Number(p.maxHeartRate ?? p.max_heart_rate ?? p.heartRate?.max);
  const avgHR = Number(p.avgHeartRate ?? p.avg_heart_rate ?? p.heartRate?.avg);

  // 2. HRV
  const hrvVal = Number(
    p.hrv ??
    p.hrvMs ??
    p.hrv_ms ??
    p.heartRateVariability ??
    p.heart_rate_variability ??
    p.hrv_rmssd ??
    p.hrv_sdnn
  );
  const hrvMetric: "rMSSD" | "SDNN" =
    String(p.hrvMetric || p.hrv_metric || "").toLowerCase() === "sdnn" ? "SDNN" : "rMSSD";

  // 3. Sleep
  const sleepTotal = Number(
    p.sleepHours ??
    p.sleep_hours ??
    p.totalSleep ??
    p.total_sleep ??
    p.sleepDuration ??
    p.sleep_duration ??
    p.sleep?.totalHours ??
    p.sleep?.total ??
    p.sleep?.hours
  );
  const sleepDeep = Number(
    p.deepSleepHours ??
    p.deep_sleep_hours ??
    p.deepSleep ??
    p.deep_sleep ??
    p.sleep?.deepSleepHours ??
    p.sleep?.deep
  );
  const sleepRem = Number(
    p.remSleepHours ??
    p.rem_sleep_hours ??
    p.remSleep ??
    p.rem_sleep ??
    p.sleep?.remSleepHours ??
    p.sleep?.rem
  );
  const sleepLight = Number(
    p.lightSleepHours ??
    p.light_sleep_hours ??
    p.lightSleep ??
    p.light_sleep ??
    p.sleep?.lightSleepHours ??
    p.sleep?.light
  );
  const sleepAwake = Number(
    p.awakeHours ??
    p.awake_hours ??
    p.awake ??
    p.sleep?.awakeHours ??
    p.sleep?.awake
  );
  const sleepEff = Number(
    p.sleepEfficiency ??
    p.sleep_efficiency ??
    p.efficiency ??
    p.sleep?.efficiencyPercent ??
    p.sleep?.efficiency
  );

  // 4. Recovery & Strain
  const recoveryScore = Number(
    p.recoveryScore ??
    p.recovery_score ??
    p.readinessScore ??
    p.readiness_score ??
    p.recovery?.score ??
    p.readiness?.score ??
    p.bodyBattery ??
    p.body_battery
  );
  const strainScore = Number(p.strain ?? p.strain_score ?? p.recovery?.strain);

  // 5. Respiration & Energy
  const respiration = Number(
    p.respirationRate ??
    p.respiration_rate ??
    p.respiratoryRate ??
    p.respiratory_rate ??
    p.breathsPerMinute ??
    p.breaths_per_minute
  );
  const activeCalories = Number(
    p.activeCalories ??
    p.active_calories ??
    p.activeEnergy ??
    p.active_energy ??
    p.energy?.activeCalories ??
    p.calories
  );
  const totalCalories = Number(p.totalCalories ?? p.total_calories ?? p.energy?.totalCalories);
  const stepCount = Number(p.stepCount ?? p.step_count ?? p.steps ?? p.energy?.stepCount);

  // Source & Device
  const sourceName = String(p.source || p.tracker || p.device || "generic").toLowerCase();
  let normalizedSource: WearableSource = "generic";
  if (sourceName.includes("apple") || sourceName.includes("healthkit") || sourceName.includes("watch")) {
    normalizedSource = "apple_health";
  } else if (sourceName.includes("whoop")) {
    normalizedSource = "whoop";
  } else if (sourceName.includes("garmin")) {
    normalizedSource = "garmin";
  } else if (sourceName.includes("zepp") || sourceName.includes("amazfit")) {
    normalizedSource = "zepp";
  } else if (sourceName.includes("oura")) {
    normalizedSource = "oura";
  }

  const deviceName = p.device?.name || p.device || p.model || (normalizedSource !== "generic" ? normalizedSource : undefined);

  return {
    userId,
    source: normalizedSource,
    device: deviceName ? { name: String(deviceName) } : undefined,
    heartRate: (!isNaN(restingHR) || !isNaN(currentHR)) ? {
      resting: !isNaN(restingHR) ? Math.round(restingHR) : undefined,
      current: !isNaN(currentHR) ? Math.round(currentHR) : undefined,
      max: !isNaN(maxHR) ? Math.round(maxHR) : undefined,
      avg: !isNaN(avgHR) ? Math.round(avgHR) : undefined,
    } : undefined,
    hrv: !isNaN(hrvVal) ? {
      value: Math.round(hrvVal * 10) / 10,
      metric: hrvMetric,
    } : undefined,
    sleep: !isNaN(sleepTotal) ? {
      totalHours: Math.round(sleepTotal * 10) / 10,
      deepSleepHours: !isNaN(sleepDeep) ? Math.round(sleepDeep * 10) / 10 : undefined,
      remSleepHours: !isNaN(sleepRem) ? Math.round(sleepRem * 10) / 10 : undefined,
      lightSleepHours: !isNaN(sleepLight) ? Math.round(sleepLight * 10) / 10 : undefined,
      awakeHours: !isNaN(sleepAwake) ? Math.round(sleepAwake * 10) / 10 : undefined,
      efficiencyPercent: !isNaN(sleepEff) ? Math.round(sleepEff) : undefined,
    } : undefined,
    recovery: !isNaN(recoveryScore) ? {
      score: Math.max(0, Math.min(100, Math.round(recoveryScore))),
      strain: !isNaN(strainScore) ? Math.round(strainScore * 10) / 10 : undefined,
      readinessCategory: getReadinessCategory(recoveryScore),
    } : undefined,
    respirationRate: !isNaN(respiration) ? Math.round(respiration * 10) / 10 : undefined,
    energy: (!isNaN(activeCalories) || !isNaN(stepCount)) ? {
      activeCalories: !isNaN(activeCalories) ? Math.round(activeCalories) : undefined,
      totalCalories: !isNaN(totalCalories) ? Math.round(totalCalories) : undefined,
      stepCount: !isNaN(stepCount) ? Math.round(stepCount) : undefined,
    } : undefined,
  };
}

/**
 * Recursively removes undefined fields from an object to ensure Firestore compatibility.
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined).filter((x) => x !== undefined) as any;
  }
  if (
    typeof obj === "object" &&
    !(obj instanceof Date) &&
    !(obj instanceof admin.firestore.Timestamp)
  ) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Universal Biometric Payload Ingestion Engine.
 * Normalizes input from Apple Watch (Health Auto Export), Whoop, Garmin, Zepp, or Generic JSON,
 * computes recovery & vitality impact, and persists to Firestore.
 */
export async function ingestBiometricPayload(
  userId: string,
  payload: any
): Promise<BiometricSnapshot> {
  const timestamp = new Date();
  const dateStr = timestamp.toISOString().split("T")[0];

  // 1. Parse via appropriate parser
  let parsed: Partial<BiometricSnapshot> | null = parseHealthAutoExport(payload, userId);
  if (!parsed) {
    parsed = parseWhoopPayload(payload, userId);
  }
  if (!parsed) {
    parsed = parseGenericPayload(payload, userId);
  }

  // 2. Ensure Recovery Score exists or calculate composite readiness
  let recoveryScore = parsed.recovery?.score;
  if (recoveryScore === undefined || isNaN(recoveryScore)) {
    recoveryScore = calculateRecoveryScore({
      restingHeartRate: parsed.heartRate?.resting,
      hrvMs: parsed.hrv?.value,
      sleepHours: parsed.sleep?.totalHours,
      sleepEfficiency: parsed.sleep?.efficiencyPercent,
      deepSleepHours: parsed.sleep?.deepSleepHours,
      remSleepHours: parsed.sleep?.remSleepHours,
    });
  }

  const recoveryTelemetry: RecoveryTelemetry = {
    score: recoveryScore,
    strain: parsed.recovery?.strain,
    readinessCategory: getReadinessCategory(recoveryScore),
  };

  // 3. Assemble normalized snapshot
  const snapshot: BiometricSnapshot = {
    userId,
    timestamp,
    date: parsed.date || dateStr,
    source: parsed.source || "generic",
    device: parsed.device,
    heartRate: parsed.heartRate,
    hrv: parsed.hrv,
    sleep: parsed.sleep,
    recovery: recoveryTelemetry,
    respirationRate: parsed.respirationRate,
    energy: parsed.energy,
    raw: payload,
  };

  // 4. Calculate Aristotelian Vitality impact (-5 to +5)
  const vitalityScore = calculateVitalityScale(recoveryScore, snapshot.sleep?.totalHours);

  // 5. Firestore Persistence
  try {
    // A. Historical daily snapshot in `biometrics` collection
    const docId = `${userId}_${snapshot.date}`;
    const historicalDoc = cleanUndefined({
      ...snapshot,
      timestamp: admin.firestore.Timestamp.fromDate(timestamp),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await biometricsCollection.doc(docId).set(historicalDoc, { merge: true });

    // B. Latest telemetry in `userState/{userId}`
    const latestStateData = cleanUndefined({
      latestBiometrics: {
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
        date: snapshot.date,
        recoveryScore: snapshot.recovery?.score,
        readinessCategory: snapshot.recovery?.readinessCategory,
        strain: snapshot.recovery?.strain,
        hrvMs: snapshot.hrv?.value,
        hrvMetric: snapshot.hrv?.metric,
        restingHeartRate: snapshot.heartRate?.resting,
        currentHeartRate: snapshot.heartRate?.current,
        sleepHours: snapshot.sleep?.totalHours,
        deepSleepHours: snapshot.sleep?.deepSleepHours,
        remSleepHours: snapshot.sleep?.remSleepHours,
        sleepEfficiency: snapshot.sleep?.efficiencyPercent,
        respirationRate: snapshot.respirationRate,
        activeCalories: snapshot.energy?.activeCalories,
        stepCount: snapshot.energy?.stepCount,
        source: snapshot.source,
        deviceName: snapshot.device?.name,
      },
      "goldenMeans.vitality": vitalityScore,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await userStatesCollection.doc(userId).set(latestStateData, { merge: true });
  } catch (err) {
    console.error("⚠️ Firestore error persisting biometric telemetry:", err);
  }

  return snapshot;
}

/**
 * Fetches the most recent biometric snapshot for a user.
 */
export async function getLatestBiometrics(userId: string): Promise<BiometricSnapshot | null> {
  try {
    // 1. Check userState document directly (O(1), index-free)
    const userDoc = await userStatesCollection.doc(userId).get();
    if (userDoc.exists) {
      const state = userDoc.data();
      const lb = state?.latestBiometrics;
      if (lb) {
        return {
          userId,
          timestamp: lb.timestamp?.toDate ? lb.timestamp.toDate() : new Date(lb.timestamp || Date.now()),
          date: lb.date || new Date().toISOString().split("T")[0],
          source: lb.source || "generic",
          device: lb.deviceName ? { name: lb.deviceName } : undefined,
          heartRate: lb.restingHeartRate ? { resting: lb.restingHeartRate, current: lb.currentHeartRate } : undefined,
          hrv: lb.hrvMs ? { value: lb.hrvMs, metric: lb.hrvMetric || "rMSSD" } : undefined,
          sleep: lb.sleepHours ? {
            totalHours: lb.sleepHours,
            deepSleepHours: lb.deepSleepHours,
            remSleepHours: lb.remSleepHours,
            efficiencyPercent: lb.sleepEfficiency,
          } : undefined,
          recovery: lb.recoveryScore !== undefined ? {
            score: lb.recoveryScore,
            strain: lb.strain,
            readinessCategory: lb.readinessCategory || getReadinessCategory(lb.recoveryScore),
          } : undefined,
          respirationRate: lb.respirationRate,
          energy: lb.activeCalories ? { activeCalories: lb.activeCalories, stepCount: lb.stepCount } : undefined,
        };
      }
    }

    // 2. Query historical `biometrics` collection by userId, sort in memory
    const snapshotQuery = await biometricsCollection
      .where("userId", "==", userId)
      .limit(20)
      .get();

    if (!snapshotQuery.empty) {
      const docs = snapshotQuery.docs.map((d) => ({ id: d.id, data: d.data() }));
      docs.sort((a, b) => {
        const timeA = a.data.timestamp?.toMillis ? a.data.timestamp.toMillis() : new Date(a.data.timestamp || 0).getTime();
        const timeB = b.data.timestamp?.toMillis ? b.data.timestamp.toMillis() : new Date(b.data.timestamp || 0).getTime();
        return timeB - timeA;
      });

      const latest = docs[0];
      const data = latest.data;
      return {
        id: latest.id,
        userId: data.userId || userId,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
        date: data.date,
        source: data.source,
        device: data.device,
        heartRate: data.heartRate,
        hrv: data.hrv,
        sleep: data.sleep,
        recovery: data.recovery,
        respirationRate: data.respirationRate,
        energy: data.energy,
      };
    }
  } catch (err) {
    console.error("⚠️ Error fetching latest biometrics:", err);
  }

  return null;
}
