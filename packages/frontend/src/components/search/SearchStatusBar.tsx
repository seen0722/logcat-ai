import { useState } from 'react';
import type { SearchSource, BaseEntry, LogcatEntry, KernelEntry } from './types';

interface SearchStatusBarProps {
  source: SearchSource;
  loading: boolean;
  allEntries: LogcatEntry[] | KernelEntry[];
  filteredCount: number;
  matchCount: number;
  hasKeyword: boolean;
  method: string;
  truncated: boolean;
  totalAvailable: number;
  fullTimeRange: { first: string; last: string; total: number } | null;
  onExport: (format: 'csv' | 'text') => void;
}

export function SearchStatusBar({
  source,
  loading,
  allEntries,
  filteredCount,
  matchCount,
  hasKeyword,
  method,
  truncated,
  totalAvailable,
  fullTimeRange,
  onExport,
}: SearchStatusBarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-[11px] text-gray-400 bg-surface-card border-b border-border/40 shrink-0">
      {loading ? (
        <span className="text-gray-500">Loading...</span>
      ) : allEntries.length > 0 ? (
        <>
          <span className="font-medium text-gray-300">{allEntries.length.toLocaleString()}</span>
          <span>loaded</span>
          <span className="text-gray-600">|</span>
          <span className="font-medium text-gray-300">{filteredCount.toLocaleString()}</span>
          <span>shown</span>
          {hasKeyword && matchCount > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span className="font-medium text-accent">{matchCount.toLocaleString()}</span>
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
              Showing {allEntries.length.toLocaleString()} of {(fullTimeRange?.total ?? totalAvailable).toLocaleString()}
              {allEntries.length > 0 && (
                <span className="text-gray-500 ml-1">
                  (loaded: {(allEntries[0] as BaseEntry).timestamp?.slice(0, 14)} ~ {(allEntries[allEntries.length - 1] as BaseEntry).timestamp?.slice(0, 14)}
                  {fullTimeRange && (
                    <span> · full: {fullTimeRange.first.slice(0, 14)} ~ {fullTimeRange.last.slice(0, 14)}</span>
                  )}
                  )
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
            <div className="absolute top-full right-0 mt-1 bg-surface-card border border-border/60 rounded-lg shadow-xl z-20 py-1 min-w-[180px]">
              <button
                onClick={() => { onExport('csv'); setShowExportMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
              >
                Export CSV ({filteredCount.toLocaleString()} rows)
              </button>
              <button
                onClick={() => { onExport('text'); setShowExportMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700/50 hover:text-white transition-colors"
              >
                {source === 'kernel' ? 'Export dmesg Text' : 'Export Text'} ({filteredCount.toLocaleString()} rows)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
