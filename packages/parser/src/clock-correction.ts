import type { LogEntry, ClockCorrectionResult, ClockJump } from './types.js';

const JUMP_THRESHOLD_MINUTES = 60;
const MIN_ENTRIES_BEFORE_JUMP = 10;
// After a candidate jump, require this many of the next N entries to stay
// in the new time range (not bounce back). Ratio-based to handle interleaving.
const CONFIRM_WINDOW = 30;
const CONFIRM_RATIO = 0.8; // 80% of entries in window must stay in new range

const MONTH_DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Convert "MM-DD HH:mm:ss" to minutes since Jan 1 00:00.
 */
function timestampToMinutes(ts: string): number {
  const month = (ts.charCodeAt(0) - 48) * 10 + (ts.charCodeAt(1) - 48);
  const day = (ts.charCodeAt(3) - 48) * 10 + (ts.charCodeAt(4) - 48);
  const hour = (ts.charCodeAt(6) - 48) * 10 + (ts.charCodeAt(7) - 48);
  const min = (ts.charCodeAt(9) - 48) * 10 + (ts.charCodeAt(10) - 48);

  let totalDays = 0;
  for (let m = 1; m < month; m++) {
    totalDays += MONTH_DAYS[m];
  }
  totalDays += day - 1;

  return totalDays * 1440 + hour * 60 + min;
}

function computeDelta(prevMin: number, currMin: number): number {
  let delta = currMin - prevMin;
  if (delta < -500_000) delta += 525_960;
  if (delta < -40_000 && delta > -500_000) delta += 43_200;
  return delta;
}

/**
 * Detect clock correction jumps in sorted logcat entries.
 *
 * Strategy: find jumps > 1 hour, then confirm by checking that 80%+ of
 * the next 30 entries stay in the new time range. This filters out
 * cross-buffer interleaving artifacts where entries from different buffers
 * alternate between two close time ranges.
 */
export function detectClockCorrections(entries: LogEntry[]): ClockCorrectionResult {
  const jumps: ClockJump[] = [];

  if (entries.length < MIN_ENTRIES_BEFORE_JUMP + CONFIRM_WINDOW) {
    return { jumps: [], lastCorrectionIndex: -1, preCorrectionCount: 0 };
  }

  // Phase 1: Find candidate jumps
  const candidates: { index: number; delta: number }[] = [];
  let prevMinutes = timestampToMinutes(entries[0].timestamp);

  for (let i = 1; i < entries.length; i++) {
    const currMinutes = timestampToMinutes(entries[i].timestamp);
    const delta = computeDelta(prevMinutes, currMinutes);

    if (Math.abs(delta) > JUMP_THRESHOLD_MINUTES && i >= MIN_ENTRIES_BEFORE_JUMP) {
      candidates.push({ index: i, delta });
    }

    prevMinutes = currMinutes;
  }

  // Phase 2: Confirm each candidate
  for (const candidate of candidates) {
    const jumpIdx = candidate.index;
    const preJumpMinutes = timestampToMinutes(entries[jumpIdx - 1].timestamp);
    const postJumpMinutes = timestampToMinutes(entries[jumpIdx].timestamp);

    // Count how many of the next CONFIRM_WINDOW entries are closer to
    // post-jump time than pre-jump time
    const end = Math.min(jumpIdx + 1 + CONFIRM_WINDOW, entries.length);
    let nearPost = 0;
    let total = 0;
    for (let j = jumpIdx + 1; j < end; j++) {
      const jMin = timestampToMinutes(entries[j].timestamp);
      const distToPre = Math.abs(computeDelta(preJumpMinutes, jMin));
      const distToPost = Math.abs(computeDelta(postJumpMinutes, jMin));
      if (distToPost <= distToPre) nearPost++;
      total++;
    }

    if (total > 0 && nearPost / total >= CONFIRM_RATIO) {
      // Skip if too close to previous confirmed jump
      const lastJump = jumps[jumps.length - 1];
      if (lastJump && jumpIdx - lastJump.entryIndex < CONFIRM_WINDOW) continue;

      jumps.push({
        entryIndex: jumpIdx,
        fromTimestamp: entries[jumpIdx - 1].timestamp,
        toTimestamp: entries[jumpIdx].timestamp,
        jumpMinutes: candidate.delta,
      });
    }
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
