import type { IncomingMessage, ServerResponse } from "http";
import { db } from "../../src/db/firestore.js";
import { config } from "../../src/config/env.js";
import { Bot } from "grammy";
import { generateMorningBriefing } from "../../src/bot/commands/briefing.js";

const bot = new Bot(config.telegramToken);

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse
) {
  try {
    const userDocs = await db.collection("userState").get();
    const results = [];

    for (const doc of userDocs.docs) {
      const userId = doc.id;

      try {
        const briefing = await generateMorningBriefing(userId);

        try {
          await bot.api.sendMessage(userId, briefing, { parse_mode: "Markdown" });
          results.push({ userId, status: "sent" });
        } catch {
          // Fallback to plain text in case of Telegram markdown parser issue
          await bot.api.sendMessage(userId, briefing);
          results.push({ userId, status: "sent_plain_fallback" });
        }
      } catch (err) {
        console.error(`Could not generate or send morning briefing to ${userId}:`, err);
        results.push({ userId, status: "failed", error: String(err) });
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: "ok",
        processedUsers: results.length,
        results,
      })
    );
  } catch (error) {
    console.error("Morning briefing cron error:", error);
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
