import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { List, useListRef } from 'react-window';
import { searchLogcat, searchKernel } from '../lib/api';
import { useAnalysisContext } from '../contexts/AnalysisContext';
import { entriesToCSV, entriesToLogcatText, kernelEntriesToCSV, kernelEntriesToDmesgText, downloadBlob } from '../lib/export-utils';
import { RowComponent, SearchFilters, SearchStatusBar, ROW_HEIGHT, DETAIL_HEIGHT } from './search';
import type { SearchSource, BaseEntry, LogcatEntry, KernelEntry, RowExtraProps } from './search';

/** Backend export limit — request all entries at once */
const LOAD_ALL_LIMIT = 1_000_000;

interface Props {
  uploadId: string;
  onClose: () => void;
  initialTag?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialSource?: SearchSource;
  /** The exact event timestamp to scroll to after auto-search (center of time window) */
  initialFocusTime?: string;
}

export default function SearchModal({ uploadId, onClose, initialTag, initialStartTime, initialEndTime, initialSource, initialFocusTime }: Props) {
  // Phase 1 prefetch: pull cache + in-flight accessors from context
  const { getPrefetchedEntries, getInflightPrefetch } = useAnalysisContext();
  const [source, setSource] = useState<SearchSource>(initialSource ?? 'logcat');
  const [q, setQ] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  // Detail panel: use refs + direct DOM manipulation to avoid re-rendering rows
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const detailContentRef = useRef<HTMLPreElement>(null);
  const detailMetaRef = useRef<HTMLDivElement>(null);
  const detailEntryRef = useRef<(LogcatEntry | KernelEntry) | null>(null);
  const listWrapRef = useRef<HTMLDivElement>(null);
  const originalListHeight = useRef<number>(0);
  // Logcat-only filters
  const [tag, setTag] = useState(initialTag ?? '');
  const [excludeTags, setExcludeTags] = useState('');
  // Saved tag presets (localStorage)
  const [savedTags, setSavedTags] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('logcat-ai-saved-tags') || '[]'); } catch { return []; }
  });
  const saveCurrentTag = useCallback(() => {
    const t = tag.trim();
    if (!t || savedTags.includes(t)) return;
    const updated = [...savedTags, t];
    setSavedTags(updated);
    try { localStorage.setItem('logcat-ai-saved-tags', JSON.stringify(updated)); } catch {}
  }, [tag, savedTags]);
  const removeSavedTag = useCallback((t: string) => {
    const updated = savedTags.filter(s => s !== t);
    setSavedTags(updated);
    try { localStorage.setItem('logcat-ai-saved-tags', JSON.stringify(updated)); } catch {}
  }, [savedTags]);
  const [pid, setPid] = useState('');
  const [buffer, setBuffer] = useState('');
  // Shared filters
  const [level, setLevel] = useState(initialTag ? 'E' : '');
  // Time range filters (client-side only — no server round-trip)
  const [startTime, setStartTime] = useState(initialStartTime ?? '');
  const [endTime, setEndTime] = useState(initialEndTime ?? '');

  // Data states — allEntries in ref to avoid React managing large arrays
  const allEntriesRef = useRef<LogcatEntry[] | KernelEntry[]>([]);
  const filteredRef = useRef<LogcatEntry[] | KernelEntry[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [method, setMethod] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Find navigation
  const [currentMatchPos, setCurrentMatchPos] = useState(0);

  // Bookmarks — stored by stable key (lineNumber for logcat, entryIndex for kernel)
  const [bookmarkedKeys, setBookmarkedKeys] = useState<Set<number>>(() => new Set());
  const [currentBookmarkPos, setCurrentBookmarkPos] = useState(0);

  // UI states
  const [visible, setVisible] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(() => Math.round(window.innerHeight * 0.85));
  const initialLoadDone = useRef(false);
  const [focusIndex, setFocusIndex] = useState(-1);

  // ── Data Loading (one-time full load) ──

  const loadData = useCallback(async (opts?: { src?: SearchSource }) => {
    const effectiveSource = opts?.src ?? source;

    // Phase 1 prefetch: only logcat is prefetched. Kernel always cold-loads.
    if (effectiveSource === 'logcat') {
      // Path 1: cache hit
      const cached = getPrefetchedEntries(uploadId);
      if (cached) {
        allEntriesRef.current = cached as LogcatEntry[];
        setDataVersion((v) => v + 1);
        setMethod('keyword'); // matches in-memory path label
        return;
      }
      // Path 2: prefetch in-flight — await it instead of starting a second fetch
      const inflight = getInflightPrefetch(uploadId);
      if (inflight) {
        setLoading(true);
        setError('');
        try {
          const entries = await inflight;
          if (entries.length > 0) {
            allEntriesRef.current = entries as LogcatEntry[];
            setDataVersion((v) => v + 1);
            setMethod('keyword');
            return;
          }
          // entries.length === 0 means prefetch was aborted or errored;
          // fall through to cold path below.
        } finally {
          setLoading(false);
        }
      }
    }

    // Path 3: cold path (original behavior, unchanged)
    setLoading(true);
    setError('');
    try {
      if (effectiveSource === 'kernel') {
        const res = await searchKernel(uploadId, {
          limit: LOAD_ALL_LIMIT,
          export: true,
        });
        allEntriesRef.current = res.entries as KernelEntry[];
        setDataVersion(v => v + 1);
        setMethod(res.method);
      } else {
        const res = await searchLogcat(uploadId, {
          limit: LOAD_ALL_LIMIT,
          export: true,
          compact: true,
        });
        allEntriesRef.current = res.entries as LogcatEntry[];
        setDataVersion(v => v + 1);
        setMethod(res.method);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [uploadId, source, getPrefetchedEntries, getInflightPrefetch]);

  // ── Client-side Filtering ──
  // ALL filtering (level/pid/buffer/tag/excludeTags/startTime/endTime) is client-side
  // keyword (q) is NOT used for filtering — only for Find Next/Prev highlighting

  const filteredEntries = useMemo(() => {
    const all = allEntriesRef.current;
    if (source === 'logcat') {
      const entries = all as LogcatEntry[];
      const levelMap: Record<string, number> = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5 };
      const minLevelIdx = level ? (levelMap[level] ?? -1) : -1;
      const pidNum = pid ? Number(pid) : NaN;
      const includeSet = tag.trim()
        ? new Set(tag.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
        : null;
      const excludeSet = excludeTags.trim()
        ? new Set(excludeTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
        : null;
      const st = startTime.trim();
      const et = endTime.trim();
      const hasAnyFilter = minLevelIdx >= 0 || !isNaN(pidNum) || !!buffer || includeSet || excludeSet || !!st || !!et;
      if (!hasAnyFilter) { filteredRef.current = entries; return entries; }
      const result: LogcatEntry[] = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (minLevelIdx >= 0 && (levelMap[e.level] ?? 0) < minLevelIdx) continue;
        if (!isNaN(pidNum) && e.pid !== pidNum) continue;
        if (buffer && e.buffer !== buffer) continue;
        if (includeSet) { const t = (e.tag ?? '').toLowerCase(); if (!includeSet.has(t)) continue; }
        if (excludeSet) { const t = (e.tag ?? '').toLowerCase(); if (excludeSet.has(t)) continue; }
        if (st && e.timestamp < st) continue;
        if (et && e.timestamp > et) continue;
        result.push(e);
      }
      filteredRef.current = result;
      return result;
    } else {
      const entries = all as KernelEntry[];
      const st = startTime.trim();
      const et = endTime.trim();
      const hasAnyFilter = !!level || !!st || !!et;
      if (!hasAnyFilter) { filteredRef.current = entries; return entries; }
      const result: KernelEntry[] = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (level) {
          const levelNum = parseInt(level.replace(/[<>]/g, ''), 10);
          const n = parseInt(e.level.replace(/[<>]/g, ''), 10);
          if (n > levelNum) continue;
        }
        if (st && e.timestamp < st) continue;
        if (et && e.timestamp > et) continue;
        result.push(e);
      }
      filteredRef.current = result;
      return result;
    }
  }, [dataVersion, source, level, pid, buffer, tag, excludeTags, startTime, endTime]);

  // ── Find Next/Prev ──

  const searchPattern = useMemo((): RegExp | null => {
    const kw = q.trim();
    if (!kw) return null;
    if (useRegex) {
      try { return new RegExp(kw, 'gi'); } catch { return null; }
    }
    return new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  }, [q, useRegex]);

  const matchIndices = useMemo(() => {
    if (!searchPattern) return new Set<number>();
    const indices = new Set<number>();
    for (let i = 0; i < filteredEntries.length; i++) {
      const e = filteredEntries[i] as BaseEntry;
      const msg = e.message ?? '';
      const tagStr = 'tag' in e ? (e as LogcatEntry).tag : '';
      searchPattern.lastIndex = 0;
      if (searchPattern.test(msg)) { indices.add(i); continue; }
      searchPattern.lastIndex = 0;
      if (searchPattern.test(tagStr)) { indices.add(i); }
    }
    return indices;
  }, [filteredEntries, searchPattern]);

  const matchList = useMemo(() => Array.from(matchIndices).sort((a, b) => a - b), [matchIndices]);
  const currentMatchIndex = matchList.length > 0 ? (matchList[currentMatchPos] ?? -1) : -1;

  const scrollToIndex = useCallback((targetIndex: number) => {
    listRef.current?.scrollToRow({ index: targetIndex, align: 'center' });
  }, [listRef]);

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

  // Reset match position when matchList changes
  useEffect(() => {
    setCurrentMatchPos(0);
    if (matchList.length > 0) {
      scrollToIndex(matchList[0]);
    }
  }, [matchList.length]);

  // ── Bookmarks ──

  const handleBookmarkToggle = useCallback((filteredIdx: number) => {
    const entry = filteredRef.current[filteredIdx];
    if (!entry) return;
    const key = 'lineNumber' in entry ? (entry as LogcatEntry).lineNumber : (entry as KernelEntry).entryIndex;
    setBookmarkedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }, []);

  const bookmarkListInFiltered = useMemo(() => {
    const entries = filteredEntries;
    const result: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const key = 'lineNumber' in e ? (e as LogcatEntry).lineNumber : (e as KernelEntry).entryIndex;
      if (bookmarkedKeys.has(key)) result.push(i);
    }
    return result;
  }, [filteredEntries, bookmarkedKeys]);

  const goToNextBookmark = useCallback(() => {
    if (bookmarkListInFiltered.length === 0) return;
    const next = (currentBookmarkPos + 1) % bookmarkListInFiltered.length;
    setCurrentBookmarkPos(next);
    scrollToIndex(bookmarkListInFiltered[next]);
  }, [bookmarkListInFiltered, currentBookmarkPos, scrollToIndex]);

  const goToPrevBookmark = useCallback(() => {
    if (bookmarkListInFiltered.length === 0) return;
    const prev = (currentBookmarkPos - 1 + bookmarkListInFiltered.length) % bookmarkListInFiltered.length;
    setCurrentBookmarkPos(prev);
    scrollToIndex(bookmarkListInFiltered[prev]);
  }, [bookmarkListInFiltered, currentBookmarkPos, scrollToIndex]);

  const clearBookmarks = useCallback(() => {
    setBookmarkedKeys(new Set());
    setCurrentBookmarkPos(0);
  }, []);

  // ── FocusTime ──

  useEffect(() => {
    // Search through filteredEntries (not allEntries) since the virtual list renders filteredEntries
    const entries = filteredRef.current;
    if (!initialFocusTime || entries.length === 0) return;
    let best = 0;
    for (let i = 0; i < entries.length; i++) {
      const ts = (entries[i] as BaseEntry).timestamp ?? '';
      if (ts <= initialFocusTime) best = i;
    }
    setFocusIndex(best);
    requestAnimationFrame(() => {
      listRef.current?.scrollToRow({ index: best, align: 'center' });
    });
  }, [dataVersion, initialFocusTime, listRef, startTime, endTime]);

  // ── Initial Load ──

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    loadData({ src: initialSource ?? 'logcat' });
  }, []);

  // ── Container height measurement ──
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Fade-in / close ──

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Keyboard shortcuts: Escape, Ctrl+F, Arrow Left/Right for page scroll
  const listHeight = useMemo(() => Math.max(containerHeight - 20, 200), [containerHeight]);
  const pageSize = useMemo(() => Math.floor(listHeight / ROW_HEIGHT), [listHeight]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // Arrow Left/Right for page navigation (only when not in an input)
      const active = document.activeElement;
      const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
      if (!isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const list = listRef.current;
        if (!list) return;
        // Get current scroll position as row index
        const scrollEl = listWrapRef.current?.querySelector('[style*="overflow"]') as HTMLElement | null;
        const scrollTop = scrollEl?.scrollTop ?? 0;
        const currentRow = Math.floor(scrollTop / ROW_HEIGHT);
        const maxRow = filteredRef.current.length - 1;
        if (e.key === 'ArrowLeft') {
          const target = Math.max(0, currentRow - pageSize);
          list.scrollToRow({ index: target, align: 'start' });
        } else {
          const target = Math.min(maxRow, currentRow + pageSize);
          list.scrollToRow({ index: target, align: 'start' });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose, listRef, pageSize]);

  // ── Tab switching ──

  const switchSource = (newSource: SearchSource) => {
    if (newSource === source) return;
    setSource(newSource);
    setQ('');
    setTag('');
    setPid('');
    setBuffer('');
    setLevel('');
    setStartTime('');
    setEndTime('');
    allEntriesRef.current = []; filteredRef.current = []; setDataVersion(v => v + 1);
    setMethod('');
    setError('');
    setCurrentMatchPos(0);
    setFocusIndex(-1);
    setTimeout(() => {
      inputRef.current?.focus();
      loadData({ src: newSource });
    }, 0);
  };

  // ── Export ──

  const handleExport = (format: 'csv' | 'text') => {
    const keyword = q.trim() || (source === 'logcat' ? tag.trim() : '') || 'search';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = source === 'kernel' ? 'kernel-search' : 'logcat-search';

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
  };

  // ── Row props (passed to RowComponent via react-window rowProps) ──

  const filteredEntriesRef = useRef(filteredEntries);
  filteredEntriesRef.current = filteredEntries;
  // Pure DOM manipulation — zero React re-renders
  const handleExpandToggleStable = useCallback((_idx: number) => {
    const entry = filteredEntriesRef.current[_idx];
    if (!entry || !detailPanelRef.current || !detailContentRef.current || !detailMetaRef.current) return;
    const listEl = listWrapRef.current?.querySelector('[style*="height"]') as HTMLElement | null;
    if (detailEntryRef.current === entry) {
      // Toggle off — same row clicked
      detailEntryRef.current = null;
      detailPanelRef.current.style.display = 'none';
      if (listEl && originalListHeight.current) listEl.style.height = `${originalListHeight.current}px`;
      return;
    }
    // Save original height on first expand
    if (!detailEntryRef.current && listEl) {
      originalListHeight.current = listEl.getBoundingClientRect().height;
    }
    detailEntryRef.current = entry;
    // Update meta — access logcat-specific fields via narrowing
    const ts = entry.timestamp ?? '';
    const logcat = 'tag' in entry ? (entry as LogcatEntry) : null;
    const pid = logcat?.pid != null ? `PID ${logcat.pid}/${logcat.tid}` : '';
    const tag = logcat?.tag ? `${entry.level}/${logcat.tag}` : (entry.level ?? '');
    const buf = logcat?.buffer ? `buffer:${logcat.buffer}` : '';
    detailMetaRef.current.textContent = [ts, pid, tag, buf].filter(Boolean).join('  ');
    // Update content
    detailContentRef.current.textContent = entry.message;
    // Show panel and shrink list from original height
    detailPanelRef.current.style.display = 'flex';
    if (listEl && originalListHeight.current) {
      listEl.style.height = `${Math.max(originalListHeight.current - DETAIL_HEIGHT, 150)}px`;
    }
  }, []);

  // Compute the stable key of the current bookmark being navigated to
  const currentBookmarkKey = useMemo(() => {
    if (bookmarkListInFiltered.length === 0) return -1;
    const filteredIdx = bookmarkListInFiltered[currentBookmarkPos];
    if (filteredIdx == null) return -1;
    const entry = filteredEntries[filteredIdx];
    if (!entry) return -1;
    return 'lineNumber' in entry ? (entry as LogcatEntry).lineNumber : (entry as KernelEntry).entryIndex;
  }, [bookmarkListInFiltered, currentBookmarkPos, filteredEntries]);

  const rowProps = useMemo<RowExtraProps>(() => ({
    entries: filteredEntries,
    source,
    currentMatchIndex,
    matchIndices,
    focusIdx: focusIndex,
    onExpandToggle: handleExpandToggleStable,
    highlightPattern: searchPattern,
    bookmarkedKeys,
    currentBookmarkKey,
    onBookmarkToggle: handleBookmarkToggle,
  }), [filteredEntries, source, currentMatchIndex, matchIndices, focusIndex, handleExpandToggleStable, bookmarkedKeys, currentBookmarkKey, handleBookmarkToggle]);

  const allEntries = allEntriesRef.current;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 transition-colors duration-200 ${visible ? 'bg-black/80' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-6xl 2xl:max-w-7xl bg-surface border border-border/60 rounded-xl shadow-2xl flex flex-col max-h-[95vh] transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: tab switcher + find input + nav — all in one row */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 shrink-0">
          <div className="flex bg-surface-card rounded-md p-0.5 border border-border/60 shrink-0">
            <button
              onClick={() => switchSource('logcat')}
              className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
                source === 'logcat'
                  ? 'bg-accent text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Logcat
            </button>
            <button
              onClick={() => switchSource('kernel')}
              className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
                source === 'kernel'
                  ? 'bg-accent text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Kernel
            </button>
          </div>
          <div className="flex-1 relative">
            {/* Search icon */}
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
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
              className="w-full bg-surface-card border border-border/60 rounded-md pl-8 pr-24 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            {q.trim() ? (
              <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] font-mono text-gray-400 pointer-events-none tabular-nums">
                {matchList.length > 0 ? `${currentMatchPos + 1}/${matchList.length}` : '0/0'}
              </span>
            ) : (
              <span className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 pointer-events-none hidden sm:inline">
                {navigator.platform?.includes('Mac') ? '⌘F' : 'Ctrl+F'}
              </span>
            )}
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                useRegex ? 'bg-accent/30 text-accent font-bold' : 'text-gray-500 hover:text-gray-300'
              }`}
              title={useRegex ? 'Regex enabled' : 'Enable regex'}
              aria-label={useRegex ? 'Regex enabled' : 'Enable regex'}
            >
              .*
            </button>
          </div>
          <button
            onClick={goToPrevMatch}
            disabled={matchList.length === 0}
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
            className="px-2 py-1.5 text-xs rounded-md border border-border/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors bg-surface-card"
          >
            {'\u25B2'}
          </button>
          <button
            onClick={goToNextMatch}
            disabled={matchList.length === 0}
            title="Next match (Enter)"
            aria-label="Next match"
            className="px-2 py-1.5 text-xs rounded-md border border-border/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors bg-surface-card"
          >
            {'\u25BC'}
          </button>
          {/* Bookmark navigation */}
          {bookmarkedKeys.size > 0 && (
            <>
              <div className="w-px h-5 bg-gray-700/40" />
              <div className="flex items-center gap-1">
                <svg width="12" height="14" viewBox="0 0 10 12" fill="none" className="text-warm shrink-0">
                  <path d="M1 1.5C1 1.22 1.22 1 1.5 1H8.5C8.78 1 9 1.22 9 1.5V11L5 8.5L1 11V1.5Z" fill="#d4a06a" stroke="#d4a06a" strokeWidth="1" />
                </svg>
                <span className="text-[10px] text-warm font-mono tabular-nums">
                  {bookmarkListInFiltered.length > 0
                    ? `${currentBookmarkPos + 1}/${bookmarkListInFiltered.length}`
                    : `${bookmarkedKeys.size}`
                  }
                </span>
              </div>
              <button
                onClick={goToPrevBookmark}
                disabled={bookmarkListInFiltered.length === 0}
                title="Previous bookmark"
                aria-label="Previous bookmark"
                className="px-1.5 py-1 text-xs rounded-md border border-warm/30 text-warm hover:text-white hover:bg-warm/20 disabled:opacity-30 transition-colors"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={goToNextBookmark}
                disabled={bookmarkListInFiltered.length === 0}
                title="Next bookmark"
                aria-label="Next bookmark"
                className="px-1.5 py-1 text-xs rounded-md border border-warm/30 text-warm hover:text-white hover:bg-warm/20 disabled:opacity-30 transition-colors"
              >
                {'\u25BC'}
              </button>
              <button
                onClick={clearBookmarks}
                title="Clear all bookmarks"
                aria-label="Clear all bookmarks"
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear
              </button>
            </>
          )}
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors shrink-0"
            aria-label="Close search"
          >
            &times;
          </button>
        </div>

        {/* Filters + Time range (all client-side) */}
        <SearchFilters
          source={source}
          tag={tag} setTag={setTag}
          excludeTags={excludeTags} setExcludeTags={setExcludeTags}
          buffer={buffer} setBuffer={setBuffer}
          pid={pid} setPid={setPid}
          level={level} setLevel={setLevel}
          startTime={startTime} setStartTime={setStartTime}
          endTime={endTime} setEndTime={setEndTime}
          onSaveTag={saveCurrentTag}
        />

        {/* Quick bar: Saved tags only (no pagination buttons) */}
        {source === 'logcat' && savedTags.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-1 border-b border-border/40 shrink-0 flex-wrap">
            {savedTags.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className="group flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-warm/10 border border-warm/20 text-warm hover:bg-warm/20 transition-colors">
                {t}<span onClick={(e) => { e.stopPropagation(); removeSavedTag(t); }} className="text-warm/40 hover:text-red-400 ml-0.5 transition-colors">&times;</span>
              </button>
            ))}
          </div>
        )}

        {/* Status bar */}
        <SearchStatusBar
          source={source}
          loading={loading}
          allEntries={allEntries}
          filteredCount={filteredEntries.length}
          matchCount={matchList.length}
          hasKeyword={!!q.trim()}
          method={method}
          onExport={handleExport}
        />

        {/* Results area */}
        <div ref={containerRef} className="flex-1 min-h-0 flex flex-col relative">
          {error && (
            <p className="text-red-400 text-sm px-4 pt-2">{error}</p>
          )}

          {/* Loading overlay with animation */}
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface/80">
              <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
              <p className="text-gray-400 text-sm">Loading all entries...</p>
              <p className="text-gray-600 text-xs mt-1">Large datasets may take a few seconds</p>
            </div>
          )}

          {!loading && allEntries.length > 0 && filteredEntries.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-500 text-sm">
                No entries match the current filters.
              </p>
            </div>
          )}

          {/* Column headers + List always rendered to prevent layout shift */}
          {source === 'logcat' ? (
            <div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b-2 border-border/80 bg-surface-card/40 shrink-0 px-4 py-0.5 leading-5">
              <span className="px-2 w-[150px] shrink-0">Timestamp</span>
              <span className="px-1 w-[75px] shrink-0">PID/TID</span>
              <span className="px-1 w-[200px] shrink-0">Level/Tag</span>
              <span className="px-2 flex-1">Message</span>
            </div>
          ) : (
            <div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b-2 border-border/80 bg-surface-card/40 shrink-0 px-4 py-0.5 leading-5">
              <span className="px-2 w-[150px] shrink-0">Timestamp</span>
              <span className="px-1 w-[70px] shrink-0">Level</span>
              <span className="px-2 flex-1">Message</span>
            </div>
          )}

          {/* Virtual scroll list */}
          <div ref={listWrapRef} className="flex-1 min-h-0">
            <List
              listRef={listRef}
              rowCount={filteredEntries.length}
              rowHeight={ROW_HEIGHT}
              rowComponent={RowComponent}
              rowProps={rowProps}
              overscanCount={20}
              className="px-4"
              style={{ height: listHeight }}
            />
          </div>

          {/* Keyboard hint */}
          {!loading && allEntries.length > 0 && (
            <div className="absolute bottom-2 right-4 text-[10px] text-gray-600 pointer-events-none">
              &larr; &rarr; page scroll
            </div>
          )}

          {/* Detail panel — always in DOM, toggled via hidden class (no React re-render) */}
          <div ref={detailPanelRef} style={{ display: 'none', height: DETAIL_HEIGHT }} className="border-t-2 border-accent/50 bg-surface-card/60 flex flex-col shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 shrink-0">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Detail</span>
              <div ref={detailMetaRef} className="text-[10px] text-gray-500 font-mono" />
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => { if (detailEntryRef.current) navigator.clipboard.writeText(detailEntryRef.current.message); }}
                  className="text-accent hover:text-accent-light text-[10px] border border-accent/30 px-2.5 py-1 rounded hover:bg-accent/10 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    detailEntryRef.current = null;
                    if (detailPanelRef.current) detailPanelRef.current.style.display = 'none';
                    const listEl = listWrapRef.current?.querySelector('[style*="height"]') as HTMLElement | null;
                    if (listEl && originalListHeight.current) listEl.style.height = `${originalListHeight.current}px`;
                  }}
                  className="text-gray-500 hover:text-gray-300 text-lg leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
                >
                  &times;
                </button>
              </div>
            </div>
            <pre ref={detailContentRef} className="flex-1 overflow-y-auto px-4 py-3 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed text-gray-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
