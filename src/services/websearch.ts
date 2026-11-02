/**
 * 🌐 Fabric Multi-Engine Web Search & AI Grounding Service
 *
 * Supports:
 * 1. Google AI Mode API (via SearchApi.io & SerpApi) - extracts Google's real-time AI Overview & GEO citations
 * 2. Google Custom Search JSON API (Official Google Cloud CSE)
 * 3. DuckDuckGo Instant Answer API (Zero-cost, zero-key structured abstract & related topics)
 * 4. DuckDuckGo HTML Fallback (Zero-cost organic web scraper)
 */

import { config } from "../config/env.js";

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  sourceEngine?: "google_ai_mode" | "google_cse" | "duckduckgo_api" | "duckduckgo_html";
  aiOverview?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  aiOverview?: string;
  engineUsed: "google_ai_mode" | "google_cse" | "duckduckgo_api" | "duckduckgo_html" | "none";
}

/**
 * Searches the web using the best available engine (Google AI Mode -> Google CSE -> DuckDuckGo API -> DDG HTML).
 */
export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const fullResponse = await searchWebDetailed(query, limit);
  return fullResponse.results;
}

/**
 * Advanced search returning structured results + AI Overview summary.
 */
export async function searchWebDetailed(query: string, limit = 5): Promise<WebSearchResponse> {
  const q = query.trim();
  if (!q) return { results: [], engineUsed: "none" };

  // 1. Check for Google AI Mode via SearchApi.io
  if (config.searchApiKey) {
    try {
      const searchApiRes = await querySearchApiGoogleAiMode(q, limit, config.searchApiKey);
      if (searchApiRes.results.length > 0 || searchApiRes.aiOverview) {
        return searchApiRes;
      }
    } catch (err) {
      console.warn("[WebSearch] SearchApi Google AI Mode failed, falling back:", err);
    }
  }

  // 2. Check for Google AI Mode via SerpApi
  if (config.serpApiKey) {
    try {
      const serpApiRes = await querySerpApiGoogleAiMode(q, limit, config.serpApiKey);
      if (serpApiRes.results.length > 0 || serpApiRes.aiOverview) {
        return serpApiRes;
      }
    } catch (err) {
      console.warn("[WebSearch] SerpApi Google AI Mode failed, falling back:", err);
    }
  }

  // 3. Check for Google Custom Search JSON API
  if (config.googleSearchApiKey && config.googleSearchCx) {
    try {
      const cseRes = await queryGoogleCse(q, limit, config.googleSearchApiKey, config.googleSearchCx);
      if (cseRes.results.length > 0) {
        return cseRes;
      }
    } catch (err) {
      console.warn("[WebSearch] Google CSE failed, falling back:", err);
    }
  }

  // 4. DuckDuckGo Instant Answer API (Zero Key, Instant JSON)
  try {
    const ddgApiRes = await queryDuckDuckGoApi(q, limit);
    if (ddgApiRes.results.length > 0) {
      return ddgApiRes;
    }
  } catch (err) {
    console.warn("[WebSearch] DuckDuckGo Instant API failed, falling back to HTML:", err);
  }

  // 5. DuckDuckGo HTML Web Scraper (Zero Key Fallback)
  const ddgHtmlResults = await queryDuckDuckGoHtml(q, limit);
  return {
    results: ddgHtmlResults,
    engineUsed: "duckduckgo_html",
  };
}

/**
 * Queries Google AI Mode via SearchApi.io
 * Endpoint: https://www.searchapi.io/api/v1/search?engine=google_ai_mode
 */
async function querySearchApiGoogleAiMode(query: string, limit: number, apiKey: string): Promise<WebSearchResponse> {
  const params = new URLSearchParams({
    engine: "google_ai_mode",
    q: query,
    api_key: apiKey,
  });

  const res = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`, {
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    throw new Error(`SearchApi returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const results: WebSearchResult[] = [];
  let aiOverview: string | undefined = undefined;

  // Extract AI Overview text & citations
  if (data.ai_overview) {
    aiOverview = typeof data.ai_overview === "string" ? data.ai_overview : data.ai_overview.text;
    if (data.ai_overview.references && Array.isArray(data.ai_overview.references)) {
      for (const ref of data.ai_overview.references.slice(0, limit)) {
        results.push({
          title: ref.title || "AI Mode Reference",
          snippet: ref.snippet || ref.source || "",
          url: ref.link || ref.url || "",
          sourceEngine: "google_ai_mode",
          aiOverview,
        });
      }
    }
  }

  // Extract organic results
  if (data.organic_results && Array.isArray(data.organic_results)) {
    for (const org of data.organic_results.slice(0, limit)) {
      if (!results.some((r) => r.url === org.link)) {
        results.push({
          title: org.title || "",
          snippet: org.snippet || "",
          url: org.link || "",
          sourceEngine: "google_ai_mode",
          aiOverview,
        });
      }
    }
  }

  return {
    results: results.slice(0, limit),
    aiOverview,
    engineUsed: "google_ai_mode",
  };
}

/**
 * Queries Google AI Mode via SerpApi
 * Endpoint: https://serpapi.com/search.json?engine=google_ai_mode
 */
async function querySerpApiGoogleAiMode(query: string, limit: number, apiKey: string): Promise<WebSearchResponse> {
  const params = new URLSearchParams({
    engine: "google_ai_mode",
    q: query,
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    throw new Error(`SerpApi returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const results: WebSearchResult[] = [];
  let aiOverview: string | undefined = undefined;

  if (data.ai_overview) {
    aiOverview = data.ai_overview.snippet || data.ai_overview.text;
    if (data.ai_overview.sources && Array.isArray(data.ai_overview.sources)) {
      for (const s of data.ai_overview.sources.slice(0, limit)) {
        results.push({
          title: s.title || "AI Mode Source",
          snippet: s.snippet || "",
          url: s.link || "",
          sourceEngine: "google_ai_mode",
          aiOverview,
        });
      }
    }
  }

  if (data.organic_results && Array.isArray(data.organic_results)) {
    for (const org of data.organic_results.slice(0, limit)) {
      if (!results.some((r) => r.url === org.link)) {
        results.push({
          title: org.title || "",
          snippet: org.snippet || "",
          url: org.link || "",
          sourceEngine: "google_ai_mode",
          aiOverview,
        });
      }
    }
  }

  return {
    results: results.slice(0, limit),
    aiOverview,
    engineUsed: "google_ai_mode",
  };
}

/**
 * Queries Google Custom Search JSON API
 * Official free tier: 100 queries/day
 */
async function queryGoogleCse(query: string, limit: number, apiKey: string, cx: string): Promise<WebSearchResponse> {
  const params = new URLSearchParams({
    key: apiKey,
    cx: cx,
    q: query,
    num: String(Math.min(limit, 10)),
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Google CSE returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const results: WebSearchResult[] = [];

  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items.slice(0, limit)) {
      results.push({
        title: item.title || "",
        snippet: item.snippet || "",
        url: item.link || "",
        sourceEngine: "google_cse",
      });
    }
  }

  return {
    results,
    engineUsed: "google_cse",
  };
}

/**
 * Queries DuckDuckGo Instant Answer API (Zero Key)
 * Returns official abstract definitions and related topics
 */
async function queryDuckDuckGoApi(query: string, limit: number): Promise<WebSearchResponse> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3500) });

  if (!res.ok) {
    throw new Error(`DDG API returned status ${res.status}`);
  }

  const data: any = await res.json();
  const results: WebSearchResult[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      snippet: data.AbstractText,
      url: data.AbstractURL,
      sourceEngine: "duckduckgo_api",
    });
  }

  if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
    for (const topic of data.RelatedTopics) {
      if (results.length >= limit) break;
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.slice(0, 60),
          snippet: topic.Text,
          url: topic.FirstURL,
          sourceEngine: "duckduckgo_api",
        });
      }
    }
  }

  return {
    results,
    engineUsed: results.length > 0 ? "duckduckgo_api" : "none",
  };
}

/**
 * Zero-cost DuckDuckGo HTML Scraper Fallback
 */
async function queryDuckDuckGoHtml(query: string, limit = 5): Promise<WebSearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const titles: Array<{ title: string; url: string }> = [];
    let tMatch;
    while ((tMatch = titleRegex.exec(html)) !== null) {
      let u = tMatch[1];
      if (u.includes("uddg=")) {
        try {
          const parsed = new URL(u, "https://duckduckgo.com");
          u = parsed.searchParams.get("uddg") || u;
        } catch {
          // ignore
        }
      }
      titles.push({
        title: cleanHtmlEntities(tMatch[2].replace(/<[^>]+>/g, "").trim()),
        url: u.startsWith("//") ? `https:${u}` : u,
      });
    }

    const snippets: string[] = [];
    let sMatch;
    while ((sMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(cleanHtmlEntities(sMatch[1].replace(/<[^>]+>/g, "").trim()));
    }

    const results: WebSearchResult[] = [];
    for (let i = 0; i < Math.min(titles.length, limit); i++) {
      if (titles[i].title) {
        results.push({
          title: titles[i].title,
          url: titles[i].url,
          snippet: snippets[i] || "",
          sourceEngine: "duckduckgo_html",
        });
      }
    }

    return results;
  } catch (error) {
    console.warn("[WebSearch] Failed to execute DDG HTML search:", error);
    return [];
  }
}

function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}
