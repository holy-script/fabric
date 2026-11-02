/**
 * ComfyUI Type Definitions for Fabric Meta-OS
 */

// Connection slot reference: [node_id_string, output_slot_index]
export type ComfyNodeConnection = [string, number];

export interface ComfyNode {
  class_type: string;
  inputs: Record<string, any>;
  _meta?: {
    title?: string;
  };
}

// Complete Prompt Workflow Graph submitted to POST /prompt
export type ComfyPromptWorkflow = Record<string, ComfyNode>;

// Standard Node Input Interfaces
export interface KSamplerInputs {
  seed: number;
  steps: number;
  cfg: number;
  sampler_name: string;
  scheduler: string;
  denoise: number;
  model: ComfyNodeConnection;
  positive: ComfyNodeConnection;
  negative: ComfyNodeConnection;
  latent_image: ComfyNodeConnection;
}

export interface CLIPTextEncodeInputs {
  text: string;
  clip: ComfyNodeConnection;
}

export interface VAEDecodeInputs {
  samples: ComfyNodeConnection;
  vae: ComfyNodeConnection;
}

export interface SaveImageInputs {
  filename_prefix: string;
  images: ComfyNodeConnection;
}

export interface EmptyLatentImageInputs {
  width: number;
  height: number;
  batch_size: number;
}

export interface CheckpointLoaderSimpleInputs {
  ckpt_name: string;
}

// Prompt Submission Types
export interface PromptSubmitRequest {
  prompt: ComfyPromptWorkflow;
  client_id?: string;
  extra_data?: Record<string, any>;
}

export interface PromptSubmitResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, any>;
}

// Queue Status Types
export interface ComfyQueueItem {
  prompt_id: string;
  number: number;
  prompt: [number, string, ComfyPromptWorkflow, Record<string, any>, string[]];
}

export interface ComfyQueueStatus {
  queue_running: ComfyQueueItem[];
  queue_pending: ComfyQueueItem[];
}

export interface ComfySystemStats {
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
    pytorch_version?: string;
  };
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;
}

// Prompt History & Image Output Types
export interface ComfyImageOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyNodeOutput {
  images?: ComfyImageOutput[];
  [key: string]: any;
}

export interface ComfyPromptHistory {
  prompt: [number, string, ComfyPromptWorkflow, Record<string, any>, string[]];
  outputs: Record<string, ComfyNodeOutput>;
  status?: {
    status_str: string;
    completed: boolean;
    messages?: any[];
  };
}

export type ComfyHistoryResponse = Record<string, ComfyPromptHistory>;

// WebSocket Message Types
export type ComfyWsMessageType =
  | "status"
  | "executing"
  | "progress"
  | "executed"
  | "execution_start"
  | "execution_cached"
  | "execution_error";

export interface ComfyWsMessage {
  type: ComfyWsMessageType;
  data: {
    node?: string;
    prompt_id?: string;
    value?: number;
    max?: number;
    status?: {
      exec_info: {
        queue_remaining: number;
      };
    };
    output?: ComfyNodeOutput;
    [key: string]: any;
  };
}

// Client Options & Output
export interface ComfyGenerationOptions {
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  checkpoint?: string;
  batchSize?: number;
  denoise?: number;
  timeoutMs?: number;
}

export interface ComfyGenerationResult {
  promptId: string;
  imagePath: string; // local temp file path
  filename: string;
  subfolder: string;
  type: string;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  checkpoint: string;
  generationDurationMs: number;
}

export interface ComfyHealthStatus {
  online: boolean;
  host: string;
  vramInfo?: {
    totalMb: number;
    freeMb: number;
    deviceName: string;
  };
  systemInfo?: {
    os: string;
    pythonVersion?: string;
    pytorchVersion?: string;
  };
  queueRemaining?: number;
  guidance?: string;
}

export interface ComfyModelList {
  checkpoints: string[];
  loras: string[];
  samplers?: string[];
  schedulers?: string[];
}
