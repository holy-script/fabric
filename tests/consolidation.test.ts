import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import {
  aggregateDailyTelemetry,
  compute4FDeltaAndLoss,
  deriveConsolidatedVector,
  induceNightlyAxioms,
  linkAxiomsToKnowledgeGraph,
  selectPriorityHtnObjective,
  selectMorningWarmupTrack,
  generateMorningBriefingMemo,
  persistConsolidationLocal,
  getLatestConsolidation,
  runNightlyConsolidation,
  type DailyTelemetryAggregation,
  type GitCommitRecord,
  type PriorityHtnObjective,
  type RecommendedWarmupTrack,
  type Aristotelian4FDelta,
  type NightlyConsolidationResult,
} from "../src/ai/consolidation.js";
import type { FourFVector } from "../src/services/governor.js";
import type { Trade } from "../src/db/types.js";
import handler from "../api/consolidation.js";

// Helper to create mock HTTP requests and responses
function createMockHttp(
  method: string,
  url: string,
  body?: any,
  headers: Record<string, string> = {}
) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000", "content-type": "application/json", ...headers };

  let responseData = "";
  let statusCode = 200;
  const resHeaders: Record<string, string> = {};

  const res = {
    statusCode: 200,
    setHeader: (name: string, val: string) => {
      resHeaders[name.toLowerCase()] = String(val);
    },
    writeHead: (code: number, headersOrReason?: any) => {
      statusCode = code;
      res.statusCode = code;
      if (typeof headersOrReason === "object") {
        for (const [k, v] of Object.entries(headersOrReason)) {
          resHeaders[k.toLowerCase()] = String(v);
        }
      }
    },
    end: (data: string = "") => {
      responseData = data;
    },
  };

  const execute = async (): Promise<{
    status: number;
    body: any;
    rawText: string;
    headers: Record<string, string>;
  }> => {
    const promise = handler(req, res as any);
    if (body !== undefined) {
      req.emit("data", typeof body === "string" ? body : JSON.stringify(body));
    }
    req.emit("end");
    await promise;

    let parsedBody: any = responseData;
    try {
      parsedBody = JSON.parse(responseData);
    } catch {
      // Plain text or markdown
    }

    return {
      status: statusCode,
      body: parsedBody,
      rawText: responseData,
      headers: resHeaders,
    };
  };

  return { execute };
}

describe("Fabric OS — Nightly Consolidation & Dream Loop QC Suite", () => {
  let tempDir: string;
  let tempGraphPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fabric-consolidation-test-"));
    tempGraphPath = path.join(tempDir, "graph_summary.json");

    // Seed mock graph summary
    const sampleGraph = {
      nodes: [
        { id: "dim_focus", type: "dimension", label: "Focus" },
        { id: "dim_facts", type: "dimension", label: "Facts" },
        { id: "dim_funds", type: "dimension", label: "Funds" },
        { id: "dim_feedback", type: "dimension", label: "Feedback" },
      ],
      edges: [],
      clusters: [
        {
          id: "cluster_dopamine_cognitive_flow",
          label: "Dopamine Optimization & Deep Cognitive Flow",
          topTags: ["focus", "flow", "habits", "dopamine"],
          nodeIds: [],
        },
        {
          id: "cluster_execution_velocity_habits",
          label: "Execution Velocity & Atomic Habits",
          topTags: ["git", "cadence", "code_craft", "habits", "momentum"],
          nodeIds: [],
        },
        {
          id: "cluster_biological_vitality",
          label: "Biological Architecture & Vitality",
          topTags: ["vitality", "posture", "foci", "breathing"],
          nodeIds: [],
        },
      ],
      metadata: { totalNodes: 4, totalEdges: 0 },
    };
    fs.writeFileSync(tempGraphPath, JSON.stringify(sampleGraph, null, 2), "utf-8");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  // ==========================================================================
  // 1. Data Aggregation Tests
  // ==========================================================================
  describe("1. Daily Telemetry Aggregation", () => {
    it("aggregates ambient context, git history, and focus sprint telemetry cleanly", async () => {
      const mockGitCommits: GitCommitRecord[] = [
        {
          hash: "a1b2c3d",
          message: "feat(ai): build Nightly Consolidation & Dream Loop",
          author: "Dream Architect",
          date: "2026-11-04T05:00:00Z",
        },
        {
          hash: "e5f6g7h",
          message: "test(consolidation): add unit test suite",
          author: "Dream Architect",
          date: "2026-11-04T05:30:00Z",
        },
      ];

      const mockTrades: Trade[] = [
        {
          id: "trade_test_1",
          userId: "test_operator",
          timestamp: new Date("2026-11-04T03:00:00Z"),
          moduleName: "Core Architecture",
          tradeType: "builder",
          focusActualHours: 1.5, // 90 min
          factsYield: "Synthesized cybernetic loss governor reduction formulas",
          energyDelta: 2,
          fundsCost: 0,
          fundsYield: 0,
          tags: ["architecture", "governor"],
        },
        {
          id: "trade_test_2",
          userId: "test_operator",
          timestamp: new Date("2026-11-04T04:30:00Z"),
          moduleName: "IITM Prep Sparring",
          tradeType: "scholar",
          focusActualHours: 0.5, // 30 min
          factsYield: "Reviewed 20 past exam questions on sliding window flow control",
          energyDelta: 1,
          fundsCost: 0,
          fundsYield: 0,
          tags: ["prep", "cn"],
        },
      ];

      const aggregation = await aggregateDailyTelemetry({
        date: "2026-11-04",
        customGitCommits: mockGitCommits,
        trades: mockTrades,
        customTelemetry: {
          ambient: {
            frontmostApp: "Visual Studio Code",
            appCategory: "ide",
            sedentaryMinutes: 80,
            tranceState: "deep_flow",
            continuousActivitySeconds: 5400,
            recentErrorCount: 0,
          },
        },
      });

      expect(aggregation.date).toBe("2026-11-04");
      expect(aggregation.gitCommits.length).toBe(2);
      expect(aggregation.gitCommits[0].hash).toBe("a1b2c3d");
      expect(aggregation.focusSprintMinutes).toBe(120); // 90m + 30m
      expect(aggregation.tradesCount).toBe(2);
      expect(aggregation.totalFactsAcquired).toBeGreaterThanOrEqual(2);
      expect(aggregation.ambient.frontmostApp).toBe("Visual Studio Code");
      expect(aggregation.fociStats.compositeRecoveryScore).toBeGreaterThanOrEqual(0);
      expect(aggregation.fociStats.respirationRateBpm).toBeGreaterThan(0);
    });

    it("falls back gracefully when ambient state and git history are missing", async () => {
      const aggregation = await aggregateDailyTelemetry({
        date: "2026-11-04",
        ambientStatePath: path.join(tempDir, "non_existent.json"),
        customGitCommits: [],
        trades: [],
      });

      expect(aggregation.date).toBe("2026-11-04");
      expect(Array.isArray(aggregation.gitCommits)).toBe(true);
      expect(Array.isArray(aggregation.completedTasks)).toBe(true);
      expect(typeof aggregation.focusSprintMinutes).toBe("number");
      expect(aggregation.fociStats.compositeRecoveryScore).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 2. 4F Delta & Cybernetic Loss Reduction Calculation
  // ==========================================================================
  describe("2. Aristotelian 4F Delta & Cybernetic Loss Reduction", () => {
    it("correctly computes 4F delta vector and cybernetic loss reduction ΔL", () => {
      // Operator started the day scattered / distracted (-2 focus, -1 facts, -2 funds, +2 feedback noise)
      const prevVector: FourFVector = {
        focus: -2.0,
        facts: -1.0,
        funds: -2.0,
        feedback: 2.0,
      };

      // Ended the day in calibrated flow state (0 focus, +0.5 facts, +1.0 funds, 0 feedback)
      const currVector: FourFVector = {
        focus: 0.0,
        facts: 0.5,
        funds: 1.0,
        feedback: 0.0,
      };

      const result: Aristotelian4FDelta = compute4FDeltaAndLoss(prevVector, currVector);

      expect(result.deltaVector.focus).toBe(2.0);
      expect(result.deltaVector.facts).toBe(1.5);
      expect(result.deltaVector.funds).toBe(3.0);
      expect(result.deltaVector.feedback).toBe(-2.0);

      // Cybernetic loss should have decreased significantly
      expect(result.initialLoss).toBeGreaterThan(result.finalLoss);
      expect(result.lossReduction).toBeGreaterThan(0);
      expect(result.percentageImprovement).toBeGreaterThan(0);
    });

    it("derives consolidated end-of-day vector within Aristotelian bounds [-5, +5]", () => {
      const mockAgg: DailyTelemetryAggregation = {
        date: "2026-11-04",
        ambient: {
          frontmostApp: "Code",
          appCategory: "ide",
          sedentaryMinutes: 130, // trigger sedentary penalty
          tranceState: "deep_flow",
          continuousActivitySeconds: 7200,
          recentErrorCount: 1,
        },
        gitCommits: [
          { hash: "1234567", message: "commit 1", author: "Op", date: "2026-11-04" },
          { hash: "7654321", message: "commit 2", author: "Op", date: "2026-11-04" },
        ],
        completedTasks: [{ planId: "p1", goal: "Complete HTN Swarm", completedAt: "2026-11-04", completedStepsCount: 3 }],
        focusSprintMinutes: 150,
        fociStats: {
          respirationRateBpm: 14.0,
          flowMinutes: 45,
          calmMinutes: 90,
          stressMinutes: 15,
          compositeRecoveryScore: 82,
        },
        tradesCount: 3,
        totalFactsAcquired: 4,
      };

      const { vector, virtues } = deriveConsolidatedVector(mockAgg);

      expect(vector.focus).toBeGreaterThanOrEqual(-5);
      expect(vector.focus).toBeLessThanOrEqual(5);
      expect(vector.facts).toBeGreaterThanOrEqual(-5);
      expect(vector.facts).toBeLessThanOrEqual(5);
      expect(vector.funds).toBeGreaterThanOrEqual(-5);
      expect(vector.funds).toBeLessThanOrEqual(5);
      expect(vector.feedback).toBeGreaterThanOrEqual(-5);
      expect(vector.feedback).toBeLessThanOrEqual(5);

      expect(typeof virtues.prioritization).toBe("number");
      expect(typeof virtues.waysToWork).toBe("number");
    });
  });

  // ==========================================================================
  // 3. Axiom Induction & Knowledge Graph Synapse Linking
  // ==========================================================================
  describe("3. Axiom Induction & Knowledge Graph Synapse Linking", () => {
    it("induces targeted heuristics conforming to the InducedHeuristic schema", () => {
      const mockAgg: DailyTelemetryAggregation = {
        date: "2026-11-04",
        ambient: {
          frontmostApp: "Terminal",
          appCategory: "terminal",
          sedentaryMinutes: 90, // Triggers kinetic reset axiom
          tranceState: "active",
          continuousActivitySeconds: 3600,
          recentErrorCount: 0,
        },
        gitCommits: [
          { hash: "aaa1111", message: "feat: add first commit", author: "Op", date: "2026-11-04" },
          { hash: "bbb2222", message: "feat: add second commit", author: "Op", date: "2026-11-04" },
          { hash: "ccc3333", message: "feat: add third commit", author: "Op", date: "2026-11-04" },
        ],
        completedTasks: [],
        focusSprintMinutes: 120,
        fociStats: {
          respirationRateBpm: 13.8,
          flowMinutes: 30,
          calmMinutes: 80,
          stressMinutes: 10,
          compositeRecoveryScore: 85,
        },
        tradesCount: 1,
        totalFactsAcquired: 3,
      };

      const axioms = induceNightlyAxioms(mockAgg);

      expect(axioms.length).toBeGreaterThanOrEqual(1);
      expect(axioms.length).toBeLessThanOrEqual(3);

      for (const axiom of axioms) {
        expect(axiom.id).toBeTruthy();
        expect(axiom.label).toBeTruthy();
        expect(axiom.axiom).toBeTruthy();
        expect(axiom.actionableTakeaway).toBeTruthy();
        expect(["Focus", "Facts", "Funds", "Feedback"]).toContain(axiom.quadrant);
        expect(axiom.confidence).toBeGreaterThanOrEqual(0.7);
        expect(Array.isArray(axiom.tags)).toBe(true);
        expect(Array.isArray(axiom.evidence)).toBe(true);
      }

      // Check specific induction triggers
      const hasCadenceRule = axioms.some((a) => a.tags.includes("git") || a.tags.includes("cadence"));
      const hasKineticReset = axioms.some((a) => a.tags.includes("breathing") || a.tags.includes("posture"));
      expect(hasCadenceRule || hasKineticReset).toBe(true);
    });

    it("links newly induced axioms into knowledge graph nodes and cluster synapses", async () => {
      const mockAgg: DailyTelemetryAggregation = {
        date: "2026-11-04",
        ambient: {
          frontmostApp: "IDE",
          appCategory: "ide",
          sedentaryMinutes: 85,
          tranceState: "active",
          continuousActivitySeconds: 4000,
          recentErrorCount: 0,
        },
        gitCommits: [
          { hash: "111", message: "commit A", author: "Op", date: "2026-11-04" },
          { hash: "222", message: "commit B", author: "Op", date: "2026-11-04" },
        ],
        completedTasks: [],
        focusSprintMinutes: 100,
        fociStats: {
          respirationRateBpm: 14.5,
          flowMinutes: 30,
          calmMinutes: 60,
          stressMinutes: 10,
          compositeRecoveryScore: 78,
        },
        tradesCount: 2,
        totalFactsAcquired: 2,
      };

      const axioms = induceNightlyAxioms(mockAgg);
      const linkResult = await linkAxiomsToKnowledgeGraph(axioms, tempGraphPath, false);

      expect(linkResult.newNodes.length).toBeGreaterThanOrEqual(1);
      expect(linkResult.totalNodes).toBeGreaterThan(4);
      expect(linkResult.totalEdges).toBeGreaterThan(0);

      // Verify file on disk
      const updatedGraph = JSON.parse(fs.readFileSync(tempGraphPath, "utf-8"));
      expect(updatedGraph.nodes.length).toBe(linkResult.totalNodes);
      expect(updatedGraph.edges.length).toBe(linkResult.totalEdges);

      // Verify cluster synapse linking
      const matchedClusters = updatedGraph.clusters.filter((c: any) => c.nodeIds.length > 0);
      expect(matchedClusters.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 4. Morning Briefing Memo Generation
  // ==========================================================================
  describe("4. Morning Briefing Memo Generation (Telegram & SMS)", () => {
    it("generates structured Morning Briefing Memo with Telegram and SMS formats", async () => {
      const mockAgg: DailyTelemetryAggregation = {
        date: "2026-11-04",
        ambient: {
          frontmostApp: "Code",
          appCategory: "ide",
          sedentaryMinutes: 45,
          tranceState: "deep_flow",
          continuousActivitySeconds: 5000,
          recentErrorCount: 0,
        },
        gitCommits: [{ hash: "abc1234", message: "feat: dream loop", author: "Op", date: "2026-11-04" }],
        completedTasks: [{ planId: "p_swarm", goal: "HTN Swarm", completedAt: "2026-11-04", completedStepsCount: 4 }],
        focusSprintMinutes: 140,
        fociStats: {
          respirationRateBpm: 13.5,
          flowMinutes: 50,
          calmMinutes: 80,
          stressMinutes: 10,
          compositeRecoveryScore: 88,
        },
        tradesCount: 3,
        totalFactsAcquired: 4,
      };

      const delta: Aristotelian4FDelta = {
        previousVector: { focus: -2, facts: -1, funds: -2, feedback: 1 },
        currentVector: { focus: 0.2, facts: 0.8, funds: 1.5, feedback: 0.1 },
        deltaVector: { focus: 2.2, facts: 1.8, funds: 3.5, feedback: -0.9 },
        initialLoss: 14.5,
        finalLoss: 2.1,
        lossReduction: 12.4,
        percentageImprovement: 85.5,
      };

      const objective: PriorityHtnObjective = {
        planId: "plan_morning_spark",
        goal: "Finalize Fabric Sovereign Voice Mesh Subsystem",
        rationale: "Unfinished active DAG wavefront with pending publisher deliverable.",
        nextStep: "Wire streaming audio visualizer into Dynamic Island",
        category: "active_plan",
      };

      const track: RecommendedWarmupTrack = {
        id: "warmup_home_resonance",
        title: "Resonance",
        artist: "HOME",
        energyLevel: 5,
        mood: ["ethereal", "driving"],
        reason: "105 BPM synthwave warmup cadence",
        youtubeUrl: "https://www.youtube.com/watch?v=8GW6sLrK40k",
      };

      const memo = generateMorningBriefingMemo(
        "2026-11-04",
        mockAgg,
        delta,
        objective,
        track
      );

      // Verify core properties
      expect(memo.date).toBe("2026-11-04");
      expect(memo.recoveryIndex).toBe(88);
      expect(memo.priorityHtnObjective.goal).toBe("Finalize Fabric Sovereign Voice Mesh Subsystem");
      expect(memo.recommendedWarmupTrack.title).toBe("Resonance");
      expect(memo.stoicAnchor).toBeTruthy();

      // Telegram Markdown Verification
      expect(memo.telegramMarkdown).toContain("🌅 *MORNING RECON & DREAM LOOP MEMO*");
      expect(memo.telegramMarkdown).toContain("Recovery Index: 88/100");
      expect(memo.telegramMarkdown).toContain("Finalize Fabric Sovereign Voice Mesh Subsystem");
      expect(memo.telegramMarkdown).toContain("Resonance");
      expect(memo.telegramMarkdown).toContain("Open Warmup Stream");

      // SMS Format Verification
      expect(memo.smsText).toContain("Fabric Morning (2026-11-04)");
      expect(memo.smsText).toContain("Recovery 88%");
      expect(memo.smsText).toContain("Resonance - HOME");
      expect(memo.smsText.length).toBeLessThan(250); // Concise GSM SMS length
    });

    it("selects appropriate priority HTN objective and warmup track fallbacks", async () => {
      const objective = await selectPriorityHtnObjective();
      expect(objective.goal).toBeTruthy();
      expect(objective.rationale).toBeTruthy();

      const track = await selectMorningWarmupTrack();
      expect(track.id).toBeTruthy();
      expect(track.title).toBeTruthy();
      expect(track.energyLevel).toBeGreaterThanOrEqual(1);
      expect(track.energyLevel).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // 5. Dual-Persistence & Local Storage Subsystem
  // ==========================================================================
  describe("5. Dual-Persistence & Retrieval Subsystem", () => {
    it("persists consolidation record to local disk and retrieves it accurately", async () => {
      const fullResult = await runNightlyConsolidation({
        date: "2026-11-04",
        outputDir: tempDir,
        graphSummaryPath: tempGraphPath,
        skipFirestore: true,
        customGitCommits: [
          { hash: "c0ffee1", message: "feat: dream loop persistence", author: "Op", date: "2026-11-04" },
        ],
      });

      expect(fullResult.id).toContain("consolidation_2026-11-04");
      expect(fullResult.persistedPaths.localJson).toBeTruthy();
      expect(fs.existsSync(fullResult.persistedPaths.localJson!)).toBe(true);

      const latest = await getLatestConsolidation(tempDir);
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe(fullResult.id);
      expect(latest!.date).toBe("2026-11-04");
      expect(latest!.morningBriefing.recoveryIndex).toBe(fullResult.morningBriefing.recoveryIndex);
    });
  });

  // ==========================================================================
  // 6. REST API Endpoint (/api/consolidation)
  // ==========================================================================
  describe("6. REST API Handler (/api/consolidation)", () => {
    it("handles OPTIONS preflight request with 204 and CORS headers", async () => {
      const mock = createMockHttp("OPTIONS", "/api/consolidation");
      const res = await mock.execute();

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("executes POST /api/consolidation with action='run'", async () => {
      const mock = createMockHttp("POST", "/api/consolidation", {
        action: "run",
        date: "2026-11-04",
        skipFirestore: true,
        skipDiskWrite: true,
        customGitCommits: [
          { hash: "789abc", message: "api test commit", author: "Tester", date: "2026-11-04" },
        ],
      });

      const res = await mock.execute();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.action).toBe("run");
      expect(res.body.consolidation).toBeTruthy();
      expect(res.body.consolidation.date).toBe("2026-11-04");
      expect(res.body.consolidation.fourFDelta).toBeTruthy();
      expect(res.body.consolidation.morningBriefing).toBeTruthy();
    });

    it("handles GET /api/consolidation?action=status", async () => {
      const mock = createMockHttp("GET", "/api/consolidation?action=status");
      const res = await mock.execute();

      expect(res.status).toBe(200);
      expect(["success", "idle"]).toContain(res.body.status);
    });

    it("handles GET /api/consolidation?action=latest_brief in markdown and sms formats", async () => {
      // 1. Markdown format
      const mockMd = createMockHttp("GET", "/api/consolidation?action=latest_brief&format=markdown");
      const resMd = await mockMd.execute();
      expect(resMd.status).toBe(200);
      expect(resMd.rawText).toContain("MORNING RECON");

      // 2. SMS format
      const mockSms = createMockHttp("GET", "/api/consolidation?action=latest_brief&format=sms");
      const resSms = await mockSms.execute();
      expect(resSms.status).toBe(200);
      expect(resSms.rawText).toContain("Fabric Morning");
    });

    it("rejects unknown actions with 400 Bad Request", async () => {
      const mock = createMockHttp("POST", "/api/consolidation", { action: "invalid_action_xyz" });
      const res = await mock.execute();

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Unknown action");
    });
  });
});
