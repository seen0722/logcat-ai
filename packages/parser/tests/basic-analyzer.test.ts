import { describe, it, expect } from 'vitest';
import { analyzeBasic, BasicAnalyzerInput, aggregateTimelineEvents } from '../src/basic-analyzer.js';
import { BugreportMetadata, LogcatParseResult, KernelParseResult, ANRTraceAnalysis, TimelineEvent } from '../src/types.js';

function makeMetadata(overrides?: Partial<BugreportMetadata>): BugreportMetadata {
  return {
    androidVersion: '14',
    sdkLevel: 34,
    buildFingerprint: 'google/raven/raven:14/UP1A.231005.007/10754064:userdebug/dev-keys',
    deviceModel: 'Pixel 6 Pro',
    manufacturer: 'Google',
    buildDate: '2024-01-01',
    bugreportTimestamp: new Date('2024-01-15T10:00:00Z'),
    kernelVersion: '5.10.149-android13-4-00003-g2d1234abcd-ab9876543',
    ...overrides,
  };
}

function emptyLogcat(): LogcatParseResult {
  return { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 };
}

function emptyKernel(): KernelParseResult {
  return { entries: [], events: [], totalLines: 0 };
}

function makeInput(overrides?: Partial<BasicAnalyzerInput>): BasicAnalyzerInput {
  return {
    metadata: makeMetadata(),
    logcatResult: emptyLogcat(),
    kernelResult: emptyKernel(),
    anrAnalyses: [],
    ...overrides,
  };
}

describe('analyzeBasic', () => {
  it('should return empty insights for clean system', () => {
    const result = analyzeBasic(makeInput());
    expect(result.insights).toHaveLength(0);
    expect(result.timeline).toHaveLength(0);
    expect(result.healthScore.overall).toBe(100);
    expect(result.healthScore.breakdown.stability).toBe(100);
    expect(result.healthScore.breakdown.memory).toBe(100);
    expect(result.healthScore.breakdown.responsiveness).toBe(100);
    expect(result.healthScore.breakdown.kernel).toBe(100);
  });

  it('should generate insights from logcat anomalies', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [
        {
          type: 'anr',
          severity: 'critical',
          timestamp: '01-15 10:00:00.000',
          entries: [{ timestamp: '01-15 10:00:00.000', pid: 1234, tid: 1234, level: 'E', tag: 'ActivityManager', message: 'ANR in com.example.app', raw: 'raw line', lineNumber: 1 }],
          processName: 'com.example.app',
          pid: 1234,
          summary: 'ANR in com.example.app',
        },
        {
          type: 'strict_mode',
          severity: 'info',
          timestamp: '01-15 09:00:00.000',
          entries: [],
          summary: 'StrictMode violation',
        },
      ],
      totalLines: 100,
      parsedLines: 90,
      parseErrors: 10,
    };

    const result = analyzeBasic(makeInput({ logcatResult }));
    expect(result.insights).toHaveLength(2);
    // Critical first
    expect(result.insights[0].severity).toBe('critical');
    expect(result.insights[0].category).toBe('anr');
    expect(result.insights[0].source).toBe('logcat');
    // Info second
    expect(result.insights[1].severity).toBe('info');
  });

  it('should generate insights from ANR analyses', () => {
    const anrAnalyses: ANRTraceAnalysis[] = [
      {
        pid: 1234,
        processName: 'com.example.app',
        timestamp: '2024-01-15 10:00:00.000',
        threads: [],
        mainThread: {
          thread: {
            name: 'main', priority: 5, tid: 1, state: 'Blocked', daemon: false,
            stackFrames: [{ className: 'com.example.Foo', methodName: 'bar', fileName: 'Foo.java', lineNumber: 10, isNative: false, raw: 'at com.example.Foo.bar(Foo.java:10)' }],
            waitingOnLock: { address: '0xabc', className: 'Object', heldByTid: 2 },
            heldLocks: [],
            raw: '',
          },
          blockReason: 'lock_contention',
          blockingChain: [{ name: 'Worker', priority: 5, tid: 2, state: 'Runnable', daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '' }],
          confidence: 'high',
        },
        lockGraph: { nodes: [], edges: [] },
        deadlocks: { detected: false, cycles: [] },
        binderThreads: { total: 4, busy: 1, idle: 3, exhausted: false },
      },
    ];

    const result = analyzeBasic(makeInput({ anrAnalyses }));
    expect(result.insights.length).toBeGreaterThanOrEqual(1);
    const anrInsight = result.insights.find((i) => i.source === 'anr');
    expect(anrInsight).toBeDefined();
    expect(anrInsight!.title).toContain('Lock Contention');
    expect(anrInsight!.description).toContain('Blocking chain');
    expect(anrInsight!.description).toContain('"Worker"');
  });

  it('should generate deadlock insights', () => {
    const anrAnalyses: ANRTraceAnalysis[] = [
      {
        pid: 1234,
        processName: 'com.example.app',
        threads: [],
        mainThread: {
          thread: { name: 'main', priority: 5, tid: 1, state: 'Blocked', daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '' },
          blockReason: 'deadlock',
          blockingChain: [],
          confidence: 'high',
        },
        lockGraph: { nodes: [], edges: [] },
        deadlocks: {
          detected: true,
          cycles: [{
            threads: [
              { name: 'main', priority: 5, tid: 1, state: 'Blocked', daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '' },
              { name: 'Worker', priority: 5, tid: 2, state: 'Blocked', daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '' },
            ],
            locks: [],
          }],
        },
        binderThreads: { total: 2, busy: 0, idle: 2, exhausted: false },
      },
    ];

    const result = analyzeBasic(makeInput({ anrAnalyses }));
    const deadlockInsights = result.insights.filter((i) => i.title.includes('Deadlock'));
    expect(deadlockInsights.length).toBeGreaterThanOrEqual(1);
    expect(deadlockInsights.some((i) => i.severity === 'critical')).toBe(true);
  });

  it('should generate insights from kernel events', () => {
    const kernelResult: KernelParseResult = {
      entries: [{ timestamp: 100, level: '<3>', facility: '', message: 'Out of memory: Killed process 1234 (app)', raw: '<3>[  100.000000] Out of memory: Killed process 1234 (app)' }],
      events: [{
        type: 'oom_kill',
        severity: 'critical',
        timestamp: 100,
        entries: [{ timestamp: 100, level: '<3>', facility: '', message: 'Out of memory: Killed process 1234 (app)', raw: '<3>[  100.000000] Out of memory: Killed process 1234 (app)' }],
        summary: 'OOM killed: app (pid=1234)',
        details: { pid: 1234, processName: 'app' },
      }],
      totalLines: 1,
    };

    const result = analyzeBasic(makeInput({ kernelResult }));
    const kernelInsights = result.insights.filter((i) => i.source === 'kernel');
    expect(kernelInsights).toHaveLength(1);
    expect(kernelInsights[0].source).toBe('kernel');
    expect(kernelInsights[0].category).toBe('memory');
    expect(kernelInsights[0].severity).toBe('critical');
  });

  it('should sort insights by severity (critical > warning > info)', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [
        { type: 'strict_mode', severity: 'info', timestamp: '01-15 10:00:00.000', entries: [], summary: 'StrictMode' },
        { type: 'fatal_exception', severity: 'critical', timestamp: '01-15 10:01:00.000', entries: [], summary: 'Fatal' },
        { type: 'binder_timeout', severity: 'warning', timestamp: '01-15 10:02:00.000', entries: [], summary: 'Binder timeout' },
      ],
      totalLines: 3,
      parsedLines: 3,
      parseErrors: 0,
    };

    const result = analyzeBasic(makeInput({ logcatResult }));
    expect(result.insights[0].severity).toBe('critical');
    expect(result.insights[1].severity).toBe('warning');
    expect(result.insights[2].severity).toBe('info');
  });

  it('should assign unique IDs to insights', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [
        { type: 'anr', severity: 'critical', timestamp: '01-15 10:00:00.000', entries: [], summary: 'ANR 1' },
        { type: 'anr', severity: 'critical', timestamp: '01-15 10:01:00.000', entries: [], summary: 'ANR 2' },
      ],
      totalLines: 2,
      parsedLines: 2,
      parseErrors: 0,
    };

    const result = analyzeBasic(makeInput({ logcatResult }));
    const ids = result.insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Timeline
  it('should build timeline from all sources', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [
        { type: 'anr', severity: 'critical', timestamp: '01-15 10:00:00.000', entries: [], processName: 'app', summary: 'ANR in app' },
      ],
      totalLines: 1,
      parsedLines: 1,
      parseErrors: 0,
    };

    const kernelResult: KernelParseResult = {
      entries: [],
      events: [{
        type: 'oom_kill', severity: 'critical', timestamp: 50.123,
        entries: [], summary: 'OOM kill', details: {},
      }],
      totalLines: 1,
    };

    const anrAnalyses: ANRTraceAnalysis[] = [{
      pid: 1, processName: 'app', timestamp: '2024-01-15 10:00:00.000',
      threads: [],
      mainThread: {
        thread: { name: 'main', priority: 5, tid: 1, state: 'Blocked', daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '' },
        blockReason: 'lock_contention',
        blockingChain: [],
        confidence: 'high',
      },
      lockGraph: { nodes: [], edges: [] },
      deadlocks: { detected: false, cycles: [] },
      binderThreads: { total: 0, busy: 0, idle: 0, exhausted: false },
    }];

    const result = analyzeBasic(makeInput({ logcatResult, kernelResult, anrAnalyses }));
    expect(result.timeline.length).toBe(3);
    expect(result.timeline.some((e) => e.source === 'logcat')).toBe(true);
    expect(result.timeline.some((e) => e.source === 'kernel')).toBe(true);
    expect(result.timeline.some((e) => e.source === 'anr')).toBe(true);
  });

  // Health Score
  it('should deduct health score for critical issues', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [
        { type: 'system_server_crash', severity: 'critical', timestamp: '', entries: [], summary: 'crash' },
        { type: 'oom', severity: 'critical', timestamp: '', entries: [], summary: 'oom' },
        { type: 'anr', severity: 'critical', timestamp: '', entries: [], summary: 'anr' },
      ],
      totalLines: 3,
      parsedLines: 3,
      parseErrors: 0,
    };

    const kernelResult: KernelParseResult = {
      entries: [],
      events: [
        { type: 'kernel_panic', severity: 'critical', timestamp: 100, entries: [], summary: 'panic', details: {} },
      ],
      totalLines: 1,
    };

    const result = analyzeBasic(makeInput({ logcatResult, kernelResult }));
    expect(result.healthScore.breakdown.stability).toBeLessThan(100);
    expect(result.healthScore.breakdown.memory).toBeLessThan(100);
    expect(result.healthScore.breakdown.responsiveness).toBeLessThan(100);
    expect(result.healthScore.breakdown.kernel).toBeLessThan(100);
    expect(result.healthScore.overall).toBeLessThan(70);
  });

  it('should apply frequency-based damping for repeated events', () => {
    const kernelResult: KernelParseResult = {
      entries: [],
      events: [
        { type: 'kernel_panic', severity: 'critical', timestamp: 1, entries: [], summary: 'p1', details: {} },
        { type: 'kernel_panic', severity: 'critical', timestamp: 2, entries: [], summary: 'p2', details: {} },
        { type: 'kernel_panic', severity: 'critical', timestamp: 3, entries: [], summary: 'p3', details: {} },
        { type: 'kernel_panic', severity: 'critical', timestamp: 4, entries: [], summary: 'p4', details: {} },
      ],
      totalLines: 4,
    };

    const result = analyzeBasic(makeInput({ kernelResult }));
    // With damping: 1st=-40, 2nd=-20, 3rd=-10 → capped at 60 max per type
    // kernel score should be 100 - 60 = 40 (not 0)
    expect(result.healthScore.breakdown.kernel).toBe(40);
    // stability also gets damped kernel_panic deductions
    expect(result.healthScore.breakdown.stability).toBe(40);
    // Both should be > 0 thanks to damping
    expect(result.healthScore.breakdown.kernel).toBeGreaterThan(0);
    expect(result.healthScore.breakdown.stability).toBeGreaterThan(0);
  });

  it('should clamp health scores to 0 with diverse severe events', () => {
    const kernelResult: KernelParseResult = {
      entries: [],
      events: [
        { type: 'kernel_panic', severity: 'critical', timestamp: 1, entries: [], summary: 'p1', details: {} },
        { type: 'thermal_shutdown', severity: 'critical', timestamp: 2, entries: [], summary: 'ts', details: {} },
        { type: 'watchdog_reset', severity: 'critical', timestamp: 3, entries: [], summary: 'wr', details: {} },
      ],
      totalLines: 3,
    };

    const result = analyzeBasic(makeInput({ kernelResult }));
    // kernel_panic=-40, thermal_shutdown=-30, watchdog_reset=-30 = -100 → 0
    expect(result.healthScore.breakdown.kernel).toBe(0);
  });

  it('should treat idle_main_thread ANR as info severity', () => {
    const anrAnalyses: ANRTraceAnalysis[] = [{
      pid: 1, processName: 'app',
      threads: [],
      mainThread: {
        thread: { name: 'main', priority: 5, tid: 1, state: 'Native', daemon: false, stackFrames: [], waitingOnLock: null, heldLocks: [], raw: '' },
        blockReason: 'idle_main_thread',
        blockingChain: [],
        confidence: 'low',
      },
      lockGraph: { nodes: [], edges: [] },
      deadlocks: { detected: false, cycles: [] },
      binderThreads: { total: 2, busy: 0, idle: 2, exhausted: false },
    }];

    const result = analyzeBasic(makeInput({ anrAnalyses }));
    const anrInsight = result.insights.find((i) => i.source === 'anr');
    expect(anrInsight!.severity).toBe('info');
  });

  it('should produce reasonable kernel score with many SELinux denials', () => {
    // Simulate 270 SELinux denials — previously scored kernel=0
    const selinuxEvents = Array.from({ length: 270 }, (_, i) => ({
      type: 'selinux_denial' as const,
      severity: 'info' as const,
      timestamp: i,
      entries: [{ timestamp: i, level: '<5>', facility: '', message: `avc: denied`, raw: `avc: denied ${i}` }],
      summary: `SELinux denial ${i}`,
      details: { scontext: 'u:r:hal_audio:s0', tcontext: 'u:object_r:proc:s0' },
    }));

    const kernelResult: KernelParseResult = {
      entries: [],
      events: selinuxEvents,
      totalLines: 270,
    };

    const result = analyzeBasic(makeInput({ kernelResult }));
    // With damping (max 15 per type for selinux_denial), kernel score should be ~85
    expect(result.healthScore.breakdown.kernel).toBeGreaterThanOrEqual(80);
    expect(result.healthScore.breakdown.kernel).toBeLessThanOrEqual(100);
  });

  it('should produce reasonable responsiveness score with multiple ANRs', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: Array.from({ length: 10 }, (_, i) => ({
        type: 'anr' as const,
        severity: 'critical' as const,
        timestamp: `01-15 10:0${i}:00.000`,
        entries: [],
        processName: 'com.example.app',
        summary: `ANR ${i}`,
      })),
      totalLines: 10,
      parsedLines: 10,
      parseErrors: 0,
    };

    const result = analyzeBasic(makeInput({ logcatResult }));
    // With damping (max 50 per type), responsiveness should be ~50 not 0
    expect(result.healthScore.breakdown.responsiveness).toBeGreaterThanOrEqual(45);
    expect(result.healthScore.breakdown.responsiveness).toBeLessThanOrEqual(60);
  });

  it('should preserve metadata in result', () => {
    const metadata = makeMetadata({ deviceModel: 'Pixel 8' });
    const result = analyzeBasic(makeInput({ metadata }));
    expect(result.metadata.deviceModel).toBe('Pixel 8');
  });
});

// ============================================================
// aggregateTimelineEvents
// ============================================================

describe('aggregateTimelineEvents', () => {
  function makeEvent(overrides?: Partial<TimelineEvent>): TimelineEvent {
    return {
      timestamp: '01-15 10:00:00.000',
      source: 'kernel',
      severity: 'info',
      label: 'SELinux denial: scontext=u:r:hal_audio:s0 tcontext=u:object_r:proc:s0',
      ...overrides,
    };
  }

  it('should aggregate 3 adjacent events with same label+source+severity', () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: 'boot+3808s' }),
      makeEvent({ timestamp: 'boot+3850s' }),
      makeEvent({ timestamp: 'boot+3902s' }),
    ];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].timeRange).toBe('boot+3808s ~ boot+3902s');
    expect(result[0].label).toBe(events[0].label);
    expect(result[0].details).toBeUndefined();
  });

  it('should not aggregate events with different labels', () => {
    const events: TimelineEvent[] = [
      makeEvent({ label: 'SELinux denial A' }),
      makeEvent({ label: 'SELinux denial B' }),
      makeEvent({ label: 'SELinux denial C' }),
    ];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(3);
    result.forEach((e) => {
      expect(e.count).toBeUndefined();
      expect(e.timeRange).toBeUndefined();
    });
  });

  it('should not aggregate events with different sources', () => {
    const events: TimelineEvent[] = [
      makeEvent({ source: 'kernel' }),
      makeEvent({ source: 'logcat' }),
      makeEvent({ source: 'kernel' }),
    ];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(3);
  });

  it('should not aggregate events with different severities', () => {
    const events: TimelineEvent[] = [
      makeEvent({ severity: 'info' }),
      makeEvent({ severity: 'warning' }),
      makeEvent({ severity: 'info' }),
    ];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(3);
  });

  it('should handle mixed events: aggregate duplicates, keep unique', () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: '01-15 09:00:00.000', severity: 'critical', label: 'ANR in app', source: 'logcat' }),
      makeEvent({ timestamp: 'boot+100s', label: 'SELinux denial X' }),
      makeEvent({ timestamp: 'boot+101s', label: 'SELinux denial X' }),
      makeEvent({ timestamp: 'boot+102s', label: 'SELinux denial X' }),
      makeEvent({ timestamp: 'boot+200s', label: 'OOM kill', severity: 'critical' }),
      makeEvent({ timestamp: 'boot+300s', label: 'SELinux denial Y' }),
      makeEvent({ timestamp: 'boot+301s', label: 'SELinux denial Y' }),
    ];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(4);
    // First: standalone critical ANR
    expect(result[0].label).toBe('ANR in app');
    expect(result[0].count).toBeUndefined();
    // Second: aggregated SELinux X
    expect(result[1].label).toBe('SELinux denial X');
    expect(result[1].count).toBe(3);
    expect(result[1].timeRange).toBe('boot+100s ~ boot+102s');
    // Third: standalone OOM
    expect(result[2].label).toBe('OOM kill');
    expect(result[2].count).toBeUndefined();
    // Fourth: aggregated SELinux Y
    expect(result[3].label).toBe('SELinux denial Y');
    expect(result[3].count).toBe(2);
  });

  it('should not set count or timeRange for single events', () => {
    const events: TimelineEvent[] = [makeEvent()];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBeUndefined();
    expect(result[0].timeRange).toBeUndefined();
  });

  it('should return empty array for empty input', () => {
    expect(aggregateTimelineEvents([])).toHaveLength(0);
  });

  it('should preserve details from the first event', () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: 'boot+1s', details: 'first details' }),
      makeEvent({ timestamp: 'boot+2s', details: 'second details' }),
    ];
    const result = aggregateTimelineEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].details).toBe('first details');
  });
});
