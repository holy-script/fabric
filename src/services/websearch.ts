/**
 * Zero-cost Web Search Service
 * Queries DuckDuckGo HTML with clean snippet extraction.
 */

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
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
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[WebSearch] Search request returned status: ${res.status}`);
      return [];
    }

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
        title: tMatch[2].replace(/<[^>]+>/g, "").trim(),
        url: u.startsWith("//") ? `https:${u}` : u,
      });
    }

    const snippets: string[] = [];
    let sMatch;
    while ((sMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(sMatch[1].replace(/<[^>]+>/g, "").trim());
    }

    const results: WebSearchResult[] = [];
    for (let i = 0; i < Math.min(titles.length, limit); i++) {
      if (titles[i].title) {
        results.push({
          title: titles[i].title,
          url: titles[i].url,
          snippet: snippets[i] || "",
        });
      }
    }

    return results;
  } catch (error) {
    console.warn("[WebSearch] Failed to execute web search:", error);
    return [];
  }
}
