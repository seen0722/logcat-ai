import { useState, useRef, useEffect, useCallback } from 'react';
import { searchLogcat, LogcatSearchResult } from '../lib/api';

interface Props {
  uploadId: string;
  onClose: () => void;
}

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

export default function SearchModal({ uploadId, onClose }: Props) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [level, setLevel] = useState('');
  const [pid, setPid] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(0);

  const [result, setResult] = useState<LogcatSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Track last search params for pagination
  const lastSearchRef = useRef<{ q?: string; tag?: string; level?: string; pid?: number; limit: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const doSearchWithOffset = useCallback(async (offset: number) => {
    const params = lastSearchRef.current;
    if (!params) return;

    setLoading(true);
    setError('');
    try {
      const res = await searchLogcat(uploadId, { ...params, offset });
      setResult(res);
      resultsRef.current?.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  const doSearch = async () => {
    if (!q.trim() && !tag.trim() && !level && !pid.trim()) return;

    const params = {
      q: q.trim() || undefined,
      tag: tag.trim() || undefined,
      level: level || undefined,
      pid: pid ? Number(pid) : undefined,
      limit,
    };
    lastSearchRef.current = params;
    setPage(0);

    setLoading(true);
    setError('');
    try {
      const res = await searchLogcat(uploadId, { ...params, offset: 0 });
      setResult(res);
      resultsRef.current?.scrollTo(0, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  const totalPages = result ? Math.ceil(result.totalMatches / limit) : 0;

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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">Search Logcat</h2>
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
              placeholder="Search keyword..."
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

          {/* Filters row */}
          <div className="flex gap-3 flex-wrap items-center">
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
              <label className="text-xs text-gray-500">Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All</option>
                <option value="V">V - Verbose</option>
                <option value="D">D - Debug</option>
                <option value="I">I - Info</option>
                <option value="W">W - Warning</option>
                <option value="E">E - Error</option>
                <option value="F">F - Fatal</option>
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
              <p className="text-gray-500 text-sm">Enter a keyword or filter to search logcat entries.</p>
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
                  {page * limit + 1}–{Math.min((page + 1) * limit, result.totalMatches)} of {result.totalMatches.toLocaleString()}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                  result.method === 'fts5'
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                }`}>
                  {result.method}
                </span>

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
              ) : (
                <div className="px-4 py-2 overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <tbody>
                      {result.entries.map((entry, i) => (
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
              )}

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
