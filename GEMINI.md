# Fabric OS — Gemini Workspace & MCP Configuration

This file provides context and MCP server configuration for Google Gemini CLI, Gemini Code Assist, and Gemini agent extensions.

## 🌟 Overview
**Fabric OS** is an Aristotelian human-agent symbiotic operating system built with Bun, TypeScript, and Firestore. It optimizes personal bio-vitality (FOCI BLE respiration), ambient context, and multi-domain intelligence across the **4F Vector**:
- **Focus ($F_{\text{focus}}$)**: Deep work sprints vs. cognitive fragmentation
- **Facts ($F_{\text{facts}}$)**: Grounded first-principles vs. intellectual gluttony
- **Funds ($F_{\text{funds}}$)**: Biological energy & asymmetric leverage vs. burnout
- **Feedback ($F_{\text{feedback}}$)**: Socratic calibration vs. neurotic isolation

## 🔌 Model Context Protocol (MCP) Server
Fabric OS includes an official Model Context Protocol server exposing the Knowledge Graph, 4F Telemetry, Council Deliberation, and Google Calendar / Notion sync.

To connect Gemini CLI or any MCP-compatible client to Fabric OS, add the following to your MCP settings (e.g. `~/.gemini/mcp.json` or `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "fabric": {
      "command": "bun",
      "args": ["run", "/Users/holyscript/Desktop/projects/fabric/src/mcp/server.ts"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}",
        "FIREBASE_PROJECT_ID": "${FIREBASE_PROJECT_ID}",
        "NOTION_API_KEY": "${NOTION_API_KEY}",
        "NOTION_DATABASE_ID": "${NOTION_DATABASE_ID}"
      }
    }
  }
}
```

### Available Fabric MCP Tools
- `fabric_search_knowledge`: Search 3,840+ curated Knowledge items and 97-node Graph Constellation.
- `fabric_get_telemetry`: Get real-time 4F currencies, wearable biometrics, and Aristotelian golden means.
- `fabric_convene_council`: Convene the 5-member adversarial Polymath Council (Architect, Quant, Stoic, Biomechanic, Sceptic).
- `fabric_calendar_block`: Schedule a time block on Google Calendar / macOS Calendar with optional Notion sync.
- `fabric_calendar_track`: Record completed focused time and log activity directly into Notion.
- `fabric_calendar_list`: List upcoming calendar blocks and tracked focus sessions.
- `fabric_sync_calendar_notion`: Synchronize pending calendar blocks into the user's Notion database.
- `fabric_web_search`: Live search cross-referencing web context with vault items.

## 💎 Using with Gemini Gems (Gemini Advanced / Pro)
- **Instructions**: Refer to `data/gemini/fabric_gem_instructions.md`
- **Knowledge Upload**: Upload `data/gemini/fabric_knowledge_gemini_brief.md` directly into your Gem
- **Manifest**: See `data/gemini/gemini_gem_fabric_os.json`

