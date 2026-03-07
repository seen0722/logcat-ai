import { useState, useRef, useCallback, useEffect, DragEvent } from 'react';
import { uploadBatchFiles, startBatchAnalysis } from '../lib/api';
import { BatchAggregation, BatchSSEProgress, BatchFileResult } from '../lib/types';

interface Props {
  onComplete: (batchId: string, aggregation: BatchAggregation, items: BatchFileResult[]) => void;
  onClose: () => void;
}

export default function BatchUpload({ onComplete, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<BatchSSEProgress | null>(null);
  const [completedFiles, setCompletedFiles] = useState<BatchFileResult[]>([]);
  const [errors, setErrors] = useState<Array<{ filename: string; error: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const isZipFile = (name: string) => {
    return name.toLowerCase().endsWith('.zip');
  };

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => isZipFile(f.name));
    if (dropped.length > 0) {
      setFiles(prev => [...prev, ...dropped]);
    }
  }, []);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).filter(f => isZipFile(f.name));
    if (selected.length > 0) {
      setFiles(prev => [...prev, ...selected]);
    }
    // Reset input so same files can be selected again
    e.target.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) return;

    setAnalyzing(true);
    setError(null);
    setCompletedFiles([]);
    setErrors([]);

    try {
      // Step 1: Upload all files
      setProgress({
        stage: 'analyzing',
        progress: 0,
        message: `Uploading ${files.length} files...`,
      });

      const uploadResult = await uploadBatchFiles(files);

      // Step 2: Start batch analysis via SSE
      cleanupRef.current = startBatchAnalysis(
        uploadResult.batchId,
        (event) => {
          setProgress(event);

          if (event.fileResult) {
            setCompletedFiles(prev => [...prev, event.fileResult!]);
          }

          if (event.fileError) {
            setErrors(prev => [...prev, event.fileError!]);
          }

          if (event.stage === 'complete' && event.data) {
            setAnalyzing(false);
            onComplete(event.data.batchId, event.data.aggregation, event.data.items);
          }

          if (event.stage === 'error') {
            setAnalyzing(false);
            setError(event.message);
          }
        },
        (err) => {
          setAnalyzing(false);
          setError(err);
        },
      );
    } catch (err) {
      setAnalyzing(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [files, onComplete]);

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    cleanupRef.current?.();
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 transition-colors duration-200 ${visible ? 'bg-black/60' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-3xl bg-background border border-border rounded-xl shadow-2xl mx-4 transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-gray-100">Batch Analysis</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop Zone */}
          {!analyzing && (
            <div
              className={`border-2 border-dashed rounded-lg cursor-pointer text-center py-8 transition-colors ${
                dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-border hover:border-gray-500'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                multiple
                className="hidden"
                onChange={handleSelect}
              />
              <div className="space-y-2">
                <svg className="w-10 h-10 mx-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-gray-300">Drop multiple bugreport .zip files here</p>
                <p className="text-xs text-gray-500">Up to 20 files, max 200 MB each</p>
              </div>
            </div>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </span>
                {!analyzing && (
                  <button
                    onClick={() => setFiles([])}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="bg-surface border border-border rounded-lg divide-y divide-border max-h-60 overflow-y-auto">
                {files.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-gray-500 w-6 text-right shrink-0">{i + 1}.</span>
                      <span className="text-sm text-gray-200 truncate">{file.name}</span>
                      <span className="text-xs text-gray-500 shrink-0">{formatSize(file.size)}</span>
                    </div>
                    {!analyzing && (
                      <button
                        onClick={() => removeFile(i)}
                        className="text-gray-500 hover:text-red-400 text-sm ml-2 shrink-0"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {analyzing && progress && (
            <div className="space-y-3">
              <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <p className="text-center text-sm text-gray-400">{progress.message}</p>

              {/* Completed files */}
              {completedFiles.length > 0 && (
                <div className="bg-surface border border-border rounded-lg divide-y divide-border max-h-40 overflow-y-auto">
                  {completedFiles.map((f) => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-2">
                      <span className="text-sm text-gray-300 truncate">{f.filename}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs font-medium ${
                          f.healthScore >= 70 ? 'text-green-400' :
                          f.healthScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          Score: {f.healthScore}
                        </span>
                        {f.criticalCount > 0 && (
                          <span className="text-xs text-red-400">{f.criticalCount} critical</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  {errors.map((e, i) => (
                    <p key={i} className="text-sm text-red-400">
                      Failed: {e.filename} - {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          {!analyzing && (
            <button
              onClick={handleAnalyze}
              disabled={files.length === 0}
              className="px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Analyze {files.length} file{files.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
