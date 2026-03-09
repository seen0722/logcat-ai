# SearchModal → Log Viewer 重構設計

> **目標**：將 SearchModal 從「搜尋結果分頁列表」改造為「Log Viewer + 即時過濾器」，提供類似 editor 的連續滾動、即時過濾、Find Next/Prev 體驗。

## 架構概覽

保留現有 Search API 不變，前端改為一次載入時間範圍內全部 entries，用 virtual scroll 渲染，前端即時過濾。

## 資料策略

- **進入時**：根據時間範圍用 `export=true` 一次載入全部 entries（上限 50K）
- **無時間範圍**：先載入前 500 筆，使用者滾動到底時 lazy-load 下一批（infinite scroll）
- **超過 50K 筆**：顯示提示，要求縮小時間範圍
- **資料結構**：`allEntries[]` 存完整資料，`filteredEntries[]` 存過濾後的子集，兩者都是 in-memory array

## Virtual Scroll

- 使用 **react-window** (`FixedSizeList`)，每行固定高度（~24px）
- 只渲染可視區域 ± overscan buffer（前後各 20 行）
- 50K 筆時 DOM 節點數維持在 ~100 個，滾動流暢
- 自由拖動 scrollbar 無延遲（資料已在記憶體）

## 即時過濾（Live Filter）

- keyword / tag / level / pid / buffer 改為 **onChange 即時過濾**（debounce 150ms）
- 移除 "Search" 按鈕，改為直接在 input 旁顯示 match count
- 時間範圍（From/To）仍需按 Enter 或 "Load Range" 按鈕觸發重新載入（因為需要 API call）
- 過濾邏輯全在前端：`allEntries.filter(e => matchKeyword && matchTag && matchLevel && ...)`

## Find Next/Prev 導航

- 搜尋框右側顯示 **「3 / 47 matches」** 計數器
- **↑↓ 按鈕**（或 `Enter` / `Shift+Enter`）在 match 之間跳轉
- 當前 match 行加 highlight（indigo bg），其他 match 行加淡色標記（border-left）
- `Ctrl+F` / `Cmd+F` 攔截瀏覽器預設，focus 到搜尋框

## UI 佈局

```
┌─────────────────────────────────────────────┐
│ Search [Logcat] [Kernel]               ×    │
├─────────────────────────────────────────────┤
│ 🔍 keyword...        ↑ ↓  3/47    Tag  ... │
│ Buffer [All▾] Level [All▾] PID [__]        │
│ From [________]  To [________]  Load Range  │
├─────────────────────────────────────────────┤
│ 12,847 loaded │ 47 matches │ KEYWORD       │
├─────────────────────────────────────────────┤
│ (virtual scroll - continuous log view)      │
│ 01-27 15:32:03.103  1702/5959 E/crash...   │
│ 01-27 15:32:03.104  1702/5958 E/android... │
│ ▶ 01-27 15:32:03.491  ...  ← current match │
│ 01-27 15:32:04.012  1702/5961 E/android... │
│ ...                                         │
└─────────────────────────────────────────────┘
```

主要差異：
- **無分頁** — 連續滾動
- **搜尋框整合 Find 導航** — ↑↓ + match 計數
- **狀態列**：顯示「loaded / matches」而非「page X/Y」
- **"Load Range" 按鈕** 取代 "Search" — 只在改時間範圍時需要

## 保留的功能

- Logcat / Kernel tab 切換
- Export CSV / Text（從 `allEntries` 或 `filteredEntries` 導出）
- `initialFocusTime` 的 `▶` marker + 自動滾動
- 從 Timeline / Tags 進入時的 preset filters

## 技術選型

- **react-window** — 輕量（~6KB），成熟穩定，FixedSizeList 足夠

## 不做的事（YAGNI）

- ❌ Regex 搜尋
- ❌ 多 keyword AND/OR
- ❌ 行號顯示
- ❌ 書籤/標記功能
- ❌ 跨 Logcat+Kernel 同時搜尋
