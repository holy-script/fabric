import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

export const ADB_PATH =
  process.env.ADB_PATH ||
  "/Users/holyscript/Library/Android/sdk/platform-tools/adb";

export interface AdbDevice {
  id: string;
  state: "device" | "unauthorized" | "offline" | "no permissions" | string;
  model?: string;
  product?: string;
}

export interface BatteryTelemetry {
  level: number;
  scale: number;
  temperature: number; // in Celsius e.g. 28.5
  charging: boolean;
  status: string; // "Charging", "Discharging", "Full", "Not charging", "Unknown"
  chargeType: "AC" | "USB" | "Wireless" | "Battery" | "Unknown";
  health: string; // "Good", "Overheat", "Dead", "Over voltage", "Failure", "Cold", "Unknown"
  voltage: number; // in mV
  present: boolean;
  technology?: string;
}

export interface ScreenStateTelemetry {
  interactive: boolean;
  screenOn: boolean;
  wakefulness: "Awake" | "Asleep" | "Dozing" | "Dreaming" | "Unknown";
  raw?: string;
}

export interface NetworkTelemetry {
  airplaneMode: boolean;
  activeTransport: "WIFI" | "CELLULAR" | "ETHERNET" | "VPN" | "NONE" | "UNKNOWN";
  wifi: {
    enabled: boolean;
    connected: boolean;
    ssid?: string;
    ip?: string;
    rssi?: number;
    linkSpeed?: string;
  };
  cellular: {
    dataEnabled: boolean;
    connected: boolean;
    operator?: string;
    networkType?: string;
  };
}

export interface DeviceStatsSummary {
  connected: boolean;
  deviceId: string;
  model: string;
  androidVersion?: string;
  battery: BatteryTelemetry;
  screen: ScreenStateTelemetry;
  network: NetworkTelemetry;
  uptime: {
    formatted: string;
    uptimeSeconds?: number;
    raw: string;
  };
  memory: {
    totalMb: number;
    usedMb: number;
    availableMb: number;
    percent: number;
  };
  dnd: {
    enabled: boolean;
    zenMode: number;
    label: string;
  };
  timestamp: string;
}

/**
 * Checks if the ADB binary is present at the designated path.
 */
export async function isAdbAvailable(): Promise<boolean> {
  return fs.existsSync(ADB_PATH);
}

/**
 * Executes an adb command targeting a device or general adb server.
 */
export async function execAdb(
  args: string[],
  deviceId?: string,
  timeoutMs = 8000
): Promise<{ stdout: string; stderr: string }> {
  if (!fs.existsSync(ADB_PATH)) {
    throw new Error(`ADB binary not found at ${ADB_PATH}`);
  }

  const finalArgs = deviceId ? ["-s", deviceId, ...args] : args;
  try {
    const { stdout, stderr } = await execFileAsync(ADB_PATH, finalArgs, {
      timeout: timeoutMs,
      encoding: "utf8",
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: any) {
    const message = err.stderr || err.stdout || err.message || "ADB execution failed";
    throw new Error(`ADB error (${finalArgs.join(" ")}): ${message}`);
  }
}

/**
 * Enumerates all ADB attached devices and their states.
 */
export async function getConnectedDevices(): Promise<AdbDevice[]> {
  if (!fs.existsSync(ADB_PATH)) return [];
  try {
    const { stdout } = await execFileAsync(ADB_PATH, ["devices", "-l"], {
      timeout: 5000,
    });
    const lines = stdout.split("\n").slice(1);
    const devices: AdbDevice[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const id = parts[0];
        const state = parts[1];
        let model: string | undefined;
        let product: string | undefined;
        for (const token of parts.slice(2)) {
          if (token.startsWith("model:")) model = token.replace("model:", "");
          if (token.startsWith("product:")) product = token.replace("product:", "");
        }
        devices.push({ id, state, model, product });
      }
    }
    return devices;
  } catch {
    return [];
  }
}

/**
 * Retrieves the primary active device and diagnostic connection status.
 */
export async function getActiveDevice(): Promise<{
  device?: AdbDevice;
  status: "connected" | "disconnected" | "unauthorized" | "offline" | "adb_missing";
}> {
  if (!(await isAdbAvailable())) {
    return { status: "adb_missing" };
  }

  const devices = await getConnectedDevices();
  if (devices.length === 0) {
    return { status: "disconnected" };
  }

  const authorized = devices.find((d) => d.state === "device");
  if (authorized) {
    return { device: authorized, status: "connected" };
  }

  const unauthorized = devices.find((d) => d.state === "unauthorized");
  if (unauthorized) {
    return { device: unauthorized, status: "unauthorized" };
  }

  const offline = devices.find((d) => d.state === "offline");
  if (offline) {
    return { device: offline, status: "offline" };
  }

  return { device: devices[0], status: "disconnected" };
}

/**
 * Resolves the target device ID or throws a user-friendly error if unavailable.
 */
async function resolveDeviceId(preferredId?: string): Promise<string> {
  if (preferredId) return preferredId;
  const { device, status } = await getActiveDevice();
  if (status === "adb_missing") {
    throw new Error(`ADB platform-tools not found at ${ADB_PATH}`);
  }
  if (status === "disconnected" || !device) {
    throw new Error("No Android device connected to ADB via USB or Wi-Fi");
  }
  if (status === "unauthorized") {
    throw new Error(`Device ${device.id} is unauthorized. Please accept the USB debugging prompt on the phone screen.`);
  }
  if (status === "offline") {
    throw new Error(`Device ${device.id} is offline. Reconnect USB cable or run 'adb reconnect'.`);
  }
  return device.id;
}

/**
 * Parses dumpsys battery raw string into structured BatteryTelemetry.
 */
export function parseBatteryOutput(stdout: string): BatteryTelemetry {
  const levelMatch = stdout.match(/^\s*level:\s*(\d+)/im);
  const scaleMatch = stdout.match(/^\s*scale:\s*(\d+)/im);
  const statusMatch = stdout.match(/^\s*status:\s*(\d+)/im);
  const healthMatch = stdout.match(/^\s*health:\s*(\d+)/im);
  const tempMatch = stdout.match(/^\s*temperature:\s*(\d+)/im);
  const voltageMatch = stdout.match(/^\s*voltage:\s*(\d+)/im);
  const acMatch = stdout.match(/^\s*AC powered:\s*(true|false)/im);
  const usbMatch = stdout.match(/^\s*USB powered:\s*(true|false)/im);
  const wirelessMatch = stdout.match(/^\s*Wireless powered:\s*(true|false)/im);
  const presentMatch = stdout.match(/^\s*present:\s*(true|false)/im);
  const techMatch = stdout.match(/^\s*technology:\s*([^\r\n]+)/im);

  const rawLevel = levelMatch ? parseInt(levelMatch[1], 10) : 0;
  const rawScale = scaleMatch ? parseInt(scaleMatch[1], 10) : 100;
  const level = rawScale > 0 ? Math.round((rawLevel / rawScale) * 100) : rawLevel;

  const rawTemp = tempMatch ? parseInt(tempMatch[1], 10) : 0;
  // Battery temp is reported in tenths of a degree Celsius (e.g. 285 = 28.5 C)
  const temperature = rawTemp > 100 ? parseFloat((rawTemp / 10).toFixed(1)) : rawTemp;

  const acPowered = acMatch ? acMatch[1].toLowerCase() === "true" : false;
  const usbPowered = usbMatch ? usbMatch[1].toLowerCase() === "true" : false;
  const wirelessPowered = wirelessMatch ? wirelessMatch[1].toLowerCase() === "true" : false;
  const isPowered = acPowered || usbPowered || wirelessPowered;

  const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 1;
  const statusLabels: Record<number, string> = {
    1: "Unknown",
    2: "Charging",
    3: "Discharging",
    4: "Not charging",
    5: "Full",
  };
  const status = statusLabels[statusCode] || "Unknown";
  const charging = statusCode === 2 || isPowered;

  let chargeType: "AC" | "USB" | "Wireless" | "Battery" | "Unknown" = "Battery";
  if (acPowered) chargeType = "AC";
  else if (usbPowered) chargeType = "USB";
  else if (wirelessPowered) chargeType = "Wireless";
  else if (!charging) chargeType = "Battery";

  const healthCode = healthMatch ? parseInt(healthMatch[1], 10) : 1;
  const healthLabels: Record<number, string> = {
    1: "Unknown",
    2: "Good",
    3: "Overheat",
    4: "Dead",
    5: "Over voltage",
    6: "Failure",
    7: "Cold",
  };
  const health = healthLabels[healthCode] || "Good";

  const voltage = voltageMatch ? parseInt(voltageMatch[1], 10) : 0;
  const present = presentMatch ? presentMatch[1].toLowerCase() === "true" : true;
  const technology = techMatch ? techMatch[1].trim() : undefined;

  return {
    level,
    scale: rawScale,
    temperature,
    charging,
    status,
    chargeType,
    health,
    voltage,
    present,
    technology,
  };
}

/**
 * Safely queries hardware battery telemetry.
 */
export async function getDeviceBattery(deviceId?: string): Promise<BatteryTelemetry> {
  const targetId = await resolveDeviceId(deviceId);
  const { stdout } = await execAdb(["shell", "dumpsys", "battery"], targetId);
  return parseBatteryOutput(stdout);
}

/**
 * Parses dumpsys power raw string into structured ScreenStateTelemetry.
 */
export function parseScreenStateOutput(stdout: string): ScreenStateTelemetry {
  const wakefulnessMatch = stdout.match(/mWakefulness=([A-Za-z]+)/i);
  const displayStateMatch = stdout.match(/Display Power: state=([A-Za-z]+)/i);
  const interactiveMatch = stdout.match(/mInteractive=(true|false)/i);
  const displaySuspendMatch = stdout.match(/mHoldingDisplaySuspendBlocker=(true|false)/i);

  let wakefulness: "Awake" | "Asleep" | "Dozing" | "Dreaming" | "Unknown" = "Unknown";
  if (wakefulnessMatch) {
    const rawWake = wakefulnessMatch[1].toLowerCase();
    if (rawWake.includes("awake")) wakefulness = "Awake";
    else if (rawWake.includes("asleep")) wakefulness = "Asleep";
    else if (rawWake.includes("doz")) wakefulness = "Dozing";
    else if (rawWake.includes("dream")) wakefulness = "Dreaming";
  }

  let screenOn = false;
  if (displayStateMatch) {
    const s = displayStateMatch[1].toUpperCase();
    screenOn = s === "ON" || s === "DOZE";
  } else if (wakefulness !== "Unknown") {
    screenOn = wakefulness === "Awake" || wakefulness === "Dreaming" || wakefulness === "Dozing";
  } else if (displaySuspendMatch) {
    screenOn = displaySuspendMatch[1].toLowerCase() === "true";
  }

  let interactive = screenOn;
  if (interactiveMatch) {
    interactive = interactiveMatch[1].toLowerCase() === "true";
  } else if (wakefulness !== "Unknown") {
    interactive = wakefulness === "Awake";
  }

  return {
    interactive,
    screenOn,
    wakefulness,
    raw: wakefulnessMatch ? wakefulnessMatch[0] : undefined,
  };
}

/**
 * Safely queries screen and interactive state from dumpsys power.
 */
export async function getScreenState(deviceId?: string): Promise<ScreenStateTelemetry> {
  const targetId = await resolveDeviceId(deviceId);
  const { stdout } = await execAdb(["shell", "dumpsys", "power"], targetId);
  return parseScreenStateOutput(stdout);
}

/**
 * Parses wifi, cellular, and overall transport status.
 */
export function parseNetworkOutput(raw: {
  airplaneMode: string;
  wifiOn: string;
  mobileData: string;
  operator: string;
  networkType: string;
  connectivityDump: string;
  wifiDump: string;
  ipRoute: string;
}): NetworkTelemetry {
  const airplaneMode = raw.airplaneMode.trim() === "1";
  const wifiEnabled = raw.wifiOn.trim() === "1";
  const mobileDataEnabled = raw.mobileData.trim() === "1";

  // Check active transport from connectivity dumpsys
  let activeTransport: "WIFI" | "CELLULAR" | "ETHERNET" | "VPN" | "NONE" | "UNKNOWN" = "UNKNOWN";

  if (airplaneMode) {
    activeTransport = "NONE";
  } else if (/Active default network:.*WIFI/i.test(raw.connectivityDump)) {
    activeTransport = "WIFI";
  } else if (/Active default network:.*(CELLULAR|MOBILE)/i.test(raw.connectivityDump)) {
    activeTransport = "CELLULAR";
  } else if (/Active default network:.*ETHERNET/i.test(raw.connectivityDump)) {
    activeTransport = "ETHERNET";
  } else if (/Active default network:.*VPN/i.test(raw.connectivityDump)) {
    activeTransport = "VPN";
  }

  // Parse Wi-Fi details
  const ssidMatch =
    raw.wifiDump.match(/SSID:\s*"([^"]+)"/i) ||
    raw.wifiDump.match(/mWifiInfo\s+SSID:\s*([^,\s\n]+)/i);
  const ssid = ssidMatch && ssidMatch[1] !== "<unknown ssid>" ? ssidMatch[1] : undefined;

  const rssiMatch = raw.wifiDump.match(/RSSI:\s*(-?\d+)/i);
  const rssi = rssiMatch ? parseInt(rssiMatch[1], 10) : undefined;

  const linkSpeedMatch = raw.wifiDump.match(/Link speed:\s*([^\r\n,]+)/i);
  const linkSpeed = linkSpeedMatch ? linkSpeedMatch[1].trim() : undefined;

  // Extract IP from wifi dump or ip route
  const ipMatch =
    raw.wifiDump.match(/ip(?:_address)?:\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i) ||
    raw.ipRoute.match(/src\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i);
  const ip = ipMatch ? ipMatch[1] : undefined;

  const wifiConnected =
    activeTransport === "WIFI" ||
    /state:\s*CONNECTED/i.test(raw.wifiDump) ||
    (Boolean(ssid) && ssid !== "<unknown ssid>");

  // Cellular details
  const operator = raw.operator.trim() || undefined;
  const rawType = raw.networkType.trim();
  const networkType = rawType && rawType !== "unknown" ? rawType : undefined;
  const cellularConnected =
    mobileDataEnabled &&
    (activeTransport === "CELLULAR" || /state:\s*CONNECTED/i.test(raw.connectivityDump));

  return {
    airplaneMode,
    activeTransport,
    wifi: {
      enabled: wifiEnabled,
      connected: wifiConnected,
      ssid,
      ip,
      rssi,
      linkSpeed,
    },
    cellular: {
      dataEnabled: mobileDataEnabled,
      connected: cellularConnected,
      operator,
      networkType,
    },
  };
}

/**
 * Safely queries Wi-Fi and Cellular status.
 */
export async function getNetworkStatus(deviceId?: string): Promise<NetworkTelemetry> {
  const targetId = await resolveDeviceId(deviceId);

  // Run batch queries in shell with markers to minimize roundtrips
  const cmd = [
    "settings get global airplane_mode_on 2>/dev/null || echo 0",
    "echo '___FABRIC_DELIM___'",
    "settings get global wifi_on 2>/dev/null || echo 0",
    "echo '___FABRIC_DELIM___'",
    "settings get global mobile_data 2>/dev/null || echo 0",
    "echo '___FABRIC_DELIM___'",
    "getprop gsm.operator.alpha 2>/dev/null || echo ''",
    "echo '___FABRIC_DELIM___'",
    "getprop gsm.network.type 2>/dev/null || echo ''",
    "echo '___FABRIC_DELIM___'",
    "dumpsys connectivity 2>/dev/null | grep -E 'Active default network|NetworkAgentInfo.*(WIFI|MOBILE)' | head -n 6 || true",
    "echo '___FABRIC_DELIM___'",
    "dumpsys wifi 2>/dev/null | grep -E 'mWifiInfo|Wi-Fi is|SSID|RSSI|Link speed' | head -n 6 || true",
    "echo '___FABRIC_DELIM___'",
    "ip route 2>/dev/null | grep 'src' | head -n 2 || true",
  ].join("; ");

  const { stdout } = await execAdb(["shell", cmd], targetId);
  const parts = stdout.split("___FABRIC_DELIM___").map((p) => p.trim());

  return parseNetworkOutput({
    airplaneMode: parts[0] || "0",
    wifiOn: parts[1] || "0",
    mobileData: parts[2] || "0",
    operator: parts[3] || "",
    networkType: parts[4] || "",
    connectivityDump: parts[5] || "",
    wifiDump: parts[6] || "",
    ipRoute: parts[7] || "",
  });
}

/**
 * Parses /proc/meminfo text into structured memory metrics.
 */
export function parseMeminfo(stdout: string): {
  totalMb: number;
  usedMb: number;
  availableMb: number;
  percent: number;
} {
  const totalMatch = stdout.match(/MemTotal:\s*(\d+)\s*kB/i);
  const freeMatch = stdout.match(/MemFree:\s*(\d+)\s*kB/i);
  const availMatch = stdout.match(/MemAvailable:\s*(\d+)\s*kB/i);
  const buffersMatch = stdout.match(/Buffers:\s*(\d+)\s*kB/i);
  const cachedMatch = stdout.match(/Cached:\s*(\d+)\s*kB/i);

  const totalKb = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const freeKb = freeMatch ? parseInt(freeMatch[1], 10) : 0;
  const buffersKb = buffersMatch ? parseInt(buffersMatch[1], 10) : 0;
  const cachedKb = cachedMatch ? parseInt(cachedMatch[1], 10) : 0;

  let availKb = availMatch ? parseInt(availMatch[1], 10) : 0;
  if (!availKb && totalKb > 0) {
    availKb = freeKb + buffersKb + cachedKb;
  }

  const totalMb = Math.round(totalKb / 1024);
  const availableMb = Math.round(availKb / 1024);
  const usedMb = Math.max(0, totalMb - availableMb);
  const percent = totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0;

  return { totalMb, usedMb, availableMb, percent };
}

/**
 * Formats uptime seconds into a human-friendly string (e.g. 4d 18h 32m).
 */
export function formatUptimeSeconds(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

/**
 * Gets DND (Do Not Disturb / Zen Mode) status.
 */
export async function getDndStatus(
  deviceId?: string
): Promise<{ enabled: boolean; zenMode: number; label: string }> {
  const targetId = await resolveDeviceId(deviceId);
  try {
    const { stdout } = await execAdb(
      ["shell", "settings get global zen_mode 2>/dev/null || echo 0"],
      targetId
    );
    const zenMode = parseInt(stdout.trim(), 10) || 0;
    const labels: Record<number, string> = {
      0: "Off (Sound Normal)",
      1: "Priority Interruptions Only",
      2: "Total Silence",
      3: "Alarms Only",
    };
    return {
      enabled: zenMode > 0,
      zenMode,
      label: labels[zenMode] || "Custom Zen Mode",
    };
  } catch {
    return { enabled: false, zenMode: 0, label: "Unknown" };
  }
}

/**
 * Toggles DND / silent mode via ADB notification service.
 */
export async function triggerDnd(
  enable: boolean,
  deviceId?: string
): Promise<{ success: boolean; zenMode: number; label: string; message: string }> {
  const targetId = await resolveDeviceId(deviceId);
  const targetMode = enable ? 1 : 0;

  try {
    // Primary method: cmd notification set_zen_mode
    await execAdb(
      ["shell", `cmd notification set_zen_mode ${targetMode} 2>/dev/null || settings put global zen_mode ${targetMode}`],
      targetId
    );
  } catch {
    // Fallback: direct settings put
    await execAdb(["shell", "settings", "put", "global", "zen_mode", targetMode.toString()], targetId);
  }

  const current = await getDndStatus(targetId);
  const success = enable ? current.zenMode >= 1 : current.zenMode === 0;

  return {
    success,
    zenMode: current.zenMode,
    label: current.label,
    message: enable
      ? "Do Not Disturb activated (Priority mode)"
      : "Do Not Disturb disabled (Normal mode)",
  };
}

/**
 * Toggles Android Zen Mode / DND and optionally dims screen to eliminate mobile cognitive friction.
 */
export async function toggleZenMode(
  enable: boolean,
  deviceId?: string,
  dimScreen: boolean = true
): Promise<{ success: boolean; zenMode: number; screenDimmed: boolean; message: string }> {
  try {
    const dndResult = await triggerDnd(enable, deviceId);
    let screenDimmed = false;
    if (enable && dimScreen) {
      try {
        const targetId = await resolveDeviceId(deviceId);
        await execAdb(["shell", "settings put system screen_brightness 10 2>/dev/null || true"], targetId);
        screenDimmed = true;
      } catch {
        screenDimmed = false;
      }
    }
    return {
      success: dndResult.success,
      zenMode: dndResult.zenMode,
      screenDimmed,
      message: dndResult.message,
    };
  } catch (err: any) {
    return {
      success: false,
      zenMode: 0,
      screenDimmed: false,
      message: `Failed to toggle Zen mode: ${err?.message || err}`,
    };
  }
}

/**
 * Queries and combines complete device stats summary:
 * Battery, Screen Interactive state, Uptime, Memory, Network, and Focus DND.
 */
export async function getDeviceStatsSummary(
  deviceId?: string
): Promise<DeviceStatsSummary> {
  const targetId = await resolveDeviceId(deviceId);

  // Query hardware specs and telemetry in parallel
  const [battery, screen, network, dnd] = await Promise.all([
    getDeviceBattery(targetId),
    getScreenState(targetId),
    getNetworkStatus(targetId),
    getDndStatus(targetId),
  ]);

  // Query uptime and meminfo
  const batchScript = [
    "cat /proc/uptime 2>/dev/null || echo ''",
    "echo '___FABRIC_DELIM___'",
    "uptime 2>/dev/null || echo ''",
    "echo '___FABRIC_DELIM___'",
    "cat /proc/meminfo 2>/dev/null || echo ''",
    "echo '___FABRIC_DELIM___'",
    "getprop ro.product.model 2>/dev/null || echo 'Android Device'",
    "echo '___FABRIC_DELIM___'",
    "getprop ro.build.version.release 2>/dev/null || echo ''",
  ].join("; ");

  const { stdout } = await execAdb(["shell", batchScript], targetId);
  const parts = stdout.split("___FABRIC_DELIM___").map((p) => p.trim());

  const procUptimeStr = parts[0] || "";
  const rawUptimeStr = parts[1] || "";
  const meminfoStr = parts[2] || "";
  const model = parts[3] || "Android Device";
  const androidVersion = parts[4] || undefined;

  // Compute uptime
  let uptimeSeconds: number | undefined;
  let formattedUptime = rawUptimeStr;

  const secondsMatch = procUptimeStr.match(/^(\d+(?:\.\d+)?)/);
  if (secondsMatch) {
    uptimeSeconds = Math.floor(parseFloat(secondsMatch[1]));
    formattedUptime = formatUptimeSeconds(uptimeSeconds);
  }

  const memory = parseMeminfo(meminfoStr);

  return {
    connected: true,
    deviceId: targetId,
    model,
    androidVersion,
    battery,
    screen,
    network,
    uptime: {
      formatted: formattedUptime,
      uptimeSeconds,
      raw: rawUptimeStr,
    },
    memory,
    dnd,
    timestamp: new Date().toISOString(),
  };
}
