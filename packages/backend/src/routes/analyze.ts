import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
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
  parsePowerSections,
  detectLogFormat,
  AnalysisResult,
  DeepAnalysisOverview,
  LogEntry,
} from '@logcat-ai/parser';
import { analyzeBasic } from '@logcat-ai/parser';
import { getConfig } from '../config.js';
import { analyzeDeep } from '../llm-gateway/llm-gateway.js';
import { analysisStore } from '../store.js';
import { rawDataStore } from '../raw-data-store.js';
import { indexLogcatEntries, indexKernelEntries } from '../search/fts-indexer.js';

const router = Router();

// SSE progress stages
type Stage = 'unpacking' | 'parsing' | 'analyzing' | 'deep_analysis' | 'complete' | 'error';

interface SSEProgress {
  stage: Stage;
  progress: number; // 0-100
  message: string;
  data?: unknown;
}

function sendSSE(res: Response, event: SSEProgress): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * GET /api/analyze/:id
 * Start analysis of an uploaded bugreport. Streams progress via SSE.
 * Query params:
 *   ?mode=quick (default) | deep
 *   ?description=... (optional user problem description)
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const mode = String(req.query.mode ?? 'quick');
  const userDescription = req.query.description ? String(req.query.description) : undefined;

  // Find uploaded file — support .zip, .txt, .log extensions
  const config = getConfig();
  const uploadMeta = analysisStore.getUploadMeta(id);
  const originalFilename = uploadMeta?.filename ?? '';
  const fileSize = uploadMeta?.fileSize ?? 0;

  // Try to locate the file with known extensions
  let filePath = '';
  const possibleExts = ['.zip', '.txt', '.log'];
  for (const ext of possibleExts) {
    const candidate = path.join(config.uploadDir, `${id}${ext}`);
    if (fs.existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }

  if (!filePath) {
    return res.status(404).json({ error: `Upload ${id} not found` });
  }

  const fileExt = path.extname(filePath).toLowerCase();

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    let analysisResult: AnalysisResult;

    if (fileExt === '.txt' || fileExt === '.log') {
      // ── Standalone logcat / dmesg file path ──
      const standaloneResult = analyzeStandaloneFile(id, res, filePath, aborted);
      if (!standaloneResult) return; // error or unknown format already sent
      analysisResult = standaloneResult;

    } else {
      // ── ZIP bugreport path (existing logic) ──
      // Stage 1: Unpack
      const t0 = Date.now();
      sendSSE(res, { stage: 'unpacking', progress: 10, message: 'Unpacking bugreport.zip...' });

      const unpackResult = await unpackBugreport(filePath);

      const t1 = Date.now();
      console.log(`[perf] Unpack: ${((t1 - t0) / 1000).toFixed(1)}s — ${unpackResult.logcatSections.length} logcat sections, ${unpackResult.sections.length} total sections`);

      if (aborted) return;
      sendSSE(res, { stage: 'unpacking', progress: 25, message: 'Unpack complete' });

      // Stage 2: Parse
      sendSSE(res, { stage: 'parsing', progress: 30, message: 'Parsing logcat...' });

      // Parse all logcat sections individually to preserve buffer info
      // NOTE: Use per-element push (not push(...) or concat) to avoid stack overflow and reduce memory with large arrays (400K+ entries)
      const allEntries: LogEntry[] = [];
      let totalParseErrors = 0;
      let totalLines = 0;
      let parsedLines = 0;
      for (const section of unpackResult.logcatSections) {
        const result = parseLogcat(section.content, section.buffer);
        for (const entry of result.entries) {
          allEntries.push(entry);
        }
        totalParseErrors += result.parseErrors;
        totalLines += result.totalLines;
        parsedLines += result.parsedLines;
        // Free the large content string after parsing to reduce memory pressure
        (section as { content: string }).content = '';
      }
      const logcatResult = {
        entries: allEntries,
        anomalies: detectAnomalies(allEntries),
        totalLines,
        parsedLines,
        parseErrors: totalParseErrors,
        tagStats: computeTagStats(allEntries),
      };

      const t2 = Date.now();
      console.log(`[perf] Parse logcat: ${((t2 - t1) / 1000).toFixed(1)}s — ${allEntries.length} entries`);

      if (aborted) return;
      sendSSE(res, { stage: 'parsing', progress: 45, message: 'Parsing ANR traces...' });

      // Parse all ANR trace files
      const anrAnalyses = [...unpackResult.anrTraceContents.values()]
        .map((content) => parseANRTrace(content));

      if (aborted) return;
      sendSSE(res, { stage: 'parsing', progress: 55, message: 'Parsing kernel log...' });

      // Parse kernel log from sections
      const kernelSection = unpackResult.sections.find(
        (s) => s.name === 'KERNEL LOG' || s.command.includes('dmesg')
      );
      const kernelResult = parseKernelLog(kernelSection?.content ?? '');

      if (aborted) return;
      sendSSE(res, { stage: 'parsing', progress: 60, message: 'Parsing dumpsys meminfo/cpuinfo...' });

      // Parse dumpsys meminfo — try dedicated section first, then search in DUMPSYS sections
      const memInfoSection = unpackResult.sections.find(
        (s) => s.command.includes('dumpsys meminfo')
      ) ?? unpackResult.sections.find(
        (s) => /^DUMPSYS/i.test(s.name) && /Total RAM:/i.test(s.content)
      );
      const memInfo = memInfoSection ? parseMemInfo(memInfoSection.content) : undefined;

      // Parse dumpsys cpuinfo — try dedicated section first, then search in DUMPSYS sections
      const cpuInfoSection = unpackResult.sections.find(
        (s) => s.command.includes('dumpsys cpuinfo')
      ) ?? unpackResult.sections.find(
        (s) => /^DUMPSYS/i.test(s.name) && /TOTAL:.*user.*kernel/i.test(s.content)
      );
      const cpuInfo = cpuInfoSection ? parseCpuInfo(cpuInfoSection.content) : undefined;

      // Parse HARDWARE HALS (lshal output)
      const halSection = unpackResult.sections.find(
        (s) => s.name === 'HARDWARE HALS' || s.command.includes('lshal')
      );
      const halStatus = halSection ? parseLshal(halSection.content, unpackResult.metadata.manufacturer) : undefined;

      // Parse tombstones (native crash dumps)
      const tombstoneResult = parseTombstones(unpackResult.tombstoneContents);

      if (aborted) return;
      sendSSE(res, { stage: 'parsing', progress: 62, message: 'Parsing power management...' });

      // Parse power management sections (dumpsys power, deviceidle, batterystats, alarm)
      const powerStatus = parsePowerSections(unpackResult.sections, kernelResult.entries);

      if (aborted) return;
      sendSSE(res, { stage: 'parsing', progress: 65, message: 'Parsing complete' });

      // Extract system properties section (before freeing section content)
      const sysPropSection = unpackResult.sections.find(
        (s) => s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop')
      );
      const systemProperties = sysPropSection?.content;

      // Extract UPTIME section for boot uptime fallback
      const uptimeSection = unpackResult.sections.find(
        (s) => s.name === 'UPTIME' || s.command === 'uptime'
      );
      const uptimeContent = uptimeSection?.content;

      // Filter sections for rawDataStore: exclude logcat sections (already in logcatEntries)
      // and free large section content strings to reduce memory
      const logcatSectionNames = ['SYSTEM LOG', 'EVENT LOG', 'MAIN LOG', 'CRASH LOG', 'RADIO LOG', 'LOGCAT'];
      const storedSections = unpackResult.sections.filter(
        (s) => !logcatSectionNames.some((kw) => s.name.toUpperCase().includes(kw)) &&
          !s.command.includes('logcat'),
      );

      // Store raw parsed data for agentic chat tool access
      rawDataStore.set(id, {
        logcatEntries: logcatResult.entries,
        kernelResult,
        anrAnalyses,
        sections: storedSections,
      });

      // Free unpackResult memory — sections and rawFiles are no longer needed
      (unpackResult as { sections: unknown }).sections = [];
      (unpackResult as { rawFiles: unknown }).rawFiles = new Map();
      (unpackResult as { anrTraceContents: unknown }).anrTraceContents = new Map();
      (unpackResult as { tombstoneContents: unknown }).tombstoneContents = new Map();

      // Index logcat entries in FTS5 for full-text search
      const t3 = Date.now();
      try {
        indexLogcatEntries(id, logcatResult.entries);
      } catch (err) {
        console.error('[FTS5] Logcat indexing failed:', err instanceof Error ? err.message : err);
      }

      // Stage 3: Basic Analysis
      sendSSE(res, { stage: 'analyzing', progress: 70, message: 'Running rule-based analysis...' });

      analysisResult = analyzeBasic({
        metadata: unpackResult.metadata,
        logcatResult,
        kernelResult,
        anrAnalyses,
        memInfo,
        cpuInfo,
        halStatus,
        tombstoneAnalyses: tombstoneResult.analyses,
        systemProperties,
        uptimeContent,
        powerStatus,
      });

      // Index kernel entries AFTER analyzeBasic so we have bootStatus for wall-clock timestamps
      const bootEpochMs = analysisResult.bootStatus?.uptimeSeconds != null
        ? unpackResult.metadata.bugreportTimestamp.getTime() - analysisResult.bootStatus.uptimeSeconds * 1000
        : undefined;
      // Update rawDataStore with bootEpochMs for in-memory kernel search timestamp conversion
      const rawData = rawDataStore.get(id);
      if (rawData && bootEpochMs != null) {
        rawData.bootEpochMs = bootEpochMs;
      }
      try {
        indexKernelEntries(id, kernelResult.entries, bootEpochMs);
      } catch (err) {
        console.error('[FTS5] Kernel indexing failed:', err instanceof Error ? err.message : err);
      }
      const t4 = Date.now();
      console.log(`[perf] FTS5 indexing: ${((t4 - t3) / 1000).toFixed(1)}s`);

      const t5 = Date.now();
      console.log(`[perf] Basic analysis + kernel FTS: ${((t5 - t3) / 1000).toFixed(1)}s`);
      console.log(`[perf] TOTAL: ${((t5 - t0) / 1000).toFixed(1)}s`);
    }

    // Store result for later use (chat, deep analysis re-run)
    if (uploadMeta) {
      analysisStore.setWithMeta(id, analysisResult, originalFilename, fileSize);
    } else {
      analysisStore.set(id, analysisResult);
    }

    if (aborted) return;
    // NOTE: Do NOT send analysisResult inline — it can be 200MB+ for large bugreports.
    // Frontend fetches the full result via GET /api/analyze/:id/result instead.
    sendSSE(res, {
      stage: 'analyzing',
      progress: 80,
      message: 'Quick Analysis complete',
      data: { id },
    });

    // Stage 4: Deep Analysis (optional)
    if (mode === 'deep') {
      sendSSE(res, { stage: 'deep_analysis', progress: 85, message: 'Starting AI deep analysis...' });

      let deepContent = '';
      try {
        for await (const chunk of analyzeDeep(analysisResult, userDescription)) {
          if (aborted) return;
          deepContent += chunk.content;
          sendSSE(res, {
            stage: 'deep_analysis',
            progress: 85 + Math.min(10, Math.floor(deepContent.length / 500)),
            message: chunk.done ? 'Deep analysis complete' : 'AI analyzing...',
            data: { chunk: chunk.content, done: chunk.done },
          });
        }

        // Try to parse LLM output and enhance insights
        const parsed = tryParseDeepAnalysis(deepContent);
        if (parsed) {
          // Merge per-insight deep analysis
          for (const item of parsed.insights) {
            const insight = analysisResult.insights.find((i) => i.id === item.insightId);
            if (insight) {
              insight.deepAnalysis = {
                rootCause: item.rootCause,
                fixSuggestion: item.fixSuggestion,
                confidence: item.confidence,
                evidence: item.evidence ?? [],
                impactAssessment: item.impactAssessment ?? '',
                debuggingSteps: item.debuggingSteps ?? [],
                relatedInsights: item.relatedInsights ?? [],
                category: item.category ?? 'root_cause',
                affectedComponents: item.affectedComponents ?? [],
              };
            }
          }

          // Merge overview
          if (parsed.executiveSummary) {
            analysisResult.deepAnalysisOverview = {
              executiveSummary: parsed.executiveSummary,
              systemDiagnosis: parsed.systemDiagnosis ?? '',
              correlationFindings: parsed.correlationFindings ?? [],
              prioritizedActions: parsed.prioritizedActions ?? [],
            };
          }

          // Persist updated result (with deep analysis) to both cache and SQLite
          if (uploadMeta) {
            analysisStore.setWithMeta(id, analysisResult, originalFilename, fileSize);
          } else {
            analysisStore.set(id, analysisResult);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown LLM error';
        if (err instanceof Error && err.stack) {
          console.error('[Deep Analysis Error]', err.stack);
        }
        sendSSE(res, {
          stage: 'deep_analysis',
          progress: 95,
          message: `Deep analysis failed: ${msg}. Quick Analysis results are still available.`,
        });
      }
    }

    // NOTE: Do NOT send analysisResult inline — it can be 200MB+ for large bugreports.
    // Frontend fetches the full result via GET /api/analyze/:id/result instead.
    sendSSE(res, { stage: 'complete', progress: 100, message: 'Analysis complete', data: { id } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    sendSSE(res, { stage: 'error', progress: 0, message: msg });
  } finally {
    res.end();
  }
});

/**
 * GET /api/analyze/:id/result
 * Get the cached analysis result (non-SSE, JSON).
 * Strips logcatResult.entries and kernelResult.entries to avoid sending 200MB+
 * of raw log data to the frontend — those are queryable via the search API.
 */
router.get('/:id/result', (req: Request, res: Response) => {
  const result = analysisStore.get(String(req.params.id));
  if (!result) {
    return res.status(404).json({ error: 'Analysis not found. Run /api/analyze/:id first.' });
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
        }
      : undefined,
  };
  res.json(slim);
});

// ============================================================
// Standalone File Analysis (logcat / dmesg)
// ============================================================

const EMPTY_METADATA = {
  androidVersion: '',
  sdkLevel: 0,
  buildFingerprint: '',
  buildType: 'unknown',
  deviceModel: '',
  manufacturer: '',
  buildDate: '',
  kernelVersion: '',
  bugreportTimestamp: new Date(),
};

/**
 * Analyze a standalone .txt/.log file (logcat or dmesg).
 * Returns the AnalysisResult, or null if format is unknown (error SSE already sent).
 */
function analyzeStandaloneFile(
  id: string,
  res: Response,
  filePath: string,
  _aborted: boolean,
): AnalysisResult | null {
  sendSSE(res, { stage: 'unpacking', progress: 10, message: 'Reading file...' });
  const content = fs.readFileSync(filePath, 'utf-8');

  sendSSE(res, { stage: 'parsing', progress: 30, message: 'Detecting format...' });
  const format = detectLogFormat(content);

  if (format === 'unknown') {
    sendSSE(res, {
      stage: 'error',
      progress: 0,
      message: 'Unable to detect file format. Expected logcat or dmesg output.',
    });
    res.end();
    return null;
  }

  if (format === 'logcat') {
    sendSSE(res, { stage: 'parsing', progress: 50, message: 'Parsing logcat...' });
    const logcatResult = parseLogcat(content);

    // Store raw data for agentic chat tool access
    rawDataStore.set(id, {
      logcatEntries: logcatResult.entries,
      kernelResult: { entries: [], events: [], totalLines: 0 },
      anrAnalyses: [],
      sections: [],
    });

    // Index logcat entries in FTS5 for full-text search
    try {
      indexLogcatEntries(id, logcatResult.entries);
    } catch (err) {
      console.error('[FTS5] Logcat indexing failed:', err instanceof Error ? err.message : err);
    }

    sendSSE(res, { stage: 'analyzing', progress: 70, message: 'Analyzing logcat...' });
    return analyzeBasic({
      metadata: EMPTY_METADATA,
      logcatResult,
      kernelResult: { entries: [], events: [], totalLines: 0 },
      anrAnalyses: [],
    });
  } else {
    // dmesg
    sendSSE(res, { stage: 'parsing', progress: 50, message: 'Parsing kernel log...' });
    const kernelResult = parseKernelLog(content);

    // Store raw data for agentic chat tool access
    rawDataStore.set(id, {
      logcatEntries: [],
      kernelResult,
      anrAnalyses: [],
      sections: [],
    });

    // Index kernel entries in FTS5 for full-text search
    try {
      indexKernelEntries(id, kernelResult.entries);
    } catch (err) {
      console.error('[FTS5] Kernel indexing failed:', err instanceof Error ? err.message : err);
    }

    sendSSE(res, { stage: 'analyzing', progress: 70, message: 'Analyzing kernel log...' });
    return analyzeBasic({
      metadata: EMPTY_METADATA,
      logcatResult: { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 },
      kernelResult,
      anrAnalyses: [],
    });
  }
}

// ============================================================
// Helpers
// ============================================================

interface DeepAnalysisInsightItem {
  insightId: string;
  rootCause: string;
  fixSuggestion: string;
  confidence: 'high' | 'medium' | 'low';
  evidence?: string[];
  impactAssessment?: string;
  debuggingSteps?: string[];
  relatedInsights?: string[];
  category?: 'root_cause' | 'symptom' | 'contributing_factor';
  affectedComponents?: string[];
}

interface DeepAnalysisResult extends Omit<DeepAnalysisOverview, 'correlationFindings' | 'prioritizedActions'> {
  correlationFindings?: DeepAnalysisOverview['correlationFindings'];
  prioritizedActions?: DeepAnalysisOverview['prioritizedActions'];
  insights: DeepAnalysisInsightItem[];
}

function tryParseDeepAnalysis(content: string): DeepAnalysisResult | null {
  // Try each regex pattern in order, attempting to parse each match
  const patterns: RegExp[] = [
    /```(?:json)?\s*([\s\S]*?)```/,
    /\{[\s\S]*\}/,
    /\[[\s\S]*\]/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match) continue;
    const raw = match[1] ?? match[0];

    try {
      const parsed = JSON.parse(raw);

      // New format: object with insights array
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.insights)) {
        return parsed as DeepAnalysisResult;
      }

      // Legacy format: plain array of items
      if (Array.isArray(parsed)) {
        return {
          executiveSummary: '',
          systemDiagnosis: '',
          insights: parsed as DeepAnalysisInsightItem[],
        };
      }
    } catch {
      // JSON parse failed for this pattern, try next
    }
  }

  return null;
}

export default router;
