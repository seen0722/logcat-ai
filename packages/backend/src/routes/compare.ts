import { Router, Request, Response } from 'express';
import { compareAnalyses } from '@logcat-ai/parser';
import { analysisStore } from '../store.js';

const router = Router();

/**
 * GET /api/compare?left=:id&right=:id
 * Compare two analysis results.
 */
router.get('/', (req: Request, res: Response) => {
  const leftId = String(req.query.left ?? '');
  const rightId = String(req.query.right ?? '');

  if (!leftId || !rightId) {
    return res.status(400).json({ error: 'Both left and right analysis IDs are required' });
  }

  const leftResult = analysisStore.get(leftId);
  const rightResult = analysisStore.get(rightId);

  if (!leftResult) {
    return res.status(404).json({ error: `Left analysis ${leftId} not found` });
  }
  if (!rightResult) {
    return res.status(404).json({ error: `Right analysis ${rightId} not found` });
  }

  const comparison = compareAnalyses(leftId, rightId, leftResult, rightResult);
  res.json(comparison);
});

export default router;
