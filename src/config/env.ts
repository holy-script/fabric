import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const requiredEnvVars = [
  "TELEGRAM_BOT_TOKEN",
  "GEMINI_API_KEY",
  "FIREBASE_PROJECT_ID",
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

let serviceAccountPath: string | undefined;
if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  const resolved = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  if (fs.existsSync(resolved)) {
    serviceAccountPath = resolved;
  }
}

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN as string,
  telegramUserId: process.env.TELEGRAM_USER_ID || "1131646846",
  telegramVaultChannelId: process.env.TELEGRAM_VAULT_CHANNEL_ID,
  geminiApiKey: process.env.GEMINI_API_KEY as string,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID as string,
  firebaseServiceAccountPath: serviceAccountPath,
  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
  port: parseInt(process.env.PORT || "3000", 10),
};
