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
  const [visible, setVisible] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const pageSize = 10;

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

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

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    await deleteHistory(confirmDeleteId);
    setConfirmDeleteId(null);
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

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  function healthColor(score?: number): string {
    if (score == null) return 'text-gray-500';
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  }

  return (
    <div className={`fixed inset-0 z-50 flex justify-end transition-colors duration-200 ${visible ? 'bg-black/80' : 'bg-black/0'}`} onClick={handleClose}>
      <div
        className={`w-full max-w-lg bg-[#0d1117] border-l border-gray-700/60 h-full overflow-y-auto flex flex-col transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">Analysis History</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Search filter */}
        <div className="px-4 pt-3 pb-0 shrink-0">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by filename..."
            className="w-full bg-[#161b22] border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-500 py-16">
              <p className="text-sm">No history yet.</p>
              <p className="text-xs text-gray-600 mt-1">Upload and analyze a bugreport to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.filter((item) => !filterText || item.filename.toLowerCase().includes(filterText.toLowerCase())).map((item) => (
                <div
                  key={item.id}
                  onClick={() => onLoad(item.id)}
                  className="bg-[#161b22] border border-gray-700/60 rounded-lg p-4 cursor-pointer hover:border-indigo-500/50 hover:bg-[#1c2333] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-100 truncate text-sm">{item.filename}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        <span title={formatDate(item.createdAt)}>{relativeTime(item.createdAt)}</span>
                        {' · '}{formatSize(item.fileSize)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      className="text-gray-600 hover:text-red-400 w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 transition-colors shrink-0"
                      title="Delete"
                    >
                      &#x2715;
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2.5 text-xs">
                    {item.deviceModel && (
                      <span className="text-gray-400 bg-gray-800/50 px-1.5 py-0.5 rounded">{item.deviceModel}</span>
                    )}
                    {item.androidVer && (
                      <span className="text-gray-500">Android {item.androidVer}</span>
                    )}
                    <span className={`font-semibold ${healthColor(item.healthOverall)}`}>
                      {item.healthOverall != null ? `${item.healthOverall}/100` : '\u2014'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    {item.criticalCount > 0 && (
                      <span className="text-red-400">{item.criticalCount} critical</span>
                    )}
                    {item.insightCount > 0 && (
                      <span className="text-gray-500">{item.insightCount} insights</span>
                    )}
                    {item.anrCount > 0 && (
                      <span className="text-amber-400">{item.anrCount} ANRs</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-700/60 shrink-0 text-xs">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-gray-500">
              {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * pageSize >= total}
              className="px-2.5 py-1 rounded border border-gray-700/60 text-gray-400 hover:text-white hover:bg-gray-700/50 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Custom Confirm Dialog */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setConfirmDeleteId(null)}>
            <div className="bg-[#161b22] border border-gray-700/60 rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-200 text-sm mb-4">Delete this analysis? This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-1.5 text-sm border border-gray-700/60 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
