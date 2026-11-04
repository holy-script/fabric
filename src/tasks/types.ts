export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type TaskActionType = "browser" | "ai_reasoning" | "calculation" | "export" | "notify" | "swarm";

export type SwarmRole = "recon" | "synthesis" | "critic" | "publisher";

export interface SwarmArtifact {
  role: SwarmRole;
  status: "approved" | "rejected" | "completed" | "in_progress";
  confidence?: number;
  findings?: any;
  proposal?: any;
  critique?: string;
  feedback?: string;
  deliverable?: any;
  output?: any;
  timestamp: string;
  metrics?: {
    durationMs?: number;
    tokens?: number;
  };
  [key: string]: any;
}

export interface SwarmConfig {
  roles?: SwarmRole[];
  minCriticConfidence?: number;
  maxCriticRetries?: number;
}

export interface SwarmResult {
  consensus: boolean;
  approvedByCritic: boolean;
  criticConfidence: number;
  iterations: number;
  artifacts: Record<string, SwarmArtifact | any>;
  history: SwarmArtifact[];
  finalOutput?: any;
}

export interface CostEstimate {
  focusHours?: number;
  tokens?: number;
}

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  dependencies: string[]; // array of step IDs
  actionType: TaskActionType;
  payload: Record<string, any>;
  status: TaskStatus;
  result?: any;
  error?: string;
  costEstimate?: CostEstimate;
  retries?: number;
  maxRetries?: number;
  startedAt?: Date | string;
  completedAt?: Date | string;
  isSwarm?: boolean;
  swarmRole?: SwarmRole;
  swarmRoles?: SwarmRole[];
  swarmConfig?: SwarmConfig;
  swarmResult?: SwarmResult;
}

export interface TaskTimelineEvent {
  stepId: string;
  role?: SwarmRole;
  event:
    | "step_start"
    | "step_complete"
    | "step_failed"
    | "swarm_handoff"
    | "critic_rejected"
    | "critic_approved"
    | "refinement_loop";
  timestamp: string;
  details?: Record<string, any>;
}

export interface TaskExecutionMetrics {
  totalDurationMs?: number;
  totalRetries?: number;
  totalTokens?: number;
  swarmHandoffs?: number;
  criticRejections?: number;
  stepMetrics?: Record<string, { durationMs: number; retries?: number }>;
}

export interface TaskPlan {
  id: string;
  goal: string;
  steps: TaskStep[];
  createdAt: Date | string;
  updatedAt: Date | string;
  status: TaskStatus;
  metadata?: Record<string, any>;
  totalCostEstimate?: CostEstimate;
  timeline?: TaskTimelineEvent[];
  metrics?: TaskExecutionMetrics;
}

export interface ExecutionState {
  activePlanId: string;
  completedStepIds: string[];
  blackboard: Record<string, any>;
  failedStepIds?: string[];
  runningStepIds?: string[];
  skippedStepIds?: string[];
}

export type StepHandler = (
  step: TaskStep,
  context: {
    blackboard: Record<string, any>;
    plan: TaskPlan;
    state: ExecutionState;
  }
) => Promise<any>;

export interface SwarmHandlerContext {
  role: SwarmRole;
  blackboard: Record<string, any>;
  plan: TaskPlan;
  state: ExecutionState;
  previousArtifacts: Record<string, any>;
  criticFeedback?: string;
  iteration: number;
}

export type SwarmRoleHandler = (
  step: TaskStep,
  context: SwarmHandlerContext
) => Promise<any>;

export interface ExecutorOptions {
  customHandlers?: Record<string, StepHandler>;
  swarmHandlers?: Partial<Record<SwarmRole, SwarmRoleHandler>>;
  maxConcurrency?: number;
  continueOnError?: boolean;
  onStepStart?: (step: TaskStep) => void | Promise<void>;
  onStepComplete?: (step: TaskStep, result: any) => void | Promise<void>;
  onStepFailed?: (step: TaskStep, error: Error) => void | Promise<void>;
  onSwarmHandoff?: (step: TaskStep, fromRole: SwarmRole | null, toRole: SwarmRole, artifact: any) => void | Promise<void>;
}
