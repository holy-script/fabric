export type TradeType = "builder" | "learner" | "automation";

export interface Trade {
  id?: string;
  userId: string;
  timestamp: Date;
  moduleName: string;
  tradeType: TradeType;
  
  // Focus (Time)
  focusExpectedHours?: number;
  focusActualHours: number;
  
  // Facts (Knowledge)
  factsInput?: string;
  factsYield: string;
  
  // Funds (Money / Resources)
  fundsCost: number;
  fundsYield: number;
  
  // Wellbeing / Energy delta (-5 to +5)
  energyDelta: number;
  
  tags: string[];
  notes?: string;
  pluginId?: string;
}

export type KnowledgeCategory = "win" | "gotcha" | "tool" | "strategy" | "insight";

export interface UserReflection {
  text: string;
  audioUrl?: string;
  timestamp: Date;
}

export interface KnowledgeItem {
  id?: string;
  userId: string;
  timestamp: Date;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  actionableTakeaway?: string;
  sourceUrl?: string;
  sourceType?: string;
  author?: string;
  quadrant?: string;
  streamUrl?: string;
  r2NodeId?: string;
  r2Key?: string;
  mediaType?: "video" | "audio" | "instagram" | "youtube" | string;
  userConclusions?: string;
  userReflections?: UserReflection[];
}

export interface ActiveSession {
  userId: string;
  startedAt: Date;
  taskDescription: string;
  focusExpectedHours?: number;
  tags: string[];
}

export interface GoalItem {
  id?: string;
  userId: string;
  title: string;
  targetMetric: string;
  targetFocusHours?: number;
  reward: string;
  isUnlocked: boolean;
  unlockedAt?: Date;
  createdAt: Date;
}

export interface AristotelianScores {
  prioritization: number;
  documentation: number;
  waysToWork: number;
  timeManagement: number;
  variety: number;
  goalsAndRewards?: number;
  portfolioGrowth?: number;
  skillHorizon?: number;
  rapidPrototyping?: number;
  expressionism: number;
  vitality?: number;
  logic?: number;
  [key: string]: number | undefined;
}

export interface UserState {
  userId: string;
  totalFocusHours: number;
  totalFactsAcquired: number;
  totalFundsSpent: number;
  totalFundsYield: number;
  averageEnergyDelta: number;
  
  // Aristotle Mean Scale scores (-5 to +5)
  // 0 = Golden Mean, negative = deficiency, positive = excess
  goldenMeans: AristotelianScores;
  
  activePlugins: string[];
  lastAudit?: Date;
  updatedAt: Date;
}

