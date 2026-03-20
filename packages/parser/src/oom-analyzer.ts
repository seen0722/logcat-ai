import type {
  LogEntry,
  LogcatAnomaly,
  KernelEvent,
  KernelLogEntry,
  MemInfoSummary,
  OomAnalysisResult,
  OomSummary,
  OomProcessInfo,
  ReapedProcess,
  LowMemoryTrend,
  LmkKill,
} from './types.js';

// ============================================================
// Main entry point
// ============================================================

export function analyzeOom(
  logcatEntries: LogEntry[],
  logcatAnomalies: LogcatAnomaly[],
  kernelEvents: KernelEvent[],
  kernelEntries: KernelLogEntry[],
  memInfo?: MemInfoSummary,
  userDescription?: string,
): OomAnalysisResult {
  const targetApp = userDescription ? extractTargetApp(userDescription) : null;
  const userTimestamps = userDescription ? extractTimestamps(userDescription) : [];

  const topMemoryConsumers = parseMemoryDump(logcatEntries, targetApp);
  const reapedProcesses = parseReapedProcesses(logcatEntries, kernelEntries);
  const lowMemoryTrend = parseLowMemoryTrend(logcatEntries);
  const lmkKills = collectLmkKills(logcatAnomalies, kernelEvents);

  const hasOomAnomaly = logcatAnomalies.some((a) => a.type === 'oom');
  const hasKernelOomKill = kernelEvents.some((e) => e.type === 'oom_kill');
  const detected = hasOomAnomaly || hasKernelOomKill || reapedProcesses.length > 0;

  if (!detected) {
    return {
      detected: false,
      summary: null,
      topMemoryConsumers: [],
      reapedProcesses: [],
      lowMemoryTrend: { events: [], peakCachedCount: 0, minCachedCount: 0, firstTimestamp: null, lastTimestamp: null },
      lmkKills: [],
    };
  }

  const summary = buildOomSummary(
    logcatAnomalies, lowMemoryTrend, reapedProcesses, lmkKills,
    memInfo, userDescription ?? null, userTimestamps, targetApp,
  );

  return { detected, summary, topMemoryConsumers, reapedProcesses, lowMemoryTrend, lmkKills };
}

function buildOomSummary(
  anomalies: LogcatAnomaly[],
  trend: LowMemoryTrend,
  reaped: ReapedProcess[],
  lmkKills: LmkKill[],
  memInfo: MemInfoSummary | undefined,
  userDescription: string | null,
  userTimestamps: string[],
  targetApp: string | null,
): OomSummary {
  const oomAnomalies: LogcatAnomaly[] = [];
  for (const a of anomalies) {
    if (a.type === 'oom') oomAnomalies.push(a);
  }
  const lastOom = oomAnomalies[oomAnomalies.length - 1];

  const timestamp = lastOom?.timestamp ?? '';
  const triggerPid = lastOom?.pid ?? null;

  let pressureDurationSec = 0;
  const pressureDurationTruncated = trend.events.length > 0;
  if (trend.firstTimestamp && timestamp) {
    pressureDurationSec = diffTimestampSec(trend.firstTimestamp, timestamp);
  }

  return {
    timestamp,
    triggerPid,
    lmkCount: lmkKills.length,
    reapedCount: reaped.length,
    pressureDurationSec,
    pressureDurationTruncated,
    userDescription,
    userReportedTimestamps: userTimestamps,
    targetApp,
    totalRamKb: memInfo?.totalRamKb ?? null,
    freeRamKb: memInfo?.freeRamKb ?? null,
  };
}

function diffTimestampSec(a: string, b: string): number {
  const parse = (ts: string): number => {
    const m = ts.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return 0;
    const [, mo, d, h, mi, s] = m.map(Number);
    return ((mo * 30 + d) * 86400) + (h * 3600) + (mi * 60) + s;
  };
  return Math.abs(parse(b) - parse(a));
}

// ============================================================
// Low on memory dump parser
// ============================================================

/**
 * Parse the "Low on memory:" dump from ActivityManager.
 * Format: "  ntv   ??   61110: surfaceflinger (   32,056K memtrack) (pid 1200) native"
 */
export function parseMemoryDump(entries: LogEntry[], targetApp?: string | null): OomProcessInfo[] {
  const results: OomProcessInfo[] = [];
  let inDump = false;

  const dumpLineRe = /^\s*(ntv|per|sys|vis|prcp|bfg|cch|hvy|prev|home|svcb|svc|rcvr|top|fore|btop)\s+(\d+|\?\?)\s+(\d+):\s+(\S+)\s+(?:\(\s*([\d,]+)K\s+memtrack\)\s+)?\(pid\s+(\d+)\)\s+(\S+)/;

  for (const entry of entries) {
    if (entry.tag === 'ActivityManager' && /Low on memory/.test(entry.message)) {
      inDump = true;
      continue;
    }
    if (inDump && entry.tag === 'ActivityManager') {
      const m = entry.message.match(dumpLineRe);
      if (m) {
        const name = m[4];
        results.push({
          name,
          adjCategory: m[1],
          adjScore: m[2] === '??' ? null : parseInt(m[2], 10),
          pssKb: parseInt(m[3], 10),
          memtrackKb: m[5] ? parseInt(m[5].replace(/,/g, ''), 10) : 0,
          pid: parseInt(m[6], 10),
          type: m[7],
          isTarget: targetApp ? name.includes(targetApp) : false,
        });
      } else {
        inDump = false;
      }
    } else if (inDump) {
      inDump = false;
    }
  }

  return results;
}

// ============================================================
// oom_reaper parser
// ============================================================

const REAP_RE = /reaped process (\d+) \(([^)]+)\),\s*now anon-rss:(\d+)kB,\s*file-rss:(\d+)kB/;

export function parseReapedProcesses(
  logcatEntries: LogEntry[],
  kernelEntries: KernelLogEntry[],
): ReapedProcess[] {
  const results: ReapedProcess[] = [];

  for (const entry of logcatEntries) {
    if (entry.tag !== 'oom_reaper') continue;
    const m = entry.message.match(REAP_RE);
    if (m) {
      results.push({
        timestamp: entry.timestamp,
        pid: parseInt(m[1], 10),
        name: m[2],
        anonRssKb: parseInt(m[3], 10),
        fileRssKb: parseInt(m[4], 10),
      });
    }
  }

  for (const entry of kernelEntries) {
    const m = entry.message.match(REAP_RE);
    if (m) {
      results.push({
        timestamp: String(entry.timestamp),
        pid: parseInt(m[1], 10),
        name: m[2],
        anonRssKb: parseInt(m[3], 10),
        fileRssKb: parseInt(m[4], 10),
      });
    }
  }

  return results;
}

// ============================================================
// am_low_memory trend parser
// ============================================================

export function parseLowMemoryTrend(entries: LogEntry[]): LowMemoryTrend {
  const events: LowMemoryTrend['events'] = [];

  for (const entry of entries) {
    if (entry.tag !== 'am_low_memory') continue;
    const count = parseInt(entry.message.trim(), 10);
    if (!isNaN(count)) {
      events.push({ timestamp: entry.timestamp, cachedProcessCount: count });
    }
  }

  if (events.length === 0) {
    return { events, peakCachedCount: 0, minCachedCount: 0, firstTimestamp: null, lastTimestamp: null };
  }

  let peak = 0;
  let min = Infinity;
  for (const e of events) {
    if (e.cachedProcessCount > peak) peak = e.cachedProcessCount;
    if (e.cachedProcessCount < min) min = e.cachedProcessCount;
  }

  return {
    events,
    peakCachedCount: peak,
    minCachedCount: min,
    firstTimestamp: events[0].timestamp,
    lastTimestamp: events[events.length - 1].timestamp,
  };
}

// ============================================================
// LMK kill collector (merge logcat + kernel)
// ============================================================

const LMK_KILL_RE = /kill.*?'([^']+)'.*?\((\d+)\).*?adj\s*(\d+)/;

export function collectLmkKills(
  anomalies: LogcatAnomaly[],
  kernelEvents: KernelEvent[],
): LmkKill[] {
  const kills: LmkKill[] = [];

  for (const anomaly of anomalies) {
    if (anomaly.type !== 'oom') continue;
    for (const entry of anomaly.entries) {
      if (entry.tag === 'lowmemorykiller' && entry.message.includes('kill')) {
        const m = entry.message.match(LMK_KILL_RE);
        if (m) {
          kills.push({
            timestamp: entry.timestamp,
            processName: m[1],
            pid: parseInt(m[2], 10),
            adjScore: parseInt(m[3], 10),
            source: 'logcat',
          });
        }
      }
    }
  }

  for (const event of kernelEvents) {
    if (event.type !== 'oom_kill' && event.type !== 'lowmemory_killer') continue;
    const rawName = event.details.processName;
    const name = rawName ? String(rawName) : event.summary.replace(/^(OOM killed|LMK killed):\s*/, '') || 'unknown';
    const rawPid = event.details.pid;
    const pid = typeof rawPid === 'number' ? rawPid : parseInt(String(rawPid ?? 0), 10);
    kills.push({
      timestamp: String(event.timestamp),
      processName: name,
      pid,
      adjScore: null,
      source: 'kernel',
    });
  }

  // Sort by timestamp and deduplicate (same pid within 1 second)
  kills.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const deduped: LmkKill[] = [];
  for (const kill of kills) {
    const isDup = deduped.some((prev) =>
      prev.pid === kill.pid && Math.abs(parseFloat(prev.timestamp) - parseFloat(kill.timestamp)) < 1
    );
    if (!isDup) deduped.push(kill);
  }

  return deduped;
}

// ============================================================
// User description helpers
// ============================================================

const PACKAGE_NAME_RE = /\bcom\.\w+(?:\.\w+)+/;

export function extractTargetApp(description: string): string | null {
  if (!description) return null;
  const m = description.match(PACKAGE_NAME_RE);
  return m ? m[0] : null;
}

const TIMESTAMP_PATTERNS = [
  /\b(\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\b/g,
  /\b(\d{2}:\d{2}:\d{2})\b/g,
  /\b(\d{2}:\d{2})\b/g,
];

export function extractTimestamps(description: string): string[] {
  if (!description) return [];
  const found = new Set<string>();

  for (const pattern of TIMESTAMP_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(description)) !== null) {
      found.add(m[1]);
    }
  }

  return [...found];
}
