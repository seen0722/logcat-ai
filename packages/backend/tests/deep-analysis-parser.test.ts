import { describe, it, expect } from 'vitest';

/**
 * Tests for the deep analysis response parsing logic.
 * We replicate tryParseDeepAnalysis here since it's not exported from the route.
 */

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

interface DeepAnalysisResult {
  executiveSummary: string;
  systemDiagnosis?: string;
  correlationFindings?: Array<{
    description: string;
    insightIds: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  prioritizedActions?: Array<{
    action: string;
    reason: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;
  insights: DeepAnalysisInsightItem[];
}

function tryParseDeepAnalysis(content: string): DeepAnalysisResult | null {
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

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.insights)) {
        return parsed as DeepAnalysisResult;
      }

      if (Array.isArray(parsed)) {
        return {
          executiveSummary: '',
          systemDiagnosis: '',
          insights: parsed as DeepAnalysisInsightItem[],
        };
      }
    } catch {
      // try next pattern
    }
  }

  return null;
}

describe('tryParseDeepAnalysis', () => {
  it('should parse new object format from code block', () => {
    const content = '```json\n' + JSON.stringify({
      executiveSummary: 'System is unstable due to ANR',
      systemDiagnosis: 'GPS HAL is blocking the main thread',
      correlationFindings: [{
        description: 'ANR correlates with OOM',
        insightIds: ['insight-1', 'insight-3'],
        confidence: 'high',
      }],
      prioritizedActions: [{
        action: 'Fix GPS HAL timeout',
        reason: 'Primary root cause',
        effort: 'medium',
        impact: 'high',
      }],
      insights: [{
        insightId: 'insight-1',
        rootCause: 'GPS HAL not responding',
        fixSuggestion: 'Add timeout to binder call',
        confidence: 'high',
        evidence: ['at vendor.gnss.GnssService.start()'],
        impactAssessment: 'App freezes for 15 seconds',
        debuggingSteps: ['adb shell dumpsys location'],
        relatedInsights: ['insight-3'],
        category: 'root_cause',
        affectedComponents: ['vendor.gnss@2.0'],
      }],
    }) + '\n```';

    const result = tryParseDeepAnalysis(content);
    expect(result).not.toBeNull();
    expect(result!.executiveSummary).toBe('System is unstable due to ANR');
    expect(result!.correlationFindings).toHaveLength(1);
    expect(result!.prioritizedActions).toHaveLength(1);
    expect(result!.insights).toHaveLength(1);
    expect(result!.insights[0].evidence).toContain('at vendor.gnss.GnssService.start()');
    expect(result!.insights[0].category).toBe('root_cause');
  });

  it('should parse new object format from raw JSON', () => {
    const content = JSON.stringify({
      executiveSummary: 'Summary',
      insights: [{
        insightId: 'insight-1',
        rootCause: 'Root cause',
        fixSuggestion: 'Fix',
        confidence: 'medium',
      }],
    });

    const result = tryParseDeepAnalysis(content);
    expect(result).not.toBeNull();
    expect(result!.executiveSummary).toBe('Summary');
    expect(result!.insights[0].insightId).toBe('insight-1');
  });

  it('should parse legacy array format (backward compatible)', () => {
    const content = '```json\n' + JSON.stringify([
      {
        insightId: 'insight-1',
        rootCause: 'Old format root cause',
        fixSuggestion: 'Old format fix',
        confidence: 'low',
      },
      {
        insightId: 'insight-2',
        rootCause: 'Another cause',
        fixSuggestion: 'Another fix',
        confidence: 'medium',
      },
    ]) + '\n```';

    const result = tryParseDeepAnalysis(content);
    expect(result).not.toBeNull();
    expect(result!.executiveSummary).toBe('');
    expect(result!.insights).toHaveLength(2);
    expect(result!.insights[0].rootCause).toBe('Old format root cause');
  });

  it('should parse legacy array format from raw JSON', () => {
    // When the content is just a raw array (no surrounding braces), it should be parsed
    const content = JSON.stringify([
      { insightId: 'insight-1', rootCause: 'cause', fixSuggestion: 'fix', confidence: 'high' },
    ]);

    const result = tryParseDeepAnalysis(content);
    expect(result).not.toBeNull();
    expect(result!.insights).toHaveLength(1);
  });

  it('should return null for invalid JSON', () => {
    expect(tryParseDeepAnalysis('not json at all')).toBeNull();
    expect(tryParseDeepAnalysis('```json\n{broken json}\n```')).toBeNull();
  });

  it('should return null for empty content', () => {
    expect(tryParseDeepAnalysis('')).toBeNull();
  });

  it('should return null for object without insights array', () => {
    const content = JSON.stringify({ foo: 'bar', baz: 123 });
    expect(tryParseDeepAnalysis(content)).toBeNull();
  });

  it('should handle JSON with surrounding text', () => {
    const content = `Based on my analysis, here are the findings:

\`\`\`json
{
  "executiveSummary": "The device experienced multiple ANRs",
  "insights": [
    {
      "insightId": "insight-1",
      "rootCause": "Binder timeout",
      "fixSuggestion": "Increase timeout",
      "confidence": "high"
    }
  ]
}
\`\`\`

These are the key issues found.`;

    const result = tryParseDeepAnalysis(content);
    expect(result).not.toBeNull();
    expect(result!.insights).toHaveLength(1);
  });

  it('should handle missing optional fields gracefully', () => {
    const content = JSON.stringify({
      executiveSummary: 'Summary',
      insights: [{
        insightId: 'insight-1',
        rootCause: 'Cause',
        fixSuggestion: 'Fix',
        confidence: 'high',
        // No evidence, debuggingSteps, etc.
      }],
    });

    const result = tryParseDeepAnalysis(content);
    expect(result).not.toBeNull();
    expect(result!.insights[0].evidence).toBeUndefined();
    expect(result!.insights[0].debuggingSteps).toBeUndefined();
    expect(result!.correlationFindings).toBeUndefined();
  });
});
