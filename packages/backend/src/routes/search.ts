import { Router, Request, Response } from 'express';
import { rawDataStore } from '../raw-data-store.js';
import { searchLogcatFTS } from '../search/fts-indexer.js';
import type { LogEntry, LogLevel } from '@logcat-ai/parser';

const router = Router();

const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

router.get('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const q = req.query.q ? String(req.query.q) : undefined;
  const tag = req.query.tag ? String(req.query.tag) : undefined;
  const level = req.query.level ? String(req.query.level) : undefined;
  const pid = req.query.pid ? parseInt(String(req.query.pid), 10) : undefined;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 500);
  const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

  const rawData = rawDataStore.get(id);
  if (!rawData) {
    return res.status(404).json({ error: 'Analysis not found or data expired from memory' });
  }

  const entries = rawData.logcatEntries;
  if (entries.length === 0) {
    return res.json({ totalMatches: 0, showing: 0, method: 'keyword', entries: [] });
  }

  // Try FTS5 first if only keyword search (no other filters)
  if (q && !tag && !level && !pid) {
    const ftsResult = searchLogcatFTS(id, q, limit, offset);
    if (ftsResult) {
      return res.json({
        totalMatches: ftsResult.totalMatches,
        showing: ftsResult.entries.length,
        method: 'fts5',
        entries: ftsResult.entries.map(e => ({
          lineNumber: e.lineNumber,
          timestamp: e.timestamp,
          level: e.level,
          tag: e.tag,
          message: e.message,
        })),
      });
    }
  }

  // Fallback: in-memory filtering
  let filtered: LogEntry[] = entries;

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

  return res.json({
    totalMatches,
    showing: results.length,
    method: 'keyword',
    entries: results.map(e => ({
      lineNumber: e.lineNumber,
      timestamp: e.timestamp,
      pid: e.pid,
      tid: e.tid,
      level: e.level,
      tag: e.tag,
      message: e.message,
    })),
  });
});

export default router;
