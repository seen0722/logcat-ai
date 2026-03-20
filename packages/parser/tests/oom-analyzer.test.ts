import { describe, it, expect } from 'vitest';
import { parseMemoryDump, parseReapedProcesses, parseLowMemoryTrend, collectLmkKills, extractTargetApp, extractTimestamps, analyzeOom } from '../src/oom-analyzer.js';
import type { LogEntry, LogcatAnomaly, KernelEvent, KernelLogEntry } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    timestamp: '02-09 15:43:09.272',
    pid: 1508,
    tid: 8005,
    level: 'I',
    tag: 'ActivityManager',
    message: '',
    raw: '',
    lineNumber: 1,
    ...overrides,
  };
}

describe('parseMemoryDump', () => {
  it('should parse Low on memory dump lines', () => {
    const entries: LogEntry[] = [
      makeEntry({ message: 'Low on memory:', lineNumber: 1 }),
      makeEntry({ message: '  ntv   ??   61110: surfaceflinger (   32,056K memtrack) (pid 1200) native', lineNumber: 2 }),
      makeEntry({ message: '  per  900    8523: com.example.app (pid 2345) persistent', lineNumber: 3 }),
      makeEntry({ message: '  cch  500    5000: com.google.android.tts (pid 3456) cached', lineNumber: 4 }),
    ];
    const result = parseMemoryDump(entries);
    expect(result).toHaveLength(3);

    expect(result[0]).toMatchObject({
      name: 'surfaceflinger',
      adjCategory: 'ntv',
      adjScore: null,
      pssKb: 61110,
      memtrackKb: 32056,
      pid: 1200,
      type: 'native',
      isTarget: false,
    });

    expect(result[1]).toMatchObject({
      name: 'com.example.app',
      adjCategory: 'per',
      adjScore: 900,
      pssKb: 8523,
      pid: 2345,
      type: 'persistent',
    });

    expect(result[2]).toMatchObject({
      adjCategory: 'cch',
      adjScore: 500,
      pssKb: 5000,
      type: 'cached',
    });
  });

  it('should return empty array when no Low on memory dump exists', () => {
    const entries: LogEntry[] = [
      makeEntry({ message: 'Some other message' }),
    ];
    expect(parseMemoryDump(entries)).toEqual([]);
  });

  it('should mark target app with isTarget=true', () => {
    const entries: LogEntry[] = [
      makeEntry({ message: 'Low on memory:', lineNumber: 1 }),
      makeEntry({ message: '  per  900    8523: com.example.app (pid 2345) persistent', lineNumber: 2 }),
    ];
    const result = parseMemoryDump(entries, 'com.example.app');
    expect(result[0].isTarget).toBe(true);
  });
});

describe('parseReapedProcesses', () => {
  it('should parse oom_reaper entries from logcat', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'oom_reaper',
        message: 'reaped process 4322 (gedprovisioning), now anon-rss:0kB, file-rss:0kB, shmem-rss:560kB',
        timestamp: '02-09 15:37:54.691',
      }),
      makeEntry({
        tag: 'oom_reaper',
        message: 'reaped process 4117 (viceentitlement), now anon-rss:0kB, file-rss:128kB, shmem-rss:576kB',
        timestamp: '02-09 15:37:54.976',
      }),
    ];
    const result = parseReapedProcesses(entries, []);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      pid: 4322,
      name: 'gedprovisioning',
      anonRssKb: 0,
      fileRssKb: 0,
    });
    expect(result[1]).toMatchObject({
      pid: 4117,
      name: 'viceentitlement',
      fileRssKb: 128,
    });
  });

  it('should also parse oom_reaper from kernel entries', () => {
    const kernelEntries: KernelLogEntry[] = [
      {
        timestamp: 719522.462,
        level: '<6>',
        facility: '0',
        message: 'oom_reaper: reaped process 5519 (ackageinstaller), now anon-rss:0kB, file-rss:0kB, shmem-rss:488kB',
        raw: '',
      },
    ];
    const result = parseReapedProcesses([], kernelEntries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pid: 5519, name: 'ackageinstaller' });
  });
});

describe('parseLowMemoryTrend', () => {
  it('should parse am_low_memory events from events buffer', () => {
    const entries: LogEntry[] = [
      makeEntry({ tag: 'am_low_memory', message: '31', timestamp: '02-09 15:38:02.902', buffer: 'events' }),
      makeEntry({ tag: 'am_low_memory', message: '30', timestamp: '02-09 15:38:03.025', buffer: 'events' }),
      makeEntry({ tag: 'am_low_memory', message: '21', timestamp: '02-09 15:44:48.700', buffer: 'events' }),
    ];
    const result = parseLowMemoryTrend(entries);
    expect(result.events).toHaveLength(3);
    expect(result.peakCachedCount).toBe(31);
    expect(result.minCachedCount).toBe(21);
    expect(result.firstTimestamp).toBe('02-09 15:38:02.902');
    expect(result.lastTimestamp).toBe('02-09 15:44:48.700');
  });

  it('should return empty trend when no am_low_memory events', () => {
    const result = parseLowMemoryTrend([]);
    expect(result.events).toHaveLength(0);
    expect(result.peakCachedCount).toBe(0);
    expect(result.minCachedCount).toBe(0);
    expect(result.firstTimestamp).toBeNull();
  });
});

describe('collectLmkKills', () => {
  it('should merge logcat and kernel LMK kills', () => {
    const anomalies: LogcatAnomaly[] = [
      {
        type: 'oom',
        severity: 'critical',
        timestamp: '02-09 15:43:09.272',
        entries: [
          makeEntry({
            tag: 'lowmemorykiller',
            message: "kill 'com.example.app' (1234), adj 900",
            timestamp: '02-09 15:43:09.272',
          }),
        ],
        pid: 1234,
        summary: 'OOM kill: com.example.app (adj=900)',
      },
    ];
    const kernelEvents: KernelEvent[] = [
      {
        type: 'lowmemory_killer',
        severity: 'warning',
        timestamp: 719522.462,
        entries: [{ timestamp: 719522.462, level: '<4>', facility: '0', message: "lowmemorykiller: kill 'com.other' (5678), adj 800", raw: '' }],
        summary: 'LMK killed: com.other',
        details: {},
      },
    ];
    const result = collectLmkKills(anomalies, kernelEvents);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some(k => k.processName === 'com.example.app')).toBe(true);
    expect(result.some(k => k.processName === 'com.other')).toBe(true);
  });
});

describe('extractTargetApp', () => {
  it('should extract package name from description', () => {
    expect(extractTargetApp('com.trimble.empower OOM')).toBe('com.trimble.empower');
  });

  it('should extract from sentence context', () => {
    expect(extractTargetApp('app com.google.android.apps.turbo OOM bugreport')).toBe('com.google.android.apps.turbo');
  });

  it('should return null when no package name found', () => {
    expect(extractTargetApp('OOM happened')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractTargetApp('')).toBeNull();
  });
});

describe('extractTimestamps', () => {
  it('should extract MM-DD HH:MM format', () => {
    const result = extractTimestamps('problem at 02-09 15:40');
    expect(result).toContain('02-09 15:40');
  });

  it('should extract HH:MM:SS format', () => {
    const result = extractTimestamps('15:43:09 OOM');
    expect(result).toContain('15:43:09');
  });

  it('should extract HH:MM format', () => {
    const result = extractTimestamps('around 15:40 froze');
    expect(result).toContain('15:40');
  });

  it('should return empty for no timestamps', () => {
    expect(extractTimestamps('just a description')).toEqual([]);
  });
});

describe('analyzeOom', () => {
  it('should detect OOM when oom anomaly exists', () => {
    const entries: LogEntry[] = [
      makeEntry({ tag: 'am_low_memory', message: '31', timestamp: '02-09 15:38:02.902', buffer: 'events' }),
      makeEntry({ tag: 'am_low_memory', message: '21', timestamp: '02-09 15:44:48.700', buffer: 'events' }),
      makeEntry({ tag: 'ActivityManager', message: 'Low on memory:', timestamp: '02-09 15:43:09.272' }),
      makeEntry({ tag: 'ActivityManager', message: '  ntv   ??   61110: surfaceflinger (   32,056K memtrack) (pid 1200) native', timestamp: '02-09 15:43:09.272' }),
      makeEntry({ tag: 'oom_reaper', message: 'reaped process 4322 (gedprovisioning), now anon-rss:0kB, file-rss:0kB, shmem-rss:560kB', timestamp: '02-09 15:37:54.691' }),
    ];
    const anomalies: LogcatAnomaly[] = [{
      type: 'oom',
      severity: 'critical',
      timestamp: '02-09 15:43:09.272',
      entries: [makeEntry({ tag: 'ActivityManager', message: 'Low on memory:', pid: 1508 })],
      pid: 1508,
      summary: 'Out of memory event',
    }];

    const result = analyzeOom(entries, anomalies, [], [], undefined, 'com.trimble.empower at 15:40');

    expect(result.detected).toBe(true);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.targetApp).toBe('com.trimble.empower');
    expect(result.summary!.userReportedTimestamps).toContain('15:40');
    expect(result.topMemoryConsumers).toHaveLength(1);
    expect(result.topMemoryConsumers[0].name).toBe('surfaceflinger');
    expect(result.reapedProcesses).toHaveLength(1);
    expect(result.lowMemoryTrend.events).toHaveLength(2);
  });

  it('should return detected=false when no OOM indicators exist', () => {
    const result = analyzeOom([], [], [], []);
    expect(result.detected).toBe(false);
    expect(result.summary).toBeNull();
  });

  it('should detect OOM from kernel oom_kill events alone', () => {
    const kernelEvents: KernelEvent[] = [{
      type: 'oom_kill',
      severity: 'critical',
      timestamp: 100.0,
      entries: [],
      summary: 'OOM killed: com.example.app',
      details: { processName: 'com.example.app', pid: 1234 },
    }];
    const result = analyzeOom([], [], kernelEvents, []);
    expect(result.detected).toBe(true);
    expect(result.lmkKills).toHaveLength(1);
  });
});
