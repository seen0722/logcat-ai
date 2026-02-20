import { useState, useCallback, useRef } from 'react';
import { uploadFile, startAnalysis } from '../lib/api';
import {
  AnalysisResult,
  SSEProgress,
  AnalysisMode,
} from '../lib/types';

export type AppPhase = 'upload' | 'analyzing' | 'result';

export function useAnalysis() {
  const [phase, setPhase] = useState<AppPhase>('upload');
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
        cleanupRef.current = startAnalysis(
          uploaded.id,
          mode,
          description,
          (event) => {
            setProgress(event);

            if (event.stage === 'complete' && event.data) {
              setResult(event.data as AnalysisResult);
              setPhase('result');
            }
            if (event.stage === 'analyzing' && event.data) {
              // Quick analysis partial result
              setResult(event.data as AnalysisResult);
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

  const reset = useCallback(() => {
    cleanupRef.current?.();
    setPhase('upload');
    setUploadId(null);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { phase, uploadId, progress, result, error, start, reset };
}
