import type { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";

function escapeHtmlForScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\${/g, "\\${");
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const filePath = path.resolve(process.cwd(), "docs/EXPLAINABILITY_AND_EVOLUTION.md");
    let markdownContent = "";

    if (fs.existsSync(filePath)) {
      markdownContent = fs.readFileSync(filePath, "utf-8");
    } else {
      markdownContent = "# Fabric OS: Master Architecture & Explainability Dossier\n\nFile loading...";
    }

    // Check if user requested raw markdown
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("raw") === "true") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.end(markdownContent);
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fabric OS • Master Architecture & Explainability Dossier</title>
  <meta name="description" content="Technical Specification and Evolution of Fabric OS: The Personal Cognitive Meta-OS">

  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#ecfeff',
              400: '#22d3ee',
              500: '#06b6d4',
              900: '#164e63',
            }
          }
        }
      }
    }
  </script>

  <!-- Marked Markdown Parser CDN -->
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>

  <!-- KaTeX CDN for Math Typesetting -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js"></script>

  <!-- Mermaid CDN for Diagram Rendering -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #09090b;
      color: #e4e4e7;
    }

    code, pre, .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }

    /* Markdown Styling */
    .prose-dark {
      color: #d4d4d8;
      max-width: 100%;
    }
    .prose-dark h1 {
      color: #ffffff;
      font-size: 2.25rem;
      font-weight: 800;
      margin-top: 2rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid #27272a;
      padding-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }
    .prose-dark h2 {
      color: #38bdf8;
      font-size: 1.5rem;
      font-weight: 700;
      margin-top: 2.5rem;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid #18181b;
      padding-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }
    .prose-dark h3 {
      color: #a5f3fc;
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.75rem;
      margin-bottom: 0.5rem;
    }
    .prose-dark h4 {
      color: #e4e4e7;
      font-size: 1.05rem;
      font-weight: 600;
      margin-top: 1.25rem;
      margin-bottom: 0.25rem;
    }
    .prose-dark p {
      margin-top: 0.75rem;
      margin-bottom: 0.75rem;
      line-height: 1.75;
      font-size: 0.95rem;
    }
    .prose-dark ul, .prose-dark ol {
      margin-top: 0.5rem;
      margin-bottom: 0.75rem;
      padding-left: 1.5rem;
    }
    .prose-dark ul { list-style-type: disc; }
    .prose-dark ol { list-style-type: decimal; }
    .prose-dark li {
      margin-top: 0.25rem;
      margin-bottom: 0.25rem;
      line-height: 1.6;
    }
    .prose-dark blockquote {
      border-left: 3px solid #06b6d4;
      background: rgba(6, 182, 212, 0.05);
      padding: 0.75rem 1.25rem;
      border-radius: 0 0.75rem 0.75rem 0;
      margin: 1rem 0;
      color: #bae6fd;
    }
    .prose-dark hr {
      border: 0;
      border-top: 1px solid #27272a;
      margin: 2.5rem 0;
    }
    .prose-dark table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.875rem;
    }
    .prose-dark th {
      background: #18181b;
      color: #38bdf8;
      text-align: left;
      padding: 0.75rem 1rem;
      font-weight: 600;
      border: 1px solid #27272a;
    }
    .prose-dark td {
      padding: 0.75rem 1rem;
      border: 1px solid #27272a;
      color: #d4d4d8;
    }
    .prose-dark tr:nth-child(even) {
      background: rgba(24, 24, 27, 0.4);
    }
    .prose-dark tr:hover {
      background: rgba(6, 182, 212, 0.05);
    }
    .prose-dark code:not(pre code) {
      background: #18181b;
      color: #22d3ee;
      padding: 0.2rem 0.4rem;
      border-radius: 0.375rem;
      font-size: 0.85em;
      border: 1px solid #27272a;
    }
    .prose-dark pre {
      background: #121215 !important;
      border: 1px solid #27272a;
      border-radius: 0.75rem;
      padding: 1.25rem;
      overflow-x: auto;
      margin: 1.25rem 0;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .prose-dark a {
      color: #38bdf8;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .prose-dark a:hover {
      color: #7dd3fc;
    }

    /* Mermaid container */
    .mermaid {
      background: #121215;
      padding: 1.5rem;
      border-radius: 0.75rem;
      border: 1px solid #27272a;
      margin: 1.5rem 0;
      display: flex;
      justify-content: center;
      overflow-x: auto;
    }

    /* KaTeX equation display */
    .katex-display {
      margin: 1.25rem 0;
      padding: 0.75rem 1rem;
      background: rgba(24, 24, 27, 0.5);
      border-radius: 0.5rem;
      border: 1px solid #27272a;
      overflow-x: auto;
      overflow-y: hidden;
    }
  </style>
</head>
<body class="min-h-screen selection:bg-cyan-500 selection:text-black">

  <!-- Top Sticky Header -->
  <header class="sticky top-0 z-50 backdrop-blur-xl bg-zinc-950/80 border-b border-zinc-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/dashboard" class="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition group">
        <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center group-hover:scale-105 transition">
          <span class="text-sm">🌌</span>
        </div>
        <div>
          <span class="font-extrabold text-sm tracking-tight text-white block">Fabric OS</span>
          <span class="text-[10px] font-mono text-zinc-400">Architecture Dossier</span>
        </div>
      </a>
      <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono hidden md:inline">Canon v1.0</span>
    </div>

    <div class="flex items-center gap-2">
      <a href="/dashboard" class="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-xs font-mono transition flex items-center gap-1.5">
        <span>📊</span>
        <span>Open HUD</span>
      </a>
      <a href="/docs?raw=true" target="_blank" class="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 text-xs font-mono transition flex items-center gap-1.5">
        <span>📥</span>
        <span>Raw .md</span>
      </a>
      <button onclick="window.print()" class="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-xs font-mono font-medium transition flex items-center gap-1.5">
        <span>🖨️</span>
        <span class="hidden sm:inline">Print / PDF</span>
      </button>
    </div>
  </header>

  <!-- Document Container -->
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-8 md:py-12">
    <div id="content" class="prose-dark">
      <!-- Rendered via Client JavaScript -->
      <div class="flex flex-col items-center justify-center py-20 text-zinc-500">
        <div class="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="font-mono text-xs">Compiling Architecture &amp; KaTeX Synthesizer...</p>
      </div>
    </div>
  </div>

  <footer class="border-t border-zinc-800/80 py-8 text-center text-xs text-zinc-500 font-mono">
    <p>The Fabric OS • Personal Cognitive Meta-OS • Open Architecture</p>
    <p class="mt-1 text-zinc-600">Unified 4F Dynamics: Focus • Facts • Funds • Feedback</p>
  </footer>

  <!-- Raw Markdown Data Inject -->
  <script id="raw-markdown" type="text/plain">${markdownContent}</script>

  <!-- Render Pipeline -->
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      const rawMd = document.getElementById("raw-markdown").textContent;

      // Configure Mermaid
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          darkMode: true,
          background: '#121215',
          primaryColor: '#06b6d4',
          primaryTextColor: '#ffffff',
          primaryBorderColor: '#0891b2',
          lineColor: '#38bdf8',
          secondaryColor: '#18181b',
          tertiaryColor: '#27272a'
        }
      });

      // Configure marked with custom mermaid renderer
      const renderer = new marked.Renderer();
      const defaultCodeRenderer = renderer.code.bind(renderer);

      renderer.code = function(code, language) {
        if (language === 'mermaid') {
          return '<div class="mermaid">' + code + '</div>';
        }
        return defaultCodeRenderer(code, language);
      };

      marked.setOptions({
        renderer: renderer,
        gfm: true,
        breaks: false
      });

      // Render Markdown to HTML
      const container = document.getElementById("content");
      container.innerHTML = marked.parse(rawMd);

      // Render KaTeX Formulas ($...$ and $$...$$)
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(container, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false}
          ],
          throwOnError: false
        });
      }

      // Render Mermaid Diagrams
      try {
        mermaid.run({
          nodes: document.querySelectorAll('.mermaid')
        });
      } catch (err) {
        console.warn("Mermaid render error:", err);
      }
    });
  </script>
</body>
</html>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } catch (error) {
    console.error("Docs Handler Exception:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Internal Server Error loading documentation.");
  }
}
