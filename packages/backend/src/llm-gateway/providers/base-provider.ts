import { LLMRequest, LLMResponse, StreamChunk, LLMProviderConfig } from '@logcat-ai/parser';

export interface LLMProvider {
  readonly id: string;
  readonly config: LLMProviderConfig;
  chat(req: LLMRequest): Promise<LLMResponse>;
  chatStream(req: LLMRequest): AsyncIterable<StreamChunk>;
  isAvailable(): Promise<boolean>;
}

/**
 * Shared helper: build a fetch request with timeout and error handling.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse an SSE / NDJSON stream into an async iterable of lines.
 * Handles both Web ReadableStream and Node.js Readable (from node-fetch / undici).
 */
export async function* readStreamLines(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream | AsyncIterable<Uint8Array>
): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  // If body has [Symbol.asyncIterator], use it directly (Node.js streams)
  if (Symbol.asyncIterator in body) {
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) yield trimmed;
      }
    }
  } else {
    // Web ReadableStream — use getReader()
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) yield trimmed;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Flush remaining
  if (buffer.trim()) yield buffer.trim();
}
