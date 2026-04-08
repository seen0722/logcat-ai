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

/** Generate N sequential timestamps starting from base (incrementing by 1 second) */
function seqTimestamps(base: string, count: number): string[] {
  const result: string[] = [];
  // Parse "MM-DD HH:mm:ss.SSS"
  const parts = base.match(/(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!parts) return result;
  let sec = parseInt(parts[5], 10);
  let min = parseInt(parts[4], 10);
  let hour = parseInt(parts[3], 10);
  const prefix = `${parts[1]}-${parts[2]}`;
  for (let i = 0; i < count; i++) {
    result.push(`${prefix} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${parts[6]}`);
    sec++;
    if (sec >= 60) { sec = 0; min++; }
    if (min >= 60) { min = 0; hour++; }
  }
  return result;
}

describe('detectClockCorrections', () => {
  it('returns empty result for no entries', () => {
    const result = detectClockCorrections([]);
    expect(result.jumps).toHaveLength(0);
    expect(result.lastCorrectionIndex).toBe(-1);
    expect(result.preCorrectionCount).toBe(0);
  });

  it('returns empty result for normal sequential log', () => {
    const entries = makeEntries(seqTimestamps('04-02 12:00:00.000', 50));
    const result = detectClockCorrections(entries);
    expect(result.jumps).toHaveLength(0);
  });

  it('detects single forward jump (NTP sync after boot)', () => {
    const timestamps = [
      ...seqTimestamps('02-25 12:00:00.000', 15),  // 15 entries before jump
      ...seqTimestamps('04-02 12:42:05.000', 25),  // 25 entries after (enough for confirmation)
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(1);
    expect(result.jumps[0].entryIndex).toBe(15);
    expect(result.jumps[0].fromTimestamp).toBe('02-25 12:00:14.000');
    expect(result.jumps[0].toTimestamp).toBe('04-02 12:42:05.000');
    expect(result.jumps[0].jumpMinutes).toBeGreaterThan(60);
    expect(result.preCorrectionCount).toBe(15);
  });

  it('detects multiple jumps (build date → NTP → NITZ)', () => {
    const timestamps = [
      ...seqTimestamps('02-25 12:00:00.000', 15),  // pre-correction
      ...seqTimestamps('04-02 12:42:05.000', 35),  // after first jump (enough gap for 2nd)
      ...seqTimestamps('04-02 21:18:54.000', 35),  // after second jump (NITZ)
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(2);
    expect(result.jumps[0].toTimestamp).toBe('04-02 12:42:05.000');
    expect(result.jumps[1].toTimestamp).toBe('04-02 21:18:54.000');
    expect(result.lastCorrectionIndex).toBe(50);
    expect(result.preCorrectionCount).toBe(50);
  });

  it('does not flag normal month boundary crossing', () => {
    const timestamps = [
      ...seqTimestamps('01-31 23:59:30.000', 15),
      ...seqTimestamps('02-01 00:00:00.000', 25),
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(0);
  });

  it('skips jumps in first few entries (cross-buffer interleaving)', () => {
    const timestamps = [
      '04-02 10:00:00.000',
      '04-02 10:00:01.000',
      '04-02 10:00:02.000',
      // Jump at index 3, but < MIN_ENTRIES_BEFORE_JUMP so ignored
      ...seqTimestamps('04-02 21:00:00.000', 30),
    ];
    const result = detectClockCorrections(makeEntries(timestamps));
    expect(result.jumps).toHaveLength(0);
  });

  it('ignores cross-buffer interleaving (back-and-forth timestamps)', () => {
    // Simulates: entries from two buffers with different time ranges interleaved
    // after sort. Buffer A is around 04-05, Buffer B is around 04-06.
    // After sort they alternate: A, B, A, B — creating apparent 24h jumps.
    const timestamps: string[] = [];
    // 15 entries of normal 04-05 logs
    timestamps.push(...seqTimestamps('04-05 10:00:00.000', 15));
    // Then entries alternating between 04-05 and 04-06 (cross-buffer merge)
    for (let i = 0; i < 40; i++) {
      if (i % 2 === 0) {
        timestamps.push(`04-06 10:00:${String(i).padStart(2, '0')}.000`);
      } else {
        timestamps.push(`04-05 10:00:${String(30 + i).padStart(2, '0')}.000`);
      }
    }
    const result = detectClockCorrections(makeEntries(timestamps));
    // Should NOT detect jumps — alternating pattern means <80% stay in new range
    expect(result.jumps).toHaveLength(0);
  });
});
