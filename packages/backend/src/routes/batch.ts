import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import {
  unpackBugreport,
  parseLogcat,
  detectAnomalies,
  computeTagStats,
  parseANRTrace,
  parseKernelLog,
  parseMemInfo,
  parseCpuInfo,
  parseLshal,
  parseTombstones,
  analyzeBasic,
  aggregateBatch,
  BatchItem,
  AnalysisResult,
  InsightCard,
  LogEntry,
} from '@logcat-ai/parser';
import { getConfig } from '../config.js';
import { analysisStore } from '../store.js';

const router = Router();

// File info stored after upload
interface BatchFileInfo {
  id: string;
  filename: string;
  size: number;
  path: string;
}

interface BatchData {
  files: BatchFileInfo[];
  items: BatchItem[];
  aggregation?: ReturnType<typeof aggregateBatch>;
}

// Store batch results in memory
const batchStore = new Map<string, BatchData>();

/**
 * POST /api/batch
 * Upload multiple bugreport files for batch analysis.
 * Returns a batch ID.
 */
router.post('/', (req: Request, res: Response) => {
  const config = getConfig();
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname) || '.zip';
      cb(null, `${id}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: config.maxFileSize },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.zip' || file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
        cb(null, true);
      } else {
        cb(new Error('Only .zip files accepted for batch analysis'));
      }
    },
  });

  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const batchId = crypto.randomUUID();
    const fileInfos: BatchFileInfo[] = files.map(f => ({
      id: path.basename(f.filename, path.extname(f.filename)),
      filename: f.originalname,
      size: f.size,
      path: f.path,
    }));

    batchStore.set(batchId, { files: fileInfos, items: [] });

    res.json({
      batchId,
      files: fileInfos.map(f => ({ id: f.id, filename: f.filename, size: f.size })),
      count: fileInfos.length,
    });
  });
});

/**
 * GET /api/batch/:id/analyze
 * Analyze all files in a batch. Streams progress via SSE.
 */
router.get('/:id/analyze', async (req: Request, res: Response) => {
  const batchId = String(req.params.id);
  const batch = batchStore.get(batchId);

  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  if (batch.files.length === 0) {
    return res.status(400).json({ error: 'No files in batch' });
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let aborted = false;
  req.on('close', () => { aborted = true; });

  function sendSSE(data: Record<string, unknown>): void {
    if (!aborted) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  const totalFiles = batch.files.length;
  const batchItems: BatchItem[] = [];

  try {
    for (let i = 0; i < totalFiles; i++) {
      if (aborted) return;

      const fileInfo = batch.files[i];
      const fileNum = i + 1;

      sendSSE({
        stage: 'analyzing',
        progress: Math.round((i / totalFiles) * 90),
        message: `Analyzing file ${fileNum} of ${totalFiles}: ${fileInfo.filename}`,
        fileIndex: i,
        totalFiles,
      });

      try {
        const analysisResult = await analyzeFile(fileInfo.path);

        // Store individual result in analysisStore for later access
        analysisStore.setWithMeta(fileInfo.id, analysisResult, fileInfo.filename, fileInfo.size);

        batchItems.push({
          id: fileInfo.id,
          filename: fileInfo.filename,
          result: analysisResult,
        });

        sendSSE({
          stage: 'analyzing',
          progress: Math.round(((i + 1) / totalFiles) * 90),
          message: `Completed ${fileNum} of ${totalFiles}: ${fileInfo.filename}`,
          fileIndex: i,
          totalFiles,
          fileResult: {
            id: fileInfo.id,
            filename: fileInfo.filename,
            healthScore: analysisResult.healthScore.overall,
            insightCount: analysisResult.insights.length,
            criticalCount: analysisResult.insights.filter(ins => ins.severity === 'critical').length,
          },
        });
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : 'Unknown error';
        sendSSE({
          stage: 'analyzing',
          progress: Math.round(((i + 1) / totalFiles) * 90),
          message: `Failed to analyze ${fileInfo.filename}: ${msg}`,
          fileIndex: i,
          totalFiles,
          fileError: { filename: fileInfo.filename, error: msg },
        });
      }
    }

    if (aborted) return;

    // Aggregate results
    sendSSE({
      stage: 'analyzing',
      progress: 95,
      message: 'Aggregating batch results...',
    });

    const aggregation = aggregateBatch(batchItems);
    batch.items = batchItems;
    batch.aggregation = aggregation;

    sendSSE({
      stage: 'complete',
      progress: 100,
      message: 'Batch analysis complete',
      data: {
        batchId,
        aggregation,
        items: batchItems.map(item => ({
          id: item.id,
          filename: item.filename,
          healthScore: item.result.healthScore.overall,
          insightCount: item.result.insights.length,
          criticalCount: item.result.insights.filter((ins: InsightCard) => ins.severity === 'critical').length,
        })),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    sendSSE({ stage: 'error', progress: 0, message: msg });
  } finally {
    res.end();
  }
});

/**
 * GET /api/batch/:id
 * Get batch results.
 */
router.get('/:id', (req: Request, res: Response) => {
  const batchId = String(req.params.id);
  const batch = batchStore.get(batchId);
  if (!batch) return res.status(404).json({ error: 'Batch not found' });

  res.json({
    batchId,
    aggregation: batch.aggregation ?? null,
    items: batch.items.map(item => ({
      id: item.id,
      filename: item.filename,
      healthScore: item.result.healthScore.overall,
      insightCount: item.result.insights.length,
      criticalCount: item.result.insights.filter((ins: InsightCard) => ins.severity === 'critical').length,
    })),
  });
});

// ============================================================
// Helper: Analyze a single bugreport ZIP file
// ============================================================

async function analyzeFile(filePath: string): Promise<AnalysisResult> {
  // Stage 1: Unpack
  const unpackResult = await unpackBugreport(filePath);

  // Stage 2: Parse — per-section to preserve buffer info
  const allEntries: LogEntry[] = [];
  let totalParseErrors = 0;
  let totalLines = 0;
  let parsedLines = 0;
  for (const section of unpackResult.logcatSections) {
    const result = parseLogcat(section.content, section.buffer);
    allEntries.push(...result.entries);
    totalParseErrors += result.parseErrors;
    totalLines += result.totalLines;
    parsedLines += result.parsedLines;
  }
  const logcatResult = {
    entries: allEntries,
    anomalies: detectAnomalies(allEntries),
    totalLines,
    parsedLines,
    parseErrors: totalParseErrors,
    tagStats: computeTagStats(allEntries),
  };

  const anrAnalyses = [...unpackResult.anrTraceContents.values()]
    .map((content) => parseANRTrace(content));

  const kernelSection = unpackResult.sections.find(
    (s) => s.name === 'KERNEL LOG' || s.command.includes('dmesg')
  );
  const kernelResult = parseKernelLog(kernelSection?.content ?? '');

  const memInfoSection = unpackResult.sections.find(
    (s) => s.command.includes('dumpsys meminfo')
  ) ?? unpackResult.sections.find(
    (s) => /^DUMPSYS/i.test(s.name) && /Total RAM:/i.test(s.content)
  );
  const memInfo = memInfoSection ? parseMemInfo(memInfoSection.content) : undefined;

  const cpuInfoSection = unpackResult.sections.find(
    (s) => s.command.includes('dumpsys cpuinfo')
  ) ?? unpackResult.sections.find(
    (s) => /^DUMPSYS/i.test(s.name) && /TOTAL:.*user.*kernel/i.test(s.content)
  );
  const cpuInfo = cpuInfoSection ? parseCpuInfo(cpuInfoSection.content) : undefined;

  const halSection = unpackResult.sections.find(
    (s) => s.name === 'HARDWARE HALS' || s.command.includes('lshal')
  );
  const halStatus = halSection ? parseLshal(halSection.content, unpackResult.metadata.manufacturer) : undefined;

  const tombstoneResult = parseTombstones(unpackResult.tombstoneContents);

  // Extract system properties section
  const sysPropSection = unpackResult.sections.find(
    (s) => s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop')
  );

  // Stage 3: Basic Analysis
  return analyzeBasic({
    metadata: unpackResult.metadata,
    logcatResult,
    kernelResult,
    anrAnalyses,
    memInfo,
    cpuInfo,
    halStatus,
    tombstoneAnalyses: tombstoneResult.analyses,
    systemProperties: sysPropSection?.content,
  });
}

export default router;
