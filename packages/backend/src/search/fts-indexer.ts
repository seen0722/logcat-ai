/**
 * FTS5 full-text search indexer for logcat entries.
 * Uses SQLite FTS5 for fast BM25-ranked text search.
 */

import { getDatabase } from '../db.js';
import type { LogEntry } from '@logcat-ai/parser';

export interface FTSSearchResult {
  lineNumber: number;
  timestamp: string;
  level: string;
  tag: string;
  message: string;
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
    'INSERT INTO logcat_fts (analysis_id, line_number, timestamp, level, tag, message) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const batchInsert = db.transaction((entries: LogEntry[]) => {
    for (const entry of entries) {
      insert.run(
        analysisId,
        entry.lineNumber,
        entry.timestamp,
        entry.level,
        entry.tag,
        entry.message,
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
 */
export function searchLogcatFTS(
  analysisId: string,
  query: string,
  limit = 50,
  offset = 0,
): FTSPaginatedResult | null {
  const db = getDatabase();

  // Sanitize query for FTS5 (escape special characters)
  const safeQuery = sanitizeFTSQuery(query);
  if (!safeQuery) return null;

  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM logcat_fts WHERE analysis_id = ? AND logcat_fts MATCH ?`,
      )
      .get(analysisId, safeQuery) as { cnt: number } | undefined;

    const totalMatches = countRow?.cnt ?? 0;
    if (totalMatches === 0) return null;

    const rows = db
      .prepare(
        `SELECT line_number, timestamp, level, tag, message, rank
         FROM logcat_fts
         WHERE analysis_id = ? AND logcat_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(analysisId, safeQuery, limit, offset) as Array<{
      line_number: number;
      timestamp: string;
      level: string;
      tag: string;
      message: string;
      rank: number;
    }>;

    return {
      totalMatches,
      entries: rows.map((row) => ({
        lineNumber: row.line_number,
        timestamp: row.timestamp,
        level: row.level,
        tag: row.tag,
        message: row.message,
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
