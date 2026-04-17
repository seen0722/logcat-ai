/**
 * Shared types for agentic multi-pass deep analysis.
 * Used across triage, investigation, and orchestrator modules.
 */

export interface PlannedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface TriageInvestigation {
  insightId: string;
  reason: string;
  toolCalls: PlannedToolCall[];
}

export interface TriagePlan {
  investigations: TriageInvestigation[];
  skipInsightIds: string[];
  skipReason?: string;
}

export interface InvestigationFinding {
  insightId: string;
  evidence: string[];
  hypothesis: string;
  additionalToolCalls?: PlannedToolCall[];
}

export interface InvestigationFindings {
  findings: InvestigationFinding[];
}

export interface AgenticProgressEvent {
  subStage: 'triage' | 'investigating' | 'analyzing';
  message: string;
  toolCall?: { name: string; insightId?: string };
}
