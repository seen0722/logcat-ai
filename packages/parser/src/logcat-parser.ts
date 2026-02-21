import {
  LogEntry,
  LogLevel,
  LogcatAnomaly,
  LogcatAnomalyType,
  LogcatParseResult,
  Severity,
  TagClassification,
  TagStat,
} from './types.js';

// Standard logcat threadtime format:
// MM-DD HH:mm:ss.SSS  PID  TID LEVEL TAG: MESSAGE
// With -v uid format (Android 8+):
// MM-DD HH:mm:ss.SSS  UID  PID  TID LEVEL TAG: MESSAGE
const LOGCAT_LINE_RE =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s+(.*)/;
const LOGCAT_LINE_NO_UID_RE =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s+(.*)/;

// ============================================================
// Tag Classification
// ============================================================

const VENDOR_TAG_PATTERNS = /^(vendor|hal_|hw_|sensor|gnss|nfc|bluetooth|thermal|power|display|camera|audio_hw|gps|modem|ril|radio|wifi_hal)/i;
const VENDOR_TAG_KEYWORDS = /qti|qcom|mtk|mediatek|sprd|samsung|nxp|exynos|hisilicon|kirin|unisoc/i;

const FRAMEWORK_TAGS = new Set([
  'ActivityManager', 'WindowManager', 'PackageManager', 'SystemServer',
  'InputDispatcher', 'SurfaceFlinger', 'AudioFlinger', 'PowerManagerService',
  'ConnectivityService', 'NetworkController', 'WifiService', 'BluetoothAdapter',
  'LocationManagerService', 'TelephonyManager', 'StatusBarManagerService',
  'NotificationManagerService', 'AlarmManagerService', 'JobScheduler',
  'ContentResolver', 'AccountManagerService', 'DevicePolicyManager',
  'DisplayManagerService', 'InputMethodManagerService', 'AccessibilityManagerService',
  'AppOps', 'BatteryService', 'StorageManagerService', 'UsageStatsService',
  'Watchdog', 'Zygote', 'art', 'dalvikvm', 'AndroidRuntime',
  'ServiceManager', 'SystemUI', 'Binder', 'JavaBinder', 'BinderProxy',
  'InputReader', 'InputTransport', 'Looper', 'ActivityThread',
  'ActivityTaskManager', 'WindowManagerService', 'View', 'ViewRootImpl',
  'Choreographer', 'RenderThread', 'hwui', 'GC', 'StrictMode',
]);

/**
 * Classify a logcat tag into vendor, framework, or app.
 */
export function classifyTag(tag: string): TagClassification {
  if (FRAMEWORK_TAGS.has(tag)) return 'framework';
  if (VENDOR_TAG_PATTERNS.test(tag) || VENDOR_TAG_KEYWORDS.test(tag)) return 'vendor';
  return 'app';
}

/**
 * Compute top error tags (E/F level) with classification.
 * Returns top 20 tags sorted by frequency.
 */
export function computeTagStats(entries: LogEntry[]): TagStat[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.level === 'E' || entry.level === 'F') {
      counts.set(entry.tag, (counts.get(entry.tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({
      tag,
      count,
      classification: classifyTag(tag),
    }));
}

/**
 * Parse logcat text into structured entries and detect anomalies.
 */
export function parseLogcat(content: string): LogcatParseResult {
  const lines = content.split('\n');
  const entries: LogEntry[] = [];
  let parseErrors = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Try UID format first (4 numeric groups), then fallback to non-UID (3 numeric groups)
    const matchUid = line.match(LOGCAT_LINE_RE);
    const matchNoUid = matchUid ? null : line.match(LOGCAT_LINE_NO_UID_RE);
    const match = matchUid || matchNoUid;
    if (match) {
      if (matchUid) {
        // UID format: timestamp, uid, pid, tid, level, tag, message
        entries.push({
          timestamp: match[1],
          pid: parseInt(match[3], 10),
          tid: parseInt(match[4], 10),
          level: match[5] as LogLevel,
          tag: match[6].trim(),
          message: match[7],
          raw: line,
          lineNumber: i + 1,
        });
      } else {
        // Non-UID format: timestamp, pid, tid, level, tag, message
        entries.push({
          timestamp: match[1],
          pid: parseInt(match[2], 10),
          tid: parseInt(match[3], 10),
          level: match[4] as LogLevel,
          tag: match[5].trim(),
          message: match[6],
          raw: line,
          lineNumber: i + 1,
        });
      }
    } else {
      // Could be a continuation line or non-logcat line
      if (entries.length > 0 && (line.startsWith('\t') || line.startsWith('  '))) {
        // Append to previous entry's message
        entries[entries.length - 1].message += '\n' + line;
        entries[entries.length - 1].raw += '\n' + line;
      } else {
        parseErrors++;
      }
    }
  }

  const anomalies = detectAnomalies(entries);
  const tagStats = computeTagStats(entries);

  return {
    entries,
    anomalies,
    totalLines: lines.length,
    parsedLines: entries.length,
    parseErrors,
    tagStats,
  };
}

// ============================================================
// Anomaly Detection Rules
// ============================================================

interface AnomalyRule {
  type: LogcatAnomalyType;
  severity: Severity;
  match: (entry: LogEntry) => boolean;
  summarize: (entry: LogEntry) => string;
}

const ANOMALY_RULES: AnomalyRule[] = [
  {
    type: 'anr',
    severity: 'critical',
    match: (e) =>
      (e.tag === 'ActivityManager' && e.message.includes('ANR in')) ||
      (e.tag === 'ActivityManager' && e.message.includes('not responding')),
    summarize: (e) => {
      const m = e.message.match(/ANR in (.+?)(?:\s+\(|$)/);
      return m ? `ANR in ${m[1]}` : 'ANR detected';
    },
  },
  {
    type: 'fatal_exception',
    severity: 'critical',
    match: (e) =>
      e.tag === 'AndroidRuntime' && e.message.includes('FATAL EXCEPTION'),
    summarize: (e) => {
      const m = e.message.match(/FATAL EXCEPTION:\s*(.+)/);
      return m ? `Fatal Exception: ${m[1]}` : 'Fatal Exception';
    },
  },
  {
    type: 'native_crash',
    severity: 'critical',
    match: (e) =>
      e.tag === 'DEBUG' && (e.message.includes('*** ***') || e.message.includes('signal')),
    summarize: () => 'Native crash detected',
  },
  {
    type: 'system_server_crash',
    severity: 'critical',
    match: (e) =>
      e.tag === 'AndroidRuntime' &&
      e.message.includes('FATAL EXCEPTION') &&
      e.message.includes('system_server'),
    summarize: () => 'System server crash',
  },
  {
    type: 'oom',
    severity: 'critical',
    match: (e) =>
      (e.tag === 'ActivityManager' && e.message.includes('Out of memory')) ||
      (e.tag === 'lowmemorykiller' && e.message.includes('kill')) ||
      (e.tag === 'ActivityManager' && /Low on memory/.test(e.message)),
    summarize: (e) => {
      const m = e.message.match(/kill.*?(\S+).*?adj\s*(\d+)/);
      return m ? `OOM kill: ${m[1]} (adj=${m[2]})` : 'Out of memory event';
    },
  },
  {
    type: 'watchdog',
    severity: 'critical',
    match: (e) =>
      e.tag === 'Watchdog' &&
      (e.message.includes('WATCHDOG KILLING SYSTEM PROCESS') ||
        e.message.includes('Blocked in')),
    summarize: (e) => {
      const m = e.message.match(/Blocked in (.+)/);
      return m ? `Watchdog: blocked in ${m[1]}` : 'Watchdog triggered';
    },
  },
  {
    type: 'binder_timeout',
    severity: 'warning',
    match: (e) =>
      (e.tag === 'JavaBinder' && e.message.includes('Binder transaction timeout')) ||
      (e.tag === 'binder' && e.message.includes('timeout')) ||
      (e.tag.includes('Binder') && /\btimeout\b/i.test(e.message)),
    summarize: () => 'Binder transaction timeout',
  },
  {
    type: 'slow_operation',
    severity: 'warning',
    match: (e) =>
      (e.tag === 'Looper' && e.message.includes('Slow')) ||
      (e.tag === 'ActivityThread' && e.message.includes('Slow')) ||
      (e.tag === 'ContentResolver' && e.message.includes('Slow')),
    summarize: (e) => {
      const m = e.message.match(/Slow (\w+)/);
      return m ? `Slow operation: ${m[1]}` : 'Slow operation detected';
    },
  },
  {
    type: 'strict_mode',
    severity: 'info',
    match: (e) =>
      e.tag === 'StrictMode' &&
      (e.message.includes('violation') || e.message.includes('penalty')),
    summarize: (e) => {
      const m = e.message.match(/policy=(\d+)\s+violation=(\d+)/);
      return m
        ? `StrictMode violation (policy=${m[1]}, violation=${m[2]})`
        : 'StrictMode violation';
    },
  },
  {
    type: 'input_dispatching_timeout',
    severity: 'critical',
    match: (e) =>
      /Input dispatching timed out/i.test(e.message) ||
      (e.tag === 'InputDispatcher' && /timeout/i.test(e.message)),
    summarize: (e) => {
      const m = e.message.match(/timed out.*?(\S+\/\S+)/);
      return m ? `Input dispatching timeout: ${m[1]}` : 'Input dispatching timeout';
    },
  },
  {
    type: 'hal_service_death',
    severity: 'warning',
    match: (e) =>
      (/hwservicemanager/i.test(e.tag) && /died|restart/i.test(e.message)) ||
      (/HwServiceManager/i.test(e.tag) && /died|restart/i.test(e.message)) ||
      (e.tag === 'ServiceManager' && /service.*died/i.test(e.message)) ||
      (e.tag === 'servicemanager' && /service.*died/i.test(e.message)),
    summarize: (e) => {
      const m = e.message.match(/(?:service\s+)?['"]?(\S+?)['"]?\s+(?:has\s+)?died/i);
      return m ? `HAL service died: ${m[1]}` : 'HAL service died';
    },
  },
];

function detectAnomalies(entries: LogEntry[]): LogcatAnomaly[] {
  const anomalies: LogcatAnomaly[] = [];

  for (const entry of entries) {
    for (const rule of ANOMALY_RULES) {
      if (rule.match(entry)) {
        // Collect nearby entries (same pid, ±5 entries) for context
        const relatedEntries = collectRelatedEntries(entries, entry, 5);

        anomalies.push({
          type: rule.type,
          severity: rule.severity,
          timestamp: entry.timestamp,
          entries: relatedEntries,
          processName: extractProcessName(entry),
          pid: entry.pid,
          summary: rule.summarize(entry),
        });
        break; // one anomaly per entry
      }
    }
  }

  return deduplicateAnomalies(anomalies);
}

/**
 * Collect entries around a target entry for context.
 */
function collectRelatedEntries(
  allEntries: LogEntry[],
  target: LogEntry,
  window: number
): LogEntry[] {
  const idx = allEntries.indexOf(target);
  if (idx === -1) return [target];

  const start = Math.max(0, idx - window);
  const end = Math.min(allEntries.length, idx + window + 1);
  return allEntries.slice(start, end).filter(
    (e) => e.pid === target.pid || e === target
  );
}

/**
 * Extract process name from an ANR or crash log entry.
 */
function extractProcessName(entry: LogEntry): string | undefined {
  // "ANR in com.example.app (com.example.app/.MainActivity)"
  const anrMatch = entry.message.match(/ANR in (\S+)/);
  if (anrMatch) return anrMatch[1];

  // "Process: com.example.app"
  const procMatch = entry.message.match(/Process:\s*(\S+)/);
  if (procMatch) return procMatch[1];

  return undefined;
}

/**
 * Deduplicate anomalies that are too close in time and same type/pid.
 */
function deduplicateAnomalies(anomalies: LogcatAnomaly[]): LogcatAnomaly[] {
  if (anomalies.length <= 1) return anomalies;

  const result: LogcatAnomaly[] = [anomalies[0]];
  for (let i = 1; i < anomalies.length; i++) {
    const prev = result[result.length - 1];
    const curr = anomalies[i];

    // Same type + same pid within 1 second → deduplicate
    if (
      curr.type === prev.type &&
      curr.pid === prev.pid &&
      isWithinSeconds(prev.timestamp, curr.timestamp, 1)
    ) {
      // Merge entries
      prev.entries = [...prev.entries, ...curr.entries];
      continue;
    }
    result.push(curr);
  }
  return result;
}

function isWithinSeconds(ts1: string, ts2: string, seconds: number): boolean {
  const t1 = parseTimestamp(ts1);
  const t2 = parseTimestamp(ts2);
  if (t1 === null || t2 === null) return false;
  return Math.abs(t1 - t2) <= seconds * 1000;
}

function parseTimestamp(ts: string): number | null {
  // "MM-DD HH:mm:ss.SSS"
  const m = ts.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return null;
  // Use a fixed year since bugreport timestamps don't include year
  const d = new Date(2000, parseInt(m[1], 10) - 1, parseInt(m[2], 10),
    parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10));
  return d.getTime();
}
