import { describe, it, expect } from "bun:test";
import {
  analyzeFrictionPoints,
  analyzeHighYieldPatterns,
  synthesizeEpisodicCritique,
  induceDeterministicHeuristics,
  runEpisodicReflexion,
  getReflexionSummary,
} from "../src/ai/reflexion.js";
import type { Trade } from "../src/db/types.js";

describe("Autonomous Episodic Reflexion & Self-Induction Suite", () => {
  // Synthetic trade datasets
  const mockTradesWithFriction: Trade[] = [
    {
      id: "trade_1",
      userId: "test_user_1",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
      moduleName: "AuthModuleRefactor",
      tradeType: "builder",
      focusExpectedHours: 2.0,
      focusActualHours: 0.4, // Crash (70% drop)
      energyDelta: -3, // Severe drainage
      factsYield: "None", // Trivial
      fundsCost: 0,
      fundsYield: 0,
      tags: ["auth", "refactor"],
      notes: "Hit mental wall with oauth token invalidation",
    },
    {
      id: "trade_2",
      userId: "test_user_1",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      moduleName: "DatabaseMigration",
      tradeType: "builder",
      focusExpectedHours: 1.5,
      focusActualHours: 2.0,
      energyDelta: -2, // Consecutive negative
      factsYield: "fixed bug", // Trivial yield with 2.0h duration (spin cycle)
      fundsCost: 0,
      fundsYield: 0,
      tags: ["db", "postgres"],
      notes: "Fighting foreign key constraints",
    },
  ];

  const mockTradesWithHighYield: Trade[] = [
    {
      id: "trade_3",
      userId: "test_user_2",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
      moduleName: "RustSearchEngine",
      tradeType: "builder",
      focusExpectedHours: 2.0,
      focusActualHours: 2.5,
      energyDelta: 2, // Deep flow + positive energy
      factsYield:
        "Implemented SIMD vector similarity matching algorithm with 4x throughput improvement over scalar",
      fundsCost: 0,
      fundsYield: 0,
      tags: ["rust", "architecture", "simd"],
    },
    {
      id: "trade_4",
      userId: "test_user_2",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      moduleName: "GraphVisualization",
      tradeType: "builder",
      focusExpectedHours: 1.0,
      focusActualHours: 1.0,
      energyDelta: 1,
      factsYield:
        "Mapped 4-quadrant force-directed layout hierarchy with d3 force simulation clustering",
      fundsCost: 0,
      fundsYield: 0,
      tags: ["d3", "pattern", "visualization"],
    },
  ];

  it("accurately categorizes friction patterns: energy drainage, focus crash, and spin-cycle", () => {
    const friction = analyzeFrictionPoints(mockTradesWithFriction);

    expect(friction.length).toBeGreaterThanOrEqual(3);

    // 1. Severe Energy Drainage
    const drainagePoints = friction.filter((f) => f.category === "energy_drainage");
    expect(drainagePoints.length).toBeGreaterThanOrEqual(1);
    expect(drainagePoints.some((f) => f.severity === "CRITICAL")).toBe(true);
    expect(drainagePoints.some((f) => f.moduleName === "AuthModuleRefactor")).toBe(true);

    // 2. Focus Crash
    const focusCrashPoints = friction.filter((f) => f.category === "focus_crash");
    expect(focusCrashPoints.length).toBeGreaterThanOrEqual(1);
    expect(focusCrashPoints[0].moduleName).toBe("AuthModuleRefactor");
    expect(focusCrashPoints[0].observedMetric).toContain("0.4h");

    // 3. Spin Cycle
    const spinCyclePoints = friction.filter((f) => f.category === "spin_cycle");
    expect(spinCyclePoints.length).toBeGreaterThanOrEqual(1);
    expect(spinCyclePoints[0].moduleName).toBe("DatabaseMigration");
    expect(spinCyclePoints[0].observedMetric).toContain("2h invested");
  });

  it("detects sedentary lock when intense focus is logged without kinetic trades", () => {
    const sedentaryTrades: Trade[] = [
      {
        id: "s1",
        userId: "test",
        timestamp: new Date(),
        moduleName: "Coding 1",
        tradeType: "builder",
        focusActualHours: 2.0,
        energyDelta: 0,
        factsYield: "Added auth routes",
        fundsCost: 0,
        fundsYield: 0,
        tags: ["backend"],
      },
      {
        id: "s2",
        userId: "test",
        timestamp: new Date(),
        moduleName: "Coding 2",
        tradeType: "builder",
        focusActualHours: 2.5,
        energyDelta: 0,
        factsYield: "Added user schema migrations",
        fundsCost: 0,
        fundsYield: 0,
        tags: ["database"],
      },
      {
        id: "s3",
        userId: "test",
        timestamp: new Date(),
        moduleName: "Coding 3",
        tradeType: "builder",
        focusActualHours: 1.0,
        energyDelta: -1,
        factsYield: "Wrote unit tests",
        fundsCost: 0,
        fundsYield: 0,
        tags: ["testing"],
      },
    ];

    const friction = analyzeFrictionPoints(sedentaryTrades);
    const lock = friction.find((f) => f.category === "sedentary_lock");
    expect(lock).toBeDefined();
    expect(lock?.category).toBe("sedentary_lock");
    expect(lock?.observedMetric).toContain("5.5h focus with 0 kinetic trades");
  });

  it("identifies high-yield patterns: deep flow, high-yield sprints, and knowledge compounding", () => {
    const patterns = analyzeHighYieldPatterns(mockTradesWithHighYield);

    expect(patterns.length).toBeGreaterThanOrEqual(3);

    // Deep flow
    const deepFlow = patterns.find((p) => p.category === "deep_flow");
    expect(deepFlow).toBeDefined();
    expect(deepFlow?.moduleName).toBe("RustSearchEngine");
    expect(deepFlow?.observedMetric).toContain("2.5h focus with +2 energy");

    // High yield sprint
    const sprint = patterns.find((p) => p.category === "high_yield_sprint");
    expect(sprint).toBeDefined();

    // Knowledge compounding
    const compounding = patterns.find((p) => p.category === "knowledge_compounding");
    expect(compounding).toBeDefined();
  });

  it("synthesizes an episodic critique with macro efficiency ratios", () => {
    const combinedTrades = [...mockTradesWithFriction, ...mockTradesWithHighYield];
    const critique = synthesizeEpisodicCritique(combinedTrades);

    expect(critique.totalTrades).toBe(4);
    expect(critique.totalFocusHours).toBe(5.9);
    expect(critique.netEnergy).toBe(-2);
    expect(critique.frictionPoints.length).toBeGreaterThan(0);
    expect(critique.highYieldPatterns.length).toBeGreaterThan(0);
    expect(critique.efficiencyRatio).toBeGreaterThan(0);
    expect(typeof critique.critiqueSummary).toBe("string");
    expect(critique.critiqueSummary.length).toBeGreaterThan(15);
  });

  it("induces high-order actionable heuristics grounded in observed evidence", () => {
    const critique = synthesizeEpisodicCritique(mockTradesWithFriction);
    const heuristics = induceDeterministicHeuristics(critique);

    expect(heuristics.length).toBeGreaterThanOrEqual(1);
    expect(heuristics.length).toBeLessThanOrEqual(2);

    const primaryHeuristic = heuristics[0];
    expect(primaryHeuristic.label).toBeDefined();
    expect(primaryHeuristic.axiom.length).toBeGreaterThan(20);
    expect(primaryHeuristic.actionableTakeaway.length).toBeGreaterThan(20);
    expect(["Focus", "Facts", "Funds", "Feedback"]).toContain(primaryHeuristic.quadrant);
    expect(primaryHeuristic.evidence.length).toBeGreaterThan(0);
    expect(primaryHeuristic.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("executes the full autonomous episodic memory loop and generates markdown report", async () => {
    const combinedTrades = [...mockTradesWithFriction, ...mockTradesWithHighYield];

    const report = await runEpisodicReflexion("test_user_suite", 7, {
      trades: combinedTrades,
      skipGraphWrite: true,
      useLLM: false,
    });

    expect(report).toBeDefined();
    expect(report.userId).toBe("test_user_suite");
    expect(report.critique.frictionPoints.length).toBeGreaterThanOrEqual(3);
    expect(report.critique.highYieldPatterns.length).toBeGreaterThanOrEqual(2);
    expect(report.inducedHeuristics.length).toBeGreaterThanOrEqual(1);
    expect(report.markdownReport).toContain("AUTONOMOUS EPISODIC REFLEXION");
    expect(report.markdownReport).toContain("Cognitive Friction Diagnosed");
    expect(report.markdownReport).toContain("Induced High-Order Axioms");

    // Test getReflexionSummary
    const summary = await getReflexionSummary("test_user_suite");
    expect(summary).toBeDefined();
    expect(summary).toContain("Episodic Reflexion & Induced Heuristics");
    expect(summary).toContain("Active Induced Axiom");
  });

  it("attaches induced heuristics to graph summary and links to correct quadrant dimension", async () => {
    const critique = synthesizeEpisodicCritique(mockTradesWithFriction);
    const heuristics = induceDeterministicHeuristics(critique);

    expect(heuristics.length).toBeGreaterThan(0);
    const testHeuristic = heuristics[0];

    // Read initial graph summary
    const fs = await import("fs");
    const summaryPath = "data/graph_summary.json";
    const initialRaw = fs.readFileSync(summaryPath, "utf-8");
    const initialGraph = JSON.parse(initialRaw);

    const initialNodesCount = initialGraph.nodes.length;
    const initialEdgesCount = initialGraph.edges.length;

    // Attach to graph
    const { attachHeuristicsToKnowledgeGraph } = await import("../src/ai/reflexion.js");
    const attachResult = await attachHeuristicsToKnowledgeGraph([testHeuristic], "test_user_graph", false, true);

    expect(attachResult.attachedToGraph).toBe(true);
    expect(attachResult.nodeIds).toContain(testHeuristic.id);

    // Verify written to disk
    const updatedGraph = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
    const addedNode = updatedGraph.nodes.find((n: any) => n.id === testHeuristic.id);
    expect(addedNode).toBeDefined();
    expect(addedNode.type).toBe("heuristic");
    expect(addedNode.label).toBe(testHeuristic.label);
    expect(addedNode.quadrant).toBe(testHeuristic.quadrant);

    // Verify edge to dimension
    const expectedTarget = `dim_${testHeuristic.quadrant.toLowerCase()}`;
    const addedEdge = updatedGraph.edges.find((e: any) => e.source === testHeuristic.id && e.target === expectedTarget);
    expect(addedEdge).toBeDefined();
    expect(addedEdge.relation).toBe("applies_to");

    // Clean up test node and edge so data/graph_summary.json remains pristine
    fs.writeFileSync(summaryPath, initialRaw, "utf-8");
  });
});
