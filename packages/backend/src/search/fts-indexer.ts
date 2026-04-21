/**
 * FTS5 full-text search indexer for logcat entries.
 * Uses SQLite FTS5 for fast BM25-ranked text search.
 */

import { getDatabase } from '../db.js';
import type { LogEntry, KernelLogEntry } from '@logcat-ai/parser';

export interface FTSSearchResult {
  lineNumber: number;
  timestamp: string;
  pid: number;
  tid: number;
  level: string;
  tag: string;
  message: string;
  buffer?: string;
  rank: number;
}

/**
 * Index logcat entries into FTS5 for a given analysis.
 * Replaces any existing index for the same analysis ID.
 */
export function indexLogcatEntries(analysisId: string, entries: LogEntry[]): void {
  if (entries.length === 0) return;

  const db = getDatabase();

  // Delete existing entries for this analysis
  db.prepare('DELETE FROM logcat_fts WHERE analysis_id = ?').run(analysisId);

  // Batch insert for performance
  const insert = db.prepare(
    'INSERT INTO logcat_fts (analysis_id, line_number, timestamp, pid, tid, level, tag, message, buffer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  const batchInsert = db.transaction((entries: LogEntry[]) => {
    for (const entry of entries) {
      insert.run(
        analysisId,
        entry.lineNumber,
        entry.timestamp,
        entry.pid,
        entry.tid,
        entry.level,
        entry.tag,
        entry.message,
        entry.buffer ?? '',
      );
    }
  });

  batchInsert(entries);
}

export interface FTSPaginatedResult {
  totalMatches: number;
  entries: FTSSearchResult[];
}

/**
 * Search logcat entries using FTS5 BM25 ranking.
 * Returns results ordered by relevance with pagination support.
 * Optional buffer filter to restrict search to a specific logcat buffer.
 */
export function searchLogcatFTS(
  analysisId: string,
  query: string,
  limit = 50,
  offset = 0,
  buffer?: string,
  startTime?: string,
  endTime?: string,
): FTSPaginatedResult | null {
  const db = getDatabase();

  // Sanitize query for FTS5 (escape special characters)
  const safeQuery = sanitizeFTSQuery(query);
  if (!safeQuery) return null;

  // If buffer filter is specified, add it to the FTS5 MATCH query
  const matchQuery = buffer ? `${safeQuery} AND buffer:"${buffer}"` : safeQuery;

  // Build optional timestamp range WHERE clauses (lexicographic comparison)
  let timeClause = '';
  const timeParams: string[] = [];
  if (startTime) {
    timeClause += ' AND timestamp >= ?';
    timeParams.push(startTime);
  }
  if (endTime) {
    timeClause += ' AND timestamp <= ?';
    timeParams.push(endTime);
  }

  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM logcat_fts WHERE analysis_id = ? AND logcat_fts MATCH ?${timeClause}`,
      )
      .get(analysisId, matchQuery, ...timeParams) as { cnt: number } | undefined;

    const totalMatches = countRow?.cnt ?? 0;
    if (totalMatches === 0) return null;

    const rows = db
      .prepare(
        `SELECT line_number, timestamp, pid, tid, level, tag, message, buffer, rank
         FROM logcat_fts
         WHERE analysis_id = ? AND logcat_fts MATCH ?${timeClause}
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(analysisId, matchQuery, ...timeParams, limit, offset) as Array<{
      line_number: number;
      timestamp: string;
      pid: string;
      tid: string;
      level: string;
      tag: string;
      message: string;
      buffer: string;
      rank: number;
    }>;

    return {
      totalMatches,
      entries: rows.map((row) => ({
        lineNumber: row.line_number,
        timestamp: row.timestamp,
        pid: parseInt(row.pid, 10),
        tid: parseInt(row.tid, 10),
        level: row.level,
        tag: row.tag,
        message: row.message,
        buffer: row.buffer || undefined,
        rank: row.rank,
      })),
    };
  } catch {
    // FTS5 query syntax error — fallback to null
    return null;
  }
}

/**
 * Delete FTS5 index for a given analysis.
 */
export function deleteLogcatIndex(analysisId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM logcat_fts WHERE analysis_id = ?').run(analysisId);
}

/**
 * Sanitize a user query for FTS5.
 * Wraps individual terms in quotes to avoid syntax errors from special characters.
 */
function sanitizeFTSQuery(query: string): string {
  // Split into words, wrap each in double quotes for exact term matching
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`);

  return terms.join(' ');
}

// ============================================================
// Kernel FTS5 Functions
// ============================================================

export interface KernelFTSSearchResult {
  entryIndex: number;
  timestamp: string;
  level: string;
  facility: string;
  message: string;
  rank: number;
}

export interface KernelFTSPaginatedResult {
  totalMatches: number;
  entries: KernelFTSSearchResult[];
}

/**
 * Format epoch milliseconds to MM-DD HH:mm:ss.SSS display string.
 */
function formatEpochToDisplay(epochMs: number): string {
  const d = new Date(epochMs);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${MM}-${DD} ${hh}:${mm}:${ss}.${ms}`;
}

/**
 * Index kernel log entries into FTS5 for a given analysis.
 * Replaces any existing index for the same analysis ID.
 * When bootEpochMs is provided, timestamps are stored as wall-clock MM-DD HH:mm:ss.SSS
 * for consistent lexicographic comparison with search time ranges.
 */
export function indexKernelEntries(analysisId: string, entries: KernelLogEntry[], bootEpochMs?: number): void {
  if (entries.length === 0) return;

  const db = getDatabase();

  db.prepare('DELETE FROM kernel_fts WHERE analysis_id = ?').run(analysisId);

  const insert = db.prepare(
    'INSERT INTO kernel_fts (analysis_id, entry_index, timestamp_sec, level, facility, message) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const batchInsert = db.transaction((entries: KernelLogEntry[]) => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const ts = bootEpochMs != null
        ? formatEpochToDisplay(bootEpochMs + entry.timestamp * 1000)
        : String(entry.timestamp);
      insert.run(
        analysisId,
        i,
        ts,
        entry.level,
        entry.facility,
        entry.message,
      );
    }
  });

  batchInsert(entries);
}

/**
 * Search kernel entries using FTS5 BM25 ranking.
 */
export function searchKernelFTS(
  analysisId: string,
  query: string,
  limit = 50,
  offset = 0,
  startTime?: string,
  endTime?: string,
): KernelFTSPaginatedResult | null {
  const db = getDatabase();

  const safeQuery = sanitizeFTSQuery(query);
  if (!safeQuery) return null;

  // Build optional timestamp range WHERE clauses (lexicographic comparison on timestamp_sec)
  let timeClause = '';
  const timeParams: string[] = [];
  if (startTime) {
    timeClause += ' AND timestamp_sec >= ?';
    timeParams.push(startTime);
  }
  if (endTime) {
    timeClause += ' AND timestamp_sec <= ?';
    timeParams.push(endTime);
  }

  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM kernel_fts WHERE analysis_id = ? AND kernel_fts MATCH ?${timeClause}`,
      )
      .get(analysisId, safeQuery, ...timeParams) as { cnt: number } | undefined;

    const totalMatches = countRow?.cnt ?? 0;
    if (totalMatches === 0) return null;

    const rows = db
      .prepare(
        `SELECT entry_index, timestamp_sec, level, facility, message, rank
         FROM kernel_fts
         WHERE analysis_id = ? AND kernel_fts MATCH ?${timeClause}
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(analysisId, safeQuery, ...timeParams, limit, offset) as Array<{
      entry_index: number;
      timestamp_sec: string;
      level: string;
      facility: string;
      message: string;
      rank: number;
    }>;

    return {
      totalMatches,
      entries: rows.map((row) => ({
        entryIndex: row.entry_index,
        timestamp: row.timestamp_sec,
        level: row.level,
        facility: row.facility,
        message: row.message,
        rank: row.rank,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Delete kernel FTS5 index for a given analysis.
 */
export function deleteKernelIndex(analysisId: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM kernel_fts WHERE analysis_id = ?').run(analysisId);
}

// ============================================================
// FTS5 SQL WHERE Fallback (when rawDataStore is expired)
// ============================================================

const LOG_LEVELS = ['V', 'D', 'I', 'W', 'E', 'F'];
const KERNEL_LEVELS = ['<0>', '<1>', '<2>', '<3>', '<4>', '<5>', '<6>', '<7>'];

/**
 * Check if logcat FTS5 index exists for a given analysis.
 */
export function hasLogcatIndex(analysisId: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT 1 FROM logcat_fts WHERE analysis_id = ? LIMIT 1').get(analysisId);
  return row != null;
}

/**
 * Check if kernel FTS5 index exists for a given analysis.
 */
export function hasKernelIndex(analysisId: string): boolean {
  const db = getDatabase();
  const row = db.prepare('SELECT 1 FROM kernel_fts WHERE analysis_id = ? LIMIT 1').get(analysisId);
  return row != null;
}

/**
 * Search logcat entries using SQL WHERE (not FTS5 MATCH).
 * Used as fallback when rawDataStore is expired but FTS5 index still exists.
 */
/**
 * Load all logcat entries from FTS5 for rebuilding rawDataStore.
 * Returns entries in insertion order (chronological).
 */
export function loadAllLogcatFromFTS(analysisId: string): LogEntry[] {
  const db = getDatabase();
  try {
    const rows = db
      .prepare('SELECT line_number, timestamp, pid, tid, level, tag, message, buffer FROM logcat_fts WHERE analysis_id = ?')
      .all(analysisId) as Array<{
        line_number: number; timestamp: string; pid: string; tid: string;
        level: string; tag: string; message: string; buffer: string;
      }>;
    const entries: LogEntry[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      entries[i] = {
        lineNumber: r.line_number,
        timestamp: r.timestamp,
        pid: parseInt(r.pid, 10),
        tid: parseInt(r.tid, 10),
        level: r.level as LogEntry['level'],
        tag: r.tag,
        message: r.message,
        buffer: r.buffer || undefined,
      } as LogEntry;
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Load all kernel entries from FTS5 for rebuilding rawDataStore.
 */
export function loadAllKernelFromFTS(analysisId: string): KernelLogEntry[] {
  const db = getDatabase();
  try {
    const rows = db
      .prepare('SELECT entry_index, timestamp_sec, level, facility, message FROM kernel_fts WHERE analysis_id = ?')
      .all(analysisId) as Array<{
        entry_index: number; timestamp_sec: string; level: string; facility: string; message: string;
      }>;
    const entries: KernelLogEntry[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      entries[i] = {
        timestamp: parseFloat(r.timestamp_sec),
        level: r.level,
        facility: r.facility,
        message: r.message,
      } as KernelLogEntry;
    }
    return entries;
  } catch {
    return [];
  }
}

export function searchLogcatSQL(
  analysisId: string,
  params: {
    q?: string;
    tag?: string;
    level?: string;
    pid?: number;
    buffer?: string;
    startTime?: string;
    endTime?: string;
    limit: number;
    offset: number;
  },
): FTSPaginatedResult | null {
  const db = getDatabase();
  const { q, tag, level, pid, buffer, startTime, endTime, limit, offset } = params;

  const conditions: string[] = ['analysis_id = ?'];
  const bindParams: (string | number)[] = [analysisId];

  if (q) {
    conditions.push("(message LIKE ? OR tag LIKE ?)");
    const like = `%${q}%`;
    bindParams.push(like, like);
  }

  if (tag) {
    conditions.push('tag = ?');
    bindParams.push(tag);
  }

  if (level) {
    const minIdx = LOG_LEVELS.indexOf(level);
    if (minIdx >= 0) {
      const allowed = LOG_LEVELS.slice(minIdx);
      conditions.push(`level IN (${allowed.map(() => '?').join(',')})`);
      bindParams.push(...allowed);
    }
  }

  if (pid !== undefined && !isNaN(pid)) {
    conditions.push('pid = ?');
    bindParams.push(String(pid));
  }

  if (buffer) {
    conditions.push('buffer = ?');
    bindParams.push(buffer);
  }

  if (startTime) {
    conditions.push('timestamp >= ?');
    bindParams.push(startTime);
  }

  if (endTime) {
    conditions.push('timestamp <= ?');
    bindParams.push(endTime);
  }

  const where = conditions.join(' AND ');

  try {
    // Skip expensive COUNT(*) on FTS5 virtual table — fetch limit+1 to detect more rows
    const rows = db
      .prepare(
        `SELECT line_number, timestamp, pid, tid, level, tag, message, buffer
         FROM logcat_fts
         WHERE ${where}
         LIMIT ? OFFSET ?`,
      )
      .all(...bindParams, limit + 1, offset) as Array<{
      line_number: number;
      timestamp: string;
      pid: string;
      tid: string;
      level: string;
      tag: string;
      message: string;
      buffer: string;
    }>;

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;
    // totalMatches: exact when all fit, otherwise estimate as offset + fetched
    const totalMatches = hasMore ? offset + limit + 1 : offset + resultRows.length;

    return {
      totalMatches,
      entries: resultRows.map((row) => ({
        lineNumber: row.line_number,
        timestamp: row.timestamp,
        pid: parseInt(row.pid, 10),
        tid: parseInt(row.tid, 10),
        level: row.level,
        tag: row.tag,
        message: row.message,
        buffer: row.buffer || undefined,
        rank: 0,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Search kernel entries using SQL WHERE (not FTS5 MATCH).
 * Used as fallback when rawDataStore is expired but FTS5 index still exists.
 */
export function searchKernelSQL(
  analysisId: string,
  params: {
    q?: string;
    level?: string;
    startTime?: string;
    endTime?: string;
    limit: number;
    offset: number;
  },
): KernelFTSPaginatedResult | null {
  const db = getDatabase();
  const { q, level, startTime, endTime, limit, offset } = params;

  const conditions: string[] = ['analysis_id = ?'];
  const bindParams: (string | number)[] = [analysisId];

  if (q) {
    conditions.push('message LIKE ?');
    bindParams.push(`%${q}%`);
  }

  if (level) {
    // level is e.g. "<4>" — show entries with severity <= this number (lower = more severe)
    const maxIdx = KERNEL_LEVELS.indexOf(level);
    if (maxIdx >= 0) {
      const allowed = KERNEL_LEVELS.slice(0, maxIdx + 1);
      conditions.push(`level IN (${allowed.map(() => '?').join(',')})`);
      bindParams.push(...allowed);
    }
  }

  if (startTime) {
    conditions.push('timestamp_sec >= ?');
    bindParams.push(startTime);
  }

  if (endTime) {
    conditions.push('timestamp_sec <= ?');
    bindParams.push(endTime);
  }

  const where = conditions.join(' AND ');

  try {
    // Skip expensive COUNT(*) on FTS5 virtual table — fetch limit+1 to detect more rows
    const rows = db
      .prepare(
        `SELECT entry_index, timestamp_sec, level, facility, message
         FROM kernel_fts
         WHERE ${where}
         ORDER BY rowid_sec
         LIMIT ? OFFSET ?`,
      )
      .all(...bindParams, limit + 1, offset) as Array<{
      entry_index: number;
      timestamp_sec: string;
      level: string;
      facility: string;
      message: string;
    }>;

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;
    const totalMatches = hasMore ? offset + limit + 1 : offset + resultRows.length;

    return {
      totalMatches,
      entries: resultRows.map((row) => ({
        entryIndex: row.entry_index,
        timestamp: row.timestamp_sec,
        level: row.level,
        facility: row.facility,
        message: row.message,
        rank: 0,
      })),
    };
  } catch {
    return null;
  }
}
