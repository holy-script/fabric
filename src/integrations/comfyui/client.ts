import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type {
  ComfyGenerationOptions,
  ComfyGenerationResult,
  ComfyHealthStatus,
  ComfyHistoryResponse,
  ComfyModelList,
  ComfyPromptWorkflow,
  PromptSubmitRequest,
  PromptSubmitResponse,
} from "./types.js";

/**
 * Resolve the ComfyUI API host.
 * Defaults to http://127.0.0.1:8188 unless COMFYUI_HOST is provided.
 */
export function getComfyHost(hostOverride?: string): string {
  const host = hostOverride || process.env.COMFYUI_HOST || "http://127.0.0.1:8188";
  return host.replace(/\/+$/, "");
}

/**
 * Friendly startup instructions for Apple Silicon Mac & remote configurations.
 */
export const COMFY_SETUP_GUIDANCE = `
🚀 *How to Launch ComfyUI on Mac (Apple Silicon / Metal MPS):*
1. Clone & activate virtual environment:
   \`git clone https://github.com/comfyanonymous/ComfyUI.git\`
   \`cd ComfyUI && python3 -m venv venv && source venv/bin/activate\`
2. Install PyTorch with MPS acceleration & requirements:
   \`pip install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu\`
   \`pip install -r requirements.txt\`
3. Place a checkpoint in \`models/checkpoints/\` (e.g. SDXL Turbo, SD 1.5, or DreamShaper).
4. Launch with Apple Silicon optimizations:
   \`python main.py --force-fp16\`
5. Default address is \`http://127.0.0.1:8188\`.
   _If running remotely, add \`COMFYUI_HOST=http://<ip>:8188\` in your .env file._
`.trim();

/**
 * Checks if the ComfyUI instance is reachable and returns health/system diagnostics.
 */
export async function checkComfyHealth(hostOverride?: string): Promise<ComfyHealthStatus> {
  const host = getComfyHost(hostOverride);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    // Check system stats
    const statsRes = await fetch(`${host}/system_stats`, {
      signal: controller.signal,
    }).catch(() => null);

    // Check queue stats
    const queueRes = await fetch(`${host}/prompt`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);

    if (!statsRes || !statsRes.ok) {
      return {
        online: false,
        host,
        guidance: COMFY_SETUP_GUIDANCE,
      };
    }

    const statsData = (await statsRes.json()) as any;
    let queueRemaining = 0;

    if (queueRes && queueRes.ok) {
      try {
        const queueData = (await queueRes.json()) as any;
        queueRemaining = queueData?.exec_info?.queue_remaining ?? 0;
      } catch {
        // Queue status optional
      }
    }

    const device = statsData?.devices?.[0];
    const vramTotalMb = device?.vram_total
      ? Math.round(device.vram_total / (1024 * 1024))
      : undefined;
    const vramFreeMb = device?.vram_free
      ? Math.round(device.vram_free / (1024 * 1024))
      : undefined;

    return {
      online: true,
      host,
      vramInfo:
        vramTotalMb !== undefined && vramFreeMb !== undefined
          ? {
              totalMb: vramTotalMb,
              freeMb: vramFreeMb,
              deviceName: device?.name || "Apple Metal / Accelerator",
            }
          : undefined,
      systemInfo: statsData?.system
        ? {
            os: statsData.system.os || process.platform,
            pythonVersion: statsData.system.python_version,
            pytorchVersion: statsData.system.pytorch_version,
          }
        : undefined,
      queueRemaining,
    };
  } catch (err) {
    return {
      online: false,
      host,
      guidance: COMFY_SETUP_GUIDANCE,
    };
  }
}

/**
 * Lists available models (checkpoints, LoRAs, samplers) from the ComfyUI node graph registry.
 */
export async function listSystemModels(hostOverride?: string): Promise<ComfyModelList> {
  const host = getComfyHost(hostOverride);

  const result: ComfyModelList = {
    checkpoints: [],
    loras: [],
    samplers: [],
    schedulers: [],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    // Fetch checkpoint list from CheckpointLoaderSimple object info
    const ckptRes = await fetch(`${host}/object_info/CheckpointLoaderSimple`, {
      signal: controller.signal,
    }).catch(() => null);

    if (ckptRes && ckptRes.ok) {
      const data = (await ckptRes.json()) as any;
      const ckptOptions =
        data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
      if (Array.isArray(ckptOptions)) {
        result.checkpoints = ckptOptions;
      }
    }

    // Fetch LoRAs from LoraLoader if installed
    const loraRes = await fetch(`${host}/object_info/LoraLoader`, {
      signal: controller.signal,
    }).catch(() => null);

    if (loraRes && loraRes.ok) {
      const data = (await loraRes.json()) as any;
      const loraOptions = data?.LoraLoader?.input?.required?.lora_name?.[0];
      if (Array.isArray(loraOptions)) {
        result.loras = loraOptions;
      }
    }

    // Fetch Samplers & Schedulers
    const samplerRes = await fetch(`${host}/object_info/KSampler`, {
      signal: controller.signal,
    }).catch(() => null);

    if (samplerRes && samplerRes.ok) {
      const data = (await samplerRes.json()) as any;
      const samplerList = data?.KSampler?.input?.required?.sampler_name?.[0];
      const schedulerList = data?.KSampler?.input?.required?.scheduler?.[0];
      if (Array.isArray(samplerList)) result.samplers = samplerList;
      if (Array.isArray(schedulerList)) result.schedulers = schedulerList;
    }

    clearTimeout(timeout);
  } catch (err) {
    console.warn("Failed to fetch full ComfyUI object info:", err);
  }

  return result;
}

/**
 * Builds a standard txt2img ComfyUI workflow graph (SD1.5 / SDXL / Flux compatible).
 */
export function buildTxt2ImgWorkflow(
  prompt: string,
  options: ComfyGenerationOptions = {},
  checkpointName: string = "v1-5-pruned-emaonly.safetensors"
): ComfyPromptWorkflow {
  const seed =
    typeof options.seed === "number" && !isNaN(options.seed)
      ? options.seed
      : Math.floor(Math.random() * 1_000_000_000_000);

  const steps = options.steps && options.steps > 0 ? options.steps : 20;
  const cfg = options.cfg && options.cfg > 0 ? options.cfg : 7.0;
  const width = options.width && options.width > 0 ? options.width : 1024;
  const height = options.height && options.height > 0 ? options.height : 1024;
  const samplerName = options.samplerName || "euler";
  const scheduler = options.scheduler || "normal";
  const denoise = typeof options.denoise === "number" ? options.denoise : 1.0;
  const negativePrompt =
    options.negativePrompt ??
    "ugly, blurry, distorted, low quality, artifacts, watermark, signature, deformed limbs, extra fingers";

  const workflow: ComfyPromptWorkflow = {
    // 1: Checkpoint Loader
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: checkpointName,
      },
      _meta: { title: "Load Checkpoint" },
    },
    // 2: Positive Prompt
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: prompt,
        clip: ["1", 1],
      },
      _meta: { title: "CLIP Positive Prompt" },
    },
    // 3: Negative Prompt
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negativePrompt,
        clip: ["1", 1],
      },
      _meta: { title: "CLIP Negative Prompt" },
    },
    // 4: Latent Canvas
    "4": {
      class_type: "EmptyLatentImage",
      inputs: {
        width,
        height,
        batch_size: options.batchSize || 1,
      },
      _meta: { title: "Empty Latent" },
    },
    // 5: KSampler
    "5": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
      _meta: { title: "KSampler" },
    },
    // 6: VAE Decode
    "6": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["5", 0],
        vae: ["1", 2],
      },
      _meta: { title: "VAE Decode" },
    },
    // 7: Save Image
    "7": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "FabricOS",
        images: ["6", 0],
      },
      _meta: { title: "Save Image" },
    },
  };

  return workflow;
}

/**
 * Dispatches an image generation task to ComfyUI, waits for completion,
 * downloads the rendered image, and returns the local temporary file path.
 */
export async function generateImage(
  prompt: string,
  options: ComfyGenerationOptions = {},
  hostOverride?: string
): Promise<ComfyGenerationResult> {
  const host = getComfyHost(hostOverride);
  const startTime = Date.now();

  // 1. Verify health
  const health = await checkComfyHealth(host);
  if (!health.online) {
    throw new Error(
      `ComfyUI is unreachable at ${host}.\n\n${health.guidance || COMFY_SETUP_GUIDANCE}`
    );
  }

  // 2. Select checkpoint
  let checkpoint = options.checkpoint;
  if (!checkpoint) {
    const models = await listSystemModels(host);
    if (models.checkpoints.length > 0) {
      checkpoint = models.checkpoints[0];
    } else {
      checkpoint = "v1-5-pruned-emaonly.safetensors";
    }
  }

  // 3. Assemble workflow graph
  const seed =
    typeof options.seed === "number" && !isNaN(options.seed)
      ? options.seed
      : Math.floor(Math.random() * 1_000_000_000_000);
  const steps = options.steps && options.steps > 0 ? options.steps : 20;
  const cfg = options.cfg && options.cfg > 0 ? options.cfg : 7.0;
  const samplerName = options.samplerName || "euler";
  const scheduler = options.scheduler || "normal";

  const workflow = buildTxt2ImgWorkflow(
    prompt,
    {
      ...options,
      seed,
      steps,
      cfg,
      samplerName,
      scheduler,
    },
    checkpoint
  );

  const clientId = crypto.randomUUID();
  const payload: PromptSubmitRequest = {
    prompt: workflow,
    client_id: clientId,
  };

  // 4. Submit prompt
  const submitRes = await fetch(`${host}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const errorBody = await submitRes.text().catch(() => "");
    throw new Error(`ComfyUI submission rejected (${submitRes.status}): ${errorBody}`);
  }

  const submitData = (await submitRes.json()) as PromptSubmitResponse;
  const promptId = submitData.prompt_id;

  if (submitData.node_errors && Object.keys(submitData.node_errors).length > 0) {
    const errorDetails = JSON.stringify(submitData.node_errors, null, 2);
    throw new Error(`ComfyUI Node Configuration Error:\n${errorDetails}`);
  }

  // 5. Poll for completion via /history/{prompt_id}
  const timeoutMs = options.timeoutMs || 180_000; // 3 minutes timeout
  const pollIntervalMs = 1_000;
  const maxPolls = Math.ceil(timeoutMs / pollIntervalMs);

  let outputImageMeta: { filename: string; subfolder: string; type: string } | null = null;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const historyRes = await fetch(`${host}/history/${promptId}`).catch(() => null);
    if (!historyRes || !historyRes.ok) continue;

    const historyData = (await historyRes.json()) as ComfyHistoryResponse;
    const promptEntry = historyData?.[promptId];

    if (!promptEntry) continue;

    // Check for execution error
    if (promptEntry.status?.status_str === "error") {
      const messages = promptEntry.status.messages
        ? JSON.stringify(promptEntry.status.messages)
        : "Unknown generation error in ComfyUI execution.";
      throw new Error(`ComfyUI execution failed: ${messages}`);
    }

    // Look for image outputs
    if (promptEntry.outputs) {
      for (const nodeKey of Object.keys(promptEntry.outputs)) {
        const nodeOutput = promptEntry.outputs[nodeKey];
        if (nodeOutput.images && nodeOutput.images.length > 0) {
          const img = nodeOutput.images[0];
          outputImageMeta = {
            filename: img.filename,
            subfolder: img.subfolder || "",
            type: img.type || "output",
          };
          break;
        }
      }
    }

    if (outputImageMeta) {
      break;
    }
  }

  if (!outputImageMeta) {
    throw new Error(
      `ComfyUI generation timed out after ${Math.round(timeoutMs / 1000)}s (prompt ID: ${promptId}).`
    );
  }

  // 6. Download the generated image from /view
  const viewUrl = `${host}/view?filename=${encodeURIComponent(
    outputImageMeta.filename
  )}&subfolder=${encodeURIComponent(outputImageMeta.subfolder)}&type=${encodeURIComponent(
    outputImageMeta.type
  )}`;

  const imageRes = await fetch(viewUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download rendered image from ${viewUrl}: ${imageRes.statusText}`);
  }

  const arrayBuffer = await imageRes.arrayBuffer();
  const tempFilePath = path.join(
    os.tmpdir(),
    `fabric-comfy-${promptId}-${Date.now()}.png`
  );

  await fs.promises.writeFile(tempFilePath, Buffer.from(arrayBuffer));

  const generationDurationMs = Date.now() - startTime;

  return {
    promptId,
    imagePath: tempFilePath,
    filename: outputImageMeta.filename,
    subfolder: outputImageMeta.subfolder,
    type: outputImageMeta.type,
    seed,
    steps,
    cfg,
    sampler: samplerName,
    scheduler,
    checkpoint,
    generationDurationMs,
  };
}
