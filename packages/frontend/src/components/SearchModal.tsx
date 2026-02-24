import { useState, useRef, useEffect, useCallback } from 'react';
import { searchLogcat, LogcatSearchResult, searchKernel, KernelSearchResult } from '../lib/api';
import { entriesToCSV, entriesToLogcatText, kernelEntriesToCSV, kernelEntriesToDmesgText, downloadBlob } from '../lib/export-utils';

interface Props {
  uploadId: string;
  onClose: () => void;
  initialTag?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialSource?: SearchSource;
}

type SearchSource = 'logcat' | 'kernel';

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

export default function SearchModal({ uploadId, onClose, initialTag, initialStartTime, initialEndTime, initialSource }: Props) {
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
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(0);

  const [logcatResult, setLogcatResult] = useState<LogcatSearchResult | null>(null);
  const [kernelResult, setKernelResult] = useState<KernelSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lastSearchRef = useRef<{
    source: SearchSource;
    q?: string;
    tag?: string;
    level?: string;
    pid?: number;
    buffer?: string;
    startTime?: string;
    endTime?: string;
    limit: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const initialSearchDone = useRef(false);

  useEffect(() => {
    if (initialTag && !initialSearchDone.current) {
      initialSearchDone.current = true;
      // Auto-trigger search with the pre-filled tag
      const params = {
        source: 'logcat' as SearchSource,
        tag: initialTag,
        level: 'E' as string | undefined,
        limit,
      };
      lastSearchRef.current = params;
      setLoading(true);
      searchLogcat(uploadId, {
        tag: initialTag,
        level: 'E',
        limit,
        offset: 0,
      }).then((res) => {
        setLogcatResult(res);
        setLoading(false);
      }).catch((err) => {
        setError(err instanceof Error ? err.message : 'Search failed');
        setLoading(false);
      });
    } else if (initialStartTime && !initialSearchDone.current) {
      initialSearchDone.current = true;
      // Auto-trigger search with time range (use initialSource to pick logcat vs kernel)
      const effectiveSource = initialSource ?? 'logcat';
      const params = {
        source: effectiveSource,
        startTime: initialStartTime,
        endTime: initialEndTime,
        limit,
      };
      lastSearchRef.current = params;
      setLoading(true);
      if (effectiveSource === 'kernel') {
        searchKernel(uploadId, {
          startTime: initialStartTime,
          endTime: initialEndTime,
          limit,
          offset: 0,
        }).then((res) => {
          setKernelResult(res);
          setLoading(false);
        }).catch((err) => {
          setError(err instanceof Error ? err.message : 'Search failed');
          setLoading(false);
        });
      } else {
        searchLogcat(uploadId, {
          startTime: initialStartTime,
          endTime: initialEndTime,
          limit,
          offset: 0,
        }).then((res) => {
          setLogcatResult(res);
          setLoading(false);
        }).catch((err) => {
          setError(err instanceof Error ? err.message : 'Search failed');
          setLoading(false);
        });
      }
    } else {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Reset state when switching tabs
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
    setPage(0);
    setLogcatResult(null);
    setKernelResult(null);
    setError('');
    lastSearchRef.current = null;
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const doSearchWithOffset = useCallback(async (offset: number) => {
    const params = lastSearchRef.current;
    if (!params) return;

    setLoading(true);
    setError('');
    try {
      if (params.source === 'kernel') {
        const res = await searchKernel(uploadId, {
          q: params.q,
          level: params.level,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
          offset,
        });
        setKernelResult(res);
      } else {
        const res = await searchLogcat(uploadId, {
          q: params.q,
          tag: params.tag,
          level: params.level,
          pid: params.pid,
          buffer: params.buffer,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
          offset,
        });
        setLogcatResult(res);
      }
      resultsRef.current?.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setLogcatResult(null);
      setKernelResult(null);
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  const doSearch = async () => {
    // Allow empty search to browse all entries

    const params = {
      source,
      q: q.trim() || undefined,
      tag: source === 'logcat' ? (tag.trim() || undefined) : undefined,
      level: level || undefined,
      pid: source === 'logcat' && pid ? Number(pid) : undefined,
      buffer: source === 'logcat' && buffer ? buffer : undefined,
      startTime: startTime.trim() || undefined,
      endTime: endTime.trim() || undefined,
      limit,
    };
    lastSearchRef.current = params;
    setPage(0);

    setLoading(true);
    setError('');
    try {
      if (source === 'kernel') {
        const res = await searchKernel(uploadId, {
          q: params.q,
          level: params.level,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
          offset: 0,
        });
        setKernelResult(res);
        setLogcatResult(null);
      } else {
        const res = await searchLogcat(uploadId, {
          q: params.q,
          tag: params.tag,
          level: params.level,
          pid: params.pid,
          buffer: params.buffer,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
          offset: 0,
        });
        setLogcatResult(res);
        setKernelResult(null);
      }
      resultsRef.current?.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setLogcatResult(null);
      setKernelResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  const result = source === 'kernel' ? kernelResult : logcatResult;
  const totalPages = result ? Math.ceil(result.totalMatches / limit) : 0;

  const handleExport = (format: 'csv' | 'text') => {
    if (!result || result.entries.length === 0) return;
    const keyword = q.trim() || (source === 'logcat' ? tag.trim() : '') || 'search';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = source === 'kernel' ? 'kernel-search' : 'logcat-search';

    if (source === 'kernel' && kernelResult) {
      if (format === 'csv') {
        const content = kernelEntriesToCSV(kernelResult.entries);
        downloadBlob(content, `${prefix}-${keyword}-${ts}.csv`, 'text/csv;charset=utf-8');
      } else {
        const content = kernelEntriesToDmesgText(kernelResult.entries);
        downloadBlob(content, `${prefix}-${keyword}-${ts}.txt`, 'text/plain;charset=utf-8');
      }
    } else if (logcatResult) {
      if (format === 'csv') {
        const content = entriesToCSV(logcatResult.entries);
        downloadBlob(content, `${prefix}-${keyword}-${ts}.csv`, 'text/csv;charset=utf-8');
      } else {
        const content = entriesToLogcatText(logcatResult.entries);
        downloadBlob(content, `${prefix}-${keyword}-${ts}.txt`, 'text/plain;charset=utf-8');
      }
    }
    setShowExportMenu(false);
  };

  const goToPage = (newPage: number) => {
    setPage(newPage);
    doSearchWithOffset(newPage * limit);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-[#0d1117] border border-gray-700/60 rounded-xl shadow-2xl flex flex-col max-h-[85vh]"
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
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Search Form */}
        <div className="px-6 pt-4 pb-4 border-b border-gray-700/60 space-y-3 shrink-0">
          {/* Keyword row */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={source === 'kernel' ? 'Search kernel message...' : 'Search keyword...'}
              className="flex-1 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
            />
            <button
              onClick={doSearch}
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Filters row — adaptive based on source */}
          <div className="flex gap-3 flex-wrap items-center">
            {source === 'logcat' && (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Tag</label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    onKeyDown={handleKeyDown}
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
                    onKeyDown={handleKeyDown}
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

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">Per page</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Time range row */}
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="MM-DD HH:mm:ss"
                className="w-40 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="MM-DD HH:mm:ss"
                className="w-40 bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
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

        {/* Results */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto min-h-0">
          {error && (
            <p className="text-red-400 text-sm px-6 pt-4">{error}</p>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!loading && !error && !result && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-sm">
                {source === 'kernel'
                  ? 'Click Search to browse all kernel messages, or enter a keyword to filter.'
                  : 'Click Search to browse all logcat entries, or enter a keyword to filter.'}
              </p>
              <p className="text-gray-600 text-xs mt-1">Supports FTS5 full-text search with BM25 ranking.</p>
            </div>
          )}

          {!loading && result && (
            <>
              {/* Status bar */}
              <div className="flex items-center gap-3 px-6 py-2.5 text-xs text-gray-400 bg-[#161b22] border-b border-gray-700/40 sticky top-0">
                <span className="font-medium text-gray-300">{result.totalMatches.toLocaleString()}</span>
                <span>matched</span>
                <span className="text-gray-600">|</span>
                <span>
                  {result.totalMatches > 0 ? `${page * limit + 1}–${Math.min((page + 1) * limit, result.totalMatches)}` : '0'} of {result.totalMatches.toLocaleString()}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                  result.method === 'fts5'
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                }`}>
                  {result.method}
                </span>

                {/* Export dropdown */}
                <div className="relative">
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
                    <div className="absolute top-full left-0 mt-1 bg-[#1c2128] border border-gray-700/60 rounded-lg shadow-xl z-10 py-1 min-w-[140px]">
                      <button
                        onClick={() => handleExport('csv')}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={() => handleExport('text')}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
                      >
                        {source === 'kernel' ? 'Export dmesg Text' : 'Export Text'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Pagination controls in status bar */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page === 0}
                      className="px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-gray-300 px-2">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages - 1}
                      className="px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {result.entries.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-12">
                  No matching entries found.
                </p>
              ) : source === 'kernel' && kernelResult ? (
                /* Kernel results table */
                <div className="px-4 py-2 overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-gray-700/60 text-gray-500 text-[10px] uppercase tracking-wider">
                        <th className="py-1.5 px-2 text-left font-medium">Timestamp</th>
                        <th className="py-1.5 px-1 text-left font-medium">Level</th>
                        <th className="py-1.5 px-2 text-left font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kernelResult.entries.map((entry, i) => (
                        <tr
                          key={i}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${kernelLevelBg(entry.level)}`}
                        >
                          <td className="text-gray-600 py-1 px-2 whitespace-nowrap align-top">
                            [{entry.timestamp}]
                          </td>
                          <td className={`py-1 px-1 whitespace-nowrap align-top font-semibold ${kernelLevelColor(entry.level)}`}>
                            {kernelLevelLabel(entry.level)}
                          </td>
                          <td className={`py-1 px-2 align-top break-all ${kernelLevelColor(entry.level)}`}>
                            {entry.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : logcatResult ? (
                /* Logcat results table */
                <div className="px-4 py-2 overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-gray-700/60 text-gray-500 text-[10px] uppercase tracking-wider">
                        <th className="py-1.5 px-2 text-left font-medium">Timestamp</th>
                        <th className="py-1.5 px-1 text-left font-medium">PID/TID</th>
                        <th className="py-1.5 px-1 text-left font-medium">Level/Tag</th>
                        <th className="py-1.5 px-2 text-left font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logcatResult.entries.map((entry, i) => (
                        <tr
                          key={i}
                          className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${levelBg(entry.level)}`}
                        >
                          <td className="text-gray-600 py-1 px-2 whitespace-nowrap align-top">
                            {entry.timestamp}
                          </td>
                          <td className="text-gray-600 py-1 px-1 whitespace-nowrap align-top">
                            {entry.pid ?? '?'}/{entry.tid ?? '?'}
                          </td>
                          <td className={`py-1 px-1 whitespace-nowrap align-top font-semibold ${levelColor(entry.level)}`}>
                            {entry.level}/{entry.tag}
                          </td>
                          <td className={`py-1 px-2 align-top break-all ${levelColor(entry.level)}`}>
                            {entry.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {/* Bottom pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 px-6 py-3 border-t border-gray-700/40">
                  <button
                    onClick={() => goToPage(0)}
                    disabled={page === 0}
                    className="px-2.5 py-1 text-xs rounded border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors"
                  >
                    First
                  </button>
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 0}
                    className="px-2.5 py-1 text-xs rounded border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-400 px-3">
                    Page <span className="text-gray-200 font-medium">{page + 1}</span> of <span className="text-gray-200 font-medium">{totalPages}</span>
                  </span>
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages - 1}
                    className="px-2.5 py-1 text-xs rounded border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => goToPage(totalPages - 1)}
                    disabled={page >= totalPages - 1}
                    className="px-2.5 py-1 text-xs rounded border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors"
                  >
                    Last
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
