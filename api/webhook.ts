import type { IncomingMessage, ServerResponse } from "http";
import { createBot } from "../src/bot/index.js";
import { webhookCallback } from "grammy";

const bot = createBot();
const handleUpdate = webhookCallback(bot, "http");

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse
) {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: "ok",
        platform: "The Fabric: 4F Meta-OS",
        service: "Telegram Webhook Cloud Ingress",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  return handleUpdate(req, res);
}
