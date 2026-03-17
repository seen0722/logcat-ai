import { useState, useMemo, useEffect } from 'react';
import { useAnalysis } from './hooks/useAnalysis';
import { useComparison } from './hooks/useComparison';
import { IconSettings, IconMenu } from './components/Icons';
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
import PowerOverview from './components/PowerOverview';
import TelephonyOverview from './components/TelephonyOverview';
import HistoryPanel from './components/HistoryPanel';
import ExportMenu from './components/ExportMenu';
import ComparisonView from './components/ComparisonView';
import BatchUpload from './components/BatchUpload';
import BatchResults from './components/BatchResults';
import SearchModal from './components/SearchModal';
import SectionNav from './components/SectionNav';
import { downloadExport } from './lib/api';
import SettingsPanel from './components/SettingsPanel';
import LandingPage from './components/LandingPage';

export default function App() {
  const { phase, uploadId, progress, result, error, start, reset, loadFromHistory } = useAnalysis();
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const { comparison, loading: compareLoading, error: compareError, compare, reset: resetComparison } = useComparison();

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [searchStartTime, setSearchStartTime] = useState<string | null>(null);
  const [searchEndTime, setSearchEndTime] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<'logcat' | 'kernel' | null>(null);
  const [searchFocusTime, setSearchFocusTime] = useState<string | null>(null);

  // Batch state
  const [phaseVisible, setPhaseVisible] = useState(true);

  // Animate phase transitions
  useEffect(() => {
    setPhaseVisible(false);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhaseVisible(true));
    });
    return () => cancelAnimationFrame(t);
  }, [phase]);

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
      { id: 'section-overview', label: 'Overview', icon: 'overview' },
    ];
    if (result.logTagStats && result.logTagStats.length > 0) {
      sections.push({ id: 'section-tags', label: 'Tags', icon: 'tags' });
    }
    if (result.powerStatus) {
      sections.push({ id: 'section-power', label: 'Power', icon: 'power' });
    }
    if (result.telephonyStatus) {
      sections.push({ id: 'section-telephony', label: 'Telephony', icon: 'telephony' });
    }
    if (result.deepAnalysisOverview) {
      sections.push({ id: 'section-deep', label: 'AI Analysis', icon: 'brain' });
    }
    sections.push({ id: 'section-insights', label: 'Insights', icon: 'insights' });
    if (result.anrAnalyses.length > 0) {
      sections.push({ id: 'section-anr', label: 'ANR', icon: 'anr' });
    }
    sections.push({ id: 'section-timeline', label: 'Timeline', icon: 'timeline' });
    sections.push({ id: 'section-chat', label: 'Chat', icon: 'chat' });
    return sections;
  }, [result]);

  const downloadExportFromMenu = () => {
    if (uploadId) downloadExport(uploadId, 'json');
  };

  const handleBatchViewReport = (id: string) => {
    setBatchAggregation(null);
    setBatchItems([]);
    loadFromHistory(id);
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      {/* Header (when not in upload phase) */}
      {phase !== 'upload' && phase !== 'landing' && (
        <div className="sticky top-0 z-30 -mx-6 md:-mx-10 px-6 md:px-10 py-3 mb-6 glass">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <h1 className="font-display text-xl">
              Logcat <span className="text-warm">AI</span>
            </h1>
            <div className="flex items-center gap-2">
              {uploadId && phase === 'result' && (
                <>
                  <button
                    onClick={() => setCompareMode(true)}
                    className="hidden sm:inline-flex btn-outline text-sm px-3 py-1.5"
                  >
                    Compare
                  </button>
                  <button
                    onClick={() => setShowSearch(true)}
                    className="hidden sm:inline-flex btn-outline text-sm px-3 py-1.5"
                  >
                    Search
                  </button>
                </>
              )}
              {uploadId && <span className="hidden sm:inline-flex"><ExportMenu uploadId={uploadId} hasPowerData={!!result?.powerStatus?.batteryStats} hasTelephonyData={!!result?.telephonyStatus?.serviceState} /></span>}
              {/* Desktop: show all buttons */}
              <button
                onClick={() => setShowSettings(true)}
                className="hidden sm:inline-flex btn-ghost text-sm px-3 py-1.5"
                title="LLM Settings"
              >
                <IconSettings className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="hidden sm:inline-flex btn-ghost text-sm px-3 py-1.5"
              >
                History
              </button>
              <button
                onClick={reset}
                className="hidden sm:inline-flex btn-primary text-sm px-3 py-1.5"
              >
                New Analysis
              </button>
              {/* Mobile: overflow menu */}
              <div className="relative sm:hidden">
                <button
                  onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                  className="btn-ghost px-2 py-1.5 text-sm"
                >
                  <IconMenu className="w-5 h-5" />
                </button>
                {showHeaderMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-44 glass rounded-xl shadow-elevated py-1.5">
                      {uploadId && phase === 'result' && (
                        <>
                          <button
                            onClick={() => { setShowHeaderMenu(false); setCompareMode(true); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-surface-hover transition-colors"
                          >
                            Compare
                          </button>
                          <button
                            onClick={() => { setShowHeaderMenu(false); setShowSearch(true); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-surface-hover transition-colors"
                          >
                            Search
                          </button>
                          <button
                            onClick={() => { setShowHeaderMenu(false); downloadExportFromMenu(); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-surface-hover transition-colors border-b border-border"
                          >
                            Export
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { setShowHeaderMenu(false); setShowSettings(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        Settings
                      </button>
                      <button
                        onClick={() => { setShowHeaderMenu(false); setShowHistory(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        History
                      </button>
                      <button
                        onClick={() => { setShowHeaderMenu(false); reset(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        New Analysis
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
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
        <div className={`pt-20 transition-all duration-300 ease-out ${phaseVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <UploadZone onStart={start} error={error} />
          <div className="text-center mt-5 flex items-center justify-center gap-4">
            <button
              onClick={() => setShowBatchUpload(true)}
              className="text-sm text-accent hover:text-accent-light transition-colors"
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
          <ProgressView progress={progress} onCancel={reset} />
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
            {result.telephonyStatus && (
              <div id="section-telephony">
                <TelephonyOverview telephonyStatus={result.telephonyStatus} />
              </div>
            )}
            {result.deepAnalysisOverview && (
              <div id="section-deep">
                <DeepAnalysisOverview overview={result.deepAnalysisOverview} />
              </div>
            )}
            <div id="section-insights">
              <InsightsCards insights={result.insights} halStatus={result.halStatus} />
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
                <ChatPanel
                  uploadId={uploadId}
                  criticalInsights={result.insights
                    .filter(i => i.severity === 'critical' || i.severity === 'warning')
                    .slice(0, 10)
                    .map(i => ({ category: i.category, title: i.title }))}
                />
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
          <div className="glass rounded-xl px-8 py-6 text-center shadow-elevated">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-300">Comparing analyses...</p>
          </div>
        </div>
      )}

      {/* Comparison error */}
      {compareError && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={resetComparison}>
          <div className="glass rounded-xl px-8 py-6 text-center max-w-md border-red-900/50 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <p className="text-red-400 mb-4">{compareError}</p>
            <button
              onClick={resetComparison}
              className="btn-ghost text-sm"
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
