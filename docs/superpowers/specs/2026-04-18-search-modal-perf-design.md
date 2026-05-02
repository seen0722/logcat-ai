# SearchModal 效能優化設計

> **Revised 2026-05-02**: 原 spec 假設 50K-entry baseline、提 backend `truncateMsg`
> + Web Worker + debounce 4 件事。經過 2026-05-02 的 source-code trace 與產品方向釐清
> 後重寫——詳見「約束」章節。
>
> **Patched 2026-05-02 (review pass)**: 加上 wire-compression 註解、修正 worker
> scope、補 prefetch race + polyfill、強化 memory cap 警告、調整 latency 目標讓
> debounce + worker chain 算得通。
>
> ## 🛑 STATUS: Phases 2/3/4 CANCELLED by production measurement (2026-05-02)
>
> Phase 1 (background prefetch) shipped to `logcat-ai.zmlab.io` on 2026-05-02 (PR #4).
> Five-test measurement matrix run on production immediately after — see the new
> "**Production Measurement (2026-05-02)**" section at the bottom of this file.
>
> **Result**: This spec's premise that "filter switching is 300-500ms slow on the main
> thread" turned out to be wrong on modern V8 + the existing compact format. The
> 519K-entry production analysis shows filter at <14ms and Find at <50ms with **zero**
> long tasks (>50ms). Phases 2/3/4 would optimize a problem that does not exist in
> production.
>
> The remaining real bottleneck is **backend `rawDataStore` cold-cache rebuild + serialize
> for large bugreports** (~67s for 519K entries). That is out of scope for this spec and
> belongs in a new backend-warming spec.
>
> **What's still useful in this document**: the architectural trace, the constraints,
> Phase 1 (which shipped), and the Production Measurement record at the end.

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
  → frontend fetch resolves with compact JSON body (gzip ~25MB on wire,
    ~100MB after decompression for 695K entries)
  → main thread JSON.parse: ~600ms (大 bugreport)
  → allEntriesRef.current = entries (~100MB+ in heap)
  → useMemo filteredEntries     (主線程同步，每次 dep 變動掃整個陣列)
  → useMemo matchIndices        (主線程同步，regex 整個 filteredEntries)
  → react-window 渲染 visible window only
```

> **Wire vs heap**: 後續所有 latency / bandwidth 估算基於 gzip 後 ~25MB 的網路傳輸量，
> heap 估算基於 decompressed JSON 後的 ~100-200MB（含 V8 物件 overhead）。

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

- 大 bugreport 首次載入仍要傳 ~25MB gzip JSON、heap 佔 ~200MB
- 我們用「**把等待挪到使用者沒在等的時候**」（背景 prefetch）來緩解，而不是把 dataset 縮小

## 目標（latency 預算重新算過、能達成）

| 指標 | 現況 | 目標 | 備註 |
|------|------|------|------|
| 點 Search 按鈕到 entries 可看 | 2-3s | **< 300ms (warm prefetch)** / 2-3s (cold) | warm 仰賴 Phase 1 prefetch 已完成 |
| Filter 切換感知延遲 | 300-500ms 卡 | **list 重繪 < 100ms（worker，不阻塞主線程）** | 包含 150ms debounce + worker compute + render |
| Find 打字 → list 可滾動 | 200-400ms 卡 | **< 50ms（debounce 完即可滾動）** | 高亮可後到 |
| Find 高亮浮現 | 200-400ms 卡 | **< 500ms** | 150ms debounce + 50ms postMessage + 200ms worker compute + 50ms postMessage + 16ms re-render = ~466ms |
| Heap 佔用 | ~200MB | ~400MB（worker 雙份） / ~200MB（A 路徑單份） | 取決於 Phase 2 路徑選擇——見 H2 |

> 原 spec 寫 Find 高亮「< 200ms」，實際 chain 算下來達不到（debounce + 兩次 postMessage + worker compute）。新目標 < 500ms 是真實能達到的數字。

## 設計（4 個 phase，按 ROI 排序）

### Phase 1: Background prefetch（新增，最高 ROI）

**改動**:

- `packages/frontend/src/contexts/AnalysisContext.tsx` — 新增 `prefetchedEntriesRef`、
  `inflightPromisesRef`、`prefetchSearchData(uploadId)`、`abortControllersRef`
- `packages/frontend/src/pages/AnalysisPage.tsx` — `useEffect` 中以 idle scheduler
  觸發 prefetch
- `packages/frontend/src/components/SearchModal.tsx` — `loadData()` 先檢查 cache /
  in-flight，hit 就直接用、skip fetch

**Idle scheduler（Safari 沒 `requestIdleCallback`）**:

```ts
const ric: typeof requestIdleCallback =
  typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback.bind(window)
    : (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 16 } as any), 50);
```

在 spec 範圍內 Safari 還有 17% 桌面市佔，必須處理。

**邏輯（含 race condition）**:

```
AnalysisPage 渲染完
  → ric(() => prefetchSearchData(uploadId))
  → fetch /api/search/:id?limit=1M&export=true&compact=true
       (with AbortController)
  → 結果存到 prefetchedEntriesRef.current[uploadId]

SearchModal opens — loadData() 三路徑：
  (1) cache 已就位:
        const cached = prefetchedEntriesRef.current[uploadId];
        if (cached) { allEntriesRef.current = cached; setLoading(false); return; }
  (2) prefetch in-flight:
        const inflight = inflightPromisesRef.current[uploadId];
        if (inflight) {
          setLoading(true);
          allEntriesRef.current = await inflight;
          setLoading(false);
          return;
        }
  (3) cold path（prefetch 失敗或從未啟動）:
        正常走原有 fetch 邏輯
```

**Cancel scope（明確）**:

| 觸發 | 動作 |
|------|------|
| 使用者離開 AnalysisPage 前 prefetch 還沒完 | `abortControllersRef.current[uploadId].abort()`；in-flight promise reject 時 catch 掉，不報 error |
| 使用者切換到別的 analysis | abort 舊 analysis 的 inflight prefetch；新 analysis 重啟 |
| Prefetch 失敗（網路 / abort 之外的錯誤） | swallow error；SearchModal 開時走 cold path |

> Worker job 取消是另一個維度，見 Phase 2 / 開放問題 Phase 6。

### Phase 2: Web Worker — reshape + filter

**新增**: `packages/frontend/src/workers/search-worker.ts`

⚠️ **Worker 不解的部分**（防止實作者誤期）:

| 動作 | 在哪執行 | Worker 能否加速 |
|------|---------|---------------|
| `fetch()` get Response | 主線程 | ❌ |
| `Response.json()`（含 JSON.parse） | 主線程 | ❌（除非用 `Response.body.pipeThrough` + Transferable streaming，本 phase 不做） |
| Compact rows → entries reshape | 可移到 worker | ✅（~100-200ms 省）|
| Filter 整個 entries 陣列 | 可移到 worker | ✅（~300-500ms 省） |
| Match regex 整個 filteredEntries | 可移到 worker | ✅（見 Phase 3） |

→ 主線程 JSON.parse 那 ~600ms **此 phase 處理不到**。實際 modal-open warm 路徑（Phase 1
 prefetch 完成）的主要省時點是「filter 不卡」，不是「decode 變快」。

Worker 接三種 message（Phase 2 用前兩個，Phase 3 用第三個）:

1. **Reshape** — `{ type: 'reshape', columns, rows }` → `{ type: 'reshaped', entries }`
2. **Filter** — `{ type: 'filter', filterParams }`（worker 持有 entries）→
   `{ type: 'filtered', filteredIndices: number[] }`
3. **Match** — `{ type: 'match', pattern, useRegex }` → `{ type: 'matched', matchIndices: number[] }`

⚠️ **Memory 抉擇與 abort threshold（H2）**:

實作有兩條路：
- **A. Indices-only**: worker 持有 entries、主線程只持有 indices (Int32Array)。Memory 一份。
  Render 路徑要改：每次 react-window 要 visible 30 行時打 `getEntries(indices)` postMessage 拉。
- **B. Both-have**: worker 給整份 filtered entries 回主線程（structured clone ~100ms 對 1M
  entries）。Memory 雙份。

**初版選 B**——但加一條防護：

```ts
const MAX_HEAP_DOUBLING_ENTRIES = 300_000; // ≈ 60MB × 2 = 120MB cap
if (allEntriesRef.current.length > MAX_HEAP_DOUBLING_ENTRIES) {
  // fall back to A: indices-only with on-demand fetch
} else {
  // path B: clone filtered entries to main thread
}
```

300K 是經驗值（4GB Chromebook 可承受），實測再調。**不能拖到開放問題、實作者一定要在 Phase 2 PR 內處理這條 fallback**——否則 695K-entry bugreport 開到第二次就 OOM。

### Phase 3: async matchIndices

延續 Phase 2 worker，第三個 message。

主線程行為:

- Find input 變動（debounced 150ms by Phase 4）→ postMessage('match')
- 主線程**不等**結果——列表先用上一個 matchIndices 渲染（或 empty）
- worker 完成 → setMatchIndices(...) → 高亮浮現 + counter 更新

使用者感知：列表瞬間出現、~500ms 內高亮浮現（latency 預算詳見「目標」表）。

### Phase 4: filter debounce

`packages/frontend/src/components/SearchModal.tsx`:

對下列輸入加 150ms debounce：

- `tag` / `excludeTags` 文字輸入
- `pid` 文字輸入
- `q`（Find keyword）文字輸入

`level`、`buffer` 為按鈕/select，不需 debounce（立即觸發）。

實作：`useRef` + `setTimeout`，無新依賴。150ms 是經驗值（夠長讓使用者打完 3-4 個字、夠短不影響感知）。

## 不做（明確排除）

| 項目 | 為什麼不做 |
|------|----------|
| Backend `truncateMsg` query parameter | 違反 "no missed"——chars 201+ 的內容 client-side Find 不到 |
| Restore FTS5-as-query in handler | 違反 "no roundtrip during analysis"——keyword 打字 → backend → 等待 |
| Paginate / streaming-then-fallback | 違反 full-load 哲學；增加 code path、增加 cancel/consistency 複雜度 |
| Reduce heap footprint <200MB | 列為已知 trade-off，目前不在範圍 |
| Service Worker 介入 fetch / streaming JSON.parse | Phase 2 範圍外；如未來 JSON.parse 變主要瓶頸再考慮 |

> Note: backend `truncateMsg` 程式碼 (`routes/search.ts` 第 10 行 `truncate()` + 6 處應用) 已實作但不會被
> SearchModal 使用。**Cleanup trigger**: 若 6 個月內（即 2026-11-02 後）無 MCP server 或外部
> API 使用者使用此參數，由 Phase 7 一併移除。中間維持 dead code 不刪——保留外部選擇。

## 不改動

- react-window 虛擬滾動架構
- Detail panel 的 DOM 直操作（`detailEntryRef` + `style.display`）
- API 路由結構（不新增 endpoint，所有 perf 都在 frontend）
- RowComponent / SearchRow 渲染邏輯
- SearchFilters / SearchStatusBar 元件外觀

## 測試計畫

**現有 e2e 全部通過**（38/0/3 baseline 已在 PR #2 達成）。

**新增 perf 基準測試** (`packages/frontend/e2e/perf/search-modal.spec.ts`):

| 指標 | 量測方式 | Phase 完成後通過閾值 |
|------|---------|---------------------|
| modal-open p95（warm prefetch）| `performance.measure('search-warm', start, end)` | < 300ms |
| modal-open p95（cold） | 同上 | < 3s |
| filter input → list redraw p95 | `requestAnimationFrame` 後量測 | < 100ms |
| Find input → list scrollable p95 | input event → next frame | < 50ms |
| Find input → highlights drawn p95 | input event → matchIndices state | < 500ms |
| no long task > 50ms during filter/find | `PerformanceObserver({ entryTypes: ['longtask'] })` | 0 violations |

**Worst-case dataset**: THRPI-354 那份 695K entries 的 bugreport（已 fixture 化）。

**CI 收集**: GitHub Actions runner（chromium only），每 PR 跑一次。Regression > 20% 就 block merge——具體實作在 Phase 1 PR 中決定（簡單 JSON 上傳到 commit comment、或 baseline file 比對）。

## Phase 排序與 PR 拆分

每個 phase 一個獨立 PR，**順序固定**（後者依賴前者基礎建設）：

| PR | Phase | 估計檔案/行數 | 大小 | 風險 |
|----|-------|--------------|------|------|
| 1 | Background prefetch | 3 modified (~80 lines: AnalysisContext +50, AnalysisPage +15, SearchModal +15) | M | 中（idle scheduling、cancel、in-flight）|
| 2 | Web Worker infra + reshape + filter | 1 new (~250 lines worker), 2 modified (~60 lines: SearchModal +50, types.ts +10) | L | 高（worker lifecycle、message protocol、memory abort threshold）|
| 3 | async matchIndices | 2 modified (~30 lines: worker +20, SearchModal +10) | S | 低（前面 worker infra 落定後）|
| 4 | filter debounce | 1 modified (~25 lines: SearchModal) | XS | 低 |

每個 PR 獨立量 perf delta，下一 PR 啟動前先 review 上一個 PR 的實際收益。

## 開放問題

- **Phase 5 (memory)**: 已部分處理（Phase 2 abort threshold）。如果使用者抱怨 4GB 機器
  仍 OOM，未來切到完整 A 路徑（worker-only ownership + indices on main thread）。
- **Phase 6 (worker job cancellation)**:
  - prefetch 取消已在 Phase 1 內（AbortController 對 fetch 生效）
  - **但 worker 內 reshape/filter/match 計算是 fire-and-forget**——使用者開 modal → 立刻關 →
    worker 還在算。目前不取消（worker 完成就丟掉結果），消耗 CPU 但不影響正確性。
    若監測發現使用者開關頻繁、瀏覽器 CPU 持續高，再加 generation token：每次 postMessage
    帶遞增 generation id，worker 完成時若 id 已過時就丟棄結果不 postMessage 回主線程。
- **Phase 7 (dead-code cleanup)**: trigger 條件已在「不做」章節寫明。屆時要清的東西：
  - `routes/search.ts:10` 的 `truncate()` 函式
  - 6 處呼叫 site
  - query string 解析中的 `truncateMsg` parameter
  - 任何 docs / spec 提到 `truncateMsg`（含本檔案）

---

## Production Measurement (2026-05-02)

Phase 1 deploy 完當天於 logcat-ai.zmlab.io（VPS 198.13.48.150）跑五輪量測，使用真實
519K-entry analysis 的 production cache。所有數值由 PerformanceObserver `longtask` API +
`performance.now()` deltas 直接擷取，非估算。

### Measurement matrix

| Test | Scenario | Modal-open p50 | Modal-open p95 | Long tasks (>50ms) |
|------|----------|----------------|----------------|---------------------|
| T1 | Cold cache, no prefetch | 〜800ms | 〜900ms | 1 (load JSON) |
| T2 | Warm cache (prefetch hit) | <50ms | <80ms | 0 |
| T3 | Inflight await (open during prefetch) | varies w/ network | — | 0 |
| T4 | Filter switch (level/buffer/tag, 519K entries) | 8ms | 14ms | 0 |
| T5 | Find next/prev (Enter / Shift+Enter) | <30ms | <50ms | 0 |

### 結論

1. **Phase 1 mechanism works as designed.** 預期的 cache hit / inflight await / cold path
   三條路全部驗證；prefetch 取消、idempotency、Safari polyfill 都運作。
2. **Filter / Find 在現代 V8 + 既有 compact format 下完全不慢.** 519K entries 的 filter
   切換 14ms p95、Find 50ms p95，**零** long task。Phase 2/3/4 想優化的東西在 production
   不存在，繼續做就是優化不存在的問題。
3. **真正剩下的 bottleneck 在 backend.** 519K-entry analysis 的 prefetch HTTP request 本身
   在 backend 端要 ~67s（rawDataStore cold-cache rebuild + JSON serialize ~25MB gzip）。
   **這個瓶頸不在本 spec 範圍內**，需另開 backend warming spec 處理。

### 對未來的提醒

- 如果 production 上有人回報 modal 開啟仍慢，**先量 backend HTTP timing**（rawDataStore
  rebuild + serialize），不要假設是前端問題。
- 不要再回頭做 Phase 2/3/4 — 除非你有新的 production 數據顯示 filter / Find / parse
  其中一項在 main thread 真的 >100ms。本次量測的 baseline 是 519K entries on Cloudflare
  CDN + 4GB heap container，已經是 worst-case real workload。
