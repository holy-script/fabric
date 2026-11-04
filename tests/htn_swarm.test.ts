import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "path";
import fs from "fs";
import {
  TaskExecutor,
  executeSwarmStep,
  interpolateBlackboard,
} from "../src/tasks/executor.js";
import type {
  TaskPlan,
  TaskStep,
  ExecutionState,
  SwarmRole,
} from "../src/tasks/types.js";

const TEST_TASKS_DIR = path.resolve(process.cwd(), "data/tasks_swarm_test");

describe("HTN Autonomous Multi-Agent Swarm Orchestration QC Suite", () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_TASKS_DIR)) {
      fs.mkdirSync(TEST_TASKS_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_TASKS_DIR)) {
      fs.rmSync(TEST_TASKS_DIR, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 1. Sequential Swarm Handoffs (recon -> synthesis -> critic -> publisher)
  // =========================================================================
  describe("Sequential Swarm Handoff Pipeline", () => {
    test("executes full autonomous 4-stage pipeline with default handlers", async () => {
      const plan: TaskPlan = {
        id: "plan_swarm_seq_1",
        goal: "Probe, synthesize, verify and publish Aristotelian cybernetic governor",
        steps: [
          {
            id: "step_gov_swarm",
            title: "Aristotelian Governor Synthesis",
            description: "End-to-end swarm pipeline for cybernetic governor",
            dependencies: [],
            actionType: "swarm",
            payload: {
              query: "Aristotelian cybernetic governor",
              outputKey: "governor_final",
            },
            status: "pending",
            isSwarm: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const handoffs: Array<{ from: SwarmRole | null; to: SwarmRole }> = [];
      const executor = new TaskExecutor({
        onSwarmHandoff: (step, fromRole, toRole) => {
          handoffs.push({ from: fromRole, to: toRole });
        },
      });

      const { plan: executedPlan, state } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("completed");
      const step = executedPlan.steps[0];
      expect(step.status).toBe("completed");
      expect(step.result).toBeDefined();

      const swarmResult = step.result;
      expect(swarmResult.consensus).toBe(true);
      expect(swarmResult.approvedByCritic).toBe(true);
      expect(swarmResult.criticConfidence).toBeGreaterThan(0.8);
      expect(swarmResult.iterations).toBe(1);

      // Verify all 4 artifacts exist in result
      expect(swarmResult.artifacts.recon).toBeDefined();
      expect(swarmResult.artifacts.recon.role).toBe("recon");
      expect(swarmResult.artifacts.recon.status).toBe("completed");

      expect(swarmResult.artifacts.synthesis).toBeDefined();
      expect(swarmResult.artifacts.synthesis.role).toBe("synthesis");
      expect(swarmResult.artifacts.synthesis.proposal).toBeDefined();

      expect(swarmResult.artifacts.critic).toBeDefined();
      expect(swarmResult.artifacts.critic.role).toBe("critic");
      expect(swarmResult.artifacts.critic.status).toBe("approved");

      expect(swarmResult.artifacts.publisher).toBeDefined();
      expect(swarmResult.artifacts.publisher.role).toBe("publisher");
      expect(swarmResult.artifacts.publisher.deliverable).toContain("Aristotelian Governor Synthesis");

      // Verify handoffs were recorded in correct sequence
      expect(handoffs.length).toBe(4);
      expect(handoffs[0]).toEqual({ from: null, to: "recon" });
      expect(handoffs[1]).toEqual({ from: "recon", to: "synthesis" });
      expect(handoffs[2]).toEqual({ from: "synthesis", to: "critic" });
      expect(handoffs[3]).toEqual({ from: "critic", to: "publisher" });

      // Verify shared blackboard contains all structured yields
      expect(state.blackboard.recon_findings).toBeDefined();
      expect(state.blackboard.synthesis_output).toBeDefined();
      expect(state.blackboard.critic).toBeDefined();
      expect(state.blackboard.published_output).toBeDefined();
      expect(state.blackboard.governor_final).toBeDefined();
    });

    test("executes custom swarm role subset (recon -> synthesis only)", async () => {
      const step: TaskStep = {
        id: "step_custom_roles",
        title: "Fast Probing & Drafting",
        description: "Run only recon and synthesis without critic evaluation",
        dependencies: [],
        actionType: "swarm",
        payload: { query: "Fast draft" },
        status: "pending",
        swarmRoles: ["recon", "synthesis"],
      };

      const plan: TaskPlan = {
        id: "plan_swarm_subset",
        goal: "Fast draft",
        steps: [step],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const state: ExecutionState = {
        activePlanId: plan.id,
        completedStepIds: [],
        blackboard: {},
      };

      const result = await executeSwarmStep(step, plan, state);

      expect(result.artifacts.recon).toBeDefined();
      expect(result.artifacts.synthesis).toBeDefined();
      expect(result.artifacts.critic).toBeUndefined();
      expect(result.artifacts.publisher).toBeUndefined();
      expect(result.consensus).toBe(true);
      expect(state.blackboard.recon_findings).toBeDefined();
      expect(state.blackboard.synthesis_output).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Critic Rejection & Synthesis Refinement Loop
  // =========================================================================
  describe("Critic Rejection & Refinement Loop", () => {
    test("triggers synthesis refinement upon critic rejection and succeeds on second iteration", async () => {
      let criticInvocationCount = 0;
      let synthesisInvocations: Array<{ iteration: number; feedback?: string }> = [];

      const plan: TaskPlan = {
        id: "plan_swarm_refine_1",
        goal: "Refine architecture through dialectical challenge",
        steps: [
          {
            id: "step_refine_test",
            title: "Robust Circuit Breaker Architecture",
            description: "Must survive dialectical critic challenge",
            dependencies: [],
            actionType: "swarm",
            payload: { input: "Circuit breaker and bulkhead pattern" },
            status: "pending",
            isSwarm: true,
            swarmConfig: {
              maxCriticRetries: 3,
              minCriticConfidence: 0.8,
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor({
        swarmHandlers: {
          synthesis: async (step, ctx) => {
            synthesisInvocations.push({
              iteration: ctx.iteration,
              feedback: ctx.criticFeedback,
            });

            if (ctx.iteration === 1) {
              return {
                role: "synthesis",
                status: "completed",
                proposal: "Initial proposal: basic exponential backoff without bulkhead isolation",
                confidence: 0.7,
              };
            }

            return {
              role: "synthesis",
              status: "completed",
              proposal: `Refined proposal addressing critique "${ctx.criticFeedback}": added semaphore bulkhead and fail-open telemetry fallback`,
              confidence: 0.96,
            };
          },

          critic: async (step, ctx) => {
            criticInvocationCount++;
            const synth = ctx.previousArtifacts.synthesis?.proposal || "";

            // First pass: Reject due to lack of bulkhead isolation
            if (criticInvocationCount === 1) {
              return {
                role: "critic",
                status: "rejected",
                approved: false,
                confidence: 0.45,
                critique: "Rejected: Architecture lacks bulkhead concurrency pools and fails closed under network partition",
              };
            }

            // Second pass: Approve refined proposal
            expect(synth).toContain("added semaphore bulkhead");
            return {
              role: "critic",
              status: "approved",
              approved: true,
              confidence: 0.95,
              critique: "Approved: Bulkhead partition and fail-open fallbacks verified.",
            };
          },
        },
      });

      const { plan: executedPlan, state } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("completed");
      const step = executedPlan.steps[0];
      expect(step.status).toBe("completed");
      expect(step.result.iterations).toBe(2);
      expect(step.result.approvedByCritic).toBe(true);
      expect(step.result.criticConfidence).toBe(0.95);

      // Verify synthesis was invoked twice with feedback passed on iteration 2
      expect(synthesisInvocations.length).toBe(2);
      expect(synthesisInvocations[0].iteration).toBe(1);
      expect(synthesisInvocations[0].feedback).toBeUndefined();

      expect(synthesisInvocations[1].iteration).toBe(2);
      expect(synthesisInvocations[1].feedback).toContain("lacks bulkhead concurrency pools");

      // Verify blackboard has the refined output
      expect(state.blackboard.synthesis_output).toContain("added semaphore bulkhead");
      expect(state.blackboard.critic_feedback).toContain("Approved: Bulkhead partition");

      // Verify metrics and timeline
      expect(executedPlan.metrics?.criticRejections).toBe(1);
      const timelineEvents = executedPlan.timeline?.map((e) => e.event);
      expect(timelineEvents).toContain("critic_rejected");
      expect(timelineEvents).toContain("refinement_loop");
      expect(timelineEvents).toContain("critic_approved");
    });

    test("rejects when critic confidence is <= 0.8 even if approved flag is true", async () => {
      let criticCalls = 0;

      const plan: TaskPlan = {
        id: "plan_swarm_confidence_gate",
        goal: "Strict evaluation confidence gate test",
        steps: [
          {
            id: "step_gate_test",
            title: "Borderline Proposal",
            description: "Step with marginal confidence",
            dependencies: [],
            actionType: "swarm",
            payload: {},
            status: "pending",
            isSwarm: true,
            swarmConfig: {
              minCriticConfidence: 0.8,
              maxCriticRetries: 2,
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor({
        swarmHandlers: {
          critic: async (step, ctx) => {
            criticCalls++;
            if (criticCalls === 1) {
              // Approved is true, but confidence 0.78 <= 0.80
              return {
                role: "critic",
                approved: true,
                confidence: 0.78,
                critique: "Weak confidence 0.78 below threshold 0.80",
              };
            }
            return {
              role: "critic",
              approved: true,
              confidence: 0.92,
              critique: "Strong confidence 0.92 passed gate",
            };
          },
        },
      });

      const { plan: executedPlan } = await executor.executePlan(plan);

      expect(criticCalls).toBe(2);
      expect(executedPlan.status).toBe("completed");
      expect(executedPlan.metrics?.criticRejections).toBe(1);
      expect(executedPlan.steps[0].result.iterations).toBe(2);
    });

    test("fails step when critic rejection exceeds maxCriticRetries", async () => {
      const plan: TaskPlan = {
        id: "plan_swarm_unresolvable",
        goal: "Flawed proposal that never satisfies critic",
        steps: [
          {
            id: "step_flawed",
            title: "Permanently Flawed Step",
            description: "Will always be rejected by critic",
            dependencies: [],
            actionType: "swarm",
            payload: {},
            status: "pending",
            isSwarm: true,
            swarmConfig: {
              maxCriticRetries: 2,
              minCriticConfidence: 0.8,
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor({
        swarmHandlers: {
          critic: async () => ({
            role: "critic",
            approved: false,
            confidence: 0.3,
            critique: "Fundamental mathematical contradiction detected",
          }),
        },
      });

      const { plan: executedPlan } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("failed");
      const step = executedPlan.steps[0];
      expect(step.status).toBe("failed");
      expect(step.error).toContain("Critic rejection gate failed after 2 iterations");
      expect(step.error).toContain("Fundamental mathematical contradiction detected");
      expect(executedPlan.metrics?.criticRejections).toBe(2);
    });
  });

  // =========================================================================
  // 3. Token Interpolation Between Swarm Stages & Across Blackboard
  // =========================================================================
  describe("Token Resolution Between Swarm Stages", () => {
    test("resolves ${blackboard.recon_findings} dynamically inside synthesis stage", async () => {
      let resolvedPayloadInSynthesis: any = null;

      const plan: TaskPlan = {
        id: "plan_token_interp_1",
        goal: "Verify token handoff from recon to synthesis",
        steps: [
          {
            id: "step_token_interp",
            title: "Interpolation Step",
            description: "Recon sets findings and synthesis resolves them",
            dependencies: [],
            actionType: "swarm",
            payload: {
              query: "High-memory container leak",
              input: "Analyze findings: ${blackboard.recon_findings}",
              rawRef: "${blackboard.recon_findings}",
            },
            status: "pending",
            isSwarm: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor({
        swarmHandlers: {
          recon: async () => ({
            role: "recon",
            status: "completed",
            findings: "Memory leak identified in WebSocket connection buffer at 128MB",
            confidence: 0.98,
          }),

          synthesis: async (step, ctx) => {
            resolvedPayloadInSynthesis = step.payload;
            return {
              role: "synthesis",
              status: "completed",
              proposal: `Remediation proposed for: ${step.payload.input}`,
            };
          },
        },
      });

      const { plan: executedPlan, state } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("completed");
      expect(resolvedPayloadInSynthesis).toBeDefined();

      // Verify that embedded token was replaced with string
      expect(resolvedPayloadInSynthesis.input).toBe(
        "Analyze findings: Memory leak identified in WebSocket connection buffer at 128MB"
      );

      // Verify that exact token returned raw value
      expect(resolvedPayloadInSynthesis.rawRef).toBe(
        "Memory leak identified in WebSocket connection buffer at 128MB"
      );

      // Verify state blackboard has matching yield
      expect(state.blackboard.recon_findings).toBe(
        "Memory leak identified in WebSocket connection buffer at 128MB"
      );
    });

    test("chains outputs across multi-step DAG from swarm step to downstream standard step", async () => {
      const plan: TaskPlan = {
        id: "plan_dag_swarm_chain",
        goal: "Multi-step DAG chain from swarm to calculation",
        steps: [
          {
            id: "step_1_swarm",
            title: "Swarm Research Step",
            description: "Runs full swarm pipeline",
            dependencies: [],
            actionType: "swarm",
            payload: {
              query: "Shannon capacity channel limit",
              outputKey: "shannon_yield",
            },
            status: "pending",
            isSwarm: true,
          },
          {
            id: "step_2_calc",
            title: "Downstream Calculation",
            description: "Consumes yields from step 1",
            dependencies: ["step_1_swarm"],
            actionType: "calculation",
            payload: {
              reconData: "${blackboard.recon_findings}",
              synthesisData: "${blackboard.synthesis_output}",
              publishedData: "${blackboard.shannon_yield}",
            },
            status: "pending",
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor();
      const { plan: executedPlan, state } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("completed");
      const step2 = executedPlan.steps.find((s) => s.id === "step_2_calc")!;
      expect(step2.status).toBe("completed");

      // Verify step 2 parameters resolved all step 1 outputs
      const calcResult = step2.result;
      expect(calcResult.parameters.reconData).toContain("Shannon capacity channel limit");
      expect(calcResult.parameters.synthesisData).toBeDefined();
      expect(calcResult.parameters.publishedData).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Execution Metrics & Timeline Logging in TaskPlan
  // =========================================================================
  describe("Execution Metrics & Timeline Logging", () => {
    test("populates detailed timeline events and aggregate execution metrics in TaskPlan", async () => {
      const plan: TaskPlan = {
        id: "plan_metrics_and_timeline",
        goal: "Validate audit logging and telemetry tracking",
        steps: [
          {
            id: "step_audited_swarm",
            title: "Audited Swarm Execution",
            description: "Step with full metrics capture",
            dependencies: [],
            actionType: "swarm",
            payload: { topic: "Aristotelian Golden Means" },
            status: "pending",
            isSwarm: true,
            costEstimate: { focusHours: 0.5, tokens: 2500 },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor();
      const { plan: executedPlan } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("completed");

      // Verify timeline events
      expect(executedPlan.timeline).toBeDefined();
      expect(executedPlan.timeline!.length).toBeGreaterThanOrEqual(6);

      const events = executedPlan.timeline!.map((e) => e.event);
      expect(events).toContain("step_start");
      expect(events).toContain("swarm_handoff");
      expect(events).toContain("critic_approved");
      expect(events).toContain("step_complete");

      // Verify every timeline event has valid timestamp and stepId
      for (const event of executedPlan.timeline!) {
        expect(event.stepId).toBe("step_audited_swarm");
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      }

      // Verify plan aggregate metrics
      expect(executedPlan.metrics).toBeDefined();
      const metrics = executedPlan.metrics!;
      expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.swarmHandoffs).toBe(4); // recon, synthesis, critic, publisher
      expect(metrics.criticRejections).toBe(0);
      expect(metrics.totalTokens).toBe(2500);

      // Verify per-step metrics
      expect(metrics.stepMetrics?.["step_audited_swarm"]).toBeDefined();
      expect(metrics.stepMetrics!["step_audited_swarm"].durationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.stepMetrics!["step_audited_swarm"].retries).toBe(0);
    });

    test("tracks concurrent swarm steps in parallel with independent handoffs", async () => {
      const plan: TaskPlan = {
        id: "plan_parallel_swarms",
        goal: "Parallel multi-agent swarms",
        steps: [
          {
            id: "step_swarm_alpha",
            title: "Swarm Alpha (Frontend)",
            description: "Analyzes client state",
            dependencies: [],
            actionType: "swarm",
            payload: { query: "Frontend architecture" },
            status: "pending",
            isSwarm: true,
          },
          {
            id: "step_swarm_beta",
            title: "Swarm Beta (Backend)",
            description: "Analyzes server state",
            dependencies: [],
            actionType: "swarm",
            payload: { query: "Backend architecture" },
            status: "pending",
            isSwarm: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
      };

      const executor = new TaskExecutor({ maxConcurrency: 2 });
      const { plan: executedPlan, state } = await executor.executePlan(plan);

      expect(executedPlan.status).toBe("completed");
      expect(executedPlan.steps.every((s) => s.status === "completed")).toBe(true);

      // Total handoffs should equal 4 * 2 = 8
      expect(executedPlan.metrics?.swarmHandoffs).toBe(8);

      // Verify both step outputs exist in state
      expect(state.blackboard.step_swarm_alpha).toBeDefined();
      expect(state.blackboard.step_swarm_beta).toBeDefined();
    });
  });
});
