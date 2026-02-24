# AI Bugreport Analyzer — TODO

> **更新日期**：2026-02-24

---

## 1. Completed（Phase 1 + Enhanced Deep Analysis）

### Week 1-2: Parser 核心 + 型別系統

- [x] #1 專案初始化（monorepo + TypeScript + Vitest）
- [x] #2 types.ts 完整型別定義
- [x] #3 unpacker.ts（ZIP 解壓 + 段落切割）— 5 tests
- [x] #4 logcat-parser.ts（11 種異常偵測）— 12 tests
- [x] #5 anr-parser.ts（18-case + Lock Graph + Deadlock）— 18 tests
- [x] #6 kernel-parser.ts（12 種 kernel 事件偵測）— 19 tests
- [x] #7 basic-analyzer.ts（規則引擎 + Insights + 健康分數）— 12 tests

### Week 3: Backend + LLM Gateway

- [x] #8 config.ts（環境變數 + 運行時配置）
- [x] #9 LLM Gateway 統一介面 + Provider 路由
- [x] #10 Ollama Provider（streaming）
- [x] #11 OpenAI Provider（streaming）
- [x] #12 Gemini Provider（streaming）
- [x] #13 Anthropic Provider（streaming，預留）
- [x] #14 Prompt Templates（analysis + chat）
- [x] #15 Express server + routes（upload/analyze/chat/settings）
- [x] #16 SSE 串流進度（4 階段）

### Week 4: Frontend UI

- [x] #17 Vite + Tailwind + 專案骨架
- [x] #18 UploadZone（拖曳上傳 + 問題描述 + 標籤 + 雙模式）
- [x] #19 ProgressView（四階段進度條 + SSE）
- [x] #20 SystemOverview + 健康分數環形圖
- [x] #21 InsightsCards + InsightCard（嚴重性排序 + 展開詳情）
- [x] #22 Timeline（跨子系統時間軸）
- [x] #23 ANRDetail（blocking chain + deadlock + lock graph + stack）
- [x] #24 ChatPanel（AI 對話追問 + streaming）

### Week 5: Deep Analysis

- [x] #25 Deep Analysis 端對端整合
- [x] #28 Enhanced Deep Analysis（context builder + structured output + overview UI）
- [x] #29 Backend Tests — 43 tests

---

## 2. Phase 1.5 — BSP Analysis Enhancement

### ✅ Completed（13/13）

- [x] #30 **Timeline 重構** — P0
  - 事件聚合：相鄰相同 label+source+severity 事件自動合併，顯示 ×count + 時間範圍
  - Filter bar：severity toggle（Critical/Warning/Info）+ source filter（Logcat/Kernel/ANR）
  - 預設隱藏 info，只顯示 critical + warning
  - Critical 紅色左邊框，聚合事件 ×count badge
  - Header 顯示 `(X shown / Y total)`
  - Kernel ↔ Logcat 時間對齊：利用 `bugreportTimestamp - uptimeSeconds` 算出 boot epoch，將 kernel `boot+Xs` 轉為 `MM-DD HH:mm:ss.SSS` wall-clock 格式，kernel 事件按時間正確穿插在 logcat/ANR 事件之間
  - 12 tests（aggregateTimelineEvents 8 + kernel timestamp conversion 4）

- [x] #31 **Dumpsys meminfo/cpuinfo Parser** — P0
  - 新增 `dumpsys-parser.ts`：parseMemInfo / parseCpuInfo
  - 解析 Total/Free/Used RAM、top 10 PSS processes
  - 解析 TOTAL CPU%（user/kernel/iowait）、top 10 CPU processes
  - 整合至 SystemOverview 卡片（Memory + CPU 區塊）
  - Section search fallback：dedicated section → generic DUMPSYS section content search
  - 7 tests（parseMemInfo + parseCpuInfo）

- [x] #32 **Kernel Event Detection 擴充** — P0
  - 新增 thermal_throttling（warning）：`/thermal.*throttl/`
  - 新增 storage_io_error（warning）：`/mmc.*error|EXT4-fs error/`
  - 新增 suspend_resume_error（warning）：`/suspend.*abort|resume.*fail/`
  - 整合至 Health Score kernel 子分數
  - 5 tests

- [x] #33 **Logcat 新增偵測 Patterns** — P1
  - 新增 input_dispatching_timeout（critical）：`/Input dispatching timed out/` + `InputDispatcher` tag
  - 新增 hal_service_death（warning）：`hwservicemanager`/`ServiceManager` + `died/restart`
  - 整合至 Health Score（responsiveness / stability）
  - 2 tests

- [x] #34 **Health Score 改善** — P1
  - Frequency-based damping：同類事件重複出現時遞減扣分
    - 1st=100%, 2nd=50%, 3rd=25%, 4th+=10%
    - 每種事件類型有 maxTotalPerType 上限
  - 效果：270 SELinux denials kernel score 0→76，10 ANRs responsiveness 0→50
  - 所有 sub-scores 取 Math.round() 避免浮點數精度問題
  - 3 tests（damping、SELinux、ANR scenarios）

- [x] #37 **HAL Service 存活狀態偵測** — P0
  - 透過 #33 hal_service_death 規則偵測
  - 產出 Insight card（warning severity, stability category）

- [x] #38 **Boot 狀態分析** — P0
  - analyzeBootStatus()：優先讀 SYSTEM PROPERTIES（sys.boot_completed、sys.boot.reason.last）
  - Fallback：logcat → kernel log
  - 偵測 system_server restart count（Zygote fork 次數 - 1）
  - 估算 uptime（kernel log 最後 timestamp）
  - Boot status UI：Boot 狀態（綠/紅）、Uptime、Boot Reason、SS Restarts
  - generateBootInsights()：incomplete boot / SS restarts / abnormal boot reason
  - 6 tests + 5 integration tests（real bugreport）

- [x] #39 **Log Tag 自動分類 + Top Error Tags** — P1
  - `logcat-parser.ts`：`classifyTag()` 將 tags 分類為 vendor / framework / app
  - `logcat-parser.ts`：`computeTagStats()` 統計 E/F level top 20 tags
  - `basic-analyzer.ts`：`generateTagInsights()` 產出 tag 分佈 insight
  - 前端 `TagStats.tsx`：stacked bar（vendor/framework/app 比例）+ tag 排行榜 + 展開按鈕

- [x] #40 **SELinux Denial → Allow Rule 自動生成** — P1
  - `kernel-parser.ts`：`generateSELinuxAllowRule()` 從 scontext/tcontext/tclass/permission 生成 allow rule
  - `basic-analyzer.ts`：SELinux insight 附帶 `suggestedAllowRule`
  - 前端 `InsightCard.tsx`：顯示 allow rule code block + 複製按鈕

- [x] #41 **Quick Debug Commands 自動生成** — P1
  - `basic-analyzer.ts`：定義 `LOGCAT_DEBUG_COMMANDS`、`KERNEL_DEBUG_COMMANDS`、`BOOT_DEBUG_COMMANDS` 等對應表
  - 每個 insight card 自動附帶 `debugCommands[]`
  - 前端 `InsightCard.tsx`：顯示 debug commands + 逐條複製按鈕

- [x] #35 **Tombstone Parser（Native Crash 分析）** — P1
  - 新增 `tombstone-parser.ts`：`parseTombstone()` / `parseTombstones()` 解析 `/data/tombstones/` 下的 native crash 檔案
  - 提取 backtrace（含 function+offset、BuildId）、signal info（SIGSEGV/SIGABRT/SIGBUS 等）、fault address、registers、abort message
  - Vendor crash 偵測：top frame 在 `/vendor/` 或 `/odm/` 路徑下自動標記
  - 自動跳過 `.pb` protobuf 格式檔案
  - 整合至 `basic-analyzer.ts`：產出 critical severity InsightCard + Timeline 事件 + stability 健康分數扣分（15 分/crash，frequency damping）
  - 前端 `Timeline.tsx` 新增 tombstone source filter（rose 紅色系配色）
  - 15 tests（SIGSEGV/SIGABRT/SIGBUS 解析、backtrace frame、vendor crash、registers、.pb skip、容錯）

- [x] #36 **BSP-Specific Prompt Tuning** — P2
  - System prompt 新增 4 條 BSP 層級分類規則（vendor/BSP、framework、app）
  - User prompt 新增 Error Distribution by Layer 段落（百分比 + top 5 vendor tags）
  - Chat prompt 新增 error distribution 和 HAL status 上下文 + BSP-specific guidance rule
  - 7 tests

- [x] #42 **BSP Quick Reference 面板** — P2
  - 新增 `BSPQuickReference.tsx`：4 個 sub-panel（Boot & Reliability、Resource Pressure、HAL Health、Vendor Error Tags）
  - 整合至 App.tsx（TagStats 之後、DeepAnalysisOverview 之前）
  - 所有 props optional，無資料時 return null

---

## 3. Phase 2.0 — Advanced Features（✅ 全部完成）

### Phase 2.0a — 基礎設施 + 獨立使用功能

- [x] **F1: Analysis History（SQLite 持久化）**
  - better-sqlite3 + WAL mode，analyses table + FTS5 virtual table
  - CRUD API：GET/DELETE/PATCH `/api/history`
  - 前端 HistoryPanel（slide-out 歷史列表、刪除、載入）
  - `store.ts` 自動同步寫入 SQLite，get() fallback 到 SQLite
  - 新增：`db.ts`、`history-store.ts`、`routes/history.ts`、`HistoryPanel.tsx`

- [x] **F2: 獨立 logcat / dmesg 檔案支援**
  - Upload 接受 `.zip`、`.txt`、`.log` 檔案
  - `format-detector.ts`：`detectLogFormat()` 自動偵測 logcat/dmesg 格式
  - 根據檔案類型選擇不同解析路徑（logcat-only / dmesg-only / full bugreport）
  - 修改：`upload.ts`、`analyze.ts`、`UploadZone.tsx`

- [x] **F3: Lock Graph 視覺化（D3.js）**
  - D3.js force-directed SVG graph（d3-force + d3-drag + d3-zoom + d3-selection）
  - Nodes = threads（依 state 著色），Edges = lock waits（箭頭）
  - Deadlock cycles 紅色高亮，支援拖曳、縮放、hover tooltip
  - 新增：`LockGraphVisualization.tsx`、`useForceSimulation.ts`

- [x] **F4: Report Export（JSON / HTML）**
  - JSON：格式化輸出完整 AnalysisResult
  - HTML：自包含 HTML 報告（內嵌 CSS、dark theme）
  - API：GET `/api/export/:id/:format`
  - 新增：`json-exporter.ts`、`html-exporter.ts`、`routes/export.ts`、`ExportMenu.tsx`

### Phase 2.0b — LLM 增強（Agentic 能力）

- [x] **F5: Function Calling（Agentic Chat）**
  - 5 個調查工具：`search_logcat`、`get_thread_info`、`get_kernel_events`、`get_insight_detail`、`search_section`
  - Prompt-based tool calling loop（max 5 iterations）
  - Raw data store 暫存 LogEntry[]、sections（for tool access）
  - ChatPanel 顯示 tool call activity
  - 新增：`tool-definitions.ts`、`tool-executor.ts`、`raw-data-store.ts`

- [x] **F6: FTS5 全文搜尋**
  - SQLite FTS5 virtual table + BM25 ranking
  - `search_logcat` tool 先用 FTS5 搜尋，fallback 到 keyword match
  - 分析完成後自動觸發 FTS5 indexing
  - 新增：`search/fts-indexer.ts`

### Phase 2.0c — 多報告分析 + 生態整合

- [x] **F7: Comparison Mode**
  - `compareAnalyses()`：HealthDiff + InsightDiff + ANRDiff + HALDiff
  - Signature-based insight matching（跨報告比對）
  - API：GET `/api/compare?left=:id&right=:id`
  - 前端 ComparisonView（並排 health diff、insight 變化、ANR/HAL 變化）
  - 新增：`comparison.ts`、`routes/compare.ts`、`ComparisonView.tsx`、`useComparison.ts`

- [x] **F8: Batch Analysis**
  - Multi-file upload（POST `/api/batch`）+ SSE 批次分析
  - `aggregateBatch()`：CommonIssue[]、DeviceDistribution[]、ANR process frequency
  - 前端 BatchUpload + BatchResults dashboard
  - 新增：`batch-analyzer.ts`、`routes/batch.ts`、`BatchUpload.tsx`、`BatchResults.tsx`

- [x] **F9: MCP Server**
  - 獨立 npm package：`packages/mcp-server/`
  - 3 個 MCP tools：`analyze_bugreport`、`search_history`、`ask_about_analysis`
  - 使用 `@modelcontextprotocol/sdk`，stdio transport
  - 可整合 Claude Desktop / VS Code

---

## 3.1 Phase 2.0 追加功能

- [x] **F6a: Search Logcat UI（前端搜尋介面）**
  - 全寬 Modal（`max-w-4xl`, `max-h-[80vh]`），click outside 或 Escape 關閉
  - 搜尋表單：關鍵字 `q` 主輸入框 + 篩選列（tag、level select、pid、limit select）
  - Enter 或按鈕觸發搜尋，呼叫 `searchLogcat()` API
  - 結果區：狀態列（totalMatches / showing / method badge）+ monospace 逐行顯示
  - Level 染色：E→紅、W→黃、I→綠、D→藍、V/F→灰
  - Loading spinner、空狀態、錯誤提示
  - App.tsx：result phase header 新增 Search 按鈕
  - 新增：`SearchModal.tsx`，修改：`App.tsx`

- [x] **F4a: HTML Export 增強（詳細 Insight 渲染）**
  - Insight card 顯示 category、source、timestamp badge
  - 多行 description 逐行染色（Target HAL → 黃、Blocking chain → 紅 等）
  - Stack trace、related logs 以 code block 渲染
  - SELinux allow rule 專屬樣式（黃色 monospace）
  - Debug commands 逐條顯示（綠色 monospace）
  - Deep Analysis 完整渲染（root cause、fix suggestion、evidence、debugging steps、affected components、related insights）
  - 34 個新 CSS class
  - 修改：`html-exporter.ts`

---

## 4. Phase 2.1 — Search Export + Timeline-Insight 連結（✅ 全部完成）

- [x] **Search Result Export（CSV / Text）**
  - 新增 `export-utils.ts`：`entriesToCSV()`、`entriesToLogcatText()`、`downloadBlob()` 純前端匯出工具
  - CSV columns：timestamp, pid, tid, level, tag, message（含 comma/quote/newline 跳脫）
  - Logcat text：模擬 `adb logcat` 原始輸出格式
  - `SearchModal.tsx`：狀態列新增 Export 下拉按鈕（CSV / Text 兩種格式）
  - 檔名格式：`logcat-search-{keyword}-{timestamp}.csv` / `.txt`
  - 匯出目前頁面顯示的結果，無需後端改動

- [x] **Timeline → Insight 連結導航**
  - `TimelineEvent` 新增 `insightId?: string` 欄位（parser types + frontend types 同步更新）
  - `basic-analyzer.ts`：新增 `linkTimelineToInsights()` 函式，三層匹配策略：
    1. Label 子字串匹配（event.label vs insight.title）
    2. Process name + 事件類型關鍵字匹配
    3. `TIMELINE_SOURCE_MAP` type keyword mapping
  - 在 `analyzeBasic()` 的 return 之前自動呼叫連結
  - `Timeline.tsx`：有 insightId 的事件顯示 ↗ 箭頭圖示、indigo 底線裝飾、hover 效果
  - 點擊後 `scrollIntoView({ behavior: 'smooth', block: 'center' })` 到對應 InsightCard
  - 目標 InsightCard 短暫閃爍 indigo ring 2 秒作為視覺回饋

---

## 5. Phase 2.2 — Kernel Message Search（✅ 完成）

- [x] **Kernel FTS5 全文搜尋**
  - 新增 `kernel_fts` FTS5 virtual table（analysis_id, entry_index, timestamp_sec, level, facility, message）
  - `fts-indexer.ts`：新增 `indexKernelEntries()`、`searchKernelFTS()`、`deleteKernelIndex()` 三函式
  - 分析完成後自動觸發 kernel FTS5 indexing（ZIP bugreport、standalone logcat、standalone dmesg 三條路徑）

- [x] **Search API `source=kernel` 分支**
  - `routes/search.ts`：新增 `source` query param（預設 `logcat`）
  - `source=kernel` 時從 rawDataStore 取 kernel entries
  - FTS5 優先搜尋、fallback in-memory filtering
  - Kernel level filter：`<0>`~`<7>`，數字越小越嚴重，選定 level 顯示該 level 及更嚴重的

- [x] **SearchModal Logcat/Kernel Tab 切換**
  - Header 新增 Logcat/Kernel tab switcher，切換時清空結果和 filters
  - Filters 自適應：logcat 顯示 Tag/Level/PID，kernel 只顯示 Level（EMERG~DEBUG）
  - 結果表格自適應：logcat 顯示 timestamp/pid-tid/level-tag/message，kernel 顯示 [timestamp]/level-label/message
  - Kernel level 顏色：`<0>`~`<3>` 紅色、`<4>` 黃色、`<5>` 藍色、`<6>` 綠色、`<7>` 灰色

- [x] **Kernel 匯出支援**
  - `export-utils.ts`：新增 `kernelEntriesToCSV()`（columns: timestamp, level, facility, message）
  - `export-utils.ts`：新增 `kernelEntriesToDmesgText()`（模擬 dmesg 輸出格式）
  - 匯出檔名：`kernel-search-{keyword}-{ts}.csv` / `.txt`

---

## 5.1 Phase 2.3 — Logcat Buffer Field & Search Filter（✅ 完成）

- [x] **LogEntry buffer 欄位**
  - `types.ts`：新增 `LogcatBuffer` type（`'main' | 'system' | 'events' | 'crash' | 'radio' | 'kernel'`）、`LogcatSection` interface、`LogEntry.buffer?` optional 欄位
  - `unpacker.ts`：`extractLogcatSections()` 改回傳 `LogcatSection[]`，依 section name 對應 buffer type（MAIN LOG→main、SYSTEM LOG→system、EVENT LOG→events、CRASH LOG→crash、RADIO LOG→radio）
  - `logcat-parser.ts`：`parseLogcat(content, buffer?)` 接受 optional buffer 參數寫入每個 entry；`detectAnomalies()` 改為 export

- [x] **Backend per-section 解析**
  - `analyze.ts`、`batch.ts`：逐 section 呼叫 `parseLogcat(content, buffer)` 再合併 entries，重新呼叫 `detectAnomalies()` + `computeTagStats()`
  - `mcp-server/tools.ts`：同步改為逐 section 解析

- [x] **FTS5 buffer column**
  - `db.ts`：`logcat_fts` FTS5 table 新增 `buffer` column（DROP+CREATE migration）
  - `fts-indexer.ts`：`indexLogcatEntries` 插入 buffer；`searchLogcatFTS` 支援 optional buffer 過濾（FTS5 column filter 語法）

- [x] **Search API buffer 過濾**
  - `routes/search.ts`：新增 `buffer` query param，FTS5 與 in-memory 兩路都支援；response 加 buffer field

- [x] **Frontend buffer dropdown**
  - `api.ts`：`searchLogcat` params 加 `buffer`，response entry 加 `buffer`
  - `SearchModal.tsx`：logcat filter row 新增 Buffer dropdown（All/main/system/events/crash/radio），切換 tab 時重置

- [x] **Search Modal UX 改善**
  - FTS5 `logcat_fts` 新增 `pid`、`tid` columns，修正 FTS5 搜尋結果顯示 `?/?` 的問題
  - 允許空搜尋瀏覽所有 entries（移除 empty-field guard）
  - Logcat 和 Kernel 結果表格新增 `<thead>` 欄位標題（Timestamp、PID/TID、Level/Tag、Message / Timestamp、Level、Message）
  - 移除冗餘的 `<7>+ DEBUG (all)` kernel level 選項（與 "All" 功能重複）

- [x] **大型 bugreport 記憶體/堆疊修正**
  - `push(...arr)` 改為逐個 `push(entry)` 避免 V8 call stack overflow（400K+ entries 的 spread 會超過 argument limit）
  - `concat` 改為逐個 push 避免建立臨時陣列造成記憶體峰值
  - 解析後釋放 logcat section content 字串（88MB+ 的 system log section）減少記憶體壓力
  - Node.js heap 增加到 4GB（`--max-old-space-size=4096`）支援大型 bugreport（30MB+ ZIP, 695K entries）
  - 影響檔案：`analyze.ts`、`batch.ts`、`mcp-server/tools.ts`、`backend/package.json`

---

## 6. Phase 2.4 — Power Management Analyzer

### Phase 1: Parser + Insight 整合

- [x] **P1-1: Power types** — `types.ts` 新增 PowerManagerState, DozeState, DozeSettings, BatteryStatsSummary, KernelWakeLockStat, PowerParseResult；InsightCategory 加 'power'；AnalysisResult 加 powerStatus
- [x] **P1-2: power-parser.ts** — 新建，7 個解析函式（parsePowerManager, parseDeviceIdle, parseBatteryStats, parseKernelWakelocks, parsePowerSections, parseAlarmStats, parseSuspendStats）
- [x] **P1-3: power-parser.test.ts** — 新建，29 個測試全部通過
- [x] **P1-4: basic-analyzer 整合** — generatePowerInsights() 13 條規則 + calculateHealthScore kernel 維度整合
- [x] **P1-5: Backend 整合** — analyze.ts 呼叫 parsePowerSections + context-builder.ts collectPowerContext
- [x] **P1-6: Frontend types** — types.ts mirror power types

### Phase 2: 前端 PowerOverview

- [x] **P2-1: PowerOverview.tsx** — 新建，3 欄 grid（Power Manager / Doze / Battery Stats），Deep Doze 放電率色彩標示，Alarm Wakeups 表格，Suspend Statistics 區塊
- [x] **P2-2: App.tsx 整合** — 在 TagStats 和 BSPQuickReference 之間渲染
- [x] **P2-3: BSPQuickReference 擴展** — 加入 Power 摘要格

### Phase 3: Alarm Stats + Suspend 統計

- [x] **P3-1: Alarm/Suspend types** — AlarmWakeupStat, SuspendStats
- [x] **P3-2: parseAlarmStats + parseSuspendStats** — 解析 DUMPSYS ALARM + kernel suspend 事件統計
- [x] **P3-3: Alarm/Suspend insights** — 5 條規則（alarm wakeups > 500/1000, suspend 成功率, abort source）
- [x] **P3-4: PowerOverview 擴展** — Alarm Wakeups 表格 + Suspend Statistics 區塊

---

## 7. Backlog（未排期）

- [ ] #26 Docker Compose 部署
- [ ] #27 端對端測試
- [ ] CVE/Security 分析（比對 CVE 資料庫）
- [ ] Jira/GitHub 整合（從 findings 建 issue）
- [ ] Embedding + Vector Store（RAG 語意搜尋，FTS5 已覆蓋 80% 場景）
- [ ] PDF 匯出（需 Puppeteer 或 html2canvas + jsPDF）

---

## 8. Test Summary

| Package | Tests | 說明 |
|---------|-------|------|
| parser | 163 | unpacker(5) + logcat(23) + anr(18) + kernel(31) + basic-analyzer(31) + dumpsys(35) + tombstone(15) + integration(5) |
| backend | 53 | routes + analyzer + parser integration + prompt tests |
| **Total** | **216** | `npm test` (Vitest) |
