import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const projectEnvPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(projectEnvPath)) {
  dotenv.config({ path: projectEnvPath });
}
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
  const fabricRootDir = process.cwd();
  const candidate1 = path.resolve(fabricRootDir, process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  const candidate2 = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  if (fs.existsSync(candidate1)) {
    serviceAccountPath = candidate1;
  } else if (fs.existsSync(candidate2)) {
    serviceAccountPath = candidate2;
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
