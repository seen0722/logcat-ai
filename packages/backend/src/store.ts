import { AnalysisResult } from '@logcat-ai/parser';
import { historyStore } from './history-store.js';

/**
 * In-memory store for analysis results with SQLite persistence fallback.
 * The in-memory cache has a 1-hour TTL; SQLite storage is permanent.
 */
class AnalysisStore {
  private store = new Map<string, { result: AnalysisResult; timestamp: number }>();
  private uploadMeta = new Map<string, { filename: string; fileSize: number }>();
  private readonly ttlMs = 60 * 60 * 1000; // 1 hour

  /**
   * Store result in memory cache only (no SQLite persistence).
   * Used for intermediate updates (e.g., after deep analysis merge).
   */
  set(id: string, result: AnalysisResult): void {
    this.store.set(id, { result, timestamp: Date.now() });
    this.cleanup();
  }

  /**
   * Store result in both memory cache and SQLite database.
   * Used for the initial save that includes file metadata.
   */
  setWithMeta(id: string, result: AnalysisResult, filename: string, fileSize: number): void {
    this.store.set(id, { result, timestamp: Date.now() });
    historyStore.save(id, filename, fileSize, result);
    this.cleanup();
  }

  /**
   * Get a result from memory cache, falling back to SQLite if not cached.
   */
  get(id: string): AnalysisResult | undefined {
    const entry = this.store.get(id);
    if (entry) {
      if (Date.now() - entry.timestamp > this.ttlMs) {
        this.store.delete(id);
      } else {
        return entry.result;
      }
    }
    // Fallback to SQLite
    return historyStore.get(id);
  }

  /**
   * Store upload metadata (original filename and file size) for later use.
   */
  setUploadMeta(id: string, filename: string, fileSize: number): void {
    this.uploadMeta.set(id, { filename, fileSize });
  }

  /**
   * Retrieve upload metadata for a given id.
   */
  getUploadMeta(id: string): { filename: string; fileSize: number } | undefined {
    return this.uploadMeta.get(id);
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
