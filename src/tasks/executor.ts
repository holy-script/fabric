import { validateDAG } from "./planner.js";
import type {
  TaskPlan,
  TaskStep,
  ExecutionState,
  ExecutorOptions,
  StepHandler,
  TaskActionType,
} from "./types.js";

/**
 * Returns a topologically sorted array of steps.
 * Throws an Error if the dependency graph contains a cycle or invalid references.
 */
export function topologicalSort(steps: TaskStep[]): TaskStep[] {
  const validation = validateDAG(steps);
  if (!validation.isValid) {
    throw new Error(`DAG Validation Failed: ${validation.error}`);
  }

  const idToStep = new Map<string, TaskStep>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    idToStep.set(step.id, step);
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

  const sorted: TaskStep[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    sorted.push(idToStep.get(currId)!);

    for (const neighborId of adj.get(currId) || []) {
      const newDeg = (inDegree.get(neighborId) || 0) - 1;
      inDegree.set(neighborId, newDeg);
      if (newDeg === 0) {
        queue.push(neighborId);
      }
    }
  }

  return sorted;
}

/**
 * Resolves dot-notated path in an object (e.g. "pyq_summary.topics.0")
 */
function resolvePath(obj: any, path: string): any {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr == null) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Interpolates ${blackboard.path} or ${path} expressions using the blackboard state.
 * If the entire string is exactly a token, returns the raw typed value from the blackboard.
 */
export function interpolateBlackboard(val: any, blackboard: Record<string, any>): any {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === "string") {
    // Check if the string is EXACTLY a single expression like "${blackboard.key}"
    const exactMatch = val.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      let key = exactMatch[1].trim();
      if (key.startsWith("blackboard.")) {
        key = key.replace(/^blackboard\./, "");
      }
      const resolved = resolvePath(blackboard, key);
      return resolved !== undefined ? resolved : val;
    }

    // Otherwise perform embedded string template replacement
    return val.replace(/\$\{([^}]+)\}/g, (match, expression) => {
      let key = expression.trim();
      if (key.startsWith("blackboard.")) {
        key = key.replace(/^blackboard\./, "");
      }
      const resolved = resolvePath(blackboard, key);
      if (resolved === undefined) return match;
      if (typeof resolved === "object") return JSON.stringify(resolved);
      return String(resolved);
    });
  }

  if (Array.isArray(val)) {
    return val.map((item) => interpolateBlackboard(item, blackboard));
  }

  if (typeof val === "object") {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = interpolateBlackboard(v, blackboard);
    }
    return result;
  }

  return val;
}

/**
 * Built-in default step handlers for the 5 4F action types.
 */
export const defaultActionHandlers: Record<TaskActionType, StepHandler> = {
  browser: async (step, { blackboard }) => {
    const payload = step.payload;
    const query = payload.query || payload.url || step.title;
    return {
      status: "success",
      source: "browser_agent",
      query,
      results: [
        {
          title: `Findings on ${query}`,
          snippet: `Extracted key data and reference materials for ${query}`,
          confidence: 0.94,
        },
      ],
      timestamp: new Date().toISOString(),
    };
  },

  ai_reasoning: async (step, { blackboard }) => {
    const payload = step.payload;
    const topic = payload.topic || payload.input || step.title;
    return {
      status: "success",
      source: "ai_reasoning_synthesizer",
      topic,
      summary: `Synthesized analysis for ${topic}. Extracted core axioms and structured conclusions.`,
      confidence: 0.97,
      completedAt: new Date().toISOString(),
    };
  },

  calculation: async (step, { blackboard }) => {
    const payload = step.payload;
    return {
      status: "success",
      source: "computational_engine",
      computed: true,
      parameters: payload,
      outputSummary: `Computed formulas and metric weighting for ${step.title}`,
      score: 1.0,
      timestamp: new Date().toISOString(),
    };
  },

  export: async (step, { blackboard }) => {
    const payload = step.payload;
    const target = payload.target || payload.destination || "local_filesystem";
    return {
      status: "success",
      source: "export_bridge",
      destination: target,
      format: payload.format || "markdown",
      path: `data/export_${step.id}_${Date.now()}.md`,
      sizeBytes: 1024,
      syncedAt: new Date().toISOString(),
    };
  },

  notify: async (step, { blackboard }) => {
    const payload = step.payload;
    const channel = payload.channel || "telegram_vault";
    return {
      status: "delivered",
      source: "notification_hub",
      channel,
      messagePreview: payload.message || `Completed step: ${step.title}`,
      dispatchedAt: new Date().toISOString(),
    };
  },
};

export class TaskExecutor {
  private customHandlers: Record<string, StepHandler>;
  private maxConcurrency: number;
  private continueOnError: boolean;
  private onStepStart?: (step: TaskStep) => void | Promise<void>;
  private onStepComplete?: (step: TaskStep, result: any) => void | Promise<void>;
  private onStepFailed?: (step: TaskStep, error: Error) => void | Promise<void>;

  constructor(options: ExecutorOptions = {}) {
    this.customHandlers = options.customHandlers || {};
    this.maxConcurrency = options.maxConcurrency || 5;
    this.continueOnError = options.continueOnError || false;
    this.onStepStart = options.onStepStart;
    this.onStepComplete = options.onStepComplete;
    this.onStepFailed = options.onStepFailed;
  }

  /**
   * Executes a TaskPlan following its DAG dependencies.
   * Runs independent steps in parallel and dependent steps sequentially.
   */
  async executePlan(
    plan: TaskPlan,
    initialBlackboard: Record<string, any> = {}
  ): Promise<{ plan: TaskPlan; state: ExecutionState }> {
    // Validate DAG first
    const validation = validateDAG(plan.steps);
    if (!validation.isValid) {
      plan.status = "failed";
      plan.updatedAt = new Date().toISOString();
      throw new Error(`Cannot execute invalid DAG: ${validation.error}`);
    }

    plan.status = "running";
    plan.updatedAt = new Date().toISOString();

    const state: ExecutionState = {
      activePlanId: plan.id,
      completedStepIds: [],
      failedStepIds: [],
      runningStepIds: [],
      skippedStepIds: [],
      blackboard: { ...initialBlackboard },
    };

    const completedSet = new Set<string>();
    const failedSet = new Set<string>();
    const skippedSet = new Set<string>();

    const stepMap = new Map<string, TaskStep>(plan.steps.map((s) => [s.id, s]));

    while (true) {
      // Find all steps that are still 'pending'
      const pendingSteps = plan.steps.filter((s) => s.status === "pending");
      if (pendingSteps.length === 0) {
        break;
      }

      // Find ready steps whose dependencies are ALL completed
      const readySteps: TaskStep[] = [];
      const unrunnableSteps: TaskStep[] = [];

      for (const step of pendingSteps) {
        const hasFailedDep = step.dependencies.some(
          (d) => failedSet.has(d) || skippedSet.has(d)
        );
        if (hasFailedDep) {
          unrunnableSteps.push(step);
          continue;
        }

        const allDepsCompleted = step.dependencies.every((d) => completedSet.has(d));
        if (allDepsCompleted) {
          readySteps.push(step);
        }
      }

      // If any pending steps have failed/skipped dependencies, cascade-skip them
      if (unrunnableSteps.length > 0) {
        for (const step of unrunnableSteps) {
          step.status = "skipped";
          step.error = "Cascaded skip: Upstream dependency failed or was skipped";
          skippedSet.add(step.id);
          state.skippedStepIds?.push(step.id);
        }
      }

      // If no steps are ready, but there are pending steps, we are deadlocked
      if (readySteps.length === 0) {
        for (const step of pendingSteps) {
          if (step.status === "pending") {
            step.status = "skipped";
            step.error = "Unresolvable dependency deadlock";
            skippedSet.add(step.id);
            state.skippedStepIds?.push(step.id);
          }
        }
        break;
      }

      // Execute ready steps concurrently up to maxConcurrency
      const batches: TaskStep[][] = [];
      for (let i = 0; i < readySteps.length; i += this.maxConcurrency) {
        batches.push(readySteps.slice(i, i + this.maxConcurrency));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map((step) =>
            this.executeSingleStep(step, plan, state, completedSet, failedSet)
          )
        );
      }
    }

    const hasFailures = failedSet.size > 0;
    plan.status = hasFailures && !this.continueOnError ? "failed" : "completed";
    plan.updatedAt = new Date().toISOString();

    state.completedStepIds = Array.from(completedSet);
    state.failedStepIds = Array.from(failedSet);
    state.skippedStepIds = Array.from(skippedSet);

    return { plan, state };
  }

  /**
   * Executes a single step with retry handling, blackboard interpolation, and state updates.
   */
  private async executeSingleStep(
    step: TaskStep,
    plan: TaskPlan,
    state: ExecutionState,
    completedSet: Set<string>,
    failedSet: Set<string>
  ): Promise<void> {
    step.status = "running";
    step.startedAt = new Date().toISOString();
    state.runningStepIds = state.runningStepIds || [];
    state.runningStepIds.push(step.id);

    if (this.onStepStart) {
      try {
        await this.onStepStart(step);
      } catch (e) {
        // Callback error should not abort step
      }
    }

    // Interpolate blackboard variables in payload
    const resolvedPayload = interpolateBlackboard(step.payload, state.blackboard);
    const stepWithResolvedPayload: TaskStep = {
      ...step,
      payload: resolvedPayload,
    };

    const maxRetries = step.maxRetries ?? 2;
    let attempt = 0;
    let executionSuccess = false;
    let lastError: any = null;

    while (attempt <= maxRetries && !executionSuccess) {
      attempt++;
      try {
        const handler: StepHandler =
          this.customHandlers[step.id] ||
          this.customHandlers[step.actionType] ||
          defaultActionHandlers[step.actionType];

        if (!handler) {
          throw new Error(`No handler registered for actionType '${step.actionType}'`);
        }

        const result = await handler(stepWithResolvedPayload, {
          blackboard: state.blackboard,
          plan,
          state,
        });

        step.result = result;
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        step.retries = attempt - 1;
        delete step.error;

        // Inject output into the blackboard
        state.blackboard[step.id] = result;
        if (step.payload?.outputKey && typeof step.payload.outputKey === "string") {
          state.blackboard[step.payload.outputKey] = result;
        }

        completedSet.add(step.id);
        executionSuccess = true;

        if (this.onStepComplete) {
          try {
            await this.onStepComplete(step, result);
          } catch (e) {}
        }
      } catch (err: any) {
        lastError = err;
        if (attempt <= maxRetries) {
          // Linear backoff: 20ms * attempt
          await new Promise((res) => setTimeout(res, 20 * attempt));
        }
      }
    }

    state.runningStepIds = state.runningStepIds.filter((id) => id !== step.id);

    if (!executionSuccess) {
      step.status = "failed";
      step.error = lastError?.message || "Unknown step execution failure";
      step.retries = attempt - 1;
      failedSet.add(step.id);

      if (this.onStepFailed) {
        try {
          await this.onStepFailed(step, lastError);
        } catch (e) {}
      }
    }
  }
}
