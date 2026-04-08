import { describe, it, expect } from 'vitest';
import { detectClockCorrections } from '../src/clock-correction.js';
import type { LogEntry } from '../src/types.js';

function makeEntry(timestamp: string, index: number): LogEntry {
  return {
    timestamp,
    pid: 1000,
    tid: 1000,
    level: 'I',
    tag: 'test',
    message: 'test message',
    raw: `${timestamp}  1000  1000 I test: test message`,
    lineNumber: index,
  };
}

function makeEntries(timestamps: string[]): LogEntry[] {
  return timestamps.map((ts, i) => makeEntry(ts, i));
}

describe('detectClockCorrections', () => {
  it('returns empty result for no entries', () => {
    const result = detectClockCorrections([]);
    expect(result.jumps).toHaveLength(0);
    expect(result.lastCorrectionIndex).toBe(-1);
    expect(result.preCorrectionCount).toBe(0);
  });

  it('returns empty result for normal sequential log', () => {
    const entries = makeEntries([
      '04-02 12:00:00.000',
      '04-02 12:00:01.000',
      '04-02 12:00:02.000',
      '04-02 12:05:00.000',
      '04-02 12:10:00.000',
      '04-02 12:15:00.000',
      '04-02 12:20:00.000',
      '04-02 12:25:00.000',
      '04-02 12:30:00.000',
      '04-02 12:35:00.000',
      '04-02 12:40:00.000',
      '04-02 12:45:00.000',
    ]);
    const result = detectClockCorrections(entries);
    expect(result.jumps).toHaveLength(0);
  });

  it('detects single forward jump (NTP sync after boot)', () => {
    // Simulates: boot with wrong time (02-25), then NTP corrects to 04-02
    const timestamps = [
      // 10 entries before jump (need MIN_ENTRIES_BEFORE_JUMP)
      '02-25 12:00:00.000',
      '02-25 12:00:01.000',
      '02-25 12:00:02.000',
      '02-25 12:00:03.000',
      '02-25 12:00:04.000',
      '02-25 12:00:05.000',
      '02-25 12:00:06.000',
      '02-25 12:00:07.000',
      '02-25 12:00:08.000',
      '02-25 12:00:09.000',
      // Jump to corrected time
      '04-02 12:42:05.000',
      '04-02 12:42:06.000',
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(1);
    expect(result.jumps[0].entryIndex).toBe(10);
    expect(result.jumps[0].fromTimestamp).toBe('02-25 12:00:09.000');
    expect(result.jumps[0].toTimestamp).toBe('04-02 12:42:05.000');
    expect(result.jumps[0].jumpMinutes).toBeGreaterThan(60);
    expect(result.preCorrectionCount).toBe(10);
  });

  it('detects multiple jumps (build date → NTP → NITZ)', () => {
    const timestamps = [
      // Pre-correction (wrong epoch time)
      '02-25 12:00:00.000',
      '02-25 12:00:01.000',
      '02-25 12:00:02.000',
      '02-25 12:00:03.000',
      '02-25 12:00:04.000',
      '02-25 12:00:05.000',
      '02-25 12:00:06.000',
      '02-25 12:00:07.000',
      '02-25 12:00:08.000',
      '02-25 12:00:09.000',
      // First jump: build date set as clock
      '04-02 12:42:05.000',
      '04-02 12:42:06.000',
      '04-02 12:42:07.000',
      '04-02 12:42:08.000',
      '04-02 12:42:09.000',
      '04-02 12:42:10.000',
      '04-02 12:42:11.000',
      '04-02 12:42:12.000',
      '04-02 12:42:13.000',
      '04-02 12:42:14.000',
      // Second jump: NITZ correction
      '04-02 21:18:54.000',
      '04-02 21:18:55.000',
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(2);
    expect(result.jumps[0].toTimestamp).toBe('04-02 12:42:05.000');
    expect(result.jumps[1].toTimestamp).toBe('04-02 21:18:54.000');
    expect(result.lastCorrectionIndex).toBe(20);
    expect(result.preCorrectionCount).toBe(20);
  });

  it('does not flag normal month boundary crossing', () => {
    const timestamps = [
      '01-31 23:58:00.000',
      '01-31 23:58:01.000',
      '01-31 23:58:02.000',
      '01-31 23:59:00.000',
      '01-31 23:59:01.000',
      '01-31 23:59:02.000',
      '01-31 23:59:03.000',
      '01-31 23:59:04.000',
      '01-31 23:59:05.000',
      '01-31 23:59:06.000',
      '02-01 00:00:01.000',
      '02-01 00:00:02.000',
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(0);
  });

  it('skips jumps in first few entries (cross-buffer interleaving)', () => {
    // First 5 entries from radio buffer at different time, then main buffer
    const timestamps = [
      '04-02 10:00:00.000',
      '04-02 10:00:01.000',
      '04-02 10:00:02.000',
      // Jump at index 3, but < MIN_ENTRIES_BEFORE_JUMP so ignored
      '04-02 21:00:00.000',
      '04-02 21:00:01.000',
      '04-02 21:00:02.000',
      '04-02 21:00:03.000',
      '04-02 21:00:04.000',
      '04-02 21:00:05.000',
      '04-02 21:00:06.000',
      '04-02 21:00:07.000',
      '04-02 21:00:08.000',
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(0);
  });
});
