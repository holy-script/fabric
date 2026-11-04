import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";
import type { TaskPlan, TaskStep, TaskActionType, CostEstimate } from "./types.js";

/**
 * Validates that the steps form a valid Directed Acyclic Graph (DAG)
 * and that all dependencies exist.
 */
export function validateDAG(steps: TaskStep[]): { isValid: boolean; error?: string } {
  const stepIds = new Set<string>();
  const idToStep = new Map<string, TaskStep>();

  for (const step of steps) {
    if (stepIds.has(step.id)) {
      return { isValid: false, error: `Duplicate step ID: ${step.id}` };
    }
    stepIds.add(step.id);
    idToStep.set(step.id, step);
  }

  // Check that all dependencies exist
  for (const step of steps) {
    for (const depId of step.dependencies) {
      if (!stepIds.has(depId)) {
        return { isValid: false, error: `Step '${step.id}' depends on non-existent step '${depId}'` };
      }
      if (depId === step.id) {
        return { isValid: false, error: `Step '${step.id}' cannot depend on itself` };
      }
    }
  }

  // Cycle detection via Kahn's algorithm
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, step.dependencies.length);
    adj.set(step.id, []);
  }

  for (const step of steps) {
    for (const depId of step.dependencies) {
      adj.get(depId)?.push(step.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visitedCount++;
    for (const neighbor of adj.get(curr) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visitedCount !== steps.length) {
    return { isValid: false, error: "Cycle detected in task dependencies; not a valid DAG" };
  }

  return { isValid: true };
}

function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

/**
 * Deterministic structured fallback planner when LLM is unavailable or times out.
 */
export function buildStructuredFallbackPlan(goalPrompt: string): TaskPlan {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const lower = goalPrompt.toLowerCase();
  let steps: TaskStep[] = [];

  // Goal Pattern 1: IITM Quiz / Computer Networks / NotebookLM
  if (
    (lower.includes("iitm") || lower.includes("quiz") || lower.includes("computer networks")) &&
    (lower.includes("notebooklm") || lower.includes("podcast") || lower.includes("recall") || lower.includes("pyq"))
  ) {
    steps = [
      {
        id: "step_grok_pyqs",
        title: "Grok PYQs & Pattern Mining",
        description: "Extract, categorize, and mine high-yield patterns from prior year questions for IITM Computer Networks Quiz 1",
        dependencies: [],
        actionType: "calculation",
        payload: {
          course: "Computer Networks",
          quiz: "Quiz 1",
          sourcePath: "data/raw_pyqs_quiz1.json",
          outputKey: "pyq_summary",
        },
        status: "pending",
        costEstimate: { focusHours: 0.75, tokens: 2500 },
        maxRetries: 2,
      },
      {
        id: "step_formula_guide",
        title: "Compile Formula & Theorem Guide",
        description: "Synthesize essential formulas, subnetting math, delay calculations, and protocol headers using ${blackboard.pyq_summary}",
        dependencies: ["step_grok_pyqs"],
        actionType: "ai_reasoning",
        payload: {
          input: "${blackboard.pyq_summary}",
          topic: "Computer Networks formulas, Shannon/Nyquist theorem, propagation delays",
          outputKey: "formula_guide",
        },
        status: "pending",
        costEstimate: { focusHours: 0.5, tokens: 3500 },
        maxRetries: 2,
      },
      {
        id: "step_sync_notebooklm",
        title: "Sync to NotebookLM",
        description: "Export high-yield markdown study source bundle and prepare NotebookLM podcast input",
        dependencies: ["step_formula_guide"],
        actionType: "export",
        payload: {
          content: "${blackboard.formula_guide}",
          format: "markdown",
          target: "notebooklm_source",
          outputKey: "notebooklm_bundle",
        },
        status: "pending",
        costEstimate: { focusHours: 0.25, tokens: 1000 },
        maxRetries: 2,
      },
      {
        id: "step_recall_questions",
        title: "Generate Active Recall Questions",
        description: "Generate 10 high-impact active recall questions and self-test scenarios based on ${blackboard.pyq_summary} and ${blackboard.formula_guide}",
        dependencies: ["step_grok_pyqs", "step_formula_guide"],
        actionType: "ai_reasoning",
        payload: {
          pyqs: "${blackboard.pyq_summary}",
          formulas: "${blackboard.formula_guide}",
          count: 10,
          outputKey: "recall_questions",
        },
        status: "pending",
        costEstimate: { focusHours: 0.5, tokens: 2000 },
        maxRetries: 2,
      },
    ];
  }
  // Goal Pattern 2: Google AI Mode / Research / Notion / Telegram
  else if (
    (lower.includes("ai mode") || lower.includes("research") || lower.includes("search")) &&
    (lower.includes("notion") || lower.includes("telegram") || lower.includes("summarize"))
  ) {
    const topicMatch = goalPrompt.match(/(?:research|search for|about)\s+([^.]+?)(?:\s+(?:via|using|and|in)\s+|$)/i);
    const topic = topicMatch ? topicMatch[1].trim() : goalPrompt.replace(/research/i, "").trim();

    steps = [
      {
        id: "step_ai_mode_query",
        title: "Run Google AI Mode Query",
        description: `Execute Google AI Mode query for topic: '${topic}' and collect rich synthesis and verified citations`,
        dependencies: [],
        actionType: "browser",
        payload: {
          query: topic,
          engine: "google_ai_mode",
          outputKey: "raw_ai_mode_output",
        },
        status: "pending",
        costEstimate: { focusHours: 0.5, tokens: 2500 },
        maxRetries: 2,
      },
      {
        id: "step_synthesize_findings",
        title: "Synthesize Findings",
        description: "Distill the raw AI Mode results into structured takeaways, insights, and key heuristics from ${blackboard.raw_ai_mode_output}",
        dependencies: ["step_ai_mode_query"],
        actionType: "ai_reasoning",
        payload: {
          input: "${blackboard.raw_ai_mode_output}",
          topic,
          outputKey: "synthesized_summary",
        },
        status: "pending",
        costEstimate: { focusHours: 0.5, tokens: 3000 },
        maxRetries: 2,
      },
      {
        id: "step_sync_notion",
        title: "Sync to Notion",
        description: "Create or update structured Notion database item containing the synthesized research notes",
        dependencies: ["step_synthesize_findings"],
        actionType: "export",
        payload: {
          destination: "notion",
          title: `Research: ${topic}`,
          content: "${blackboard.synthesized_summary}",
          outputKey: "notion_page_record",
        },
        status: "pending",
        costEstimate: { focusHours: 0.25, tokens: 1000 },
        maxRetries: 2,
      },
      {
        id: "step_notify_telegram",
        title: "Notify in Telegram",
        description: "Send instant notification and deep-link to Notion in Telegram channel",
        dependencies: ["step_sync_notion"],
        actionType: "notify",
        payload: {
          channel: "vault",
          message: "Research completed and synced to Notion: ${blackboard.notion_page_record.title}",
          outputKey: "telegram_notification_id",
        },
        status: "pending",
        costEstimate: { focusHours: 0.1, tokens: 400 },
        maxRetries: 2,
      },
    ];
  }
  // Generic Fallback Plan
  else {
    steps = [
      {
        id: "step_gather_context",
        title: "Gather Context & References",
        description: `Gather inputs, relevant references, and domain context for goal: ${goalPrompt}`,
        dependencies: [],
        actionType: "browser",
        payload: {
          goal: goalPrompt,
          outputKey: "context_payload",
        },
        status: "pending",
        costEstimate: { focusHours: 0.5, tokens: 1500 },
        maxRetries: 2,
      },
      {
        id: "step_analyze_and_reason",
        title: "Analyze & Reason Over Inputs",
        description: "Analyze the gathered context and develop execution plan using ${blackboard.context_payload}",
        dependencies: ["step_gather_context"],
        actionType: "ai_reasoning",
        payload: {
          input: "${blackboard.context_payload}",
          outputKey: "analysis_result",
        },
        status: "pending",
        costEstimate: { focusHours: 0.75, tokens: 3000 },
        maxRetries: 2,
      },
      {
        id: "step_compute_deliverables",
        title: "Compute Core Deliverables",
        description: "Perform necessary calculations and produce final deliverables based on ${blackboard.analysis_result}",
        dependencies: ["step_analyze_and_reason"],
        actionType: "calculation",
        payload: {
          input: "${blackboard.analysis_result}",
          outputKey: "deliverables",
        },
        status: "pending",
        costEstimate: { focusHours: 0.5, tokens: 2000 },
        maxRetries: 2,
      },
      {
        id: "step_export_artifact",
        title: "Export Artifact & Notify",
        description: "Export final output bundle and broadcast notification to user",
        dependencies: ["step_compute_deliverables"],
        actionType: "export",
        payload: {
          content: "${blackboard.deliverables}",
          outputKey: "export_status",
        },
        status: "pending",
        costEstimate: { focusHours: 0.25, tokens: 800 },
        maxRetries: 2,
      },
    ];
  }

  const totalCostEstimate = calculateTotalCost(steps);

  return {
    id: planId,
    goal: goalPrompt,
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    metadata: {
      source: "structured_fallback",
      stepCount: steps.length,
    },
    totalCostEstimate,
  };
}

function calculateTotalCost(steps: TaskStep[]): CostEstimate {
  let focusHours = 0;
  let tokens = 0;
  for (const step of steps) {
    if (step.costEstimate?.focusHours) {
      focusHours += step.costEstimate.focusHours;
    }
    if (step.costEstimate?.tokens) {
      tokens += step.costEstimate.tokens;
    }
  }
  return {
    focusHours: Math.round(focusHours * 100) / 100,
    tokens,
  };
}

export interface CompileOptions {
  forceFallback?: boolean;
  timeoutMs?: number;
  userId?: string;
}

const SYSTEM_HTN_PLANNER_PROMPT = `You are the Autonomous Goal Compiler & HTN (Hierarchical Task Network) Task Engine Architect for Fabric OS (Personal Meta-OS).
Decompose the user's high-level goal into a Directed Acyclic Graph (DAG) of actionable, modular steps.

Rules:
1. Every step must have a unique ID (e.g. "step_1", "step_2", etc. or semantic like "step_grok_pyqs").
2. "dependencies": Array of step IDs that must be completed BEFORE this step can run. Independent steps should have dependencies: [].
3. "actionType": One of:
   - "browser": Web retrieval, search, scraping, Google AI Mode query
   - "ai_reasoning": LLM analysis, synthesis, extraction, summarization, prompt generation
   - "calculation": Algorithmic computation, formula solving, metric score weighting, code execution
   - "export": Saving files, generating markdown bundles, syncing to NotebookLM, Notion, or local storage
   - "notify": Alerting the user via Telegram, Discord, or SMS
4. "payload": JSON object containing parameters for this step. Use \${blackboard.key} or \${blackboard.step_id.key} to reference outputs of upstream steps.
5. "costEstimate": Estimate {"focusHours": number, "tokens": number}.
6. NO CYCLES. The graph must be a valid DAG.
7. Return strictly valid JSON with this exact structure:
{
  "goal": "original goal",
  "steps": [
    {
      "id": "step_1",
      "title": "Title",
      "description": "Clear description",
      "dependencies": [],
      "actionType": "browser",
      "payload": { ... },
      "costEstimate": { "focusHours": 0.5, "tokens": 1500 }
    }
  ]
}`;

/**
 * Compiles a high-level user goal into an executable HTN TaskPlan DAG.
 * Uses Gemini 3.5 Flash when available with an automatic structured fallback.
 */
export async function compileGoalToPlan(
  goalPrompt: string,
  options: CompileOptions = {}
): Promise<TaskPlan> {
  const trimmedGoal = goalPrompt.trim();
  if (!trimmedGoal) {
    throw new Error("Goal prompt cannot be empty");
  }

  if (options.forceFallback || !config.geminiApiKey) {
    return buildStructuredFallbackPlan(trimmedGoal);
  }

  const timeoutMs = options.timeoutMs ?? 5000;

  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
    });

    const prompt = `${SYSTEM_HTN_PLANNER_PROMPT}

User Goal:
"${trimmedGoal}"`;

    const fetchPromise = model.generateContent(prompt).then((res) => res.response.text());
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini planner timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const rawResponse = await Promise.race([fetchPromise, timeoutPromise]);
    const cleanedJson = cleanJsonOutput(rawResponse);
    const parsed = JSON.parse(cleanedJson);

    if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error("Planner response did not contain a valid steps array");
    }

    const validActionTypes = new Set<TaskActionType>([
      "browser",
      "ai_reasoning",
      "calculation",
      "export",
      "notify",
      "swarm",
    ]);

    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const steps: TaskStep[] = parsed.steps.map((rawStep: any, idx: number) => {
      const stepId = typeof rawStep.id === "string" && rawStep.id.trim()
        ? rawStep.id.trim()
        : `step_${idx + 1}`;
      
      const actionType: TaskActionType = validActionTypes.has(rawStep.actionType)
        ? rawStep.actionType
        : "ai_reasoning";

      const deps = Array.isArray(rawStep.dependencies)
        ? rawStep.dependencies.filter((d: any) => typeof d === "string")
        : [];

      return {
        id: stepId,
        title: rawStep.title || `Step ${idx + 1}`,
        description: rawStep.description || "",
        dependencies: deps,
        actionType,
        payload: typeof rawStep.payload === "object" && rawStep.payload !== null ? rawStep.payload : {},
        status: "pending",
        isSwarm: Boolean(rawStep.isSwarm || rawStep.actionType === "swarm"),
        swarmRole: rawStep.swarmRole,
        swarmRoles: Array.isArray(rawStep.swarmRoles) ? rawStep.swarmRoles : undefined,
        swarmConfig: typeof rawStep.swarmConfig === "object" ? rawStep.swarmConfig : undefined,
        costEstimate: {
          focusHours: typeof rawStep.costEstimate?.focusHours === "number" ? rawStep.costEstimate.focusHours : 0.25,
          tokens: typeof rawStep.costEstimate?.tokens === "number" ? rawStep.costEstimate.tokens : 1000,
        },
        maxRetries: 2,
      };
    });

    const validation = validateDAG(steps);
    if (!validation.isValid) {
      console.warn(`[HTN Planner] LLM generated invalid DAG: ${validation.error}. Falling back to structured planner.`);
      return buildStructuredFallbackPlan(trimmedGoal);
    }

    const totalCostEstimate = calculateTotalCost(steps);

    return {
      id: planId,
      goal: trimmedGoal,
      steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      metadata: {
        source: "gemini-3.5-flash",
        stepCount: steps.length,
      },
      totalCostEstimate,
    };
  } catch (err: any) {
    console.warn(`[HTN Planner] LLM plan compilation failed (${err?.message}). Utilizing structured fallback.`);
    return buildStructuredFallbackPlan(trimmedGoal);
  }
}
