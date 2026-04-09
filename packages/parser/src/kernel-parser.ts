import {
  KernelLogEntry,
  KernelEvent,
  KernelEventType,
  KernelParseResult,
  Severity,
} from './types.js';

// dmesg format variations:
// <level>[ timestamp] message
// <level>[ timestamp][Tpid] message
// <level>[ timestamp][ Tpid] message
// <level>[ timestamp][  Cpid] message
// [ timestamp] message
const DMESG_LINE_RE = /^(?:<(\d+)>)?\s*\[\s*(\d+\.\d+)\](?:\[[\s\w]+\])?\s+(.*)/;

// logcat -b kernel -v threadtime format:
// MM-DD HH:mm:ss.SSS  uid  pid  tid  level  tag  : message
const LOGCAT_KERNEL_RE = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+\S+\s+\d+\s+\d+\s+([VDIWEF])\s+(.*)/;

// Logcat level → kernel level mapping
const LOGCAT_LEVEL_TO_KERNEL: Record<string, string> = {
  F: '<0>',
  E: '<3>',
  W: '<4>',
  I: '<6>',
  D: '<7>',
  V: '<7>',
};

/**
 * Detect whether the content is dmesg or logcat -b kernel format.
 * Checks first 10 non-empty lines and compares match counts.
 */
function detectFormat(lines: string[]): 'dmesg' | 'logcat' {
  let dmesgCount = 0;
  let logcatCount = 0;
  let checked = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('--------- beginning of')) continue;
    if (DMESG_LINE_RE.test(line)) dmesgCount++;
    if (LOGCAT_KERNEL_RE.test(line)) logcatCount++;
    checked++;
    if (checked >= 10) break;
  }

  return logcatCount > dmesgCount ? 'logcat' : 'dmesg';
}

/**
 * Parse MM-DD HH:mm:ss.SSS timestamp to milliseconds since year start.
 */
function parseLogcatTimestampMs(ts: string): number {
  const parts = ts.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!parts) return 0;
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  const min = parseInt(parts[4], 10);
  const sec = parseInt(parts[5], 10);
  const ms = parseInt(parts[6], 10);
  // Use a fixed year (2026) to get consistent day-of-year calculation
  const d = new Date(2026, month, day, hour, min, sec, ms);
  return d.getTime();
}

/**
 * Parse kernel log (dmesg or logcat -b kernel) into structured entries and detect events.
 */
export function parseKernelLog(content: string): KernelParseResult {
  const lines = content.split('\n');
  const format = detectFormat(lines);

  const parsed = format === 'logcat' ? parseLogcatKernel(lines) : parseDmesgKernel(lines);

  const events = detectKernelEvents(parsed.entries);

  return {
    entries: parsed.entries,
    events,
    totalLines: lines.length,
    parseErrors: parsed.parseErrors,
    format: parsed.entries.length > 0 ? format : undefined,
  };
}

/**
 * Parse standard dmesg format lines.
 */
function parseDmesgKernel(lines: string[]): { entries: KernelLogEntry[]; parseErrors: number } {
  const entries: KernelLogEntry[] = [];
  let parseErrors = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(DMESG_LINE_RE);
    if (match) {
      const rawPriority = match[1] ?? '';
      const timestamp = parseFloat(match[2]);
      const message = match[3];

      // Syslog priority = facility*8 + severity; extract severity (lower 3 bits)
      const severity = rawPriority ? parseInt(rawPriority, 10) & 7 : -1;

      entries.push({
        timestamp,
        level: severity >= 0 ? `<${severity}>` : '',
        facility: '',
        message,
        raw: line,
      });
    } else {
      parseErrors++;
    }
  }

  return { entries, parseErrors };
}

/**
 * Parse logcat -b kernel -v threadtime format lines.
 * Timestamps are converted to seconds-since-first-entry to match dmesg convention.
 *
 * Clock correction handling: when the system clock jumps (NTP/NITZ sync),
 * logcat timestamps jump too. We detect jumps > 1 hour and re-base the offset
 * so timestamps remain monotonically increasing instead of going negative.
 */
function parseLogcatKernel(lines: string[]): { entries: KernelLogEntry[]; parseErrors: number } {
  const entries: KernelLogEntry[] = [];
  let baseMs = -1;
  let prevMs = -1;
  let offsetSec = 0; // accumulated offset from clock correction jumps
  let parseErrors = 0;

  const JUMP_THRESHOLD_MS = 3600_000; // 1 hour

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('--------- beginning of')) continue;

    const match = line.match(LOGCAT_KERNEL_RE);
    if (match) {
      const tsStr = match[1];
      const logcatLevel = match[2];
      const message = match[3];

      const ms = parseLogcatTimestampMs(tsStr);
      if (baseMs < 0) {
        baseMs = ms;
        prevMs = ms;
      }

      // Detect clock correction jump: timestamp changes by > 1 hour
      const deltaMs = ms - prevMs;
      if (Math.abs(deltaMs) > JUMP_THRESHOLD_MS && entries.length > 0) {
        // Clock was corrected. Set offset so the new timestamps continue
        // from where the previous sequence left off (last entry's timestamp + small gap)
        const lastTs = entries[entries.length - 1].timestamp;
        offsetSec = lastTs + 0.001; // small gap to maintain ordering
        baseMs = ms;
      }

      const timestamp = offsetSec + (ms - baseMs) / 1000;
      prevMs = ms;

      entries.push({
        timestamp,
        level: LOGCAT_LEVEL_TO_KERNEL[logcatLevel] ?? '',
        facility: '',
        message,
        raw: line,
      });
    } else {
      parseErrors++;
    }
  }

  return { entries, parseErrors };
}

// ============================================================
// Kernel Event Detection Rules
// ============================================================

interface KernelRule {
  type: KernelEventType;
  severity: Severity;
  match: (entry: KernelLogEntry) => boolean;
  summarize: (entry: KernelLogEntry) => string;
  extractDetails: (entry: KernelLogEntry) => Record<string, string | number>;
}

const KERNEL_RULES: KernelRule[] = [
  {
    type: 'kernel_panic',
    severity: 'critical',
    match: (e) => /Kernel panic/i.test(e.message),
    summarize: (e) => {
      const m = e.message.match(/Kernel panic - (.+)/);
      return m ? `Kernel panic: ${m[1]}` : 'Kernel panic';
    },
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'oom_kill',
    severity: 'critical',
    match: (e) =>
      /Out of memory: Kill(ed)? process/i.test(e.message) ||
      /oom-kill/i.test(e.message),
    summarize: (e) => {
      const m = e.message.match(/Kill(?:ed)? process (\d+) \((.+?)\)/);
      return m ? `OOM killed: ${m[2]} (pid=${m[1]})` : 'OOM kill event';
    },
    extractDetails: (e) => {
      const pidMatch = e.message.match(/process (\d+)/);
      const nameMatch = e.message.match(/\((.+?)\)/);
      return {
        pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
        processName: nameMatch?.[1] ?? 'unknown',
      };
    },
  },
  {
    type: 'lowmemory_killer',
    severity: 'warning',
    match: (e) =>
      // Only match actual LMK kill events, not lmkd init/config messages
      /lowmemorykiller.*Kill\s/i.test(e.message) ||
      /lmkd.*kill/i.test(e.message) ||
      /lowmemory_kill/i.test(e.message),
    summarize: (e) => {
      const m = e.message.match(/[Kk]ill.*?'(.+?)'/);
      return m ? `LMK killed: ${m[1]}` : 'Low memory killer event';
    },
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'kswapd_active',
    severity: 'warning',
    match: (e) => /kswapd\d*/.test(e.message) && /running|active|wake/i.test(e.message),
    summarize: () => 'kswapd active (memory pressure)',
    extractDetails: () => ({}),
  },
  {
    type: 'driver_error',
    severity: 'warning',
    match: (e) =>
      /\berror\b/i.test(e.message) &&
      (/driver/i.test(e.message) || /firmware/i.test(e.message) || /hardware/i.test(e.message)),
    summarize: (e) => {
      const truncated = e.message.slice(0, 100);
      return `Driver error: ${truncated}`;
    },
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'gpu_error',
    severity: 'warning',
    match: (e) =>
      /gpu/i.test(e.message) &&
      (/fault|error|hang|timeout/i.test(e.message)),
    summarize: (e) => {
      const truncated = e.message.slice(0, 100);
      return `GPU error: ${truncated}`;
    },
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'thermal_shutdown',
    severity: 'critical',
    match: (e) =>
      /thermal/i.test(e.message) &&
      (/shutdown|critical|emergency/i.test(e.message)),
    summarize: () => 'Thermal shutdown triggered',
    extractDetails: (e) => {
      const tempMatch = e.message.match(/(\d+)\s*(?:°?C|celsius|mC)/i);
      const details: Record<string, string | number> = {};
      if (tempMatch) details.temperature = parseInt(tempMatch[1], 10);
      return details;
    },
  },
  {
    type: 'watchdog_reset',
    severity: 'critical',
    match: (e) =>
      /watchdog/i.test(e.message) &&
      (/reset|bark|bite|triggered|expired/i.test(e.message)),
    summarize: () => 'Watchdog reset triggered',
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'thermal_throttling',
    severity: 'warning',
    match: (e) =>
      /thermal/i.test(e.message) &&
      /throttl/i.test(e.message),
    summarize: (e) => {
      const zone = e.message.match(/zone\s+(\S+)/i)?.[1] ?? '';
      return zone ? `Thermal throttling: ${zone}` : 'Thermal throttling detected';
    },
    extractDetails: (e) => {
      const tempMatch = e.message.match(/(\d+)\s*(?:°?C|celsius|mC)/i);
      const details: Record<string, string | number> = {};
      if (tempMatch) details.temperature = parseInt(tempMatch[1], 10);
      return details;
    },
  },
  {
    type: 'storage_io_error',
    severity: 'warning',
    match: (e) =>
      /mmc\d*.*error/i.test(e.message) ||
      /EXT4-fs error/i.test(e.message) ||
      /I\/O error.*dev\s+(sd|mmc|nvme)/i.test(e.message) ||
      /Buffer I\/O error/i.test(e.message),
    summarize: (e) => {
      const truncated = e.message.slice(0, 100);
      return `Storage I/O error: ${truncated}`;
    },
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'suspend_resume_error',
    severity: 'warning',
    match: (e) =>
      /suspend.*abort/i.test(e.message) ||
      /resume.*fail/i.test(e.message) ||
      /PM:.*suspend.*error/i.test(e.message) ||
      /suspend entry.*error/i.test(e.message),
    summarize: (e) => {
      if (/abort/i.test(e.message)) return 'Suspend aborted';
      if (/resume.*fail/i.test(e.message)) return 'Resume failed';
      return 'Suspend/resume error';
    },
    extractDetails: (e) => ({ message: e.message }),
  },
  {
    type: 'selinux_denial',
    severity: 'info',
    match: (e) => /avc:\s+denied/i.test(e.message) || /selinux/i.test(e.message),
    summarize: (e) => {
      const scontext = e.message.match(/scontext=(\S+)/);
      const tcontext = e.message.match(/tcontext=(\S+)/);
      if (scontext && tcontext) {
        return `SELinux denial: ${scontext[1]} → ${tcontext[1]}`;
      }
      return 'SELinux denial';
    },
    extractDetails: (e) => {
      const fields: Record<string, string | number> = {};
      const scontext = e.message.match(/scontext=(\S+)/);
      const tcontext = e.message.match(/tcontext=(\S+)/);
      const tclass = e.message.match(/tclass=(\S+)/);
      const permission = e.message.match(/\{\s*([^}]+?)\s*\}/);
      if (scontext) fields.scontext = scontext[1];
      if (tcontext) fields.tcontext = tcontext[1];
      if (tclass) fields.tclass = tclass[1];
      if (permission) fields.permission = permission[1].trim();
      return fields;
    },
  },
];

/**
 * Generate a SELinux allow rule from a denial event's details.
 * Returns null if required fields are missing.
 */
export function generateSELinuxAllowRule(details: Record<string, string | number>): string | null {
  const scontext = details.scontext as string | undefined;
  const tcontext = details.tcontext as string | undefined;
  const tclass = details.tclass as string | undefined;
  const permission = details.permission as string | undefined;

  if (!scontext || !tcontext || !tclass || !permission) return null;

  // Extract domain from scontext: u:r:domain:s0 → domain
  const domainMatch = scontext.match(/^u:r:([^:]+):/);
  // Extract type from tcontext: u:object_r:type:s0 → type
  const typeMatch = tcontext.match(/^u:[^:]+:([^:]+):/);

  if (!domainMatch || !typeMatch) return null;

  const domain = domainMatch[1];
  const type = typeMatch[1];

  return `allow ${domain} ${type}:${tclass} { ${permission} };`;
}

function detectKernelEvents(entries: KernelLogEntry[]): KernelEvent[] {
  const events: KernelEvent[] = [];

  for (const entry of entries) {
    for (const rule of KERNEL_RULES) {
      if (rule.match(entry)) {
        events.push({
          type: rule.type,
          severity: rule.severity,
          timestamp: entry.timestamp,
          entries: [entry],
          summary: rule.summarize(entry),
          details: rule.extractDetails(entry),
        });
        break;
      }
    }
  }

  return events;
}
