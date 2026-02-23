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

  // Batch state
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [batchAggregation, setBatchAggregation] = useState<BatchAggregation | null>(null);
  const [batchItems, setBatchItems] = useState<BatchFileResult[]>([]);

  const handleBatchComplete = (_batchId: string, aggregation: BatchAggregation, items: BatchFileResult[]) => {
    setShowBatchUpload(false);
    setBatchAggregation(aggregation);
    setBatchItems(items);
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
          <BSPQuickReference
            bootStatus={result.bootStatus}
            memInfo={result.memInfo}
            cpuInfo={result.cpuInfo}
            halStatus={result.halStatus}
            logTagStats={result.logTagStats}
          />
          {result.deepAnalysisOverview && (
            <DeepAnalysisOverview overview={result.deepAnalysisOverview} />
          )}
          <InsightsCards insights={result.insights} />
          {result.anrAnalyses.length > 0 && (
            <ANRDetail analyses={result.anrAnalyses} />
          )}
          <Timeline events={result.timeline} />
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
          onClose={() => { setShowSearch(false); setSearchTag(null); }}
        />
      )}
    </div>
  );
}
