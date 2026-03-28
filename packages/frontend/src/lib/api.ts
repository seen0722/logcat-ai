import { UploadResponse, SSEProgress, AnalysisSummary, AnalysisResult, BatchUploadResponse, BatchSSEProgress } from './types';

const API_BASE = '/api';

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Upload failed');
  }
  return res.json();
}

export function startAnalysis(
  id: string,
  mode: 'quick' | 'deep',
  description?: string,
  onProgress?: (event: SSEProgress) => void,
  onError?: (error: string) => void,
): () => void {
  const params = new URLSearchParams({ mode });
  if (description) params.set('description', description);

  const url = `${API_BASE}/analyze/${id}?${params}`;
  let aborted = false;
  let sseComplete = false;
  const controller = new AbortController();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let stalledTimer: ReturnType<typeof setTimeout> | null = null;

  // Simulated progress stages for polling fallback
  const simulatedStages: Array<{ stage: SSEProgress['stage']; progress: number; message: string }> = [
    { stage: 'unpacking', progress: 15, message: 'Unpacking bugreport...' },
    { stage: 'parsing', progress: 35, message: 'Parsing log sections...' },
    { stage: 'parsing', progress: 50, message: 'Parsing kernel & dumpsys...' },
    { stage: 'analyzing', progress: 65, message: 'Running rule-based analysis...' },
    { stage: 'analyzing', progress: 75, message: 'Generating insights...' },
    { stage: 'deep_analysis', progress: 85, message: 'AI deep analysis in progress...' },
    { stage: 'deep_analysis', progress: 90, message: 'Finalizing analysis...' },
  ];
  let simIndex = 0;
  let lastSseProgress = 0; // track highest progress from real SSE events

  function cleanup() {
    aborted = true;
    controller.abort();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (stalledTimer) { clearTimeout(stalledTimer); stalledTimer = null; }
  }

  // Reset stall detector — called every time a real SSE event arrives.
  // If 4 seconds pass without another SSE event and analysis isn't done, start polling.
  function resetStallDetector() {
    if (stalledTimer) clearTimeout(stalledTimer);
    if (aborted || sseComplete) return;
    stalledTimer = setTimeout(() => {
      if (!aborted && !sseComplete) startPollingFallback();
    }, 4000);
  }

  function startPollingFallback() {
    if (pollTimer || aborted || sseComplete) return;

    // Skip simulated stages that SSE already covered
    while (simIndex < simulatedStages.length && simulatedStages[simIndex].progress <= lastSseProgress) {
      simIndex++;
    }

    // Immediately emit one simulated stage, then poll
    if (simIndex < simulatedStages.length) {
      onProgress?.(simulatedStages[simIndex]);
      simIndex++;
    }

    pollTimer = setInterval(async () => {
      if (aborted || sseComplete) return;

      // Advance simulated progress
      if (simIndex < simulatedStages.length) {
        onProgress?.(simulatedStages[simIndex]);
        simIndex++;
      }

      // Poll for result
      try {
        const res = await fetch(`${API_BASE}/analyze/${id}/result`);
        if (res.ok) {
          onProgress?.({ stage: 'complete', progress: 100, message: 'Analysis complete', data: { id } as never });
          cleanup();
        }
      } catch {
        // Network error — ignore, will retry
      }
    }, 2000);
  }

  // SSE stream — also triggers the analysis on the backend
  (async () => {
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) {
        onError?.(`Analysis failed: ${res.statusText}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE connection established — start stall detector
      resetStallDetector();

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const data: SSEProgress = JSON.parse(trimmed.slice(6));
            lastSseProgress = data.progress;

            // Real SSE event arrived — cancel polling if active, reset stall detector
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            resetStallDetector();

            onProgress?.(data);
            if (data.stage === 'complete' || data.stage === 'error') {
              sseComplete = true;
              aborted = true;
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } catch (err) {
      if (!aborted && !sseComplete) {
        // SSE connection failed — start polling if not already active
        if (!pollTimer) startPollingFallback();
      }
    }
  })();

  return cleanup;
}

/**
 * Chat SSE event types.
 * - content: regular text content chunk
 * - tool_call: the LLM is calling an investigation tool
 * - tool_result: result preview from a tool call
 */
export type ChatSSEEvent =
  | { type?: undefined; content: string; done: boolean }
  | { type: 'tool_call'; name: string; args?: string }
  | { type: 'tool_result'; name: string; preview: string };

export async function* streamChat(
  id: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): AsyncGenerator<ChatSSEEvent> {
  const res = await fetch(`${API_BASE}/chat/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok || !res.body) {
    throw new Error('Chat request failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        yield data;
      } catch {
        // skip
      }
    }
  }
}

export async function fetchProviders(): Promise<{
  active: string;
  providers: Array<{ type: string; available: boolean; model: string; error?: string }>;
}> {
  const res = await fetch(`${API_BASE}/settings/providers`);
  return res.json();
}

export async function switchProvider(
  type: string,
  opts?: { apiKey?: string; model?: string; baseUrl?: string },
): Promise<void> {
  await fetch(`${API_BASE}/settings/provider`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...opts }),
  });
}

// ---- Analysis Result API ----

export async function fetchAnalysisResult(id: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/analyze/${id}/result`);
  if (!res.ok) throw new Error('Analysis result not found');
  return res.json();
}

// ---- History API ----

export async function fetchHistory(
  limit = 20,
  offset = 0,
): Promise<{ items: AnalysisSummary[]; total: number }> {
  const res = await fetch(`${API_BASE}/history?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

export async function fetchHistoryResult(id: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/history/${id}`);
  if (!res.ok) throw new Error('Analysis not found');
  return res.json();
}

export async function deleteHistory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/history/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}

// ---- Export API ----

export function downloadExport(id: string, format: 'json' | 'html' | 'power-html' | 'telephony-html'): void {
  window.open(`${API_BASE}/export/${id}/${format}`, '_blank');
}

// ---- Search API ----

export interface LogcatSearchResult {
  totalMatches: number;
  showing: number;
  method: 'fts5' | 'keyword';
  entries: Array<{
    lineNumber: number;
    timestamp: string;
    pid?: number;
    tid?: number;
    level: string;
    tag: string;
    message: string;
    buffer?: string;
  }>;
}

export async function searchLogcat(
  id: string,
  params: { q?: string; tag?: string; level?: string; pid?: number; buffer?: string; startTime?: string; endTime?: string; limit?: number; offset?: number; export?: boolean; compact?: boolean },
): Promise<LogcatSearchResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.tag) qs.set('tag', params.tag);
  if (params.level) qs.set('level', params.level);
  if (params.pid !== undefined) qs.set('pid', String(params.pid));
  if (params.buffer) qs.set('buffer', params.buffer);
  if (params.startTime) qs.set('startTime', params.startTime);
  if (params.endTime) qs.set('endTime', params.endTime);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  if (params.export) qs.set('export', 'true');
  if (params.compact) qs.set('compact', 'true');

  const res = await fetch(`${API_BASE}/search/${id}?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Search failed');
  }
  const data = await res.json();
  // Decode compact array format → object entries
  if (data.rows && data.columns) {
    const cols = data.columns as string[];
    data.entries = data.rows.map((row: any[]) => {
      const obj: any = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      obj.lineNumber = 0;
      return obj;
    });
    data.showing = data.entries.length;
    delete data.rows;
    delete data.columns;
  }
  return data;
}

// ---- Kernel Search API ----

export interface KernelSearchResult {
  totalMatches: number;
  showing: number;
  method: 'fts5' | 'keyword';
  entries: Array<{
    entryIndex: number;
    timestamp: string;
    level: string;
    facility: string;
    message: string;
  }>;
}

export async function searchKernel(
  id: string,
  params: { q?: string; level?: string; startTime?: string; endTime?: string; limit?: number; offset?: number; export?: boolean },
): Promise<KernelSearchResult> {
  const qs = new URLSearchParams({ source: 'kernel' });
  if (params.q) qs.set('q', params.q);
  if (params.level) qs.set('level', params.level);
  if (params.startTime) qs.set('startTime', params.startTime);
  if (params.endTime) qs.set('endTime', params.endTime);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  if (params.export) qs.set('export', 'true');

  const res = await fetch(`${API_BASE}/search/${id}?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Search failed');
  }
  return res.json();
}

// ---- Batch API ----

export async function uploadBatchFiles(files: File[]): Promise<BatchUploadResponse> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }

  const res = await fetch(`${API_BASE}/batch`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Batch upload failed');
  }
  return res.json();
}

export function startBatchAnalysis(
  batchId: string,
  onProgress?: (event: BatchSSEProgress) => void,
  onError?: (error: string) => void,
): () => void {
  const url = `${API_BASE}/batch/${batchId}/analyze`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data: BatchSSEProgress = JSON.parse(event.data);
      onProgress?.(data);
      if (data.stage === 'complete' || data.stage === 'error') {
        eventSource.close();
      }
    } catch {
      // ignore parse errors
    }
  };

  eventSource.onerror = () => {
    onError?.('Connection lost');
    eventSource.close();
  };

  return () => eventSource.close();
}
