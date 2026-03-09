# SearchModal → Log Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite SearchModal from paginated search results into a Log Viewer with virtual scroll, live filtering, and Find Next/Prev navigation.

**Architecture:** Load all entries within time range via `export=true` API (up to 50K), store in `allEntries[]` state, filter client-side into `filteredEntries[]`, render with react-window `FixedSizeList`. Remove pagination entirely. Add Find navigation (Enter/Shift+Enter) with match counter.

**Tech Stack:** react-window, existing search API with `export=true`

---

### Task 1: Install react-window

**Files:**
- Modify: `packages/frontend/package.json`

**Step 1: Install react-window and types**

```bash
npm install -w packages/frontend react-window
npm install -w packages/frontend -D @types/react-window
```

**Step 2: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 3: Commit**

```bash
git add packages/frontend/package.json package-lock.json
git commit -m "chore: add react-window dependency for virtual scroll"
```

---

### Task 2: Refactor data loading — bulk load with export=true

Replace paginated loading with bulk loading. When the modal opens:
- With time range: load all entries via `export=true` (limit=50000)
- With tag preset (from Tags section): load via `export=true` (limit=50000)
- Without filters (empty open): load first batch via `export=true` (limit=50000)
- If totalMatches > 50000: show warning, data is truncated

**Files:**
- Modify: `packages/frontend/src/components/SearchModal.tsx`

**Step 1: Replace state model**

Remove these states:
- `page`, `limit` (no more pagination)
- `logcatResult`, `kernelResult` (replace with unified model)

Add these states:
```typescript
// All loaded entries (raw from API)
const [allEntries, setAllEntries] = useState<LogcatEntry[] | KernelEntry[]>([]);
const [totalAvailable, setTotalAvailable] = useState(0);
const [method, setMethod] = useState<'fts5' | 'keyword' | 'fts5-sql' | ''>('');
const [truncated, setTruncated] = useState(false); // true if totalMatches > 50K
```

Define entry types at the top of SearchModal.tsx:
```typescript
interface LogcatEntry {
  lineNumber: number;
  timestamp: string;
  pid?: number;
  tid?: number;
  level: string;
  tag: string;
  message: string;
  buffer?: string;
}

interface KernelEntry {
  entryIndex: number;
  timestamp: string;
  level: string;
  facility: string;
  message: string;
}
```

**Step 2: Rewrite loadData function**

Replace `doSearch` and `doSearchWithOffset` with a single `loadData`:

```typescript
const MAX_ENTRIES = 50_000;

const loadData = useCallback(async () => {
  setLoading(true);
  setError('');
  try {
    if (source === 'kernel') {
      const res = await searchKernel(uploadId, {
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        limit: MAX_ENTRIES,
        offset: 0,
        export: true,
      });
      setAllEntries(res.entries);
      setTotalAvailable(res.totalMatches);
      setMethod(res.method);
      setTruncated(res.totalMatches > MAX_ENTRIES);
    } else {
      const res = await searchLogcat(uploadId, {
        tag: tag.trim() || undefined,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        limit: MAX_ENTRIES,
        offset: 0,
        export: true,
      });
      setAllEntries(res.entries);
      setTotalAvailable(res.totalMatches);
      setMethod(res.method);
      setTruncated(res.totalMatches > MAX_ENTRIES);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Load failed');
  } finally {
    setLoading(false);
  }
}, [uploadId, source, tag, startTime, endTime]);
```

**Step 3: Update initial load useEffect**

Replace the existing `useEffect` that handles `initialTag` / `initialStartTime` to call `loadData()` instead of the old paginated search. The useEffect should:
- Set filter states from initial props (tag, startTime, endTime, source)
- Call `loadData()` once
- Set `initialSearchDone.current = true`

**Step 4: Remove old pagination code**

Remove: `doSearchWithOffset`, `goToPage`, `jumpToFocusPage`, `lastSearchRef`, `page` state, `limit` state, Per page selector, bottom pagination buttons, top pagination controls.

**Step 5: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 6: Commit**

```bash
git add packages/frontend/src/components/SearchModal.tsx
git commit -m "refactor(frontend): replace paginated search with bulk data loading"
```

---

### Task 3: Client-side live filtering

Add instant client-side filtering. All filter inputs (keyword, tag, level, pid, buffer) apply immediately without API calls. Only time range changes trigger a re-load from API.

**Files:**
- Modify: `packages/frontend/src/components/SearchModal.tsx`

**Step 1: Add filteredEntries with useMemo**

```typescript
const filteredEntries = useMemo(() => {
  let entries = allEntries;

  if (source === 'logcat') {
    let logcat = entries as LogcatEntry[];
    const kw = q.trim().toLowerCase();
    if (kw) {
      logcat = logcat.filter(e =>
        e.message.toLowerCase().includes(kw) || e.tag.toLowerCase().includes(kw)
      );
    }
    if (tag.trim()) {
      logcat = logcat.filter(e => e.tag === tag.trim());
    }
    if (level) {
      const levels = ['V', 'D', 'I', 'W', 'E', 'F'];
      const minIdx = levels.indexOf(level);
      if (minIdx >= 0) {
        logcat = logcat.filter(e => levels.indexOf(e.level) >= minIdx);
      }
    }
    if (pid) {
      const pidNum = Number(pid);
      if (!isNaN(pidNum)) logcat = logcat.filter(e => e.pid === pidNum);
    }
    if (buffer) {
      logcat = logcat.filter(e => e.buffer === buffer);
    }
    return logcat;
  } else {
    let kernel = entries as KernelEntry[];
    const kw = q.trim().toLowerCase();
    if (kw) {
      kernel = kernel.filter(e => e.message.toLowerCase().includes(kw));
    }
    if (level) {
      const levelNum = parseInt(level.replace(/[<>]/g, ''), 10);
      kernel = kernel.filter(e => {
        const n = parseInt(e.level.replace(/[<>]/g, ''), 10);
        return n <= levelNum;
      });
    }
    return kernel;
  }
}, [allEntries, source, q, tag, level, pid, buffer]);
```

**Step 2: Make filter inputs live**

Remove `onKeyDown={handleKeyDown}` from keyword/tag/pid inputs (no more Enter-to-search). The keyword input onChange already sets `q`, which triggers useMemo re-filter.

Keep time range inputs with a "Load Range" button (replaces "Search" button) since time range changes need an API call.

Update UI:
- Replace `Search` button with `Load Range` button, only enabled when startTime or endTime is set
- Add an initial "Load All" button for the first load when no filters are preset
- Remove the `handleKeyDown` that called `doSearch` on Enter from filter inputs

**Step 3: Update status bar**

Change status from `"1901–1950 of 3,178"` to:
```
"{allEntries.length.toLocaleString()} loaded | {filteredEntries.length.toLocaleString()} shown"
```

Show truncation warning if `truncated`:
```
"⚠ Showing first 50,000 of {totalAvailable.toLocaleString()} — narrow time range for full data"
```

**Step 4: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 5: Commit**

```bash
git add packages/frontend/src/components/SearchModal.tsx
git commit -m "feat(frontend): add client-side live filtering to SearchModal"
```

---

### Task 4: Virtual scroll with react-window

Replace `<table>` rendering with react-window `FixedSizeList` for smooth scrolling of large datasets.

**Files:**
- Modify: `packages/frontend/src/components/SearchModal.tsx`

**Step 1: Implement virtual scroll row renderers**

```typescript
import { FixedSizeList as VirtualList } from 'react-window';

const ROW_HEIGHT = 28; // px, matches text-xs + py-1

const LogcatRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
  const entry = filteredEntries[index] as LogcatEntry;
  const isMatch = matchIndices.has(index);
  const isCurrent = index === currentMatchIndex;
  return (
    <div
      style={style}
      data-ts={entry.timestamp}
      data-idx={index}
      className={`flex items-start text-xs font-mono border-b border-gray-800/50 hover:bg-gray-800/30 ${levelBg(entry.level)} ${isCurrent ? 'bg-indigo-500/20' : isMatch ? 'border-l-2 border-l-indigo-400/50' : ''}`}
    >
      <span className="text-gray-600 py-1 px-2 whitespace-nowrap w-[165px] shrink-0">{entry.timestamp}</span>
      <span className="text-gray-600 py-1 px-1 whitespace-nowrap w-[80px] shrink-0">{entry.pid ?? '?'}/{entry.tid ?? '?'}</span>
      <span className={`py-1 px-1 whitespace-nowrap w-[140px] shrink-0 font-semibold ${levelColor(entry.level)}`}>{entry.level}/{entry.tag}</span>
      <span className={`py-1 px-2 flex-1 truncate ${levelColor(entry.level)}`}>{entry.message}</span>
    </div>
  );
};

// Similar KernelRow component
```

**Step 2: Replace table with VirtualList**

Replace the `<table>` blocks with:
```tsx
{/* Column headers (sticky) */}
<div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b border-gray-700/60 bg-[#0d1117] sticky top-0 z-10 px-4">
  <span className="py-1.5 px-2 w-[165px] shrink-0">Timestamp</span>
  <span className="py-1.5 px-1 w-[80px] shrink-0">PID/TID</span>
  <span className="py-1.5 px-1 w-[140px] shrink-0">Level/Tag</span>
  <span className="py-1.5 px-2 flex-1">Message</span>
</div>

{/* Virtual scroll list */}
<VirtualList
  ref={virtualListRef}
  height={containerHeight}  // from parent div measurement
  itemCount={filteredEntries.length}
  itemSize={ROW_HEIGHT}
  overscanCount={20}
  className="px-4"
>
  {LogcatRow}
</VirtualList>
```

**Step 3: Measure container height**

Use a `ResizeObserver` or a wrapper div with `ref` to measure available height for the VirtualList:

```typescript
const containerRef = useRef<HTMLDivElement>(null);
const [containerHeight, setContainerHeight] = useState(500);

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      setContainerHeight(entry.contentRect.height);
    }
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

Wrap the VirtualList in:
```tsx
<div ref={containerRef} className="flex-1 min-h-0">
  {/* VirtualList here, using containerHeight */}
</div>
```

**Step 4: Remove bottom pagination entirely**

Delete the bottom pagination `<div>` block (First/Prev/Page N of M/Next/Last buttons).

**Step 5: Update initialFocusTime scroll**

Replace `scrollToFocusTime` to use `virtualListRef.current.scrollToItem(index, 'center')`:

```typescript
const virtualListRef = useRef<VirtualList>(null);

const scrollToIndex = useCallback((targetIndex: number) => {
  virtualListRef.current?.scrollToItem(targetIndex, 'center');
}, []);
```

For `initialFocusTime`, find the index with binary search on `filteredEntries` timestamps, then call `scrollToIndex`.

**Step 6: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 7: Commit**

```bash
git add packages/frontend/src/components/SearchModal.tsx
git commit -m "feat(frontend): replace table with react-window virtual scroll"
```

---

### Task 5: Find Next/Prev navigation

Add keyword match highlighting with navigation between matches.

**Files:**
- Modify: `packages/frontend/src/components/SearchModal.tsx`

**Step 1: Compute match indices**

```typescript
// Indices into filteredEntries that match the keyword
const matchIndices = useMemo(() => {
  const kw = q.trim().toLowerCase();
  if (!kw) return new Set<number>();
  const indices = new Set<number>();
  for (let i = 0; i < filteredEntries.length; i++) {
    const e = filteredEntries[i];
    const msg = 'message' in e ? e.message : '';
    const tagStr = 'tag' in e ? (e as LogcatEntry).tag : '';
    if (msg.toLowerCase().includes(kw) || tagStr.toLowerCase().includes(kw)) {
      indices.add(i);
    }
  }
  return indices;
}, [filteredEntries, q]);

const matchList = useMemo(() => Array.from(matchIndices).sort((a, b) => a - b), [matchIndices]);
const [currentMatchPos, setCurrentMatchPos] = useState(0); // position within matchList
const currentMatchIndex = matchList[currentMatchPos] ?? -1;
```

Note: `matchIndices` tracks which rows in `filteredEntries` contain the keyword. This is separate from the filtering — filtering uses tag/level/pid/buffer, while matchIndices highlights keyword matches within the already-filtered list. When only keyword is set (no other filters), all rows in filteredEntries already match the keyword, so matchIndices = all indices.

Wait — actually, when the keyword is used for filtering, `filteredEntries` already only contains matching rows. So `matchIndices` would be ALL indices. The Find Next/Prev would jump between every row, which is useless.

Better approach: **keyword is used for highlighting + navigation, NOT for filtering**. Remove keyword from the `filteredEntries` useMemo filter. Keep keyword only for matchIndices computation and visual highlighting. This way the user sees all log entries (filtered by tag/level/pid/buffer) and can search within them with keyword, jumping between matches.

Update the `filteredEntries` useMemo: remove the `kw` filter block. Keyword only drives `matchIndices`.

**Step 2: Add navigation functions**

```typescript
const goToNextMatch = useCallback(() => {
  if (matchList.length === 0) return;
  const next = (currentMatchPos + 1) % matchList.length;
  setCurrentMatchPos(next);
  scrollToIndex(matchList[next]);
}, [matchList, currentMatchPos, scrollToIndex]);

const goToPrevMatch = useCallback(() => {
  if (matchList.length === 0) return;
  const prev = (currentMatchPos - 1 + matchList.length) % matchList.length;
  setCurrentMatchPos(prev);
  scrollToIndex(matchList[prev]);
}, [matchList, currentMatchPos, scrollToIndex]);
```

**Step 3: Update keyword input UI**

Replace the keyword input row with Find-style UI:

```tsx
<div className="flex gap-2 items-center">
  <div className="flex-1 relative">
    <input
      ref={inputRef}
      type="text"
      value={q}
      onChange={(e) => { setQ(e.target.value); setCurrentMatchPos(0); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goToNextMatch(); }
        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); goToPrevMatch(); }
      }}
      placeholder={source === 'kernel' ? 'Find in kernel logs...' : 'Find in logs...'}
      className="w-full bg-[#161b22] border ..."
    />
    {q.trim() && matchList.length > 0 && (
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        {currentMatchPos + 1} / {matchList.length}
      </span>
    )}
  </div>
  <button onClick={goToPrevMatch} disabled={matchList.length === 0} title="Previous match (Shift+Enter)"
    className="px-2 py-2 ...">▲</button>
  <button onClick={goToNextMatch} disabled={matchList.length === 0} title="Next match (Enter)"
    className="px-2 py-2 ...">▼</button>
</div>
```

**Step 4: Reset currentMatchPos when matchList changes**

```typescript
useEffect(() => {
  setCurrentMatchPos(0);
  if (matchList.length > 0) {
    scrollToIndex(matchList[0]);
  }
}, [matchList]);
```

**Step 5: Intercept Ctrl+F / Cmd+F**

In the Escape key handler useEffect, add:
```typescript
if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
  e.preventDefault();
  inputRef.current?.focus();
  inputRef.current?.select();
}
```

**Step 6: Update row highlight rendering**

In `LogcatRow` and `KernelRow`, the `isCurrent` and `isMatch` booleans (from Step 1) control styling:
- `isCurrent`: `bg-indigo-500/20 border-l-2 border-l-indigo-500` (strong highlight)
- `isMatch`: `border-l-2 border-l-indigo-400/30` (subtle left marker)
- Neither: normal row

**Step 7: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 8: Commit**

```bash
git add packages/frontend/src/components/SearchModal.tsx
git commit -m "feat(frontend): add Find Next/Prev navigation with match counter"
```

---

### Task 6: Restore initialFocusTime support

The `initialFocusTime` feature (from Timeline click) must work with virtual scroll.

**Files:**
- Modify: `packages/frontend/src/components/SearchModal.tsx`

**Step 1: Implement focusTime scroll for virtual list**

After data loads (`allEntries` is set), if `initialFocusTime` is provided:
1. Binary search `allEntries` for the closest timestamp <= focusTime
2. Use `virtualListRef.current.scrollToItem(index, 'center')`
3. Store the focusIndex in a ref for persistent `▶` marker rendering

```typescript
const focusIndex = useRef<number>(-1);

// In a useEffect after allEntries loads:
useEffect(() => {
  if (!initialFocusTime || allEntries.length === 0) return;
  // Find closest entry <= focusTime
  let best = 0;
  for (let i = 0; i < allEntries.length; i++) {
    const ts = 'timestamp' in allEntries[i] ? (allEntries[i] as any).timestamp : '';
    if (ts <= initialFocusTime) best = i;
  }
  focusIndex.current = best;
  // Scroll after a tick to let VirtualList mount
  requestAnimationFrame(() => {
    virtualListRef.current?.scrollToItem(best, 'center');
  });
}, [allEntries, initialFocusTime]);
```

**Step 2: Render ▶ marker in row component**

In `LogcatRow` / `KernelRow`, check `index === focusIndex.current`:
```tsx
const isFocus = index === focusIndex.current;
// In the timestamp cell:
<span className="...">
  {isFocus && <span className="text-indigo-400 font-bold text-[10px]">▶ </span>}
  {entry.timestamp}
</span>
```

Also add persistent left border: `${isFocus ? 'border-l-[3px] border-l-indigo-500' : ''}`

**Step 3: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 4: Commit**

```bash
git add packages/frontend/src/components/SearchModal.tsx
git commit -m "feat(frontend): restore initialFocusTime with virtual scroll"
```

---

### Task 7: Update Export to use client-side data

Since we now have all entries in memory, export can use client data instead of making another API call.

**Files:**
- Modify: `packages/frontend/src/components/SearchModal.tsx`

**Step 1: Simplify export handler**

```typescript
const handleExport = (format: 'csv' | 'text') => {
  const keyword = q.trim() || (source === 'logcat' ? tag.trim() : '') || 'search';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = source === 'kernel' ? 'kernel-search' : 'logcat-search';

  // Export filteredEntries (what user sees) instead of fetching from API
  if (source === 'kernel') {
    const entries = filteredEntries as KernelEntry[];
    if (format === 'csv') {
      downloadBlob(kernelEntriesToCSV(entries), `${prefix}-${keyword}-${ts}.csv`, 'text/csv;charset=utf-8');
    } else {
      downloadBlob(kernelEntriesToDmesgText(entries), `${prefix}-${keyword}-${ts}.txt`, 'text/plain;charset=utf-8');
    }
  } else {
    const entries = filteredEntries as LogcatEntry[];
    if (format === 'csv') {
      downloadBlob(entriesToCSV(entries), `${prefix}-${keyword}-${ts}.csv`, 'text/csv;charset=utf-8');
    } else {
      downloadBlob(entriesToLogcatText(entries), `${prefix}-${keyword}-${ts}.txt`, 'text/plain;charset=utf-8');
    }
  }
  setShowExportMenu(false);
};
```

Remove the `exporting` state and async export logic. Export is now synchronous from client memory.

**Step 2: Update export button labels**

Change from `({result.totalMatches.toLocaleString()} rows)` to `({filteredEntries.length.toLocaleString()} rows)`.

**Step 3: Verify build**

```bash
npm run build -w packages/frontend
```

**Step 4: Commit**

```bash
git add packages/frontend/src/components/SearchModal.tsx
git commit -m "refactor(frontend): export from client-side data instead of API"
```

---

### Task 8: Update E2E tests

The e2e tests reference pagination elements that no longer exist. Update them for the new log viewer behavior.

**Files:**
- Modify: `packages/frontend/e2e/tests/search-modal.spec.ts`
- Modify: `packages/frontend/e2e/tests/timeline-search.spec.ts`

**Step 1: Update search-modal.spec.ts**

1. `'opens from header Search button with correct layout'` — Keep as-is (filters still exist). Remove Per page selector check if it checks for that.

2. `'switching to Kernel tab hides Logcat filters'` — Keep as-is.

3. `'keyword search returns results'` — Change: no need to click "Search" button. Type keyword → results filter immediately. Wait for data to load first (the modal auto-loads on open), then type keyword and check filtered count.

4. `'empty search browses all entries'` — Change: modal now auto-loads all entries on open (when opened from Search button with no preset). Wait for entries to appear without clicking Search.

5. `'pagination works'` — **Remove or replace**. Pagination no longer exists. Replace with a test that verifies virtual scroll shows entries (scrollable content).

**Step 2: Update timeline-search.spec.ts**

1. `'hover reveals search icon and opens SearchModal'` — Update: time range fields still pre-fill. Check still works.

2. `'search icon opens modal at correct page near focus time'` — Update: replace pagination checks (page > 1) with:
   - Check that `data-focus-highlight="true"` row exists (▶ marker renders as part of React, not DOM manipulation)
   - Check timestamp proximity
   - Remove page number assertions

**Step 3: Run e2e tests**

```bash
npm run e2e -w packages/frontend
```

Fix any failures.

**Step 4: Commit**

```bash
git add packages/frontend/e2e/tests/search-modal.spec.ts packages/frontend/e2e/tests/timeline-search.spec.ts
git commit -m "test(e2e): update search tests for log viewer mode"
```

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update SearchModal description**

Update the `components/SearchModal.tsx` entry to reflect the new architecture:
- Virtual scroll with react-window
- Client-side live filtering (no pagination)
- Find Next/Prev with Enter/Shift+Enter
- Bulk data loading via `export=true` (up to 50K entries)

**Step 2: Update e2e test count** if changed.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for SearchModal log viewer redesign"
```
