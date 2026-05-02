# SearchModal 效能優化設計

> **Revised 2026-05-02**: 原 spec 假設 50K-entry baseline、提 backend `truncateMsg`
> + Web Worker + debounce 4 件事。經過 2026-05-02 的 source-code trace 與產品方向釐清
> 後重寫——詳見「約束」章節。

## 問題（2026-05-02 校正版）

SearchModal 在大型 bugreport（例如 THRPI-354 的 695K entries）兩個方向都慢：

| 階段 | 現況 | 痛點 |
|------|------|------|
| **打開 modal 到看到 entries** | 2-3s | 等待 |
| **打開後 filter / Find 操作** | 300-500ms 卡頓 | 主線程同步 useMemo 在掃整個陣列 |

實際資料流（trace 自 source code）：

```
SearchModal opens
  → searchLogcat(uploadId, { limit: 1_000_000, export: true, compact: true })
  → backend rawDataStore HIT  → return all entries
                          MISS → loadAllLogcatFromFTS → rebuild → return all entries
  → frontend: allEntriesRef.current = entries  (~100MB+ in heap for big bugreports)
  → useMemo filteredEntries     (主線程同步，每次 dep 變動掃整個陣列)
  → useMemo matchIndices        (主線程同步，regex 整個 filteredEntries)
  → react-window 渲染 visible window only
```

打開後**完全不再打 backend**——所有 filter / Find 都是 client-side useMemo。FTS5
只在 cold-cache rebuild 時被當作「持久化儲存」一次性 dump 全部 entries，**不再被當作查詢引擎**。

## 約束（不可動的設計哲學）

> 工程師分析問題時必須一氣呵成。沒有 missed content、分析過程中沒有等待 loading。

衍生出三條紅線：

1. **No missed content** — 不能 truncate message（會 client-side Find 不到）
2. **No roundtrip during analysis** — 分析開始後不打 backend（包括「Deep search via
   FTS5」這條路也排除——會引入 keyword 打字 latency）
3. **Full-load architecture stays** — 不走 paginate / streaming-then-fallback；
   一次拉滿，後續純 client-side

刻意保留的代價：

- 大 bugreport 首次載入仍要傳 ~100MB JSON、heap 佔 ~200MB
- 我們用「**把等待挪到使用者沒在等的時候**」（背景 prefetch）來緩解，而不是把 dataset 縮小

## 目標

| 指標 | 現況 | 目標 |
|------|------|------|
| 點 Search 按鈕到 entries 可看 | 2-3s | **~100ms**（透過 prefetch 提前完成） |
| Filter 切換感知延遲 | 300-500ms 卡 | **<16ms**（worker，不阻塞主線程）|
| Find 打字 → 高亮浮現 | 200-400ms 卡 | 列表瞬間 + 高亮 ~100ms 內非阻塞浮現 |
| Heap 佔用 | ~200MB（大 bugreport） | **不變**（明確不處理；屬於 trade-off） |

## 設計（4 個 phase，按 ROI 排序）

### Phase 1: Background prefetch（新增，最高 ROI）

**改動**:

- `packages/frontend/src/contexts/AnalysisContext.tsx` — 新增 `prefetchedEntriesRef`
  + `prefetchSearchData(uploadId)`
- `packages/frontend/src/pages/AnalysisPage.tsx` — `useEffect` 中 `requestIdleCallback`
  觸發 prefetch
- `packages/frontend/src/components/SearchModal.tsx` — `loadData()` 先檢查
  `prefetchedEntriesRef.current[uploadId]`，hit 就直接用、skip fetch

**邏輯**:

```
AnalysisPage 渲染完
  → useEffect: requestIdleCallback(() => prefetchSearchData(uploadId))
       (idle callback 確保不和首屏渲染競爭)
  → fetch /api/search/:id?limit=1M&export=true&compact=true
  → 結果存到 AnalysisContext.prefetchedEntriesRef[uploadId]

SearchModal opens
  → loadData() 第一行：
       const cached = prefetchedEntriesRef.current[uploadId];
       if (cached) { allEntriesRef.current = cached; setLoading(false); return; }
  → modal 打開 ~100ms 內可互動
```

**邊界**:

- Cancel：使用者離開 AnalysisPage 前 prefetch 還沒完成 → AbortController
- 重複觸發：同一 analysisId prefetch 過就不再 trigger
- TTL：跟 backend rawDataStore 同步——不另外管理（reload AnalysisPage 重 fetch 就好）
- Memory cap：暫不設（單一 analysis 不超過 1 份；切換 analysis 替換掉）

### Phase 2: Web Worker — decode + filter

**新增**: `packages/frontend/src/workers/search-worker.ts`

Worker 負責兩件事：

1. **Compact decode** — message 收到 `{ type: 'decode', columns, rows }`，回 `{ type: 'decoded', entries }`
2. **Filter** — 收到 `{ type: 'filter', filterParams }`（worker 持有 entries），回
   `{ type: 'filtered', filteredIndices: number[] }`

**主線程流程改變**:

```
loadData() → fetch
       → postMessage('decode', { columns, rows })
       → onMessage('decoded') → 主線程 entries 不持有實體陣列，
            只記錄 worker 那份的 reference + length

filter input 變動 → debounced (Phase 4) → postMessage('filter', filters)
       → onMessage('filtered', { indices })
       → 主線程持有 filteredIndices: Int32Array (省 memory)
       → react-window 用 indices 從 worker 拉具體 entry on-demand？
```

⚠️ **架構抉擇**: worker 持有 entries 後，render 時要怎麼拿？兩條路：

- **A. Indices-only**: worker 給 indices、主線程靠 indices 從 worker fetch 可見的
  那 30 行（page-by-page）。Memory 只有 worker 一份、主線程不複製。但每次
  scroll/render 要 postMessage round-trip。
- **B. Both-have**: worker 給整份 filtered entries 陣列回主線程（structured clone
  ~100ms 對 1M entries）。Memory 雙份。

**初版選 B** —— 雙份 memory 是已知 trade-off（200MB → 400MB），但實作簡單、render
路徑不變。如果記憶體變問題再切到 A。

### Phase 3: async matchIndices

延續 Phase 2 worker，第三個 message：

3. **Match** — 收到 `{ type: 'match', pattern, useRegex }`，回 `{ type: 'matched',
   matchIndices: number[] }`

主線程行為:

- Find input 變動（debounced 150ms）→ postMessage('match')
- 主線程**不等**結果——列表先用上一個 matchIndices 渲染（或 empty）
- worker 完成 → setMatchIndices(...) → 高亮浮現 + counter 更新

使用者感知：列表瞬間出現、~100ms 內高亮浮現。

### Phase 4: filter debounce

`packages/frontend/src/components/SearchModal.tsx`:

對下列輸入加 150ms debounce：

- `tag` / `excludeTags` 文字輸入
- `pid` 文字輸入
- `q`（Find keyword）文字輸入

`level`、`buffer` 為按鈕/select，不需 debounce（立即觸發）。

實作：`useRef` + `setTimeout`，無新依賴。

## 不做（明確排除）

| 項目 | 為什麼不做 |
|------|----------|
| Backend `truncateMsg` query parameter | 違反 "no missed"——chars 201+ 的內容 client-side Find 不到 |
| Restore FTS5-as-query in handler | 違反 "no roundtrip during analysis"——keyword 打字 → backend → 等待 |
| Paginate / streaming-then-fallback | 違反 full-load 哲學；增加 code path、增加 cancel/consistency 複雜度 |
| Reduce heap footprint | 列為已知 trade-off，目前不在範圍 |

> Note: backend `truncateMsg` 程式碼 (`routes/search.ts` 第 30 行 + 6 處應用) 已實作但不會被
> SearchModal 使用。可保留作 MCP server / 外部 API 之未來選項，或在後續 cleanup 中移除。

## 不改動

- react-window 虛擬滾動架構
- Detail panel 的 DOM 直操作（`detailEntryRef` + `style.display`）
- API 路由結構（不新增 endpoint，所有 perf 都在 frontend）
- RowComponent / SearchRow 渲染邏輯
- SearchFilters / SearchStatusBar 元件外觀

## 測試計畫

- 既有 e2e 全部通過（38/0/3 baseline 已在 PR #2 達成）
- 新增 perf 基準測試 spec（`packages/frontend/e2e/perf/`）：
  - Modal 開啟到 first row 可見 < 200ms（prefetch warm）
  - Filter 切換不阻塞主線程（無 long task > 50ms）
  - Find keyword 列表渲染立即（< 16ms），高亮浮現 < 200ms
- 用 Performance API（`performance.measure`）打點，CI 收集
- 用 THRPI-354 那份 695K 的 bugreport 作為 worst-case 基準

## Phase 排序與 PR 拆分

每個 phase 一個獨立 PR，**順序固定**（後者依賴前者基礎建設）：

| PR | Phase | 大小 | 風險 |
|----|-------|------|------|
| 1 | Background prefetch | M | 中（涉及 AnalysisContext + idle scheduling）|
| 2 | Web Worker infra + filter | L | 高（worker lifecycle、message protocol、cancel）|
| 3 | async matchIndices | S | 低（前面 worker infra 落定後）|
| 4 | filter debounce | XS | 低 |

每個 PR 獨立量 perf delta，下一 PR 啟動前先 review 上一個 PR 的實際收益。

## 開放問題

- **Phase 5 (memory)**: heap 不在當前範圍。如果 695K entries × 200 bytes ~= 130MB
  在低階機器（4GB RAM Chromebook）變問題，未來可考慮 worker-only ownership + indices
  on main thread (上面 Phase 2 的 A 路徑)
- **Phase 6 (cancellation)**: 使用者開 modal → 立刻關 → worker 還在 decode 整批。
  目前不取消（worker 完成就丟掉結果）。如果開關頻繁變問題再加 AbortSignal-style cancel
- **Phase 7 (clearing dead-code)**: backend `truncateMsg` 程式碼若決定不留作外部 API
  選項，可在所有 perf phase 完成後一併清除
