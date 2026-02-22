import { AnalysisResult, InsightCard, Severity } from './types.js';

export interface BatchItem {
  id: string;
  filename: string;
  result: AnalysisResult;
}

export interface CommonIssue {
  title: string;
  category: string;
  severity: Severity;
  count: number;       // How many reports have this issue
  deviceModels: string[];
}

export interface DeviceDistribution {
  model: string;
  manufacturer: string;
  count: number;
  avgHealthScore: number;
}

export interface BatchAggregation {
  totalReports: number;
  avgHealthScore: number;
  healthRange: { min: number; max: number };
  commonIssues: CommonIssue[];
  deviceDistribution: DeviceDistribution[];
  criticalCount: number;
  warningCount: number;
  anrProcesses: Array<{ processName: string; count: number }>;
}

export function aggregateBatch(items: BatchItem[]): BatchAggregation {
  if (items.length === 0) {
    return {
      totalReports: 0,
      avgHealthScore: 0,
      healthRange: { min: 0, max: 0 },
      commonIssues: [],
      deviceDistribution: [],
      criticalCount: 0,
      warningCount: 0,
      anrProcesses: [],
    };
  }

  // Health scores
  const scores = items.map(i => i.result.healthScore.overall);
  const avgHealthScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const healthRange = { min: Math.min(...scores), max: Math.max(...scores) };

  // Count critical/warning across all reports
  let criticalCount = 0;
  let warningCount = 0;

  // Common issues: track by title+category signature
  const issueMap = new Map<string, { insight: InsightCard; count: number; models: Set<string> }>();

  // Device distribution
  const deviceMap = new Map<string, { manufacturer: string; count: number; totalScore: number }>();

  // ANR processes
  const anrMap = new Map<string, number>();

  for (const item of items) {
    const model = item.result.metadata.deviceModel || 'Unknown';
    const manufacturer = item.result.metadata.manufacturer || 'Unknown';

    // Device distribution
    const deviceKey = model;
    const existing = deviceMap.get(deviceKey);
    if (existing) {
      existing.count++;
      existing.totalScore += item.result.healthScore.overall;
    } else {
      deviceMap.set(deviceKey, { manufacturer, count: 1, totalScore: item.result.healthScore.overall });
    }

    // Issues
    for (const insight of item.result.insights) {
      if (insight.severity === 'critical') criticalCount++;
      if (insight.severity === 'warning') warningCount++;

      // Normalize title for matching (strip counts, specific timestamps)
      const sig = `${insight.title.replace(/×\d+/g, '').replace(/\(\d+\)/g, '').trim()}::${insight.category}`;
      const entry = issueMap.get(sig);
      if (entry) {
        entry.count++;
        entry.models.add(model);
      } else {
        issueMap.set(sig, { insight, count: 1, models: new Set([model]) });
      }
    }

    // ANR processes
    for (const anr of item.result.anrAnalyses) {
      anrMap.set(anr.processName, (anrMap.get(anr.processName) ?? 0) + 1);
    }
  }

  // Sort common issues by count (most common first), then by severity
  const commonIssues: CommonIssue[] = [...issueMap.values()]
    .map(({ insight, count, models }) => ({
      title: insight.title,
      category: insight.category,
      severity: insight.severity,
      count,
      deviceModels: [...models],
    }))
    .sort((a, b) => b.count - a.count || severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 20);

  const deviceDistribution: DeviceDistribution[] = [...deviceMap.entries()]
    .map(([model, data]) => ({
      model,
      manufacturer: data.manufacturer,
      count: data.count,
      avgHealthScore: Math.round(data.totalScore / data.count),
    }))
    .sort((a, b) => b.count - a.count);

  const anrProcesses = [...anrMap.entries()]
    .map(([processName, count]) => ({ processName, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalReports: items.length,
    avgHealthScore,
    healthRange,
    commonIssues,
    deviceDistribution,
    criticalCount,
    warningCount,
    anrProcesses,
  };
}

function severityRank(s: Severity): number {
  switch (s) {
    case 'critical': return 3;
    case 'warning': return 2;
    case 'info': return 1;
    default: return 0;
  }
}
