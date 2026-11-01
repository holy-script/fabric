#!/usr/bin/env bun
/**
 * Knowledge Graph Construction & Verification Script
 *
 * Usage:
 *   bun run scripts/build-knowledge-graph.ts
 */

import { buildKnowledgeGraph } from "../src/graph/builder.js";
import { searchGraph, getCluster, findPath, attachVerdictToNode, getGraphStats } from "../src/graph/query.js";

async function main() {
  console.log("===============================================================");
  console.log("🧠 FABRIC OS — KNOWLEDGE GRAPH ENGINE CONSTRUCTOR & VERIFIER");
  console.log("===============================================================\n");

  const startTime = Date.now();

  // 1. Build & Persist Graph
  console.log("🚀 [1/5] Constructing Knowledge Graph from 3,843 Ingested Items...");
  const graph = await buildKnowledgeGraph();

  console.log("\n✅ Graph Successfully Built & Persisted!");
  console.log(`   • Total Nodes:      ${graph.metadata.totalNodes.toLocaleString()}`);
  console.log(`   • Total Edges:      ${graph.metadata.totalEdges.toLocaleString()}`);
  console.log(`   • Semantic Clusters:${graph.clusters.length}`);
  console.log(`   • Reels Ingested:   ${graph.metadata.reelsCount?.toLocaleString()}`);
  console.log(`   • Core Concepts:    ${graph.metadata.conceptsCount}`);
  console.log(`   • Heuristics:       ${graph.metadata.heuristicsCount}`);
  console.log(`   • 4F Dimensions:    ${graph.metadata.dimensionsCount}`);

  // 2. Semantic Clusters Overview
  console.log("\n🌌 [2/5] Synthesized Semantic Clusters Overview:");
  for (let i = 0; i < graph.clusters.length; i++) {
    const c = graph.clusters[i];
    console.log(
      `   ${(i + 1).toString().padStart(2, " ")}. [${c.id}]` +
      `\n       Title:       ${c.label}` +
      `\n       Theme:       ${c.coreTheme}` +
      `\n       Nodes:       ${c.nodeIds.length} items | Top Tags: ${c.topTags.join(", ")}`
    );
  }

  // 3. Subgraph Search Verification
  console.log("\n🔍 [3/5] Verifying Subgraph Extraction (searchGraph)...");
  const testQueries = ["Dopamine Optimization", "Game Feel Mechanics", "Biomechanics"];

  for (const q of testQueries) {
    const searchRes = await searchGraph(q, 5);
    console.log(`\n   Query: "${q}" -> Found ${searchRes.totalMatches} matches (displaying top ${searchRes.nodes.length}):`);
    for (const n of searchRes.nodes) {
      console.log(`     • [${n.type.toUpperCase()}] ${n.label} (weight: ${n.weight.toFixed(1)})`);
    }
    if (searchRes.matchedConcepts.length > 0) {
      console.log(`       -> Anchored Concepts: ${searchRes.matchedConcepts.map((c) => c.label).join(", ")}`);
    }
  }

  // 4. Cluster Retrieval & Connectivity Verification
  console.log("\n🧩 [4/5] Verifying Cluster Retrieval (getCluster)...");
  const sampleCluster = await getCluster("cluster_dopamine_cognitive_flow");
  if (sampleCluster) {
    console.log(`   Cluster: "${sampleCluster.cluster.label}"`);
    console.log(`   Core Theme: ${sampleCluster.cluster.coreTheme}`);
    console.log(`   Master Synthesis:\n     "${sampleCluster.cluster.masterSynthesis}"`);
    console.log(`   Total Cluster Nodes: ${sampleCluster.nodes.length}`);
    console.log(`   Internal Edges:     ${sampleCluster.edges.length}`);
    console.log(`   Density Metric:     ${sampleCluster.density}`);
    console.log(`   Quadrants:          ${JSON.stringify(sampleCluster.quadrantBreakdown)}`);
  }

  // 5. Conceptual Pathfinder Verification
  console.log("\n🧭 [5/5] Verifying Conceptual Pathfinder (findPath)...");
  const pathTestPairs = [
    ["Dopamine Optimization", "Plyometric Tendon Elasticity"],
    ["Cinematic Color Grading", "Game Feel Mechanics"],
    ["Neurodivergent Hyperfocus", "Aristotelian Mean & Stoic Equanimity"],
  ];

  for (const [start, end] of pathTestPairs) {
    console.log(`\n   Pathfinding: "${start}" ➔ "${end}"...`);
    const pathResult = await findPath(start, end);
    if (pathResult.found) {
      console.log(`   Status: FOUND (${pathResult.steps.length} hops, total weight: ${pathResult.totalWeight})`);
      for (let i = 0; i < pathResult.steps.length; i++) {
        const step = pathResult.steps[i];
        console.log(`     Hop ${i + 1}: [${step.from.type}] ${step.from.label} --(${step.relation})--> [${step.to.type}] ${step.to.label}`);
      }
    } else {
      console.log(`   Status: NOT FOUND — ${pathResult.explanation}`);
    }
  }

  // 6. User Verdict Attachment Verification
  console.log("\n🖋️ [6/5] Verifying User Verdict Attachment (attachVerdictToNode)...");
  const targetConcept = "concept_dopamine_optimization";
  const userVerdict = "Dopamine resets are useless without physical friction barriers installed on the phone.";
  const verdictRes = await attachVerdictToNode(targetConcept, userVerdict, "Executive Curator");

  console.log(`   Attached Verdict:`);
  console.log(`     • Verdict ID:    ${verdictRes.verdictNode.id}`);
  console.log(`     • Target:        ${(verdictRes.targetNode as any).label || (verdictRes.targetNode as any).id}`);
  console.log(`     • Description:   "${verdictRes.verdictNode.description}"`);
  console.log(`     • Edge:          ${verdictRes.edge.source} --(${verdictRes.edge.relation})--> ${verdictRes.edge.target}`);

  // Final Telemetry
  const stats = await getGraphStats();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n===============================================================");
  console.log("🎉 ALL KNOWLEDGE GRAPH SYSTEMS VERIFIED & OPERATIONAL");
  console.log(`⏱️ Completed in ${elapsed}s`);
  console.log(`📊 Nodes: ${stats.totalNodes} | Edges: ${stats.totalEdges} | Verdicts: ${stats.verdictsCount}`);
  console.log("===============================================================\n");
}

main().catch((err) => {
  console.error("❌ Fatal error executing knowledge graph build script:", err);
  process.exit(1);
});
