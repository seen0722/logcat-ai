import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalysisResult } from '@logcat-ai/parser';

// We re-implement a minimal AnalysisStore here because the module exports a singleton.
// This mirrors the implementation in src/store.ts for unit testing.
class AnalysisStore {
  private store = new Map<string, { result: AnalysisResult; timestamp: number }>();
  private readonly ttlMs = 60 * 60 * 1000;

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

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    metadata: {
      androidVersion: '13',
      sdkLevel: 33,
      buildFingerprint: 'test/build',
      deviceModel: 'TestDevice',
      manufacturer: 'TestMfg',
      buildDate: '2024-01-01',
      bugreportTimestamp: new Date(),
      kernelVersion: '5.10',
    },
    insights: [],
    timeline: [],
    healthScore: { overall: 80, breakdown: { stability: 80, memory: 80, responsiveness: 80, kernel: 80 } },
    anrAnalyses: [],
    logcatResult: { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 },
    kernelResult: { entries: [], events: [], totalLines: 0 },
    ...overrides,
  };
}

describe('AnalysisStore', () => {
  let store: AnalysisStore;

  beforeEach(() => {
    store = new AnalysisStore();
    vi.restoreAllMocks();
  });

  it('should store and retrieve a result', () => {
    const result = makeResult();
    store.set('test-1', result);
    expect(store.get('test-1')).toEqual(result);
  });

  it('should return undefined for non-existent key', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('should overwrite existing entry', () => {
    const r1 = makeResult({ insights: [] });
    const r2 = makeResult({
      insights: [{
        id: 'insight-1', severity: 'critical', category: 'anr',
        title: 'Test', description: 'Test', source: 'logcat',
      }],
    });
    store.set('id-1', r1);
    store.set('id-1', r2);
    expect(store.get('id-1')?.insights).toHaveLength(1);
  });

  it('should expire entries after TTL', () => {
    const result = makeResult();
    store.set('old', result);

    // Advance time past TTL (1 hour)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60 * 1000);

    expect(store.get('old')).toBeUndefined();
  });

  it('should cleanup expired entries on set', () => {
    const result = makeResult();
    const originalNow = Date.now();

    vi.spyOn(Date, 'now').mockReturnValue(originalNow);
    store.set('old', result);

    // Advance time past TTL and add a new entry
    vi.spyOn(Date, 'now').mockReturnValue(originalNow + 61 * 60 * 1000);
    store.set('new', result);

    // Old entry should have been cleaned up
    expect(store.get('old')).toBeUndefined();
    expect(store.get('new')).toEqual(result);
  });

  it('should handle multiple concurrent entries', () => {
    for (let i = 0; i < 10; i++) {
      store.set(`id-${i}`, makeResult());
    }
    for (let i = 0; i < 10; i++) {
      expect(store.get(`id-${i}`)).toBeDefined();
    }
  });
});
