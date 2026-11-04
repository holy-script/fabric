/**
 * Fabric OS — SMS Gateway & Android Umbilical Client
 *
 * Implements SMS sending via:
 * 1. httpSMS Cloud/Self-Hosted Gateway (REST API v1)
 * 2. Local Android ADB Umbilical (service call isms / Termux SMS broadcast)
 * 3. In-memory Mock Provider (for offline development & deterministic testing)
 */

import { execAdb, isAdbAvailable, getActiveDevice } from "../telemetry-adb.js";
import type {
  SMSConfig,
  SMSMessage,
  SMSProvider,
  SMSSendResult,
} from "./types.js";

export const DEFAULT_HTTPSMS_BASE_URL = "https://api.httpsms.com/v1";

/**
 * Global in-memory storage for mock SMS messages.
 */
const mockMessageStore: SMSMessage[] = [];

/**
 * Retrieves all sent messages stored in the mock provider.
 */
export function getMockSentMessages(): SMSMessage[] {
  return [...mockMessageStore];
}

/**
 * Clears in-memory mock message storage.
 */
export function clearMockMessages(): void {
  mockMessageStore.length = 0;
}

/**
 * Builds the ADB shell arguments for sending SMS on Android.
 */
export function buildAdbSmsArgs(
  to: string,
  content: string,
  method: "isms" | "termux" | "intent" = "isms"
): string[] {
  // Sanitize double quotes and backslashes for shell safety
  const safeContent = content.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const safeTo = to.replace(/[^0-9+*#]/g, "");

  switch (method) {
    case "termux":
      return [
        "shell",
        `am broadcast -a com.termux.api.sms.SEND -e number "${safeTo}" -e message "${safeContent}"`,
      ];
    case "intent":
      return [
        "shell",
        `am start -a android.intent.action.SENDTO -d "sms:${safeTo}" --es sms_body "${safeContent}" --ez exit_on_sent true`,
      ];
    case "isms":
    default:
      // Standard Android ISms IPC call (transaction 7 is sendText)
      return [
        "shell",
        `service call isms 7 i32 0 s16 "com.android.mms" s16 "${safeTo}" s16 "null" s16 "${safeContent}" s16 "null" s16 "null"`,
      ];
  }
}

export interface SMSClientOptions extends SMSConfig {
  /**
   * Custom fetch implementation (useful for mocking HTTP requests in unit tests)
   */
  fetcher?: typeof fetch;
}

export class SMSClient {
  public config: SMSConfig;
  private fetcher: typeof fetch;

  constructor(options: SMSClientOptions = {}) {
    this.config = {
      provider:
        options.provider ||
        (process.env.SMS_PROVIDER as SMSProvider) ||
        (process.env.HTTPSMS_API_KEY ? "httpsms" : "mock"),
      httpSmsApiKey:
        options.httpSmsApiKey || process.env.HTTPSMS_API_KEY || "",
      httpSmsBaseUrl:
        options.httpSmsBaseUrl ||
        process.env.HTTPSMS_BASE_URL ||
        DEFAULT_HTTPSMS_BASE_URL,
      defaultFromNumber:
        options.defaultFromNumber ||
        process.env.HTTPSMS_FROM_NUMBER ||
        process.env.OPERATOR_PHONE_NUMBER ||
        "+10000000000",
      operatorPhoneNumber:
        options.operatorPhoneNumber ||
        process.env.OPERATOR_PHONE_NUMBER ||
        "+10000000000",
      adbDeviceId: options.adbDeviceId || process.env.ADB_DEVICE_ID,
      adbSmsMethod: options.adbSmsMethod || "isms",
      timeoutMs: options.timeoutMs || 8000,
    };

    this.fetcher = options.fetcher || globalThis.fetch;
  }

  /**
   * Sends an SMS via the configured provider.
   */
  public async sendMessage(
    to: string,
    content: string,
    from?: string,
    explicitProvider?: SMSProvider
  ): Promise<SMSSendResult> {
    const provider = explicitProvider || this.config.provider || "mock";
    const sender = from || this.config.defaultFromNumber || "+10000000000";

    switch (provider) {
      case "httpsms":
        return this.sendViaHttpSms(to, content, sender);
      case "adb":
        return this.sendViaAdb(to, content);
      case "mock":
      default:
        return this.sendViaMock(to, content, sender);
    }
  }

  /**
   * Sends an SMS with automatic graceful fallback across the tier hierarchy:
   * 1. httpSMS API -> 2. Local Android ADB -> 3. In-memory Mock
   */
  public async sendWithFallback(
    to: string,
    content: string,
    from?: string
  ): Promise<SMSSendResult> {
    const primary = this.config.provider || "httpsms";
    const sender = from || this.config.defaultFromNumber || "+10000000000";

    // 1. Try Primary Provider
    try {
      const res = await this.sendMessage(to, content, sender, primary);
      if (res.success) {
        return res;
      }
    } catch {
      // Continue to fallback
    }

    // 2. Fallback to ADB if primary was httpSMS
    if (primary === "httpsms") {
      try {
        const adbAvailable = await isAdbAvailable();
        if (adbAvailable) {
          const { status } = await getActiveDevice();
          if (status === "connected") {
            const adbRes = await this.sendViaAdb(to, content);
            if (adbRes.success) {
              return adbRes;
            }
          }
        }
      } catch {
        // Fallback to mock
      }
    }

    // 3. Fallback to Mock provider for resilient survival
    return this.sendViaMock(to, content, sender);
  }

  /**
   * Sends SMS using httpSMS REST API (POST /v1/messages/send)
   */
  public async sendViaHttpSms(
    to: string,
    content: string,
    from?: string
  ): Promise<SMSSendResult> {
    const timestamp = new Date().toISOString();
    const apiKey = this.config.httpSmsApiKey;
    if (!apiKey) {
      return {
        success: false,
        provider: "httpsms",
        error: "Missing httpSMS API key (HTTPSMS_API_KEY)",
        timestamp,
      };
    }

    const baseUrl = (this.config.httpSmsBaseUrl || DEFAULT_HTTPSMS_BASE_URL).replace(/\/$/, "");
    const url = `${baseUrl}/messages/send`;

    const requestBody: Record<string, string> = {
      content,
      to,
    };
    const sender = from || this.config.defaultFromNumber;
    if (sender) {
      requestBody.from = sender;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 8000);

    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMessage =
          json?.message || json?.error || `httpSMS API error: HTTP ${response.status}`;
        return {
          success: false,
          provider: "httpsms",
          error: errMessage,
          timestamp,
          details: json,
        };
      }

      const messageId = json?.data?.id || `httpsms_${Date.now()}`;
      return {
        success: true,
        messageId,
        provider: "httpsms",
        timestamp,
        details: json?.data || json,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        provider: "httpsms",
        error: err?.message || String(err),
        timestamp,
      };
    }
  }

  /**
   * Sends SMS via local Android ADB command.
   */
  public async sendViaAdb(to: string, content: string): Promise<SMSSendResult> {
    const timestamp = new Date().toISOString();

    try {
      const method = this.config.adbSmsMethod || "isms";
      const args = buildAdbSmsArgs(to, content, method);
      const { stdout, stderr } = await execAdb(
        args,
        this.config.adbDeviceId,
        this.config.timeoutMs || 8000
      );

      const messageId = `adb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return {
        success: true,
        messageId,
        provider: "adb",
        timestamp,
        details: { stdout, stderr, method },
      };
    } catch (err: any) {
      return {
        success: false,
        provider: "adb",
        error: err?.message || "ADB SMS delivery failed",
        timestamp,
      };
    }
  }

  /**
   * In-memory Mock SMS Delivery (Deterministic & Antifragile).
   */
  public async sendViaMock(
    to: string,
    content: string,
    from?: string
  ): Promise<SMSSendResult> {
    const timestamp = new Date().toISOString();
    const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const message: SMSMessage = {
      id,
      from: from || this.config.defaultFromNumber || "+10000000000",
      to,
      content,
      timestamp,
      status: "delivered",
      provider: "mock",
    };

    mockMessageStore.push(message);

    return {
      success: true,
      messageId: id,
      provider: "mock",
      timestamp,
      details: { storedCount: mockMessageStore.length },
    };
  }
}

/**
 * Default global SMSClient singleton instance.
 */
let defaultClientInstance: SMSClient | null = null;

export function getSMSClient(options?: SMSClientOptions): SMSClient {
  if (options) {
    return new SMSClient(options);
  }
  if (!defaultClientInstance) {
    defaultClientInstance = new SMSClient();
  }
  return defaultClientInstance;
}
