# AI Bugreport Analyzer — TODO

> **更新日期**：2026-02-22

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

### ✅ Completed（11/13）

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

### 🔲 Remaining（2/13）

#### P2 Tasks

- [ ] #36 **BSP-Specific Prompt Tuning**
  - Deep Analysis prompt 區分 vendor / framework / app 層問題
  - 針對 BSP 常見問題提供專屬分析模板
  - **涉及檔案**：`prompt-templates/analysis.ts`

- [ ] #42 **BSP Quick Reference 面板**
  - 前端新增整合面板：device state + resource snapshot + HAL status
  - 一頁式總覽
  - **涉及檔案**：新增 `BSPQuickReference.tsx`

---

## 3. Phase 2 — Advanced Features（Phase 1.5 完成後）

- [ ] Function Calling（LLM 主動搜尋 logcat、查線程）
- [ ] Embedding + Vector Store（RAG 語意搜尋大型 logcat）
- [ ] 比較模式（兩份 bugreport 差異分析）
- [ ] Lock Graph 視覺化（D3.js 力導向圖）
- [ ] 分析報告匯出（JSON / HTML / PDF）
- [ ] 歷史分析記錄（SQLite 儲存）
- [ ] 批次分析（多份 bugreport 統計共同問題）

---

## 4. Backlog（未排期）

- [ ] #26 Docker Compose 部署
- [ ] #27 端對端測試

---

## 5. Test Summary

| Package | Tests | 說明 |
|---------|-------|------|
| parser | 160 | unpacker(5) + logcat(21) + anr(18) + kernel(31) + basic-analyzer(31) + dumpsys(34) + tombstone(15) + integration(5) |
| backend | 47 | routes + analyzer + parser integration |
| **Total** | **207** | |
