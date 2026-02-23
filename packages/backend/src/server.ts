import dotenv from 'dotenv';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';

// Load .env from project root (../../.env relative to this file)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import { initDatabase } from './db.js';
import uploadRouter from './routes/upload.js';
import analyzeRouter from './routes/analyze.js';
import chatRouter from './routes/chat.js';
import settingsRouter from './routes/settings.js';
import historyRouter from './routes/history.js';
import exportRouter from './routes/export.js';
import compareRouter from './routes/compare.js';
import batchRouter from './routes/batch.js';
import searchRouter from './routes/search.js';

// Initialize SQLite database before anything else
initDatabase();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/chat', chatRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/history', historyRouter);
app.use('/api/export', exportRouter);
app.use('/api/compare', compareRouter);
app.use('/api/batch', batchRouter);
app.use('/api/search', searchRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: err.message });
});

// Start
const config = getConfig();
app.listen(config.port, () => {
  const heapStats = v8.getHeapStatistics();
  const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
  console.log(`[logcat-ai] Backend running on http://localhost:${config.port}`);
  console.log(`[logcat-ai] LLM Provider: ${config.llm.defaultProvider} (${config.llm.providers[config.llm.defaultProvider].model})`);
  console.log(`[logcat-ai] Upload dir: ${config.uploadDir}`);
  console.log(`[logcat-ai] V8 heap limit: ${heapLimitMB}MB`);
});

export default app;
