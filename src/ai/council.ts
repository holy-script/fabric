import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/env.js";
import { getUserState, getRecentTrades } from "../db/firestore.js";
import { getAllDomains } from "../domains/manager.js";
import { searchGraph } from "../graph/query.js";
import type { Trade, UserState } from "../db/types.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  },
});

export interface CouncilMemberPerspective {
  name: string;
  role: string;
  emoji: string;
  quote: string; // 2-3 punchy, distinct sentences
}

export interface CouncilExecutiveVerdict {
  action: string;
  tradeType: "builder" | "vitality" | "wealth" | "polymath" | "rest";
  focusHours: number;
  expectedFacts: string;
  expectedFunds: string;
  expectedEnergyDelta: number; // -5 to +5
  rationale: string;
}

export interface CouncilReport {
  problem: string;
  perspectives: {
    architect: CouncilMemberPerspective;
    quant: CouncilMemberPerspective;
    stoic: CouncilMemberPerspective;
    biomechanic: CouncilMemberPerspective;
    sceptic: CouncilMemberPerspective;
  };
  verdict: CouncilExecutiveVerdict;
  timestamp: Date;
}

function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

const SYSTEM_COUNCIL_PROMPT = `You are the Polymath Council deliberative engine of "The Fabric" (4F Meta-OS).
The Fabric operates on a 4-currency economy:
1. Focus (Deep work, monotropic immersion hours)
2. Facts (Synthesized models, code artifacts, signal vs noise)
3. Funds (Capital expenditure, asymmetric investment, financial runway)
4. Feedback / Vitality (Biological energy delta -5 to +5)

When a complex dilemma, trade-off, or architectural choice is presented, you spawn 5 distinct cognitive personas inspired by 4F philosophy:

1. 🏛️ THE ARCHITECT
- Lens: Systems leverage, compounding tech stacks, long-term elegance, modularity, anti-repetition (DRY), infrastructure as compounding capital.
- Voice: Thinks in system topologies and compounding multi-year leverage. Rejects brittle hacks and ad-hoc sprawl.

2. 📈 THE QUANT
- Lens: Expected Value (EV), asymmetry, probability distributions, risk-adjusted yield, capital preservation, opportunity costs.
- Voice: Analytical, mathematical, probabilistic. Seeks positive asymmetry (capped downside, uncapped upside) and warns against ruin risk.

3. ⚖️ THE STOIC
- Lens: Aristotelian Golden Mean (virtue between excess and deficiency), via negativa (addition by subtraction), mortality awareness ("Wake Up Dead Man" / Memento Mori), antifragility.
- Voice: Austere, grounded, urgent. Asks what can be stripped away, how this preserves equanimity, and whether it balances the 5 Aristotelian poles.

4. 🦾 THE BIOMECHANIC
- Lens: Metabolic efficiency, kinetic central nervous system (CNS), physical stamina, circadian hygiene, biological constraints.
- Voice: Physiological realist. Warns that mind cannot outrun depleted biology. Prioritizes physical vitality, sleep, and somatic recovery over burnout.

5. ⚔️ THE SCEPTIC
- Lens: Taleb-style red-teaming, survivorship bias, boundary conditions, hidden fragilities, brutal stress-testing.
- Voice: Piercing, skeptical, anti-sycophantic. Exposes what will break on Day 3, where wishful thinking is hiding, and what happens under severe stress.

After the 5 members speak, synthesize their deliberation into THE EXECUTIVE VERDICT:
- Exactly 1 concrete, actionable 4F trade.
- Must reconcile the 5 tensions into an immediate, specific move.

Output MUST be strictly valid JSON conforming to this exact structure:
{
  "perspectives": {
    "architect": {
      "quote": "2-3 punchy, distinct sentences in The Architect voice."
    },
    "quant": {
      "quote": "2-3 punchy, distinct sentences in The Quant voice."
    },
    "stoic": {
      "quote": "2-3 punchy, distinct sentences in The Stoic voice."
    },
    "biomechanic": {
      "quote": "2-3 punchy, distinct sentences in The Biomechanic voice."
    },
    "sceptic": {
      "quote": "2-3 punchy, distinct sentences in The Sceptic voice."
    }
  },
  "verdict": {
    "action": "One concrete, actionable immediate directive",
    "tradeType": "builder" | "vitality" | "wealth" | "polymath" | "rest",
    "focusHours": 1.5,
    "expectedFacts": "Specific artifact or knowledge yielded",
    "expectedFunds": "Funds impact, e.g. '$0' or '+$500' or '-$20'",
    "expectedEnergyDelta": 1,
    "rationale": "1-2 sentences explaining why this synthesizes the Council's wisdom"
  }
}`;

/**
 * Convenes the 5-member Polymath Council to deliberate on a problem
 */
export async function conveneCouncil(
  userId: string,
  problem: string
): Promise<CouncilReport> {
  // 1. Gather User State & Aristotle Scales
  let userState: UserState | null = null;
  let recentTrades: Trade[] = [];
  try {
    userState = await getUserState(userId);
    recentTrades = await getRecentTrades(userId, 5);
  } catch (err) {
    console.warn("⚠️ [Council] Could not load user state:", err);
  }

  // 2. Gather Active Domains
  let activeDomainSummary = "Standard domains";
  try {
    const domainData = await getAllDomains(userId);
    if (domainData.active.length > 0) {
      activeDomainSummary = domainData.active
        .map((d) => `${d.name} (${d.pillar})`)
        .join(", ");
    }
  } catch (err) {
    console.warn("⚠️ [Council] Could not load domains:", err);
  }

  // 3. Gather Knowledge Graph Context
  let graphContext = "";
  try {
    const searchRes = await searchGraph(problem, 4);
    if (searchRes.nodes.length > 0) {
      graphContext = searchRes.nodes
        .slice(0, 4)
        .map((n) => `• [${n.type.toUpperCase()}] ${n.label}: ${n.description}`)
        .join("\n");
    }
  } catch (err) {
    console.warn("⚠️ [Council] Knowledge graph search skipped:", err);
  }

  // 4. Construct Telemetry Context
  const telemetryLines: string[] = [];
  if (userState) {
    telemetryLines.push(`• Total Focus Hours: ${userState.totalFocusHours}h`);
    telemetryLines.push(`• Facts Acquired: ${userState.totalFactsAcquired}`);
    telemetryLines.push(
      `• Funds Spent/Yield: -$${userState.totalFundsSpent} / +$${userState.totalFundsYield}`
    );
    telemetryLines.push(`• Energy Baseline: ${userState.averageEnergyDelta} / 5.0`);
    if (userState.goldenMeans) {
      telemetryLines.push(
        `• Aristotelian Scales: Logic=${userState.goldenMeans.logic ?? 0}, Vitality=${userState.goldenMeans.vitality ?? 0}, Expressionism=${userState.goldenMeans.expressionism ?? 0}, Variety=${userState.goldenMeans.variety ?? 0}, Prioritization=${userState.goldenMeans.prioritization ?? 0}`
      );
    }
  }
  telemetryLines.push(`• Active Domains: ${activeDomainSummary}`);

  if (recentTrades.length > 0) {
    const tradeSummary = recentTrades
      .slice(0, 3)
      .map(
        (t) =>
          `${t.moduleName} (${t.focusActualHours}h, ${t.energyDelta > 0 ? "+" : ""}${t.energyDelta} energy)`
      )
      .join("; ");
    telemetryLines.push(`• Recent Trades: ${tradeSummary}`);
  }

  const prompt = `${SYSTEM_COUNCIL_PROMPT}

USER TELEMETRY & 4F STATE:
${telemetryLines.join("\n")}

${graphContext ? `RELEVANT KNOWLEDGE GRAPH CONTEXT:\n${graphContext}\n` : ""}
PROBLEM / DILEMMA TO DELIBERATE:
"${problem}"

Deliver the multi-agent deliberation and executive verdict in JSON now:`;

  try {
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    const cleaned = cleanJsonOutput(text);
    const parsed = JSON.parse(cleaned);

    const report: CouncilReport = {
      problem,
      perspectives: {
        architect: {
          name: "The Architect",
          role: "Systems Leverage & Compounding Modularity",
          emoji: "🏛️",
          quote:
            parsed.perspectives?.architect?.quote ||
            "Evaluate whether this decision builds compounding leverage or introduces uncontained maintenance debt.",
        },
        quant: {
          name: "The Quant",
          role: "Expected Value & Asymmetric Yield",
          emoji: "📈",
          quote:
            parsed.perspectives?.quant?.quote ||
            "Calculate the payoff matrix: minimize exposure to tail-risk ruin while maximizing positive asymmetry.",
        },
        stoic: {
          name: "The Stoic",
          role: "Antifragility & Aristotelian Mean",
          emoji: "⚖️",
          quote:
            parsed.perspectives?.stoic?.quote ||
            "Remember your mortality and prune the superfluous via negativa to restore true dynamic equilibrium.",
        },
        biomechanic: {
          name: "The Biomechanic",
          role: "Metabolic Efficiency & Kinetic CNS",
          emoji: "🦾",
          quote:
            parsed.perspectives?.biomechanic?.quote ||
            "Honor biological limits: cognitive output degrades non-linearly if somatic energy is operating at a deficit.",
        },
        sceptic: {
          name: "The Sceptic",
          role: "Red-Teaming & Stress-Testing",
          emoji: "⚔️",
          quote:
            parsed.perspectives?.sceptic?.quote ||
            "Strip away the wishful thinking: identify where this fragile hypothesis shatters under contact with reality.",
        },
      },
      verdict: {
        action:
          parsed.verdict?.action ||
          "Execute a time-boxed 60-minute MVP test to validate assumptions without overcommitting capital or focus.",
        tradeType: parsed.verdict?.tradeType || "builder",
        focusHours: Number(parsed.verdict?.focusHours) || 1.0,
        expectedFacts:
          parsed.verdict?.expectedFacts || "Falsifiable test results",
        expectedFunds: parsed.verdict?.expectedFunds || "$0",
        expectedEnergyDelta:
          Math.max(-5, Math.min(5, Number(parsed.verdict?.expectedEnergyDelta))) || 0,
        rationale:
          parsed.verdict?.rationale ||
          "Balances systems elegance with downside risk preservation and biological stamina.",
      },
      timestamp: new Date(),
    };

    return report;
  } catch (error) {
    console.error("⚠️ [Council] Deliberation generation failed:", error);
    // Resilient fallback council deliberation
    return {
      problem,
      perspectives: {
        architect: {
          name: "The Architect",
          role: "Systems Leverage & Compounding Modularity",
          emoji: "🏛️",
          quote:
            "Design for modularity and high leverage. Favor components that compound over time rather than fragile point solutions.",
        },
        quant: {
          name: "The Quant",
          role: "Expected Value & Asymmetric Yield",
          emoji: "📈",
          quote:
            "Preserve capital and attention until expected value clearly outstrips execution cost. Ensure the downside is capped.",
        },
        stoic: {
          name: "The Stoic",
          role: "Antifragility & Aristotelian Mean",
          emoji: "⚖️",
          quote:
            "Wake up dead man: time is finite. Apply via negativa by eliminating distraction and seeking the Aristotelian Mean.",
        },
        biomechanic: {
          name: "The Biomechanic",
          role: "Metabolic Efficiency & Kinetic CNS",
          emoji: "🦾",
          quote:
            "Biological energy is the primary bottleneck. Protect sleep and kinetic CNS reserves before attempting high-friction output.",
        },
        sceptic: {
          name: "The Sceptic",
          role: "Red-Teaming & Stress-Testing",
          emoji: "⚔️",
          quote:
            "Beware survivorship bias and unexamined assumptions. Stress-test the weakest link before investing major resources.",
        },
      },
      verdict: {
        action: "Execute a focused 45-minute modular trial, then reassess.",
        tradeType: "builder",
        focusHours: 0.75,
        expectedFacts: "Baseline empirical validation",
        expectedFunds: "$0",
        expectedEnergyDelta: 1,
        rationale:
          "Minimizes immediate downside while creating empirical signal for the next decision.",
      },
      timestamp: new Date(),
    };
  }
}

/**
 * Formats a CouncilReport into clean, robust Telegram Markdown
 */
export function formatCouncilCard(report: CouncilReport): string {
  const v = report.verdict;
  const energyStr =
    v.expectedEnergyDelta > 0
      ? `+${v.expectedEnergyDelta}`
      : `${v.expectedEnergyDelta}`;

  return [
    `🏛️ *THE POLYMATH COUNCIL: DELIBERATION*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🎯 *Dilemma:*`,
    `_"${report.problem}"_`,
    ``,
    `🏛️ *The Architect* — _Modularity & Systems Leverage_`,
    `"${report.perspectives.architect.quote}"`,
    ``,
    `📈 *The Quant* — _Expected Value & Asymmetry_`,
    `"${report.perspectives.quant.quote}"`,
    ``,
    `⚖️ *The Stoic* — _Antifragility & Aristotelian Mean_`,
    `"${report.perspectives.stoic.quote}"`,
    ``,
    `🦾 *The Biomechanic* — _Kinetic CNS & Biological Stamina_`,
    `"${report.perspectives.biomechanic.quote}"`,
    ``,
    `⚔️ *The Sceptic* — _Red-Teaming & Stress-Testing_`,
    `"${report.perspectives.sceptic.quote}"`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚖️ *EXECUTIVE CONSENSUS VERDICT:*`,
    `*${v.action}*`,
    ``,
    `⚡ *Recommended 4F Trade:*`,
    `• *Focus:* ${v.focusHours}h (\`${v.tradeType}\`)`,
    `• *Facts Yield:* ${v.expectedFacts}`,
    `• *Funds Impact:* ${v.expectedFunds}`,
    `• *Energy Delta:* ${energyStr} / 5.0`,
    `• *Strategic Rationale:* _${v.rationale}_`,
  ].join("\n");
}
