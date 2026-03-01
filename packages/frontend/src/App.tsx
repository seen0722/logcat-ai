import { useState, useMemo } from 'react';
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
import SectionNav from './components/SectionNav';
import SettingsPanel from './components/SettingsPanel';
import LandingPage from './components/LandingPage';

export default function App() {
  const { phase, uploadId, progress, result, error, start, reset, loadFromHistory } = useAnalysis();
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
      return { startTime: timestamp, endTime: timestamp };
    }
    const [, mo, dd, hh, mm, ss, msStr] = match;
    const millis = msStr ? parseInt(msStr.padEnd(3, '0'), 10) : 0;

    // Use Date for correct month/day boundary arithmetic
    const ref = new Date(2000, parseInt(mo, 10) - 1, parseInt(dd, 10),
      parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10), millis);

    const fmt = (d: Date) => {
      const pad = (n: number, w = 2) => String(n).padStart(w, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    };

    return {
      startTime: fmt(new Date(ref.getTime() - deltaSeconds * 1000)),
      endTime: fmt(new Date(ref.getTime() + deltaSeconds * 1000)),
    };
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

  // Build section navigation items based on available data
  const navSections = useMemo(() => {
    if (!result) return [];
    const sections = [
      { id: 'section-overview', label: 'Overview', icon: '\u{1F4CB}' },
    ];
    if (result.logTagStats && result.logTagStats.length > 0) {
      sections.push({ id: 'section-tags', label: 'Tags', icon: '\u{1F3F7}' });
    }
    if (result.powerStatus) {
      sections.push({ id: 'section-power', label: 'Power', icon: '\u{1F50B}' });
    }
    sections.push({ id: 'section-bsp', label: 'BSP Ref', icon: '\u{1F527}' });
    if (result.deepAnalysisOverview) {
      sections.push({ id: 'section-deep', label: 'AI Analysis', icon: '\u{1F9E0}' });
    }
    sections.push({ id: 'section-insights', label: 'Insights', icon: '\u{1F4A1}' });
    if (result.anrAnalyses.length > 0) {
      sections.push({ id: 'section-anr', label: 'ANR', icon: '\u{26A0}' });
    }
    sections.push({ id: 'section-timeline', label: 'Timeline', icon: '\u{23F1}' });
    sections.push({ id: 'section-chat', label: 'Chat', icon: '\u{1F4AC}' });
    return sections;
  }, [result]);

  const handleBatchViewReport = (id: string) => {
    setBatchAggregation(null);
    setBatchItems([]);
    loadFromHistory(id);
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      {/* Header (when not in upload phase) */}
      {phase !== 'upload' && phase !== 'landing' && (
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
            {uploadId && <ExportMenu uploadId={uploadId} hasPowerData={!!result?.powerStatus?.batteryStats} />}
            <button
              onClick={() => setShowSettings(true)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
              title="LLM Settings"
            >
              <svg className="w-4 h-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
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

      {/* Landing Phase */}
      {phase === 'landing' && (
        <LandingPage
          onStart={() => {
            try { localStorage.setItem('skipLanding', '1'); } catch {}
            reset();
          }}
          onViewHistory={() => setShowHistory(true)}
        />
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
              onClick={() => setShowSettings(true)}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              LLM Settings
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
        <>
          <SectionNav sections={navSections} />
          <div className="max-w-5xl mx-auto space-y-6">
            <div id="section-overview">
              <SystemOverview
                metadata={result.metadata}
                healthScore={result.healthScore}
                memInfo={result.memInfo}
                cpuInfo={result.cpuInfo}
                bootStatus={result.bootStatus}
                halStatus={result.halStatus}
                insights={result.insights}
              />
            </div>
            {result.logTagStats && result.logTagStats.length > 0 && (
              <div id="section-tags">
                <TagStats
                  tagStats={result.logTagStats}
                  onTagClick={(tag) => { setSearchTag(tag); setShowSearch(true); }}
                />
              </div>
            )}
            {result.powerStatus && (
              <div id="section-power">
                <PowerOverview powerStatus={result.powerStatus} />
              </div>
            )}
            <div id="section-bsp">
              <BSPQuickReference
                bootStatus={result.bootStatus}
                memInfo={result.memInfo}
                cpuInfo={result.cpuInfo}
                halStatus={result.halStatus}
                logTagStats={result.logTagStats}
                powerStatus={result.powerStatus}
              />
            </div>
            {result.deepAnalysisOverview && (
              <div id="section-deep">
                <DeepAnalysisOverview overview={result.deepAnalysisOverview} />
              </div>
            )}
            <div id="section-insights">
              <InsightsCards insights={result.insights} />
            </div>
            {result.anrAnalyses.length > 0 && (
              <div id="section-anr">
                <ANRDetail analyses={result.anrAnalyses} />
              </div>
            )}
            <div id="section-timeline">
              <Timeline events={result.timeline} onSearchTime={handleTimelineSearch} />
            </div>
            {uploadId && (
              <div id="section-chat">
                <ChatPanel uploadId={uploadId} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
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
