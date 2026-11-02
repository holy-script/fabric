import type { Context } from "grammy";
import { compileGoalToPlan } from "../../tasks/planner.js";
import { TaskExecutor } from "../../tasks/executor.js";
import { TaskStore } from "../../tasks/store.js";
import { browsePage, runAiModeQuery, syncNotebookLM } from "../../browser/tool.js";

const store = new TaskStore();

export async function handleTaskCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || "";
  const goal = text.replace(/^\/task\s*/i, "").trim();

  if (!goal) {
    let guide = `🎯 *Fabric OS: Autonomous Task & Goal Engine (HTN)*\n\n`;
    guide += `Compiles any high-level directive into an execution DAG with dependency tracking, parallel wavefront scheduling, and self-healing retries.\n\n`;
    guide += `📌 *Usage:*\n`;
    guide += `• \`/task <complex goal>\`\n\n`;
    guide += `_Examples:_\n`;
    guide += `• \`/task Study for IITM Quiz 1 CN and sync with NotebookLM\`\n`;
    guide += `• \`/task Research state of local SLMs via Google AI Mode and notify Telegram\`\n`;
    await ctx.reply(guide, { parse_mode: "Markdown" });
    return;
  }

  const statusMsg = await ctx.reply(`🧠 *Compiling Goal into Hierarchical Task DAG...*\n_"${goal}"_`, {
    parse_mode: "Markdown",
  });

  try {
    const plan = await compileGoalToPlan(goal);
    await store.save(plan);

    let planOverview = `📋 *Compiled Plan: \`${plan.id}\`*\n`;
    planOverview += `🎯 *Goal:* ${plan.goal}\n`;
    planOverview += `⏳ *Focus Budget:* ~${plan.totalCostEstimate?.focusHours || 1}h\n\n`;
    planOverview += `*Execution Steps (${plan.steps.length}):*\n`;

    for (let i = 0; i < plan.steps.length; i++) {
      const s = plan.steps[i];
      const deps = s.dependencies.length > 0 ? ` _(after ${s.dependencies.join(", ")})_` : " _(root)_";
      planOverview += `${i + 1}. [${s.actionType.toUpperCase()}] *${s.title}*${deps}\n`;
    }

    planOverview += `\n⚡ *Executing DAG wavefronts in background...*`;

    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, planOverview, {
      parse_mode: "Markdown",
    });

    // Wire up real browser and tool handlers
    const executor = new TaskExecutor({
      customHandlers: {
        browser: async (step) => {
          if (step.payload.query) {
            return await runAiModeQuery(step.payload.query);
          }
          if (step.payload.url) {
            return await browsePage(step.payload.url, { screenshot: false, extractText: true });
          }
          return { skipped: true, reason: "No url or query" };
        },
        export: async (step) => {
          if (step.payload.target === "notebooklm" || step.payload.filePath) {
            return await syncNotebookLM(step.title, step.payload.filePath || "data/notebooklm_sources/IITM_Quiz1_Computer_Networks_Grokking_Mastery.md", true);
          }
          return { exported: true };
        },
        notify: async (step, context) => {
          const msg = step.payload.message || `✅ Step completed: ${step.title}`;
          await ctx.reply(`📢 *Task Notification:*\n${msg}`, { parse_mode: "Markdown" });
          return { notified: true };
        },
      },
      onStepComplete: async (step, result) => {
        console.log(`[TaskPlanner] Step ${step.id} completed:`, step.title);
      },
    });

    const { plan: finishedPlan, state: execState } = await executor.executePlan(plan);
    await store.save(finishedPlan);

    const completedCount = execState.completedStepIds.length;
    const failedCount = execState.failedStepIds?.length || 0;

    let finalReport = `🏁 *Plan Execution Finished!*\n`;
    finalReport += `• Plan ID: \`${finishedPlan.id}\`\n`;
    finalReport += `• Status: *${finishedPlan.status.toUpperCase()}*\n`;
    finalReport += `• Completed Steps: \`${completedCount} / ${finishedPlan.steps.length}\`\n`;
    if (failedCount > 0) {
      finalReport += `• Failed Steps: \`${failedCount}\`\n`;
    }

    await ctx.reply(finalReport, { parse_mode: "Markdown" });
  } catch (err: any) {
    console.error("Task execution error:", err);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ *Task Compilation Failed:* ${err.message}`,
      { parse_mode: "Markdown" }
    );
  }
}
