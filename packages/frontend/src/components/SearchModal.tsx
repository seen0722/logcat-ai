import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { List, useListRef } from 'react-window';
import type { RowComponentProps } from 'react-window';
import { searchLogcat, searchKernel } from '../lib/api';
import { entriesToCSV, entriesToLogcatText, kernelEntriesToCSV, kernelEntriesToDmesgText, downloadBlob } from '../lib/export-utils';

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

type SearchSource = 'logcat' | 'kernel';

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

interface RowExtraProps {
  entries: LogcatEntry[] | KernelEntry[];
  source: SearchSource;
  currentMatchIndex: number;
  matchIndices: Set<number>;
  focusIdx: number;
  expandedIdx: number;
  onExpandToggle: (idx: number) => void;
  highlightPattern: RegExp | null;
}

const MAX_ENTRIES = 50_000;
const ROW_HEIGHT = 22;
const DETAIL_HEIGHT = 100;

// ── Logcat helpers ──

function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'E': return 'text-red-400';
    case 'W': return 'text-yellow-400';
    case 'I': return 'text-green-400';
    case 'D': return 'text-blue-400';
    default: return 'text-gray-400';
  }
}

function levelBg(level: string): string {
  switch (level.toUpperCase()) {
    case 'E': return 'bg-red-950/30';
    case 'W': return 'bg-yellow-950/20';
    default: return '';
  }
}

// ── Kernel helpers ──

function kernelLevelColor(level: string): string {
  const num = parseInt(level.replace(/[<>]/g, ''), 10);
  if (num <= 3) return 'text-red-400';
  if (num === 4) return 'text-yellow-400';
  if (num === 5) return 'text-blue-400';
  if (num === 6) return 'text-green-400';
  return 'text-gray-400';
}

function kernelLevelBg(level: string): string {
  const num = parseInt(level.replace(/[<>]/g, ''), 10);
  if (num <= 3) return 'bg-red-950/30';
  if (num === 4) return 'bg-yellow-950/20';
  return '';
}

function kernelLevelLabel(level: string): string {
  const num = parseInt(level.replace(/[<>]/g, ''), 10);
  const labels: Record<number, string> = {
    0: 'EMERG', 1: 'ALERT', 2: 'CRIT', 3: 'ERR',
    4: 'WARN', 5: 'NOTICE', 6: 'INFO', 7: 'DEBUG',
  };
  return labels[num] ?? level;
}

// ── Inline text highlight helper ──

function HighlightText({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let safety = 0;
  while ((match = re.exec(text)) !== null && safety++ < 200) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<mark key={match.index} className="bg-accent/40 text-inherit rounded-sm px-[1px]">{match[0]}</mark>);
    lastIndex = re.lastIndex;
    if (match[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : <>{text}</>;
}

// ── Row Component (shared for logcat + kernel) ──

function RowComponent({ index, style, entries, source, currentMatchIndex, matchIndices, focusIdx, expandedIdx, onExpandToggle, highlightPattern }: RowComponentProps<RowExtraProps>) {
  const isCurrentMatch = index === currentMatchIndex;
  const isMatch = matchIndices.has(index);
  const isFocus = index === focusIdx;
  const isExpanded = index === expandedIdx;

  if (source === 'logcat') {
    const entry = (entries as LogcatEntry[])[index];
    if (!entry) return null;

    let rowClass = `flex items-center text-[11px] leading-[22px] font-mono border-b border-gray-800/30 cursor-pointer hover:bg-gray-800/30 ${levelBg(entry.level)}`;
    if (isExpanded) {
      rowClass += ' bg-accent/15 border-l-[3px] border-l-accent';
    } else if (isCurrentMatch) {
      rowClass += ' bg-accent/20';
    } else if (isFocus) {
      rowClass += ' border-l-[3px] border-l-accent';
    } else if (isMatch) {
      rowClass += ' border-l-2 border-l-accent/30';
    }

    return (
      <div style={style}>
        <div className={rowClass} onClick={() => onExpandToggle(index)}>
          <span className="text-gray-600 px-2 whitespace-nowrap w-[150px] shrink-0 overflow-hidden">
            {isFocus && <span className="text-accent font-bold text-[9px]">{'\u25B6 '}</span>}
            {entry.timestamp}
          </span>
          <span className="text-gray-600 px-1 whitespace-nowrap w-[75px] shrink-0">
            {entry.pid ?? '?'}/{entry.tid ?? '?'}
          </span>
          <span className={`px-1 whitespace-nowrap w-[130px] shrink-0 font-semibold truncate ${levelColor(entry.level)}`}>
            {entry.level}/{entry.tag}
          </span>
          <span className={`px-2 flex-1 truncate ${levelColor(entry.level)}`}>
{entry.message}
          </span>
        </div>
      </div>
    );
  } else {
    const entry = (entries as KernelEntry[])[index];
    if (!entry) return null;

    let rowClass = `flex items-center text-[11px] leading-[22px] font-mono border-b border-gray-800/30 cursor-pointer hover:bg-gray-800/30 ${kernelLevelBg(entry.level)}`;
    if (isExpanded) {
      rowClass += ' bg-accent/15 border-l-[3px] border-l-accent';
    } else if (isCurrentMatch) {
      rowClass += ' bg-accent/20';
    } else if (isFocus) {
      rowClass += ' border-l-[3px] border-l-accent';
    } else if (isMatch) {
      rowClass += ' border-l-2 border-l-accent/30';
    }

    return (
      <div style={style}>
        <div className={rowClass} onClick={() => onExpandToggle(index)}>
          <span className="text-gray-600 px-2 whitespace-nowrap w-[150px] shrink-0 overflow-hidden">
            {isFocus && <span className="text-accent font-bold text-[9px]">{'\u25B6 '}</span>}
            [{entry.timestamp}]
          </span>
          <span className={`px-1 whitespace-nowrap w-[70px] shrink-0 font-semibold ${kernelLevelColor(entry.level)}`}>
            {kernelLevelLabel(entry.level)}
          </span>
          <span className={`px-2 flex-1 truncate ${kernelLevelColor(entry.level)}`}>
{entry.message}
          </span>
        </div>
      </div>
    );
  }
}

export default function SearchModal({ uploadId, onClose, initialTag, initialStartTime, initialEndTime, initialSource, initialFocusTime }: Props) {
  const [source, setSource] = useState<SearchSource>(initialSource ?? 'logcat');
  const [q, setQ] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  // Detail panel: use refs + direct DOM manipulation to avoid re-rendering 50K rows
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
  // Time range filters
  const [startTime, setStartTime] = useState(initialStartTime ?? '');
  const [endTime, setEndTime] = useState(initialEndTime ?? '');

  // Data states — allEntries in ref to avoid React managing 411K objects
  const allEntriesRef = useRef<LogcatEntry[] | KernelEntry[]>([]);
  const filteredRef = useRef<LogcatEntry[] | KernelEntry[]>([]);
  const [rowCount, setRowCount] = useState(0); // only this triggers react-window update
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [method, setMethod] = useState<string>('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Find navigation
  const [currentMatchPos, setCurrentMatchPos] = useState(0);

  // UI states
  const [visible, setVisible] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(() => Math.round(window.innerHeight * 0.85));
  const initialLoadDone = useRef(false);
  const [focusIndex, setFocusIndex] = useState(-1);

  // ── Data Loading ──

  const loadData = useCallback(async (opts?: { src?: SearchSource; tagOverride?: string; st?: string; et?: string }) => {
    const effectiveSource = opts?.src ?? source;
    const effectiveTag = opts?.tagOverride ?? tag;
    const effectiveSt = opts?.st ?? startTime;
    const effectiveEt = opts?.et ?? endTime;

    setLoading(true);
    setError('');
    try {
      if (effectiveSource === 'kernel') {
        const res = await searchKernel(uploadId, {
          startTime: effectiveSt.trim() || undefined,
          endTime: effectiveEt.trim() || undefined,
          limit: MAX_ENTRIES,
          offset: 0,
          export: true,
        });
        allEntriesRef.current = res.entries as KernelEntry[]; refilter();
        setTotalAvailable(res.totalMatches);
        setMethod(res.method);
        setTruncated(res.totalMatches > MAX_ENTRIES);
      } else {
        const res = await searchLogcat(uploadId, {
          // Tag filtering is always client-side to avoid reload on change
          startTime: effectiveSt.trim() || undefined,
          endTime: effectiveEt.trim() || undefined,
          limit: MAX_ENTRIES,
          offset: 0,
          export: true,
          compact: true,
        });
        allEntriesRef.current = res.entries as LogcatEntry[]; refilter();
        setTotalAvailable(res.totalMatches);
        setMethod(res.method);
        setTruncated(res.totalMatches > MAX_ENTRIES);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [uploadId, source, startTime, endTime]);

  // ── Client-side Filtering ──
  // keyword (q) is NOT used for filtering — only for Find Next/Prev highlighting
  // level/pid/buffer filter immediately via useMemo

  // Refilter: runs filter logic, writes to filteredRef, updates rowCount state
  const refilter = useCallback(() => {
    const allEntries = allEntriesRef.current;
    if (source === 'logcat') {
      const entries = allEntries as LogcatEntry[];
      const levelMap: Record<string, number> = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5 };
      const minLevelIdx = level ? (levelMap[level] ?? -1) : -1;
      const pidNum = pid ? Number(pid) : NaN;
      const includeSet = tag.trim()
        ? new Set(tag.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
        : null;
      const excludeSet = excludeTags.trim()
        ? new Set(excludeTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
        : null;
      const hasAnyFilter = minLevelIdx >= 0 || !isNaN(pidNum) || !!buffer || includeSet || excludeSet;

      if (!hasAnyFilter) {
        filteredRef.current = entries;
      } else {
        const result: LogcatEntry[] = [];
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (minLevelIdx >= 0 && (levelMap[e.level] ?? 0) < minLevelIdx) continue;
          if (!isNaN(pidNum) && e.pid !== pidNum) continue;
          if (buffer && e.buffer !== buffer) continue;
          if (includeSet) { const t = (e.tag ?? '').toLowerCase(); if (!includeSet.has(t)) continue; }
          if (excludeSet) { const t = (e.tag ?? '').toLowerCase(); if (excludeSet.has(t)) continue; }
          result.push(e);
        }
        filteredRef.current = result;
      }
    } else {
      let kernel = allEntries as KernelEntry[];
      if (level) {
        const levelNum = parseInt(level.replace(/[<>]/g, ''), 10);
        kernel = kernel.filter(e => {
          const n = parseInt(e.level.replace(/[<>]/g, ''), 10);
          return n <= levelNum;
        });
      }
      filteredRef.current = kernel;
    }
    setRowCount(filteredRef.current.length);
  }, [source, level, pid, buffer, tag, excludeTags]);

  // Trigger refilter when filter deps change
  useEffect(() => { refilter(); }, [refilter]);

  // Convenience alias
  const filteredEntries = filteredRef.current;

  // ── Find Next/Prev ──

  // Build search pattern (regex or plain includes)
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
      const e = filteredEntries[i] as any;
      const msg = e.message ?? '';
      const tagStr = e.tag ?? '';
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

  // ── FocusTime ──

  useEffect(() => {
    const entries = allEntriesRef.current;
    if (!initialFocusTime || entries.length === 0) return;
    let best = 0;
    for (let i = 0; i < entries.length; i++) {
      const ts = (entries[i] as any).timestamp ?? '';
      if (ts <= initialFocusTime) best = i;
    }
    setFocusIndex(best);
    requestAnimationFrame(() => {
      listRef.current?.scrollToRow({ index: best, align: 'center' });
    });
  }, [rowCount, initialFocusTime, listRef]);

  // ── Initial Load ──

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    if (initialTag || initialStartTime) {
      loadData({
        src: initialSource ?? 'logcat',
        tagOverride: initialTag,
        st: initialStartTime,
        et: initialEndTime,
      });
    } else {
      loadData();
    }
  }, []);

  // ── Container height measurement ──
  // Sync measure before first paint, then ResizeObserver for window resize
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

  // Keyboard shortcuts: Escape to close, Ctrl+F to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

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
    allEntriesRef.current = []; filteredRef.current = []; setRowCount(0);
    setTotalAvailable(0);
    setMethod('');
    setTruncated(false);
    setError('');
    setCurrentMatchPos(0);
    setFocusIndex(-1);
    setTimeout(() => {
      inputRef.current?.focus();
      loadData({ src: newSource, tagOverride: '', st: '', et: '' });
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
    setShowExportMenu(false);
  };

  // ── Row props (passed to RowComponent via react-window rowProps) ──


  const filteredEntriesRef = useRef(filteredEntries);
  filteredEntriesRef.current = filteredEntries;
  // Pure DOM manipulation — zero React re-renders
  const handleExpandToggleStable = useCallback((_idx: number) => {
    const entry = filteredEntriesRef.current[_idx] as any;
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
    // Update meta
    const ts = entry.timestamp ?? '';
    const pid = entry.pid != null ? `PID ${entry.pid}/${entry.tid}` : '';
    const tag = entry.tag ? `${entry.level}/${entry.tag}` : (entry.level ?? '');
    const buf = entry.buffer ? `buffer:${entry.buffer}` : '';
    detailMetaRef.current.textContent = [ts, pid, tag, buf].filter(Boolean).join('  ');
    // Update content
    detailContentRef.current.textContent = entry.message;
    // Show panel and shrink list from original height
    detailPanelRef.current.style.display = 'flex';
    if (listEl && originalListHeight.current) {
      listEl.style.height = `${Math.max(originalListHeight.current - DETAIL_HEIGHT, 150)}px`;
    }
  }, []);

  const rowProps = useMemo<RowExtraProps>(() => ({
    entries: filteredEntries,
    source,
    currentMatchIndex,
    matchIndices,
    focusIdx: focusIndex,
    expandedIdx: -1, // not used for row styling
    onExpandToggle: handleExpandToggleStable,
    highlightPattern: null,
  }), [filteredEntries, source, currentMatchIndex, matchIndices, focusIndex, handleExpandToggleStable]);

  // Effective list height: subtract column header height (~20px)
  const listHeight = Math.max(containerHeight - 20, 200);

  const allEntries = allEntriesRef.current;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-2 transition-colors duration-200 ${visible ? 'bg-black/80' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-6xl 2xl:max-w-7xl bg-[#0d1117] border border-gray-700/60 rounded-xl shadow-2xl flex flex-col max-h-[95vh] transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: tab switcher + find input + nav — all in one row */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700/60 shrink-0">
          <div className="flex bg-[#161b22] rounded-md p-0.5 border border-gray-700/60 shrink-0">
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
              className="w-full bg-[#161b22] border border-gray-700/60 rounded-md px-3 py-1.5 pr-20 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            {q.trim() && (
              <span className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                {matchList.length > 0 ? `${currentMatchPos + 1} / ${matchList.length}` : '0 / 0'}
              </span>
            )}
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                useRegex ? 'bg-accent/30 text-accent font-bold' : 'text-gray-500 hover:text-gray-300'
              }`}
              title={useRegex ? 'Regex enabled' : 'Enable regex'}
            >
              .*
            </button>
          </div>
          <button
            onClick={goToPrevMatch}
            disabled={matchList.length === 0}
            title="Previous match (Shift+Enter)"
            className="px-2 py-1.5 text-xs rounded-md border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors bg-[#161b22]"
          >
            {'\u25B2'}
          </button>
          <button
            onClick={goToNextMatch}
            disabled={matchList.length === 0}
            title="Next match (Enter)"
            className="px-2 py-1.5 text-xs rounded-md border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors bg-[#161b22]"
          >
            {'\u25BC'}
          </button>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors shrink-0"
          >
            &times;
          </button>
        </div>

        {/* Filters + Time range — single compact row */}
        <div className="flex gap-2.5 items-center px-4 py-1.5 border-b border-gray-700/60 shrink-0 flex-wrap">
          {source === 'logcat' && (
            <>
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-gray-500">Tag</label>
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="e.g. RIL,RILJ"
                  className="w-36 bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
                />
                {tag.trim() && (
                  <button
                    onClick={saveCurrentTag}
                    className="text-gray-500 hover:text-accent text-xs px-1 transition-colors"
                    title="Save tag preset"
                  >+</button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-gray-500">Exclude</label>
                <input
                  type="text"
                  value={excludeTags}
                  onChange={(e) => setExcludeTags(e.target.value)}
                  placeholder="tag1,tag2"
                  title="Comma-separated tags to hide"
                  className="w-28 bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-gray-500">Buffer</label>
                <select
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  className="bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-accent"
                >
                  <option value="">All</option>
                  <option value="main">main</option>
                  <option value="system">system</option>
                  <option value="events">events</option>
                  <option value="crash">crash</option>
                  <option value="radio">radio</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-gray-500">Min Level</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-accent"
                >
                  <option value="">All</option>
                  <option value="V">V+</option>
                  <option value="D">D+</option>
                  <option value="I">I+</option>
                  <option value="W">W+</option>
                  <option value="E">E+</option>
                  <option value="F">F</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[11px] text-gray-500">PID</label>
                <input
                  type="number"
                  value={pid}
                  onChange={(e) => setPid(e.target.value)}
                  placeholder="—"
                  className="w-16 bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          {source === 'kernel' && (
            <div className="flex items-center gap-1">
              <label className="text-[11px] text-gray-500">Min Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-accent"
              >
                <option value="">All</option>
                <option value="<0>">&lt;0&gt; EMERG</option>
                <option value="<1>">&lt;1&gt;+ ALERT</option>
                <option value="<2>">&lt;2&gt;+ CRIT</option>
                <option value="<3>">&lt;3&gt;+ ERR</option>
                <option value="<4>">&lt;4&gt;+ WARN</option>
                <option value="<5>">&lt;5&gt;+ NOTICE</option>
                <option value="<6>">&lt;6&gt;+ INFO</option>
              </select>
            </div>
          )}

          <div className="w-px h-5 bg-gray-700/50" />

          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-500">From</label>
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="MM-DD HH:mm:ss"
              className="w-32 bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent font-mono"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-500">To</label>
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="MM-DD HH:mm:ss"
              className="w-32 bg-[#161b22] border border-gray-700/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent font-mono"
            />
          </div>
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="px-3 py-1 text-[11px] font-medium bg-accent hover:bg-accent disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {loading ? 'Loading...' : 'Load Range'}
          </button>
          {(startTime || endTime) && (
            <button
              onClick={() => { setStartTime(''); setEndTime(''); }}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          )}
          {/* Quick time navigation */}
          <span className="text-gray-700 mx-0.5">|</span>
          {allEntries.length > 0 && (
            <button
              onClick={() => {
                const first = (allEntries[0] as any).timestamp as string;
                if (!first) return;
                // Parse MM-DD HH:mm:ss.SSS and go 5 minutes earlier
                const m = first.match(/^(\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
                if (!m) return;
                const [, md, hh, mm] = m;
                let min = parseInt(mm) - 5;
                let hr = parseInt(hh);
                if (min < 0) { min += 60; hr -= 1; }
                const ts = `${md} ${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
                setEndTime(first.slice(0, 18));
                setStartTime(ts);
                loadData({ st: ts, et: first.slice(0, 18) });
              }}
              disabled={loading}
              className="text-[11px] text-accent hover:text-accent-light disabled:opacity-50 transition-colors"
            >
              ← Earlier
            </button>
          )}
          {allEntries.length > 0 && (
            <button
              onClick={() => {
                const last = (allEntries[allEntries.length - 1] as any).timestamp as string;
                if (!last) return;
                setStartTime(last.slice(0, 18));
                setEndTime('');
                loadData({ st: last.slice(0, 18), et: '' });
              }}
              disabled={loading}
              className="text-[11px] text-accent hover:text-accent-light disabled:opacity-50 transition-colors"
            >
              Later →
            </button>
          )}
        </div>

        {/* Saved tag presets */}
        {source === 'logcat' && savedTags.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-1 border-b border-gray-700/40 shrink-0 flex-wrap">
            <span className="text-[10px] text-gray-600">Saved:</span>
            {savedTags.map(t => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className="group flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-surface-hover border border-border/50 text-gray-300 hover:border-accent/40 hover:text-accent transition-colors"
              >
                {t}
                <span
                  onClick={(e) => { e.stopPropagation(); removeSavedTag(t); }}
                  className="text-gray-600 hover:text-red-400 ml-0.5 transition-colors"
                >×</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick time presets */}
        {allEntries.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-1 border-b border-gray-700/40 shrink-0">
            <span className="text-[10px] text-gray-600">Jump:</span>
            {[
              { label: 'All', st: '', et: '' },
              { label: 'First 5min', st: (allEntries[0] as any).timestamp?.slice(0, 18) ?? '', et: (() => { const f = (allEntries[0] as any).timestamp; if (!f) return ''; const m = f.match(/^(\d{2}-\d{2})\s+(\d{2}):(\d{2})/); if (!m) return ''; let min = parseInt(m[3]) + 5; let hr = parseInt(m[2]); if (min >= 60) { min -= 60; hr += 1; } return `${m[1]} ${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`; })() },
              { label: 'Last 5min', st: (() => { const l = (allEntries[allEntries.length - 1] as any).timestamp; if (!l) return ''; const m = l.match(/^(\d{2}-\d{2})\s+(\d{2}):(\d{2})/); if (!m) return ''; let min = parseInt(m[3]) - 5; let hr = parseInt(m[2]); if (min < 0) { min += 60; hr -= 1; } return `${m[1]} ${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`; })(), et: '' },
            ].map(p => (
              <button
                key={p.label}
                onClick={() => { setStartTime(p.st); setEndTime(p.et); if (p.st || p.et) loadData({ st: p.st, et: p.et }); else loadData({ st: '', et: '' }); }}
                disabled={loading}
                className="text-[10px] px-2 py-0.5 rounded bg-surface-hover border border-border/50 text-gray-400 hover:text-accent hover:border-accent/40 disabled:opacity-50 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Status bar — always rendered to prevent layout shift */}
        <div className="flex items-center gap-2 px-4 py-1 text-[11px] text-gray-400 bg-[#161b22] border-b border-gray-700/40 shrink-0">
          {loading ? (
            <span className="text-gray-500">Loading...</span>
          ) : allEntries.length > 0 ? (
            <>
              <span className="font-medium text-gray-300">{allEntries.length.toLocaleString()}</span>
              <span>loaded</span>
              <span className="text-gray-600">|</span>
              <span className="font-medium text-gray-300">{filteredEntries.length.toLocaleString()}</span>
              <span>shown</span>
              {q.trim() && matchList.length > 0 && (
                <>
                  <span className="text-gray-600">|</span>
                  <span className="font-medium text-accent">{matchList.length.toLocaleString()}</span>
                  <span>matches</span>
                </>
              )}
              {method && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                  method === 'fts5'
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                }`}>
                  {method}
                </span>
              )}
              {truncated && (
                <span className="text-yellow-400 text-[11px]">
                  Showing first 50,000 of {totalAvailable.toLocaleString()} — narrow time range for full data
                  {allEntries.length > 0 && (
                    <span className="text-gray-500 ml-1">
                      (loaded: {(allEntries[0] as any).timestamp?.slice(0, 14)} ~ {(allEntries[allEntries.length - 1] as any).timestamp?.slice(0, 14)})
                    </span>
                  )}
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-500">&nbsp;</span>
          )}

          {/* Export dropdown */}
          {allEntries.length > 0 && !loading && (
            <div className="relative ml-auto">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
              {showExportMenu && (
                <div className="absolute top-full right-0 mt-1 bg-[#1c2128] border border-gray-700/60 rounded-lg shadow-xl z-20 py-1 min-w-[180px]">
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
                  >
                    Export CSV ({filteredEntries.length.toLocaleString()} rows)
                  </button>
                  <button
                    onClick={() => handleExport('text')}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
                  >
                    {source === 'kernel' ? 'Export dmesg Text' : 'Export Text'} ({filteredEntries.length.toLocaleString()} rows)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results area */}
        <div ref={containerRef} className="flex-1 min-h-0 flex flex-col relative">
          {error && (
            <p className="text-red-400 text-sm px-4 pt-2">{error}</p>
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
            <div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b border-gray-700/60 bg-[#0d1117] shrink-0 px-4 leading-5">
              <span className="px-2 w-[150px] shrink-0">Timestamp</span>
              <span className="px-1 w-[75px] shrink-0">PID/TID</span>
              <span className="px-1 w-[130px] shrink-0">Level/Tag</span>
              <span className="px-2 flex-1">Message</span>
            </div>
          ) : (
            <div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b border-gray-700/60 bg-[#0d1117] shrink-0 px-4 leading-5">
              <span className="px-2 w-[150px] shrink-0">Timestamp</span>
              <span className="px-1 w-[70px] shrink-0">Level</span>
              <span className="px-2 flex-1">Message</span>
            </div>
          )}

          {/* Virtual scroll list */}
          <div ref={listWrapRef} className="flex-1 min-h-0">
            <List
              listRef={listRef}
              rowCount={rowCount}
              rowHeight={ROW_HEIGHT}
              rowComponent={RowComponent}
              rowProps={rowProps}
              overscanCount={20}
              className="px-4"
              style={{ height: listHeight }}
            />
          </div>

          {/* Detail panel — always in DOM, toggled via hidden class (no React re-render) */}
          <div ref={detailPanelRef} style={{ display: 'none', height: DETAIL_HEIGHT }} className="border-t-2 border-accent/40 bg-[#080c18] flex flex-col shrink-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800/60 shrink-0">
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
