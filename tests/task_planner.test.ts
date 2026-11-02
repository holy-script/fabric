import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "path";
import fs from "fs";
import {
  compileGoalToPlan,
  buildStructuredFallbackPlan,
  validateDAG,
} from "../src/tasks/planner.js";
import {
  TaskExecutor,
  topologicalSort,
  interpolateBlackboard,
} from "../src/tasks/executor.js";
import {
  savePlanLocal,
  getPlanLocal,
  listPlansLocal,
  deletePlanLocal,
  TaskStore,
} from "../src/tasks/store.js";
import type { TaskPlan, TaskStep } from "../src/tasks/types.js";

const TEST_TASKS_DIR = path.resolve(process.cwd(), "data/tasks_test");

describe("Hierarchical Task Network (HTN) Planner QC Suite", () => {
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

  // ==========================================
  // 1. Goal Compilation & DAG Validation
  // ==========================================
  test("compiles IITM Quiz 1 CN goal into a 4-step DAG with correct dependencies", async () => {
    const goal = "Study for IITM Quiz 1 Computer Networks and generate NotebookLM podcast";
    const plan = await compileGoalToPlan(goal, { forceFallback: true });

    expect(plan.id).toBeDefined();
    expect(plan.status).toBe("pending");
    expect(plan.steps.length).toBe(4);

    const step1 = plan.steps.find((s) => s.id === "step_grok_pyqs");
    const step2 = plan.steps.find((s) => s.id === "step_formula_guide");
    const step3 = plan.steps.find((s) => s.id === "step_sync_notebooklm");
    const step4 = plan.steps.find((s) => s.id === "step_recall_questions");

    expect(step1).toBeDefined();
    expect(step2).toBeDefined();
    expect(step3).toBeDefined();
    expect(step4).toBeDefined();

    // Step 1: Grok PYQs (no deps)
    expect(step1!.dependencies).toEqual([]);
    expect(step1!.actionType).toBe("calculation");

    // Step 2: Formula Guide depends on Step 1
    expect(step2!.dependencies).toContain("step_grok_pyqs");
    expect(step2!.actionType).toBe("ai_reasoning");

    // Step 3: NotebookLM sync depends on Step 2
    expect(step3!.dependencies).toContain("step_formula_guide");
    expect(step3!.actionType).toBe("export");

    // Step 4: Active recall questions depends on Step 1 and Step 2
    expect(step4!.dependencies).toContain("step_grok_pyqs");
    expect(step4!.dependencies).toContain("step_formula_guide");

    // Cost estimates
    expect(plan.totalCostEstimate?.focusHours).toBeGreaterThan(0);
    expect(plan.totalCostEstimate?.tokens).toBeGreaterThan(0);

    // Verify DAG validity
    const validation = validateDAG(plan.steps);
    expect(validation.isValid).toBe(true);
  });

  test("compiles Google AI Mode & Notion research goal into valid DAG", async () => {
    const goal = "Research topic Distributed Consensus via Google AI Mode and summarize into Notion";
    const plan = await compileGoalToPlan(goal, { forceFallback: true });

    expect(plan.steps.length).toBe(4);
    const [step1, step2, step3, step4] = plan.steps;

    expect(step1.id).toBe("step_ai_mode_query");
    expect(step1.actionType).toBe("browser");
    expect(step1.dependencies).toEqual([]);

    expect(step2.id).toBe("step_synthesize_findings");
    expect(step2.dependencies).toEqual(["step_ai_mode_query"]);

    expect(step3.id).toBe("step_sync_notion");
    expect(step3.dependencies).toEqual(["step_synthesize_findings"]);

    expect(step4.id).toBe("step_notify_telegram");
    expect(step4.dependencies).toEqual(["step_sync_notion"]);

    const validation = validateDAG(plan.steps);
    expect(validation.isValid).toBe(true);
  });

  test("detects cyclic and invalid dependencies in validateDAG", () => {
    // Cycle A -> B -> A
    const cyclicSteps: TaskStep[] = [
      {
        id: "step_A",
        title: "A",
        description: "",
        dependencies: ["step_B"],
        actionType: "ai_reasoning",
        payload: {},
        status: "pending",
      },
      {
        id: "step_B",
        title: "B",
        description: "",
        dependencies: ["step_A"],
        actionType: "calculation",
        payload: {},
        status: "pending",
      },
    ];

    const cycleResult = validateDAG(cyclicSteps);
    expect(cycleResult.isValid).toBe(false);
    expect(cycleResult.error).toContain("Cycle detected");

    // Non-existent dependency
    const brokenSteps: TaskStep[] = [
      {
        id: "step_1",
        title: "1",
        description: "",
        dependencies: ["step_ghost"],
        actionType: "browser",
        payload: {},
        status: "pending",
      },
    ];
    const brokenResult = validateDAG(brokenSteps);
    expect(brokenResult.isValid).toBe(false);
    expect(brokenResult.error).toContain("non-existent step");

    // Self dependency
    const selfDepSteps: TaskStep[] = [
      {
        id: "step_1",
        title: "1",
        description: "",
        dependencies: ["step_1"],
        actionType: "browser",
        payload: {},
        status: "pending",
      },
    ];
    const selfResult = validateDAG(selfDepSteps);
    expect(selfResult.isValid).toBe(false);
    expect(selfResult.error).toContain("cannot depend on itself");
  });

  // ==========================================
  // 2. Topological Sort & Resolution
  // ==========================================
  test("topologicalSort produces valid execution order", () => {
    const steps: TaskStep[] = [
      {
        id: "step_3",
        title: "Step 3",
        description: "",
        dependencies: ["step_2"],
        actionType: "export",
        payload: {},
        status: "pending",
      },
      {
        id: "step_1",
        title: "Step 1",
        description: "",
        dependencies: [],
        actionType: "browser",
        payload: {},
        status: "pending",
      },
      {
        id: "step_2",
        title: "Step 2",
        description: "",
        dependencies: ["step_1"],
        actionType: "ai_reasoning",
        payload: {},
        status: "pending",
      },
    ];

    const sorted = topologicalSort(steps);
    const sortedIds = sorted.map((s) => s.id);

    expect(sortedIds).toEqual(["step_1", "step_2", "step_3"]);
  });

  // ==========================================
  // 3. Blackboard Interpolation
  // ==========================================
  test("interpolateBlackboard resolves tokens, nested values, and typed objects", () => {
    const blackboard = {
      query: "raft consensus",
      user: { name: "Aditya", id: 113164 },
      metrics: { score: 98.5 },
      results: ["node1", "node2"],
    };

    // Exact match preserves type
    expect(interpolateBlackboard("${blackboard.metrics.score}", blackboard)).toBe(98.5);
    expect(interpolateBlackboard("${blackboard.results}", blackboard)).toEqual(["node1", "node2"]);
    expect(interpolateBlackboard("${user}", blackboard)).toEqual({ name: "Aditya", id: 113164 });

    // String interpolation
    expect(
      interpolateBlackboard("Querying ${blackboard.query} for ${blackboard.user.name}", blackboard)
    ).toBe("Querying raft consensus for Aditya");

    // Nested object and array payload interpolation
    const payload = {
      target: "${blackboard.query}",
      deep: {
        author: "${blackboard.user.name}",
        count: 5,
      },
      tags: ["tag1", "${blackboard.query}"],
    };

    const resolved = interpolateBlackboard(payload, blackboard);
    expect(resolved.target).toBe("raft consensus");
    expect(resolved.deep.author).toBe("Aditya");
    expect(resolved.deep.count).toBe(5);
    expect(resolved.tags).toEqual(["tag1", "raft consensus"]);
  });

  // ==========================================
  // 4. Parallel & Sequential Execution in TaskExecutor
  // ==========================================
  test("executes independent steps in parallel and dependent steps sequentially", async () => {
    const executionTimestamps: Record<string, { start: number; end: number }> = {};

    const customHandlers = {
      step_parallel_A: async () => {
        const start = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        executionTimestamps["step_parallel_A"] = { start, end: Date.now() };
        return { valueA: "dataA" };
      },
      step_parallel_B: async () => {
        const start = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        executionTimestamps["step_parallel_B"] = { start, end: Date.now() };
        return { valueB: "dataB" };
      },
      step_dependent_C: async (step: any, { blackboard }: any) => {
        const start = Date.now();
        await new Promise((r) => setTimeout(r, 20));
        executionTimestamps["step_dependent_C"] = { start, end: Date.now() };
        return {
          combined: `${blackboard.step_parallel_A.valueA}_${blackboard.step_parallel_B.valueB}`,
        };
      },
    };

    const plan: TaskPlan = {
      id: "plan_test_parallel",
      goal: "Test concurrency",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      steps: [
        {
          id: "step_parallel_A",
          title: "Parallel Step A",
          description: "",
          dependencies: [],
          actionType: "browser",
          payload: { outputKey: "outA" },
          status: "pending",
        },
        {
          id: "step_parallel_B",
          title: "Parallel Step B",
          description: "",
          dependencies: [],
          actionType: "calculation",
          payload: { outputKey: "outB" },
          status: "pending",
        },
        {
          id: "step_dependent_C",
          title: "Dependent Step C",
          description: "",
          dependencies: ["step_parallel_A", "step_parallel_B"],
          actionType: "export",
          payload: { outputKey: "outC" },
          status: "pending",
        },
      ],
    };

    const executor = new TaskExecutor({ customHandlers });
    const { plan: finalPlan, state } = await executor.executePlan(plan);

    expect(finalPlan.status).toBe("completed");
    expect(state.completedStepIds).toContain("step_parallel_A");
    expect(state.completedStepIds).toContain("step_parallel_B");
    expect(state.completedStepIds).toContain("step_dependent_C");

    // Both parallel steps started roughly at the same time
    const diffStart = Math.abs(
      executionTimestamps["step_parallel_A"].start - executionTimestamps["step_parallel_B"].start
    );
    expect(diffStart).toBeLessThan(30);

    // Dependent step C only started after both A and B finished
    expect(executionTimestamps["step_dependent_C"].start).toBeGreaterThanOrEqual(
      Math.min(
        executionTimestamps["step_parallel_A"].end,
        executionTimestamps["step_parallel_B"].end
      ) - 5
    );

    // Verify blackboard injection
    expect(state.blackboard.outA).toEqual({ valueA: "dataA" });
    expect(state.blackboard.outB).toEqual({ valueB: "dataB" });
    expect(state.blackboard.outC).toEqual({ combined: "dataA_dataB" });
  });

  // ==========================================
  // 5. Retries and Error Tolerance
  // ==========================================
  test("retries transiently failing steps and marks successful on recovery", async () => {
    let attempts = 0;
    const customHandlers = {
      flaky_step: async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("Temporary network glitch");
        }
        return { recovered: true };
      },
    };

    const plan: TaskPlan = {
      id: "plan_retry_test",
      goal: "Test retries",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      steps: [
        {
          id: "flaky_step",
          title: "Flaky Step",
          description: "",
          dependencies: [],
          actionType: "browser",
          payload: {},
          status: "pending",
          maxRetries: 3,
        },
      ],
    };

    const executor = new TaskExecutor({ customHandlers });
    const { plan: resultPlan } = await executor.executePlan(plan);

    expect(attempts).toBe(2);
    expect(resultPlan.status).toBe("completed");
    expect(resultPlan.steps[0].status).toBe("completed");
    expect(resultPlan.steps[0].retries).toBe(1);
    expect(resultPlan.steps[0].result).toEqual({ recovered: true });
  });

  test("skips downstream steps when upstream dependency fails", async () => {
    const customHandlers = {
      failing_step: async () => {
        throw new Error("Fatal upstream crash");
      },
      downstream_step: async () => {
        return { shouldNotRun: true };
      },
    };

    const plan: TaskPlan = {
      id: "plan_cascade_fail",
      goal: "Test failure cascade",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      steps: [
        {
          id: "failing_step",
          title: "Failing Step",
          description: "",
          dependencies: [],
          actionType: "calculation",
          payload: {},
          status: "pending",
          maxRetries: 0,
        },
        {
          id: "downstream_step",
          title: "Downstream Step",
          description: "",
          dependencies: ["failing_step"],
          actionType: "notify",
          payload: {},
          status: "pending",
        },
      ],
    };

    const executor = new TaskExecutor({ customHandlers });
    const { plan: resultPlan, state } = await executor.executePlan(plan);

    expect(resultPlan.status).toBe("failed");
    expect(resultPlan.steps[0].status).toBe("failed");
    expect(resultPlan.steps[0].error).toContain("Fatal upstream crash");

    // Downstream step should be skipped
    expect(resultPlan.steps[1].status).toBe("skipped");
    expect(state.skippedStepIds).toContain("downstream_step");
  });

  // ==========================================
  // 6. Local & Unified Store
  // ==========================================
  test("saves, retrieves, lists, and deletes task plans in local storage", async () => {
    const store = new TaskStore({ baseDir: TEST_TASKS_DIR, syncFirestore: false });

    const plan: TaskPlan = {
      id: "plan_persistence_qc_1",
      goal: "Test local store",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      metadata: { test: true },
      steps: [
        {
          id: "step_save",
          title: "Save step",
          description: "Testing save",
          dependencies: [],
          actionType: "export",
          payload: { key: "val" },
          status: "pending",
        },
      ],
    };

    // Save
    await store.save(plan);
    const savedFile = path.join(TEST_TASKS_DIR, `${plan.id}.json`);
    expect(fs.existsSync(savedFile)).toBe(true);

    // Read back
    const loaded = await store.get("plan_persistence_qc_1");
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe("plan_persistence_qc_1");
    expect(loaded!.steps.length).toBe(1);
    expect(loaded!.steps[0].id).toBe("step_save");

    // List
    const allPlans = await store.list();
    expect(allPlans.length).toBeGreaterThanOrEqual(1);
    expect(allPlans.some((p) => p.id === "plan_persistence_qc_1")).toBe(true);

    // Delete
    const deleted = await store.delete("plan_persistence_qc_1");
    expect(deleted).toBe(true);
    expect(fs.existsSync(savedFile)).toBe(false);

    // Verify deleted
    const afterDelete = await store.get("plan_persistence_qc_1");
    expect(afterDelete).toBeNull();
  });
});
