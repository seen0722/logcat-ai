const BACKEND_URL = 'http://localhost:8000';

interface SearchParams {
  q?: string;
  source?: 'logcat' | 'kernel';
  tag?: string;
  level?: string;
  pid?: string;
  buffer?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  export?: boolean;
}

interface SearchResult {
  entries: unknown[];
  totalMatches: number;
  showing: number;
  method: string;
  [key: string]: unknown;
}

export async function searchAPI(id: string, params: SearchParams = {}): Promise<SearchResult> {
  const url = new URL(`${BACKEND_URL}/api/search/${id}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<SearchResult>;
}

export async function searchLogcatAPI(id: string, params: Omit<SearchParams, 'source'> = {}) {
  return searchAPI(id, { ...params });
}

export async function searchKernelAPI(id: string, params: Omit<SearchParams, 'source'> = {}) {
  return searchAPI(id, { ...params, source: 'kernel' });
}

export async function clearRawDataStore(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/_test/clear-raw-store/${id}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Clear raw store failed: ${res.status} ${await res.text()}`);
}

export async function fetchHistoryAPI(limit = 10) {
  const res = await fetch(`${BACKEND_URL}/api/history?limit=${limit}`);
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
  return res.json();
}
