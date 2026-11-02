export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type TaskActionType = "browser" | "ai_reasoning" | "calculation" | "export" | "notify";

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

export interface ExecutorOptions {
  customHandlers?: Record<string, StepHandler>;
  maxConcurrency?: number;
  continueOnError?: boolean;
  onStepStart?: (step: TaskStep) => void | Promise<void>;
  onStepComplete?: (step: TaskStep, result: any) => void | Promise<void>;
  onStepFailed?: (step: TaskStep, error: Error) => void | Promise<void>;
}
