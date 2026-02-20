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

/**
 * Parse kernel log (dmesg) into structured entries and detect events.
 */
export function parseKernelLog(content: string): KernelParseResult {
  const lines = content.split('\n');
  const entries: KernelLogEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(DMESG_LINE_RE);
    if (match) {
      const level = match[1] ?? '';
      const timestamp = parseFloat(match[2]);
      const message = match[3];

      entries.push({
        timestamp,
        level: level ? `<${level}>` : '',
        facility: '',
        message,
        raw: line,
      });
    }
  }

  const events = detectKernelEvents(entries);

  return {
    entries,
    events,
    totalLines: lines.length,
  };
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
      /lowmemorykiller/i.test(e.message) || /lmkd/i.test(e.message),
    summarize: (e) => {
      const m = e.message.match(/kill.*?'(.+?)'/);
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
      if (scontext) fields.scontext = scontext[1];
      if (tcontext) fields.tcontext = tcontext[1];
      if (tclass) fields.tclass = tclass[1];
      return fields;
    },
  },
];

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
