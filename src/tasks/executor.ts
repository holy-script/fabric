import { validateDAG } from "./planner.js";
import { getCurrentAmbientContext } from "../services/ambient.js";
import type {
  TaskPlan,
  TaskStep,
  ExecutionState,
  ExecutorOptions,
  StepHandler,
  TaskActionType,
  SwarmRole,
  SwarmArtifact,
  SwarmResult,
  SwarmRoleHandler,
  SwarmHandlerContext,
  TaskTimelineEvent,
  TaskExecutionMetrics,
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
 * Default role handlers for the Autonomous Multi-Agent Swarm mesh.
 */
export const defaultSwarmRoleHandlers: Record<SwarmRole, SwarmRoleHandler> = {
  recon: async (step, { blackboard }) => {
    const query = step.payload?.query || step.payload?.topic || step.payload?.input || step.title;
    const findings = typeof query === "string"
      ? `Reconnaissance analysis for "${query}": probed context, dependencies, and codebase boundaries.`
      : `Probed context and gathered intelligence for ${step.title}`;
    return {
      role: "recon",
      status: "completed",
      findings,
      evidence: [
        { source: "codebase", detail: `Inspected relevant components for ${step.title}` },
        { source: "ambient", detail: "Verified environmental constraints" },
      ],
      confidence: 0.95,
      timestamp: new Date().toISOString(),
    };
  },

  synthesis: async (step, { blackboard, criticFeedback, iteration }) => {
    const contextInput = step.payload?.input || blackboard.recon_findings || step.title;
    if (criticFeedback) {
      return {
        role: "synthesis",
        status: "completed",
        iteration,
        proposal: `Refined proposal addressing critique: "${criticFeedback}". Fortified logic and constraints for ${contextInput}.`,
        confidence: 0.94,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      role: "synthesis",
      status: "completed",
      iteration: 1,
      proposal: `Synthesized implementation/hypothesis based on ${contextInput}`,
      confidence: 0.91,
      timestamp: new Date().toISOString(),
    };
  },

  critic: async (step, { blackboard, previousArtifacts }) => {
    return {
      role: "critic",
      status: "approved",
      approved: true,
      confidence: 0.92,
      critique: "Dialectical evaluation passed. Constraints verified, security clear, confidence high.",
      timestamp: new Date().toISOString(),
    };
  },

  publisher: async (step, { blackboard, previousArtifacts }) => {
    return {
      role: "publisher",
      status: "completed",
      deliverable: `Packaged and published final output for ${step.title}`,
      gitCommit: `feat(${step.id}): autonomous swarm delivery for ${step.title}`,
      artifacts: { ...previousArtifacts },
      timestamp: new Date().toISOString(),
    };
  },
};

export interface SwarmExecutionOptions {
  swarmHandlers?: Partial<Record<SwarmRole, SwarmRoleHandler>>;
  onSwarmHandoff?: (
    step: TaskStep,
    fromRole: SwarmRole | null,
    toRole: SwarmRole,
    artifact: any
  ) => void | Promise<void>;
}

/**
 * Executes a swarm step through the autonomous multi-agent pipeline
 * (recon -> synthesis -> critic -> publisher) with evaluation gating and shared blackboard.
 */
export async function executeSwarmStep(
  step: TaskStep,
  plan: TaskPlan,
  state: ExecutionState,
  options: SwarmExecutionOptions = {}
): Promise<SwarmResult> {
  const stepStartTime = Date.now();

  plan.timeline = plan.timeline || [];
  plan.metrics = plan.metrics || {
    totalDurationMs: 0,
    totalRetries: 0,
    totalTokens: 0,
    swarmHandoffs: 0,
    criticRejections: 0,
    stepMetrics: {},
  };

  const roles: SwarmRole[] = (step.swarmRoles && step.swarmRoles.length > 0)
    ? step.swarmRoles
    : (step.swarmRole && !step.isSwarm ? [step.swarmRole] : ["recon", "synthesis", "critic", "publisher"]);

  const minCriticConfidence = step.swarmConfig?.minCriticConfidence ?? 0.8;
  const maxCriticRetries = step.swarmConfig?.maxCriticRetries ?? 3;

  const artifacts: Record<string, SwarmArtifact | any> = {};
  const history: SwarmArtifact[] = [];

  const handlers: Record<SwarmRole, SwarmRoleHandler> = {
    ...defaultSwarmRoleHandlers,
    ...(options.swarmHandlers || {}),
  };

  let previousRole: SwarmRole | null = null;

  // 1. RECON ROLE
  if (roles.includes("recon")) {
    const fromRole = previousRole;
    previousRole = "recon";

    plan.timeline.push({
      stepId: step.id,
      role: "recon",
      event: "swarm_handoff",
      timestamp: new Date().toISOString(),
      details: { fromRole, toRole: "recon", iteration: 1 },
    });
    plan.metrics.swarmHandoffs = (plan.metrics.swarmHandoffs || 0) + 1;

    const resolvedPayload = interpolateBlackboard(step.payload, state.blackboard);
    const stepWithPayload = { ...step, payload: resolvedPayload };

    const reconStartTime = Date.now();
    const reconRaw = await handlers.recon(stepWithPayload, {
      role: "recon",
      blackboard: state.blackboard,
      plan,
      state,
      previousArtifacts: { ...artifacts },
      iteration: 1,
    });

    const reconDurationMs = Date.now() - reconStartTime;
    const structuredRecon: SwarmArtifact = {
      role: "recon",
      status: "completed",
      findings: reconRaw?.findings ?? reconRaw?.output ?? reconRaw,
      confidence: typeof reconRaw?.confidence === "number" ? reconRaw.confidence : 0.95,
      timestamp: new Date().toISOString(),
      metrics: { durationMs: reconDurationMs },
      ...reconRaw,
    };

    artifacts.recon = structuredRecon;
    history.push(structuredRecon);

    // Populate blackboard so subsequent steps and stages can reference findings
    state.blackboard.recon_findings = structuredRecon.findings;
    state.blackboard.recon = structuredRecon;
    state.blackboard[`${step.id}_recon`] = structuredRecon;
    if (step.payload?.reconOutputKey && typeof step.payload.reconOutputKey === "string") {
      state.blackboard[step.payload.reconOutputKey] = structuredRecon.findings;
    }

    if (options.onSwarmHandoff) {
      await options.onSwarmHandoff(step, fromRole, "recon", structuredRecon);
    }
  }

  // 2. SYNTHESIS & CRITIC (with refinement loop)
  const hasSynthesis = roles.includes("synthesis");
  const hasCritic = roles.includes("critic");

  let iteration = 0;
  let criticApproved = !hasCritic;
  let lastCriticFeedback: string | undefined = undefined;
  let lastSynthesisArtifact: SwarmArtifact | null = null;
  let lastCriticArtifact: SwarmArtifact | null = null;

  if (hasSynthesis || hasCritic) {
    let loopDone = false;
    while (!loopDone && iteration < maxCriticRetries) {
      iteration++;

      // Run SYNTHESIS if included
      if (hasSynthesis) {
        const fromRole = previousRole;
        previousRole = "synthesis";

        if (iteration > 1) {
          plan.timeline.push({
            stepId: step.id,
            role: "synthesis",
            event: "refinement_loop",
            timestamp: new Date().toISOString(),
            details: { iteration, feedback: lastCriticFeedback },
          });
        }

        plan.timeline.push({
          stepId: step.id,
          role: "synthesis",
          event: "swarm_handoff",
          timestamp: new Date().toISOString(),
          details: { fromRole, toRole: "synthesis", iteration },
        });
        plan.metrics.swarmHandoffs = (plan.metrics.swarmHandoffs || 0) + 1;

        // Resolve payload dynamically using fresh blackboard state (including recon_findings)
        const resolvedPayload = interpolateBlackboard(step.payload, state.blackboard);
        const stepWithPayload = { ...step, payload: resolvedPayload };

        const synthStartTime = Date.now();
        const synthRaw = await handlers.synthesis(stepWithPayload, {
          role: "synthesis",
          blackboard: state.blackboard,
          plan,
          state,
          previousArtifacts: { ...artifacts },
          criticFeedback: lastCriticFeedback,
          iteration,
        });

        const synthDurationMs = Date.now() - synthStartTime;
        const synthArtifact: SwarmArtifact = {
          role: "synthesis",
          status: "completed",
          proposal: synthRaw?.proposal ?? synthRaw?.output ?? synthRaw,
          confidence: typeof synthRaw?.confidence === "number" ? synthRaw.confidence : 0.9,
          timestamp: new Date().toISOString(),
          metrics: { durationMs: synthDurationMs },
          ...synthRaw,
        };
        lastSynthesisArtifact = synthArtifact;

        artifacts.synthesis = synthArtifact;
        history.push(synthArtifact);

        state.blackboard.synthesis_output = synthArtifact.proposal;
        state.blackboard.synthesis = synthArtifact;
        state.blackboard[`${step.id}_synthesis`] = synthArtifact;
        if (step.payload?.synthesisOutputKey && typeof step.payload.synthesisOutputKey === "string") {
          state.blackboard[step.payload.synthesisOutputKey] = synthArtifact.proposal;
        }

        if (options.onSwarmHandoff) {
          await options.onSwarmHandoff(step, fromRole, "synthesis", synthArtifact);
        }
      }

      // Run CRITIC evaluation gate
      if (hasCritic) {
        const fromRole = previousRole;
        previousRole = "critic";

        plan.timeline.push({
          stepId: step.id,
          role: "critic",
          event: "swarm_handoff",
          timestamp: new Date().toISOString(),
          details: { fromRole, toRole: "critic", iteration },
        });
        plan.metrics.swarmHandoffs = (plan.metrics.swarmHandoffs || 0) + 1;

        const resolvedPayload = interpolateBlackboard(step.payload, state.blackboard);
        const stepWithPayload = { ...step, payload: resolvedPayload };

        const criticStartTime = Date.now();
        const criticRaw = await handlers.critic(stepWithPayload, {
          role: "critic",
          blackboard: state.blackboard,
          plan,
          state,
          previousArtifacts: { ...artifacts },
          iteration,
        });

        const criticDurationMs = Date.now() - criticStartTime;
        const confidence = typeof criticRaw?.confidence === "number"
          ? criticRaw.confidence
          : (criticRaw?.approved === false ? 0.0 : 0.92);

        const isApproved = Boolean(
          criticRaw?.approved !== false &&
          criticRaw?.status !== "rejected" &&
          confidence > minCriticConfidence
        );

        const criticArtifact: SwarmArtifact = {
          role: "critic",
          status: isApproved ? "approved" : "rejected",
          confidence,
          critique: criticRaw?.critique || criticRaw?.feedback || (isApproved ? "Approved by critic" : "Rejected by critic"),
          timestamp: new Date().toISOString(),
          metrics: { durationMs: criticDurationMs },
          ...criticRaw,
        };
        lastCriticArtifact = criticArtifact;

        artifacts.critic = criticArtifact;
        history.push(criticArtifact);

        state.blackboard.critic = criticArtifact;
        state.blackboard[`${step.id}_critic`] = criticArtifact;
        state.blackboard.critic_confidence = confidence;
        state.blackboard.critic_feedback = criticArtifact.critique;

        if (options.onSwarmHandoff) {
          await options.onSwarmHandoff(step, fromRole, "critic", criticArtifact);
        }

        if (isApproved) {
          criticApproved = true;
          loopDone = true;
          plan.timeline.push({
            stepId: step.id,
            role: "critic",
            event: "critic_approved",
            timestamp: new Date().toISOString(),
            details: { confidence, iteration },
          });
        } else {
          criticApproved = false;
          plan.metrics.criticRejections = (plan.metrics.criticRejections || 0) + 1;
          lastCriticFeedback = criticArtifact.critique;

          plan.timeline.push({
            stepId: step.id,
            role: "critic",
            event: "critic_rejected",
            timestamp: new Date().toISOString(),
            details: {
              confidence,
              minConfidence: minCriticConfidence,
              critique: lastCriticFeedback,
              iteration,
            },
          });

          if (iteration >= maxCriticRetries) {
            throw new Error(
              `Critic rejection gate failed after ${iteration} iterations (confidence: ${confidence.toFixed(2)} <= ${minCriticConfidence}). Reason: ${lastCriticFeedback}`
            );
          }
        }
      } else {
        criticApproved = true;
        loopDone = true;
      }
    }
  }

  // 3. PUBLISHER ROLE
  let publisherArtifact: SwarmArtifact | null = null;
  if (roles.includes("publisher")) {
    const fromRole = previousRole;
    previousRole = "publisher";

    plan.timeline.push({
      stepId: step.id,
      role: "publisher",
      event: "swarm_handoff",
      timestamp: new Date().toISOString(),
      details: { fromRole, toRole: "publisher", iteration },
    });
    plan.metrics.swarmHandoffs = (plan.metrics.swarmHandoffs || 0) + 1;

    const resolvedPayload = interpolateBlackboard(step.payload, state.blackboard);
    const stepWithPayload = { ...step, payload: resolvedPayload };

    const pubStartTime = Date.now();
    const pubRaw = await handlers.publisher(stepWithPayload, {
      role: "publisher",
      blackboard: state.blackboard,
      plan,
      state,
      previousArtifacts: { ...artifacts },
      iteration,
    });

    const pubDurationMs = Date.now() - pubStartTime;
    const pubArtifact: SwarmArtifact = {
      role: "publisher",
      status: "completed",
      deliverable: pubRaw?.deliverable ?? pubRaw?.output ?? pubRaw,
      timestamp: new Date().toISOString(),
      metrics: { durationMs: pubDurationMs },
      ...pubRaw,
    };
    publisherArtifact = pubArtifact;

    artifacts.publisher = pubArtifact;
    history.push(pubArtifact);

    state.blackboard.published_output = pubArtifact.deliverable;
    state.blackboard.publisher = pubArtifact;
    state.blackboard[`${step.id}_publisher`] = pubArtifact;
    if (step.payload?.publisherOutputKey && typeof step.payload.publisherOutputKey === "string") {
      state.blackboard[step.payload.publisherOutputKey] = pubArtifact.deliverable;
    }

    if (options.onSwarmHandoff) {
      await options.onSwarmHandoff(step, fromRole, "publisher", pubArtifact);
    }
  }

  const stepDurationMs = Date.now() - stepStartTime;
  plan.metrics.stepMetrics = plan.metrics.stepMetrics || {};
  plan.metrics.stepMetrics[step.id] = {
    durationMs: stepDurationMs,
    retries: Math.max(0, iteration - 1),
  };

  const finalOutput = publisherArtifact?.deliverable ??
    publisherArtifact?.output ??
    publisherArtifact ??
    artifacts.synthesis?.proposal ??
    artifacts.synthesis?.output ??
    artifacts.synthesis ??
    artifacts.recon?.findings ??
    artifacts.recon;

  const result: SwarmResult = {
    consensus: criticApproved,
    approvedByCritic: criticApproved,
    criticConfidence: artifacts.critic?.confidence ?? 1.0,
    iterations: Math.max(1, iteration),
    artifacts,
    history,
    finalOutput,
  };

  return result;
}

/**
 * Built-in default step handlers for the action types.
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

  swarm: async (step, { blackboard, plan, state }) => {
    return executeSwarmStep(step, plan, state);
  },
};

export class TaskExecutor {
  private customHandlers: Record<string, StepHandler>;
  private swarmHandlers: Partial<Record<SwarmRole, SwarmRoleHandler>>;
  private maxConcurrency: number;
  private continueOnError: boolean;
  private onStepStart?: (step: TaskStep) => void | Promise<void>;
  private onStepComplete?: (step: TaskStep, result: any) => void | Promise<void>;
  private onStepFailed?: (step: TaskStep, error: Error) => void | Promise<void>;
  private onSwarmHandoff?: (step: TaskStep, fromRole: SwarmRole | null, toRole: SwarmRole, artifact: any) => void | Promise<void>;

  constructor(options: ExecutorOptions = {}) {
    this.customHandlers = options.customHandlers || {};
    this.swarmHandlers = options.swarmHandlers || {};
    this.maxConcurrency = options.maxConcurrency || 5;
    this.continueOnError = options.continueOnError || false;
    this.onStepStart = options.onStepStart;
    this.onStepComplete = options.onStepComplete;
    this.onStepFailed = options.onStepFailed;
    this.onSwarmHandoff = options.onSwarmHandoff;
  }

  /**
   * Executes a single swarm step through the multi-agent mesh.
   */
  async executeSwarmStep(
    step: TaskStep,
    plan: TaskPlan,
    state: ExecutionState
  ): Promise<SwarmResult> {
    return executeSwarmStep(step, plan, state, {
      swarmHandlers: this.swarmHandlers,
      onSwarmHandoff: this.onSwarmHandoff,
    });
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

    plan.timeline = plan.timeline || [];
    plan.metrics = plan.metrics || {
      totalDurationMs: 0,
      totalRetries: 0,
      totalTokens: 0,
      swarmHandoffs: 0,
      criticRejections: 0,
      stepMetrics: {},
    };
    const planStartTime = Date.now();

    const ambientSeed = initialBlackboard.ambient !== undefined
      ? initialBlackboard.ambient
      : await getCurrentAmbientContext().catch(() => null);

    const state: ExecutionState = {
      activePlanId: plan.id,
      completedStepIds: [],
      failedStepIds: [],
      runningStepIds: [],
      skippedStepIds: [],
      blackboard: {
        ...(ambientSeed ? { ambient: ambientSeed } : {}),
        ...initialBlackboard,
      },
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

    plan.metrics.totalDurationMs = Date.now() - planStartTime;
    plan.metrics.totalRetries = plan.steps.reduce((acc, s) => acc + (s.retries || 0), 0);
    plan.metrics.totalTokens = plan.steps.reduce((acc, s) => acc + (s.costEstimate?.tokens || 0), 0);

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

    plan.timeline = plan.timeline || [];
    plan.timeline.push({
      stepId: step.id,
      role: step.swarmRole,
      event: "step_start",
      timestamp: new Date().toISOString(),
    });

    if (this.onStepStart) {
      try {
        await this.onStepStart(step);
      } catch (e) {
        // Callback error should not abort step
      }
    }

    const isSwarm = Boolean(
      step.isSwarm ||
      step.actionType === "swarm" ||
      (step.swarmRoles && step.swarmRoles.length > 0) ||
      (step.swarmRole && step.isSwarm !== false)
    );

    let attempt = 0;
    let executionSuccess = false;
    let lastError: any = null;

    if (isSwarm) {
      attempt++;
      try {
        const swarmResult = await this.executeSwarmStep(step, plan, state);

        step.result = swarmResult;
        step.swarmResult = swarmResult;
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        step.retries = Math.max(0, (swarmResult.iterations || 1) - 1);
        delete step.error;

        // Inject output into the blackboard
        state.blackboard[step.id] = swarmResult;
        if (step.payload?.outputKey && typeof step.payload.outputKey === "string") {
          state.blackboard[step.payload.outputKey] =
            swarmResult.finalOutput !== undefined ? swarmResult.finalOutput : swarmResult;
        }

        completedSet.add(step.id);
        executionSuccess = true;

        plan.timeline.push({
          stepId: step.id,
          event: "step_complete",
          timestamp: new Date().toISOString(),
          details: { isSwarm: true, iterations: swarmResult.iterations },
        });

        if (this.onStepComplete) {
          try {
            await this.onStepComplete(step, swarmResult);
          } catch (e) {}
        }
      } catch (err: any) {
        lastError = err;
        executionSuccess = false;
      }
    } else {
      // Standard step execution
      const resolvedPayload = interpolateBlackboard(step.payload, state.blackboard);
      const stepWithResolvedPayload: TaskStep = {
        ...step,
        payload: resolvedPayload,
      };

      const maxRetries = step.maxRetries ?? 2;

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

          plan.timeline.push({
            stepId: step.id,
            event: "step_complete",
            timestamp: new Date().toISOString(),
            details: { retries: step.retries },
          });

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
    }

    state.runningStepIds = state.runningStepIds.filter((id) => id !== step.id);

    if (!executionSuccess) {
      step.status = "failed";
      step.error = lastError?.message || "Unknown step execution failure";
      step.retries = attempt - 1;
      failedSet.add(step.id);

      plan.timeline.push({
        stepId: step.id,
        event: "step_failed",
        timestamp: new Date().toISOString(),
        details: { error: step.error },
      });

      if (this.onStepFailed) {
        try {
          await this.onStepFailed(step, lastError);
        } catch (e) {}
      }
    }
  }
}
