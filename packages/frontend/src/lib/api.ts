import { UploadResponse, SSEProgress } from './types';

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
  const eventSource = new EventSource(url);

  // EventSource receives unnamed events via `onmessage`
  // Our backend sends `data: {...}\n\n` which is the default message event
  eventSource.onmessage = (event) => {
    try {
      const data: SSEProgress = JSON.parse(event.data);
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

  // Return cleanup function
  return () => eventSource.close();
}

export async function* streamChat(
  id: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): AsyncGenerator<{ content: string; done: boolean }> {
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
  opts?: { apiKey?: string; model?: string },
): Promise<void> {
  await fetch(`${API_BASE}/settings/provider`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...opts }),
  });
}
