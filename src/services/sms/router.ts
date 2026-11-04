/**
 * Fabric OS — Natural Language SMS Intent Classifier & Command Router
 *
 * Dispatches high-agency commands over SMS:
 * - 'spark <minutes>' -> triggers focus sprint via /api/quick dispatcher
 * - 'settle'          -> settles flow block and records +1 Energy
 * - 'status'          -> returns concise 4F vector (-5 to +5) and active tasks
 * - 'note <text>'     -> appends note to ambient blackboard & Firestore
 * - 'mix <topic>'     -> synthesizes dynamic mix and returns YouTube track & link
 * - 'help'            -> returns command menu
 * - Emergency Vitality Alert dispatch for Cybernetic Governor
 */

import fs from "fs";
import path from "path";
import { dispatchQuickAction } from "../../../api/quick.js";
import {
  getCurrentAmbientContext,
  getBlackboardValue,
  logToBlackboard,
} from "../ambient.js";
import {
  deriveFourFVectorFromTelemetry,
  type GovernorBreach,
} from "../governor.js";
import { generateDynamicMix } from "../../music/mixer.js";
import { getSong } from "../../music/store.js";
import { listPlansLocal } from "../../tasks/store.js";
import { knowledgeCollection } from "../../db/firestore.js";
import { SMSClient, getSMSClient } from "./client.js";
import type {
  SMSCommandIntent,
  SMSCommandResult,
  SMSParsedCommand,
  SMSSendResult,
  SMSWebhookPayload,
} from "./types.js";

const SMS_NOTES_FILE = path.resolve(process.cwd(), "data/sms_notes.json");

/**
 * Normalizes user duration strings ("90", "90m", "45min", "1.5h", "2hr") into integer minutes.
 */
export function parseDurationToMinutes(val?: string): number {
  if (!val || !val.trim()) return 60;
  const str = val.trim().toLowerCase();

  // Hours: "1.5h", "2hr", "2hours"
  if (
    str.endsWith("h") ||
    str.endsWith("hr") ||
    str.endsWith("hrs") ||
    str.endsWith("hour") ||
    str.endsWith("hours")
  ) {
    const num = parseFloat(str);
    return isNaN(num) ? 60 : Math.max(5, Math.round(num * 60));
  }

  // Minutes: "90", "90m", "45min"
  const num = parseFloat(str);
  return isNaN(num) ? 60 : Math.max(5, Math.round(num));
}

/**
 * Classifies raw inbound SMS text into structured SMSParsedCommand.
 */
export function classifySMSCommand(rawText: string): SMSParsedCommand {
  const trimmed = (rawText || "").trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return {
      rawText,
      intent: "unknown",
      confidence: 0,
    };
  }

  // 1. HELP: help, /help, ?, commands, menu
  if (/^(?:\/)?(?:help|\?|commands|menu)$/i.test(lower)) {
    return {
      rawText: trimmed,
      intent: "help",
      confidence: 1.0,
    };
  }

  // 2. SPARK: spark 90, /spark 45m, spark 1.5h, spark, start 60, flow 90
  const sparkMatch = trimmed.match(/^(?:\/)?(?:spark|start|flow)(?:\s+(.+))?$/i);
  if (sparkMatch) {
    const durationArg = sparkMatch[1]?.trim();
    const minutes = parseDurationToMinutes(durationArg);
    return {
      rawText: trimmed,
      intent: "spark",
      argument: durationArg || "60m",
      normalizedDurationMinutes: minutes,
      confidence: 0.95,
    };
  }

  // 3. SETTLE: settle, /settle, settle block, done, finish
  if (/^(?:\/)?(?:settle(?:\s+block)?|done|finish)$/i.test(lower)) {
    return {
      rawText: trimmed,
      intent: "settle",
      confidence: 0.95,
    };
  }

  // 4. STATUS: status, /status, pulse, state, vitals, health
  if (/^(?:\/)?(?:status|pulse|state|vitals|health)$/i.test(lower)) {
    return {
      rawText: trimmed,
      intent: "status",
      confidence: 0.95,
    };
  }

  // 5. NOTE: note <text>, /note <text>, memo <text>, log <text>
  const noteMatch = trimmed.match(/^(?:\/)?(?:note|memo|log)\s+([\s\S]+)$/i);
  if (noteMatch) {
    return {
      rawText: trimmed,
      intent: "note",
      argument: noteMatch[1].trim(),
      confidence: 0.95,
    };
  }

  // 6. MIX: mix <topic>, /mix <topic>, dj <topic>, playlist <topic>
  const mixMatch = trimmed.match(/^(?:\/)?(?:mix|dj|playlist)\s+([\s\S]+)$/i);
  if (mixMatch) {
    return {
      rawText: trimmed,
      intent: "mix",
      argument: mixMatch[1].trim(),
      confidence: 0.95,
    };
  }

  return {
    rawText: trimmed,
    intent: "unknown",
    confidence: 0.1,
  };
}

/**
 * Formats a Governor alert into a crisp, high-urgency SMS message.
 */
export function formatGovernorAlertSMS(breach: GovernorBreach): string {
  const icon = breach.severity === "critical" ? "🚨" : "⚠️";
  return (
    `${icon} Fabric OS Alert [${breach.severity.toUpperCase()}]: ${breach.title}\n` +
    `Metric: ${breach.metricObserved} (Limit: ${breach.threshold})\n` +
    `Action: ${breach.actionRequired}`
  );
}

/**
 * Dispatches an emergency vitality alert from the Cybernetic Governor.
 */
export async function dispatchGovernorEmergencyAlert(
  breach: GovernorBreach,
  options: {
    client?: SMSClient;
    to?: string;
    force?: boolean;
  } = {}
): Promise<SMSSendResult | null> {
  // Only dispatch if breach is critical, or explicitly forced
  if (!options.force && breach.severity !== "critical" && breach.recommendedActuationLevel < 3) {
    return null;
  }

  const client = options.client || getSMSClient();
  const recipient = options.to || client.config.operatorPhoneNumber || "+10000000000";
  const alertText = formatGovernorAlertSMS(breach);

  return await client.sendWithFallback(recipient, alertText);
}

/**
 * Ingests inbound SMS, parses intent, executes action, and produces reply text.
 */
export async function processIncomingSMS(
  payload: SMSWebhookPayload | string,
  options: {
    client?: SMSClient;
    replyViaSms?: boolean;
    operatorPhone?: string;
  } = {}
): Promise<SMSCommandResult> {
  const client = options.client || getSMSClient();

  // 1. Normalize Payload
  let rawText = "";
  let senderPhone = "";

  if (typeof payload === "string") {
    rawText = payload;
  } else if (payload && typeof payload === "object") {
    // Check nested httpSMS event data
    if (payload.data) {
      rawText = payload.data.content || payload.data.message || "";
      senderPhone = payload.data.contact || payload.data.from || "";
    } else {
      // Check flat payload
      rawText = payload.content || payload.message || payload.text || "";
      senderPhone = payload.from || payload.contact || payload.phone || "";
    }
  }

  const parsed = classifySMSCommand(rawText);
  let replyText = "";
  let success = true;
  let resultData: any = null;

  // 2. Command Execution Switchboard
  switch (parsed.intent) {
    case "spark": {
      const minutes = parsed.normalizedDurationMinutes || 60;
      const durationStr = `${minutes}m`;
      const quickRes = await dispatchQuickAction("spark", {
        duration: durationStr,
        task: "SMS Focus Block",
      });
      resultData = quickRes;
      replyText = `🔥 Fabric Focus: Sparked ${minutes} min sprint (${(minutes / 60).toFixed(1)}h). Flow block engaged.`;
      break;
    }

    case "settle": {
      const settleRes = await dispatchQuickAction("settle", {
        energyDelta: 1,
      });
      resultData = settleRes;
      const moduleName = settleRes.trade?.moduleName || "Flow Session";
      replyText = `⚡ Fabric Ledger: Settled "${moduleName}". +1 Energy recorded & yield logged.`;
      break;
    }

    case "status": {
      try {
        const ambientCtx = await getCurrentAmbientContext();
        const { fourF } = deriveFourFVectorFromTelemetry(ambientCtx);

        const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
        const vectorStr = `F:${fmt(fourF.focus)} | Fct:${fmt(fourF.facts)} | Fnd:${fmt(fourF.funds)} | Fbk:${fmt(fourF.feedback)}`;

        // Check active session
        const quickStatus = await dispatchQuickAction("status");
        const sessionActive = quickStatus.data?.session?.active;
        const taskName = sessionActive
          ? `${quickStatus.data.session.task} (${quickStatus.data.session.duration}h)`
          : "Idle";

        // Check HTN plans
        const localPlans = await listPlansLocal().catch(() => []);
        const inProgress = localPlans.filter(
          (p) => p.status === "running" || p.status === "pending"
        );
        const taskInfo = sessionActive
          ? taskName
          : inProgress.length > 0
          ? `${inProgress[0].goal.slice(0, 25)} (${inProgress.length} active)`
          : "Idle";

        const app = ambientCtx.frontmostApp?.name || "Mac";

        replyText =
          `⚡ Fabric OS Pulse:\n` +
          `📊 4F: ${vectorStr}\n` +
          `🎯 Active: ${taskInfo}\n` +
          `💻 Surface: ${app}`;
        resultData = { fourF, session: quickStatus.data?.session, frontmostApp: app };
      } catch (err: any) {
        replyText = `⚡ Fabric OS: Online. Focus vector nominal. Active: Idle.`;
      }
      break;
    }

    case "note": {
      const noteContent = parsed.argument || "";
      if (!noteContent) {
        replyText = `⚠️ Missing note content. Usage: note <text>`;
        success = false;
        break;
      }

      const noteEntry = {
        text: noteContent,
        timestamp: new Date().toISOString(),
        source: "sms",
        sender: senderPhone || "operator",
      };

      // 1. Blackboard persistence
      try {
        const currentNotes = (await getBlackboardValue<any[]>("sms_notes")) || [];
        await logToBlackboard("sms_notes", [...currentNotes.slice(-50), noteEntry]);
        await logToBlackboard("latest_sms_note", noteEntry);
      } catch {}

      // 2. Local JSON append
      try {
        const dir = path.dirname(SMS_NOTES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const existing = fs.existsSync(SMS_NOTES_FILE)
          ? JSON.parse(fs.readFileSync(SMS_NOTES_FILE, "utf-8"))
          : [];
        existing.push(noteEntry);
        fs.writeFileSync(SMS_NOTES_FILE, JSON.stringify(existing.slice(-200), null, 2), "utf-8");
      } catch {}

      // 3. Firestore async attempt (non-blocking)
      try {
        knowledgeCollection
          .add({
            title: `SMS Note: ${noteContent.slice(0, 30)}`,
            content: noteContent,
            source: "sms",
            createdAt: new Date().toISOString(),
          })
          .catch(() => {});
      } catch {}

      const snippet = noteContent.length > 45 ? `${noteContent.slice(0, 42)}...` : noteContent;
      replyText = `📝 Fabric Blackboard: Note recorded: "${snippet}"`;
      resultData = noteEntry;
      break;
    }

    case "mix": {
      const topic = parsed.argument || "deep focus";
      try {
        const playlist = await generateDynamicMix({
          intent: topic,
          name: `SMS Mix: ${topic.slice(0, 20)}`,
          targetDurationMinutes: 60,
        });

        let topSong = null;
        if (playlist.songIds && playlist.songIds.length > 0) {
          topSong = await getSong(playlist.songIds[0]);
        }

        if (topSong) {
          replyText =
            `🎵 Fabric Sonic Mix: "${playlist.name}"\n` +
            `Track: ${topSong.title} (${topSong.artist})\n` +
            `🔗 ${topSong.url}`;
        } else {
          const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
            topic + " lofi ambient focus"
          )}`;
          replyText =
            `🎵 Fabric Sonic Mix: "${playlist.name}"\n` +
            `Track: Synthesized Flow Sequence (${topic})\n` +
            `🔗 ${ytUrl}`;
        }
        resultData = { playlist, topSong };
      } catch (err: any) {
        replyText = `🎵 Fabric Sonic Mix: Synthesizing flow playlist for "${topic}".`;
      }
      break;
    }

    case "help": {
      replyText =
        `🤖 Fabric OS SMS Gateway:\n` +
        `• spark <mins>: Start focus sprint\n` +
        `• settle: Complete session (+1 Energy)\n` +
        `• status: 4F vector & active tasks\n` +
        `• note <text>: Save blackboard note\n` +
        `• mix <topic>: Dynamic flow mix`;
      break;
    }

    case "unknown":
    default: {
      success = false;
      replyText =
        `❓ Unknown command "${parsed.rawText.slice(0, 25)}". Send 'help' for available Fabric OS commands.`;
      break;
    }
  }

  // 3. Dispatch automated reply SMS if requested and recipient phone is present
  let sentReplyResult: SMSSendResult | undefined;
  const shouldReply = options.replyViaSms ?? Boolean(senderPhone);
  if (shouldReply && senderPhone) {
    try {
      sentReplyResult = await client.sendWithFallback(senderPhone, replyText);
    } catch {
      // Non-blocking reply error
    }
  }

  return {
    intent: parsed.intent,
    parsed,
    replyText,
    success,
    resultData,
    sentReplyResult,
  };
}
