import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAnalysisContext } from '../contexts/AnalysisContext';
import { BatchAggregation, BatchFileResult } from '../lib/types';
import UploadZone from '../components/UploadZone';
import ProgressView from '../components/ProgressView';
import LandingPage from '../components/LandingPage';
import BatchUpload from '../components/BatchUpload';
import BufferExtractor from '../components/BufferExtractor';
import BatchResults from '../components/BatchResults';
import HistoryPanel from '../components/HistoryPanel';
import SettingsPanel from '../components/SettingsPanel';

export default function UploadPage() {
  const { start, reset, error, progress, analyzing, onCompleteRef } = useAnalysisContext();
  const navigate = useNavigate();

  const [showLanding, setShowLanding] = useState(() => {
    try { return localStorage.getItem('skipLanding') !== '1'; } catch { return true; }
  });
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [showBufferExtractor, setShowBufferExtractor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [batchAggregation, setBatchAggregation] = useState<BatchAggregation | null>(null);
  const [batchItems, setBatchItems] = useState<BatchFileResult[]>([]);
  const [phaseVisible, setPhaseVisible] = useState(true);

  // Register onComplete to navigate to result page
  useEffect(() => {
    onCompleteRef.current = (id: string) => {
      navigate(`/analysis/${id}`);
    };
    return () => { onCompleteRef.current = null; };
  }, [navigate, onCompleteRef]);

  // Animate phase transitions
  useEffect(() => {
    setPhaseVisible(false);
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhaseVisible(true));
    });
    return () => cancelAnimationFrame(t);
  }, [analyzing]);

  const handleBatchComplete = useCallback((_batchId: string, aggregation: BatchAggregation, items: BatchFileResult[]) => {
    setShowBatchUpload(false);
    setBatchAggregation(aggregation);
    setBatchItems(items);
  }, []);

  const handleBatchViewReport = useCallback((id: string) => {
    setBatchAggregation(null);
    setBatchItems([]);
    navigate(`/analysis/${id}`);
  }, [navigate]);

  if (showLanding) {
    return (
      <div className="min-h-screen p-6 md:p-10">
        <LandingPage
          onStart={() => {
            try { localStorage.setItem('skipLanding', '1'); } catch {}
            setShowLanding(false);
          }}
          onViewHistory={() => setShowHistory(true)}
        />
        {showHistory && (
          <HistoryPanel
            onLoad={(id) => {
              setShowHistory(false);
              navigate(`/analysis/${id}`);
            }}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    );
  }

  if (analyzing) {
    return (
      <div className="min-h-screen p-6 md:p-10">
        <div className="pt-20">
          <ProgressView progress={progress} onCancel={reset} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className={`pt-20 transition-all duration-300 ease-out ${phaseVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <UploadZone onStart={start} error={error} />
        <div className="text-center mt-5 flex items-center justify-center gap-4">
          <button
            onClick={() => setShowBufferExtractor(true)}
            className="text-sm text-accent hover:text-accent-light transition-colors"
          >
            Extract Buffers
          </button>
          <span className="text-gray-600">|</span>
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

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {/* History Panel */}
      {showHistory && (
        <HistoryPanel
          onLoad={(id) => {
            setShowHistory(false);
            navigate(`/analysis/${id}`);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Batch Upload Modal */}
      {showBatchUpload && (
        <BatchUpload
          onComplete={handleBatchComplete}
          onClose={() => setShowBatchUpload(false)}
        />
      )}

      {/* Buffer Extractor Modal */}
      {showBufferExtractor && (
        <BufferExtractor onClose={() => setShowBufferExtractor(false)} />
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
    </div>
  );
}
