/**
 * Investigation prompt for agentic deep analysis (Phase 2).
 * LLM receives tool results from the triage plan and synthesizes findings.
 * Can optionally request additional tool calls for a second investigation round.
 */

import { AnalysisResult } from '@logcat-ai/parser';
import type { TriagePlan } from './agentic-types.js';

export function buildInvestigationPrompt(
  result: AnalysisResult,
  triagePlan: TriagePlan,
  toolResults: Map<string, string>,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert Android system engineer investigating specific insights from a bugreport.
You planned an investigation and have received tool results. Synthesize your findings per insight.

Rules:
- For each investigated insight, provide specific evidence from the tool results.
- Formulate a hypothesis for the root cause based on the evidence.
- If you need more data for a specific insight, you may request up to 4 additional tool calls total.
- Reference specific log lines, timestamps, PIDs, thread names, or kernel events as evidence.
- Identify cross-system correlations (e.g., kernel event at time T causing HAL death at T+1s).

Respond with JSON only:
\`\`\`json
{
  "findings": [
    {
      "insightId": "insight-1",
      "evidence": ["specific log line or observation from tool results"],
      "hypothesis": "Root cause hypothesis based on evidence",
      "additionalToolCalls": [
        { "name": "tool_name", "arguments": { "param": "value" } }
      ]
    }
  ]
}
\`\`\`

The "additionalToolCalls" field is optional — only include it if you genuinely need more data.`;

  let userPrompt = `## Device
${result.metadata.deviceModel} (${result.metadata.manufacturer}), Android ${result.metadata.androidVersion}

## Investigation Plan
${triagePlan.investigations.map((inv) => {
    const insight = result.insights.find((i) => i.id === inv.insightId);
    return `### ${inv.insightId}: ${insight?.title ?? 'Unknown'}
Reason: ${inv.reason}
Tools called: ${inv.toolCalls.map((t) => t.name).join(', ')}`;
  }).join('\n\n')}

## Tool Results`;

  for (const [key, value] of toolResults.entries()) {
    // Cap individual tool result to 3000 chars to stay within budget
    const trimmed = value.length > 3000 ? value.slice(0, 3000) + '\n[... truncated ...]' : value;
    userPrompt += `\n\n### ${key}\n${trimmed}`;
  }

  userPrompt += `\n\nSynthesize findings per insight and respond with JSON.`;

  return { systemPrompt, userPrompt };
}
