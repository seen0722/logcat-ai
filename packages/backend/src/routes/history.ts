import { Router, Request, Response } from 'express';
import { historyStore } from '../history-store.js';

const router = Router();

/**
 * GET /api/history
 * List analysis history with pagination.
 * Query params: limit (default 20), offset (default 0)
 */
router.get('/', (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);

  const result = historyStore.list(limit, offset);
  res.json(result);
});

/**
 * GET /api/history/:id
 * Get the AnalysisResult for a history entry.
 * Strips logcatResult.entries and kernelResult.entries to avoid sending 200MB+
 * of raw log data to the frontend — those are queryable via the search API.
 */
router.get('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const result = historyStore.get(id);

  if (!result) {
    return res.status(404).json({ error: 'History entry not found' });
  }

  // Strip raw entries to keep response size reasonable
  const slim = {
    ...result,
    logcatResult: result.logcatResult
      ? {
          anomalies: result.logcatResult.anomalies,
          totalLines: result.logcatResult.totalLines,
          parsedLines: result.logcatResult.parsedLines,
          parseErrors: result.logcatResult.parseErrors,
          tagStats: result.logcatResult.tagStats,
        }
      : undefined,
    kernelResult: result.kernelResult
      ? {
          events: result.kernelResult.events,
          totalLines: result.kernelResult.totalLines,
          parseErrors: result.kernelResult.parseErrors,
        }
      : undefined,
  };
  res.json(slim);
});

/**
 * DELETE /api/history/:id
 * Delete a history entry.
 */
router.delete('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const deleted = historyStore.delete(id);

  if (!deleted) {
    return res.status(404).json({ error: 'History entry not found' });
  }

  res.json({ ok: true });
});

/**
 * PATCH /api/history/:id
 * Update notes and/or tags for a history entry.
 * Body: { notes?: string, tags?: string }
 */
router.patch('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { notes, tags } = req.body as { notes?: string; tags?: string };

  if (notes === undefined && tags === undefined) {
    return res.status(400).json({ error: 'At least one of notes or tags is required' });
  }

  const updated = historyStore.updateNotes(id, notes ?? '', tags);

  if (!updated) {
    return res.status(404).json({ error: 'History entry not found' });
  }

  res.json({ ok: true });
});

export default router;
