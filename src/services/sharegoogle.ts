/**
 * Google AI Mode Share Extractor (share.google/aimode/...)
 * Decodes client-side encrypted Google AI Mode share URLs from the server-rendered fallback
 * to extract the full prompt, multi-step blueprint, and structured response.
 */

import fs from "fs";
import path from "path";

export interface DecodedAiModeShare {
  url: string;
  shareId: string;
  prompt: string;
  response: string;
  rawText: string;
  sourceFilePath?: string;
}

const SOURCES_DIR = path.resolve(process.cwd(), "data/notebooklm_sources");

export async function extractGoogleAiModeShare(url: string): Promise<DecodedAiModeShare | null> {
  const matchId = url.match(/share\.google\/aimode\/([a-zA-Z0-9_-]+)/);
  if (!matchId) return null;

  const shareId = matchId[1];

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    const html = await res.text();
    const queryMatch = html.match(/href="\/search\?q=([^"&]+)/);

    if (!queryMatch) {
      return null;
    }

    const fullDecoded = decodeURIComponent(queryMatch[1].replace(/\+/g, " ")).trim();

    // The first line or paragraph is typically the original prompt
    const parts = fullDecoded.split(/\n\s*\n/);
    const prompt = parts[0]?.trim() || fullDecoded.slice(0, 80);
    const response = parts.slice(1).join("\n\n").trim() || fullDecoded;

    // Persist as a NotebookLM-ready study source
    if (!fs.existsSync(SOURCES_DIR)) {
      fs.mkdirSync(SOURCES_DIR, { recursive: true });
    }

    const safeTitle = prompt
      .slice(0, 40)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    const fileName = `Google_AI_Mode_${safeTitle || shareId}.md`;
    const filePath = path.join(SOURCES_DIR, fileName);

    const mdContent = `# 🌐 Google AI Mode Synthesis: ${prompt}
> **Source Link:** [${url}](${url})  
> **Extracted by:** Fabric OS Cognitive Bridge  
> **Archived At:** ${new Date().toISOString()}  

---

## 🎯 Master Prompt
> ${prompt}

---

## 🏛️ Comprehensive Generative Blueprint & Plan
${response}

---

## 🎙️ NotebookLM Audio Overview Prompt
\`\`\`text
Act as two expert mentors breaking down this 30-day mastery blueprint for "${prompt}".
Explain the first-principles cognitive progression from week 1 to week 4.
Highlight the biggest time sinks, trap avoidance tactics, and high-leverage daily routines.
\`\`\`
`;

    fs.writeFileSync(filePath, mdContent, "utf-8");

    return {
      url,
      shareId,
      prompt,
      response,
      rawText: fullDecoded,
      sourceFilePath: filePath,
    };
  } catch (err) {
    console.error(`[ShareGoogle] Failed to decode ${url}:`, err);
    return null;
  }
}

