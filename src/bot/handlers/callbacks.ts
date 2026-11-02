import type { Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { exportClusterToNotebookLM, exportMasterHeuristicsToNotebookLM, getIITMGrokkingBundles } from "../../integrations/notebooklm/exporter.js";
import { getOrLoadGraph } from "../../graph/query.js";
import {
  loadQuestionBank,
  formatQuestionCard,
  handlePrep,
  recordPrepAnswer,
  getUserScore,
  resetUserScore,
  formatScoreMessage,
  handlePrepNotebookLMUpload,
  checkAnswer,
} from "../commands/prep.js";
import { handleBalance } from "../commands/balance.js";
import { handleSettle } from "../commands/settle.js";
import { handlePlugins } from "../commands/plugins.js";
import { handleBriefing } from "../commands/briefing.js";
import { executeSimulation } from "../commands/simulate.js";
import { handleSentinel } from "../commands/sentinel.js";
import { handleDsa } from "../commands/dsa.js";
import { handleSidequest } from "../commands/sidequest.js";
import {
  handlePhone,
  formatPhoneCard,
  formatDisconnectedMessage,
} from "../commands/phone.js";
import {
  getActiveDevice,
  getDeviceStatsSummary,
  triggerDnd,
} from "../../services/telemetry-adb.js";
import { swapDomain } from "../../domains/manager.js";
import { installPlugin, uninstallPlugin, swapPlugin } from "../../plugins/manager.js";
import { unlockGoal, getUserState, findKnowledgeItem } from "../../db/firestore.js";
import { setActiveReflectionSession, handleReflexion } from "../commands/reflect.js";
import { exportPortfolioToNotion, isNotionConfigured } from "../../notion/exporter.js";
import { handleHeartbeat } from "../commands/heartbeat.js";
import { handleGold } from "../commands/gold.js";
import { handleDomain } from "../commands/domain.js";
import { getLatestCouncilSession } from "../commands/council.js";
import { handleHealth, formatBiometricCard, formatSetupGuide } from "../commands/health.js";
import {
  handleFociStatus,
  handleFociTest,
  handleFociReset,
  handleFociScan,
} from "../commands/foci.js";
import { muteFociAlerts } from "../../integrations/foci/bridge.js";
import { getLatestBiometrics } from "../../services/wearables.js";
import { generateSocraticChallenge } from "../../ai/challenger.js";
import { startSession } from "../../db/firestore.js";
import {
  sendDawnBriefing,
  sendMiddayReset,
  sendTwilightSettle,
  setHeartbeatEnabled,
} from "../../services/heartbeat.js";

export async function handleCallbackQuery(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id.toString();
  if (!data || !userId) return;

  await ctx.answerCallbackQuery();

  if (data.startsWith("reflect:") || data.startsWith("defend:")) {
    const isDefend = data.startsWith("defend:");
    const itemId = data.replace(/^(reflect|defend):/, "");
    try {
      const item = await findKnowledgeItem(userId, itemId);
      if (item && item.id) {
        setActiveReflectionSession(userId, {
          itemId: item.id,
          title: item.title,
          notionUrl: item.notionUrl,
          takeaway: item.actionableTakeaway || item.content,
        });

        if (isDefend) {
          await ctx.reply(
            `⚔️ *Socratic Defense Session Locked:*\n` +
              `*${item.title}*\n\n` +
              (item.userConclusions ? `🧠 *Previous Verdict:*\n_"${item.userConclusions}"_\n\n` : "") +
              `Send a **voice memo** or **text message** now to defend your verdict, identify boundary conditions, or counter the challenger!`,
            { parse_mode: "Markdown" }
          );
        } else {
          await ctx.reply(
            `🎙️ *Active Reflection Locked:*\n` +
              `*${item.title}*\n\n` +
              `💡 _Takeaway:_ ${item.actionableTakeaway || item.content}\n\n` +
              `Send a **voice memo** or **text message** now to attach your personal conclusion!`,
            { parse_mode: "Markdown" }
          );
        }
      } else {
        await ctx.reply("⚠️ Could not find card for reflection.");
      }
    } catch (err: any) {
      await ctx.reply(`⚠️ Error locking reflection: ${err.message}`);
    }
    return;
  }

  if (data === "council:challenge") {
    const session = getLatestCouncilSession(userId);
    if (!session) {
      await ctx.reply(
        "⚠️ No recent Council deliberation found to challenge. Run `/council <dilemma>` first.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const waitMsg = await ctx.reply(
      "⚔️ *Unleashing Socratic Challenger against Council Verdict...*",
      { parse_mode: "Markdown" }
    );

    try {
      const v = session.report.verdict;
      const challenge = await generateSocraticChallenge(
        session.report.problem,
        v.action,
        `Trade Type: ${v.tradeType}, Focus: ${v.focusHours}h, Expected Facts: ${v.expectedFacts}, Rationale: ${v.rationale}`
      );

      const challengeText = [
        `⚔️ *SOCRATIC STRESS-TEST: COUNCIL VERDICT UNDER FIRE*`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🎯 *Council Verdict:*`,
        `_"${v.action}"_`,
        ``,
        `🗡️ *Blindspot & Fragility:*`,
        `"${challenge.challenge}"`,
        ``,
        `❓ *Provocative Question:*`,
        `"${challenge.provocativeQuestion}"`,
        ``,
        `🔄 *Via Negativa Counter-Perspective:*`,
        `"${challenge.counterPerspective}"`,
      ].join("\n");

      const followUpKeyboard = new InlineKeyboard()
        .text("⚡ Spark Action Anyway", "council:spark")
        .text("📊 Balance", "action:balance");

      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        challengeText,
        {
          parse_mode: "Markdown",
          reply_markup: followUpKeyboard,
        }
      );
    } catch (err: any) {
      console.error("Council challenge error:", err);
      await ctx.reply(`⚠️ Failed to generate challenge: ${err.message}`);
    }
    return;
  }

  if (data === "council:spark") {
    const session = getLatestCouncilSession(userId);
    if (!session) {
      await ctx.reply(
        `⚡ *Spark a Session:*\nSend \`/spark <task> [duration]\` or send a voice memo saying what you are starting!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const v = session.report.verdict;
    try {
      await startSession({
        userId,
        taskDescription: `[Council Trade] ${v.action}`,
        focusExpectedHours: v.focusHours || 1.0,
        tags: ["council", v.tradeType],
        startedAt: new Date(),
      });

      const sparkMsg = [
        `⚡ *COUNCIL ACTION SPARKED INTO ACTIVE FLOW!*`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🎯 *Active Objective:*`,
        `*${v.action}*`,
        ``,
        `⏳ *Focus Commitment:* ${v.focusHours}h (\`${v.tradeType}\`)`,
        `💡 *Target Facts:* ${v.expectedFacts}`,
        `⚡ *Projected Energy Delta:* ${v.expectedEnergyDelta > 0 ? "+" : ""}${v.expectedEnergyDelta} / 5.0`,
        ``,
        `_Focus lock engaged. Execute without friction. Send \`/settle\` when complete to lock in your 4F trade._`,
      ].join("\n");

      const activeKeyboard = new InlineKeyboard()
        .text("🏁 Settle Session", "action:settle")
        .text("📊 Balance", "action:balance");

      await ctx.reply(sparkMsg, {
        parse_mode: "Markdown",
        reply_markup: activeKeyboard,
      });
    } catch (err: any) {
      console.error("Council spark error:", err);
      await ctx.reply(`⚠️ Could not spark session: ${err.message}`);
    }
    return;
  }

  if (data === "action:balance") {
    await handleBalance(ctx);
  } else if (data === "action:sentinel") {
    await handleSentinel(ctx);
  } else if (data === "action:reflexion") {
    await handleReflexion(ctx);
  } else if (data === "action:briefing") {
    await handleBriefing(ctx);
  } else if (data === "action:settle") {
    await handleSettle(ctx);
  } else if (data === "action:plugins") {
    await handlePlugins(ctx);
  } else if (data === "action:spark_prompt") {
    await ctx.reply(
      `⚡ *Spark a Session:*\nSend \`/spark <task> [duration]\` or send a voice memo saying what you are starting!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:win_prompt") {
    await ctx.reply(
      `🏆 *Bank a Win:*\nSend \`/win <breakthrough>\` or voice-record your milestone!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:ask_prompt") {
    await ctx.reply(
      `❓ *Ask the Advisor:*\nSend \`/ask <question>\` or send a voice note asking for advice on trade-offs!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:dsa_roll") {
    await handleDsa(ctx);
  } else if (data === "action:sidequest_roll") {
    await handleSidequest(ctx);
  } else if (data === "action:meal_prompt") {
    await ctx.reply(
      `🥗 *Log a Clean Meal:*\nSend \`/meal <what you ate>\` (e.g. \`/meal 3 eggs, sourdough toast, black coffee\`)!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:spark_kinetic") {
    await ctx.reply(
      `⚡ *Kinetic Session Initiated:*\nSend \`/spark 15m plyometrics and dancercise\` to lock into flow!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:grooming_guide") {
    await ctx.reply(
      `🧴 *Somatic Grooming Protocol:*\n\n` +
        `• *AM:* Cold splash $\\rightarrow$ Cleanser $\\rightarrow$ Vitamin C $\\rightarrow$ Moisturizer $\\rightarrow$ SPF 50.\n` +
        `• *Beard:* Boar-bristle brush downward $\\rightarrow$ 4 drops jojoba/argan oil $\\rightarrow$ Check neckline symmetry.\n` +
        `• *Scent:* 2 sprays signature fragrance on pulse points (wrist + neck side).\n` +
        `• *PM:* Gentle foaming cleanser $\\rightarrow$ Barrier repair cream.\n\n` +
        `_Aesthetic self-respect builds an indomitable mindset._`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:domain_swap_kinetic") {
    const res = await swapDomain(userId, "somatic-grooming", "kinetic-cns");
    await ctx.reply(res.message, { parse_mode: "Markdown" });
  } else if (data === "action:domain_add_prompt") {
    await ctx.reply(
      `✨ *Create a Custom Domain:*\n\n` +
        `Send: \`/domain add <Name> | <Pillar> | <Description>\`\n\n` +
        `_Example: \`/domain add Bouldering | Vitality | Finger tendon conditioning and problem-solving\`_`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:portfolio_export") {
    if (!isNotionConfigured()) {
      await ctx.reply(
        `❌ *Notion is not configured.*\nPlease set \`NOTION_API_KEY\` and \`NOTION_DATABASE_ID\` in environment variables.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const waitMsg = await ctx.reply("⏳ *Exporting Compounding Portfolio to Notion...*", {
      parse_mode: "Markdown",
    });

    try {
      let summaryText = ctx.callbackQuery.message?.text || "";
      if (!summaryText || summaryText.length < 30) {
        const state = await getUserState(userId);
        summaryText = `Compounding Portfolio for user ${userId}. Focus: ${state.totalFocusHours}h, Facts: ${state.totalFactsAcquired}.`;
      }

      const notionRes = await exportPortfolioToNotion(userId, summaryText);
      const keyboard = new InlineKeyboard().url("📓 Open Live Portfolio in Notion", notionRes.url);

      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `🏛️ *Compounding Portfolio Exported to Notion!*\n\n` +
          `Your 5-dimension compounding capabilities, personal telemetry, and executive synthesis are now published under \`Fabric OS\`.\n\n` +
          `📓 [Open Live Portfolio in Notion](${notionRes.url})`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      console.error("Callback portfolio export error:", error);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ Failed to export portfolio to Notion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  } else if (data.startsWith("sim:run:")) {
    const framework = data.replace("sim:run:", "");
    await executeSimulation(ctx, framework);
  } else if (data.startsWith("sim:pilot:")) {
    const pilotSlug = data.replace("sim:pilot:", "");
    await ctx.reply(
      `🧪 *7-Day Pilot Protocol Activated!*\n\n` +
        `Your micro-dose experiment for \`#pilot-${pilotSlug}\` is registered.\n\n` +
        `• *Execute:* Log your execution blocks with \`/spark\` or \`/log\` adding tag \`#pilot-${pilotSlug}\`.\n` +
        `• *Evaluate:* Run \`/balance\` every 48 hours to check for Aristotelian drift.\n` +
        `• *Abort Gate:* If your Energy Delta drops negative for 2 consecutive sessions, drop the pilot immediately.\n\n` +
        `_No permanent architecture modifications have been committed._`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "sim:discard") {
    await ctx.reply(
      `🗑️ *Simulation Discarded.*\n` +
        `Methodology rejected before writing a single line of integration code. Your baseline 4F telemetry remains intact.`,
      { parse_mode: "Markdown" }
    );
  } else if (data.startsWith("plugin:install:")) {
    const pluginId = data.replace("plugin:install:", "");
    const res = await installPlugin(userId, pluginId);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    await handlePlugins(ctx);
  } else if (data.startsWith("plugin:uninstall:")) {
    const pluginId = data.replace("plugin:uninstall:", "");
    const res = await uninstallPlugin(userId, pluginId);
    await ctx.reply(res.message, { parse_mode: "Markdown" });
    await handlePlugins(ctx);
  } else if (data.startsWith("goal:claim:")) {
    const goalId = data.replace("goal:claim:", "");
    await unlockGoal(goalId);
    await ctx.reply(
      `🎉 *VALIDATION GATE CLEARED!*\nReward unlocked in your Reward Bank! Enjoy your guilt-free payoff.`,
      { parse_mode: "Markdown" }
    );
  } else if (data.startsWith("swap_plugin:")) {
    const targetPluginId = data.replace("swap_plugin:", "");
    const state = await getUserState(userId);
    const oldId = state.activePlugins?.[0] || "monotropic-flow";
    const res = await swapPlugin(userId, oldId, targetPluginId);

    const keyboard = new InlineKeyboard()
      .text("🛡️ Re-Run Sentinel Recon", "action:sentinel")
      .text("🧩 View Plugins", "action:plugins");

    await ctx.reply(
      `⚡ *WAY OF WORKING CALIBRATION COMPLETE*\n\n` +
        `${res.message}\n\n` +
        `_The Sentinel Agent has updated your operational driver._`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } else if (data === "action:phone_refresh") {
    const { device, status } = await getActiveDevice();
    if (status !== "connected" || !device) {
      if (ctx.callbackQuery?.message) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          ctx.callbackQuery.message.message_id,
          formatDisconnectedMessage(status, device?.id),
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(formatDisconnectedMessage(status, device?.id), {
          parse_mode: "Markdown",
        });
      }
      return;
    }

    try {
      const summary = await getDeviceStatsSummary(device.id);
      const { text: cardText, keyboard } = formatPhoneCard(summary);
      if (ctx.callbackQuery?.message) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          ctx.callbackQuery.message.message_id,
          cardText,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
      } else {
        await ctx.reply(cardText, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      }
    } catch (err: any) {
      await ctx.reply(`⚠️ Telemetry refresh error: ${err.message}`);
    }
  } else if (data === "action:phone_dnd_on" || data === "action:phone_dnd_off") {
    const enable = data === "action:phone_dnd_on";
    const { device, status } = await getActiveDevice();
    if (status !== "connected" || !device) {
      await ctx.reply(formatDisconnectedMessage(status, device?.id), {
        parse_mode: "Markdown",
      });
      return;
    }

    try {
      await triggerDnd(enable, device.id);
      const summary = await getDeviceStatsSummary(device.id);
      const { text: cardText, keyboard } = formatPhoneCard(summary);
      if (ctx.callbackQuery?.message) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          ctx.callbackQuery.message.message_id,
          cardText,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
      } else {
        await ctx.reply(cardText, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      }
    } catch (err: any) {
      await ctx.reply(`⚠️ Failed to toggle DND: ${err.message}`);
    }
  } else if (data === "action:heartbeat_status") {
    await handleHeartbeat(ctx);
  } else if (data === "action:heartbeat_on") {
    await setHeartbeatEnabled(userId, true);
    await ctx.reply("🟢 *Chronos Heartbeat Proactive Loop Activated!*", { parse_mode: "Markdown" });
    await handleHeartbeat(ctx);
  } else if (data === "action:heartbeat_off") {
    await setHeartbeatEnabled(userId, false);
    await ctx.reply("🔴 *Chronos Heartbeat Proactive Loop Muted.*", { parse_mode: "Markdown" });
    await handleHeartbeat(ctx);
  } else if (data === "action:heartbeat_test_dawn") {
    await sendDawnBriefing(ctx.api as any, userId);
  } else if (data === "action:heartbeat_test_midday") {
    await sendMiddayReset(ctx.api as any, userId);
  } else if (data === "action:heartbeat_test_twilight") {
    await sendTwilightSettle(ctx.api as any, userId);
  } else if (data === "action:gold_analysis") {
    await handleGold(ctx);
  } else if (data === "action:domain_menu") {
    await handleDomain(ctx);
  } else if (data === "action:health_card") {
    await handleHealth(ctx);
  } else if (data === "action:health_guide") {
    const keyboard = new InlineKeyboard()
      .text("🔄 Check Again", "action:refresh_health")
      .text("🧬 Wearables HUD", "action:health_card");
    await ctx.reply(formatSetupGuide(userId), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else if (data === "action:refresh_health") {
    const snapshot = await getLatestBiometrics(userId);
    if (snapshot) {
      const keyboard = new InlineKeyboard()
        .text("🔄 Refresh", "action:refresh_health")
        .text("⚙️ Setup Guide", "action:health_guide")
        .row()
        .text("🥗 Vitality Protocol", "action:vitality")
        .text("📊 Balance Radar", "action:balance");
      try {
        await ctx.editMessageText(formatBiometricCard(snapshot), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch {
        await ctx.reply(formatBiometricCard(snapshot), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      }
    } else {
      const keyboard = new InlineKeyboard()
        .text("🔄 Check Again", "action:refresh_health")
        .text("🥗 Vitality Protocol", "action:vitality");
      try {
        await ctx.editMessageText(formatSetupGuide(userId), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch {
        await ctx.reply(formatSetupGuide(userId), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      }
    }
  } else if (data === "action:reflect_prompt") {
    await ctx.reply(
      `🪞 *Reflect on Knowledge:*\nSend \`/reflect <topic or keyword>\` (e.g., \`/reflect squat\` or \`/reflect trading\`) to layer your conclusions!`,
      { parse_mode: "Markdown" }
    );
  } else if (data === "action:foci_status") {
    await handleFociStatus(ctx);
  } else if (data === "action:foci_test") {
    await handleFociTest(ctx);
  } else if (data === "action:foci_reset") {
    await handleFociReset(ctx);
  } else if (data === "action:foci_scan") {
    await handleFociScan(ctx);
  } else if (data === "action:foci_mute_30") {
    muteFociAlerts(userId, 30);
    await ctx.reply("🔕 *FOCI Alerts Muted:* Prolonged stress biofeedback alerts paused for 30 minutes.", {
      parse_mode: "Markdown",
    });
  } else if (data.startsWith("nlm:export:")) {
    const target = data.replace("nlm:export:", "");
    const iitmBundles = getIITMGrokkingBundles();

    if (target === "heuristics") {
      const bundle = await exportMasterHeuristicsToNotebookLM();
      await ctx.replyWithDocument(new InputFile(bundle.filePath, bundle.fileName), {
        caption: `📚 *NotebookLM Source Bundle:* Master Heuristics & Axioms\n\nContains **${bundle.itemCount}** synthesized principles ready for grounding in NotebookLM.`,
        parse_mode: "Markdown",
      });
    } else if (target === "iitm" || target === "iitm_all") {
      await ctx.reply("⏳ _Sending all 3 IITM BS Quiz 1 Grokking Notebooks..._", { parse_mode: "Markdown" });
      for (const b of iitmBundles) {
        await ctx.replyWithDocument(new InputFile(b.filePath, b.fileName), {
          caption: `🎓 *${b.title}*\n\nContains **${b.questionCount}** real exam questions, master formulas, and audio prompt for NotebookLM!`,
          parse_mode: "Markdown",
        });
      }
    } else if (["cn", "csd", "bdbn"].includes(target)) {
      const b = iitmBundles.find((x) => x.subject === target);
      if (b) {
        await ctx.replyWithDocument(new InputFile(b.filePath, b.fileName), {
          caption:
            `🎓 *IITM BS Quiz 1 Source Bundle: ${b.title}*\n\n` +
            `• **Exam Questions:** \`${b.questionCount}\` verified PYQs\n` +
            `• **File:** \`${b.fileName}\`\n\n` +
            `Upload to NotebookLM to generate grounded practice answers and an **Audio Overview (Podcast)**!`,
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().url("🎙️ Open Google NotebookLM", "https://notebooklm.google.com"),
        });
      }
    } else {
      const bundle = await exportClusterToNotebookLM(target);
      if (bundle) {
        await ctx.replyWithDocument(new InputFile(bundle.filePath, bundle.fileName), {
          caption:
            `🎙️ *NotebookLM Source Document Generated!*\n\n` +
            `• **Cluster:** *${bundle.clusterLabel}*\n` +
            `• **Sources Included:** \`${bundle.itemCount}\` curated items\n` +
            `• **File:** \`${bundle.fileName}\`\n\n` +
            `Upload this document to NotebookLM to generate an **Audio Overview (Podcast)** or grounded study guide!`,
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().url("🌐 Open Google NotebookLM", "https://notebooklm.google.com"),
        });
      } else {
        await ctx.reply(`⚠️ Could not find cluster: ${target}`);
      }
    }
  } else if (data === "nlm:list") {
    const graph = await getOrLoadGraph();
    let list = `📚 *Available Clusters for NotebookLM Export:*\n\n`;
    list += `• \`/nlm export cn\` — IITM Computer Networks\n`;
    list += `• \`/nlm export csd\` — IITM Systems Design\n`;
    list += `• \`/nlm export bdbn\` — IITM Biological Networks\n`;
    list += `• \`/nlm export heuristics\` — Master Heuristics & Axioms\n`;
    list += `• \`/nlm export all\` — Export all 14 clusters\n\n`;
    for (const c of graph.clusters) {
      list += `• \`/nlm export ${c.id}\` — *${c.label}* (${c.nodeIds.length} sources)\n`;
    }
    await ctx.reply(list, { parse_mode: "Markdown" });
  } else if (data === "prep:menu") {
    await handlePrep(ctx);
  } else if (data === "prep:score") {
    const userId = ctx.from?.id ? String(ctx.from.id) : "operator";
    const scoreMsg = formatScoreMessage(userId);
    const keyboard = new InlineKeyboard()
      .text("📘 Computer Networks", "prep:q:Computer_Networks:random")
      .row()
      .text("⚡ Systems Design", "prep:q:Computer_Systems_Design:random")
      .row()
      .text("🧬 Biological Networks", "prep:q:BDBN:random")
      .row()
      .text("🔄 Reset Score", "prep:reset")
      .text("🏠 Academic Hub", "prep:menu");
    await ctx.reply(scoreMsg, { parse_mode: "Markdown", reply_markup: keyboard });
  } else if (data === "prep:reset") {
    const userId = ctx.from?.id ? String(ctx.from.id) : "operator";
    resetUserScore(userId);
    await ctx.reply("🔄 *Quiz Score Reset!* Your session performance has been cleared.", {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("🎯 Start Fresh Quiz", "prep:menu"),
    });
  } else if (data.startsWith("prep:nlm:")) {
    const alias = data.replace("prep:nlm:", "");
    await handlePrepNotebookLMUpload(ctx, alias);
  } else if (data === "prep:export_menu") {
    const keyboard = new InlineKeyboard()
      .text("📘 Export Computer Networks", "nlm:export:cn")
      .row()
      .text("⚡ Export Systems Design", "nlm:export:csd")
      .row()
      .text("🧬 Export Biological Networks", "nlm:export:bdbn")
      .row()
      .text("🎓 Export All 3 (IITM Pack)", "nlm:export:iitm")
      .row()
      .text("🏠 Back to Hub", "prep:menu");

    await ctx.reply(
      `🎙️ *IITM BS Quiz 1 Source Bundles for Google NotebookLM*\n\n` +
        `Select a course below to immediately receive its compiled Markdown study guide file.\n` +
        `You can then upload it to NotebookLM to generate high-yield active recall quizzes and dual-host audio overviews!`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } else if (data.startsWith("prep:q:")) {
    // format: prep:q:<subjectKey>:<qIdx>
    const parts = data.split(":");
    let subjectKey = parts[2];
    const requestedIdx = parts[3];
    const userId = ctx.from?.id ? String(ctx.from.id) : "operator";

    const bank = loadQuestionBank();
    const subjectKeys = Object.keys(bank);

    if (subjectKey === "random" || !bank[subjectKey]) {
      subjectKey = subjectKeys[Math.floor(Math.random() * subjectKeys.length)];
    }

    const list = bank[subjectKey]?.questions || [];
    if (list.length === 0) {
      await ctx.reply("⚠️ No questions found for this subject.");
      return;
    }

    const qIdx =
      requestedIdx === "random" || isNaN(Number(requestedIdx))
        ? Math.floor(Math.random() * list.length)
        : Number(requestedIdx) % list.length;

    const q = list[qIdx];
    const { text: msg, keyboard } = formatQuestionCard(subjectKey, qIdx, q, userId);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
  } else if (data.startsWith("prep_ans:")) {
    // format: prep_ans:<subjectKey>:<qIdx>:<optIdx>
    const [, , subjectKey, qIdxStr, optIdxStr] = data.split(":");
    const bank = loadQuestionBank();
    const qList = bank[subjectKey]?.questions || [];
    const qIdx = Number(qIdxStr);
    const optIdx = Number(optIdxStr);
    const q = qList[qIdx];
    const userId = ctx.from?.id ? String(ctx.from.id) : "operator";

    if (!q) {
      await ctx.reply("⚠️ Question no longer available.");
      return;
    }

    const { isCorrect, chosenOptionText, correctOptionText } = checkAnswer(q, optIdx);
    const marks = Number(q.marks) || 1;
    const score = recordPrepAnswer(userId, subjectKey, isCorrect, marks);
    const acc = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    let reply = "";
    if (isCorrect) {
      reply += `🎯 *CORRECT! (+${marks} Marks)*\n`;
      reply += `🔥 *Streak: ${score.streak}* | 🏆 *Score: ${score.correct}/${score.total} (${acc}%)*\n\n`;
    } else {
      reply += `❌ *INCORRECT*\n`;
      reply += `🏆 *Score: ${score.correct}/${score.total} (${acc}%)*\n\n`;
      reply += `• Your choice: *${chosenOptionText}*\n`;
      reply += `• Verified Answer: *${correctOptionText}*\n\n`;
    }

    reply += `🧠 *Grokking First-Principles & Invariants:*\n`;
    reply += `• *Paper Source:* \`${q.source_paper}\`\n`;
    reply += `• *Exam Rule:* High-pressure 45-min IITM quizzes test edge conditions and unit conversions (e.g. bits vs bytes, propagation vs transmission delay, radix digit bounds).\n`;

    const keyboard = new InlineKeyboard()
      .text("➡️ Next Question", `prep:q:${subjectKey}:random`)
      .row()
      .text("💡 Reveal Solution", `prep_sol:${subjectKey}:${qIdx}`)
      .text("🎲 Mix Subject", "prep:q:random:random")
      .row()
      .text("🏆 My Score", "prep:score")
      .text("🏠 Academic Hub", "prep:menu");

    await ctx.reply(reply, { parse_mode: "Markdown", reply_markup: keyboard });
  } else if (data.startsWith("prep_sol:")) {
    // format: prep_sol:<subjectKey>:<qIdx>
    const [, , subjectKey, qIdxStr] = data.split(":");
    const bank = loadQuestionBank();
    const q = bank[subjectKey]?.questions[Number(qIdxStr)];

    if (!q) {
      await ctx.reply("⚠️ Question not found.");
      return;
    }

    let reply = `💡 *Official Solution & Verification:*\n`;
    reply += `*Paper:* \`${q.source_paper}\` | *Value:* \`${q.marks} Marks\`\n\n`;
    reply += `❓ *Question:*\n${q.text}\n\n`;

    if (q.options && q.options.length > 0) {
      reply += `*All Options:*\n`;
      for (const opt of q.options) {
        const isTrue = opt.includes("✓ Correct");
        const clean = opt.replace("✓ Correct", "").trim();
        reply += `${isTrue ? "✅ **" + clean + "** *(Correct)*" : "▫️ " + clean}\n`;
      }
      reply += `\n`;
    }

    if (q.answer) {
      reply += `*Exact Evaluated Value:* \`${q.answer}\`\n\n`;
    }

    reply += `📐 *Grokking Mental Model:*\n`;
    reply += `Check the corresponding master formula in your NotebookLM guide (\`/nlm export ${
      subjectKey === "Computer_Networks" ? "cn" : subjectKey === "Computer_Systems_Design" ? "csd" : "bdbn"
    }\`).`;

    const keyboard = new InlineKeyboard()
      .text("➡️ Next Question", `prep:q:${subjectKey}:random`)
      .row()
      .text("🏠 Academic Hub", "prep:menu");

    await ctx.reply(reply, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}
