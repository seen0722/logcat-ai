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
): FTSPaginatedResult | null {
  const db = getDatabase();

  // Sanitize query for FTS5 (escape special characters)
  const safeQuery = sanitizeFTSQuery(query);
  if (!safeQuery) return null;

  // If buffer filter is specified, add it to the FTS5 MATCH query
  const matchQuery = buffer ? `${safeQuery} AND buffer:"${buffer}"` : safeQuery;

  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM logcat_fts WHERE analysis_id = ? AND logcat_fts MATCH ?`,
      )
      .get(analysisId, matchQuery) as { cnt: number } | undefined;

    const totalMatches = countRow?.cnt ?? 0;
    if (totalMatches === 0) return null;

    const rows = db
      .prepare(
        `SELECT line_number, timestamp, pid, tid, level, tag, message, buffer, rank
         FROM logcat_fts
         WHERE analysis_id = ? AND logcat_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(analysisId, matchQuery, limit, offset) as Array<{
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
 * Index kernel log entries into FTS5 for a given analysis.
 * Replaces any existing index for the same analysis ID.
 */
export function indexKernelEntries(analysisId: string, entries: KernelLogEntry[]): void {
  if (entries.length === 0) return;

  const db = getDatabase();

  db.prepare('DELETE FROM kernel_fts WHERE analysis_id = ?').run(analysisId);

  const insert = db.prepare(
    'INSERT INTO kernel_fts (analysis_id, entry_index, timestamp_sec, level, facility, message) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const batchInsert = db.transaction((entries: KernelLogEntry[]) => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      insert.run(
        analysisId,
        i,
        String(entry.timestamp),
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
): KernelFTSPaginatedResult | null {
  const db = getDatabase();

  const safeQuery = sanitizeFTSQuery(query);
  if (!safeQuery) return null;

  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM kernel_fts WHERE analysis_id = ? AND kernel_fts MATCH ?`,
      )
      .get(analysisId, safeQuery) as { cnt: number } | undefined;

    const totalMatches = countRow?.cnt ?? 0;
    if (totalMatches === 0) return null;

    const rows = db
      .prepare(
        `SELECT entry_index, timestamp_sec, level, facility, message, rank
         FROM kernel_fts
         WHERE analysis_id = ? AND kernel_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(analysisId, safeQuery, limit, offset) as Array<{
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
