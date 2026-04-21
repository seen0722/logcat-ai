import { Router, Request, Response } from 'express';
import { rawDataStore } from '../raw-data-store.js';
import { searchLogcatFTS, searchKernelFTS, hasLogcatIndex, hasKernelIndex, searchLogcatSQL, searchKernelSQL, loadAllLogcatFromFTS, loadAllKernelFromFTS } from '../search/fts-indexer.js';
import type { LogEntry, LogLevel, KernelLogEntry } from '@logcat-ai/parser';

const router = Router();

const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

function truncate(msg: string, maxLen: number): string {
  if (maxLen <= 0 || msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen) + '\u2026';
}

// Kernel severity levels: lower number = more severe
const KERNEL_LEVELS = ['<0>', '<1>', '<2>', '<3>', '<4>', '<5>', '<6>', '<7>'];

router.get('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const source = String(req.query.source ?? 'logcat');
  const q = req.query.q ? String(req.query.q) : undefined;
  const tag = req.query.tag ? String(req.query.tag) : undefined;
  const level = req.query.level ? String(req.query.level) : undefined;
  const pid = req.query.pid ? parseInt(String(req.query.pid), 10) : undefined;
  const buffer = req.query.buffer ? String(req.query.buffer) : undefined;
  const startTime = req.query.startTime ? String(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? String(req.query.endTime) : undefined;
  const isExport = req.query.export === 'true';
  const compact = req.query.compact === 'true';
  const truncateMsg = req.query.truncateMsg ? parseInt(String(req.query.truncateMsg), 10) : 0;
  const maxLimit = isExport ? 1_000_000 : 500;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), maxLimit);
  const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

  let rawData = rawDataStore.get(id);

  // Lazy-rebuild rawDataStore from FTS5 if expired (avoids slow per-query FTS5 scans)
  if (!rawData && (hasLogcatIndex(id) || hasKernelIndex(id))) {
    const t0 = Date.now();
    const logcatEntries = hasLogcatIndex(id) ? loadAllLogcatFromFTS(id) : [];
    const kernelEntries = hasKernelIndex(id) ? loadAllKernelFromFTS(id) : [];
    if (logcatEntries.length > 0 || kernelEntries.length > 0) {
      rawDataStore.set(id, {
        logcatEntries,
        kernelResult: { entries: kernelEntries, events: [], totalLines: kernelEntries.length, parseErrors: 0 },
        anrAnalyses: [],
        sections: [],
      });
      rawData = rawDataStore.get(id);
      console.log(`[search] Rebuilt rawDataStore from FTS5: ${logcatEntries.length} logcat + ${kernelEntries.length} kernel entries in ${Date.now() - t0}ms`);
    }
  }

  if (source === 'kernel') {
    if (rawData && rawData.kernelResult.entries.length > 0) {
      return handleKernelSearch(id, rawData.kernelResult.entries, rawData.bootEpochMs, { q, level, startTime, endTime, limit, offset, truncateMsg }, res);
    }
    // FTS5 SQL fallback for kernel
    return handleKernelFallback(id, { q, level, startTime, endTime, limit, offset, truncateMsg }, res);
  }

  // ── Logcat search (default) ──
  if (rawData) {
    return handleLogcatInMemory(id, rawData.logcatEntries, { q, tag, level, pid, buffer, startTime, endTime, limit, offset, compact, truncateMsg }, res);
  }

  // FTS5 SQL fallback for logcat
  return handleLogcatFallback(id, { q, tag, level, pid, buffer, startTime, endTime, limit, offset, compact, truncateMsg }, res);
});

/**
 * In-memory logcat search (fast path when rawDataStore is available).
 */
function handleLogcatInMemory(
  id: string,
  entries: LogEntry[],
  params: { q?: string; tag?: string; level?: string; pid?: number; buffer?: string; startTime?: string; endTime?: string; limit: number; offset: number; compact?: boolean; truncateMsg?: number },
  res: Response,
) {
  const { q, tag, level, pid, buffer, startTime, endTime, limit, offset, compact, truncateMsg: tLen = 0 } = params;

  if (entries.length === 0) {
    return res.json({ totalMatches: 0, showing: 0, method: 'keyword', entries: [] });
  }

  // Full time range of the unfiltered dataset (for UI position indicator)
  // Use full "MM-DD HH:mm:ss.SSS" (22 chars) to match bufferTimeRanges precision
  const fullTimeRange = {
    first: entries[0].timestamp.slice(0, 22),
    last: entries[entries.length - 1].timestamp.slice(0, 22),
    total: entries.length,
  };

  // Try FTS5 first if only keyword search (no tag/level/pid filters)
  if (q && !tag && !level && !pid) {
    const ftsResult = searchLogcatFTS(id, q, limit, offset, buffer, startTime, endTime);
    if (ftsResult) {
      if (compact) {
        return res.json({
          totalMatches: ftsResult.totalMatches,
          showing: ftsResult.entries.length,
          method: 'fts5',
          fullTimeRange,
          columns: ['timestamp', 'pid', 'tid', 'level', 'tag', 'message', 'buffer'],
          rows: ftsResult.entries.map(e => [e.timestamp, e.pid, e.tid, e.level, e.tag, truncate(e.message, tLen), e.buffer ?? '']),
        });
      }
      return res.json({
        totalMatches: ftsResult.totalMatches,
        showing: ftsResult.entries.length,
        method: 'fts5',
        fullTimeRange,
        entries: ftsResult.entries.map(e => ({
          lineNumber: e.lineNumber,
          timestamp: e.timestamp,
          pid: e.pid,
          tid: e.tid,
          level: e.level,
          tag: e.tag,
          message: truncate(e.message, tLen),
          buffer: e.buffer,
        })),
      });
    }
  }

  // Fallback: in-memory filtering
  let filtered: LogEntry[] = entries;

  if (buffer) {
    filtered = filtered.filter(e => e.buffer === buffer);
  }

  if (startTime) {
    filtered = filtered.filter(e => e.timestamp >= startTime);
  }
  if (endTime) {
    filtered = filtered.filter(e => e.timestamp <= endTime);
  }

  if (tag) {
    filtered = filtered.filter(e => e.tag === tag);
  }

  if (level) {
    const minIdx = LOG_LEVELS.indexOf(level as LogLevel);
    if (minIdx >= 0) {
      filtered = filtered.filter(e => LOG_LEVELS.indexOf(e.level) >= minIdx);
    }
  }

  if (pid !== undefined && !isNaN(pid)) {
    filtered = filtered.filter(e => e.pid === pid);
  }

  if (q) {
    const kw = q.toLowerCase();
    filtered = filtered.filter(
      e => e.message.toLowerCase().includes(kw) || e.tag.toLowerCase().includes(kw),
    );
  }

  const totalMatches = filtered.length;
  const results = filtered.slice(offset, offset + limit);

  if (compact) {
    return res.json({
      totalMatches,
      showing: results.length,
      method: 'keyword',
      fullTimeRange,
      columns: ['timestamp', 'pid', 'tid', 'level', 'tag', 'message', 'buffer'],
      rows: results.map(e => [e.timestamp, e.pid, e.tid, e.level, e.tag, truncate(e.message, tLen), e.buffer ?? '']),
    });
  }
  return res.json({
    totalMatches,
    showing: results.length,
    method: 'keyword',
    fullTimeRange,
    entries: results.map(e => ({
      lineNumber: e.lineNumber,
      timestamp: e.timestamp,
      pid: e.pid,
      tid: e.tid,
      level: e.level,
      tag: e.tag,
      message: truncate(e.message, tLen),
      buffer: e.buffer,
    })),
  });
}

/**
 * FTS5 SQL WHERE fallback for logcat (when rawDataStore is expired).
 */
function handleLogcatFallback(
  id: string,
  params: { q?: string; tag?: string; level?: string; pid?: number; buffer?: string; startTime?: string; endTime?: string; limit: number; offset: number; compact?: boolean; truncateMsg?: number },
  res: Response,
) {
  const tLen = params.truncateMsg ?? 0;
  if (!hasLogcatIndex(id)) {
    return res.status(404).json({ error: 'Analysis not found or data expired' });
  }

  const result = searchLogcatSQL(id, params);
  if (!result) {
    return res.json({ totalMatches: 0, showing: 0, method: 'fts5-sql', entries: [] });
  }

  if (params.compact) {
    return res.json({
      totalMatches: result.totalMatches,
      showing: result.entries.length,
      method: 'fts5-sql',
      columns: ['timestamp', 'pid', 'tid', 'level', 'tag', 'message', 'buffer'],
      rows: result.entries.map(e => [e.timestamp, e.pid, e.tid, e.level, e.tag, truncate(e.message, tLen), e.buffer ?? '']),
    });
  }
  return res.json({
    totalMatches: result.totalMatches,
    showing: result.entries.length,
    method: 'fts5-sql',
    entries: result.entries.map(e => ({
      lineNumber: e.lineNumber,
      timestamp: e.timestamp,
      pid: e.pid,
      tid: e.tid,
      level: e.level,
      tag: e.tag,
      message: truncate(e.message, tLen),
      buffer: e.buffer,
    })),
  });
}

/**
 * FTS5 SQL WHERE fallback for kernel (when rawDataStore is expired).
 */
function handleKernelFallback(
  id: string,
  params: { q?: string; level?: string; startTime?: string; endTime?: string; limit: number; offset: number; truncateMsg?: number },
  res: Response,
) {
  const tLen = params.truncateMsg ?? 0;
  if (!hasKernelIndex(id)) {
    return res.status(404).json({ error: 'Analysis not found or data expired' });
  }

  const result = searchKernelSQL(id, params);
  if (!result) {
    return res.json({ totalMatches: 0, showing: 0, method: 'fts5-sql', entries: [] });
  }

  return res.json({
    totalMatches: result.totalMatches,
    showing: result.entries.length,
    method: 'fts5-sql',
    entries: result.entries.map(e => ({
      entryIndex: e.entryIndex,
      timestamp: e.timestamp,
      level: e.level,
      facility: e.facility,
      message: truncate(e.message, tLen),
    })),
  });
}

// ============================================================
// Kernel Search
// ============================================================

/**
 * Format epoch milliseconds to MM-DD HH:mm:ss.SSS display string.
 * Uses UTC methods to avoid server timezone offset from device timezone.
 */
function formatEpochToDisplay(epochMs: number): string {
  const d = new Date(epochMs);
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
  return `${MM}-${DD} ${hh}:${mm}:${ss}.${ms}`;
}

function handleKernelSearch(
  id: string,
  entries: KernelLogEntry[],
  bootEpochMs: number | undefined,
  params: { q?: string; level?: string; startTime?: string; endTime?: string; limit: number; offset: number; truncateMsg?: number },
  res: Response,
) {
  const { q, level, startTime, endTime, limit, offset, truncateMsg: tLen = 0 } = params;

  if (entries.length === 0) {
    return res.json({ totalMatches: 0, showing: 0, method: 'keyword', entries: [] });
  }

  // Full time range for kernel entries (convert boot-relative seconds to display strings)
  const kernelFullTimeRange = (() => {
    const firstTs = bootEpochMs != null ? formatEpochToDisplay(bootEpochMs + entries[0].timestamp * 1000) : String(entries[0].timestamp);
    const lastTs = bootEpochMs != null ? formatEpochToDisplay(bootEpochMs + entries[entries.length - 1].timestamp * 1000) : String(entries[entries.length - 1].timestamp);
    return { first: firstTs.slice(0, 22), last: lastTs.slice(0, 22), total: entries.length };
  })();

  // Try FTS5 first if only keyword search (no level filter)
  if (q && !level) {
    const ftsResult = searchKernelFTS(id, q, limit, offset, startTime, endTime);
    if (ftsResult) {
      return res.json({
        totalMatches: ftsResult.totalMatches,
        showing: ftsResult.entries.length,
        method: 'fts5',
        fullTimeRange: kernelFullTimeRange,
        entries: ftsResult.entries.map(e => ({
          entryIndex: e.entryIndex,
          timestamp: e.timestamp,
          level: e.level,
          facility: e.facility,
          message: truncate(e.message, tLen),
        })),
      });
    }
  }

  // Convert kernel entry timestamp to display string for filtering and response
  const toDisplayTs = (secsSinceBoot: number): string =>
    bootEpochMs != null
      ? formatEpochToDisplay(bootEpochMs + secsSinceBoot * 1000)
      : String(secsSinceBoot);

  // Fallback: in-memory filtering
  let filtered = entries.map((e, i) => ({ ...e, entryIndex: i, displayTs: toDisplayTs(e.timestamp) }));

  if (level) {
    // level is e.g. "<4>" — show entries with severity <= this number (lower = more severe)
    const maxIdx = KERNEL_LEVELS.indexOf(level);
    if (maxIdx >= 0) {
      filtered = filtered.filter(e => {
        const idx = KERNEL_LEVELS.indexOf(e.level);
        return idx >= 0 && idx <= maxIdx;
      });
    }
  }

  if (startTime) {
    filtered = filtered.filter(e => e.displayTs >= startTime);
  }
  if (endTime) {
    filtered = filtered.filter(e => e.displayTs <= endTime);
  }

  if (q) {
    const kw = q.toLowerCase();
    filtered = filtered.filter(e => e.message.toLowerCase().includes(kw));
  }

  const totalMatches = filtered.length;
  const results = filtered.slice(offset, offset + limit);

  return res.json({
    totalMatches,
    showing: results.length,
    method: 'keyword',
    fullTimeRange: kernelFullTimeRange,
    entries: results.map(e => ({
      entryIndex: e.entryIndex,
      timestamp: e.displayTs,
      level: e.level,
      facility: e.facility,
      message: truncate(e.message, tLen),
    })),
  });
}

export default router;
