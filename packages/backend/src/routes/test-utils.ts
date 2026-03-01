import { Router } from 'express';
import { rawDataStore } from '../raw-data-store.js';

const router = Router();

/**
 * POST /clear-raw-store/:id
 * Removes raw data from in-memory store for the given analysis ID.
 * Used by E2E tests to verify FTS5 SQL fallback path.
 */
router.post('/clear-raw-store/:id', (req, res) => {
  const { id } = req.params;
  rawDataStore.delete(id);
  res.json({ ok: true, id });
});

export default router;
