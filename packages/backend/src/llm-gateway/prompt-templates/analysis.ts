import { AnalysisResult } from '@logcat-ai/parser';
import { buildInsightContexts, InsightContext } from './context-builder.js';

export function buildAnalysisPrompt(
  result: AnalysisResult,
  userDescription?: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert Android system engineer specializing in bugreport analysis.
You will receive a structured summary from a bugreport.zip analysis (Quick Analysis results) along with detailed raw context for each insight.
Your task is to perform Deep Analysis: identify root causes, find cross-subsystem correlations, and suggest fixes.

Rules:
- Be precise and technical. Reference specific thread names, PIDs, lock addresses, and timestamps.
- Provide evidence-based reasoning: cite specific log lines, stack frames, or kernel entries that support your conclusions.
- Cross-reference logcat events with kernel events and ANR traces by timing to find cross-subsystem correlations.
- For each insight, classify it as "root_cause", "symptom", or "contributing_factor" — symptoms may share a single root cause.
- When analyzing ANR, consider the full blocking chain, lock graph, and binder thread state.
- Identify affected system components (e.g. "vendor.gnss@2.0", "LocationManagerService", "SurfaceFlinger").
- Provide actionable debugging steps including specific adb commands when applicable.
- Output in the structured JSON format as specified.`;

  // All insights (not capped at 20)
  const insights = result.insights
    .map((i) => `- [${i.severity.toUpperCase()}] [${i.source}] ${i.id}: ${i.title}`)
    .join('\n');

  // Timeline (up to 50)
  const timeline = result.timeline
    .slice(0, 50)
    .map((e) => `[${e.timestamp}] [${e.source}] ${e.label}`)
    .join('\n');

  // ANR summaries (compact form for overview)
  const anrSummaries = result.anrAnalyses
    .map((a) => {
      const primary = a.blockedThread ?? a.mainThread;
      if (!primary) return null;
      const threadName = a.blockedThreadName ?? 'main';
      const chain = primary.blockingChain.map((t) => t.name).join(' → ');
      const binderInfo = primary.binderTarget && primary.binderTarget.interfaceName !== 'Unknown'
        ? `\n  Binder Target: ${primary.binderTarget.interfaceName}${primary.binderTarget.method ? `.${primary.binderTarget.method}()` : ''} (${primary.binderTarget.packageName})`
        : '';
      return `Process: ${a.processName} (PID ${a.pid})${a.subject ? `\n  Subject: ${a.subject}` : ''}
  Blocked Thread: "${threadName}" — ${primary.blockReason} (${primary.confidence})
  Blocking Chain: ${threadName} → ${chain || 'none'}${binderInfo}
  Binder Threads: ${a.binderThreads.busy}/${a.binderThreads.total} busy
  Deadlock: ${a.deadlocks.detected ? 'YES' : 'no'}`;
    })
    .filter(Boolean)
    .join('\n---\n');

  const health = result.healthScore;

  // Build targeted context per insight
  const insightContexts = buildInsightContexts(result);

  let userPrompt = `## Device Info
Model: ${result.metadata.deviceModel} (${result.metadata.manufacturer})
Android: ${result.metadata.androidVersion} (SDK ${result.metadata.sdkLevel})
Build: ${result.metadata.buildFingerprint}

## Health Score: ${health.overall}/100
- Stability: ${health.breakdown.stability}
- Memory: ${health.breakdown.memory}
- Responsiveness: ${health.breakdown.responsiveness}
- Kernel: ${health.breakdown.kernel}

## Insights (${result.insights.length} total)
${insights}

## Timeline (${Math.min(50, result.timeline.length)} events)
${timeline}`;

  if (anrSummaries) {
    userPrompt += `\n\n## ANR Trace Analysis\n${anrSummaries}`;
  }

  // Detailed context per insight
  if (insightContexts.length > 0) {
    userPrompt += '\n\n## Detailed Context Per Insight';
    for (const ctx of insightContexts) {
      const insight = result.insights.find((i) => i.id === ctx.insightId);
      if (!insight) continue;

      userPrompt += `\n\n### ${ctx.insightId}: ${insight.title}`;

      if (ctx.anomalyLogs.length > 0) {
        userPrompt += `\nSource anomaly logs:\n${ctx.anomalyLogs.map((l) => `  ${l}`).join('\n')}`;
      }

      if (ctx.fullStackTrace) {
        userPrompt += `\nFull stack trace (blocked thread):\n${ctx.fullStackTrace}`;
      }

      if (ctx.blockingChainStacks.length > 0) {
        userPrompt += `\nBlocking chain stacks:\n${ctx.blockingChainStacks.join('\n')}`;
      }

      if (ctx.relevantThreads.length > 0) {
        userPrompt += `\nRelevant threads (Blocked/Native state):\n${ctx.relevantThreads.join('\n')}`;
      }

      if (ctx.temporalContext.length > 0) {
        userPrompt += `\nTemporal context (W/E/F within ±2s):\n${ctx.temporalContext.map((l) => `  ${l}`).join('\n')}`;
      }
    }
  }

  if (userDescription) {
    userPrompt += `\n\n## User's Problem Description\n${userDescription}`;
  }

  userPrompt += `

## Your Task
Analyze the above data and respond with a JSON object (NOT an array):
\`\`\`json
{
  "executiveSummary": "2-3 sentence summary for management — what happened and the most likely cause",
  "systemDiagnosis": "Overall system health narrative — which subsystems are affected and how",
  "correlationFindings": [
    {
      "description": "Description of the cross-subsystem correlation found",
      "insightIds": ["insight-1", "insight-3"],
      "confidence": "high|medium|low"
    }
  ],
  "prioritizedActions": [
    {
      "action": "Specific action to take",
      "reason": "Why this action is important",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "insights": [
    {
      "insightId": "insight-1",
      "rootCause": "Detailed evidence-based root cause analysis citing specific log lines or stack frames",
      "fixSuggestion": "Specific fix recommendation with code-level guidance",
      "confidence": "high|medium|low",
      "evidence": ["specific log line or stack frame that supports this conclusion", "..."],
      "impactAssessment": "Impact on end user experience",
      "debuggingSteps": ["step 1 with adb command if applicable", "step 2", "..."],
      "relatedInsights": ["insight-3"],
      "category": "root_cause|symptom|contributing_factor",
      "affectedComponents": ["component.name@version", "ServiceName"]
    }
  ]
}
\`\`\`
Analyze ALL critical and warning insights. For info-level insights, include them only if they are relevant to a root cause.
Focus on cross-subsystem correlations and distinguish root causes from symptoms.`;

  return { systemPrompt, userPrompt };
}
