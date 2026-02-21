# Logcat AI

AI-powered Android bugreport.zip analyzer. Upload a bugreport, get structured diagnostics with root-cause analysis, cross-subsystem correlation, and actionable fix suggestions.

## Features

- **Dual-mode analysis** — Quick (rule-based, < 5s) and Deep (LLM-powered, 30s–2min)
- **Comprehensive parsing** — Logcat (9 anomaly types), ANR traces (18 case types with lock graph & deadlock detection), Kernel logs (9 event types)
- **Deep Analysis** — Evidence-based root cause identification, cross-subsystem correlation, prioritized actions with effort/impact assessment
- **Interactive chat** — Follow-up questions with streaming responses
- **Multi-LLM support** — Ollama (local), OpenAI, Google Gemini, Anthropic Claude
- **Real-time progress** — SSE streaming through 4 analysis stages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS |
| Backend | Express.js, Node.js >= 20 |
| Parser | TypeScript, yauzl-promise |
| Testing | Vitest |
| LLM | Ollama / OpenAI / Gemini / Anthropic |

## Project Structure

```
packages/
├── parser/          # Core parsing library (logcat, ANR, kernel)
├── backend/         # Express API server + LLM gateway
└── frontend/        # React web UI
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
POST   /api/upload              Upload bugreport.zip
GET    /api/analyze/:id         Start analysis (SSE stream)
GET    /api/analyze/:id/result  Get cached result (JSON)
POST   /api/chat/:id            Send chat message
GET    /api/settings/providers  List LLM providers
PUT    /api/settings/provider   Switch active provider
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
