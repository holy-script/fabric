import type { IncomingMessage, ServerResponse } from "http";
import { db, getRecentTrades, getUserState } from "../../src/db/firestore.js";
import { evaluateAristotleMean, renderMeanBar } from "../../src/ai/gemini.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../src/config/env.js";
import { Bot } from "grammy";
import { exportSentinelReconToNotion, isNotionConfigured } from "../../src/notion/exporter.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const bot = new Bot(config.telegramToken);

const SENTINEL_AUDIT_PROMPT = `
You are the Sentinel Agent for "The Fabric" 4F Meta-OS.
Your purpose is to conduct a weekly reconnaissance audit of the user's currency trades and protect them from cognitive burnout and behavioral malware.

Analyze the 7-day trade logs and cumulative telemetry:
1. "Malware Detection": Did any routine or project consume significantly more Focus than planned, or consistently yield negative energy deltas?
2. "Capability Return": What was the highest-leverage Fact or artifact acquired this week?
3. "Aristotelian Calibration": Is the user drifting into excess (overwork, obsessive coding) or deficiency (sedentary desk lock, 0 creative play)?
4. "Recommendation": Give exactly ONE concrete, actionable adjustment for next week.

Format your output in clean Telegram Markdown with sections:
🛡️ *SENTINEL WEEKLY RECON*
📊 *Weekly Telemetry Summary*
⚠️ *Malware Alert*
🏆 *Highest Return*
⚖️ *Equilibrium Check*
🎯 *Operational Directive*

Keep it punchy, direct, and under 300 words. No corporate fluff.
`;

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse
) {
  try {
    const userDocs = await db.collection("userState").get();
    const results = [];

    for (const doc of userDocs.docs) {
      const userId = doc.id;
      const userState = await getUserState(userId);
      const recentTrades = await getRecentTrades(userId, 25);

      if (recentTrades.length === 0) continue;

      // Filter trades from the past 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekTrades = recentTrades.filter((t) => t.timestamp >= sevenDaysAgo);

      const meanEval = await evaluateAristotleMean(recentTrades, userState);

      const prompt = `${SENTINEL_AUDIT_PROMPT}

Weekly Trades (${weekTrades.length} recorded):
${JSON.stringify(weekTrades, null, 2)}

Aristotelian Scales:
${JSON.stringify(meanEval.scales, null, 2)}
Overall Diagnosis: ${meanEval.overallDiagnosis}`;

      const response = await model.generateContent(prompt);
      const auditReport = response.response.text();

      // Append visual Aristotelian bars
      const fullReport = `${auditReport}\n\n` +
        `⚖️ *Current Scales:*\n` +
        `${renderMeanBar(meanEval.scales.logic, "Logic")}\n` +
        `${renderMeanBar(meanEval.scales.vitality, "Vitality")}\n` +
        `${renderMeanBar(meanEval.scales.expressionism, "Art")}\n` +
        `${renderMeanBar(meanEval.scales.variety, "Variety")}`;

      // Save to agentOutputs in Firestore
      await db.collection("agentOutputs").add({
        agentName: "sentinel",
        userId,
        runAt: new Date(),
        report: fullReport,
        scales: meanEval.scales,
      });

      // Export to Notion if configured
      let notionUrl: string | undefined;
      if (isNotionConfigured()) {
        try {
          const exportRes = await exportSentinelReconToNotion(userId, fullReport, new Date());
          notionUrl = exportRes.url;
        } catch (notionErr) {
          console.error(`Failed to export Sentinel audit to Notion for ${userId}:`, notionErr);
        }
      }

      // Send directly to user on Telegram
      try {
        const messageToSend = notionUrl
          ? `${fullReport}\n\n📓 [Open Weekly Audit in Notion](${notionUrl})`
          : fullReport;
        await bot.api.sendMessage(userId, messageToSend, { parse_mode: "Markdown" });
        results.push({ userId, status: "sent", notionUrl });
      } catch (err) {
        console.error(`Could not send Telegram message to ${userId}:`, err);
        results.push({ userId, status: "failed_telegram", error: String(err) });
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ status: "ok", processedUsers: results.length, results }));
  } catch (error) {
    console.error("Sentinel cron error:", error);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    );
  }
}
