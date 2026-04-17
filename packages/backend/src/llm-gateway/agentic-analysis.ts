/**
 * Agentic multi-pass deep analysis orchestrator.
 *
 * Three-phase pipeline:
 *   Phase 1 (Triage):       LLM reviews insight summaries → outputs tool call plan
 *   Phase 2 (Investigate):  Execute tools, LLM synthesizes findings (1-2 rounds)
 *   Phase 3 (Analyze):      Final streaming analysis with enriched context
 *
 * Falls back to one-shot analyzeDeep() on any phase failure.
 */

import { AnalysisResult, StreamChunk } from '@logcat-ai/parser';
import { buildTriagePrompt } from './prompt-templates/triage.js';
import { buildInvestigationPrompt } from './prompt-templates/investigation.js';
import { buildAnalysisPrompt } from './prompt-templates/analysis.js';
import { executeTool } from './tool-executor.js';
import type {
  TriagePlan,
  InvestigationFindings,
  AgenticProgressEvent,
  PlannedToolCall,
} from './prompt-templates/agentic-types.js';
import { LLMProvider } from './providers/base-provider.js';

export interface AgenticStreamChunk extends StreamChunk {
  agenticProgress?: AgenticProgressEvent;
  fallbackToOneShot?: boolean;
}

const MAX_TRIAGE_TOOL_CALLS = 8;
const MAX_ADDITIONAL_TOOL_CALLS = 4;

/**
 * Run agentic multi-pass deep analysis.
 * Yields streaming chunks compatible with the existing SSE pipeline.
 */
export async function* analyzeDeepAgentic(
  analysisId: string,
  result: AnalysisResult,
  provider: LLMProvider,
  userDescription?: string,
): AsyncIterable<AgenticStreamChunk> {
  // ── Phase 1: Triage ──
  yield {
    content: '',
    done: false,
    agenticProgress: { subStage: 'triage', message: 'Triaging insights...' },
  };

  let triagePlan: TriagePlan | null = null;
  try {
    const { systemPrompt, userPrompt } = buildTriagePrompt(result, userDescription);
    const triageResponse = await provider.chat({ systemPrompt, userPrompt });
    triagePlan = tryParseTriagePlan(triageResponse.content);
  } catch (err) {
    console.error('[Agentic] Triage phase failed:', err instanceof Error ? err.message : err);
  }

  if (!triagePlan || triagePlan.investigations.length === 0) {
    // No investigations needed or triage failed — fall back to one-shot
    yield { content: '', done: false, fallbackToOneShot: true };
    return;
  }

  // ── Phase 2: Investigate ──
  yield {
    content: '',
    done: false,
    agenticProgress: {
      subStage: 'investigating',
      message: `Investigating ${triagePlan.investigations.length} insight(s)...`,
    },
  };

  // Execute all planned tool calls
  const toolResults = new Map<string, string>();
  let toolCallCount = 0;

  for (const investigation of triagePlan.investigations) {
    for (const toolCall of investigation.toolCalls) {
      if (toolCallCount >= MAX_TRIAGE_TOOL_CALLS) break;

      const key = `${investigation.insightId}/${toolCall.name}`;
      yield {
        content: '',
        done: false,
        agenticProgress: {
          subStage: 'investigating',
          message: `Calling ${toolCall.name}...`,
          toolCall: { name: toolCall.name, insightId: investigation.insightId },
        },
      };

      const toolExecResult = executeTool(analysisId, {
        id: `agentic_${toolCallCount}`,
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments),
        },
      });
      toolResults.set(key, toolExecResult.content);
      toolCallCount++;
    }
  }

  // Synthesize findings via LLM
  let findings: InvestigationFindings | null = null;
  try {
    yield {
      content: '',
      done: false,
      agenticProgress: { subStage: 'investigating', message: 'Synthesizing findings...' },
    };

    const { systemPrompt, userPrompt } = buildInvestigationPrompt(result, triagePlan, toolResults);
    const investigationResponse = await provider.chat({ systemPrompt, userPrompt });
    findings = tryParseInvestigationFindings(investigationResponse.content);

    // Optional second round: execute additional tool calls if requested
    if (findings && hasAdditionalToolCalls(findings)) {
      let additionalCount = 0;
      const additionalResults = new Map<string, string>();

      for (const finding of findings.findings) {
        if (!finding.additionalToolCalls) continue;
        for (const toolCall of finding.additionalToolCalls) {
          if (additionalCount >= MAX_ADDITIONAL_TOOL_CALLS) break;

          yield {
            content: '',
            done: false,
            agenticProgress: {
              subStage: 'investigating',
              message: `Follow-up: ${toolCall.name}...`,
              toolCall: { name: toolCall.name, insightId: finding.insightId },
            },
          };

          const toolExecResult = executeTool(analysisId, {
            id: `agentic_extra_${additionalCount}`,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          });
          additionalResults.set(`${finding.insightId}/${toolCall.name}(follow-up)`, toolExecResult.content);
          additionalCount++;
        }
      }

      // Re-synthesize with additional results
      if (additionalResults.size > 0) {
        const mergedResults = new Map([...toolResults, ...additionalResults]);
        const { systemPrompt: sp2, userPrompt: up2 } = buildInvestigationPrompt(result, triagePlan, mergedResults);
        const response2 = await provider.chat({ systemPrompt: sp2, userPrompt: up2 });
        const findings2 = tryParseInvestigationFindings(response2.content);
        if (findings2) {
          findings = findings2;
        }
      }
    }
  } catch (err) {
    console.error('[Agentic] Investigation phase failed:', err instanceof Error ? err.message : err);
    // Continue to final analysis with whatever findings we have (or none)
  }

  // ── Phase 3: Final Analysis (streaming) ──
  yield {
    content: '',
    done: false,
    agenticProgress: { subStage: 'analyzing', message: 'Generating final analysis...' },
  };

  const { systemPrompt, userPrompt } = buildAnalysisPrompt(
    result,
    userDescription,
    findings ?? undefined,
  );

  yield* provider.chatStream({ systemPrompt, userPrompt });
}

// ── Parsers ──

function tryParseTriagePlan(content: string): TriagePlan | null {
  const json = extractJSON(content);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.investigations)) return null;

    // Validate and cap tool calls
    const plan: TriagePlan = {
      investigations: [],
      skipInsightIds: Array.isArray(parsed.skipInsightIds) ? parsed.skipInsightIds : [],
      skipReason: parsed.skipReason,
    };

    let totalCalls = 0;
    for (const inv of parsed.investigations) {
      if (!inv.insightId || !Array.isArray(inv.toolCalls)) continue;
      const capped: PlannedToolCall[] = [];
      for (const tc of inv.toolCalls) {
        if (totalCalls >= MAX_TRIAGE_TOOL_CALLS) break;
        if (tc.name && typeof tc.name === 'string') {
          capped.push({ name: tc.name, arguments: tc.arguments ?? {} });
          totalCalls++;
        }
      }
      plan.investigations.push({
        insightId: inv.insightId,
        reason: inv.reason ?? '',
        toolCalls: capped,
      });
    }

    return plan;
  } catch {
    return null;
  }
}

function tryParseInvestigationFindings(content: string): InvestigationFindings | null {
  const json = extractJSON(content);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.findings)) return null;

    return {
      findings: parsed.findings
        .filter((f: Record<string, unknown>) => f.insightId && Array.isArray(f.evidence))
        .map((f: Record<string, unknown>) => ({
          insightId: f.insightId as string,
          evidence: f.evidence as string[],
          hypothesis: (f.hypothesis as string) ?? '',
          additionalToolCalls: Array.isArray(f.additionalToolCalls)
            ? (f.additionalToolCalls as PlannedToolCall[]).slice(0, MAX_ADDITIONAL_TOOL_CALLS)
            : undefined,
        })),
    };
  } catch {
    return null;
  }
}

function hasAdditionalToolCalls(findings: InvestigationFindings): boolean {
  return findings.findings.some(
    (f) => f.additionalToolCalls && f.additionalToolCalls.length > 0,
  );
}

function extractJSON(content: string): string | null {
  // Try ```json block first
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try bare JSON object
  const bare = content.match(/\{[\s\S]*\}/);
  if (bare) return bare[0];

  return null;
}
