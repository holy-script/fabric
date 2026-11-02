import fs from "fs";
import path from "path";
import os from "os";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const TEMP_TTS_DIR = path.resolve(os.tmpdir(), "fabric_tts");
if (!fs.existsSync(TEMP_TTS_DIR)) {
  fs.mkdirSync(TEMP_TTS_DIR, { recursive: true });
}

export type SupportedVoice =
  | "en-US-ChristopherNeural" // Deep, grounded, philosophical
  | "en-US-GuyNeural"         // Conversational, direct, energetic
  | "en-IN-PrabhatNeural"     // Indian English, articulate, crisp
  | "en-US-JennyNeural";      // Warm, natural, balanced

export const DEFAULT_VOICE: SupportedVoice = "en-US-ChristopherNeural";

/**
 * Strips Telegram markdown symbols, code blocks, emojis and raw URLs so TTS reads naturally.
 */
function cleanTextForSpeech(raw: string): string {
  return raw
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "Code omitted.")
    .replace(/`([^`]+)`/g, "$1")
    // Remove Markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove standalone URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove bold/italic/strikethrough markers
    .replace(/[*_~]/g, "")
    // Remove header symbols and dividers
    .replace(/^[#>-]+\s*/gm, "")
    .replace(/━+/g, "")
    // Collapse excess whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates an expressive MP3 audio file from text using Edge Neural TTS.
 */
export async function generateSpeechAudio(
  text: string,
  voice: SupportedVoice = DEFAULT_VOICE
): Promise<string> {
  const clean = cleanTextForSpeech(text);
  if (!clean || clean.length < 2) {
    throw new Error("Text too short for speech synthesis");
  }

  // Truncate if exceptionally long to prevent timeout (max ~1200 chars for voice notes)
  const clipped = clean.length > 1200 ? clean.slice(0, 1150) + "... and that completes the summary." : clean;

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const outPath = path.join(TEMP_TTS_DIR, `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
  const { audioStream } = tts.toStream(clipped);

  const writeStream = fs.createWriteStream(outPath);
  audioStream.pipe(writeStream);

  await new Promise((resolve, reject) => {
    writeStream.on("close", () => resolve(outPath));
    audioStream.on("error", reject);
    writeStream.on("error", reject);
  });

  return outPath;
}
