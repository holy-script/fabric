import { createBot } from "./bot/index.js";
import { db } from "./db/firestore.js";
import { startHeartbeatScheduler, stopHeartbeatScheduler } from "./services/heartbeat.js";

async function main() {
  console.log("🌌 Initializing The Fabric: 4F Meta-OS...");

  // Verify Firestore connection
  try {
    const collections = await db.listCollections();
    console.log(
      `✅ Firestore connected. Found ${collections.length} active collection(s).`
    );
  } catch (err) {
    console.warn("⚠️ Firestore connection notice:", err instanceof Error ? err.message : err);
  }

  // Initialize and start bot
  const bot = createBot();

  // Start Chronos Heartbeat autonomous circadian loop
  startHeartbeatScheduler(bot);

  console.log("🚀 Starting Fabric Telegram Bot in polling mode...");
  bot.start({
    onStart: (botInfo) => {
      console.log(`🤖 Bot @${botInfo.username} is LIVE and listening.`);
      console.log("Ready for commands: /start, /spark, /settle, /log, /win, /gotcha, /balance, /ask, /heartbeat, /pulse");
    },
  });

  // Graceful shutdown
  const stopHandler = () => {
    console.log("\nShutting down Fabric bot...");
    stopHeartbeatScheduler();
    bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", stopHandler);
  process.on("SIGTERM", stopHandler);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

