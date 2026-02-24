import { useState } from 'react';
import { useAnalysis } from './hooks/useAnalysis';
import { useComparison } from './hooks/useComparison';
import { BatchAggregation, BatchFileResult } from './lib/types';
import UploadZone from './components/UploadZone';
import ProgressView from './components/ProgressView';
import SystemOverview from './components/SystemOverview';
import InsightsCards from './components/InsightsCards';
import Timeline from './components/Timeline';
import ANRDetail from './components/ANRDetail';
import ChatPanel from './components/ChatPanel';
import DeepAnalysisOverview from './components/DeepAnalysisOverview';
import TagStats from './components/TagStats';
import BSPQuickReference from './components/BSPQuickReference';
import PowerOverview from './components/PowerOverview';
import HistoryPanel from './components/HistoryPanel';
import ExportMenu from './components/ExportMenu';
import ComparisonView from './components/ComparisonView';
import BatchUpload from './components/BatchUpload';
import BatchResults from './components/BatchResults';
import SearchModal from './components/SearchModal';

export default function App() {
  const { phase, uploadId, progress, result, error, start, reset, loadFromHistory } = useAnalysis();
  const [showHistory, setShowHistory] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const { comparison, loading: compareLoading, error: compareError, compare, reset: resetComparison } = useComparison();

  const [showSearch, setShowSearch] = useState(false);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchStartTime, setSearchStartTime] = useState<string | null>(null);
  const [searchEndTime, setSearchEndTime] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<'logcat' | 'kernel' | null>(null);
  const [searchFocusTime, setSearchFocusTime] = useState<string | null>(null);

  // Batch state
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [batchAggregation, setBatchAggregation] = useState<BatchAggregation | null>(null);
  const [batchItems, setBatchItems] = useState<BatchFileResult[]>([]);

  const handleBatchComplete = (_batchId: string, aggregation: BatchAggregation, items: BatchFileResult[]) => {
    setShowBatchUpload(false);
    setBatchAggregation(aggregation);
    setBatchItems(items);
  };

  // Compute time range ±deltaSeconds from a timestamp in "MM-DD HH:mm:ss.SSS" format
  const computeTimeRange = (timestamp: string, deltaSeconds: number): { startTime: string; endTime: string } => {
    // Parse "MM-DD HH:mm:ss.SSS" or "MM-DD HH:mm:ss"
    const match = timestamp.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
    if (!match) {
      // Fallback: return original timestamp as-is
      return { startTime: timestamp, endTime: timestamp };
    }
    const [, mo, dd, hh, mm, ss, msStr] = match;
    const ms = msStr ? parseInt(msStr.padEnd(3, '0'), 10) : 0;

    // Convert to total milliseconds for easy arithmetic (using a reference year)
    const toMs = (month: number, day: number, hour: number, min: number, sec: number, millis: number) => {
      return ((((month * 31 + day) * 24 + hour) * 60 + min) * 60 + sec) * 1000 + millis;
    };

    const totalMs = toMs(parseInt(mo, 10), parseInt(dd, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10), ms);
    const startMs = totalMs - deltaSeconds * 1000;
    const endMs = totalMs + deltaSeconds * 1000;

    const fromMs = (total: number) => {
      const millis = ((total % 1000) + 1000) % 1000;
      let secs = Math.floor(total / 1000);
      const s = ((secs % 60) + 60) % 60;
      secs = Math.floor(secs / 60);
      const m = ((secs % 60) + 60) % 60;
      secs = Math.floor(secs / 60);
      const h = ((secs % 24) + 24) % 24;
      secs = Math.floor(secs / 24);
      const d = ((secs % 31) + 31) % 31 || 1;
      secs = Math.floor(secs / 31);
      const mon = Math.max(1, Math.min(12, secs));
      return `${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    };

    return { startTime: fromMs(startMs), endTime: fromMs(endMs) };
  };

  const handleTimelineSearch = (eventTimestamp: string, _eventTimestampEnd: string, source?: string) => {
    const { startTime, endTime } = computeTimeRange(eventTimestamp, 5);
    setSearchStartTime(startTime);
    setSearchEndTime(endTime);
    setSearchTag(null);
    setSearchSource(source === 'kernel' ? 'kernel' : null);
    setSearchFocusTime(eventTimestamp);
    setShowSearch(true);
  };

  const handleBatchViewReport = (id: string) => {
    setBatchAggregation(null);
    setBatchItems([]);
    loadFromHistory(id);
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      {/* Header (when not in upload phase) */}
      {phase !== 'upload' && (
        <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
          <h1 className="text-xl font-bold">Logcat AI</h1>
          <div className="flex items-center gap-2">
            {uploadId && phase === 'result' && (
              <>
                <button
                  onClick={() => setCompareMode(true)}
                  className="px-3 py-1.5 text-sm border border-indigo-500/50 text-indigo-400 rounded-lg hover:bg-indigo-500/10 transition-colors"
                >
                  Compare
                </button>
                <button
                  onClick={() => setShowSearch(true)}
                  className="px-3 py-1.5 text-sm border border-indigo-500/50 text-indigo-400 rounded-lg hover:bg-indigo-500/10 transition-colors"
                >
                  Search
                </button>
              </>
            )}
            {uploadId && <ExportMenu uploadId={uploadId} />}
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              History
            </button>
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              New Analysis
            </button>
          </div>
        </div>
      )}

      {/* Upload Phase */}
      {phase === 'upload' && (
        <div className="pt-20">
          <UploadZone onStart={start} error={error} />
          <div className="text-center mt-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setShowBatchUpload(true)}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Batch Analysis
            </button>
            <span className="text-gray-600">|</span>
            <button
              onClick={() => setShowHistory(true)}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              View History
            </button>
          </div>
        </div>
      )}

      {/* Analyzing Phase */}
      {phase === 'analyzing' && (
        <div className="pt-20">
          <ProgressView progress={progress} />
        </div>
      )}

      {/* Result Phase */}
      {phase === 'result' && result && (
        <div className="max-w-5xl mx-auto space-y-6">
          <SystemOverview
            metadata={result.metadata}
            healthScore={result.healthScore}
            memInfo={result.memInfo}
            cpuInfo={result.cpuInfo}
            bootStatus={result.bootStatus}
            halStatus={result.halStatus}
          />
          {result.logTagStats && result.logTagStats.length > 0 && (
            <TagStats
              tagStats={result.logTagStats}
              onTagClick={(tag) => { setSearchTag(tag); setShowSearch(true); }}
            />
          )}
          <PowerOverview powerStatus={result.powerStatus} />
          <BSPQuickReference
            bootStatus={result.bootStatus}
            memInfo={result.memInfo}
            cpuInfo={result.cpuInfo}
            halStatus={result.halStatus}
            logTagStats={result.logTagStats}
            powerStatus={result.powerStatus}
          />
          {result.deepAnalysisOverview && (
            <DeepAnalysisOverview overview={result.deepAnalysisOverview} />
          )}
          <InsightsCards insights={result.insights} />
          {result.anrAnalyses.length > 0 && (
            <ANRDetail analyses={result.anrAnalyses} />
          )}
          <Timeline events={result.timeline} onSearchTime={handleTimelineSearch} />
          {uploadId && <ChatPanel uploadId={uploadId} />}
        </div>
      )}

      {/* History Panel (normal mode) */}
      {showHistory && (
        <HistoryPanel
          onLoad={(id) => {
            setShowHistory(false);
            loadFromHistory(id);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Compare mode: select another analysis from history */}
      {compareMode && !comparison && (
        <HistoryPanel
          onLoad={(otherId) => {
            setCompareMode(false);
            if (uploadId) {
              compare(uploadId, otherId);
            }
          }}
          onClose={() => setCompareMode(false)}
        />
      )}

      {/* Comparison loading indicator */}
      {compareLoading && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-[#0d1117] border border-gray-700/60 rounded-lg px-8 py-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-300">Comparing analyses...</p>
          </div>
        </div>
      )}

      {/* Comparison error */}
      {compareError && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={resetComparison}>
          <div className="bg-[#0d1117] border border-red-900/50 rounded-lg px-8 py-6 text-center max-w-md" onClick={(e) => e.stopPropagation()}>
            <p className="text-red-400 mb-4">{compareError}</p>
            <button
              onClick={resetComparison}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Comparison result */}
      {comparison && (
        <ComparisonView comparison={comparison} onClose={resetComparison} />
      )}

      {/* Batch Upload Modal */}
      {showBatchUpload && (
        <BatchUpload
          onComplete={handleBatchComplete}
          onClose={() => setShowBatchUpload(false)}
        />
      )}

      {/* Batch Results Modal */}
      {batchAggregation && (
        <BatchResults
          aggregation={batchAggregation}
          items={batchItems}
          onViewReport={handleBatchViewReport}
          onClose={() => { setBatchAggregation(null); setBatchItems([]); }}
        />
      )}

      {/* Search Modal */}
      {showSearch && uploadId && (
        <SearchModal
          uploadId={uploadId}
          initialTag={searchTag ?? undefined}
          initialStartTime={searchStartTime ?? undefined}
          initialEndTime={searchEndTime ?? undefined}
          initialSource={searchSource ?? undefined}
          initialFocusTime={searchFocusTime ?? undefined}
          onClose={() => { setShowSearch(false); setSearchTag(null); setSearchStartTime(null); setSearchEndTime(null); setSearchSource(null); setSearchFocusTime(null); }}
        />
      )}
    </div>
  );
}
