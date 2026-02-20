import { AnalysisResult } from '@logcat-ai/parser';

/**
 * Simple in-memory store for analysis results.
 * Keyed by upload ID. Entries expire after 1 hour.
 */
class AnalysisStore {
  private store = new Map<string, { result: AnalysisResult; timestamp: number }>();
  private readonly ttlMs = 60 * 60 * 1000; // 1 hour

  set(id: string, result: AnalysisResult): void {
    this.store.set(id, { result, timestamp: Date.now() });
    this.cleanup();
  }

  get(id: string): AnalysisResult | undefined {
    const entry = this.store.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(id);
      return undefined;
    }
    return entry.result;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.timestamp > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }
}

export const analysisStore = new AnalysisStore();
