import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useAnalysisContext } from '../contexts/AnalysisContext';
import SystemOverview from '../components/SystemOverview';
import InsightsCards from '../components/InsightsCards';
import Timeline from '../components/Timeline';
import ANRDetail from '../components/ANRDetail';
import ChatPanel from '../components/ChatPanel';
import DeepAnalysisOverview from '../components/DeepAnalysisOverview';
import SystemDetailsTabs from '../components/SystemDetailsTabs';
import SectionNav from '../components/SectionNav';
import SearchModal from '../components/SearchModal';
import ProgressView from '../components/ProgressView';

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const { uploadId, result, loadFromHistory, runDeep, analyzing, progress, reset } = useAnalysisContext();

  // Timeline search state (opens SearchModal in modal mode)
  const [showTimelineSearch, setShowTimelineSearch] = useState(false);
  const [searchStartTime, setSearchStartTime] = useState<string | null>(null);
  const [searchEndTime, setSearchEndTime] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<'logcat' | 'kernel' | null>(null);
  const [searchFocusTime, setSearchFocusTime] = useState<string | null>(null);
  // Tag search state
  const [searchTag, setSearchTag] = useState<string | null>(null);
  const [showTagSearch, setShowTagSearch] = useState(false);

  // Load from history if navigating directly to /analysis/:id
  useEffect(() => {
    if (id && id !== uploadId) {
      loadFromHistory(id);
    }
  }, [id, uploadId, loadFromHistory]);

  const computeTimeRange = (timestamp: string, deltaSeconds: number): { startTime: string; endTime: string } => {
    const match = timestamp.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
    if (!match) {
      return { startTime: timestamp, endTime: timestamp };
    }
    const [, mo, dd, hh, mm, ss, msStr] = match;
    const millis = msStr ? parseInt(msStr.padEnd(3, '0'), 10) : 0;
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
    setShowTimelineSearch(true);
  };

  const navSections = useMemo(() => {
    if (!result) return [];
    const sections = [
      { id: 'section-overview', label: 'Overview', icon: 'overview' },
    ];
    if (result.deepAnalysisOverview) {
      sections.push({ id: 'section-deep', label: 'AI Analysis', icon: 'brain' });
    }
    if (result.powerStatus || result.telephonyStatus || (result.logTagStats && result.logTagStats.length > 0)) {
      sections.push({ id: 'section-power', label: 'Details', icon: 'power' });
    }
    sections.push({ id: 'section-insights', label: 'Insights', icon: 'insights' });
    if (result.anrAnalyses.length > 0) {
      sections.push({ id: 'section-anr', label: 'ANR', icon: 'anr' });
    }
    sections.push({ id: 'section-timeline', label: 'Timeline', icon: 'timeline' });
    sections.push({ id: 'section-chat', label: 'Chat', icon: 'chat' });
    return sections;
  }, [result]);

  // Show analyzing phase if deep analysis is running
  if (analyzing) {
    return (
      <div className="pt-20">
        <ProgressView progress={progress} onCancel={reset} />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const effectiveId = uploadId ?? id;

  return (
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
            bufferTimeRanges={result.bufferTimeRanges}
          />
        </div>
        {result.deepAnalysisOverview && (
          <div id="section-deep">
            <DeepAnalysisOverview overview={result.deepAnalysisOverview} />
          </div>
        )}
        {(result.powerStatus || result.telephonyStatus || (result.logTagStats && result.logTagStats.length > 0)) && (
          <SystemDetailsTabs
            powerStatus={result.powerStatus}
            telephonyStatus={result.telephonyStatus}
            tagStats={result.logTagStats}
            onTagClick={(tag) => { setSearchTag(tag); setShowTagSearch(true); }}
          />
        )}
        <div id="section-insights">
          <InsightsCards
            insights={result.insights}
            halStatus={result.halStatus}
            onRunDeep={!result.deepAnalysisOverview ? runDeep : undefined}
          />
        </div>
        {result.anrAnalyses.length > 0 && (
          <div id="section-anr">
            <ANRDetail analyses={result.anrAnalyses} />
          </div>
        )}
        <div id="section-timeline">
          <Timeline events={result.timeline} onSearchTime={handleTimelineSearch} />
        </div>
        {effectiveId && (
          <div id="section-chat">
            <ChatPanel
              uploadId={effectiveId}
              criticalInsights={result.insights
                .filter(i => i.severity === 'critical' || i.severity === 'warning')
                .slice(0, 10)
                .map(i => ({ category: i.category, title: i.title }))}
            />
          </div>
        )}
      </div>

      {/* Timeline search modal */}
      {showTimelineSearch && effectiveId && (
        <SearchModal
          uploadId={effectiveId}
          initialStartTime={searchStartTime ?? undefined}
          initialEndTime={searchEndTime ?? undefined}
          initialSource={searchSource ?? undefined}
          initialFocusTime={searchFocusTime ?? undefined}
          onClose={() => { setShowTimelineSearch(false); setSearchStartTime(null); setSearchEndTime(null); setSearchSource(null); setSearchFocusTime(null); }}
        />
      )}

      {/* Tag search modal */}
      {showTagSearch && effectiveId && (
        <SearchModal
          uploadId={effectiveId}
          initialTag={searchTag ?? undefined}
          onClose={() => { setShowTagSearch(false); setSearchTag(null); }}
        />
      )}
    </>
  );
}
