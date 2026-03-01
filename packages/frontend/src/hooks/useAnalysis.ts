import { useState, useCallback, useRef } from 'react';
import { uploadFile, startAnalysis, fetchHistoryResult, fetchAnalysisResult } from '../lib/api';
import {
  AnalysisResult,
  SSEProgress,
  AnalysisMode,
} from '../lib/types';

export type AppPhase = 'landing' | 'upload' | 'analyzing' | 'result';

function getInitialPhase(): AppPhase {
  try {
    if (localStorage.getItem('skipLanding') === '1') return 'upload';
  } catch {}
  return 'landing';
}

export function useAnalysis() {
  const [phase, setPhase] = useState<AppPhase>(getInitialPhase);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SSEProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const start = useCallback(
    async (file: File, mode: AnalysisMode, description?: string) => {
      setError(null);
      setResult(null);
      setPhase('analyzing');

      try {
        // Step 1: Upload
        setProgress({
          stage: 'unpacking',
          progress: 5,
          message: 'Uploading file...',
        });

        const uploaded = await uploadFile(file);
        setUploadId(uploaded.id);

        // Step 2: Start analysis via SSE
        const analysisId = uploaded.id;
        cleanupRef.current = startAnalysis(
          analysisId,
          mode,
          description,
          async (event) => {
            setProgress(event);

            if (event.stage === 'complete') {
              // Fetch full result via REST API instead of reading from SSE
              // (SSE payload would be 200MB+ for large bugreports)
              try {
                const fullResult = await fetchAnalysisResult(analysisId);
                setResult(fullResult);
                setPhase('result');
              } catch {
                setError('Failed to fetch analysis result');
                setPhase('upload');
              }
            }
            if (event.stage === 'error') {
              setError(event.message);
              setPhase('upload');
            }
          },
          (err) => {
            setError(err);
            setPhase('upload');
          },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setPhase('upload');
      }
    },
    [],
  );

  const loadFromHistory = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const historyResult = await fetchHistoryResult(id);
        setUploadId(id);
        setResult(historyResult);
        setPhase('result');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      }
    },
    [],
  );

  const reset = useCallback(() => {
    cleanupRef.current?.();
    setPhase('upload');
    setUploadId(null);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { phase, uploadId, progress, result, error, start, reset, loadFromHistory };
}
