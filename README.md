# Logcat AI

AI-powered Android bugreport.zip analyzer. Upload a bugreport, get structured diagnostics with root-cause analysis, cross-subsystem correlation, and actionable fix suggestions.

## Features

- **Dual-mode analysis** — Quick (rule-based, < 5s) and Deep (LLM-powered, 30s–2min)
- **Comprehensive parsing** — Logcat (11 anomaly types), ANR traces (18 case types with lock graph & deadlock detection), Kernel logs (12 event types), Tombstones (native crash)
- **Flexible input** — bugreport.zip, standalone logcat (.txt/.log), standalone dmesg files
- **Deep Analysis** — Evidence-based root cause identification, cross-subsystem correlation, prioritized actions with effort/impact assessment
- **Agentic chat** — LLM-driven investigation with 5 tools (search_logcat, get_thread_info, get_kernel_events, get_insight_detail, search_section)
- **Full-text search** — FTS5 BM25-ranked logcat search for fast keyword lookup
- **Analysis history** — SQLite-persisted results with browse, search, and reload
- **Report export** — JSON and self-contained HTML export
- **Comparison mode** — Side-by-side diff of two bugreports (health, insights, ANR, HAL)
- **Batch analysis** — Multi-file upload with statistical aggregation across devices
- **Lock graph visualization** — D3.js force-directed interactive graph with deadlock highlighting
- **MCP Server** — Claude Desktop / VS Code integration via Model Context Protocol
- **Multi-LLM support** — Ollama (local), OpenAI, Google Gemini, Anthropic Claude
- **Real-time progress** — SSE streaming through 4 analysis stages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS, D3.js |
| Backend | Express.js, Node.js >= 20, better-sqlite3 |
| Parser | TypeScript, yauzl-promise |
| Testing | Vitest |
| Database | SQLite (WAL mode) + FTS5 |
| LLM | Ollama / OpenAI / Gemini / Anthropic |
| MCP | @modelcontextprotocol/sdk (stdio) |

## Project Structure

```
packages/
├── parser/          # Core parsing library (logcat, ANR, kernel, tombstone, comparison, batch)
├── backend/         # Express API server + LLM gateway + SQLite + FTS5
├── frontend/        # React web UI + D3.js visualizations
└── mcp-server/      # MCP Server for Claude Desktop / VS Code integration
```

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10

### Install & Build

```bash
npm install
npm run build
```

### Development

```bash
# Start all packages in dev mode
npm run dev
```

### Configuration

Set LLM provider via environment variables or the Settings UI:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# Gemini
export GEMINI_API_KEY=...

# Ollama (local, no key needed)
export OLLAMA_BASE_URL=http://localhost:11434
```

## API Endpoints

```
POST   /api/upload              Upload bugreport.zip / .txt / .log
GET    /api/analyze/:id         Start analysis (SSE stream)
GET    /api/analyze/:id/result  Get cached result (JSON)
POST   /api/chat/:id            Send chat message (agentic tool calling)
GET    /api/settings/providers  List LLM providers
PUT    /api/settings/provider   Switch active provider
GET    /api/history             List analysis history (paginated)
GET    /api/history/:id         Get historical analysis result
DELETE /api/history/:id         Delete analysis record
PATCH  /api/history/:id         Update notes/tags
GET    /api/export/:id/:format  Export report (json / html)
GET    /api/compare             Compare two analyses (?left=id&right=id)
POST   /api/batch               Batch upload multiple files
GET    /api/batch/:id/analyze   Start batch analysis (SSE stream)
GET    /api/batch/:id           Get batch results
GET    /api/health              Health check
```

## Analysis Modes

### Quick Analysis

Rule-based parsing and pattern matching. No LLM required. Returns:
- System health score (stability, memory, responsiveness, kernel)
- Severity-ranked insight cards
- Cross-subsystem timeline
- ANR blocking chain & lock graph analysis

### Deep Analysis

LLM-enhanced analysis on top of Quick Analysis. Returns everything above plus:
- Executive summary and system diagnosis
- Per-insight root cause with cited evidence
- Category classification (root cause / symptom / contributing factor)
- Debugging steps with `adb` commands
- Cross-system correlation findings
- Prioritized actions with effort/impact ratings

## MCP Server (Claude Desktop / VS Code)

The `mcp-server` package provides a Model Context Protocol server for IDE integration:

```bash
# Build the MCP server
npm run build -w packages/mcp-server

# Add to Claude Desktop config (~/.config/claude/claude_desktop_config.json)
{
  "mcpServers": {
    "logcat-ai": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"]
    }
  }
}
```

Available MCP tools:
- `analyze_bugreport` — Upload and analyze a bugreport file
- `search_history` — Search past analysis records
- `ask_about_analysis` — Ask questions about an analyzed bugreport

## Scripts

```bash
npm run dev        # Start dev servers (all packages)
npm run build      # Build all packages
npm run test       # Run tests across all packages
npm run lint       # Lint TypeScript sources
```

## AI-Assisted Development

See [CLAUDE.md](./CLAUDE.md) for architecture overview, Android BSP domain knowledge, and guidance for AI coding assistants working in this repository.

## License

MIT
