import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { uploadFile, startAnalysis, startDeepAnalysis, fetchHistoryResult, fetchAnalysisResult } from '../lib/api';
import type { AnalysisResult, SSEProgress, AnalysisMode } from '../lib/types';

interface AnalysisContextValue {
  uploadId: string | null;
  progress: SSEProgress | null;
  result: AnalysisResult | null;
  error: string | null;
  /** Callback invoked with the analysis ID when SSE completes successfully. */
  onCompleteRef: React.MutableRefObject<((id: string) => void) | null>;
  start: (file: File, mode: AnalysisMode, description?: string) => Promise<void>;
  reset: () => void;
  loadFromHistory: (id: string) => Promise<AnalysisResult | null>;
  runDeep: () => Promise<void>;
  /** Whether currently in the analyzing (SSE) phase */
  analyzing: boolean;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function useAnalysisContext(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysisContext must be used within AnalysisProvider');
  return ctx;
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SSEProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef<((id: string) => void) | null>(null);

  const start = useCallback(
    async (file: File, mode: AnalysisMode, description?: string) => {
      setError(null);
      setResult(null);
      setAnalyzing(true);

      try {
        setProgress({
          stage: 'unpacking',
          progress: 5,
          message: 'Uploading file...',
        });

        const uploaded = await uploadFile(file);
        const analysisId = uploaded.id;
        setUploadId(analysisId);

        cleanupRef.current = startAnalysis(
          analysisId,
          mode,
          description,
          async (event) => {
            setProgress(event);

            if (event.stage === 'complete') {
              try {
                const fullResult = await fetchAnalysisResult(analysisId);
                setResult(fullResult);
                setAnalyzing(false);
                onCompleteRef.current?.(analysisId);
              } catch {
                setError('Failed to fetch analysis result');
                setAnalyzing(false);
              }
            }
            if (event.stage === 'error') {
              setError(event.message);
              setAnalyzing(false);
            }
          },
          (err) => {
            setError(err);
            setAnalyzing(false);
          },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setAnalyzing(false);
      }
    },
    [],
  );

  const loadFromHistory = useCallback(
    async (id: string): Promise<AnalysisResult | null> => {
      setError(null);
      try {
        const historyResult = await fetchHistoryResult(id);
        setUploadId(id);
        setResult(historyResult);
        return historyResult;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
        return null;
      }
    },
    [],
  );

  const runDeep = useCallback(
    async () => {
      if (!uploadId || !result) return;
      setError(null);
      setAnalyzing(true);
      setProgress({ stage: 'deep_analysis', progress: 85, message: 'Starting AI deep analysis...' });

      cleanupRef.current = startDeepAnalysis(
        uploadId,
        async (event) => {
          setProgress(event);
          if (event.stage === 'complete') {
            try {
              const fullResult = await fetchAnalysisResult(uploadId);
              setResult(fullResult);
              setAnalyzing(false);
              onCompleteRef.current?.(uploadId);
            } catch {
              setError('Failed to fetch updated result');
              setAnalyzing(false);
            }
          }
          if (event.stage === 'error') {
            setError(event.message);
            setAnalyzing(false);
          }
        },
        (err) => {
          setError(err);
          setAnalyzing(false);
        },
      );
    },
    [uploadId, result],
  );

  const reset = useCallback(() => {
    cleanupRef.current?.();
    setUploadId(null);
    setProgress(null);
    setResult(null);
    setError(null);
    setAnalyzing(false);
  }, []);

  return (
    <AnalysisContext.Provider value={{
      uploadId, progress, result, error, analyzing,
      onCompleteRef,
      start, reset, loadFromHistory, runDeep,
    }}>
      {children}
    </AnalysisContext.Provider>
  );
}
