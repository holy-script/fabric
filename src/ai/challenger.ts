import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash-lite",
  generationConfig: {
    responseMimeType: "application/json",
  },
});

export interface SocraticChallenge {
  challenge: string;
  provocativeQuestion: string;
  counterPerspective: string;
}

const SYSTEM_SOCRATIC_CHALLENGER = `You are the Socratic Challenger Agent in Fabric OS, an intellectual sparring partner inspired by the classical Socratic elenchus and Nassim Nicholas Taleb's antifragility.

Your core traits:
1. Anti-Sycophancy: Never flatter, patronize, or sycophantically validate the user's conclusion. Do not say "Great point", "I agree", or "That is wise".
2. Antifragile Stress-Testing: Seek the hidden vulnerabilities, second-order effects, boundary conditions, survivorship biases, or unstated assumptions where their verdict completely breaks down.
3. Via Negativa & Inversion: Uncover what happens if the inverse is true, or what unconsidered fragility/downside is being introduced.
4. Precision & Brevity: Keep criticisms punchy, philosophically incisive, and intellectually demanding.

You will receive:
- Knowledge Card / Topic: The subject matter context.
- Card Context / Takeaway: The baseline idea or advice from the source material (if available).
- User Conclusion / Verdict: The assertion or rule formulated by the user.

You must output a strictly valid JSON object with exactly these three keys:
{
  "challenge": "A 1-2 sentence sharp critique exposing a blindspot, boundary condition, or hidden fragility in the user's verdict.",
  "provocativeQuestion": "An incisive question forcing the user to define exactly when and how their rule fails, or where adhering to it causes catastrophe.",
  "counterPerspective": "An alternative mental model or via negativa inversion challenging their foundational premise."
}`;

function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

/**
 * Generates an antifragile Socratic challenge against a user's reflection verdict.
 */
export async function generateSocraticChallenge(
  topicOrCardTitle: string,
  userConclusion: string,
  contextTakeaway?: string
): Promise<SocraticChallenge> {
  const contextStr = contextTakeaway
    ? `Card Context / Takeaway:\n${contextTakeaway}\n\n`
    : "";

  const prompt = `${SYSTEM_SOCRATIC_CHALLENGER}

Topic / Card Title: "${topicOrCardTitle}"
${contextStr}User Conclusion: "${userConclusion}"

Produce the 3-field JSON challenge now:`;

  try {
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    const cleaned = cleanJsonOutput(text);
    const parsed = JSON.parse(cleaned);

    return {
      challenge:
        parsed.challenge ||
        "Every mental model is fragile when generalized beyond its operating envelope.",
      provocativeQuestion:
        parsed.provocativeQuestion ||
        "Under what conditions does this principle produce the exact opposite of your desired outcome?",
      counterPerspective:
        parsed.counterPerspective ||
        "Consider the via negativa inversion: what fragility are you introducing by optimizing for this?",
    };
  } catch (error) {
    console.error("Error generating Socratic challenge:", error);
    return {
      challenge:
        "Every rigid maxim creates a blindspot proportional to the conviction with which it is held.",
      provocativeQuestion:
        "At what scale or in what extreme environment does this conclusion become an active liability?",
      counterPerspective:
        "Invert the hypothesis: what if systematically doing the inverse produces superior antifragility?",
    };
  }
}
