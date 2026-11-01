import type { IncomingMessage, ServerResponse } from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Bot } from "grammy";
import { config } from "../../src/config/env.js";
import { db, createTrade } from "../../src/db/firestore.js";
import type { Trade } from "../../src/db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const bot = new Bot(config.telegramToken);

/**
 * Safely parses the HTTP request body whether incoming as a stream or pre-parsed.
 */
async function parseBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body) {
    if (typeof (req as any).body === "object") {
      return (req as any).body;
    }
    try {
      return JSON.parse((req as any).body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // Fallback for form-urlencoded payload= format
        try {
          const params = new URLSearchParams(raw);
          const payloadStr = params.get("payload");
          if (payloadStr) {
            return resolve(JSON.parse(payloadStr));
          }
        } catch {}
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

/**
 * Estimates focus hours spent based on commit count and timestamp delta.
 */
function calculateEstimatedHours(commits: any[]): number {
  if (commits.length === 0) return 0.5;

  let deltaHours = 0;
  if (commits.length > 1) {
    const timestamps = commits
      .map((c) => (c.timestamp ? new Date(c.timestamp).getTime() : NaN))
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);

    if (timestamps.length > 1) {
      const first = timestamps[0];
      const last = timestamps[timestamps.length - 1];
      const diffMs = last - first;
      deltaHours = diffMs / (1000 * 60 * 60);
    }
  }

  // If timestamp delta is between 15m and 8h, use delta + base execution buffer
  if (deltaHours >= 0.25 && deltaHours <= 8) {
    return Math.round((deltaHours + 0.25) * 10) / 10;
  }

  // Fallback heuristic based on commit count:
  // 1 commit = 0.5h, 2 = 0.75h, 3 = 1.0h, etc., capped at 4.0h
  const commitBased = 0.5 + Math.min(3.5, (commits.length - 1) * 0.25);
  return Math.round(commitBased * 10) / 10;
}

/**
 * Finds the primary Telegram user ID from env or Firestore userState.
 */
async function getPrimaryUserId(): Promise<string | null> {
  if (process.env.TELEGRAM_USER_ID) {
    return process.env.TELEGRAM_USER_ID;
  }
  try {
    const snapshot = await db.collection("userState").limit(1).get();
    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }
  } catch (err) {
    console.error("Error querying userState for primary user:", err);
  }
  return null;
}

export default async function handler(
  req: IncomingMessage & { method?: string; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse
) {
  // 1. Health check for GET
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: "ok",
        platform: "The Fabric: 4F Meta-OS",
        service: "GitHub Webhook Ingress Active",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    const payload = await parseBody(req);
    const event = (req.headers["x-github-event"] as string) || "push";

    // Handle Ping event from GitHub Webhook settings
    if (event === "ping") {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ status: "ok", message: "pong" }));
      return;
    }

    const primaryUserId = await getPrimaryUserId();
    const tradeUserId = primaryUserId || "default";

    // 2. Handle 'push' event
    if (event === "push") {
      const repoName = payload.repository?.name || payload.repository?.full_name || "Codebase";
      const branch = payload.ref ? payload.ref.replace(/^refs\/heads\//, "") : "main";
      const commits = Array.isArray(payload.commits) ? payload.commits : [];

      if (commits.length === 0) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: "ok",
            message: "Push received with no commits to process.",
          })
        );
        return;
      }

      const estimatedHours = calculateEstimatedHours(commits);

      const commitSummary = commits
        .slice(0, 15)
        .map((c: any) => {
          const author = c.author?.name || c.author?.username || "developer";
          const files = [
            ...(c.added || []),
            ...(c.modified || []),
            ...(c.removed || []),
          ].slice(0, 5).join(", ");
          return `- [${author}] ${c.message} (Files: ${files || "unspecified"})`;
        })
        .join("\n");

      const prompt = `Analyze these git commits for repository ${repoName}:
Branch: ${branch}
Commits:
${commitSummary}

Summarize: What architectural capability or technical artifact was built? What was learned or solved?
Provide a concise, 1-2 sentence engineering-focused synthesis. No fluff or conversational intro.`;

      let factsYield = "Code implementation and features shipped.";
      try {
        const aiResponse = await model.generateContent(prompt);
        factsYield = aiResponse.response.text().trim().replace(/^["']|["']$/g, "");
      } catch (aiErr) {
        console.error("Gemini commit analysis error:", aiErr);
        factsYield = `Shipped ${commits.length} commit(s) to ${repoName}: ${commits[0]?.message || "Updates"}`;
      }

      const trade: Omit<Trade, "id"> = {
        userId: tradeUserId,
        timestamp: new Date(),
        moduleName: `${repoName} Code Execution`,
        tradeType: "builder",
        focusActualHours: estimatedHours,
        factsYield,
        fundsCost: 0,
        fundsYield: 0,
        energyDelta: 1, // Sense of completion
        tags: ["github", "coding", repoName.toLowerCase()],
        notes: `Pushed ${commits.length} commit(s) to branch ${branch}`,
      };

      const tradeId = await createTrade(trade);

      // Telegram notification
      if (primaryUserId) {
        const notification =
          `📦 *GitHub Passive Telemetry*\n` +
          `• Repo: \`${repoName}\` (${branch})\n` +
          `• Commits: ${commits.length}\n` +
          `⏳ Focus: ${estimatedHours}h\n` +
          `💡 Yield: ${factsYield}`;

        try {
          await bot.api.sendMessage(primaryUserId, notification, { parse_mode: "Markdown" });
        } catch {
          try {
            await bot.api.sendMessage(primaryUserId, notification);
          } catch (tgErr) {
            console.error("Failed to deliver Telegram notification:", tgErr);
          }
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: "ok",
          event: "push",
          tradeId,
          repo: repoName,
          branch,
          commitsProcessed: commits.length,
          focusHours: estimatedHours,
        })
      );
      return;
    }

    // 3. Handle 'pull_request' event
    if (event === "pull_request") {
      const repoName = payload.repository?.name || payload.repository?.full_name || "Codebase";
      const pr = payload.pull_request;
      const action = payload.action;

      if (!pr) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify({ status: "ok", message: "PR event received without PR payload." }));
        return;
      }

      const isMerged = action === "closed" && pr.merged;
      const isOpened = action === "opened";

      // Process opened, synchronize, or merged pull requests
      if (!isMerged && !isOpened && action !== "synchronize") {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        res.end(JSON.stringify({ status: "ok", message: `PR action '${action}' acknowledged.` }));
        return;
      }

      const branch = `${pr.head?.ref || "feature"} -> ${pr.base?.ref || "main"}`;
      const estimatedHours = Math.max(0.5, Math.min(4.0, Math.round(((pr.commits || 1) * 0.5) * 10) / 10));

      const prompt = `Analyze this Pull Request for repository ${repoName}:
PR #${pr.number}: ${pr.title}
Action: ${isMerged ? "Merged" : action}
Description:
${pr.body || "No description provided."}
Files changed: ${pr.changed_files || "unknown"}

Summarize: What architectural capability or technical artifact was built? What was learned or solved?
Provide a concise, 1-2 sentence engineering-focused synthesis. No fluff.`;

      let factsYield = `PR #${pr.number}: ${pr.title}`;
      try {
        const aiResponse = await model.generateContent(prompt);
        factsYield = aiResponse.response.text().trim().replace(/^["']|["']$/g, "");
      } catch (aiErr) {
        console.error("Gemini PR analysis error:", aiErr);
      }

      const trade: Omit<Trade, "id"> = {
        userId: tradeUserId,
        timestamp: new Date(),
        moduleName: `${repoName} PR #${pr.number}`,
        tradeType: "builder",
        focusActualHours: estimatedHours,
        factsYield,
        fundsCost: 0,
        fundsYield: 0,
        energyDelta: 1,
        tags: ["github", "pull-request", repoName.toLowerCase()],
        notes: `PR #${pr.number} (${action}) by ${pr.user?.login || "user"}`,
      };

      const tradeId = await createTrade(trade);

      if (primaryUserId) {
        const actionLabel = isMerged ? "Merged" : action;
        const notification =
          `📦 *GitHub Passive Telemetry*\n` +
          `• Repo: \`${repoName}\` (${branch})\n` +
          `• PR #${pr.number} [${actionLabel}]: ${pr.title}\n` +
          `⏳ Focus: ${estimatedHours}h\n` +
          `💡 Yield: ${factsYield}`;

        try {
          await bot.api.sendMessage(primaryUserId, notification, { parse_mode: "Markdown" });
        } catch {
          try {
            await bot.api.sendMessage(primaryUserId, notification);
          } catch (tgErr) {
            console.error("Failed to deliver Telegram PR notification:", tgErr);
          }
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: "ok",
          event: "pull_request",
          tradeId,
          repo: repoName,
          prNumber: pr.number,
          action,
        })
      );
      return;
    }

    // Default response for other GitHub events
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        status: "ok",
        message: `GitHub event '${event}' received and acknowledged.`,
      })
    );
  } catch (error) {
    console.error("GitHub webhook error:", error);
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
