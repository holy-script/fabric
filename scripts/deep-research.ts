#!/usr/bin/env bun
/**
 * Fabric OS — Gemini Deep Research CLI Runner
 * Executes autonomous in-depth research via your signed-in Google AI Pro session.
 * Usage:
 *   bun run scripts/deep-research.ts --query "Compare Raft vs Paxos vs PBFT"
 *   bun run scripts/deep-research.ts --query "..." --export-docs --pdf
 *   bun run scripts/deep-research.ts --check-auth
 */

import { getDeepResearchAdapter } from "../src/browser/adapters/deep-research.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
🔬 Fabric OS — Gemini Deep Research Runner
Usage:
  bun run scripts/deep-research.ts --query "<research topic>" [options]

Options:
  --query, -q <string>     Research dilemma, thesis, or question to investigate deeply
  --export-docs            Export the resulting report to Google Docs
  --pdf                    Download the generated Google Doc as a formatted PDF
  --timeout <minutes>      Max wait time in minutes (default: 15)
  --check-auth             Check if browser session is currently logged into Google AI Pro
  --help, -h               Show this help message
    `);
    process.exit(0);
  }

  const adapter = getDeepResearchAdapter();

  if (args.includes("--check-auth")) {
    console.log("🔍 Checking Google AI Pro authentication status...");
    const auth = await adapter.checkAuthStatus();
    if (auth.isAuthenticated) {
      console.log("✅ Authenticated! Google Gemini session is active.");
    } else {
      console.log("❌ Unauthenticated. Please run ./scripts/launch-research-browser.sh to sign in.");
    }
    process.exit(auth.isAuthenticated ? 0 : 1);
  }

  let query = "";
  const qIdx = args.findIndex((a) => a === "--query" || a === "-q");
  if (qIdx !== -1 && args[qIdx + 1]) {
    query = args[qIdx + 1];
  } else {
    // If not passed via --query, join non-flag arguments
    query = args.filter((a) => !a.startsWith("-")).join(" ");
  }

  if (!query) {
    console.error("❌ Error: Please provide a research query via --query \"<topic>\".");
    process.exit(1);
  }

  const exportToDocs = args.includes("--export-docs");
  const downloadPdf = args.includes("--pdf");
  let timeoutMs = 900000; // 15 mins default
  const tIdx = args.indexOf("--timeout");
  if (tIdx !== -1 && args[tIdx + 1]) {
    timeoutMs = parseInt(args[tIdx + 1], 10) * 60 * 1000;
  }

  console.log("\n🔬 ── Starting Gemini Deep Research ──");
  console.log(`• Topic:        "${query}"`);
  console.log(`• Export Docs:  ${exportToDocs ? "Yes" : "No"}`);
  console.log(`• Download PDF: ${downloadPdf ? "Yes" : "No"}`);
  console.log(`• Max Timeout:  ${Math.round(timeoutMs / 60000)} minutes\n`);

  const res = await adapter.executeDeepResearch(query, {
    exportToDocs,
    downloadPdf,
    timeoutMs,
  });

  if (res.status === "unauthenticated") {
    console.error("\n❌ Authentication Error:", res.error);
    process.exit(1);
  }

  if (res.status === "failed") {
    console.error("\n❌ Research Failed:", res.error);
    process.exit(1);
  }

  console.log("\n✅ ── Deep Research Completed ──");
  console.log(`• Task ID:        ${res.taskId}`);
  console.log(`• Elapsed Time:   ${res.elapsedSeconds}s`);
  console.log(`• Sources Found:  ${res.sourcesCount || "Multiple web citations"}`);
  console.log(`• Output Folder:  ${res.outputDir}`);
  console.log(`• Markdown File:  ${res.outputDir}/report.md`);
  if (res.googleDocUrl) {
    console.log(`• Google Doc:     ${res.googleDocUrl}`);
  }
  if (res.pdfPath) {
    console.log(`• Downloaded PDF: ${res.pdfPath}`);
  }

  console.log("\n📄 ── Report Preview ──\n");
  console.log((res.reportMarkdown || "").slice(0, 1000));
  console.log("\n[... Full report available in markdown file ...]\n");
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});

