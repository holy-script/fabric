/**
 * Fabric OS — SMS Gateway & Android Umbilical Types
 *
 * Defines schemas for SMS messaging, httpSMS webhook ingestion,
 * natural language command routing, and Android ADB SMS fallback.
 */

export type SMSProvider = "httpsms" | "adb" | "mock";

export type SMSCommandIntent =
  | "spark"
  | "settle"
  | "status"
  | "note"
  | "mix"
  | "help"
  | "unknown";

export interface SMSMessage {
  id?: string;
  from: string;
  to: string;
  content: string;
  timestamp?: string | number;
  status?: "pending" | "sent" | "delivered" | "failed" | "received" | string;
  provider?: SMSProvider;
  metadata?: Record<string, any>;
}

export interface HttpSmsEventData {
  id?: string;
  owner?: string;
  contact?: string;
  from?: string;
  to?: string;
  content?: string;
  message?: string;
  type?: "incoming" | "outgoing" | string;
  status?: string;
  timestamp?: string | number;
  created_at?: string;
  sim?: string;
}

export interface SMSWebhookPayload {
  id?: string;
  event?: string;
  type?: string;
  data?: HttpSmsEventData;

  // Direct flat payload support for alternative gateway webhooks or Termux
  from?: string;
  to?: string;
  contact?: string;
  phone?: string;
  content?: string;
  message?: string;
  text?: string;
  timestamp?: string | number;
}

export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  provider: SMSProvider;
  error?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface SMSConfig {
  provider?: SMSProvider;
  httpSmsApiKey?: string;
  httpSmsBaseUrl?: string;
  defaultFromNumber?: string;
  operatorPhoneNumber?: string;
  adbDeviceId?: string;
  adbSmsMethod?: "isms" | "termux" | "intent";
  timeoutMs?: number;
}

export interface SMSParsedCommand {
  rawText: string;
  intent: SMSCommandIntent;
  argument?: string;
  normalizedDurationMinutes?: number;
  confidence: number;
}

export interface SMSCommandResult {
  intent: SMSCommandIntent;
  parsed: SMSParsedCommand;
  replyText: string;
  success: boolean;
  resultData?: any;
  sentReplyResult?: SMSSendResult;
}
