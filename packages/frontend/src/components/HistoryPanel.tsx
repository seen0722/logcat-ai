import { useState, useEffect } from 'react';
import { fetchHistory, deleteHistory } from '../lib/api';
import { AnalysisSummary } from '../lib/types';

interface Props {
  onLoad: (id: string) => void;
  onClose: () => void;
}

export default function HistoryPanel({ onLoad, onClose }: Props) {
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    loadPage();
  }, [page]);

  async function loadPage() {
    setLoading(true);
    try {
      const data = await fetchHistory(pageSize, page * pageSize);
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this analysis?')) return;
    await deleteHistory(id);
    loadPage();
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  function healthColor(score?: number): string {
    if (score == null) return 'text-gray-500';
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-background border-l border-border h-full overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Analysis History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-400 py-10">No history yet</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => onLoad(item.id)}
                className="bg-surface border border-border rounded-lg p-4 cursor-pointer hover:border-indigo-500/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.filename}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(item.createdAt)} · {formatSize(item.fileSize)}</p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(item.id, e)}
                    className="text-gray-500 hover:text-red-400 ml-2 text-sm"
                    title="Delete"
                  >
                    &#x2715;
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  {item.deviceModel && (
                    <span className="text-gray-400">{item.deviceModel}</span>
                  )}
                  {item.androidVer && (
                    <span className="text-gray-500">Android {item.androidVer}</span>
                  )}
                  <span className={healthColor(item.healthOverall)}>
                    {item.healthOverall != null ? `${item.healthOverall}/100` : '\u2014'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  {item.criticalCount > 0 && (
                    <span className="text-red-400">{item.criticalCount} critical</span>
                  )}
                  {item.insightCount > 0 && (
                    <span className="text-gray-400">{item.insightCount} insights</span>
                  )}
                  {item.anrCount > 0 && (
                    <span className="text-amber-400">{item.anrCount} ANRs</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-border rounded disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-gray-400">
              {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * pageSize >= total}
              className="px-3 py-1 border border-border rounded disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
