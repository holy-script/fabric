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
import { handleReflect } from "./commands/reflect.js";
import { handleCluster, handlePath } from "./commands/cluster.js";
import { handleSetChannel } from "./commands/channel.js";
import { handleGold } from "./commands/gold.js";
import { handleSidequest } from "./commands/sidequest.js";
import { handleVitality, handleMeal } from "./commands/vitality.js";
import { handleDsa } from "./commands/dsa.js";
import { handleDomain } from "./commands/domain.js";
import { handleVoiceCommand } from "./commands/voice.js";
import { handleComfy } from "./commands/comfy.js";
import { handleSms } from "./commands/sms.js";
import { handlePhone } from "./commands/phone.js";
import { handlePortfolio } from "./commands/portfolio.js";
import { handleWins, handleGotchas, handleSearch, handleGarden } from "./commands/garden.js";
import { handleGoal, handleGoals, handleClaim } from "./commands/goals.js";
import { handleBriefing } from "./commands/briefing.js";
import { handleHeartbeat } from "./commands/heartbeat.js";
import { handleDashboard } from "./commands/dashboard.js";
import { handleSentinel } from "./commands/sentinel.js";
import { handleSimulate } from "./commands/simulate.js";
import { handleNotion } from "./commands/notion.js";
import { handleGithub } from "./commands/github.js";
import { handleSyncIg } from "./commands/syncig.js";
import { deduplicateUpdates } from "./middleware/dedup.js";
import { handleNaturalMessage } from "./handlers/message.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handleCallbackQuery } from "./handlers/callbacks.js";
import { setVaultChannelId } from "../db/firestore.js";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // Deduplicate updates to prevent webhook timeout retry storms (e.g. 3x audio transcription)
  bot.use(deduplicateUpdates);

  // Register bot commands menu in Telegram
  bot.api
    .setMyCommands([
      { command: "dashboard", description: "Open real-time in-chat Visual HUD" },
      { command: "heartbeat", description: "Chronos Heartbeat circadian loop & pulse check" },
      { command: "pulse", description: "Current-moment telemetry pulse & health check" },
      { command: "sentinel", description: "Autonomous Cognitive Audit & Mean Calibrator" },
      { command: "briefing", description: "Daily Flight Plan & Focus Budget" },
      { command: "spark", description: "Start a focused execution session" },
      { command: "settle", description: "Finish active session & log trade" },
      { command: "balance", description: "View currency balances & telemetry" },
      { command: "portfolio", description: "Synthesizer proof of growth" },
      { command: "github", description: "Passive Git commit telemetry setup" },
      { command: "simulate", description: "Test a new workflow before adopting" },
      { command: "notion", description: "Sync knowledge garden to Notion" },
      { command: "wins", description: "View the Hopecore vault of wins" },
      { command: "gotchas", description: "View documented traps & pitfalls" },
      { command: "search", description: "Search knowledge garden & trades" },
      { command: "cluster", description: "Semantic Knowledge Clusters & Master Syntheses" },
      { command: "path", description: "Multi-hop concept reasoning pathfinder" },
      { command: "goal", description: "Set a gated milestone -> reward" },
      { command: "goals", description: "View Reward Bank progress" },
      { command: "plugins", description: "Manage Ways of Working plugins" },
      { command: "muse", description: "Summon the Muse for creative sparks" },
      { command: "ask", description: "Consult the 4F Advisor engine" },
      { command: "domain", description: "Hot-swappable domain workbench & slots" },
      { command: "gold", description: "GOLDBEES ETF Dip Tracker & Allocation Formula" },
      { command: "vitality", description: "Biological Architecture, Meals & Grooming" },
      { command: "meal", description: "Log whole-food meal & metabolic impact" },
      { command: "sidequest", description: "Anti-fatigue creative escape hatch" },
      { command: "dsa", description: "Explainable DSA Foundry & Mental Models" },
      { command: "voice", description: "Toggle natural Voice-to-Voice spoken replies" },
      { command: "comfy", description: "Local ComfyUI generative image synthesis" },
      { command: "syncig", description: "Auto-sync Instagram Saved reels to Vault" },
      { command: "sms", description: "Airtel GSM SMS Gateway (100 free SMS/day via ADB)" },
      { command: "phone", description: "Android hardware telemetry & Focus Mode (DND)" },
      { command: "start", description: "Overview & instructions" },
    ])
    .catch((err) => console.error("Could not set bot commands:", err));

  // Command handlers
  bot.command("start", handleStart);
  bot.command("heartbeat", handleHeartbeat);
  bot.command("pulse", handleHeartbeat);
  bot.command("dashboard", handleDashboard);
  bot.command("sentinel", handleSentinel);
  bot.command("briefing", handleBriefing);
  bot.command("spark", handleSpark);
  bot.command("settle", handleSettle);
  bot.command("log", handleLog);
  bot.command("win", handleWin);
  bot.command("gotcha", handleGotcha);
  bot.command("balance", handleBalance);
  bot.command("portfolio", handlePortfolio);
  bot.command("github", handleGithub);
  bot.command("simulate", handleSimulate);
  bot.command("notion", handleNotion);
  bot.command("garden", handleGarden);
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
  bot.command("reflect", handleReflect);
  bot.command("cluster", handleCluster);
  bot.command("synthesize", handleCluster);
  bot.command("path", handlePath);
  bot.command("setchannel", handleSetChannel);
  bot.command("domain", handleDomain);
  bot.command("domains", handleDomain);
  bot.command("gold", handleGold);
  bot.command("vitality", handleVitality);
  bot.command("meal", handleMeal);
  bot.command("sidequest", handleSidequest);
  bot.command("dsa", handleDsa);
  bot.command("voice", handleVoiceCommand);
  bot.command("comfy", handleComfy);
  bot.command("syncig", handleSyncIg);
  bot.command("sms", handleSms);
  bot.command("phone", handlePhone);
  bot.command("ask", handleAsk);

  // Voice memo ingestion (multimodal)
  bot.on("message:voice", handleVoiceMessage);

  // Interactive inline keyboard callbacks
  bot.on("callback_query:data", handleCallbackQuery);

  // Channel Auto-Discovery when bot is added as admin to a channel
  bot.on("my_chat_member", async (ctx) => {
    try {
      const chat = ctx.chat;
      const status = ctx.myChatMember?.new_chat_member?.status;
      if (chat.type === "channel" && (status === "administrator" || status === "member")) {
        const channelId = chat.id.toString();
        await setVaultChannelId(channelId, config.telegramUserId || "1131646846");
        if (config.telegramUserId) {
          await ctx.api.sendMessage(
            config.telegramUserId,
            `🎉 *Vault Channel Connected!*\n\n` +
              `📁 Channel: *${chat.title || "Private Vault"}*\n` +
              `🆔 ID: \`${channelId}\`\n\n` +
              `The archiver is now ready to stream all videos directly into this channel!`,
            { parse_mode: "Markdown" }
          );
        }
      }
    } catch (err) {
      console.error("Error handling my_chat_member:", err);
    }
  });

  // Channel Auto-Discovery when any post is made in the channel
  bot.on("channel_post", async (ctx) => {
    try {
      const chat = ctx.chat;
      if (chat.type === "channel" || chat.id < 0) {
        const channelId = chat.id.toString();
        await setVaultChannelId(channelId, config.telegramUserId || "1131646846");
        if (config.telegramUserId) {
          await ctx.api.sendMessage(
            config.telegramUserId,
            `🎉 *Vault Channel Detected from Post!*\n\n` +
              `📁 Channel: *${chat.title || "Private Vault"}*\n` +
              `🆔 ID: \`${channelId}\`\n\n` +
              `Saved channel ID to Firestore. Launching video archiver!`,
            { parse_mode: "Markdown" }
          );
        }
      }
    } catch (err) {
      console.error("Error handling channel_post:", err);
    }
  });

  // Natural language message fallback (including Instagram/YouTube auto-digestion)
  bot.on("message:text", handleNaturalMessage);

  // Error handling
  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  return bot;
}
