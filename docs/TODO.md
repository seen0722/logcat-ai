# AI Bugreport Analyzer — TODO

> **更新日期**：2026-02-20

---

## 1. Completed（Phase 1 + Enhanced Deep Analysis）

### Week 1-2: Parser 核心 + 型別系統

- [x] #1 專案初始化（monorepo + TypeScript + Vitest）
- [x] #2 types.ts 完整型別定義
- [x] #3 unpacker.ts（ZIP 解壓 + 段落切割）— 5 tests
- [x] #4 logcat-parser.ts（9 種異常偵測）— 12 tests
- [x] #5 anr-parser.ts（18-case + Lock Graph + Deadlock）— 18 tests
- [x] #6 kernel-parser.ts（9 種 kernel 事件偵測）— 19 tests
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

**累計：109 tests passed**

---

## 2. Phase 1.5 — BSP Analysis Enhancement

### A. 系統分析能力（#30-#36）

#### #30 Timeline 重構 ⭐ P0 最高優先

> **問題**：308 events 中重複 SELinux denial 佔滿畫面，critical 事件被埋沒。

- [ ] **A. 事件聚合** — `packages/parser/src/basic-analyzer.ts` `buildTimeline()`
  - 相同 title + 相同 source 在 30 秒窗口內合併為一條
  - 新增 `TimelineEvent.count` 和 `TimelineEvent.timeRange`
  - Kernel ↔ Logcat 時間對齊（best effort）
- [ ] **B. Types 更新** — `packages/parser/src/types.ts` + `packages/frontend/src/lib/types.ts`
  - `count?: number`（聚合後的事件數量）
  - `timeRange?: string`（聚合的時間範圍）
- [ ] **C. 前端 Filter + 摺疊** — `packages/frontend/src/components/Timeline.tsx`
  - Filter bar：severity toggle（Critical/Warning/Info）+ source filter（Logcat/Kernel/ANR）
  - 預設隱藏 info，只顯示 critical + warning
  - 聚合事件摺疊顯示，點擊可展開
  - Severity 視覺優先：critical 紅色左邊框
  - Header 顯示 `Timeline (12 shown / 308 total)`
- **驗收標準**：
  - 308 events → 預設顯示 < 30 條
  - Critical/Warning 一眼可見
  - 可切換顯示 info 級事件
  - 聚合事件顯示次數和時間範圍

---

#### #31 Dumpsys meminfo/cpuinfo Parser — P0

- [ ] 解析 bugreport 中的 `DUMP OF SERVICE meminfo` 和 `DUMP OF SERVICE cpuinfo` 段落
- [ ] 產出結構化的記憶體與 CPU 使用狀況（top processes, available memory, CPU load）
- [ ] 整合至 SystemOverview 卡片顯示
- **涉及檔案**：`packages/parser/src/` 新增 dumpsys-parser.ts、`basic-analyzer.ts`、`types.ts`
- **驗收標準**：解析結果包含 top 10 memory consumers、CPU 使用率、available RAM

#### #32 Kernel Event Detection 擴充 — P0

- [ ] 新增 thermal throttling 偵測（`/thermal.*throttl/`）
- [ ] 新增 storage I/O error 偵測（`/mmc.*error|EXT4-fs error/`）
- [ ] 新增 suspend/resume 異常偵測（`/suspend.*abort|resume.*fail/`）
- **涉及檔案**：`packages/parser/src/kernel-parser.ts`、`types.ts`
- **驗收標準**：新增事件類型可被正確偵測，並出現在 Timeline 與 Insights

#### #33 Logcat 新增偵測 Patterns — P1

- [ ] Input dispatching timeout（`/Input dispatching timed out/`）
- [ ] HAL service restart（`/HwServiceManager.*died|hwservicemanager.*restart/`）
- **涉及檔案**：`packages/parser/src/logcat-parser.ts`
- **驗收標準**：新 pattern 可從 logcat 中被偵測並分類

#### #34 Health Score 改善 — P1

- [ ] Frequency-based scoring：重複出現的問題降低健康分數權重
- [ ] Recency weighting：最近的事件權重高於舊事件
- **涉及檔案**：`packages/parser/src/basic-analyzer.ts` `calculateHealthScore()`
- **驗收標準**：健康分數更能反映系統實際狀態，不被大量重複的低嚴重性事件拉低

#### #35 Tombstone Parser — P1

- [ ] 解析 `/data/tombstones/` 下的 native crash 檔案
- [ ] 提取 backtrace、signal info、fault address、registers
- **涉及檔案**：`packages/parser/src/` 新增 tombstone-parser.ts、`unpacker.ts`、`types.ts`
- **驗收標準**：可解析 tombstone 並產出結構化 native crash 資訊

#### #36 BSP-Specific Prompt Tuning — P2

- [ ] Deep Analysis prompt 區分 vendor / framework / app 層問題
- [ ] 針對 BSP 常見問題（driver, HAL, kernel）提供專屬分析模板
- **涉及檔案**：`packages/backend/src/llm-gateway/prompt-templates/analysis.ts`
- **驗收標準**：Deep Analysis 對 BSP 相關問題的診斷品質提升

---

### B. 新手 Debug 輔助（#37-#42）

#### #37 HAL Service 存活狀態偵測 — P0

- [ ] 從 logcat 偵測 `lshal`、`hwservicemanager` 相關訊息
- [ ] 識別 HAL service crash/restart 事件
- [ ] 產出 HAL status summary（哪些 HAL 有異常）
- **涉及檔案**：`packages/parser/src/logcat-parser.ts`、`basic-analyzer.ts`
- **驗收標準**：可偵測 HAL service 異常並列出受影響的 HAL 服務

#### #38 Boot 狀態分析 — P0

- [ ] 偵測 `sys.boot_completed`、system uptime、boot reason
- [ ] 計算 system_server restart count
- [ ] 產出 boot status summary
- **涉及檔案**：`packages/parser/src/logcat-parser.ts`、`basic-analyzer.ts`、`types.ts`
- **驗收標準**：可顯示裝置 boot 狀態、重啟次數、boot reason

#### #39 Log Tag 自動分類 + Top Error Tags — P1

- [ ] 將 log tags 自動分類為 vendor / framework / app
- [ ] 統計 error level 以上的 top tags（前 20 名）
- **涉及檔案**：`packages/parser/src/logcat-parser.ts`、`basic-analyzer.ts`
- **驗收標準**：前端可顯示 error tag 排行榜，幫助快速定位問題來源

#### #40 SELinux Denial → Allow Rule 自動生成 — P1

- [ ] 解析 SELinux denial 訊息中的 scontext、tcontext、tclass、permission
- [ ] 自動生成對應的 `allow` rule（sepolicy 格式）
- **涉及檔案**：`packages/parser/src/kernel-parser.ts` 或新增 selinux-parser.ts
- **驗收標準**：每條 SELinux denial 都能產出可複製的 allow rule

#### #41 Quick Debug Commands 自動生成 — P1

- [ ] 根據偵測到的問題自動產出對應的 adb debug 腳本
- [ ] 例如：發現 ANR → 產出 `adb shell dumpsys activity processes`；發現 OOM → 產出 `adb shell dumpsys meminfo`
- **涉及檔案**：`packages/parser/src/basic-analyzer.ts` 或新增模組
- **驗收標準**：每類問題至少有 2-3 個對應的 debug 指令建議

#### #42 BSP Quick Reference 面板 — P2

- [ ] 前端新增整合面板：device state + resource snapshot + HAL status
- [ ] 一頁式總覽，讓新手 BSP 工程師快速掌握裝置狀態
- **涉及檔案**：`packages/frontend/src/components/` 新增 BSPQuickReference.tsx
- **驗收標準**：面板整合所有 BSP 相關資訊，一眼可見裝置健康狀態

---

## 3. Phase 2 — Advanced Features（Phase 1.5 完成後）

- [ ] Function Calling（LLM 主動搜尋 logcat、查線程）
- [ ] Tombstone Parser（Native crash 分析）— 可能在 Phase 1.5 #35 提前實作
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
