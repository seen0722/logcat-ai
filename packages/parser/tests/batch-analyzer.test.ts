import { describe, it, expect } from 'vitest';
import { aggregateBatch, type BatchItem } from '../src/batch-analyzer.js';
import type { AnalysisResult, InsightCard, SystemHealthScore, BugreportMetadata } from '../src/types.js';

function makeBatchItem(id: string, overrides: Partial<{
  filename: string;
  healthScore: number;
  deviceModel: string;
  manufacturer: string;
  insights: InsightCard[];
  anrProcesses: string[];
}>): BatchItem {
  const healthScore: SystemHealthScore = {
    overall: overrides.healthScore ?? 80,
    breakdown: { stability: 90, memory: 85, responsiveness: 75, kernel: 70 },
  };

  return {
    id,
    filename: overrides.filename ?? `bugreport-${id}.zip`,
    result: {
      metadata: {
        deviceModel: overrides.deviceModel ?? 'T70',
        manufacturer: overrides.manufacturer ?? 'TestCo',
        androidVersion: '15',
        buildFingerprint: 'test',
        bugreportTimestamp: new Date('2026-04-10'),
      } as BugreportMetadata,
      healthScore,
      insights: overrides.insights ?? [],
      logcatResult: { entries: [], anomalies: [], parseErrors: 0, tagStats: [] },
      kernelResult: { entries: [], events: [], parseErrors: 0, format: 'dmesg' },
      anrAnalyses: (overrides.anrProcesses ?? []).map(p => ({
        processName: p,
        pid: 1000,
        mainThread: { name: 'main', tid: 1, state: 'Blocked', stackFrames: [] },
        threads: [],
        binderThreads: { total: 0, busy: 0, idle: 0, exhausted: false },
        deadlocks: { detected: false, cycles: [] },
      })) as any,
      timeline: [],
    } as AnalysisResult,
  };
}

function makeInsight(title: string, category: string, severity: 'critical' | 'warning' | 'info' = 'warning'): InsightCard {
  return { id: '', title, category, severity, source: 'logcat', description: '' };
}

describe('aggregateBatch', () => {
  it('should return empty aggregation for empty input', () => {
    const result = aggregateBatch([]);

    expect(result.totalReports).toBe(0);
    expect(result.avgHealthScore).toBe(0);
    expect(result.healthRange).toEqual({ min: 0, max: 0 });
    expect(result.commonIssues).toHaveLength(0);
    expect(result.deviceDistribution).toHaveLength(0);
    expect(result.criticalCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.anrProcesses).toHaveLength(0);
  });

  it('should compute health score stats correctly', () => {
    const items = [
      makeBatchItem('1', { healthScore: 60 }),
      makeBatchItem('2', { healthScore: 80 }),
      makeBatchItem('3', { healthScore: 100 }),
    ];

    const result = aggregateBatch(items);

    expect(result.totalReports).toBe(3);
    expect(result.avgHealthScore).toBe(80);
    expect(result.healthRange.min).toBe(60);
    expect(result.healthRange.max).toBe(100);
  });

  it('should aggregate device distribution', () => {
    const items = [
      makeBatchItem('1', { deviceModel: 'T70', manufacturer: 'Sierra', healthScore: 80 }),
      makeBatchItem('2', { deviceModel: 'T70', manufacturer: 'Sierra', healthScore: 90 }),
      makeBatchItem('3', { deviceModel: 'T80', manufacturer: 'Acme', healthScore: 60 }),
    ];

    const result = aggregateBatch(items);

    expect(result.deviceDistribution).toHaveLength(2);
    const t70 = result.deviceDistribution.find(d => d.model === 'T70');
    expect(t70!.count).toBe(2);
    expect(t70!.avgHealthScore).toBe(85);
    expect(t70!.manufacturer).toBe('Sierra');
  });

  it('should count critical and warning insights', () => {
    const items = [
      makeBatchItem('1', {
        insights: [
          makeInsight('ANR detected', 'anr', 'critical'),
          makeInsight('OOM kill', 'memory', 'critical'),
          makeInsight('Slow operation', 'performance', 'warning'),
        ],
      }),
      makeBatchItem('2', {
        insights: [
          makeInsight('ANR detected', 'anr', 'critical'),
          makeInsight('SELinux denial', 'kernel', 'info'),
        ],
      }),
    ];

    const result = aggregateBatch(items);

    expect(result.criticalCount).toBe(3);
    expect(result.warningCount).toBe(1);
  });

  it('should identify common issues across reports', () => {
    const items = [
      makeBatchItem('1', {
        deviceModel: 'T70',
        insights: [makeInsight('ANR: Slow Binder', 'anr', 'critical')],
      }),
      makeBatchItem('2', {
        deviceModel: 'T80',
        insights: [makeInsight('ANR: Slow Binder', 'anr', 'critical')],
      }),
      makeBatchItem('3', {
        deviceModel: 'T70',
        insights: [makeInsight('ANR: Slow Binder', 'anr', 'critical')],
      }),
    ];

    const result = aggregateBatch(items);

    expect(result.commonIssues.length).toBeGreaterThanOrEqual(1);
    const anrIssue = result.commonIssues.find(i => i.title.includes('ANR'));
    expect(anrIssue!.count).toBe(3);
    expect(anrIssue!.deviceModels).toContain('T70');
    expect(anrIssue!.deviceModels).toContain('T80');
  });

  it('should normalize issue titles (strip ×N counts) for matching', () => {
    const items = [
      makeBatchItem('1', {
        insights: [makeInsight('SELinux denial (×221)', 'kernel', 'info')],
      }),
      makeBatchItem('2', {
        insights: [makeInsight('SELinux denial (×50)', 'kernel', 'info')],
      }),
    ];

    const result = aggregateBatch(items);

    const selinux = result.commonIssues.find(i => i.title.includes('SELinux'));
    expect(selinux).toBeDefined();
    expect(selinux!.count).toBe(2);
  });

  it('should aggregate ANR processes across reports', () => {
    const items = [
      makeBatchItem('1', { anrProcesses: ['system_server', 'com.example.app'] }),
      makeBatchItem('2', { anrProcesses: ['system_server'] }),
      makeBatchItem('3', { anrProcesses: ['com.other.app'] }),
    ];

    const result = aggregateBatch(items);

    expect(result.anrProcesses).toHaveLength(3);
    const systemServer = result.anrProcesses.find(p => p.processName === 'system_server');
    expect(systemServer!.count).toBe(2);
  });

  it('should sort common issues by count then severity', () => {
    const items = [
      makeBatchItem('1', {
        insights: [
          makeInsight('Issue A', 'cat', 'info'),
          makeInsight('Issue B', 'cat', 'critical'),
        ],
      }),
      makeBatchItem('2', {
        insights: [
          makeInsight('Issue A', 'cat', 'info'),
          makeInsight('Issue B', 'cat', 'critical'),
        ],
      }),
      makeBatchItem('3', {
        insights: [
          makeInsight('Issue A', 'cat', 'info'),
        ],
      }),
    ];

    const result = aggregateBatch(items);

    expect(result.commonIssues[0].title).toBe('Issue A');
    expect(result.commonIssues[1].title).toBe('Issue B');
  });

  it('should limit common issues to top 20', () => {
    const insights = Array.from({ length: 25 }, (_, i) =>
      makeInsight(`Unique Issue ${i}`, `cat${i}`, 'warning')
    );

    const items = [makeBatchItem('1', { insights })];

    const result = aggregateBatch(items);

    expect(result.commonIssues.length).toBeLessThanOrEqual(20);
  });

  it('should handle single report', () => {
    const items = [makeBatchItem('1', { healthScore: 75 })];

    const result = aggregateBatch(items);

    expect(result.totalReports).toBe(1);
    expect(result.avgHealthScore).toBe(75);
    expect(result.healthRange).toEqual({ min: 75, max: 75 });
  });
});
