import { createBot } from "./bot/index.js";
import { db } from "./db/firestore.js";

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

  console.log("🚀 Starting Fabric Telegram Bot in polling mode...");
  bot.start({
    onStart: (botInfo) => {
      console.log(`🤖 Bot @${botInfo.username} is LIVE and listening.`);
      console.log("Ready for commands: /start, /spark, /settle, /log, /win, /gotcha, /balance, /ask");
    },
  });

  // Graceful shutdown
  const stopHandler = () => {
    console.log("\nShutting down Fabric bot...");
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

