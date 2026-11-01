import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { graphsCollection, knowledgeCollection } from "../db/firestore.js";
import { buildKnowledgeGraph } from "./builder.js";
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  GraphCluster,
  GraphNodeType,
  GraphRelationType,
  GraphSearchResult,
  GraphPathResult,
  GraphPathStep,
  ClusterDetailResult,
} from "./types.js";

const LOCAL_GRAPH_CACHE = path.resolve(process.cwd(), "data/knowledge_graph.json");

let memoryGraph: KnowledgeGraph | null = null;

/**
 * Loads the Knowledge Graph from memory cache, local disk, or builds it if absent.
 */
export async function getOrLoadGraph(forceReload = false): Promise<KnowledgeGraph> {
  if (memoryGraph && !forceReload) {
    return memoryGraph;
  }

  if (!forceReload && fs.existsSync(LOCAL_GRAPH_CACHE)) {
    try {
      const data = fs.readFileSync(LOCAL_GRAPH_CACHE, "utf-8");
      memoryGraph = JSON.parse(data);
      if (memoryGraph && memoryGraph.nodes && memoryGraph.edges) {
        return memoryGraph;
      }
    } catch (err) {
      console.warn("⚠️ Failed reading local graph cache:", err);
    }
  }

  // Fallback: build and cache graph
  memoryGraph = await buildKnowledgeGraph();
  return memoryGraph;
}

/**
 * Persists the current in-memory graph back to cache and Firestore.
 */
export async function saveCurrentGraph(graph: KnowledgeGraph): Promise<void> {
  memoryGraph = graph;
  const dataDir = path.dirname(LOCAL_GRAPH_CACHE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_GRAPH_CACHE, JSON.stringify(graph, null, 2), "utf-8");

  try {
    const rawPayload = {
      metadata: graph.metadata,
      clusters: graph.clusters.map((c) => ({
        id: c.id,
        label: c.label,
        coreTheme: c.coreTheme,
        topTags: c.topTags,
        masterSynthesis: c.masterSynthesis,
        nodeCount: c.nodeIds.length,
        sampleNodeIds: c.nodeIds.slice(0, 30),
      })),
      dimensions: graph.nodes.filter((n) => n.type === "dimension"),
      concepts: graph.nodes.filter((n) => n.type === "concept"),
      heuristics: graph.nodes.filter((n) => n.type === "heuristic"),
      verdicts: graph.nodes.filter((n) => n.type === "verdict"),
    };
    const cleanPayload = JSON.parse(JSON.stringify(rawPayload));
    cleanPayload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await graphsCollection.doc("knowledge_graph").set(cleanPayload);
  } catch (err) {
    console.warn("⚠️ Error saving graph update to Firestore:", err);
  }
}

/**
 * Resolves a search term or identifier to the closest matching GraphNode.
 */
function resolveNode(graph: KnowledgeGraph, identifier: string): GraphNode | null {
  const normalized = identifier.toLowerCase().trim();

  // 1. Exact ID match
  const exact = graph.nodes.find((n) => n.id.toLowerCase() === normalized);
  if (exact) return exact;

  // 2. Starts with / Concept match
  const conceptMatch = graph.nodes.find(
    (n) => n.type === "concept" && (n.id.toLowerCase().includes(normalized) || n.label.toLowerCase() === normalized)
  );
  if (conceptMatch) return conceptMatch;

  // 3. Label exact / substring match
  const labelMatch = graph.nodes.find((n) => n.label.toLowerCase().includes(normalized));
  if (labelMatch) return labelMatch;

  // 4. Tag match
  const tagMatch = graph.nodes.find((n) => {
    const tags = (n.properties.tags as string[]) || [];
    return tags.some((t) => t.toLowerCase() === normalized);
  });
  if (tagMatch) return tagMatch;

  return null;
}

/**
 * 1. searchGraph(query, limit): Semantic & tag-based subgraph extraction.
 */
export async function searchGraph(query: string, limit = 20): Promise<GraphSearchResult> {
  const graph = await getOrLoadGraph();
  const q = query.toLowerCase().trim();
  const tokens = q.split(/\s+/).filter(Boolean);

  interface ScoredNode {
    node: GraphNode;
    score: number;
  }

  const scored: ScoredNode[] = [];

  for (const node of graph.nodes) {
    let score = 0;
    const label = node.label.toLowerCase();
    const desc = node.description.toLowerCase();
    const tags = ((node.properties.tags as string[]) || []).map((t) => t.toLowerCase());
    const author = (node.properties.author as string)?.toLowerCase() || "";

    // Exact query matches
    if (label === q) score += 50;
    else if (label.includes(q)) score += 25;

    if (tags.includes(q)) score += 30;

    // Token matches
    for (const token of tokens) {
      if (label.includes(token)) score += 10;
      if (tags.some((t) => t.includes(token))) score += 12;
      if (desc.includes(token)) score += 4;
      if (author.includes(token)) score += 5;
    }

    // High-level conceptual anchors receive a slight boost to provide structural context
    if (score > 0) {
      if (node.type === "concept") score += 15;
      if (node.type === "dimension") score += 10;
      if (node.type === "heuristic") score += 8;
      scored.push({ node, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const matchedNodes = scored.slice(0, limit).map((s) => s.node);
  const matchedNodeIds = new Set(matchedNodes.map((n) => n.id));

  // Extract edges connecting the matched nodes (or connecting matched nodes to directly adjacent concepts)
  const matchedEdges = graph.edges.filter(
    (e) => matchedNodeIds.has(e.source) && matchedNodeIds.has(e.target)
  );

  // Identify relevant concepts and clusters
  const matchedConcepts = matchedNodes.filter((n) => n.type === "concept");
  const relevantClusters = graph.clusters.filter((c) =>
    c.nodeIds.some((id) => matchedNodeIds.has(id)) ||
    c.topTags.some((t) => tokens.includes(t)) ||
    c.label.toLowerCase().includes(q)
  );

  return {
    query,
    nodes: matchedNodes,
    edges: matchedEdges,
    matchedConcepts,
    relevantClusters,
    totalMatches: scored.length,
  };
}

/**
 * 2. getCluster(clusterIdOrTopic): Retrieves the cluster of nodes with their direct connections.
 */
export async function getCluster(clusterIdOrTopic: string): Promise<ClusterDetailResult | null> {
  const graph = await getOrLoadGraph();
  const query = clusterIdOrTopic.toLowerCase().trim();

  // Find matching cluster
  let cluster = graph.clusters.find((c) => c.id.toLowerCase() === query);
  if (!cluster) {
    cluster = graph.clusters.find(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.coreTheme.toLowerCase().includes(query) ||
        c.topTags.some((t) => t.toLowerCase() === query)
    );
  }

  if (!cluster) {
    return null;
  }

  const clusterNodeIdSet = new Set(cluster.nodeIds);
  const clusterNodes = graph.nodes.filter((n) => clusterNodeIdSet.has(n.id));

  // Direct internal connections within cluster
  const clusterEdges = graph.edges.filter(
    (e) => clusterNodeIdSet.has(e.source) && clusterNodeIdSet.has(e.target)
  );

  // Compute graph density: 2 * E / (N * (N - 1))
  const n = clusterNodes.length;
  const maxPossibleEdges = n > 1 ? (n * (n - 1)) / 2 : 1;
  const density = n > 1 ? parseFloat((clusterEdges.length / maxPossibleEdges).toFixed(4)) : 1.0;

  // Breakdown statistics
  const quadrantBreakdown: Record<string, number> = {};
  for (const node of clusterNodes) {
    const q = (node.properties.quadrant as string) || "Unassigned";
    quadrantBreakdown[q] = (quadrantBreakdown[q] || 0) + 1;
  }

  const topConcepts = clusterNodes.filter((n) => n.type === "concept");

  return {
    cluster,
    nodes: clusterNodes,
    edges: clusterEdges,
    density,
    topConcepts,
    quadrantBreakdown,
  };
}

/**
 * 3. findPath(startConcept, endConcept): Graph pathfinder showing conceptual links.
 */
export async function findPath(startConcept: string, endConcept: string): Promise<GraphPathResult> {
  const graph = await getOrLoadGraph();

  const startNode = resolveNode(graph, startConcept);
  const endNode = resolveNode(graph, endConcept);

  if (!startNode || !endNode) {
    return {
      found: false,
      start: startConcept,
      end: endConcept,
      path: [],
      edges: [],
      steps: [],
      totalWeight: 0,
      explanation: `Could not resolve nodes for "${!startNode ? startConcept : endConcept}" in the Knowledge Graph.`,
    };
  }

  if (startNode.id === endNode.id) {
    return {
      found: true,
      start: startNode.id,
      end: endNode.id,
      path: [startNode],
      edges: [],
      steps: [],
      totalWeight: 0,
      explanation: `Start and end concepts are identical: "${startNode.label}".`,
    };
  }

  // Build adjacency list (bidirectional graph traversal)
  interface AdjEdge {
    targetId: string;
    edge: GraphEdge;
    isForward: boolean;
  }

  const adj = new Map<string, AdjEdge[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    if (!adj.has(edge.target)) adj.set(edge.target, []);

    adj.get(edge.source)!.push({ targetId: edge.target, edge, isForward: true });
    adj.get(edge.target)!.push({ targetId: edge.source, edge, isForward: false });
  }

  // BFS / Shortest-Path Search
  const queue: string[] = [startNode.id];
  const visited = new Set<string>([startNode.id]);
  const parentMap = new Map<string, { prevId: string; edge: GraphEdge }>();

  let reached = false;

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === endNode.id) {
      reached = true;
      break;
    }

    const neighbors = adj.get(currentId) || [];
    for (const { targetId, edge } of neighbors) {
      if (!visited.has(targetId)) {
        visited.add(targetId);
        parentMap.set(targetId, { prevId: currentId, edge });
        queue.push(targetId);
      }
    }
  }

  if (!reached) {
    return {
      found: false,
      start: startNode.id,
      end: endNode.id,
      path: [],
      edges: [],
      steps: [],
      totalWeight: 0,
      explanation: `No conceptual path found between "${startNode.label}" and "${endNode.label}".`,
    };
  }

  // Reconstruct path
  const pathNodeIds: string[] = [];
  const pathEdges: GraphEdge[] = [];
  let curr = endNode.id;

  while (curr !== startNode.id) {
    pathNodeIds.unshift(curr);
    const parentInfo = parentMap.get(curr)!;
    pathEdges.unshift(parentInfo.edge);
    curr = parentInfo.prevId;
  }
  pathNodeIds.unshift(startNode.id);

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const pathNodes = pathNodeIds.map((id) => nodeMap.get(id)!);

  const steps: GraphPathStep[] = [];
  let totalWeight = 0;

  for (let i = 0; i < pathEdges.length; i++) {
    const from = pathNodes[i];
    const to = pathNodes[i + 1];
    const edge = pathEdges[i];
    totalWeight += edge.weight;
    steps.push({
      from,
      to,
      relation: edge.relation,
      weight: edge.weight,
    });
  }

  // Construct readable explanation
  const stepNarratives = steps.map(
    (s) => `[${s.from.label}] --(${s.relation})--> [${s.to.label}]`
  );
  const explanation = `Found conceptual path across ${steps.length} hops:\n${stepNarratives.join(" ->\n")}`;

  return {
    found: true,
    start: startNode.id,
    end: endNode.id,
    path: pathNodes,
    edges: pathEdges,
    steps,
    totalWeight: parseFloat(totalWeight.toFixed(2)),
    explanation,
  };
}

/**
 * 4. attachVerdictToNode(nodeId, verdict): Adds personal user synthesis to a node or cluster.
 */
export async function attachVerdictToNode(
  nodeId: string,
  verdict: string,
  author = "User"
): Promise<{ verdictNode: GraphNode; targetNode: GraphNode | GraphCluster; edge: GraphEdge }> {
  const graph = await getOrLoadGraph();

  // Check if nodeId is a node or cluster
  const targetNode = graph.nodes.find((n) => n.id === nodeId);
  const targetCluster = !targetNode ? graph.clusters.find((c) => c.id === nodeId) : null;

  if (!targetNode && !targetCluster) {
    throw new Error(`Target node or cluster "${nodeId}" not found in Knowledge Graph.`);
  }

  const verdictId = `verdict_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const verdictNode: GraphNode = {
    id: verdictId,
    type: "verdict",
    label: `Verdict: ${verdict.slice(0, 40).trim()}${verdict.length > 40 ? "..." : ""}`,
    description: verdict,
    weight: 40,
    properties: {
      targetNodeId: nodeId,
      verdictAuthor: author,
      attachedAt: new Date().toISOString(),
      tags: ["verdict", "user-synthesis"],
    },
  };

  graph.nodes.push(verdictNode);

  // Connect verdict to target
  const edge: GraphEdge = {
    source: verdictId,
    target: nodeId,
    relation: "synthesizes",
    weight: 3.0,
    properties: { author, attachedAt: new Date().toISOString() },
  };

  graph.edges.push(edge);

  // If target was a reel in Firestore, update userConclusions in Firestore knowledge doc
  if (targetNode && targetNode.type === "reel") {
    const firestoreId = targetNode.properties.firestoreId as string;
    if (firestoreId) {
      try {
        await knowledgeCollection.doc(firestoreId).set(
          {
            userConclusions: verdict,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn(`⚠️ Could not sync verdict to Firestore reel ${firestoreId}:`, err);
      }
    }
  }

  // If target was a cluster, append to masterSynthesis
  if (targetCluster) {
    targetCluster.masterSynthesis = `${targetCluster.masterSynthesis || ""}\n\n[User Verdict by ${author}]: ${verdict}`.trim();
    targetCluster.nodeIds.push(verdictId);
  }

  // Update metadata
  graph.metadata.totalNodes = graph.nodes.length;
  graph.metadata.totalEdges = graph.edges.length;
  graph.metadata.verdictsCount = (graph.metadata.verdictsCount || 0) + 1;

  // Persist updated graph
  await saveCurrentGraph(graph);

  return {
    verdictNode,
    targetNode: targetNode || targetCluster!,
    edge,
  };
}

/**
 * Returns overall statistics of the loaded knowledge graph.
 */
export async function getGraphStats(): Promise<{
  totalNodes: number;
  totalEdges: number;
  clustersCount: number;
  reelsCount: number;
  conceptsCount: number;
  heuristicsCount: number;
  verdictsCount: number;
  builtAt: string;
}> {
  const graph = await getOrLoadGraph();
  return {
    totalNodes: graph.metadata.totalNodes,
    totalEdges: graph.metadata.totalEdges,
    clustersCount: graph.clusters.length,
    reelsCount: graph.nodes.filter((n) => n.type === "reel").length,
    conceptsCount: graph.nodes.filter((n) => n.type === "concept").length,
    heuristicsCount: graph.nodes.filter((n) => n.type === "heuristic").length,
    verdictsCount: graph.nodes.filter((n) => n.type === "verdict").length,
    builtAt: graph.metadata.builtAt,
  };
}

export interface GraphSummaryNode {
  id: string;
  type: GraphNodeType;
  label: string;
  description: string;
  weight: number;
  quadrant: string;
  category: string;
  tags: string[];
  author?: string;
  actionableTakeaway?: string;
  telegramStreamUrl?: string;
}

export interface GraphSummaryEdge {
  source: string;
  target: string;
  relation: GraphRelationType;
  weight: number;
}

export interface GraphSummaryCluster {
  id: string;
  label: string;
  coreTheme: string;
  masterSynthesis: string;
  topTags: string[];
  nodeIds: string[];
  totalReels: number;
}

export interface GraphSummaryData {
  nodes: GraphSummaryNode[];
  edges: GraphSummaryEdge[];
  clusters: GraphSummaryCluster[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    clustersCount: number;
    builtAt: string;
  };
}

let cachedSummary: GraphSummaryData | null = null;

/**
 * Returns a high-signal, lightweight graph summary optimized for real-time
 * visualization in the Telegram Mini App Visual HUD.
 */
export async function getGraphSummary(forceRefresh = false): Promise<GraphSummaryData> {
  if (cachedSummary && !forceRefresh) {
    return cachedSummary;
  }

  const g = await getOrLoadGraph(forceRefresh);

  // 1. All structural nodes: dimensions, concepts, heuristics, verdicts
  const structuralNodes = g.nodes.filter((n) => n.type !== "reel");

  // 2. All reels that have a direct telegram stream/view URL
  const tgReels = g.nodes.filter(
    (n) => n.type === "reel" && (n.properties.telegramStreamUrl || n.properties.telegramUrl || n.properties.streamUrl)
  );

  const selectedNodeIds = new Set<string>([
    ...structuralNodes.map((n) => n.id),
    ...tgReels.map((n) => n.id),
  ]);

  // 3. For each cluster, ensure representative reels are included
  for (const cluster of g.clusters) {
    let count = cluster.nodeIds.filter((id) => selectedNodeIds.has(id)).length;
    if (count < 3) {
      for (const id of cluster.nodeIds) {
        if (count >= 3) break;
        if (!selectedNodeIds.has(id)) {
          selectedNodeIds.add(id);
          count++;
        }
      }
    }
  }

  const nodeMap = new Map(g.nodes.map((n) => [n.id, n]));
  const nodes: GraphSummaryNode[] = [];

  for (const id of selectedNodeIds) {
    const n = nodeMap.get(id);
    if (!n) continue;
    nodes.push({
      id: n.id,
      type: n.type,
      label: n.label,
      description: n.description || "",
      weight: n.weight || 1,
      quadrant: (n.properties.quadrant as string) || "",
      category: (n.properties.category as string) || "",
      tags: ((n.properties.tags as string[]) || []).slice(0, 5),
      author: (n.properties.author as string) || "",
      actionableTakeaway: (n.properties.actionableTakeaway as string) || "",
      telegramStreamUrl: (n.properties.telegramStreamUrl || n.properties.telegramUrl || n.properties.streamUrl || "") as string,
    });
  }

  const validNodeIds = new Set(nodes.map((n) => n.id));
  const edges: GraphSummaryEdge[] = g.edges
    .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
      weight: e.weight || 1,
    }));

  const clusters: GraphSummaryCluster[] = g.clusters.map((c) => ({
    id: c.id,
    label: c.label,
    coreTheme: c.coreTheme,
    masterSynthesis: c.masterSynthesis || "",
    topTags: c.topTags || [],
    nodeIds: c.nodeIds.filter((id) => validNodeIds.has(id)),
    totalReels: c.nodeIds.length,
  }));

  cachedSummary = {
    nodes,
    edges,
    clusters,
    metadata: {
      totalNodes: g.metadata.totalNodes,
      totalEdges: g.metadata.totalEdges,
      clustersCount: g.clusters.length,
      builtAt: g.metadata.builtAt,
    },
  };

  return cachedSummary;
}
