import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);
const ADB_PATH = "/Users/holyscript/Library/Android/sdk/platform-tools/adb";

export interface SmsResult {
  success: boolean;
  recipient: string;
  message: string;
  method: "adb_isms" | "adb_termux" | "adb_intent" | "simulated";
  output?: string;
  error?: string;
}

export async function isAdbAvailable(): Promise<boolean> {
  return fs.existsSync(ADB_PATH);
}

export async function getConnectedDevices(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(ADB_PATH, ["devices"]);
    const lines = stdout.split("\n").slice(1);
    const devices = lines
      .map((l) => l.trim().split(/\s+/))
      .filter((parts) => parts.length >= 2 && parts[1] === "device")
      .map((parts) => parts[0]);
    return devices;
  } catch {
    return [];
  }
}

/**
 * Dispatches an SMS using the connected Android device's Airtel SIM.
 */
export async function sendAirtelSms(
  recipient: string,
  messageText: string
): Promise<SmsResult> {
  const cleanRecipient = recipient.replace(/[^0-9+]/g, "");
  const devices = await getConnectedDevices();

  if (devices.length === 0) {
    return {
      success: false,
      recipient: cleanRecipient,
      message: messageText,
      method: "adb_isms",
      error: "No Android device currently connected to ADB via USB or Wi-Fi (connect with `adb connect <ip>:5555`).",
    };
  }

  const deviceId = devices[0];

  // Method 1: Try Termux API if installed
  try {
    const { stdout } = await execFileAsync(ADB_PATH, [
      "-s",
      deviceId,
      "shell",
      "termux-sms-send",
      "-n",
      cleanRecipient,
      `"${messageText}"`,
    ]);
    return {
      success: true,
      recipient: cleanRecipient,
      message: messageText,
      method: "adb_termux",
      output: stdout.trim() || "Dispatched via Termux API",
    };
  } catch {}

  // Method 2: Direct Android ISMS service call (standard AOSP)
  try {
    const { stdout } = await execFileAsync(ADB_PATH, [
      "-s",
      deviceId,
      "shell",
      "service",
      "call",
      "isms",
      "7",
      "i32",
      "0",
      "s16",
      "com.android.mms.service",
      "s16",
      cleanRecipient,
      "s16",
      "null",
      "s16",
      `'${messageText.replace(/'/g, "")}'`,
      "s16",
      "null",
      "s16",
      "null",
    ]);
    return {
      success: true,
      recipient: cleanRecipient,
      message: messageText,
      method: "adb_isms",
      output: stdout.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      recipient: cleanRecipient,
      message: messageText,
      method: "adb_isms",
      error: err.message,
    };
  }
}
