export interface GoldbeesAnalysis {
  currentPrice: number;
  currency: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  drawdownPercent: number;
  rsi14: number;
  sma20: number;
  sma50: number;
  recommendation: {
    zone: "MAX_ACCUMULATION" | "AGGRESSIVE_BUY" | "ACCUMULATE_DIP" | "HOLD_OBSERVE" | "TRIM_PROFIT";
    actionTitle: string;
    description: string;
    trancheAllocationPercent: number; // % of capital pool to deploy
    suggestedTrancheInr: {
      conservative: number; // e.g. based on 20k pool
      moderate: number;     // e.g. based on 50k pool
      aggressive: number;   // e.g. based on 100k pool
    };
  };
  lastUpdated: string;
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function calculateSMA(data: number[], window: number): number {
  if (data.length < window) return data[data.length - 1] || 0;
  const slice = data.slice(-window);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round((sum / window) * 100) / 100;
}

export async function getGoldbeesAnalysis(): Promise<GoldbeesAnalysis> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/GOLDBEES.NS?interval=1d&range=1y";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (FabricOS-CapitalEngine/2.0)",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed fetching GOLDBEES data: HTTP ${res.status}`);
  }

  const json = (await res.json()) as any;
  const result = json.chart?.result?.[0];
  if (!result) {
    throw new Error("Invalid response format from Yahoo Finance");
  }

  const meta = result.meta;
  const quotes = result.indicators?.quote?.[0];
  const closes: number[] = (quotes?.close || []).filter((c: any) => typeof c === "number" && !isNaN(c));

  const currentPrice = Math.round((meta.regularMarketPrice || closes[closes.length - 1]) * 100) / 100;
  const fiftyTwoWeekHigh = Math.round(meta.fiftyTwoWeekHigh * 100) / 100;
  const fiftyTwoWeekLow = Math.round(meta.fiftyTwoWeekLow * 100) / 100;

  const drawdownPercent = Math.round(((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 10000) / 100;
  const rsi14 = calculateRSI(closes, 14);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  // Quantitative Dip-Buying Logic
  let zone: GoldbeesAnalysis["recommendation"]["zone"];
  let actionTitle: string;
  let description: string;
  let trancheAllocationPercent: number;

  if (drawdownPercent <= -15 || rsi14 < 30) {
    zone = "MAX_ACCUMULATION";
    actionTitle = "🔥 Maximum Accumulation Zone (Generational Dip)";
    description = `Gold is down ${Math.abs(drawdownPercent)}% from 52W High with RSI at ${rsi14}. Extreme asymmetry in favor of patient capital. Deploy primary reserve tranche.`;
    trancheAllocationPercent = 50;
  } else if (drawdownPercent <= -8 || rsi14 < 40) {
    zone = "AGGRESSIVE_BUY";
    actionTitle = "⚡ Aggressive Buy Zone (Major Pullback)";
    description = `Solid correction of ${Math.abs(drawdownPercent)}%. Favorable risk-to-reward ratio for rupee-cost averaging.`;
    trancheAllocationPercent = 35;
  } else if (drawdownPercent <= -4 || rsi14 < 48) {
    zone = "ACCUMULATE_DIP";
    actionTitle = "🌱 Tactical Accumulation (Healthy Retracement)";
    description = `Mild pullback (${Math.abs(drawdownPercent)}%). Safe for weekly disciplined SIP or small exploratory tranche.`;
    trancheAllocationPercent = 20;
  } else {
    zone = "HOLD_OBSERVE";
    actionTitle = "🛡️ Hold & Observe (Near Resistance / Peak)";
    description = `Trading near 52W peak. Maintain existing positions; do not FOMO buy lump sums at elevated levels.`;
    trancheAllocationPercent = 0;
  }

  // Model allocation amounts across hypothetical capital budgets (₹20k, ₹50k, ₹100k)
  const pct = trancheAllocationPercent / 100;
  const suggestedTrancheInr = {
    conservative: Math.round(20000 * pct),
    moderate: Math.round(50000 * pct),
    aggressive: Math.round(100000 * pct),
  };

  return {
    currentPrice,
    currency: "INR",
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    drawdownPercent,
    rsi14,
    sma20,
    sma50,
    recommendation: {
      zone,
      actionTitle,
      description,
      trancheAllocationPercent,
      suggestedTrancheInr,
    },
    lastUpdated: new Date().toISOString(),
  };
}
