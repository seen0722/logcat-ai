import { useState, useRef, useEffect } from 'react';
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

export default function SearchModal({ uploadId, onClose }: Props) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [level, setLevel] = useState('');
  const [pid, setPid] = useState('');
  const [limit, setLimit] = useState(50);

  const [result, setResult] = useState<LogcatSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

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

  const doSearch = async () => {
    if (!q.trim() && !tag.trim() && !level && !pid.trim()) return;

    setLoading(true);
    setError('');
    try {
      const res = await searchLogcat(uploadId, {
        q: q.trim() || undefined,
        tag: tag.trim() || undefined,
        level: level || undefined,
        pid: pid ? Number(pid) : undefined,
        limit,
      });
      setResult(res);
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

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-background border border-border rounded-xl shadow-2xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">Search Logcat</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Search Form */}
        <div className="px-6 pt-4 pb-3 border-b border-border space-y-3 shrink-0">
          {/* Keyword row */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search keyword..."
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={doSearch}
              disabled={loading}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Filters row */}
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tag"
              className="w-32 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Levels</option>
              <option value="V">V - Verbose</option>
              <option value="D">D - Debug</option>
              <option value="I">I - Info</option>
              <option value="W">W - Warning</option>
              <option value="E">E - Error</option>
              <option value="F">F - Fatal</option>
            </select>
            <input
              type="number"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="PID"
              className="w-24 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            >
              <option value={20}>20 results</option>
              <option value={50}>50 results</option>
              <option value={100}>100 results</option>
            </select>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!loading && !error && !result && (
            <p className="text-gray-500 text-sm text-center py-12">
              Enter a keyword or filter to search logcat entries.
            </p>
          )}

          {!loading && result && (
            <>
              {/* Status bar */}
              <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
                <span>{result.totalMatches} matched</span>
                <span>showing {result.showing}</span>
                <span className="px-1.5 py-0.5 rounded bg-surface border border-border">
                  {result.method}
                </span>
              </div>

              {result.entries.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  No matching entries found.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {result.entries.map((entry, i) => (
                    <div
                      key={i}
                      className={`font-mono text-xs leading-relaxed ${levelColor(entry.level)}`}
                    >
                      <span className="text-gray-500">{entry.timestamp}</span>
                      {' '}
                      <span className="text-gray-500">
                        {entry.pid ?? '?'}/{entry.tid ?? '?'}
                      </span>
                      {' '}
                      <span className="font-semibold">{entry.level}/{entry.tag}</span>
                      : {entry.message}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
