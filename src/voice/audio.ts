/**
 * Fabric OS — Audio Packet & Buffer Utilities
 * Provides high-performance encoding, decoding, PCM-to-WAV transformation,
 * synthetic signal generation, and audio waveform RMS energy calculation.
 */

/**
 * Creates a valid 44-byte RIFF WAV header wrapped around raw 16-bit PCM audio.
 */
export function pcm16ToWav(
  pcmData: Buffer | Uint8Array,
  sampleRate: number = 24000,
  channels: number = 1
): Buffer {
  const pcmBuf = Buffer.isBuffer(pcmData) ? pcmData : Buffer.from(pcmData);
  const dataByteLength = pcmBuf.length;
  const header = Buffer.alloc(44);

  const byteRate = sampleRate * channels * 2; // 16-bit = 2 bytes per sample
  const blockAlign = channels * 2;

  // 1. RIFF chunk descriptor
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataByteLength, 4); // File size - 8
  header.write("WAVE", 8);

  // 2. "fmt " sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM = 16
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (Linear PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample = 16

  // 3. "data" sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataByteLength, 40);

  return Buffer.concat([header, pcmBuf]);
}

/**
 * Parses a WAV buffer and extracts the raw PCM16 audio data and header parameters.
 */
export function wavToPcm16(wavBuffer: Buffer): {
  pcmData: Buffer;
  sampleRate: number;
  channels: number;
  durationMs: number;
} {
  if (wavBuffer.length < 44) {
    throw new Error("Invalid WAV buffer: shorter than 44-byte RIFF header");
  }

  const riff = wavBuffer.toString("utf8", 0, 4);
  const wave = wavBuffer.toString("utf8", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    // If not standard WAV, treat buffer directly as raw PCM
    return {
      pcmData: wavBuffer,
      sampleRate: 24000,
      channels: 1,
      durationMs: calculateAudioDurationMs(wavBuffer.length, 24000, 1),
    };
  }

  // Scan chunks to locate 'fmt ' and 'data'
  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let pcmOffset = 44;
  let pcmLength = wavBuffer.length - 44;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString("utf8", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      channels = wavBuffer.readUInt16LE(offset + 10);
      sampleRate = wavBuffer.readUInt32LE(offset + 12);
    } else if (chunkId === "data") {
      pcmOffset = offset + 8;
      pcmLength = Math.min(chunkSize, wavBuffer.length - pcmOffset);
      break;
    }
    offset += 8 + chunkSize;
  }

  const pcmData = wavBuffer.subarray(pcmOffset, pcmOffset + pcmLength);
  const durationMs = calculateAudioDurationMs(pcmData.length, sampleRate, channels);

  return {
    pcmData,
    sampleRate,
    channels,
    durationMs,
  };
}

/**
 * Generates synthetic PCM 16-bit audio sine wave (ideal for fallback, telemetry cues, or offline testing).
 */
export function generateSineWavePcm16(
  frequencyHz: number = 440,
  durationMs: number = 200,
  sampleRate: number = 24000,
  volume: number = 0.5
): Buffer {
  const totalSamples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = Buffer.alloc(totalSamples * 2);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequencyHz * t) * volume;
    // Scale to signed 16-bit integer [-32768, 32767]
    const clamped = Math.max(-1, Math.min(1, sample));
    const int16Val = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16Val, i * 2);
  }

  return buffer;
}

/**
 * Calculates audio duration in milliseconds based on byte length, sample rate, and channels.
 */
export function calculateAudioDurationMs(
  byteLength: number,
  sampleRate: number = 24000,
  channels: number = 1,
  bitDepth: number = 16
): number {
  const bytesPerSample = (bitDepth / 8) * channels;
  if (bytesPerSample === 0 || sampleRate === 0) return 0;
  const numSamples = byteLength / bytesPerSample;
  return Math.round((numSamples / sampleRate) * 1000);
}

/**
 * Computes Root Mean Square (RMS) energy of PCM16 buffer (normalized 0.0 - 1.0).
 */
export function calculateRmsEnergy(pcmBuffer: Buffer): number {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  if (sampleCount === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2) / 32768.0;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
}

/**
 * Converts Buffer to Base64
 */
export function bufferToBase64(buf: Buffer): string {
  return buf.toString("base64");
}

/**
 * Converts Base64 to Buffer
 */
export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}
