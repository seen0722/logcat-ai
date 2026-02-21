# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start all packages in watch/dev mode
npm run build            # Build all packages (tsc + vite)
npm run test             # Run Vitest across all packages
npm run lint             # ESLint on packages/*/src (.ts, .tsx)
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

## Architecture

TypeScript monorepo (npm workspaces) with three packages: `parser`, `backend`, `frontend`.

### Data Flow

```
bugreport.zip → [Upload API] → [Unpacker] → sections & raw files
  → [Parsers: logcat, ANR, kernel, dumpsys] → structured anomalies
  → [BasicAnalyzer] → AnalysisResult (health scores, insight cards)
  → [LLM Gateway] → DeepAnalysisOverview (root cause, fix suggestions)
  → [SSE stream] → Frontend UI → [Chat API] → follow-up Q&A
```

### Parser (`@logcat-ai/parser`)

Core parsing library, no runtime dependencies except `yauzl-promise` for ZIP extraction. All exports via `src/index.ts`.

- `unpacker.ts` — ZIP extraction, section splitting (logcat, ANR traces, kernel, dumpsys)
- `logcat-parser.ts` — 9 anomaly types (crash, ANR, watchdog, etc.)
- `anr-parser.ts` — 18 ANR case types, lock graph construction, deadlock detection
- `kernel-parser.ts` — 9 kernel event types
- `dumpsys-parser.ts` — meminfo, cpuinfo, lshal parsing
- `basic-analyzer.ts` — Rule-based analysis, health scoring (stability/memory/responsiveness/kernel), insight card generation
- `types.ts` — All shared type definitions used across packages

### Backend (`@logcat-ai/backend`)

Express.js API server. Loads `.env` from repo root (`../../.env` relative to package).

- **Routes**: `upload.ts` (Multer), `analyze.ts` (SSE streaming), `chat.ts` (LLM chat), `settings.ts` (provider management)
- **LLM Gateway** (`llm-gateway/`): Provider-agnostic interface. All providers implement `LLMProvider` (chat, chatStream, isAvailable). Supported: Ollama, OpenAI, Gemini, Anthropic.
- **Prompt Templates** (`llm-gateway/prompt-templates/`): `analysis.ts` builds deep analysis prompt, `chat.ts` builds follow-up prompts, `context-builder.ts` composes analysis context
- **Store** (`store.ts`): In-memory cache with 1-hour TTL for analysis results
- **Config** (`config.ts`): Environment-based, mutable at runtime via settings API

### Frontend (`@logcat-ai/frontend`)

React 19 + Vite 6 + Tailwind CSS 3.4. Three-phase UI: upload → analyzing → result.

- `hooks/useAnalysis.ts` — Central state management hook (upload, SSE progress, results)
- `lib/api.ts` — API client (upload, SSE analysis, chat, provider switching)
- `lib/types.ts` — Frontend type definitions (mirrors parser types)

## Key Conventions

- TypeScript strict mode, ES2022 target, Node16 module resolution (parser/backend)
- Backend imports parser as workspace dependency (`@logcat-ai/parser`)
- All parser module imports use `.js` extension (Node16 ESM convention)
- LLM providers use raw HTTP `fetch()` calls — no vendor SDKs
- SSE (Server-Sent Events) for real-time analysis progress streaming
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

### 健康評分（basic-analyzer.ts）

四維加權評分：stability(30%) + memory(25%) + responsiveness(25%) + kernel(20%)。使用頻率遞減扣分：同類型事件第 1 次扣全額、第 2 次扣 50%、第 3 次扣 25%、第 4 次起扣 10%，每類型有最大扣分上限，防止大量 SELinux denial 等重複事件將分數打到 0。

### Deep Analysis Prompt 結構

`context-builder.ts` 為每個 critical/warning insight 組建詳細上下文（原始 log、完整堆疊、blocking chain、±2 秒內的 W/E/F 日誌），並以 60K token 為上限進行裁剪。`analysis.ts` 將此上下文與裝置資訊、健康分數、HAL 交叉比對結果組合成 prompt，要求 LLM 輸出結構化 JSON（含 executiveSummary、correlationFindings、prioritizedActions、per-insight rootCause）。
