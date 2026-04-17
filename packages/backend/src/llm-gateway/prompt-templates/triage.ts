/**
 * Triage prompt for agentic deep analysis (Phase 1).
 * Lightweight prompt (~2K tokens) — only insight summaries, no raw logs.
 * LLM decides which insights need deeper investigation and what tools to call.
 */

import { AnalysisResult } from '@logcat-ai/parser';

export function buildTriagePrompt(
  result: AnalysisResult,
  userDescription?: string,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert Android system engineer triaging a bugreport analysis.
You will receive a summary of insights from a Quick Analysis (rule-based). Your task is to decide which insights need deeper investigation using available tools, and which are clear enough to analyze directly.

Available investigation tools:
- search_logcat: Search logcat entries by keyword, tag, level, buffer (main/system/events/crash/radio), pid. Returns matching log lines.
- get_thread_info: Get thread stack trace, lock info, and blocking chain from ANR traces. Params: process_name, thread_name.
- get_kernel_events: Get kernel events by type (kernel_panic, oom_kill, driver_error, thermal_throttling, selinux_denial, etc.).
- get_insight_detail: Get full details of a specific insight (stack trace, log snippets, debug commands).
- search_section: Search raw bugreport sections (dumpsys, system properties, etc.) by section_name and/or keyword.

Rules:
- Focus investigation on critical and high-impact insights where the root cause is unclear from the title alone.
- For ANR insights: use get_thread_info to examine blocking chains and binder targets.
- For telephony/modem insights: use search_logcat with buffer="radio" to get radio log context.
- For kernel insights: use get_kernel_events to get detailed kernel event data.
- For cross-system correlations: search for temporal patterns using search_logcat with relevant keywords.
- Limit to max 8 tool calls total — prioritize the most impactful investigations.
- Skip insights that have obvious root causes from the title (e.g., "SELinux denial" with clear context).

Respond with JSON only:
\`\`\`json
{
  "investigations": [
    {
      "insightId": "insight-1",
      "reason": "Why this needs investigation",
      "toolCalls": [
        { "name": "tool_name", "arguments": { "param": "value" } }
      ]
    }
  ],
  "skipInsightIds": ["insight-5", "insight-8"],
  "skipReason": "Brief reason why these can be analyzed without investigation"
}
\`\`\``;

  const health = result.healthScore;

  // Compact insight list — id, severity, source, title only
  const criticalAndWarning = result.insights.filter(
    (i) => i.severity === 'critical' || i.severity === 'warning',
  );
  const insightList = criticalAndWarning
    .slice(0, 30)
    .map((i) => `- [${i.severity.toUpperCase()}] [${i.source}] ${i.id}: ${i.title}`)
    .join('\n');
  const overflow = criticalAndWarning.length > 30
    ? `\n... and ${criticalAndWarning.length - 30} more`
    : '';

  // Compact ANR list — process, block reason, binder target only
  const anrList = result.anrAnalyses
    .map((a) => {
      const primary = a.blockedThread ?? a.mainThread;
      if (!primary) return null;
      const target = primary.binderTarget?.interfaceName !== 'Unknown'
        ? ` → ${primary.binderTarget?.interfaceName ?? ''}`
        : '';
      const suspected = primary.suspectedBinderTargets?.length
        ? ` (suspected: ${primary.suspectedBinderTargets.map((t: { interfaceName: string }) => t.interfaceName).join(', ')})`
        : '';
      return `- ${a.processName}: ${primary.blockReason}${target}${suspected}`;
    })
    .filter(Boolean)
    .join('\n');

  // HAL issue summary
  const halSummary = result.halStatus
    ? `${result.halStatus.vendorIssueCount} vendor HAL issues out of ${result.halStatus.families.length} families`
    : 'No HAL data';

  let userPrompt = `## Device
${result.metadata.deviceModel} (${result.metadata.manufacturer}), Android ${result.metadata.androidVersion}

## Health Score: ${health.overall}/100
Stability: ${health.breakdown.stability} | Memory: ${health.breakdown.memory} | Responsiveness: ${health.breakdown.responsiveness} | Kernel: ${health.breakdown.kernel}

## Insights (${criticalAndWarning.length} critical+warning, ${result.insights.length} total)
${insightList}${overflow}`;

  if (anrList) {
    userPrompt += `\n\n## ANR Processes\n${anrList}`;
  }

  userPrompt += `\n\n## HAL Status\n${halSummary}`;

  userPrompt += `\n\n## Timeline\n${result.timeline.length} events total`;

  if (userDescription) {
    userPrompt += `\n\n## User's Problem Description\n${userDescription}`;
  }

  userPrompt += `\n\nDecide which insights need tool-based investigation and respond with JSON.`;

  return { systemPrompt, userPrompt };
}
