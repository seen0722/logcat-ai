import { describe, it, expect } from 'vitest';
import { buildInsightContexts, buildHALCrossReference } from '../src/llm-gateway/prompt-templates/context-builder.js';
import { AnalysisResult, InsightCard, LogcatAnomaly, KernelEvent } from '@logcat-ai/parser';

function makeBaseResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
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

function makeInsight(overrides: Partial<InsightCard> = {}): InsightCard {
  return {
    id: 'insight-1',
    severity: 'critical',
    category: 'anr',
    title: 'ANR in com.test.app',
    description: 'App not responding',
    source: 'logcat',
    ...overrides,
  };
}

function makeAnomaly(overrides: Partial<LogcatAnomaly> = {}): LogcatAnomaly {
  return {
    type: 'anr',
    severity: 'critical',
    timestamp: '01-15 10:00:00.000',
    entries: [
      {
        timestamp: '01-15 10:00:00.000', pid: 1234, tid: 1234,
        level: 'E', tag: 'ActivityManager', message: 'ANR in com.test.app',
        raw: 'E ActivityManager: ANR in com.test.app', lineNumber: 100,
      },
    ],
    processName: 'com.test.app',
    pid: 1234,
    summary: 'ANR in com.test.app',
    ...overrides,
  };
}

describe('buildInsightContexts', () => {
  it('should return empty array when no critical/warning insights', () => {
    const result = makeBaseResult({
      insights: [makeInsight({ severity: 'info' })],
    });
    const contexts = buildInsightContexts(result);
    expect(contexts).toHaveLength(0);
  });

  it('should include critical insights', () => {
    const result = makeBaseResult({
      insights: [makeInsight({ severity: 'critical' })],
    });
    const contexts = buildInsightContexts(result);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].insightId).toBe('insight-1');
  });

  it('should include warning insights', () => {
    const result = makeBaseResult({
      insights: [makeInsight({ severity: 'warning', id: 'w-1' })],
    });
    const contexts = buildInsightContexts(result);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].insightId).toBe('w-1');
  });

  it('should collect logcat anomaly logs for logcat-sourced insights', () => {
    const anomaly = makeAnomaly();
    const result = makeBaseResult({
      insights: [makeInsight({ source: 'logcat', title: 'ANR in com.test.app' })],
      logcatResult: {
        entries: [], anomalies: [anomaly],
        totalLines: 100, parsedLines: 100, parseErrors: 0,
      },
    });
    const contexts = buildInsightContexts(result);
    expect(contexts[0].anomalyLogs.length).toBeGreaterThan(0);
  });

  it('should collect kernel event context for kernel-sourced insights', () => {
    const kernelEvent: KernelEvent = {
      type: 'oom_kill',
      severity: 'critical',
      timestamp: 100.5,
      entries: [{
        timestamp: 100.5, level: '<3>', facility: 'kern',
        message: 'Out of memory: Kill process 1234', raw: '<3>[100.5] OOM kill',
      }],
      summary: 'OOM kill',
      details: {},
    };
    const result = makeBaseResult({
      insights: [makeInsight({
        source: 'kernel', category: 'memory', severity: 'critical',
        title: 'OOM Kill detected',
      })],
      kernelResult: {
        entries: [kernelEvent.entries[0]],
        events: [kernelEvent],
        totalLines: 10,
      },
    });
    const contexts = buildInsightContexts(result);
    expect(contexts[0].anomalyLogs.length).toBeGreaterThan(0);
  });

  it('should collect ANR context with full stack trace', () => {
    const anrAnalysis = {
      pid: 1234,
      processName: 'com.test.app',
      threads: [{
        name: 'main', priority: 5, tid: 1, state: 'Blocked' as const,
        daemon: false, stackFrames: [
          { className: 'com.test.Main', methodName: 'run', fileName: 'Main.java', lineNumber: 10, isNative: false, raw: 'at com.test.Main.run(Main.java:10)' },
          { className: 'com.test.Base', methodName: 'start', fileName: 'Base.java', lineNumber: 5, isNative: false, raw: 'at com.test.Base.start(Base.java:5)' },
        ],
        waitingOnLock: null, heldLocks: [], raw: '',
      }],
      mainThread: {
        thread: {
          name: 'main', priority: 5, tid: 1, state: 'Blocked' as const,
          daemon: false, stackFrames: [
            { className: 'com.test.Main', methodName: 'run', fileName: 'Main.java', lineNumber: 10, isNative: false, raw: 'at com.test.Main.run(Main.java:10)' },
            { className: 'com.test.Base', methodName: 'start', fileName: 'Base.java', lineNumber: 5, isNative: false, raw: 'at com.test.Base.start(Base.java:5)' },
          ],
          waitingOnLock: null, heldLocks: [], raw: '',
        },
        blockReason: 'lock_contention' as const,
        blockingChain: [],
        confidence: 'high' as const,
      },
      lockGraph: { nodes: [], edges: [] },
      deadlocks: { detected: false, cycles: [] },
      binderThreads: { total: 16, busy: 2, idle: 14, exhausted: false },
    };

    const result = makeBaseResult({
      insights: [makeInsight({ source: 'anr', title: 'ANR in com.test.app' })],
      anrAnalyses: [anrAnalysis],
      logcatResult: { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 },
    });
    const contexts = buildInsightContexts(result);
    expect(contexts[0].fullStackTrace).toContain('com.test.Main.run');
    expect(contexts[0].fullStackTrace).toContain('com.test.Base.start');
  });

  it('should collect temporal context for critical insights with timestamp', () => {
    const result = makeBaseResult({
      insights: [makeInsight({
        severity: 'critical',
        timestamp: '01-15 10:00:01.000',
        source: 'logcat',
      })],
      logcatResult: {
        entries: [
          {
            timestamp: '01-15 10:00:00.500', pid: 100, tid: 100,
            level: 'E', tag: 'Test', message: 'Error near ANR',
            raw: 'E Test: Error near ANR', lineNumber: 50,
          },
          {
            timestamp: '01-15 10:00:05.000', pid: 100, tid: 100,
            level: 'E', tag: 'Test', message: 'Error far from ANR',
            raw: 'E Test: Error far from ANR', lineNumber: 60,
          },
          {
            timestamp: '01-15 10:00:01.500', pid: 100, tid: 100,
            level: 'D', tag: 'Test', message: 'Debug log should be excluded',
            raw: 'D Test: Debug log', lineNumber: 55,
          },
        ],
        anomalies: [],
        totalLines: 100, parsedLines: 100, parseErrors: 0,
      },
    });
    const contexts = buildInsightContexts(result);
    // Should include the nearby error but not the far one or the debug level one
    expect(contexts[0].temporalContext).toContain('E Test: Error near ANR');
    expect(contexts[0].temporalContext).not.toContain('E Test: Error far from ANR');
    expect(contexts[0].temporalContext).not.toContain('D Test: Debug log');
  });

  it('should limit anomaly logs to 15 entries per anomaly', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      timestamp: '01-15 10:00:00.000', pid: 1234, tid: 1234,
      level: 'E' as const, tag: 'Test', message: `Entry ${i}`,
      raw: `E Test: Entry ${i}`, lineNumber: i,
    }));
    const anomaly = makeAnomaly({ entries });
    const result = makeBaseResult({
      insights: [makeInsight({ source: 'logcat' })],
      logcatResult: {
        entries: [], anomalies: [anomaly],
        totalLines: 100, parsedLines: 100, parseErrors: 0,
      },
    });
    const contexts = buildInsightContexts(result);
    expect(contexts[0].anomalyLogs.length).toBeLessThanOrEqual(15);
  });

  it('should handle cross-source insights', () => {
    const anomaly = makeAnomaly();
    const kernelEvent: KernelEvent = {
      type: 'oom_kill', severity: 'critical', timestamp: 100,
      entries: [{
        timestamp: 100, level: '<3>', facility: 'kern',
        message: 'OOM', raw: '<3>[100] OOM',
      }],
      summary: 'OOM kill', details: {},
    };
    const result = makeBaseResult({
      insights: [makeInsight({ source: 'cross', category: 'memory', title: 'OOM Kill and ANR' })],
      logcatResult: {
        entries: [], anomalies: [anomaly],
        totalLines: 0, parsedLines: 0, parseErrors: 0,
      },
      kernelResult: {
        entries: [kernelEvent.entries[0]],
        events: [kernelEvent],
        totalLines: 10,
      },
    });
    const contexts = buildInsightContexts(result);
    // Should have logs from both logcat and kernel
    expect(contexts[0].anomalyLogs.length).toBeGreaterThan(0);
  });
});

// ============================================================
// buildHALCrossReference
// ============================================================

describe('buildHALCrossReference', () => {
  it('should return empty array when no HAL status', () => {
    const result = makeBaseResult();
    const entries = buildHALCrossReference(result);
    expect(entries).toHaveLength(0);
  });

  it('should return empty array when no ANR binder targets', () => {
    const result = makeBaseResult({
      halStatus: {
        totalServices: 5,
        aliveCount: 5,
        nonResponsiveCount: 0,
        declaredCount: 0,
        nonResponsiveServices: [],
        declaredServices: [],
        families: [
          { familyName: 'android.hardware.gnss::IGnss', shortName: 'gnss', highestVersion: '2.0', highestStatus: 'alive', isVendor: false, isOem: false, versionCount: 3 },
        ],
        vendorIssueCount: 0,
        truncated: false,
      },
    });
    const entries = buildHALCrossReference(result);
    expect(entries).toHaveLength(0);
  });

  it('should cross-reference binder target with matching HAL family', () => {
    const result = makeBaseResult({
      halStatus: {
        totalServices: 10,
        aliveCount: 8,
        nonResponsiveCount: 1,
        declaredCount: 1,
        nonResponsiveServices: [],
        declaredServices: [],
        families: [
          { familyName: 'android.hardware.gnss::IGnss', shortName: 'gnss', highestVersion: '2.0', highestStatus: 'alive', isVendor: false, isOem: false, versionCount: 3 },
          { familyName: 'vendor.trimble.hardware.trmbkeypad::ITrmbKeypad', shortName: 'trmbkeypad', highestVersion: '1.0', highestStatus: 'non-responsive', isVendor: true, isOem: true, versionCount: 1 },
        ],
        vendorIssueCount: 1,
        truncated: false,
      },
      anrAnalyses: [{
        pid: 1234,
        processName: 'com.test.app',
        threads: [],
        mainThread: {
          thread: {
            name: 'main', priority: 5, tid: 1, state: 'Native' as const,
            daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '',
          },
          blockReason: 'slow_binder_call' as const,
          blockingChain: [],
          confidence: 'high' as const,
          binderTarget: {
            interfaceName: 'IGnss',
            packageName: 'android.hardware.gnss@2.0',
            method: 'start',
            callerClass: 'com.test.GnssService',
            callerMethod: 'startGnss',
          },
          suspectedBinderTargets: [{
            interfaceName: 'ITrmbKeypad',
            packageName: 'vendor.trimble.hardware.trmbkeypad@1.0',
            method: 'getService',
            callerClass: 'com.test.KeypadService',
            callerMethod: 'init',
            threadName: 'Binder:1234_3',
            threadState: 'Native',
          }],
        },
        lockGraph: { nodes: [], edges: [] },
        deadlocks: { detected: false, cycles: [] },
        binderThreads: { total: 16, busy: 2, idle: 14, exhausted: false },
      }],
    });

    const entries = buildHALCrossReference(result);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('IGnss');
    expect(entries[0]).toContain('alive');
    expect(entries[0]).toContain('highest=2.0');
    expect(entries[1]).toContain('ITrmbKeypad');
    expect(entries[1]).toContain('non-responsive');
    expect(entries[1]).toContain('[OEM]');
  });

  it('should mark binder target as "status unknown" when no matching family', () => {
    const result = makeBaseResult({
      halStatus: {
        totalServices: 5,
        aliveCount: 5,
        nonResponsiveCount: 0,
        declaredCount: 0,
        nonResponsiveServices: [],
        declaredServices: [],
        families: [
          { familyName: 'android.hardware.audio::IDevicesFactory', shortName: 'audio', highestVersion: '6.0', highestStatus: 'alive', isVendor: false, isOem: false, versionCount: 1 },
        ],
        vendorIssueCount: 0,
        truncated: false,
      },
      anrAnalyses: [{
        pid: 1234,
        processName: 'com.test.app',
        threads: [],
        mainThread: {
          thread: {
            name: 'main', priority: 5, tid: 1, state: 'Native' as const,
            daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '',
          },
          blockReason: 'slow_binder_call' as const,
          blockingChain: [],
          confidence: 'high' as const,
          binderTarget: {
            interfaceName: 'IGnss',
            packageName: 'android.hardware.gnss@2.0',
            method: 'start',
            callerClass: 'com.test.GnssService',
            callerMethod: 'startGnss',
          },
        },
        lockGraph: { nodes: [], edges: [] },
        deadlocks: { detected: false, cycles: [] },
        binderThreads: { total: 16, busy: 2, idle: 14, exhausted: false },
      }],
    });

    const entries = buildHALCrossReference(result);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('status unknown');
    expect(entries[0]).toContain('not found in lshal');
  });
});
