# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start all packages in watch/dev mode
npm run build            # Build all packages (tsc + vite)
npm run test             # Run Vitest across all packages
npm run lint             # ESLint on packages/*/src (.ts, .tsx)

# IMPORTANT: Parser must be built before backend/mcp-server (they depend on compiled output)
npm run build -w packages/parser   # Build parser first when changing parser types/exports
```

### Per-package commands

```bash
# Parser - run a single test file
npx -w packages/parser vitest run tests/logcat-parser.test.ts

# Parser - watch mode
npm run test:watch -w packages/parser

# Backend - start dev server (tsx watch, port 8000)
npm run dev -w packages/backend

# Frontend - start Vite dev server (port 3000, proxies /api → :8000)
npm run dev -w packages/frontend
```

### Sanity Testing with Real Bugreports

After completing a new feature or making changes to parser/backend, run sanity tests against the three real bugreport files in `sample-bugreports/`. These can be tested by uploading through the frontend or by calling the backend API directly:

```bash
# Upload and analyze via API (small bugreports, ~6MB each)
curl -F "file=@sample-bugreports/bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip" http://localhost:8000/api/upload
curl -F "file=@sample-bugreports/bugreport-T70-AQ3A.250408.001-2026-02-04-16-34-47 _dock.zip" http://localhost:8000/api/upload

# Large bugreport (30MB, 695K logcat entries) — tests memory/performance limits
curl -F "file=@sample-bugreports/phone-anr-bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.zip" http://localhost:8000/api/upload

# Then GET /api/analyze/:id to trigger analysis
```

## Architecture

TypeScript monorepo (npm workspaces) with four packages: `parser`, `backend`, `frontend`, `mcp-server`.

### Data Flow

```
bugreport.zip → [Upload API] → [Unpacker] → sections & raw files
  → [Parsers: logcat, ANR, kernel, dumpsys] → structured anomalies
  → [BasicAnalyzer] → AnalysisResult (health scores, insight cards)
  → [FTS5 indexer] → SQLite full-text search index
  → [rawDataStore] → in-memory store for chat tool access
  → [LLM Gateway] → DeepAnalysisOverview (root cause, fix suggestions)
  → [SSE stream (lightweight)] → Frontend notified → [REST fetch slim result] → UI
  → [Chat API] → follow-up Q&A (uses rawDataStore + FTS5)
  → [Search API] → on-demand logcat/kernel entry queries (FTS5)
```

### Parser (`@logcat-ai/parser`)

Core parsing library, no runtime dependencies except `yauzl-promise` for ZIP extraction. All exports via `src/index.ts`.

- `unpacker.ts` — ZIP extraction, section splitting (logcat with buffer info, ANR traces, kernel, dumpsys)
- `logcat-parser.ts` — 11 anomaly types (crash, ANR, watchdog, etc.); `parseLogcat(content, buffer?)` accepts optional buffer param; `detectAnomalies()` and `computeTagStats()` are exported for per-section parsing
- `anr-parser.ts` — 18 ANR case types, lock graph construction, deadlock detection
- `kernel-parser.ts` — 12 kernel event types
- `dumpsys-parser.ts` — meminfo, cpuinfo, lshal parsing
- `tombstone-parser.ts` — Native crash backtrace, signal info, vendor crash detection
- `basic-analyzer.ts` — Rule-based analysis, health scoring (stability/memory/responsiveness/kernel), insight card generation, timeline↔insight linking
- `format-detector.ts` — Auto-detect standalone file format (logcat vs dmesg)
- `comparison.ts` — Compare two AnalysisResult objects (health, insights, ANR, HAL diff)
- `batch-analyzer.ts` — Aggregate statistics across multiple analyses
- `types.ts` — All shared type definitions used across packages (includes `LogcatBuffer`, `LogcatSection`, `LogEntry.buffer?`)

### Backend (`@logcat-ai/backend`)

Express.js API server. Loads `.env` from repo root (`../../.env` relative to package).

- **Routes**: `upload.ts` (Multer, .zip/.txt/.log), `analyze.ts` (SSE streaming, per-section logcat parsing with buffer, `/:id/result` returns slim JSON without raw entries), `chat.ts` (LLM chat with tool calling), `settings.ts` (provider management), `history.ts` (CRUD, strips raw entries from response), `export.ts` (JSON/HTML), `compare.ts` (diff), `batch.ts` (multi-file, per-section logcat parsing), `search.ts` (FTS5/keyword logcat+kernel search, `source=logcat|kernel`, `buffer=main|system|events|crash|radio`)
- **LLM Gateway** (`llm-gateway/`): Provider-agnostic interface. All providers implement `LLMProvider` (chat, chatStream, isAvailable). Supported: Ollama, OpenAI, Gemini, Anthropic. `chatWithTools()` adds prompt-based tool calling loop (max 5 iterations).
- **Tool Calling** (`llm-gateway/tool-definitions.ts`, `tool-executor.ts`): 5 investigation tools (search_logcat, get_thread_info, get_kernel_events, get_insight_detail, search_section) executed against raw parsed data.
- **Prompt Templates** (`llm-gateway/prompt-templates/`): `analysis.ts` builds deep analysis prompt, `chat.ts` builds follow-up prompts, `context-builder.ts` composes analysis context
- **Database** (`db.ts`): SQLite via better-sqlite3, WAL mode. `analyses` table + `logcat_fts` FTS5 virtual table (with `pid`, `tid`, `buffer` columns) + `kernel_fts` FTS5 virtual table. FTS5 tables use DROP+CREATE on migration (no ALTER TABLE support).
- **Store** (`store.ts`): In-memory cache with 1-hour TTL, auto-syncs to SQLite via `history-store.ts`
- **Search** (`search/fts-indexer.ts`): FTS5 full-text search with BM25 ranking for logcat and kernel entries
- **Raw Data Store** (`raw-data-store.ts`): In-memory store for raw LogEntry[], sections (for agentic tool access)
- **Config** (`config.ts`): Environment-based, mutable at runtime via settings API. Includes `dbPath` for SQLite.

### Frontend (`@logcat-ai/frontend`)

React 19 + Vite 6 + Tailwind CSS 3.4 + D3.js. Three-phase UI: upload → analyzing → result.

- `hooks/useAnalysis.ts` — Central state management hook (upload, SSE progress, fetch result via REST, loadFromHistory)
- `hooks/useComparison.ts` — Comparison mode state management
- `hooks/useForceSimulation.ts` — D3 force simulation wrapper
- `lib/api.ts` — API client (upload, SSE via fetch+ReadableStream, chat, history, export, compare, batch, search)
- `lib/types.ts` — Frontend type definitions (mirrors parser types, includes AnalysisSummary, batch types)
- `lib/export-utils.ts` — Search result export utilities (CSV, logcat text format, dmesg text format, blob download)
- `components/LockGraphVisualization.tsx` — D3.js force-directed lock graph with deadlock highlighting
- `components/HistoryPanel.tsx` — Slide-out analysis history browser
- `components/ExportMenu.tsx` — JSON/HTML export dropdown
- `components/ComparisonView.tsx` — Side-by-side analysis diff modal
- `components/BatchUpload.tsx` — Multi-file drag-drop upload with SSE progress
- `components/BatchResults.tsx` — Batch analysis statistics dashboard
- `components/SearchModal.tsx` — Full-width search modal with Logcat/Kernel tab switcher (logcat: keyword, tag, buffer, level, pid filters; kernel: keyword, severity level filter), column headers, empty search to browse all entries, CSV/Text export

### MCP Server (`@logcat-ai/mcp-server`)

Standalone MCP (Model Context Protocol) server for Claude Desktop / VS Code integration. Uses `@modelcontextprotocol/sdk` with stdio transport.

- `src/index.ts` — Server entry, McpServer high-level API
- `src/tools.ts` — 3 MCP tools: `analyze_bugreport` (full pipeline), `search_history` (SQLite query), `ask_about_analysis` (keyword-routed Q&A)

## Key Conventions

- TypeScript strict mode, ES2022 target, Node16 module resolution (parser/backend)
- Backend imports parser as workspace dependency (`@logcat-ai/parser`)
- All parser module imports use `.js` extension (Node16 ESM convention)
- LLM providers use raw HTTP `fetch()` calls — no vendor SDKs
- SSE (Server-Sent Events) for real-time analysis progress streaming; frontend uses `fetch()` + `ReadableStream` (not `EventSource`) for reliable SSE through Vite proxy
- **SSE payload pattern**: Never send large objects (e.g. `AnalysisResult`) inline in SSE events — send a lightweight notification `{ id }` and let the frontend fetch full data via REST API. For large bugreports, `AnalysisResult` can exceed 200MB due to `logcatResult.entries`.
- **API response stripping**: `analyze/:id/result` and `history/:id` endpoints strip `logcatResult.entries` and `kernelResult.entries` from responses (raw entries remain in FTS5 index and `rawDataStore` for search API and chat tool access)
- Backend runs with `--max-old-space-size=4096` (4GB heap) to handle large bugreports (400K+ logcat entries)
- **Large array pattern**: Never use `push(...arr)` or `concat` for merging large arrays — use per-element `for (const e of arr) { target.push(e); }` to avoid stack overflow and memory spikes
- **Large string pattern**: Never use `content.split('\n')` on large strings (100MB+) — use regex exec + `content.slice()` or char-by-char iteration to avoid millions of intermediate string objects and GC pressure
- **Event bubbling in expandable cards**: `InsightCard` 的整個 div 有 `onClick` 控制展開/收合。內部互動元素（`<details>`、`<a>`、`<button>`）必須加 `e.stopPropagation()` 防止事件冒泡導致 card 意外收合
- Documentation and PRD are written in Traditional Chinese

## Android BSP Domain Knowledge

本專案的核心是解析 Android bugreport.zip，以下是理解程式碼所需的 Android 系統知識。

### Bugreport 結構

bugreport.zip 包含一個主文字檔（`bugreport-<device>-<date>.txt`）和附件目錄。主文字檔由 `------ SECTION_NAME (command) ------` 分隔的段落組成，每個段落對應一個 shell 指令的輸出（如 `logcat -d`、`cat /proc/meminfo`、`dmesg`）。`unpacker.ts` 負責拆解這些段落。附件中 `FS/data/anr/` 包含 ANR trace 檔案，`FS/data/tombstones/` 包含 native crash dump。

### ANR 分析（anr-parser.ts）

ANR（Application Not Responding）是 Android 最常見的穩定性問題。`anr-parser.ts` 實作了 18 種 ANR 分類：

| 分類 | 說明 | 辨識方式 |
|------|------|----------|
| `lock_contention` | 主執行緒等待鎖 | state=Blocked + waitingOnLock |
| `deadlock` | 循環等待死鎖 | DFS 偵測 lock graph 環路 |
| `io_on_main_thread` | 主執行緒做檔案 I/O | stack 含 SQLite/SharedPreferences/FileInputStream |
| `network_on_main_thread` | 主執行緒做網路 | stack 含 HttpURLConnection/OkHttp/Socket |
| `slow_binder_call` | 跨進程 IPC 呼叫卡住 | stack 含 BinderProxy.transact/IPCThreadState |
| `heavy_computation` | 主執行緒大量運算 | state=Runnable + 有 app frame |
| `expensive_rendering` | UI 渲染耗時 | stack 含 View.draw/measure/layout |
| `broadcast_blocking` | BroadcastReceiver 阻塞 | stack 含 BroadcastReceiver.onReceive |
| `slow_app_startup` | 應用啟動慢 | stack 含 handleBindApplication/Application.onCreate |
| `idle_main_thread` | 主執行緒閒置（可能是假 ANR） | stack 含 nativePollOnce/MessageQueue.next |
| `system_overload_candidate` | 系統過載 | state=Runnable 但無 app frame |
| `binder_pool_exhaustion` | Binder 執行緒池耗盡 | 所有 binder thread 都在忙碌 |
| `content_provider_slow` | ContentProvider 回應慢 | stack 含 ContentProvider$Transport |
| `no_stack_frames` | 無堆疊資訊 | stackFrames.length === 0 |

對於 `idle_main_thread` 和 `system_overload_candidate`，解析器會掃描其他執行緒（`scanOtherThreadsForBinderTargets`）尋找卡在 HAL/Binder 呼叫的執行緒，以輔助定位真正的根因。

### Binder / HAL Target 辨識

當 ANR 原因是 `slow_binder_call` 時，`extractBinderTarget()` 會從堆疊中辨識被呼叫的 HAL 介面：

- **HIDL 模式**：`at vendor.xxx.V1_0.IFoo.getService()` → 萃取 package + interface + method
- **AIDL 模式**：`at xxx.IFoo$Stub.asInterface()` → 同上
- **Native .so 模式**：`android.hardware.gnss@1.0.so (BpHwGnss::_hidl_start)` → 從共享函式庫名稱辨識
- **Vendor HAL .so**：`/vendor/lib64/hw/xxx-impl.so` → 從路徑辨識

這對 BSP 工程師至關重要，因為它能直接指出是哪個 vendor HAL 導致系統卡住。

### HAL 狀態分析（dumpsys-parser.ts）

`parseLshal()` 解析 `lshal --all` 的輸出，判斷每個 HAL service 的狀態：

- **alive**：行程存在且可回應
- **non-responsive**：已向 hwservicemanager 註冊但無回應
- **declared**：僅出現在 VINTF manifest 但未啟動

HAL 按照介面家族分組（同一介面不同版本歸同一家族），只關注最高版本的狀態。Vendor HAL 進一步區分為：

- **OEM HAL**：裝置製造商自行開發的 HAL（根據 manufacturer 名稱比對 vendor namespace）
- **BSP HAL**：晶片廠商隨 BSP 提供的 HAL（比對已知前綴：`qti/qualcomm/mediatek/mtk/sprd/samsung/nxp` 等）

當 `lshal` 輸出被截斷時（`truncated=true`），BSP HAL 的 non-responsive/declared 狀態不可信（是 lshal 被 kill 的產物），只有 OEM HAL 的狀態可參考。

### Logcat 異常偵測（logcat-parser.ts）

偵測 11 種異常類型：`anr`、`fatal_exception`、`native_crash`、`system_server_crash`、`oom`、`watchdog`、`binder_timeout`、`slow_operation`、`strict_mode`、`input_dispatching_timeout`、`hal_service_death`。每種透過 tag + message 的正規表達式比對，同一秒內相同 type+pid 的事件會去重。

### Kernel 事件偵測（kernel-parser.ts）

解析 dmesg 輸出，偵測 12 種事件：`kernel_panic`、`oom_kill`、`lowmemory_killer`、`kswapd_active`、`driver_error`、`gpu_error`、`thermal_shutdown`、`thermal_throttling`、`watchdog_reset`、`storage_io_error`、`suspend_resume_error`、`selinux_denial`。其中 `thermal_*` 和 `driver_error` 對 BSP 除錯特別重要。

### KERNEL LOG 段落格式差異

KERNEL LOG 段落的 command 可能是 `dmesg`（標準 dmesg 格式，`[timestamp] message`）或 `logcat -b kernel -v threadtime`（logcat 格式）。`kernel-parser.ts` 僅支援 dmesg 格式，logcat 格式會導致 0 entries、0 events。此時 `uptimeSeconds` 改由 `UPTIME (uptime)` 段落的 `uptime` 指令輸出解析（支援 `up N days, HH:MM` / `up HH:MM` / `up N min` 三種格式）。

### 健康評分（basic-analyzer.ts）

四維加權評分：stability(30%) + memory(25%) + responsiveness(25%) + kernel(20%)。使用頻率遞減扣分：同類型事件第 1 次扣全額、第 2 次扣 50%、第 3 次扣 25%、第 4 次起扣 10%，每類型有最大扣分上限，防止大量 SELinux denial 等重複事件將分數打到 0。

### Deep Analysis Prompt 結構

`context-builder.ts` 為每個 critical/warning insight 組建詳細上下文（原始 log、完整堆疊、blocking chain、±2 秒內的 W/E/F 日誌），並以 60K token 為上限進行裁剪。`analysis.ts` 將此上下文與裝置資訊、健康分數、HAL 交叉比對結果組合成 prompt，要求 LLM 輸出結構化 JSON（含 executiveSummary、correlationFindings、prioritizedActions、per-insight rootCause）。

### Deep Analysis Insight 篩選規則

`context-builder.ts` 的 `buildInsightContexts()` **只處理 `critical` 和 `warning` severity 的 insight**。新增的 insight card 若要被 Deep Analysis LLM 分析，severity 必須 ≥ `warning`；`info` 等級的 insight 不會送 LLM，也不會產生 `deepAnalysis` 欄位（rootCause、fixSuggestion 等）。若 insight source 不是標準 anomaly 類型（如 tag-based insights），需在 `context-builder.ts` 新增專屬的 context 收集函式。
