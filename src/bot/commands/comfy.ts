import fs from "fs";
import { Context, InputFile } from "grammy";
import {
  checkComfyHealth,
  generateImage,
  listSystemModels,
  COMFY_SETUP_GUIDANCE,
  getComfyHost,
} from "../../integrations/comfyui/client.js";
import type { ComfyGenerationOptions } from "../../integrations/comfyui/types.js";

const PREBAKED_PROMPTS = [
  "Biomechanical cyber-lotus blooming in a dark obsidian chamber, raytracing, neon violet accents, highly detailed, 8k",
  "Solarpunk orbital research station with vertical green hydroponic farms overlooking Earth, cinematic golden hour lighting, photorealistic",
  "Minimalist zen Japanese rock garden on Mars under a giant geodesic dome, starry cosmos overhead, misty atmospheric lighting, 8k wallpaper",
  "Cybernetic synthesizer workstation surrounded by holographic telemetry HUDs and warm analog vacuum tubes, moody cyberpunk aesthetic",
];

/**
 * Parses user input into prompt text and optional generation parameters.
 * Supports flags: --w, --h, --steps, --seed, --cfg, --neg, --ckpt, --sampler, --scheduler
 */
function parseComfyArgs(rawText: string): {
  prompt: string;
  options: ComfyGenerationOptions;
} {
  const options: ComfyGenerationOptions = {};

  // Extract negative prompt if specified
  let text = rawText;
  const negMatch = text.match(/--(?:neg|negative)\s+("([^"]+)"|'([^']+)'|([^\s-]+(?:\s+[^\s-]+)*))/i);
  if (negMatch) {
    options.negativePrompt = negMatch[2] || negMatch[3] || negMatch[4] || negMatch[1];
    text = text.replace(negMatch[0], " ");
  }

  // Extract width
  const widthMatch = text.match(/--(?:w|width)\s+(\d+)/i);
  if (widthMatch) {
    options.width = parseInt(widthMatch[1], 10);
    text = text.replace(widthMatch[0], " ");
  }

  // Extract height
  const heightMatch = text.match(/--(?:h|height)\s+(\d+)/i);
  if (heightMatch) {
    options.height = parseInt(heightMatch[1], 10);
    text = text.replace(heightMatch[0], " ");
  }

  // Extract steps
  const stepsMatch = text.match(/--steps\s+(\d+)/i);
  if (stepsMatch) {
    options.steps = parseInt(stepsMatch[1], 10);
    text = text.replace(stepsMatch[0], " ");
  }

  // Extract seed
  const seedMatch = text.match(/--seed\s+(\d+)/i);
  if (seedMatch) {
    options.seed = parseInt(seedMatch[1], 10);
    text = text.replace(seedMatch[0], " ");
  }

  // Extract CFG
  const cfgMatch = text.match(/--cfg\s+([0-9.]+)/i);
  if (cfgMatch) {
    options.cfg = parseFloat(cfgMatch[1]);
    text = text.replace(cfgMatch[0], " ");
  }

  // Extract checkpoint model
  const ckptMatch = text.match(/--(?:ckpt|model)\s+([^\s]+)/i);
  if (ckptMatch) {
    options.checkpoint = ckptMatch[1];
    text = text.replace(ckptMatch[0], " ");
  }

  // Extract sampler
  const samplerMatch = text.match(/--sampler\s+([^\s]+)/i);
  if (samplerMatch) {
    options.samplerName = samplerMatch[1];
    text = text.replace(samplerMatch[0], " ");
  }

  // Clean prompt text
  const cleanedPrompt = text.replace(/\s+/g, " ").trim();

  return {
    prompt: cleanedPrompt,
    options,
  };
}

/**
 * Handle Telegram bot `/comfy` command.
 */
export async function handleComfy(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const rawArgs = ctx.message?.text?.replace(/^\/comfy\s*/i, "").trim() || "";

  // 1. Status inspection mode: `/comfy status`
  if (rawArgs.toLowerCase() === "status") {
    const statusMsg = await ctx.reply("🔍 *Probing ComfyUI Generative Node...*", {
      parse_mode: "Markdown",
    });

    const host = getComfyHost();
    const health = await checkComfyHealth();

    if (!health.online) {
      const offlineMsg =
        `🔴 *ComfyUI Generative Node: OFFLINE*\n\n` +
        `Target Host: \`${host}\`\n\n` +
        `The local diffusion backend is currently unreachable.\n\n` +
        COMFY_SETUP_GUIDANCE +
        `\n\n*Suggested Creative Prompts to test once online:*\n` +
        PREBAKED_PROMPTS.map((p, i) => `${i + 1}. \`/comfy ${p}\``).join("\n\n");

      await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, offlineMsg, {
        parse_mode: "Markdown",
      });
      return;
    }

    const models = await listSystemModels();

    const ckptList =
      models.checkpoints.length > 0
        ? models.checkpoints.map((c) => `• \`${c}\``).join("\n")
        : "_None detected in models/checkpoints/_";

    const loraList =
      models.loras.length > 0
        ? models.loras.map((l) => `• \`${l}\``).join("\n")
        : "_No LoRAs detected_";

    const vramInfo = health.vramInfo
      ? `${health.vramInfo.freeMb} MB free / ${health.vramInfo.totalMb} MB total (${health.vramInfo.deviceName})`
      : "Accelerated Local Engine (Metal/MPS)";

    const onlineMsg =
      `🟢 *ComfyUI Generative Node: ONLINE*\n\n` +
      `🌐 *Host:* \`${health.host}\`\n` +
      `⚡ *Device:* ${vramInfo}\n` +
      `🖥️ *OS:* ${health.systemInfo?.os || "macOS"} | Python: \`${health.systemInfo?.pythonVersion || "active"}\`\n` +
      `📥 *Queue Remaining:* ${health.queueRemaining ?? 0}\n\n` +
      `*Installed Checkpoints (${models.checkpoints.length}):*\n${ckptList}\n\n` +
      `*Installed LoRAs (${models.loras.length}):*\n${loraList}\n\n` +
      `*Quick Test:*\n\`/comfy ${PREBAKED_PROMPTS[0]}\``;

    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, onlineMsg, {
      parse_mode: "Markdown",
    });
    return;
  }

  // 2. Help mode: empty `/comfy`
  if (!rawArgs) {
    const host = getComfyHost();
    const helpMsg =
      `🎨 *FABRIC COMFYUI GENERATIVE BRIDGE*\n\n` +
      `Render high-fidelity generative imagery locally on your Apple Silicon Mac or dedicated GPU.\n\n` +
      `*Usage:*\n` +
      `• \`/comfy <prompt>\` — Generate an image from prompt\n` +
      `• \`/comfy status\` — Check node health, VRAM, and loaded models\n\n` +
      `*Parameter Flags (Optional):*\n` +
      `• \`--w <px>\` / \`--h <px>\` — Dimensions (default 1024x1024)\n` +
      `• \`--steps <n>\` — Sampling steps (default 20)\n` +
      `• \`--cfg <n>\` — Classifier Free Guidance (default 7.0)\n` +
      `• \`--seed <n>\` — Specific seed for reproducible synthesis\n` +
      `• \`--neg <prompt>\` — Custom negative prompt\n` +
      `• \`--ckpt <name>\` — Specify model checkpoint\n\n` +
      `*Configured Host:* \`${host}\`\n\n` +
      `*Spark Ideas (tap or copy to try):*\n` +
      PREBAKED_PROMPTS.map((p, i) => `${i + 1}. \`/comfy ${p}\``).join("\n\n");

    await ctx.reply(helpMsg, { parse_mode: "Markdown" });
    return;
  }

  // 3. Image Generation Mode
  const { prompt: promptText, options } = parseComfyArgs(rawArgs);

  if (!promptText) {
    await ctx.reply("⚠️ Please provide a prompt description for ComfyUI to render.");
    return;
  }

  // Check health first
  const host = getComfyHost();
  const health = await checkComfyHealth();

  if (!health.online) {
    const offlineMsg =
      `🔴 *ComfyUI Generative Node Offline*\n\n` +
      `Fabric could not connect to ComfyUI at \`${host}\`.\n\n` +
      COMFY_SETUP_GUIDANCE +
      `\n\n` +
      `💡 *Saved Prompt:*\n\`${promptText}\`\n\n` +
      `_Once ComfyUI is running, re-send your prompt to render immediately!_`;

    await ctx.reply(offlineMsg, { parse_mode: "Markdown" });
    return;
  }

  // Display initial generating status pill
  const promptPreview =
    promptText.length > 80 ? `${promptText.substring(0, 77)}...` : promptText;

  const statusMsg = await ctx.reply(
    `🎨 *ComfyUI Node Engaged...*\n\n` +
      `💭 *Prompt:* _"${promptPreview}"_\n` +
      `⏳ _Sampling latent noise via ${health.vramInfo?.deviceName || "Local GPU"}..._`,
    { parse_mode: "Markdown" }
  );

  let tempImagePath: string | null = null;

  try {
    const result = await generateImage(promptText, options);
    tempImagePath = result.imagePath;

    const width = options.width || 1024;
    const height = options.height || 1024;
    const durationSec = (result.generationDurationMs / 1000).toFixed(1);

    const caption =
      `🎨 *ComfyUI Neural Synthesis*\n\n` +
      `💭 *Prompt:* ${promptText}\n` +
      (options.negativePrompt ? `🚫 *Neg:* \`${options.negativePrompt}\`\n` : "") +
      `⚙️ *Model:* \`${result.checkpoint}\`\n` +
      `📐 *Resolution:* ${width}x${height} | *Steps:* ${result.steps} | *CFG:* ${result.cfg}\n` +
      `🎲 *Seed:* \`${result.seed}\` | ⏱️ *Time:* ${durationSec}s\n` +
      `🔮 *Engine:* ComfyUI (Local Silicon MPS / CUDA)`;

    // Reply with the generated photo
    await ctx.replyWithPhoto(new InputFile(result.imagePath), {
      caption,
      parse_mode: "Markdown",
    });

    // Remove the generating status message
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
  } catch (error) {
    console.error("ComfyUI generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ *ComfyUI Generation Failed:*\n\n${errorMessage}`,
      { parse_mode: "Markdown" }
    ).catch(async () => {
      await ctx.reply(`❌ *ComfyUI Generation Failed:*\n\n${errorMessage}`);
    });
  } finally {
    // Automatically clean up the temp image file
    if (tempImagePath) {
      await fs.promises.unlink(tempImagePath).catch(() => {});
    }
  }
}
