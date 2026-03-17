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

### E2E Testing (Playwright Test)

```bash
npm run e2e -w packages/frontend          # Run all 34 e2e tests (Playwright Test, ~1.5min)
npm run e2e:headed -w packages/frontend   # Run with visible browser
npm run e2e:report -w packages/frontend   # View HTML test report
npm run e2e:legacy -w packages/frontend   # Legacy screenshot-only test
```

36 Playwright Test specs across 11 files covering: upload/analysis flow, system overview, insights filters, timeline+search integration, search modal (Log Viewer with virtual scroll, live filtering, Find navigation), history panel, export menu, power overview, section nav, LLM settings, landing page, and FTS5 SQL fallback verification. Uses `global-setup.ts` to upload a sample bugreport once and share the analysis across all tests. Config: chromium only, 1440×900 viewport, `workers: 1`, auto-starts backend+frontend via `webServer`. Backend dev-only `POST /api/_test/clear-raw-store/:id` endpoint enables FTS5 fallback path testing.

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

- `unpacker.ts` — ZIP extraction, section splitting (logcat with buffer info, ANR traces, kernel, dumpsys), HW/SW metadata extraction from SYSTEM PROPERTIES (platform, hardware, cpuAbi, serialNumber, basebandVersion, bootloaderVersion, securityPatchLevel)
- `logcat-parser.ts` — 11 anomaly types (crash, ANR, watchdog, etc.); `parseLogcat(content, buffer?)` accepts optional buffer param; `detectAnomalies()` and `computeTagStats()` are exported for per-section parsing
- `anr-parser.ts` — 18 ANR case types, lock graph construction, deadlock detection
- `kernel-parser.ts` — 12 kernel event types; auto-detects dmesg vs `logcat -b kernel -v threadtime` format; returns `parseErrors` count for non-matching lines
- `dumpsys-parser.ts` — meminfo, cpuinfo, lshal parsing
- `tombstone-parser.ts` — Native crash backtrace, signal info, vendor crash detection
- `power-parser.ts` — Power management analysis: PowerManager state, DeviceIdle (Doze) state/settings, BatteryStats summary with Deep Doze discharge rate calculation, kernel wakelocks from CHECKIN format, alarm wakeup stats, kernel suspend statistics, estimated power use (component/UID-level), connectivity stats (cellular/WiFi/BT/GPS), partial wakelocks (top 20)
- `telephony-parser.ts` — Telephony analysis: ServiceState snapshot (voice/data reg state, operator with MCC/MNC fallback lookup, RAT, roaming), SignalStrength snapshot (LTE/NR/WCDMA/GSM/CDMA metrics with Integer.MAX_VALUE filtering), OOS event detection (start/end pairing with duration calculation), RIL error detection (7 types), call/SMS events, RAT change tracking, `parseDumpsysOosPeriods()` (cumulative OOS from dumpsys phone updateDataRoamingStatus, filters <30s boot init), `parseModemRestartCount()` (from dumpsys isub SIM state UNKNOWN cycles), radio log buffer time range
- `basic-analyzer.ts` — Rule-based analysis, health scoring (stability/memory/responsiveness/kernel), insight card generation, timeline↔insight linking
- `format-detector.ts` — Auto-detect standalone file format (logcat vs dmesg)
- `comparison.ts` — Compare two AnalysisResult objects (health, insights, ANR, HAL diff)
- `batch-analyzer.ts` — Aggregate statistics across multiple analyses
- `types.ts` — All shared type definitions used across packages (includes `LogcatBuffer`, `LogcatSection`, `LogEntry.buffer?`, `BugreportMetadata.buildType/.platform/.hardware/.cpuAbi/.serialNumber/.basebandVersion/.bootloaderVersion/.securityPatchLevel`, `KernelParseResult.parseErrors`, `PowerManagerState`, `DozeState`, `DozeSettings`, `BatteryStatsSummary`, `KernelWakeLockStat`, `AlarmWakeupStat`, `SuspendStats`, `PowerParseResult`, `EstimatedPowerUse`, `ConnectivityStats`, `PartialWakeLockStat`, `TelephonyParseResult`, `ServiceStateSnapshot`, `SignalStrengthSnapshot`, `OosEvent`, `RilError`, `CallEvent`, `SmsEvent`, `RatChangeEvent`, `DumpsysOosPeriod`)

### Backend (`@logcat-ai/backend`)

Express.js API server. Loads `.env` from repo root (`../../.env` relative to package).

- **Routes**: `upload.ts` (Multer, .zip/.txt/.log), `analyze.ts` (SSE streaming, per-section logcat parsing with buffer, `/:id/result` returns slim JSON without raw entries), `chat.ts` (LLM chat with tool calling), `settings.ts` (provider management), `history.ts` (CRUD, strips raw entries from response), `export.ts` (JSON/HTML/power-html), `compare.ts` (diff), `batch.ts` (multi-file, per-section logcat parsing), `search.ts` (FTS5/keyword logcat+kernel search, `source=logcat|kernel`, `buffer=main|system|events|crash|radio`, `startTime`/`endTime` for timestamp range filtering, `export=true` raises limit cap from 500 to 100K for full-result export)
- **Export** (`export/`): `json-exporter.ts`, `html-exporter.ts`, `power-report-exporter.ts`, `telephony-report-exporter.ts` for JSON/HTML/Power/Telephony Report self-contained dark-theme HTML generation. All HTML reports share `report-styles.ts` brand CSS (DM Serif Display + DM Sans, navy #0c1222, warm gold #d4a06a, accent blue #4f8ff7, TOC sidebar with scroll spy)
- **LLM Gateway** (`llm-gateway/`): Provider-agnostic interface. All providers implement `LLMProvider` (chat, chatStream, isAvailable). Supported: Ollama, OpenAI, Gemini, Anthropic. `chatWithTools()` adds prompt-based tool calling loop (max 5 iterations).
- **Tool Calling** (`llm-gateway/tool-definitions.ts`, `tool-executor.ts`): 5 investigation tools (search_logcat, get_thread_info, get_kernel_events, get_insight_detail, search_section) executed against raw parsed data.
- **Prompt Templates** (`llm-gateway/prompt-templates/`): `analysis.ts` builds deep analysis prompt, `chat.ts` builds follow-up prompts, `context-builder.ts` composes analysis context
- **Database** (`db.ts`): SQLite via better-sqlite3, WAL mode. `analyses` table + `logcat_fts` FTS5 virtual table (with `pid`, `tid`, `buffer` columns) + `kernel_fts` FTS5 virtual table. FTS5 tables use DROP+CREATE on migration (no ALTER TABLE support).
- **Store** (`store.ts`): In-memory cache with 1-hour TTL, auto-syncs to SQLite via `history-store.ts`
- **Search** (`search/fts-indexer.ts`): FTS5 full-text search with BM25 ranking for logcat and kernel entries, supports optional `startTime`/`endTime` timestamp range filtering (lexicographic comparison on `MM-DD HH:mm:ss.SSS` format)
- **Search ordering**: FTS5 path returns results by `ORDER BY rank` (BM25 relevance); in-memory path (when rawDataStore available) preserves chronological order. Time-range-only queries (no keyword) always use in-memory path → chronological. Pagination offset calculations must account for ordering differences between paths.
- **Raw Data Store** (`raw-data-store.ts`): In-memory store for raw LogEntry[], sections (for agentic tool access)
- **Config** (`config.ts`): Environment-based, mutable at runtime via settings API. Includes `dbPath` for SQLite.
- **Test Utils** (`routes/test-utils.ts`): Dev-only (`NODE_ENV !== 'production'`) route at `/api/_test/` — `POST /clear-raw-store/:id` clears rawDataStore for FTS5 fallback E2E testing

### Frontend (`@logcat-ai/frontend`)

React 19 + Vite 6 + Tailwind CSS 3.4 + D3.js. Three-phase UI: upload → analyzing → result.

- `hooks/useAnalysis.ts` — Central state management hook (upload, SSE progress, fetch result via REST, loadFromHistory)
- `hooks/useComparison.ts` — Comparison mode state management
- `hooks/useForceSimulation.ts` — D3 force simulation wrapper
- `lib/api.ts` — API client (upload, SSE via fetch+ReadableStream, chat, history, export with json/html/power-html formats, compare, batch, search)
- `lib/types.ts` — Frontend type definitions (mirrors parser types, includes AnalysisSummary, batch types)
- `lib/export-utils.ts` — Search result export utilities (CSV, logcat text format, dmesg text format, blob download)
- `components/LockGraphVisualization.tsx` — D3.js force-directed lock graph with deadlock highlighting
- `components/SectionNav.tsx` — Floating right-side TOC navigation (xl screens only), IntersectionObserver-based active section tracking, collapsible
- `components/Icons.tsx` — Custom SVG icon library (34 icons, stroke-based, currentColor). All UI icons are self-drawn — no Heroicons, no emoji
- `components/PowerOverview.tsx` — Power management: hero Doze rate display + 4 metric cards (Battery/OnBattery/DeepDoze/Suspend) always visible, details collapsible via centered "Show details" toggle. Doze settings diff-only format (non-AOSP values highlighted)
- `components/TelephonyOverview.tsx` — Telephony analysis: summary cards (Voice State, OOS Count, RIL Errors, Signal Level) always visible, details collapsible via "Show details" toggle. OOS Count prefers dumpsys data (full uptime) over radio log (buffer only ~2h). Modem restart badge, radio log time range hint, MCC/MNC operator name fallback. Detail section: dumpsys OOS periods table with fallback to radio log OOS events, RIL/Modem errors, call/SMS events, signal & RAT changes. Voice State card red bg when OOS
- `components/InsightsCards.tsx` — Insight list with severity filters; info-level insights hidden by default in "All" mode with "Show N more" button; same-type grouping (SELinux denials, normalized titles) into expandable groups
- `components/BSPQuickReference.tsx` — Conclusion-focused findings (boot issues, HAL problems, Doze rate) instead of raw data; vendor error tags as chips
- `components/ChatPanel.tsx` — Compact mode when no messages (suggested question buttons + input), expands to h-96 chat after first message
- `components/SystemOverview.tsx` — Hero device heading (T70 + manufacturer) with tag badges (Android ver, build type, boot status, uptime). Large Overall score ring (120px) + 4 dimension progress bars. Memory/CPU/HAL resource cards with usage bars. Collapsible "Show details" for HW & SW info
- `components/HistoryPanel.tsx` — Slide-out analysis history browser
- `components/ExportMenu.tsx` — JSON/HTML/Power/Telephony Report export dropdown; `hasPowerData?: boolean` and `hasTelephonyData?: boolean` props for conditional rendering
- `components/ComparisonView.tsx` — Side-by-side analysis diff modal
- `components/BatchUpload.tsx` — Multi-file drag-drop upload with SSE progress
- `components/BatchResults.tsx` — Batch analysis statistics dashboard
- `components/SearchModal.tsx` — Log Viewer modal with react-window v2 virtual scroll (`FixedSizeList`, ROW_HEIGHT=28). Logcat/Kernel tab switcher. Auto-loads all entries via `export=true` API (up to 50K). Client-side live filtering (level/pid/buffer/tag via useMemo, no server round-trip). Find keyword with `Enter`/`Shift+Enter` for Next/Prev match navigation + `▲▼` buttons + match counter (`3/47`). "Load Range" button for time range changes (only action requiring API call). `initialFocusTime` support: `▶` marker + indigo border on closest entry, auto-scrollToRow. CSV/Text export from client memory (synchronous). No pagination — continuous scroll
- `components/Timeline.tsx` — Timeline event list with severity/source filters; hover reveals search icon (magnifying glass) that opens SearchModal with ±5s time window around the event timestamp (via `onSearchTime` prop). Original insightId click-to-scroll behavior preserved with `e.stopPropagation()`

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
- **Result page section IDs**: Each major section in the result page has `id="section-*"` (overview, tags, power, bsp, deep, insights, anr, timeline, chat) for SectionNav anchor navigation. Conditional sections (power, tags, anr, deep) must wrap the `id` div inside the condition to avoid orphan anchors
- **Collapsible detail pattern**: Power and BSP sections use `useState` toggle for show/hide details. Key metrics always visible, secondary data behind "Show details" button
- **SearchModal virtual scroll**: Uses react-window v2 `List` with `useListRef`. `focusIndex` must be state (not ref) so `rowProps` useMemo dependency triggers re-render for focus marker visibility
- **ANR severity**: All ANR types are classified as `critical` severity (`anrSeverity()` in `basic-analyzer.ts`), including `idle_main_thread`. Health score deduction for idle_main_thread: 10 per occurrence, cap 30
- **Design system**: Frontend uses brand design system unified with personal resume site — DM Serif Display headings, DM Sans body, SF Mono code. Colors: surface #0c1222, accent #4f8ff7, warm #d4a06a. All icons from `Icons.tsx` (34 custom SVGs). CSS utility classes: `card`, `btn-primary`/`btn-warm`/`btn-outline`/`btn-ghost`, `glass`, `section-title`, `stagger-children`. HTML export reports share `report-styles.ts` brand CSS
- **History store stripping**: `historyStore.save()` strips `logcatResult.entries` and `kernelResult.entries` before `JSON.stringify()` to avoid V8 string length limit crash for large bugreports (1M+ entries → 200MB+ JSON)
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

解析 kernel log 輸出，偵測 12 種事件：`kernel_panic`、`oom_kill`、`lowmemory_killer`、`kswapd_active`、`driver_error`、`gpu_error`、`thermal_shutdown`、`thermal_throttling`、`watchdog_reset`、`storage_io_error`、`suspend_resume_error`、`selinux_denial`。其中 `thermal_*` 和 `driver_error` 對 BSP 除錯特別重要。

### KERNEL LOG 段落格式差異

KERNEL LOG 段落的 command 可能是 `dmesg`（標準 dmesg 格式，`[timestamp] message`）或 `logcat -b kernel -v threadtime`（logcat 格式，常見於 `userdebug` build）。`kernel-parser.ts` 透過掃描前 10 行自動偵測格式：

- **dmesg 格式**：`<6>[ 3772.736783] message` — timestamp 為 boot 後秒數，直接使用；`<N>` 為 syslog priority（facility*8 + severity），解析時用 `priority & 7` 取低 3 位元得到真正的 kernel severity（0-7），例如 `<14>` → severity 6 (INFO)、`<11>` → severity 3 (ERR)
- **logcat 格式**：`02-08 14:01:56.821  root  0  0 I  tag : message` — timestamp 為 `MM-DD HH:mm:ss.SSS`，轉為相對第一筆 entry 的秒數差；logcat level 映射為 kernel level（`F→<0>`, `E→<3>`, `W→<4>`, `I→<6>`, `D/V→<7>`）

兩種格式最終產出相同的 `KernelLogEntry[]`，下游 `detectKernelEvents()` 不需區分。當 KERNEL LOG 為 logcat 格式且無 dmesg timestamp 時，`uptimeSeconds` 改由 `UPTIME (uptime)` 段落解析（支援 `up N days, HH:MM` / `up HH:MM` / `up N min` 三種格式）。

### Build Type（unpacker.ts）

`BugreportMetadata.buildType` 從 `ro.build.type` system property 提取，值為 `user`、`userdebug`、`eng` 或 `unknown`。`userdebug` build 的 KERNEL LOG 通常使用 logcat 格式而非 dmesg。前端 `SystemOverview` 對非 `user` build 顯示黃色警示標籤。

### 健康評分（basic-analyzer.ts）

四維加權評分：stability(30%) + memory(25%) + responsiveness(25%) + kernel(20%)。使用頻率遞減扣分：同類型事件第 1 次扣全額、第 2 次扣 50%、第 3 次扣 25%、第 4 次起扣 10%，每類型有最大扣分上限，防止大量 SELinux denial 等重複事件將分數打到 0。

### Deep Analysis Prompt 結構

`context-builder.ts` 為每個 critical/warning insight 組建詳細上下文（原始 log、完整堆疊、blocking chain、±2 秒內的 W/E/F 日誌），並以 60K token 為上限進行裁剪。`analysis.ts` 將此上下文與裝置資訊、健康分數、HAL 交叉比對結果組合成 prompt，要求 LLM 輸出結構化 JSON（含 executiveSummary、correlationFindings、prioritizedActions、per-insight rootCause）。

### Deep Analysis Insight 篩選規則

`context-builder.ts` 的 `buildInsightContexts()` **只處理 `critical` 和 `warning` severity 的 insight**。新增的 insight card 若要被 Deep Analysis LLM 分析，severity 必須 ≥ `warning`；`info` 等級的 insight 不會送 LLM，也不會產生 `deepAnalysis` 欄位（rootCause、fixSuggestion 等）。若 insight source 不是標準 anomaly 類型（如 tag-based insights），需在 `context-builder.ts` 新增專屬的 context 收集函式。

### Power Management 分析（power-parser.ts）

解析 bugreport 中的電源管理相關段落，提供 Doze 狀態、suspend 行為、電池放電率等分析：

- **PowerManager State**：從 `DUMPSYS POWER` 解析 wakefulness、active wakelocks、suspend blockers
- **DeviceIdle (Doze)**：從 `DUMPSYS DEVICEIDLE` 解析 Deep/Light Doze 狀態與設定參數（idle_to, idle_factor, max_idle_to 等），可與 AOSP 預設值比較
- **BatteryStats**：從 `DUMPSYS BATTERYSTATS` 的 `Statistics since last charge:` 區塊提取預計算統計值，自動計算 Deep Doze 放電率（mAh/h）
- **Kernel Wakelocks**：從 `CHECKIN BATTERYSTATS` 的 `9,0,l,kwl` 行提取 top kernel wakelocks（by totalTimeMs）
- **Alarm Stats**：從 `DUMPSYS ALARM` 的 `Alarm Stats:` 區塊提取 per-app alarm wakeup 統計
- **Suspend Stats**：優先從 `DUMPSYS SUSPEND_CONTROL_INTERNAL` 的 `----- Suspend Stats -----` 段落解析 kernel `/sys/power/suspend_stats` 計數器（user/userdebug build 均有，不受 log buffer 溢出影響），再與 kernel log entries 的 abort/wakeup source 明細合併（`source: 'merged'`）。僅有 kernel log 時 fallback 為純 kernel log 統計（`source: 'kernel_log'`）
- **段落辨識**：不靠段落名稱，靠內容特徵（`mWakefulness=`, `DeviceIdleController`, `Statistics since last charge:` 等）
- **Power 分析腳本**：`analyze-power.mjs` 已移至 `~/.claude/skills/power-analysis/`（GitHub: `seen0722/claude-skills`），需設定 `LOGCAT_AI_ROOT` 環境變數指向本專案根目錄，可從任何目錄執行
