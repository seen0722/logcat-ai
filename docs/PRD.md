# AI Bugreport Analyzer — 產品需求文件 (PRD)

> **版本**：v0.2.0
> **更新日期**：2026-02-23
> **狀態**：Phase 1 完成，Phase 1.5 進行中（11/13 完成）

---

## 1. 產品概述

### 1.1 背景與動機

Android 裝置在發生異常時會產生 `bugreport.zip`，內含完整的系統狀態快照：logcat、ANR traces、kernel log、dumpsys 等。然而目前市場上**沒有工具能完整做到**：

```
解壓 bugreport.zip → 結構化解析 → AI 自動診斷根因
```

- **Sony ChkBugReport** — 已停止維護（archived）
- **Mozilla anr-analyzer** — 已停止維護（archived）
- **商業服務**（Firebase Crashlytics、Sentry、Embrace）— 走 SDK 即時捕捉路線，不分析離線 bugreport
- **Perfetto / Battery Historian** — 效能追蹤工具，不做 AI 診斷

特別是 `bugreport.zip` 中 `/data/anr/` 的 ANR trace 檔案，**幾乎沒有工具會去深入解析**，但這些 trace 包含了最關鍵的線程狀態、鎖依賴、堆疊資訊。

### 1.2 產品定位

為內部團隊打造 **AI 驅動的 bugreport.zip 離線分析工具**，填補市場空白：
- 上傳 bugreport.zip → 自動解壓、解析、診斷
- 涵蓋 ANR trace 深度解析（18 種 ANR case）
- 雙模式分析：快速規則分析 + LLM 深度推理
- 封閉內網可部署，資料零外洩

### 1.3 目標使用者

- 內部 Android 系統工程師
- QA / 測試工程師
- 技術支援團隊

透過瀏覽器存取 Web UI，無需安裝客戶端。

---

## 2. 競品分析

### 2.1 logcat.ai（最接近的競品）

logcat.ai 是目前唯一提供 AI logcat 分析的雲端產品，我們從中學到了雙模式分析和 Insights Cards 設計。

| 面向 | logcat.ai | 我們的差異化 |
|------|-----------|-------------|
| 部署 | 雲端 SaaS | 封閉內網本地部署（資料零外洩） |
| 輸入 | 純 logcat 文字貼上 | bugreport.zip 完整解析（含 ANR traces、kernel log） |
| 分析模式 | Quick Search + Deep Research | 採用相同雙模式設計 |
| ANR 深度 | 僅從 logcat 判斷 ANR | 解析 /data/anr/ traces，18 種 ANR case 偵測 |
| 輸出 | Insights Cards + 對話 | 採用 Insights Cards + 對話追問 |
| 費用 | 按次收費（$0.5-$5/次） | 免費（內部工具） |
| 隱私 | 資料上傳至雲端 | 資料不出內網 |

### 2.2 其他工具比較

| 工具 | 類型 | ANR 分析 | AI 診斷 | 離線分析 | 狀態 |
|------|------|---------|---------|---------|------|
| Battery Historian | 開源 | 不支援 | 不支援 | 部分 | 維護中 |
| Perfetto | 開源 | trace 分析 | 不支援 | 效能追蹤 | 活躍 |
| Firebase Crashlytics | 商業 | 即時 ANR | 不支援 | SDK 模式 | 活躍 |
| Sentry | 商業 | 即時 ANR | 不支援 | SDK 模式 | 活躍 |
| ChkBugReport | 開源 | 基本 | 不支援 | bugreport | 已停維 |
| **本產品** | **內部** | **18 種 case** | **LLM 推理** | **bugreport.zip** | **開發中** |

---

## 3. 功能規格

### 3.1 核心功能流程

```
使用者上傳 bugreport.zip
        │
        ▼
  ┌─────────────┐
  │   Unpacker   │  解壓 ZIP → 切割段落 → 提取裝置資訊
  └──────┬──────┘
         │
    ┌────┴────┬──────────┬─────────────┐
    ▼         ▼          ▼             ▼
┌────────┐┌────────┐┌────────┐┌───────────┐
│ Logcat ││  ANR   ││ Kernel ││ Tombstone │  四個 Parser 平行解析
│ Parser ││ Parser ││ Parser ││  Parser   │
└───┬────┘└───┬────┘└───┬────┘└─────┬─────┘
    └────┬────┴─────────┴───────────┘
         ▼
  ┌──────────────┐
  │Basic Analyzer│  純規則分析（不需 LLM）
  └──────┬───────┘
         │
         ├─── Quick Analysis 結果（< 5 秒）
         │
         ▼
  ┌──────────────┐
  │ LLM Gateway  │  Deep Analysis（30s - 2min）
  └──────┬───────┘
         │
         ▼
    分析報告 + 對話追問
```

### 3.2 輸入設計（三層）

| 層級 | 內容 | 必填 | 說明 |
|------|------|------|------|
| 第一層 | bugreport.zip 上傳 | 必填 | 拖曳或點擊上傳 |
| 第二層 | 問題描述 | 選填 | 自由文字，引導 AI 聚焦方向 |
| 第三層 | 快速標籤 | 選填 | ANR / Crash / Reboot / 耗電 / 卡頓 / 記憶體不足 |

### 3.3 雙模式分析

#### Quick Analysis（快速分析）
- **耗時**：< 5 秒
- **引擎**：Parser + Basic Analyzer（純規則，不經 LLM）
- **輸出**：Insights Cards + 時間軸 + 系統健康分數
- **適用**：快速掃描、已知問題確認、大量 bugreport 批次篩選
- **價值**：即使 LLM 不可用仍能提供 70% 分析能力

#### Deep Analysis（深度分析）
- **耗時**：30 秒 - 2 分鐘
- **引擎**：LLM Gateway（Ollama / OpenAI / Gemini）
- **輸入**：Parser + Basic Analyzer 產出的結構化摘要（幾 KB）
- **輸出**：根因推理 + 交叉比對 + 修復建議
- **特色**：若使用者提供問題描述，AI 會聚焦在對應方向

#### Enhanced Deep Analysis（v0.2.0 新增）
- **Context Builder**：提供 targeted context 給 LLM（`context-builder.ts`）
  - Full stack trace（ANR blocking chain 完整堆疊）
  - Blocking chain stacks（鎖依賴相關線程堆疊）
  - Temporal window（事件前後的 logcat context）
  - Token budget 控制（60K tokens 上限，避免超出 LLM context window）
- **結構化輸出**：LLM 回傳 JSON 格式，每個 insight 包含：
  - `evidence`：支持此診斷的具體 log 證據
  - `category`：問題分類（anr / crash / memory / kernel / performance / stability）
  - `debuggingSteps`：逐步 debug 指引
  - `impact`：影響範圍描述
  - `affectedComponents`：受影響的系統元件清單
  - `relatedInsights`：關聯的其他 insight（交叉比對）
- **DeepAnalysisOverview**：executive summary 元件
  - System Diagnosis（系統整體診斷）
  - Correlation Findings（跨子系統交叉比對發現）
  - Prioritized Actions（依優先級排序的建議動作）
- **Backward Compatible**：支援舊版 array 格式回應，確保不同 LLM 能力的相容性

### 3.4 輸出設計

#### Insights Cards
每個偵測到的問題一張卡片：
- 嚴重性標籤：Critical（紅）/ Warning（黃）/ Info（綠）
- 問題類別：ANR / Crash / Memory / Kernel / Performance / Stability
- 一句話摘要（Quick Analysis 產出）
- 可展開詳情：完整分析、相關 log 片段、stack trace
- Deep Analysis 補充：根因推理 + 修復建議（LLM 產出）
- 卡片按嚴重性排序，Critical 在最上方
- **Deep Analysis 增強欄位**（v0.2.0）：
  - Evidence（證據）：LLM 標注的具體 log 行
  - Debugging Steps（debug 步驟）：逐步排查指引
  - Impact / Affected Components：影響範圍與受影響元件
  - Related Insights：與其他 insight 的關聯性

#### 其他輸出元件
- **四階段進度條**：上傳 → 解壓解析 → 規則分析 → AI 深度分析
- **跨子系統時間軸**：Logcat + ANR + Kernel 事件整合視覺化
- **ANR 詳情面板**：主線程 stack、Lock Dependency Graph、阻塞鏈
- **系統概覽卡**：裝置型號、Android 版本、build fingerprint、系統健康分數
- **對話追問面板**：Deep Analysis 完成後，可用自然語言追問

---

## 4. Parser 技術規格

### 4.1 Unpacker

解壓 `bugreport.zip` 並結構化：
- 用正則 `------ SECTION_NAME (command) ------` 切割主 bugreport.txt
- 辨識 Android 版本、裝置型號、build fingerprint
- 提取 `FS/data/anr/` 下的 ANR trace 檔案
- 提取 `FS/data/tombstones/` 下的 tombstone 檔案

### 4.2 Logcat Parser

解析每行為結構化資料：

```
{timestamp, pid, tid, level, tag, message}
```

異常偵測規則（11 種）：
| 類型 | 比對方式 | 嚴重性 |
|------|---------|--------|
| ANR | `ActivityManager` + `ANR in` | Critical |
| Fatal Exception | `AndroidRuntime` + `FATAL EXCEPTION` | Critical |
| Native Crash | `DEBUG` + `signal` | Critical |
| System Server Crash | `FATAL EXCEPTION` + `system_server` | Critical |
| OOM | `Out of memory` / `lowmemorykiller` | Critical |
| Watchdog | `WATCHDOG KILLING` / `Blocked in` | Critical |
| Input Dispatching Timeout | `Input dispatching timed out` | Critical |
| Binder Timeout | `Binder transaction timeout` | Warning |
| Slow Operation | `Looper` + `Slow` | Warning |
| HAL Service Death | `hwservicemanager` + `died/restart` | Warning |
| StrictMode | `StrictMode` + `violation` | Info |

### 4.3 ANR Trace Parser（核心）

解析 `/data/anr/` trace 檔案中的線程狀態：

**解析內容：**
- 線程 header：name、priority、tid、state（Runnable/Blocked/Waiting/Native...）
- Stack frames：className、methodName、fileName、lineNumber
- 鎖資訊：`waiting to lock <addr> held by thread N` + `locked <addr>`
- Lock Dependency Graph 建構
- DFS Deadlock 偵測（環偵測）
- Binder 線程池飽和度分析
- Blocking Chain 追蹤（main → thread A → thread B → ...）

### 4.4 ANR 偵測覆蓋的 18 種 Case

#### 純 ANR Trace 可偵測（14 種）

| # | Case | 偵測方式 | 信心度 |
|---|------|---------|--------|
| 1 | Lock Contention | `state=Blocked` + `waiting to lock` | High |
| 2 | Deadlock | Lock Graph DFS 找環 | High |
| 3 | I/O on Main Thread | Stack 含 SQLite/SharedPreferences/FileInputStream | High |
| 4 | Network on Main Thread | Stack 含 HttpURLConnection/OkHttp/Socket | High |
| 5 | Slow Binder Call | Stack 含 `BinderProxy.transact` | High |
| 6 | Heavy Computation | `state=Runnable` + app 自己的 stack frame | Medium |
| 7 | Expensive Rendering | Stack 含 draw/measure/layout/inflate | High |
| 8 | Broadcast Blocking | Stack 含 `onReceive` | High |
| 9 | Slow App Startup | Stack 含 `handleBindApplication` | High |
| 10 | nativePollOnce 假 ANR | Stack 含 `MessageQueue.nativePollOnce` | Low |
| 11 | No Stack Frames | stack 為空 | Low |
| 12 | System Overload | `state=Runnable` 但無 app stack | Low |
| 13 | Binder Pool Exhaustion | 所有 binder 線程都非閒置 | High |
| 14 | Content Provider Slow | Stack 含 `ContentProvider$Transport.query` | High |

#### 需搭配 Logcat（+2 種）

| # | Case | 偵測方式 |
|---|------|---------|
| 15 | Consecutive Binder Calls | `binder_sample` 頻率分析 |
| 16 | goAsync 未 finish | BR 超時日誌但無對應完成日誌 |

#### 需搭配 Kernel Log（+1 種）

| # | Case | 偵測方式 |
|---|------|---------|
| 17 | OOM/Memory Pressure | lowmemorykiller + kswapd 活躍 |

#### 較難偵測（+1 種）

| # | Case | 說明 |
|---|------|------|
| 18 | GPU Hang | 需 driver error 日誌，偵測到通常不可修 |

### 4.5 Kernel Log Parser

解析 dmesg 格式，偵測 12 種事件：

| 類型 | 嚴重性 | 偵測方式 |
|------|--------|---------|
| Kernel Panic | Critical | `/Kernel panic/` |
| OOM Kill | Critical | `/Out of memory: Kill process/` |
| Thermal Shutdown | Critical | `/thermal.*shutdown/` |
| Watchdog Reset | Critical | `/watchdog.*(reset\|bark)/` |
| Low Memory Killer | Warning | `/lowmemorykiller/` |
| kswapd Active | Warning | `/kswapd.*active/` |
| Driver Error | Warning | `/error.*driver/` |
| GPU Error | Warning | `/gpu.*(fault\|error\|hang)/` |
| Thermal Throttling | Warning | `/thermal.*throttl/` |
| Storage I/O Error | Warning | `/mmc.*error\|EXT4-fs error/` |
| Suspend/Resume Error | Warning | `/suspend.*abort\|resume.*fail/` |
| SELinux Denial | Info | `/avc: denied/` |

### 4.6 Tombstone Parser（Native Crash）

解析 `FS/data/tombstones/` 下的 native crash dump 檔案（文字版，跳過 `.pb` protobuf）：

**解析內容：**
- Header：Build fingerprint、ABI（arm64/arm/x86_64/x86）、Timestamp
- Process info：pid、tid、process name、thread name
- Signal info：signal number + name（SIGSEGV/SIGABRT/SIGBUS/SIGFPE/SIGILL/SIGTRAP）、signal code（SEGV_MAPERR 等）、fault address
- Abort message（SIGABRT 時）
- Registers：arm64 x0-x28/lr/sp/pc 或 arm r0-r15
- Backtrace：frame number、PC、binary path、function name + offset、BuildId
- Vendor crash 偵測：top frame binary 在 `/vendor/` 或 `/odm/` 路徑下

**整合至 Basic Analyzer：**
- 產出 critical severity InsightCard（category: crash, source: tombstone）
- Timeline 新增 tombstone 事件
- Health Score stability 子分數扣分（15 分/crash，frequency damping，max 40）

### 4.7 Basic Analyzer（純規則引擎）

不需要 LLM 即可完成：
- 聚合三個 Parser 的結果（含 dumpsys meminfo/cpuinfo）
- 產出 Insights Cards（問題清單，按嚴重性排序，自動合併重複項）
- 建構跨子系統時間軸（含事件聚合，相鄰重複事件自動合併顯示次數）
- 計算系統健康分數（0-100，breakdown: stability/memory/responsiveness/kernel）
  - **Frequency-based damping**：同類事件重複出現時遞減扣分（1st=100%, 2nd=50%, 3rd=25%, 4th+=10%）
  - 每種事件類型有最大扣分上限，防止大量重複事件將分數拉到 0
- Boot 狀態分析（sys.boot_completed、boot reason、system_server restart count）
- 資源監控 Insights（低記憶體 <10%、高 CPU >80%、高 I/O wait >20%）
- **完成 Basic Analyzer 即提供 70% 的分析價值**

---

## 5. LLM Gateway 設計

### 5.1 架構

統一抽象層，後端透過 Gateway 與任意 LLM 互動，切換 provider 只需改配置。

```
llm-gateway/
├── llm-gateway.ts        # 統一介面 + Provider 路由
├── providers/
│   ├── base-provider.ts  # 抽象基類
│   ├── ollama.ts         # Ollama（內網本地 LLM）
│   ├── openai.ts         # OpenAI API（GPT-4o 等）
│   ├── gemini.ts         # Google Gemini API
│   └── anthropic.ts      # Anthropic Claude API（預留）
├── prompt-templates/
│   ├── analysis.ts       # 分析用 prompt 模板
│   ├── chat.ts           # 對話追問用 prompt 模板
│   └── context-builder.ts # Deep Analysis targeted context 建構（v0.2.0）
└── types.ts
```

### 5.2 統一介面

```typescript
interface LLMProvider {
  id: string;
  chat(req: LLMRequest): Promise<LLMResponse>;
  chatStream(req: LLMRequest): AsyncIterable<StreamChunk>;
  isAvailable(): Promise<boolean>;
}

interface LLMGateway {
  analyze(prompt: AnalysisPrompt): AsyncIterable<StreamChunk>;
  chat(messages: ChatMessage[]): AsyncIterable<StreamChunk>;
  listProviders(): ProviderStatus[];
}
```

### 5.3 Provider 支援

| Provider | API 格式 | 適用場景 |
|----------|---------|---------|
| Ollama | `POST /api/chat` | 封閉內網、資料敏感 |
| OpenAI | `POST /v1/chat/completions` | 有外網、GPT-4o 能力 |
| Gemini | `POST /v1/models/...:streamGenerateContent` | 有外網、替代選擇 |
| Anthropic | `POST /v1/messages` | 有外網、預留擴充 |

### 5.4 配置方式

```bash
# 環境變數
LLM_PROVIDER=ollama              # ollama | openai | gemini | anthropic
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:72b

# 商用 LLM（選填）
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash
```

另外提供 Web UI 設定頁面：
- 下拉選擇 LLM Provider
- 顯示連線狀態（綠燈/紅燈）
- 配置 API Key、模型名稱、temperature

### 5.5 Streaming

所有 Provider 的 streaming response 統一轉為 `AsyncIterable<StreamChunk>`，後端透過 SSE 即時推送前端，不管底層用哪個 Provider 體驗一致。

---

## 6. 技術架構

### 6.1 技術棧

| 元件 | 技術 | 理由 |
|------|------|------|
| 語言 | TypeScript (全棧) | 統一前後端語言 |
| 前端 | React + Vite + shadcn/ui | 現成 Upload/Progress/Timeline 元件 |
| 後端 | Node.js + Express | 輕量、TS 原生 |
| LLM Gateway | Ollama / OpenAI / Gemini | 可切換，內外網皆可 |
| ZIP 解壓 | yauzl-promise (後端) | streaming 解壓，記憶體效率高 |
| 進度推送 | Server-Sent Events (SSE) | 單向推送足夠 |
| 容器化 | Docker + Docker Compose | 一鍵部署 |

### 6.2 Monorepo 結構

```
logcat-ai/
├── docker-compose.yml
├── docs/
│   ├── PRD.md                   # 本文件
│   └── TODO.md                  # 結構化 TODO 追蹤
├── packages/
│   ├── parser/                  # 核心 Parser 模組
│   │   ├── src/
│   │   │   ├── types.ts         # 共用型別定義
│   │   │   ├── unpacker.ts      # ZIP 解壓 + 段落切割
│   │   │   ├── logcat-parser.ts # Logcat 解析（11 種異常偵測）
│   │   │   ├── anr-parser.ts    # ANR Trace 解析（18-case）
│   │   │   ├── kernel-parser.ts # Kernel Log 解析（12 種事件偵測）
│   │   │   ├── dumpsys-parser.ts # Dumpsys meminfo/cpuinfo 解析
│   │   │   ├── tombstone-parser.ts # Tombstone native crash 解析
│   │   │   └── basic-analyzer.ts # 規則引擎 + Health Score（frequency damping）
│   │   └── tests/
│   ├── backend/                 # API Server
│   │   └── src/
│   │       ├── server.ts
│   │       ├── routes/          # upload, analyze, chat, settings
│   │       ├── llm-gateway/     # LLM Gateway
│   │       └── config.ts
│   └── frontend/                # Web UI
│       └── src/components/
│           ├── UploadZone.tsx
│           ├── AnalysisMode.tsx
│           ├── ProgressView.tsx
│           ├── InsightsCards.tsx
│           ├── InsightCard.tsx
│           ├── SystemOverview.tsx
│           ├── Timeline.tsx
│           ├── ANRDetail.tsx
│           ├── DeepAnalysisOverview.tsx
│           ├── StackTrace.tsx
│           ├── ChatPanel.tsx
│           └── ReportExport.tsx
└── sample-bugreports/
```

### 6.3 API 設計

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/api/upload` | 上傳 bugreport.zip |
| GET | `/api/analyze/:id` | 啟動分析（SSE 串流進度） |
| POST | `/api/chat/:id` | 對話追問 |
| GET | `/api/settings/providers` | 取得 LLM Provider 列表 |
| PUT | `/api/settings/provider` | 切換 LLM Provider |

---

## 7. 部署方案

### 7.1 Docker Compose

```yaml
services:
  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes:
      - ./models:/root/.ollama/models
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    profiles: ["local-llm"]

  backend:
    build: ./packages/backend
    ports: ["8000:8000"]
    environment:
      - LLM_PROVIDER=ollama
      - OLLAMA_BASE_URL=http://ollama:11434
      - OLLAMA_MODEL=qwen2.5:72b
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o}

  frontend:
    build: ./packages/frontend
    ports: ["3000:3000"]
    depends_on: [backend]
```

### 7.2 部署模式

| 模式 | 指令 | 說明 |
|------|------|------|
| 內網部署 | `docker compose --profile local-llm up` | 啟動 Ollama + 全部服務 |
| 外網部署 | `docker compose up` | 使用商用 LLM API |

### 7.3 硬體需求

| 元件 | 最低需求 | 建議 |
|------|---------|------|
| CPU | 4 cores | 8+ cores |
| RAM | 16GB | 64GB+（LLM 推理需要） |
| GPU | - | NVIDIA A100/H100（本地 LLM）|
| 磁碟 | 50GB | 200GB+（含模型檔） |

---

## 8. 開發時程

### 8.1 Phase 1：MVP（5 週）

```
Week 1-2: Parser 核心 + 型別系統
  ├── 專案初始化（monorepo + TypeScript + Vitest）
  ├── types.ts 完整型別定義
  ├── unpacker.ts + 測試
  ├── logcat-parser.ts + 異常偵測 + 測試
  ├── anr-parser.ts + Lock Graph + Deadlock + 18-case + 測試
  └── kernel-parser.ts + 測試

Week 3: Basic Analyzer + Backend + LLM Gateway
  ├── basic-analyzer.ts（純規則分析 + Insights 產出）
  ├── LLM Gateway 統一介面
  ├── Ollama / OpenAI / Gemini Provider
  ├── Express server + routes + SSE
  └── Quick Analysis 端對端可運行

Week 4: Frontend UI
  ├── UploadZone + ProgressView
  ├── InsightsCards（嚴重性排序）
  ├── SystemOverview + Timeline
  ├── ANRDetail 面板
  └── Quick Analysis 完整可用

Week 5: Deep Analysis + 部署
  ├── Deep Analysis（LLM Streaming + SSE）
  ├── ChatPanel 對話追問
  ├── Docker Compose 部署
  └── 端對端測試
```

### 8.2 Phase 2：進階功能（Phase 1 完成後）

- 對話追問加入 Function Calling（LLM 可主動搜尋 logcat、查線程）
- Embedding + Vector Store（RAG 語意搜尋大型 logcat）
- 比較模式（兩份 bugreport 差異分析）
- Lock Graph 視覺化（D3.js 力導向圖）
- 分析報告匯出（JSON / HTML / PDF）
- 歷史分析記錄（SQLite 儲存）
- 批次分析（多份 bugreport 統計共同問題）

---

## 9. 專案管理

### 9.1 追蹤策略

GitHub Issues + Project Board：
- **4 個 Milestones** 對應 Week 1-5 + Phase 1.5
- **42 個 Issues** 涵蓋所有工作項目（#1-#29 已完成，#30-#42 Phase 1.5）
- **Labels**：parser / backend / llm-gateway / frontend / infra / test + P0/P1/P2

### 9.2 每日工作流

1. 開啟 GitHub Project Board 看當天的 Issue
2. 將 Issue 拖到 In Progress
3. 開分支 `feat/#N-description`，開發完 PR merge
4. PR 關聯 `closes #N`，Issue 自動移到 Done

---

## 10. 驗證方式

| 驗證項目 | 方法 | 標準 |
|---------|------|------|
| Parser 正確性 | 準備 3-5 份已知問題的 bugreport.zip | 各 Parser 解析結果與預期一致 |
| ANR 偵測 | 18 種 ANR case 各準備測試 trace | 分類正確率 > 90% |
| 端對端 | 上傳 → 進度 → 報告 → 追問 | 全流程可運行 |
| LLM 品質 | 對比有/無問題描述的分析結果 | Deep Analysis 提供有價值的根因推理 |

---

## 11. 目前進度

### Week 1-2: Parser 核心 + 型別系統 ✅

| Issue | 內容 | 狀態 | 測試 |
|-------|------|------|------|
| #1 | 專案初始化（monorepo + TypeScript + Vitest） | ✅ 完成 | - |
| #2 | types.ts 完整型別定義 | ✅ 完成 | 編譯通過 |
| #3 | unpacker.ts（ZIP 解壓 + 段落切割） | ✅ 完成 | 5 tests passed |
| #4 | logcat-parser.ts（9 種異常偵測） | ✅ 完成 | 12 tests passed |
| #5 | anr-parser.ts（18-case + Lock Graph + Deadlock） | ✅ 完成 | 18 tests passed |
| #6 | kernel-parser.ts（9 種 kernel 事件偵測） | ✅ 完成 | 19 tests passed |
| #7 | basic-analyzer.ts（規則引擎 + Insights + 健康分數） | ✅ 完成 | 12 tests passed |

### Week 3: Backend + LLM Gateway ✅

| Issue | 內容 | 狀態 | 測試 |
|-------|------|------|------|
| #8 | config.ts（環境變數 + 運行時配置） | ✅ 完成 | 編譯通過 |
| #9 | LLM Gateway 統一介面 + Provider 路由 | ✅ 完成 | 編譯通過 |
| #10 | Ollama Provider（streaming） | ✅ 完成 | 編譯通過 |
| #11 | OpenAI Provider（streaming） | ✅ 完成 | 編譯通過 |
| #12 | Gemini Provider（streaming） | ✅ 完成 | 編譯通過 |
| #13 | Anthropic Provider（streaming，預留） | ✅ 完成 | 編譯通過 |
| #14 | Prompt Templates（analysis + chat） | ✅ 完成 | 編譯通過 |
| #15 | Express server + routes（upload/analyze/chat/settings） | ✅ 完成 | Server 啟動 + API 回應正常 |
| #16 | SSE 串流進度（4 階段） | ✅ 完成 | 編譯通過 |

### Week 4: Frontend UI ✅

| Issue | 內容 | 狀態 | 測試 |
|-------|------|------|------|
| #17 | Vite + Tailwind + 專案骨架 | ✅ 完成 | Build 通過 |
| #18 | UploadZone（拖曳上傳 + 問題描述 + 標籤 + 雙模式） | ✅ 完成 | Build 通過 |
| #19 | ProgressView（四階段進度條 + SSE） | ✅ 完成 | Build 通過 |
| #20 | SystemOverview + 健康分數環形圖 | ✅ 完成 | Build 通過 |
| #21 | InsightsCards + InsightCard（嚴重性排序 + 展開詳情） | ✅ 完成 | Build 通過 |
| #22 | Timeline（跨子系統時間軸） | ✅ 完成 | Build 通過 |
| #23 | ANRDetail（blocking chain + deadlock + lock graph + stack） | ✅ 完成 | Build 通過 |
| #24 | ChatPanel（AI 對話追問 + streaming） | ✅ 完成 | Build 通過 |

### Week 5: Deep Analysis + 部署 ✅

| Issue | 內容 | 狀態 | 測試 |
|-------|------|------|------|
| #25 | Deep Analysis 端對端整合 | ✅ 完成 | Build 通過 |
| #26 | Docker Compose 部署 | 待開始 | - |
| #27 | 端對端測試 | 待開始 | - |
| #28 | Enhanced Deep Analysis（context builder + structured output + overview UI） | ✅ 完成 | Build 通過 |
| #29 | Backend Tests（parser + analyzer + routes） | ✅ 完成 | 43 tests passed |

**累計測試：203 passed（parser 156 + backend 47）**
**Frontend Build：215 KB JS + 14.5 KB CSS（production）**

---

## 12. Phase 1.5 — BSP 分析能力強化（規劃中）

基於 Tech Lead review 與新手 BSP 工程師使用回饋，識別出以下改善方向。

### 12.1 系統分析能力改善

| 優先級 | # | 內容 | 工作量 | 影響度 | 狀態 |
|--------|---|------|--------|--------|------|
| **P0** | #30 | **Timeline 重構：事件聚合 + 篩選 + severity 優先** | Medium | **Critical** | ✅ 完成 |
| **P0** | #31 | Dumpsys meminfo/cpuinfo parser | Medium | High | ✅ 完成 |
| **P0** | #32 | 擴充 kernel event detection（thermal throttling, storage I/O, suspend/resume） | Low | High | ✅ 完成 |
| P1 | #33 | Logcat 新增 Input dispatching timeout / HAL restart patterns | Low | Medium | ✅ 完成 |
| P1 | #34 | Health score 改善（frequency-based damping） | Medium | Medium | ✅ 完成 |
| P1 | #35 | Tombstone parser（native crash backtrace + signal info + vendor crash 偵測） | Medium | Medium | ✅ 完成 |
| P2 | #36 | BSP-specific prompt tuning（vendor vs framework vs app 分層） | Low | Low | 待開始 |

### 12.2 新手 BSP 工程師 Debug 輔助

| 優先級 | # | 內容 | 工作量 | 影響度 | 狀態 |
|--------|---|------|--------|--------|------|
| **P0** | #37 | HAL service 存活狀態偵測（lshal/hwservicemanager log） | Low | High | ✅ 完成 |
| **P0** | #38 | Boot 狀態分析（boot_completed, uptime, bootreason, sysserver restart count） | Low | High | ✅ 完成 |
| P1 | #39 | Log tag vendor/framework 自動分類 + top error tags 統計 | Medium | High | ✅ 完成 |
| P1 | #40 | SELinux denial → allow rule 自動生成 | Low | High | ✅ 完成 |
| P1 | #41 | Quick debug commands 自動生成（根據發現的問題產出 adb 腳本） | Low | Medium | ✅ 完成 |
| P2 | #42 | BSP Quick Reference 前端面板（整合 device state + resource snapshot + HAL status） | Medium | Medium | 待開始 |

### 12.3 #30 Timeline 重構（P0 最高優先）

**問題**：實測 308 events，重複 SELinux denial 佔滿畫面，critical 事件被埋沒，Timeline 形同廢物。

**改善範圍：**

#### A. 資料層 — `packages/parser/src/basic-analyzer.ts` `buildTimeline()`
1. **事件聚合**：相同 title + 相同 source 在 30 秒窗口內 → 合併為一條
   - 新增 `TimelineEvent.count?: number` 和 `TimelineEvent.timeRange?: string`
   - 例：`SELinux denial: system_app → vendor_sierra_fw_check_prop (×47)` + `boot+3808s ~ boot+3902s`
2. **Kernel ↔ Logcat 時間對齊**：用 bugreport metadata 中的 uptime 將 `boot+Ns` 轉成 `MM-DD HH:mm:ss`（best effort）

#### B. Types 更新 — `packages/parser/src/types.ts` + `packages/frontend/src/lib/types.ts`
```typescript
interface TimelineEvent {
  // ... existing fields
  count?: number;           // 聚合後的事件數量
  timeRange?: string;       // 聚合的時間範圍
}
```

#### C. 前端層 — `packages/frontend/src/components/Timeline.tsx`
1. **Filter bar**：按 severity（Critical/Warning/Info toggle）和 source（Logcat/Kernel/ANR）篩選
2. **預設隱藏 info**：只顯示 critical + warning，需手動開啟 info
3. **聚合事件摺疊顯示**：`count > 1` 的事件以摺疊形式呈現，點擊可展開
4. **Severity 視覺優先**：critical 用紅色左邊框強調
5. **事件計數顯示**：header 顯示 `Timeline (12 shown / 308 total)`

#### D. 驗收標準
- 308 events 的 bugreport → 預設顯示 < 30 條（info 隱藏 + 聚合）
- Critical/Warning 事件一眼可見，不被 SELinux noise 淹沒
- 可切換顯示 info 級事件
- 聚合事件顯示次數和時間範圍
