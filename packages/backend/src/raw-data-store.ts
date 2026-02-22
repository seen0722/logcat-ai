import {
  LogEntry,
  KernelParseResult,
  ANRTraceAnalysis,
  BugreportSection,
} from '@logcat-ai/parser';

/**
 * Raw parsed data stored for tool access during agentic chat.
 * Separate from AnalysisResult — this stores the raw entries that
 * tools can search/filter against.
 */
export interface RawData {
  logcatEntries: LogEntry[];
  kernelResult: KernelParseResult;
  anrAnalyses: ANRTraceAnalysis[];
  sections: BugreportSection[];
}

/**
 * In-memory store for raw parsed data, keyed by analysis ID.
 * TTL matches the analysis store (1 hour).
 */
class RawDataStore {
  private store = new Map<string, { data: RawData; timestamp: number }>();
  private readonly ttlMs = 60 * 60 * 1000; // 1 hour

  set(id: string, data: RawData): void {
    this.store.set(id, { data, timestamp: Date.now() });
    this.cleanup();
  }

  get(id: string): RawData | undefined {
    const entry = this.store.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(id);
      return undefined;
    }
    return entry.data;
  }

  delete(id: string): void {
    this.store.delete(id);
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

export const rawDataStore = new RawDataStore();
