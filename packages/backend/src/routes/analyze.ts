import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import {
  unpackBugreport,
  parseLogcat,
  parseANRTrace,
  parseKernelLog,
  parseMemInfo,
  parseCpuInfo,
  parseLshal,
  parseTombstones,
  AnalysisResult,
  DeepAnalysisOverview,
} from '@logcat-ai/parser';
import { analyzeBasic } from '@logcat-ai/parser';
import { getConfig } from '../config.js';
import { analyzeDeep } from '../llm-gateway/llm-gateway.js';
import { analysisStore } from '../store.js';

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

  // Find uploaded file
  const config = getConfig();
  const zipPath = path.join(config.uploadDir, `${id}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: `Upload ${id} not found` });
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

  try {
    // Stage 1: Unpack
    sendSSE(res, { stage: 'unpacking', progress: 10, message: 'Unpacking bugreport.zip...' });

    const unpackResult = await unpackBugreport(zipPath);

    if (aborted) return;
    sendSSE(res, { stage: 'unpacking', progress: 25, message: 'Unpack complete' });

    // Stage 2: Parse
    sendSSE(res, { stage: 'parsing', progress: 30, message: 'Parsing logcat...' });

    // Parse all logcat sections
    const logcatTexts = unpackResult.logcatSections;
    const combinedLogcat = logcatTexts.join('\n');
    const logcatResult = parseLogcat(combinedLogcat);

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
    sendSSE(res, { stage: 'parsing', progress: 65, message: 'Parsing complete' });

    // Stage 3: Basic Analysis
    sendSSE(res, { stage: 'analyzing', progress: 70, message: 'Running rule-based analysis...' });

    // Extract system properties section
    const sysPropSection = unpackResult.sections.find(
      (s) => s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop')
    );

    const analysisResult: AnalysisResult = analyzeBasic({
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

    // Store result for later use (chat, deep analysis re-run)
    analysisStore.set(id, analysisResult);

    if (aborted) return;
    sendSSE(res, {
      stage: 'analyzing',
      progress: 80,
      message: 'Quick Analysis complete',
      data: analysisResult,
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

          analysisStore.set(id, analysisResult);
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

    sendSSE(res, { stage: 'complete', progress: 100, message: 'Analysis complete', data: analysisResult });
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
 */
router.get('/:id/result', (req: Request, res: Response) => {
  const result = analysisStore.get(String(req.params.id));
  if (!result) {
    return res.status(404).json({ error: 'Analysis not found. Run /api/analyze/:id first.' });
  }
  res.json(result);
});

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
