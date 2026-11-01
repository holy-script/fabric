import { Bot } from "grammy";
import { config } from "../config/env.js";
import { handleStart } from "./commands/start.js";
import { handleSpark } from "./commands/spark.js";
import { handleSettle } from "./commands/settle.js";
import { handleLog } from "./commands/log.js";
import { handleWin, handleGotcha } from "./commands/win.js";
import { handleBalance, handleAsk } from "./commands/balance.js";
import { handleNaturalMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handleCallbackQuery } from "./handlers/callbacks.js";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // Register bot commands menu in Telegram
  bot.api
    .setMyCommands([
      { command: "spark", description: "Start a focused execution session" },
      { command: "settle", description: "Finish active session & log trade" },
      { command: "log", description: "Quick-log a 4F currency trade" },
      { command: "win", description: "Bank a win or breakthrough" },
      { command: "gotcha", description: "Record a bug, trap, or pitfall" },
      { command: "balance", description: "View currency balances & telemetry" },
      { command: "ask", description: "Consult the 4F Advisor engine" },
      { command: "start", description: "Overview & instructions" },
    ])
    .catch((err) => console.error("Could not set bot commands:", err));

  // Command handlers
  bot.command("start", handleStart);
  bot.command("spark", handleSpark);
  bot.command("settle", handleSettle);
  bot.command("log", handleLog);
  bot.command("win", handleWin);
  bot.command("gotcha", handleGotcha);
  bot.command("balance", handleBalance);
  bot.command("ask", handleAsk);

  // Voice memo ingestion (multimodal)
  bot.on("message:voice", handleVoiceMessage);

  // Interactive inline keyboard callbacks
  bot.on("callback_query:data", handleCallbackQuery);

  // Natural language message fallback
  bot.on("message:text", handleNaturalMessage);

  // Error handling
  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  return bot;
}
