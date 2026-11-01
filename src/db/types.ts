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

export interface KnowledgeItem {
  id?: string;
  userId: string;
  timestamp: Date;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  actionableTakeaway?: string;
}

export interface ActiveSession {
  userId: string;
  startedAt: Date;
  taskDescription: string;
  focusExpectedHours?: number;
  tags: string[];
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
  goldenMeans: {
    prioritization: number;
    documentation: number;
    waysToWork: number;
    timeManagement: number;
    variety: number;
    vitality: number;
    expressionism: number;
  };
  
  activePlugins: string[];
  updatedAt: Date;
}

