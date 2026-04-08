import type { LogEntry, ClockCorrectionResult, ClockJump } from './types.js';

const JUMP_THRESHOLD_MINUTES = 60;
const MIN_ENTRIES_BEFORE_JUMP = 10;

// Approximate days per month for minute calculation (no need for exact values)
const MONTH_DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Convert "MM-DD HH:mm:ss" to minutes since Jan 1 00:00.
 * Uses direct char slicing (no regex) for performance on 400K+ entries.
 */
function timestampToMinutes(ts: string): number {
  const month = (ts.charCodeAt(0) - 48) * 10 + (ts.charCodeAt(1) - 48);
  const day = (ts.charCodeAt(3) - 48) * 10 + (ts.charCodeAt(4) - 48);
  const hour = (ts.charCodeAt(6) - 48) * 10 + (ts.charCodeAt(7) - 48);
  const min = (ts.charCodeAt(9) - 48) * 10 + (ts.charCodeAt(10) - 48);

  // Sum days from previous months
  let totalDays = 0;
  for (let m = 1; m < month; m++) {
    totalDays += MONTH_DAYS[m];
  }
  totalDays += day - 1;

  return totalDays * 1440 + hour * 60 + min;
}

/**
 * Detect clock correction jumps in sorted logcat entries.
 *
 * Android devices may boot with an incorrect system clock (using build date
 * or epoch time) until NTP/NITZ corrects it. This creates timestamp jumps
 * in logcat that confuse users.
 *
 * Detection: scan consecutive entries for time gaps > 1 hour.
 * Skip the first few entries to avoid false positives from cross-buffer
 * interleaving after the multi-buffer sort.
 */
export function detectClockCorrections(entries: LogEntry[]): ClockCorrectionResult {
  const jumps: ClockJump[] = [];

  if (entries.length < MIN_ENTRIES_BEFORE_JUMP + 1) {
    return { jumps: [], lastCorrectionIndex: -1, preCorrectionCount: 0 };
  }

  let prevMinutes = timestampToMinutes(entries[0].timestamp);

  for (let i = 1; i < entries.length; i++) {
    const currMinutes = timestampToMinutes(entries[i].timestamp);
    let delta = currMinutes - prevMinutes;

    // Adjust for year-boundary wrap (e.g. 12-31 → 01-01)
    // A backward jump of ~365 days is actually a 1-day forward jump
    if (delta < -500_000) {
      // ~347 days backward = likely year wrap, actual forward ~18 days
      delta += 525_960; // 365.25 days in minutes
    }
    // Adjust for normal month-boundary wrap false positives
    // e.g. 01-31 23:59 → 02-01 00:01 looks like a backward jump
    // but is actually ~2 minutes forward
    if (delta < -40_000 && delta > -500_000) {
      delta += 43_200; // ~30 days in minutes
    }

    if (Math.abs(delta) > JUMP_THRESHOLD_MINUTES && i >= MIN_ENTRIES_BEFORE_JUMP) {
      jumps.push({
        entryIndex: i,
        fromTimestamp: entries[i - 1].timestamp,
        toTimestamp: entries[i].timestamp,
        jumpMinutes: delta,
      });
    }

    prevMinutes = currMinutes;
  }

  const lastCorrectionIndex = jumps.length > 0
    ? jumps[jumps.length - 1].entryIndex
    : -1;

  return {
    jumps,
    lastCorrectionIndex,
    preCorrectionCount: lastCorrectionIndex > 0 ? lastCorrectionIndex : 0,
  };
}
