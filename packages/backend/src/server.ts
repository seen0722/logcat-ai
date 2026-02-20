import express from 'express';
import cors from 'cors';
import { getConfig } from './config.js';
import uploadRouter from './routes/upload.js';
import analyzeRouter from './routes/analyze.js';
import chatRouter from './routes/chat.js';
import settingsRouter from './routes/settings.js';

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

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: err.message });
});

// Start
const config = getConfig();
app.listen(config.port, () => {
  console.log(`[logcat-ai] Backend running on http://localhost:${config.port}`);
  console.log(`[logcat-ai] LLM Provider: ${config.llm.defaultProvider} (${config.llm.providers[config.llm.defaultProvider].model})`);
  console.log(`[logcat-ai] Upload dir: ${config.uploadDir}`);
});

export default app;
