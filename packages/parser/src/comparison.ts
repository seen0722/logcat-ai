import {
  AnalysisResult,
  InsightCard,
  SystemHealthScore,
  HALFamily,
  HALStatusSummary,
  Severity,
  PowerParseResult,
  TelephonyParseResult,
  BugreportMetadata,
} from './types.js';

// ============================================================
// Comparison Types
// ============================================================

export interface HealthDiffItem {
  left: number;
  right: number;
  delta: number;
}

export interface HealthDiff {
  overall: HealthDiffItem;
  stability: HealthDiffItem;
  memory: HealthDiffItem;
  responsiveness: HealthDiffItem;
  kernel: HealthDiffItem;
}

export interface InsightDiff {
  resolved: InsightCard[];    // In left only (fixed)
  newIssues: InsightCard[];   // In right only (new)
  persistent: InsightCard[];  // In both
}

export interface ANRDiff {
  resolved: string[];    // Process names in left only
  newIssues: string[];   // Process names in right only
  persistent: string[];  // Process names in both
}

export interface HALChange {
  familyName: string;
  leftStatus: string;
  rightStatus: string;
}

export interface HALDiff {
  changes: HALChange[];
}

/** Side-by-side metadata for Hero section (not a diff — display only) */
export interface MetadataSummary {
  deviceModel: string;
  manufacturer: string;
  androidVersion: string;
  buildType: string;
  buildFingerprint: string;
  bugreportTimestamp?: string; // ISO string
  serialNumber?: string;
  securityPatchLevel?: string;
  basebandVersion?: string;
}

export interface MetadataDiff {
  left: MetadataSummary;
  right: MetadataSummary;
}

export interface PowerDiff {
  present: boolean;
  dozeRateMahPerHr?: HealthDiffItem;
  suspendSuccessPercent?: HealthDiffItem;
  deepDozePercent?: HealthDiffItem;
  totalDischargeMah?: HealthDiffItem;
}

export interface TelephonyDiff {
  present: boolean;
  totalOosMs?: HealthDiffItem;
  oosPercentage?: HealthDiffItem;
  rilErrorCount?: HealthDiffItem;
  modemRestartCount?: HealthDiffItem;
  signalLevel?: HealthDiffItem;
}

export interface ComparisonResult {
  leftId: string;
  rightId: string;
  metadataDiff: MetadataDiff;
  healthDiff: HealthDiff;
  insightDiff: InsightDiff;
  anrDiff: ANRDiff;
  halDiff: HALDiff;
  powerDiff: PowerDiff;
  telephonyDiff: TelephonyDiff;
}

// ============================================================
// Comparison Logic
// ============================================================

/**
 * Build a signature for an insight that strips variable parts (IDs, counts)
 * so that logically equivalent insights from two runs can be matched.
 */
function insightSignature(insight: InsightCard): string {
  // Normalize the title by stripping numeric counts and IDs
  const normalizedTitle = insight.title
    .replace(/\d+/g, '#')       // replace all numbers with '#'
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim();
  return `${normalizedTitle}|${insight.category}|${insight.source}`;
}

/**
 * Compare health scores between two analyses.
 * Delta = right - left. Positive delta means improvement (higher score = better).
 */
function compareHealth(left: SystemHealthScore, right: SystemHealthScore): HealthDiff {
  return {
    overall: {
      left: left.overall,
      right: right.overall,
      delta: right.overall - left.overall,
    },
    stability: {
      left: left.breakdown.stability,
      right: right.breakdown.stability,
      delta: right.breakdown.stability - left.breakdown.stability,
    },
    memory: {
      left: left.breakdown.memory,
      right: right.breakdown.memory,
      delta: right.breakdown.memory - left.breakdown.memory,
    },
    responsiveness: {
      left: left.breakdown.responsiveness,
      right: right.breakdown.responsiveness,
      delta: right.breakdown.responsiveness - left.breakdown.responsiveness,
    },
    kernel: {
      left: left.breakdown.kernel,
      right: right.breakdown.kernel,
      delta: right.breakdown.kernel - left.breakdown.kernel,
    },
  };
}

/**
 * Compare insights between two analyses using signature matching.
 * Insight in left but not right = "resolved" (fixed).
 * Insight in right but not left = "newIssues" (regression or new problem).
 * Insight in both = "persistent".
 */
function compareInsights(left: InsightCard[], right: InsightCard[]): InsightDiff {
  const leftSigs = new Map<string, InsightCard>();
  for (const card of left) {
    leftSigs.set(insightSignature(card), card);
  }

  const rightSigs = new Map<string, InsightCard>();
  for (const card of right) {
    rightSigs.set(insightSignature(card), card);
  }

  const resolved: InsightCard[] = [];
  const newIssues: InsightCard[] = [];
  const persistent: InsightCard[] = [];

  // Check left insights: if not in right, it's resolved
  for (const [sig, card] of leftSigs) {
    if (rightSigs.has(sig)) {
      persistent.push(card);
    } else {
      resolved.push(card);
    }
  }

  // Check right insights: if not in left, it's new
  for (const [sig, card] of rightSigs) {
    if (!leftSigs.has(sig)) {
      newIssues.push(card);
    }
  }

  return { resolved, newIssues, persistent };
}

/**
 * Compare ANRs between two analyses by process name.
 */
function compareANRs(left: AnalysisResult, right: AnalysisResult): ANRDiff {
  const leftProcesses = new Set(left.anrAnalyses.map((a) => a.processName));
  const rightProcesses = new Set(right.anrAnalyses.map((a) => a.processName));

  const resolved: string[] = [];
  const newIssues: string[] = [];
  const persistent: string[] = [];

  for (const name of leftProcesses) {
    if (rightProcesses.has(name)) {
      persistent.push(name);
    } else {
      resolved.push(name);
    }
  }

  for (const name of rightProcesses) {
    if (!leftProcesses.has(name)) {
      newIssues.push(name);
    }
  }

  return { resolved, newIssues, persistent };
}

/**
 * Compare HAL family status changes between two analyses.
 * Only includes families where the status actually changed.
 * Handles null/undefined halStatus gracefully.
 */
function compareHALs(left: AnalysisResult, right: AnalysisResult): HALDiff {
  const changes: HALChange[] = [];

  const leftFamilies = left.halStatus?.families ?? [];
  const rightFamilies = right.halStatus?.families ?? [];

  // Build maps by familyName for easy lookup
  const leftMap = new Map<string, HALFamily>();
  for (const family of leftFamilies) {
    leftMap.set(family.familyName, family);
  }

  const rightMap = new Map<string, HALFamily>();
  for (const family of rightFamilies) {
    rightMap.set(family.familyName, family);
  }

  // All unique family names across both
  const allNames = new Set([...leftMap.keys(), ...rightMap.keys()]);

  for (const name of allNames) {
    const leftFamily = leftMap.get(name);
    const rightFamily = rightMap.get(name);

    const leftStatus = leftFamily?.highestStatus ?? 'absent';
    const rightStatus = rightFamily?.highestStatus ?? 'absent';

    if (leftStatus !== rightStatus) {
      changes.push({
        familyName: name,
        leftStatus,
        rightStatus,
      });
    }
  }

  return { changes };
}

function diffItem(l: number, r: number): HealthDiffItem {
  return { left: l, right: r, delta: Math.round((r - l) * 100) / 100 };
}

function extractMetadata(meta: BugreportMetadata): MetadataSummary {
  return {
    deviceModel: meta.deviceModel,
    manufacturer: meta.manufacturer,
    androidVersion: meta.androidVersion,
    buildType: meta.buildType ?? 'unknown',
    buildFingerprint: meta.buildFingerprint,
    bugreportTimestamp: meta.bugreportTimestamp instanceof Date
      ? meta.bugreportTimestamp.toISOString()
      : meta.bugreportTimestamp ? String(meta.bugreportTimestamp) : undefined,
    serialNumber: meta.serialNumber,
    securityPatchLevel: meta.securityPatchLevel,
    basebandVersion: meta.basebandVersion,
  };
}

function comparePower(left?: PowerParseResult, right?: PowerParseResult): PowerDiff {
  if (!left?.batteryStats || !right?.batteryStats) {
    return { present: false };
  }
  const lb = left.batteryStats;
  const rb = right.batteryStats;

  const result: PowerDiff = { present: true };

  if (lb.deepDozeDischargeRateMahPerHr != null && rb.deepDozeDischargeRateMahPerHr != null) {
    result.dozeRateMahPerHr = diffItem(lb.deepDozeDischargeRateMahPerHr, rb.deepDozeDischargeRateMahPerHr);
  }
  if (left.suspendStats && right.suspendStats) {
    result.suspendSuccessPercent = diffItem(
      left.suspendStats.suspendSuccessRate * 100,
      right.suspendStats.suspendSuccessRate * 100,
    );
  }
  if (lb.deepDozeTimeMs != null && lb.timePeriodMs > 0 && rb.deepDozeTimeMs != null && rb.timePeriodMs > 0) {
    result.deepDozePercent = diffItem(
      (lb.deepDozeTimeMs / lb.timePeriodMs) * 100,
      (rb.deepDozeTimeMs / rb.timePeriodMs) * 100,
    );
  }
  result.totalDischargeMah = diffItem(lb.totalDischargeMah, rb.totalDischargeMah);
  return result;
}

function getOosTotalMs(tel: TelephonyParseResult): number {
  const ratOosEntry = undefined; // RAT OOS is on PowerParseResult, not here
  const periods = tel.dumpsysOosPeriods ?? [];
  if (periods.length > 0) return periods.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
  return tel.oosEvents.filter(e => e.type === 'oos_end').reduce((sum, e) => sum + (e.durationMs || 0), 0);
}

function compareTelephony(
  left?: TelephonyParseResult, right?: TelephonyParseResult,
  leftPower?: PowerParseResult, rightPower?: PowerParseResult,
): TelephonyDiff {
  if (!left || !right) return { present: false };

  const result: TelephonyDiff = { present: true };

  // OOS: prefer RAT distribution > dumpsys > radio log
  const leftRatOos = leftPower?.connectivityStats?.cellularRatDistribution?.find(e => e.rat === 'oos');
  const rightRatOos = rightPower?.connectivityStats?.cellularRatDistribution?.find(e => e.rat === 'oos');

  const leftOosMs = leftRatOos ? leftRatOos.timeMs : getOosTotalMs(left);
  const rightOosMs = rightRatOos ? rightRatOos.timeMs : getOosTotalMs(right);
  result.totalOosMs = diffItem(leftOosMs, rightOosMs);

  if (leftRatOos && rightRatOos) {
    result.oosPercentage = diffItem(leftRatOos.percentage, rightRatOos.percentage);
  }

  result.rilErrorCount = diffItem(left.rilErrors.length, right.rilErrors.length);
  result.modemRestartCount = diffItem(left.modemRestartCount ?? 0, right.modemRestartCount ?? 0);

  if (left.signalStrength && right.signalStrength) {
    result.signalLevel = diffItem(left.signalStrength.level, right.signalStrength.level);
  }

  return result;
}

/**
 * Compare two analysis results to produce a structured diff.
 * Useful for regression tracking and before/after analysis.
 */
export function compareAnalyses(
  leftId: string,
  rightId: string,
  left: AnalysisResult,
  right: AnalysisResult,
): ComparisonResult {
  return {
    leftId,
    rightId,
    metadataDiff: {
      left: extractMetadata(left.metadata),
      right: extractMetadata(right.metadata),
    },
    healthDiff: compareHealth(left.healthScore, right.healthScore),
    insightDiff: compareInsights(left.insights, right.insights),
    anrDiff: compareANRs(left, right),
    halDiff: compareHALs(left, right),
    powerDiff: comparePower(left.powerStatus, right.powerStatus),
    telephonyDiff: compareTelephony(
      left.telephonyStatus, right.telephonyStatus,
      left.powerStatus, right.powerStatus,
    ),
  };
}
