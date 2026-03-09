import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
}

const MAX_ENTRIES = 50_000;
const ROW_HEIGHT = 28;

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

// ── Row Component (shared for logcat + kernel) ──

function RowComponent({ index, style, entries, source, currentMatchIndex, matchIndices, focusIdx }: RowComponentProps<RowExtraProps>) {
  const isCurrentMatch = index === currentMatchIndex;
  const isMatch = matchIndices.has(index);
  const isFocus = index === focusIdx;

  if (source === 'logcat') {
    const entry = (entries as LogcatEntry[])[index];
    if (!entry) return null;

    let rowClass = `flex items-center text-xs font-mono border-b border-gray-800/50 hover:bg-gray-800/30 ${levelBg(entry.level)}`;
    if (isCurrentMatch) {
      rowClass += ' bg-indigo-500/20';
    } else if (isFocus) {
      rowClass += ' border-l-[3px] border-l-indigo-500';
    } else if (isMatch) {
      rowClass += ' border-l-2 border-l-indigo-400/30';
    }

    return (
      <div style={style} className={rowClass}>
        <span className="text-gray-600 py-1 px-2 whitespace-nowrap w-[155px] shrink-0 overflow-hidden">
          {isFocus && <span className="text-indigo-400 font-bold text-[10px]">{'\u25B6 '}</span>}
          {entry.timestamp}
        </span>
        <span className="text-gray-600 py-1 px-1 whitespace-nowrap w-[80px] shrink-0">
          {entry.pid ?? '?'}/{entry.tid ?? '?'}
        </span>
        <span className={`py-1 px-1 whitespace-nowrap w-[140px] shrink-0 font-semibold truncate ${levelColor(entry.level)}`}>
          {entry.level}/{entry.tag}
        </span>
        <span className={`py-1 px-2 flex-1 truncate ${levelColor(entry.level)}`}>
          {entry.message}
        </span>
      </div>
    );
  } else {
    const entry = (entries as KernelEntry[])[index];
    if (!entry) return null;

    let rowClass = `flex items-center text-xs font-mono border-b border-gray-800/50 hover:bg-gray-800/30 ${kernelLevelBg(entry.level)}`;
    if (isCurrentMatch) {
      rowClass += ' bg-indigo-500/20';
    } else if (isFocus) {
      rowClass += ' border-l-[3px] border-l-indigo-500';
    } else if (isMatch) {
      rowClass += ' border-l-2 border-l-indigo-400/30';
    }

    return (
      <div style={style} className={rowClass}>
        <span className="text-gray-600 py-1 px-2 whitespace-nowrap w-[155px] shrink-0 overflow-hidden">
          {isFocus && <span className="text-indigo-400 font-bold text-[10px]">{'\u25B6 '}</span>}
          [{entry.timestamp}]
        </span>
        <span className={`py-1 px-1 whitespace-nowrap w-[70px] shrink-0 font-semibold ${kernelLevelColor(entry.level)}`}>
          {kernelLevelLabel(entry.level)}
        </span>
        <span className={`py-1 px-2 flex-1 truncate ${kernelLevelColor(entry.level)}`}>
          {entry.message}
        </span>
      </div>
    );
  }
}

export default function SearchModal({ uploadId, onClose, initialTag, initialStartTime, initialEndTime, initialSource, initialFocusTime }: Props) {
  const [source, setSource] = useState<SearchSource>(initialSource ?? 'logcat');
  const [q, setQ] = useState('');
  // Logcat-only filters
  const [tag, setTag] = useState(initialTag ?? '');
  const [pid, setPid] = useState('');
  const [buffer, setBuffer] = useState('');
  // Shared filters
  const [level, setLevel] = useState(initialTag ? 'E' : '');
  // Time range filters
  const [startTime, setStartTime] = useState(initialStartTime ?? '');
  const [endTime, setEndTime] = useState(initialEndTime ?? '');

  // Data states
  const [allEntries, setAllEntries] = useState<LogcatEntry[] | KernelEntry[]>([]);
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
  const [containerHeight, setContainerHeight] = useState(500);
  const initialLoadDone = useRef(false);
  const focusIndexRef = useRef<number>(-1);

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
        setAllEntries(res.entries as KernelEntry[]);
        setTotalAvailable(res.totalMatches);
        setMethod(res.method);
        setTruncated(res.totalMatches > MAX_ENTRIES);
      } else {
        const res = await searchLogcat(uploadId, {
          tag: effectiveTag.trim() || undefined,
          startTime: effectiveSt.trim() || undefined,
          endTime: effectiveEt.trim() || undefined,
          limit: MAX_ENTRIES,
          offset: 0,
          export: true,
        });
        setAllEntries(res.entries as LogcatEntry[]);
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

  // ── Client-side Filtering ──
  // keyword (q) is NOT used for filtering — only for Find Next/Prev highlighting
  // level/pid/buffer filter immediately via useMemo

  const filteredEntries = useMemo(() => {
    if (source === 'logcat') {
      let logcat = allEntries as LogcatEntry[];
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
      let kernel = allEntries as KernelEntry[];
      if (level) {
        const levelNum = parseInt(level.replace(/[<>]/g, ''), 10);
        kernel = kernel.filter(e => {
          const n = parseInt(e.level.replace(/[<>]/g, ''), 10);
          return n <= levelNum;
        });
      }
      return kernel;
    }
  }, [allEntries, source, level, pid, buffer]);

  // ── Find Next/Prev ──

  const matchIndices = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return new Set<number>();
    const indices = new Set<number>();
    for (let i = 0; i < filteredEntries.length; i++) {
      const e = filteredEntries[i] as any;
      const msg = (e.message ?? '').toLowerCase();
      const tagStr = (e.tag ?? '').toLowerCase();
      if (msg.includes(kw) || tagStr.includes(kw)) {
        indices.add(i);
      }
    }
    return indices;
  }, [filteredEntries, q]);

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
    if (!initialFocusTime || allEntries.length === 0) return;
    // Find closest entry <= focusTime
    let best = 0;
    for (let i = 0; i < allEntries.length; i++) {
      const ts = (allEntries[i] as any).timestamp ?? '';
      if (ts <= initialFocusTime) best = i;
    }
    focusIndexRef.current = best;
    requestAnimationFrame(() => {
      listRef.current?.scrollToRow({ index: best, align: 'center' });
    });
  }, [allEntries, initialFocusTime, listRef]);

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
    setAllEntries([]);
    setTotalAvailable(0);
    setMethod('');
    setTruncated(false);
    setError('');
    setCurrentMatchPos(0);
    focusIndexRef.current = -1;
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

  const rowProps = useMemo<RowExtraProps>(() => ({
    entries: filteredEntries,
    source,
    currentMatchIndex,
    matchIndices,
    focusIdx: focusIndexRef.current,
  }), [filteredEntries, source, currentMatchIndex, matchIndices]);

  // Effective list height: subtract column header height (~30px)
  const listHeight = Math.max(containerHeight - 30, 200);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors duration-200 ${visible ? 'bg-black/80' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-6xl 2xl:max-w-7xl bg-[#0d1117] border border-gray-700/60 rounded-xl shadow-2xl flex flex-col max-h-[85vh] 2xl:max-h-[90vh] transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Tab */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-100">Search</h2>
            <div className="flex bg-[#161b22] rounded-lg p-0.5 border border-gray-700/60">
              <button
                onClick={() => switchSource('logcat')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  source === 'logcat'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Logcat
              </button>
              <button
                onClick={() => switchSource('kernel')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  source === 'kernel'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Kernel
              </button>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Search Form */}
        <div className="px-6 pt-4 pb-4 border-b border-gray-700/60 space-y-3 shrink-0">
          {/* Find keyword row with nav buttons */}
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
                className="w-full bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-2.5 pr-20 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
              />
              {q.trim() && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                  {matchList.length > 0 ? `${currentMatchPos + 1} / ${matchList.length}` : '0 / 0'}
                </span>
              )}
            </div>
            <button
              onClick={goToPrevMatch}
              disabled={matchList.length === 0}
              title="Previous match (Shift+Enter)"
              className="px-2.5 py-2.5 text-sm rounded-lg border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors bg-[#161b22]"
            >
              {'\u25B2'}
            </button>
            <button
              onClick={goToNextMatch}
              disabled={matchList.length === 0}
              title="Next match (Enter)"
              className="px-2.5 py-2.5 text-sm rounded-lg border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors bg-[#161b22]"
            >
              {'\u25BC'}
            </button>
          </div>

          {/* Filters row */}
          <div className="flex gap-3 flex-wrap items-center">
            {source === 'logcat' && (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Tag</label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="e.g. ActivityManager"
                    className="w-40 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Buffer</label>
                  <select
                    value={buffer}
                    onChange={(e) => setBuffer(e.target.value)}
                    className="bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">All</option>
                    <option value="main">main</option>
                    <option value="system">system</option>
                    <option value="events">events</option>
                    <option value="crash">crash</option>
                    <option value="radio">radio</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Min Level</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">All</option>
                    <option value="V">V+ (Verbose &amp; above)</option>
                    <option value="D">D+ (Debug &amp; above)</option>
                    <option value="I">I+ (Info &amp; above)</option>
                    <option value="W">W+ (Warning &amp; above)</option>
                    <option value="E">E+ (Error &amp; above)</option>
                    <option value="F">F (Fatal only)</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">PID</label>
                  <input
                    type="number"
                    value={pid}
                    onChange={(e) => setPid(e.target.value)}
                    placeholder="—"
                    className="w-20 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </>
            )}

            {source === 'kernel' && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">Min Level</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All</option>
                  <option value="<0>">&lt;0&gt; EMERG only</option>
                  <option value="<1>">&lt;1&gt;+ ALERT &amp; above</option>
                  <option value="<2>">&lt;2&gt;+ CRIT &amp; above</option>
                  <option value="<3>">&lt;3&gt;+ ERR &amp; above</option>
                  <option value="<4>">&lt;4&gt;+ WARN &amp; above</option>
                  <option value="<5>">&lt;5&gt;+ NOTICE &amp; above</option>
                  <option value="<6>">&lt;6&gt;+ INFO &amp; above</option>
                </select>
              </div>
            )}
          </div>

          {/* Time range row */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 w-8">From</label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="MM-DD HH:mm:ss"
                className="w-40 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 w-5">To</label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="MM-DD HH:mm:ss"
                className="w-40 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loading ? 'Loading...' : 'Load Range'}
            </button>
            {(startTime || endTime) && (
              <button
                onClick={() => { setStartTime(''); setEndTime(''); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear time
              </button>
            )}
          </div>
        </div>

        {/* Status bar */}
        {allEntries.length > 0 && !loading && (
          <div className="flex items-center gap-3 px-6 py-2 text-xs text-gray-400 bg-[#161b22] border-b border-gray-700/40 shrink-0">
            <span className="font-medium text-gray-300">{allEntries.length.toLocaleString()}</span>
            <span>loaded</span>
            <span className="text-gray-600">|</span>
            <span className="font-medium text-gray-300">{filteredEntries.length.toLocaleString()}</span>
            <span>shown</span>
            {q.trim() && matchList.length > 0 && (
              <>
                <span className="text-gray-600">|</span>
                <span className="font-medium text-indigo-400">{matchList.length.toLocaleString()}</span>
                <span>matches</span>
              </>
            )}
            {method && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                method === 'fts5'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
              }`}>
                {method}
              </span>
            )}

            {truncated && (
              <span className="text-yellow-400 text-[11px]">
                Showing first 50,000 of {totalAvailable.toLocaleString()} — narrow time range for full data
              </span>
            )}

            {/* Export dropdown */}
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
          </div>
        )}

        {/* Results area */}
        <div ref={containerRef} className="flex-1 min-h-0 flex flex-col">
          {error && (
            <p className="text-red-400 text-sm px-6 pt-4">{error}</p>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!loading && !error && allEntries.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">
                {source === 'kernel'
                  ? 'Loading kernel messages...'
                  : 'Loading logcat entries...'}
              </p>
            </div>
          )}

          {!loading && allEntries.length > 0 && filteredEntries.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-sm">
                No entries match the current filters.
              </p>
            </div>
          )}

          {!loading && filteredEntries.length > 0 && (
            <>
              {/* Column headers */}
              {source === 'logcat' ? (
                <div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b border-gray-700/60 bg-[#0d1117] shrink-0 px-4">
                  <span className="py-1.5 px-2 w-[155px] shrink-0">Timestamp</span>
                  <span className="py-1.5 px-1 w-[80px] shrink-0">PID/TID</span>
                  <span className="py-1.5 px-1 w-[140px] shrink-0">Level/Tag</span>
                  <span className="py-1.5 px-2 flex-1">Message</span>
                </div>
              ) : (
                <div className="flex text-gray-500 text-[10px] uppercase tracking-wider font-medium border-b border-gray-700/60 bg-[#0d1117] shrink-0 px-4">
                  <span className="py-1.5 px-2 w-[155px] shrink-0">Timestamp</span>
                  <span className="py-1.5 px-1 w-[70px] shrink-0">Level</span>
                  <span className="py-1.5 px-2 flex-1">Message</span>
                </div>
              )}

              {/* Virtual scroll list */}
              <div className="flex-1 min-h-0">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
