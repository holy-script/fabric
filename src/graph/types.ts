export type GraphNodeType = "concept" | "reel" | "heuristic" | "verdict" | "dimension";

export type GraphRelationType =
  | "explains"
  | "synthesizes"
  | "challenges"
  | "reinforces"
  | "applies_to"
  | "shares_tag";

export interface GraphNodeProperties {
  telegramStreamUrl?: string;
  telegramUrl?: string;
  streamUrl?: string;
  firestoreId?: string;
  category?: "insight" | "tool" | "strategy" | "win" | string;
  quadrant?: "Focus" | "Facts" | "Funds" | "Feedback" | string;
  author?: string;
  tags?: string[];
  sourceUrl?: string;
  sourceType?: string;
  actionableTakeaway?: string;
  notionUrl?: string;
  mediaType?: string;
  r2Key?: string;
  verdictAuthor?: string;
  attachedAt?: string;
  matchKeywords?: string[];
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  description: string;
  weight: number;
  properties: GraphNodeProperties;
}

export interface GraphEdgeProperties {
  commonTags?: string[];
  sharedCount?: number;
  direction?: "bidirectional" | "directed";
  context?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: GraphRelationType;
  weight: number;
  properties?: GraphEdgeProperties;
}

export interface GraphCluster {
  id: string;
  label: string;
  coreTheme: string;
  nodeIds: string[];
  topTags: string[];
  masterSynthesis?: string;
}

export interface KnowledgeGraphMetadata {
  totalNodes: number;
  totalEdges: number;
  builtAt: string;
  clusterCount?: number;
  reelsCount?: number;
  conceptsCount?: number;
  heuristicsCount?: number;
  dimensionsCount?: number;
  verdictsCount?: number;
  sourceBreakdown?: Record<string, number>;
  [key: string]: unknown;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  metadata: KnowledgeGraphMetadata;
}

export interface GraphSearchResult {
  query: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  matchedConcepts: GraphNode[];
  relevantClusters: GraphCluster[];
  totalMatches: number;
}

export interface GraphPathStep {
  from: GraphNode;
  to: GraphNode;
  relation: GraphRelationType;
  weight: number;
}

export interface GraphPathResult {
  found: boolean;
  start: string;
  end: string;
  path: GraphNode[];
  edges: GraphEdge[];
  steps: GraphPathStep[];
  totalWeight: number;
  explanation: string;
}

export interface ClusterDetailResult {
  cluster: GraphCluster;
  nodes: GraphNode[];
  edges: GraphEdge[];
  density: number;
  topConcepts: GraphNode[];
  quadrantBreakdown: Record<string, number>;
}
