/**
 * NotebookLM Source Exporter for The Fabric (4F Meta-OS)
 * Formats Fabric Knowledge Graph clusters and vaulted reels into
 * citation-grounded markdown source bundles optimized for Google NotebookLM.
 */

import fs from "fs";
import path from "path";
import { getOrLoadGraph, getCluster } from "../../graph/query.js";
import type { GraphCluster, GraphNode } from "../../graph/types.js";

const EXPORT_DIR = path.resolve(process.cwd(), "data/notebooklm_sources");
const VAULT_TRACKER_FILE = path.resolve(process.cwd(), ".telegram_vault_tracker.json");

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function getVaultTelegramUrl(sourceUrl?: string): string | null {
  if (!sourceUrl || !fs.existsSync(VAULT_TRACKER_FILE)) return null;
  try {
    const tracker = JSON.parse(fs.readFileSync(VAULT_TRACKER_FILE, "utf-8"));
    return tracker.archivedUrls?.[sourceUrl]?.telegramUrl || null;
  } catch {
    return null;
  }
}

export interface NotebookSourceBundle {
  clusterId: string;
  clusterLabel: string;
  filePath: string;
  fileName: string;
  itemCount: number;
  markdownContent: string;
}

/**
 * Generates a clean, citation-indexed Markdown source file for a single cluster.
 */
export async function exportClusterToNotebookLM(clusterIdOrTopic: string): Promise<NotebookSourceBundle | null> {
  const detail = await getCluster(clusterIdOrTopic);
  if (!detail) return null;

  const { cluster, nodes } = detail;
  const safeName = cluster.label.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const fileName = `Fabric_NotebookLM_${safeName}.md`;
  const filePath = path.join(EXPORT_DIR, fileName);

  let md = `# NotebookLM Knowledge Source: ${cluster.label}\n\n`;
  md += `> **The Fabric: 4F Meta-OS Knowledge Cluster**\n`;
  md += `> **Core Theme:** ${cluster.coreTheme}\n`;
  md += `> **Indexed Sources:** ${nodes.length} items\n`;
  md += `> **Top Semantic Tags:** ${cluster.topTags.join(", ")}\n`;
  md += `> **Generated At:** ${new Date().toISOString()}\n\n`;

  if (cluster.masterSynthesis) {
    md += `## 🏛️ Master Architectural Synthesis\n`;
    md += `${cluster.masterSynthesis}\n\n`;
    md += `---\n\n`;
  }

  md += `## 📚 Curated Knowledge Base & Video Vault Sources\n\n`;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const props = n.properties || {};
    const sourceUrl = (props.sourceUrl as string) || "";
    const tgUrl = getVaultTelegramUrl(sourceUrl);
    const notionUrl = (props.notionUrl as string) || "";
    const takeaway = (props.actionableTakeaway as string) || "";
    const category = (props.category as string) || n.type;
    const author = (props.author as string) || "The Fabric";
    const tags = Array.isArray(props.tags) ? props.tags.join(", ") : "";

    md += `### Source [${i + 1}]: ${n.label}\n`;
    md += `- **ID:** \`${n.id}\`\n`;
    md += `- **Classification:** \`${category}\` | **Author:** \`@${author}\`\n`;
    if (tags) md += `- **Tags:** \`${tags}\`\n`;
    if (tgUrl) md += `- **Playable Video Stream:** ${tgUrl}\n`;
    if (notionUrl) md += `- **Notion Card:** ${notionUrl}\n`;
    if (sourceUrl) md += `- **Original Reel Link:** ${sourceUrl}\n`;
    md += `\n`;

    if (n.description) {
      md += `#### Executive Summary\n${n.description}\n\n`;
    }

    if (takeaway) {
      md += `#### Actionable Takeaway & Implementation Heuristic\n> ${takeaway}\n\n`;
    }

    md += `---\n\n`;
  }

  fs.writeFileSync(filePath, md, "utf-8");

  return {
    clusterId: cluster.id,
    clusterLabel: cluster.label,
    filePath,
    fileName,
    itemCount: nodes.length,
    markdownContent: md,
  };
}

/**
 * Exports all clusters in The Fabric into individual NotebookLM bundles.
 */
export async function exportAllClustersToNotebookLM(): Promise<NotebookSourceBundle[]> {
  const graph = await getOrLoadGraph();
  const bundles: NotebookSourceBundle[] = [];

  for (const c of graph.clusters) {
    const bundle = await exportClusterToNotebookLM(c.id);
    if (bundle) {
      bundles.push(bundle);
    }
  }

  return bundles;
}

/**
 * Exports the Master Heuristics and Axioms across all clusters.
 */
export async function exportMasterHeuristicsToNotebookLM(): Promise<NotebookSourceBundle> {
  const graph = await getOrLoadGraph();
  const heuristics = graph.nodes.filter((n) => n.type === "heuristic" || n.type === "verdict");

  const fileName = "Fabric_Master_Heuristics_and_Axioms.md";
  const filePath = path.join(EXPORT_DIR, fileName);

  let md = `# NotebookLM Knowledge Source: The Fabric Master Heuristics & Axioms\n\n`;
  md += `> **Total Synthesized Heuristics:** ${heuristics.length}\n`;
  md += `> **Operating Economy:** Focus, Facts, Funds, Vital Energy\n`;
  md += `> **Generated At:** ${new Date().toISOString()}\n\n`;

  for (let i = 0; i < heuristics.length; i++) {
    const h = heuristics[i];
    md += `### Axiom [${i + 1}]: ${h.label}\n`;
    if (h.description) md += `${h.description}\n\n`;
    if (h.properties?.actionableTakeaway) {
      md += `> **Implementation:** ${h.properties.actionableTakeaway}\n\n`;
    }
    md += `---\n\n`;
  }

  fs.writeFileSync(filePath, md, "utf-8");

  return {
    clusterId: "master_heuristics",
    clusterLabel: "Master Heuristics & Axioms",
    filePath,
    fileName,
    itemCount: heuristics.length,
    markdownContent: md,
  };
}

export interface IITMGrokkingBundle {
  subject: string;
  title: string;
  filePath: string;
  fileName: string;
  questionCount: number;
}

/**
 * Returns available IIT Madras Quiz 1 Grokking source bundles.
 */
export function getIITMGrokkingBundles(): IITMGrokkingBundle[] {
  const subjects = [
    {
      subject: "cn",
      title: "IITM BS: Computer Networks (Quiz 1)",
      fileName: "IITM_Quiz1_Computer_Networks_Grokking_Mastery.md",
      questionCount: 24,
    },
    {
      subject: "csd",
      title: "IITM BS: Computer Systems Design (Quiz 1)",
      fileName: "IITM_Quiz1_Computer_Systems_Design_Grokking_Mastery.md",
      questionCount: 23,
    },
    {
      subject: "bdbn",
      title: "IITM BS: Big Data & Biological Networks (Quiz 1)",
      fileName: "IITM_Quiz1_BDBN_Grokking_Mastery.md",
      questionCount: 70,
    },
  ];

  return subjects.map((s) => ({
    ...s,
    filePath: path.join(EXPORT_DIR, s.fileName),
  }));
}


