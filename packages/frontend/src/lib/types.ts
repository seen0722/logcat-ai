// Shared frontend types — mirrors the parser types needed by the UI.
// We duplicate a slim subset to avoid depending on the Node.js parser package.

export type Severity = 'critical' | 'warning' | 'info';
export type InsightCategory = 'anr' | 'crash' | 'memory' | 'kernel' | 'performance' | 'stability';

export interface InsightCard {
  id: string;
  severity: Severity;
  category: InsightCategory;
  title: string;
  description: string;
  relatedLogSnippet?: string;
  stackTrace?: string;
  timestamp?: string;
  source: 'logcat' | 'anr' | 'kernel' | 'cross';
  deepAnalysis?: {
    rootCause: string;
    fixSuggestion: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    impactAssessment: string;
    debuggingSteps: string[];
    relatedInsights: string[];
    category: 'root_cause' | 'symptom' | 'contributing_factor';
    affectedComponents: string[];
  };
}

export interface TimelineEvent {
  timestamp: string;
  source: 'logcat' | 'anr' | 'kernel';
  severity: Severity;
  label: string;
  details?: string;
  count?: number;
  timeRange?: string;
}

export interface SystemHealthScore {
  overall: number;
  breakdown: {
    stability: number;
    memory: number;
    responsiveness: number;
    kernel: number;
  };
}

export interface BugreportMetadata {
  androidVersion: string;
  sdkLevel: number;
  buildFingerprint: string;
  deviceModel: string;
  manufacturer: string;
  buildDate: string;
  bugreportTimestamp: string;
  kernelVersion: string;
}

export interface BinderTargetInfo {
  interfaceName: string;
  packageName: string;
  method: string;
  callerClass: string;
  callerMethod: string;
}

export interface ThreadBlockAnalysis {
  thread: {
    name: string;
    state: string;
    stackFrames: Array<{ raw: string; className: string; methodName: string }>;
  };
  blockReason: string;
  blockingChain: Array<{ name: string; tid: number; state: string }>;
  confidence: 'high' | 'medium' | 'low';
  binderTarget?: BinderTargetInfo;
  suspectedBinderTargets?: Array<BinderTargetInfo & { threadName: string; threadState: string }>;
}

export interface ANRTraceAnalysis {
  pid: number;
  processName: string;
  timestamp?: string;
  subject?: string;
  mainThread: ThreadBlockAnalysis | null;
  blockedThread?: ThreadBlockAnalysis | null;
  blockedThreadName?: string;
  lockGraph: {
    nodes: Array<{ tid: number; threadName: string }>;
    edges: Array<{ from: number; to: number; lockAddress: string; lockClassName: string }>;
  };
  deadlocks: {
    detected: boolean;
    cycles: Array<{
      threads: Array<{ name: string; tid: number }>;
      locks: Array<{ address: string; className: string }>;
    }>;
  };
  binderThreads: {
    total: number;
    busy: number;
    idle: number;
    exhausted: boolean;
  };
}

export interface MemInfoProcess {
  pid: number;
  processName: string;
  totalPssKb: number;
}

export interface MemInfoSummary {
  totalRamKb: number;
  freeRamKb: number;
  usedRamKb: number;
  topProcesses: MemInfoProcess[];
}

export interface CpuInfoProcess {
  pid: number;
  processName: string;
  cpuPercent: number;
}

export interface CpuInfoSummary {
  totalCpuPercent: number;
  userPercent: number;
  kernelPercent: number;
  ioWaitPercent: number;
  topProcesses: CpuInfoProcess[];
}

export interface BootStatusSummary {
  bootCompleted: boolean;
  bootReason?: string;
  systemServerRestarts: number;
  uptimeSeconds?: number;
}

export interface HALService {
  interfaceName: string;
  transport: string;
  arch?: string;
  status: string;
  isVendor: boolean;
}

export interface HALFamily {
  familyName: string;
  shortName: string;
  highestVersion: string;
  highestStatus: string;
  isVendor: boolean;
  versionCount: number;
}

export interface HALStatusSummary {
  totalServices: number;
  aliveCount: number;
  nonResponsiveCount: number;
  declaredCount: number;
  nonResponsiveServices: HALService[];
  declaredServices: HALService[];
  families: HALFamily[];
  vendorIssueCount: number;
}

export interface DeepAnalysisOverview {
  executiveSummary: string;
  systemDiagnosis: string;
  correlationFindings: Array<{
    description: string;
    insightIds: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  prioritizedActions: Array<{
    action: string;
    reason: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;
}

export interface AnalysisResult {
  metadata: BugreportMetadata;
  insights: InsightCard[];
  timeline: TimelineEvent[];
  healthScore: SystemHealthScore;
  anrAnalyses: ANRTraceAnalysis[];
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  bootStatus?: BootStatusSummary;
  halStatus?: HALStatusSummary;
  deepAnalysisOverview?: DeepAnalysisOverview;
}

// SSE progress from backend
export interface SSEProgress {
  stage: 'unpacking' | 'parsing' | 'analyzing' | 'deep_analysis' | 'complete' | 'error';
  progress: number;
  message: string;
  data?: AnalysisResult | { chunk: string; done: boolean };
}

export interface UploadResponse {
  id: string;
  filename: string;
  size: number;
}

export type AnalysisMode = 'quick' | 'deep';

export const QUICK_TAGS = ['ANR', 'Crash', 'Reboot', 'Battery', 'Jank', 'OOM'] as const;
export type QuickTag = typeof QUICK_TAGS[number];
