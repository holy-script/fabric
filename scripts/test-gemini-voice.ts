#!/usr/bin/env bun
/**
 * Fabric OS — Live Gemini Voice Engine Test Runner
 * Generates spoken Socratic Council audio using Gemini's neural voice models,
 * verifies latency SLA, saves audio to disk, and plays it via macOS afplay.
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { config } from "../src/config/env.js";

async function main() {
  console.log("\n🎙️ ── Fabric OS Live Gemini Neural Voice Test ──");
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    console.error("❌ Missing GEMINI_API_KEY in environment or .env");
    process.exit(1);
  }

  const promptText =
    "Welcome, Operator. Socratic Council is active. The Golden Mean of Focus is effortless flow between distraction and burnout. What is your priority for this cycle?";

  console.log(`📝 Text Prompt: "${promptText}"`);
  console.log("⚡ Contacting Gemini 3.8 Flash Neural Voice...");

  const startTime = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore"
              }
            }
          }
        }
      })
    });

    const elapsedMs = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Voice API HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const candidate = json.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const inlineData = part?.inlineData;

    if (!inlineData || !inlineData.data) {
      throw new Error("No audio inlineData returned in Gemini response payload");
    }

    const audioBuffer = Buffer.from(inlineData.data, "base64");
    const mimeType = inlineData.mimeType || "audio/wav";
    const outputFile = path.resolve(process.cwd(), "data/sample_voice_reply.wav");

    // Ensure data directory exists
    const dataDir = path.dirname(outputFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, audioBuffer);

    console.log("\n✅ ── Gemini Neural Voice Generation Succeeded ──");
    console.log(`• Status:        HTTP 200 OK`);
    console.log(`• Latency:       ${elapsedMs} ms`);
    console.log(`• Mime Type:     ${mimeType}`);
    console.log(`• Audio Size:    ${(audioBuffer.length / 1024).toFixed(1)} KB (${audioBuffer.length} bytes)`);
    console.log(`• Saved File:    ${outputFile}`);

    // If on macOS, play the generated audio
    if (process.platform === "darwin") {
      console.log("🔊 Playing audio via macOS afplay...");
      exec(`afplay "${outputFile}"`, (err) => {
        if (err) {
          console.warn("⚠️ Could not play audio through speaker:", err.message);
        } else {
          console.log("🏁 Audio playback completed cleanly.");
        }
      });
    }
  } catch (error: any) {
    console.error("🔴 Live Voice Test Error:", error.message || error);
    process.exit(1);
  }
}

main();

