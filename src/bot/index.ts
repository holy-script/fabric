import { Bot } from "grammy";
import { config } from "../config/env.js";
import { handleStart } from "./commands/start.js";
import { handleSpark } from "./commands/spark.js";
import { handleSettle } from "./commands/settle.js";
import { handleLog } from "./commands/log.js";
import { handleWin, handleGotcha } from "./commands/win.js";
import { handleBalance, handleAsk } from "./commands/balance.js";
import {
  handlePlugins,
  handleInstall,
  handleUninstall,
  handleSwap,
} from "./commands/plugins.js";
import { handleMuse } from "./commands/muse.js";
import { handlePortfolio } from "./commands/portfolio.js";
import { handleWins, handleGotchas, handleSearch } from "./commands/garden.js";
import { handleGoal, handleGoals, handleClaim } from "./commands/goals.js";
import { handleBriefing } from "./commands/briefing.js";
import { handleDashboard } from "./commands/dashboard.js";
import { handleSimulate } from "./commands/simulate.js";
import { handleNotion } from "./commands/notion.js";
import { handleNaturalMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handleCallbackQuery } from "./handlers/callbacks.js";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // Register bot commands menu in Telegram
  bot.api
    .setMyCommands([
      { command: "dashboard", description: "Open real-time in-chat Visual HUD" },
      { command: "briefing", description: "Daily Flight Plan & Focus Budget" },
      { command: "spark", description: "Start a focused execution session" },
      { command: "settle", description: "Finish active session & log trade" },
      { command: "balance", description: "View currency balances & telemetry" },
      { command: "portfolio", description: "Synthesizer proof of growth" },
      { command: "simulate", description: "Test a new workflow before adopting" },
      { command: "notion", description: "Sync knowledge garden to Notion" },
      { command: "wins", description: "View the Hopecore vault of wins" },
      { command: "gotchas", description: "View documented traps & pitfalls" },
      { command: "search", description: "Search knowledge garden & trades" },
      { command: "goal", description: "Set a gated milestone -> reward" },
      { command: "goals", description: "View Reward Bank progress" },
      { command: "plugins", description: "Manage Ways of Working plugins" },
      { command: "muse", description: "Summon the Muse for creative sparks" },
      { command: "ask", description: "Consult the 4F Advisor engine" },
      { command: "start", description: "Overview & instructions" },
    ])
    .catch((err) => console.error("Could not set bot commands:", err));

  // Command handlers
  bot.command("start", handleStart);
  bot.command("dashboard", handleDashboard);
  bot.command("briefing", handleBriefing);
  bot.command("spark", handleSpark);
  bot.command("settle", handleSettle);
  bot.command("log", handleLog);
  bot.command("win", handleWin);
  bot.command("gotcha", handleGotcha);
  bot.command("balance", handleBalance);
  bot.command("portfolio", handlePortfolio);
  bot.command("simulate", handleSimulate);
  bot.command("notion", handleNotion);
  bot.command("wins", handleWins);
  bot.command("gotchas", handleGotchas);
  bot.command("search", handleSearch);
  bot.command("goal", handleGoal);
  bot.command("goals", handleGoals);
  bot.command("claim", handleClaim);
  bot.command("plugins", handlePlugins);
  bot.command("install", handleInstall);
  bot.command("uninstall", handleUninstall);
  bot.command("swap", handleSwap);
  bot.command("muse", handleMuse);
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
