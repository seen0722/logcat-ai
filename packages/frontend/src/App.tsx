import { useAnalysis } from './hooks/useAnalysis';
import UploadZone from './components/UploadZone';
import ProgressView from './components/ProgressView';
import SystemOverview from './components/SystemOverview';
import InsightsCards from './components/InsightsCards';
import Timeline from './components/Timeline';
import ANRDetail from './components/ANRDetail';
import ChatPanel from './components/ChatPanel';
import DeepAnalysisOverview from './components/DeepAnalysisOverview';

export default function App() {
  const { phase, uploadId, progress, result, error, start, reset } = useAnalysis();

  return (
    <div className="min-h-screen p-6 md:p-10">
      {/* Header (when not in upload phase) */}
      {phase !== 'upload' && (
        <div className="flex items-center justify-between mb-6 max-w-5xl mx-auto">
          <h1 className="text-xl font-bold">Logcat AI</h1>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
          >
            New Analysis
          </button>
        </div>
      )}

      {/* Upload Phase */}
      {phase === 'upload' && (
        <div className="pt-20">
          <UploadZone onStart={start} error={error} />
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
    </div>
  );
}
