import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  SMSClient,
  buildAdbSmsArgs,
  getMockSentMessages,
  clearMockMessages,
} from "../src/services/sms/client.js";
import {
  classifySMSCommand,
  parseDurationToMinutes,
  formatGovernorAlertSMS,
  dispatchGovernorEmergencyAlert,
  processIncomingSMS,
} from "../src/services/sms/router.js";
import type {
  SMSWebhookPayload,
  SMSConfig,
} from "../src/services/sms/types.js";
import type { GovernorBreach } from "../src/services/governor.js";
import { executeActuationCascade } from "../src/services/governor.js";
import smsWebhookHandler from "../api/sms/webhook.js";

describe("Fabric OS — SMS Gateway & Android Umbilical Subsystem QC Suite", () => {
  beforeEach(() => {
    clearMockMessages();
  });

  // =========================================================================
  // 1. Natural Language Intent Classifier & Duration Normalizer
  // =========================================================================
  describe("1. Command Intent Parsing & Duration Normalization", () => {
    it("correctly normalizes various duration expressions into minutes", () => {
      expect(parseDurationToMinutes("90")).toBe(90);
      expect(parseDurationToMinutes("90m")).toBe(90);
      expect(parseDurationToMinutes("45min")).toBe(45);
      expect(parseDurationToMinutes("1.5h")).toBe(90);
      expect(parseDurationToMinutes("2hr")).toBe(120);
      expect(parseDurationToMinutes("2.5 hours")).toBe(150);
      expect(parseDurationToMinutes("")).toBe(60);
      expect(parseDurationToMinutes(undefined)).toBe(60);
    });

    it("parses diverse 'spark' variations", () => {
      const p1 = classifySMSCommand("spark 90");
      expect(p1.intent).toBe("spark");
      expect(p1.normalizedDurationMinutes).toBe(90);

      const p2 = classifySMSCommand("/spark 45m");
      expect(p2.intent).toBe("spark");
      expect(p2.normalizedDurationMinutes).toBe(45);

      const p3 = classifySMSCommand("spark 1.5h");
      expect(p3.intent).toBe("spark");
      expect(p3.normalizedDurationMinutes).toBe(90);

      const p4 = classifySMSCommand("spark");
      expect(p4.intent).toBe("spark");
      expect(p4.normalizedDurationMinutes).toBe(60);

      const p5 = classifySMSCommand("start 30");
      expect(p5.intent).toBe("spark");
      expect(p5.normalizedDurationMinutes).toBe(30);

      const p6 = classifySMSCommand("flow 120min");
      expect(p6.intent).toBe("spark");
      expect(p6.normalizedDurationMinutes).toBe(120);
    });

    it("parses 'settle' trade command variations", () => {
      expect(classifySMSCommand("settle").intent).toBe("settle");
      expect(classifySMSCommand("/settle").intent).toBe("settle");
      expect(classifySMSCommand("settle block").intent).toBe("settle");
      expect(classifySMSCommand("done").intent).toBe("settle");
      expect(classifySMSCommand("finish").intent).toBe("settle");
    });

    it("parses 'status' and telemetry pulse variations", () => {
      expect(classifySMSCommand("status").intent).toBe("status");
      expect(classifySMSCommand("/status").intent).toBe("status");
      expect(classifySMSCommand("pulse").intent).toBe("status");
      expect(classifySMSCommand("state").intent).toBe("status");
      expect(classifySMSCommand("vitals").intent).toBe("status");
    });

    it("parses 'note' and blackboard logging commands", () => {
      const p1 = classifySMSCommand("note remember to review BDBN graph formulas");
      expect(p1.intent).toBe("note");
      expect(p1.argument).toBe("remember to review BDBN graph formulas");

      const p2 = classifySMSCommand("/note Sync with IITM Quiz 1 PYQ archive");
      expect(p2.intent).toBe("note");
      expect(p2.argument).toBe("Sync with IITM Quiz 1 PYQ archive");

      const p3 = classifySMSCommand("memo check FOCI respiration sensor battery");
      expect(p3.intent).toBe("note");
      expect(p3.argument).toBe("check FOCI respiration sensor battery");
    });

    it("parses 'mix' dynamic soundscapes & sonic DJ queries", () => {
      const p1 = classifySMSCommand("mix deep work");
      expect(p1.intent).toBe("mix");
      expect(p1.argument).toBe("deep work");

      const p2 = classifySMSCommand("/mix study beats");
      expect(p2.intent).toBe("mix");
      expect(p2.argument).toBe("study beats");

      const p3 = classifySMSCommand("dj ambient synthwave");
      expect(p3.intent).toBe("mix");
      expect(p3.argument).toBe("ambient synthwave");
    });

    it("parses 'help' and handles unknown fallback text", () => {
      expect(classifySMSCommand("help").intent).toBe("help");
      expect(classifySMSCommand("/help").intent).toBe("help");
      expect(classifySMSCommand("?").intent).toBe("help");
      expect(classifySMSCommand("commands").intent).toBe("help");

      const unknown = classifySMSCommand("what is the weather today in Tokyo");
      expect(unknown.intent).toBe("unknown");
      expect(unknown.confidence).toBeLessThan(0.5);

      const empty = classifySMSCommand("");
      expect(empty.intent).toBe("unknown");
    });
  });

  // =========================================================================
  // 2. Multi-Provider Dispatch (httpSMS, ADB, Mock)
  // =========================================================================
  describe("2. Provider Dispatch & Formatting", () => {
    it("formats ADB shell command correctly across isms, termux, and intent methods", () => {
      const to = "+19876543210";
      const text = 'Fabric OS Alert: Focus time limit reached. Break now!';

      // 1. isms (standard Android IPC)
      const ismsArgs = buildAdbSmsArgs(to, text, "isms");
      expect(ismsArgs[0]).toBe("shell");
      expect(ismsArgs[1]).toContain("service call isms 7");
      expect(ismsArgs[1]).toContain("+19876543210");
      expect(ismsArgs[1]).toContain("Focus time limit reached");

      // 2. termux (Termux API broadcast)
      const termuxArgs = buildAdbSmsArgs(to, text, "termux");
      expect(termuxArgs[0]).toBe("shell");
      expect(termuxArgs[1]).toContain("com.termux.api.sms.SEND");
      expect(termuxArgs[1]).toContain("-e number \"+19876543210\"");

      // 3. intent (Android SENDTO intent)
      const intentArgs = buildAdbSmsArgs(to, text, "intent");
      expect(intentArgs[0]).toBe("shell");
      expect(intentArgs[1]).toContain("android.intent.action.SENDTO");
      expect(intentArgs[1]).toContain("sms:+19876543210");
    });

    it("dispatches httpSMS REST API requests with proper headers, payload, and response mapping", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      const mockFetcher = async (url: any, opts: any) => {
        capturedUrl = String(url);
        capturedHeaders = opts.headers;
        capturedBody = JSON.parse(opts.body);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: {
              id: "httpsms_msg_998877",
              owner: "+15550001111",
              contact: "+19876543210",
              content: capturedBody.content,
              status: "pending",
            },
          }),
        } as any;
      };

      const client = new SMSClient({
        provider: "httpsms",
        httpSmsApiKey: "test_secret_key_abc",
        defaultFromNumber: "+15550001111",
        fetcher: mockFetcher,
      });

      const result = await client.sendMessage(
        "+19876543210",
        "Fabric OS: Vitality at optimal level"
      );

      expect(result.success).toBe(true);
      expect(result.provider).toBe("httpsms");
      expect(result.messageId).toBe("httpsms_msg_998877");
      expect(capturedUrl).toBe("https://api.httpsms.com/v1/messages/send");
      expect(capturedHeaders["x-api-key"]).toBe("test_secret_key_abc");
      expect(capturedHeaders["Content-Type"]).toBe("application/json");
      expect(capturedBody.to).toBe("+19876543210");
      expect(capturedBody.from).toBe("+15550001111");
      expect(capturedBody.content).toBe("Fabric OS: Vitality at optimal level");
    });

    it("handles httpSMS API errors gracefully", async () => {
      const mockErrorFetcher = async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          status: "error",
          message: "Invalid API Key provided",
        }),
      } as any);

      const client = new SMSClient({
        provider: "httpsms",
        httpSmsApiKey: "bad_key",
        fetcher: mockErrorFetcher,
      });

      const result = await client.sendMessage("+19876543210", "Test message");
      expect(result.success).toBe(false);
      expect(result.provider).toBe("httpsms");
      expect(result.error).toContain("Invalid API Key");
    });

    it("dispatches and records messages reliably with mock provider", async () => {
      const client = new SMSClient({ provider: "mock", defaultFromNumber: "+15559998888" });

      const res = await client.sendMessage("+12223334444", "Test via mock");
      expect(res.success).toBe(true);
      expect(res.provider).toBe("mock");
      expect(res.messageId).toMatch(/^mock_/);

      const sent = getMockSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe("+12223334444");
      expect(sent[0].from).toBe("+15559998888");
      expect(sent[0].content).toBe("Test via mock");
    });

    it("falls back gracefully to mock provider if httpSMS fails", async () => {
      const failingFetcher = async () => {
        throw new Error("Network timeout: gateway unreachable");
      };

      const client = new SMSClient({
        provider: "httpsms",
        httpSmsApiKey: "valid_key",
        fetcher: failingFetcher,
      });

      // sendWithFallback should catch httpSMS error and gracefully degrade to mock
      const result = await client.sendWithFallback("+19876543210", "Resilient dispatch");
      expect(result.success).toBe(true);
      expect(result.provider).toBe("mock");

      const sent = getMockSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].content).toBe("Resilient dispatch");
    });
  });

  // =========================================================================
  // 3. Inbound Webhook Ingestion & Command Execution
  // =========================================================================
  describe("3. Inbound Webhook Ingestion & Execution Switchboard", () => {
    it("processes httpSMS event payload for 'spark 90' and replies with confirmation", async () => {
      const payload: SMSWebhookPayload = {
        type: "message.received",
        data: {
          id: "evt_12345",
          owner: "+15550001111",
          contact: "+19876543210",
          content: "spark 90",
          type: "incoming",
        },
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, {
        client: mockClient,
        replyViaSms: true,
      });

      expect(result.success).toBe(true);
      expect(result.intent).toBe("spark");
      expect(result.parsed.normalizedDurationMinutes).toBe(90);
      expect(result.replyText).toContain("Sparked 90 min sprint");

      const sentReplies = getMockSentMessages();
      expect(sentReplies.length).toBe(1);
      expect(sentReplies[0].to).toBe("+19876543210");
      expect(sentReplies[0].content).toContain("Sparked 90 min sprint");
    });

    it("processes 'settle' command, records +1 Energy, and returns trade confirmation", async () => {
      const payload: SMSWebhookPayload = {
        from: "+19876543210",
        content: "settle",
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, { client: mockClient });

      expect(result.success).toBe(true);
      expect(result.intent).toBe("settle");
      expect(result.replyText).toContain("Settled");
      expect(result.replyText).toContain("+1 Energy recorded");
      expect(result.resultData?.trade?.energyDelta).toBe(1);
    });

    it("processes 'status' command and formats 4F vector pulse", async () => {
      const payload: SMSWebhookPayload = {
        from: "+19876543210",
        content: "status",
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, { client: mockClient });

      expect(result.success).toBe(true);
      expect(result.intent).toBe("status");
      expect(result.replyText).toContain("Fabric OS Pulse");
      expect(result.replyText).toContain("4F:");
      expect(result.replyText).toContain("Active:");
    });

    it("processes 'note' command and logs to blackboard", async () => {
      const payload: SMSWebhookPayload = {
        from: "+19876543210",
        content: "note remember to review BDBN graph formulas",
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, { client: mockClient });

      expect(result.success).toBe(true);
      expect(result.intent).toBe("note");
      expect(result.replyText).toContain("Note recorded");
      expect(result.replyText).toContain("remember to review BDBN graph formulas");
      expect(result.resultData?.text).toBe("remember to review BDBN graph formulas");
    });

    it("processes 'mix deep work' command and generates sonic mix with link", async () => {
      const payload: SMSWebhookPayload = {
        from: "+19876543210",
        content: "mix deep work",
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, { client: mockClient });

      expect(result.success).toBe(true);
      expect(result.intent).toBe("mix");
      expect(result.replyText).toContain("Fabric Sonic Mix");
      expect(result.replyText).toContain("Track:");
      expect(result.replyText).toContain("http");
    });

    it("processes 'help' command with clean menu formatting", async () => {
      const payload: SMSWebhookPayload = {
        from: "+19876543210",
        content: "help",
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, { client: mockClient });

      expect(result.success).toBe(true);
      expect(result.intent).toBe("help");
      expect(result.replyText).toContain("Fabric OS SMS Gateway");
      expect(result.replyText).toContain("spark <mins>");
      expect(result.replyText).toContain("settle");
      expect(result.replyText).toContain("mix <topic>");
    });

    it("handles unknown input with guidance", async () => {
      const payload: SMSWebhookPayload = {
        from: "+19876543210",
        content: "xyz123 random text",
      };

      const mockClient = new SMSClient({ provider: "mock" });
      const result = await processIncomingSMS(payload, { client: mockClient });

      expect(result.success).toBe(false);
      expect(result.intent).toBe("unknown");
      expect(result.replyText).toContain("Unknown command");
      expect(result.replyText).toContain("Send 'help'");
    });
  });

  // =========================================================================
  // 4. Serverless Webhook HTTP Handler Endpoint (/api/sms/webhook)
  // =========================================================================
  describe("4. Serverless Webhook Handler Endpoint (/api/sms/webhook)", () => {
    it("handles GET verification / ping requests", async () => {
      let statusCode = 0;
      let outputBody = "";

      const req: any = {
        method: "GET",
        headers: { host: "fabric-one-sage.vercel.app" },
        url: "/api/sms/webhook",
      };

      const res: any = {
        statusCode: 0,
        setHeader: () => {},
        end: (body: string) => {
          outputBody = body;
        },
      };

      await smsWebhookHandler(req, res);

      const parsed = JSON.parse(outputBody);
      expect(parsed.status).toBe("ok");
      expect(parsed.service).toContain("Fabric OS SMS Gateway");
    });

    it("handles GET query simulation: /api/sms/webhook?content=status", async () => {
      let outputBody = "";
      const req: any = {
        method: "GET",
        headers: { host: "fabric-one-sage.vercel.app" },
        url: "/api/sms/webhook?content=status",
      };

      const res: any = {
        statusCode: 0,
        setHeader: () => {},
        end: (body: string) => {
          outputBody = body;
        },
      };

      await smsWebhookHandler(req, res);

      const parsed = JSON.parse(outputBody);
      expect(parsed.status).toBe("ok");
      expect(parsed.intent).toBe("status");
      expect(parsed.replyText).toContain("Fabric OS Pulse");
    });

    it("handles POST webhook payload for spark 45 and returns JSON response", async () => {
      let outputBody = "";
      const webhookPayload = {
        type: "message.received",
        data: {
          contact: "+19876543210",
          content: "spark 45",
        },
      };

      const req: any = {
        method: "POST",
        headers: { host: "fabric-one-sage.vercel.app" },
        url: "/api/sms/webhook",
        body: JSON.stringify(webhookPayload),
      };

      const res: any = {
        statusCode: 0,
        setHeader: () => {},
        end: (body: string) => {
          outputBody = body;
        },
      };

      await smsWebhookHandler(req, res);

      const parsed = JSON.parse(outputBody);
      expect(parsed.status).toBe("ok");
      expect(parsed.intent).toBe("spark");
      expect(parsed.replyText).toContain("Sparked 45 min sprint");
    });
  });

  // =========================================================================
  // 5. Cybernetic Governor Emergency Vitality Alert Integration
  // =========================================================================
  describe("5. Governor Emergency Vitality Alert Dispatch", () => {
    it("formats emergency vitality breach alert with high urgency", () => {
      const breach: GovernorBreach = {
        ruleId: "depleted_vitality",
        title: "Critical Vitality Depletion Detected",
        description: "FOCI recovery score 32/100 and negative funds vector.",
        severity: "critical",
        recommendedActuationLevel: 3,
        metricObserved: "FOCI Recovery: 32/100, Funds: -3.0",
        threshold: "< 45/100",
        actionRequired: "Enforce 15-minute complete cognitive shutdown and hydration.",
      };

      const text = formatGovernorAlertSMS(breach);
      expect(text).toContain("🚨 Fabric OS Alert [CRITICAL]");
      expect(text).toContain("Critical Vitality Depletion Detected");
      expect(text).toContain("Action: Enforce 15-minute complete cognitive shutdown");
    });

    it("dispatches emergency alert to operator phone via SMSClient", async () => {
      const mockClient = new SMSClient({
        provider: "mock",
        operatorPhoneNumber: "+15551234567",
      });

      const breach: GovernorBreach = {
        ruleId: "depleted_vitality",
        title: "Critical Vitality Depletion Detected",
        description: "Severe biometric fatigue",
        severity: "critical",
        recommendedActuationLevel: 3,
        metricObserved: "Recovery 28",
        threshold: "< 45",
        actionRequired: "Immediate rest",
      };

      const result = await dispatchGovernorEmergencyAlert(breach, {
        client: mockClient,
      });

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);

      const sent = getMockSentMessages();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe("+15551234567");
      expect(sent[0].content).toContain("Critical Vitality Depletion Detected");
    });

    it("integrates emergency SMS alert into Governor Level 3 Actuation Cascade", async () => {
      const criticalBreach: GovernorBreach = {
        ruleId: "depleted_vitality",
        title: "Critical Vitality Depletion Detected",
        description: "FOCI Recovery index below critical boundary",
        severity: "critical",
        recommendedActuationLevel: 3,
        metricObserved: "Recovery: 35/100",
        threshold: "< 45/100",
        actionRequired: "Rest immediately",
      };

      let smsAlertSent = false;
      let smsAlertText = "";

      const actuator = {
        updateDynamicIsland: async () => true,
        sendMacNotification: async () => true,
        sendRaycastToast: async () => true,
        triggerAndroidZenMode: async () => true,
        sendSmsAlert: async (message: string) => {
          smsAlertSent = true;
          smsAlertText = message;
          return true;
        },
      };

      const cascadeResult = await executeActuationCascade(3, [criticalBreach], {
        actuator,
      });

      expect(cascadeResult.level1_island_pulse).toBe(true);
      expect(cascadeResult.level2_notification).toBe(true);
      expect(cascadeResult.level3_zen_mode).toBe(true);
      expect(cascadeResult.level3_sms_alert).toBe(true);
      expect(smsAlertSent).toBe(true);
      expect(smsAlertText).toContain("Critical Vitality Depletion Detected");
    });
  });
});
