import { describe, it, expect } from 'vitest';
import { compareAnalyses } from '../src/comparison.js';
import type { AnalysisResult, InsightCard, HALFamily, HALStatusSummary, PowerParseResult, TelephonyParseResult, BugreportMetadata, SystemHealthScore } from '../src/types.js';

function makeResult(overrides: Partial<{
  healthScore: SystemHealthScore;
  insights: InsightCard[];
  anrProcesses: string[];
  halFamilies: HALFamily[];
  metadata: Partial<BugreportMetadata>;
  powerStatus: PowerParseResult;
  telephonyStatus: TelephonyParseResult;
}>): AnalysisResult {
  const defaultHealth: SystemHealthScore = {
    overall: 80,
    breakdown: { stability: 90, memory: 85, responsiveness: 75, kernel: 70 },
  };

  return {
    metadata: {
      deviceModel: 'T70',
      manufacturer: 'TestCo',
      androidVersion: '15',
      buildFingerprint: 'test/T70/T70:15/AP3A.241005.015/eng.user.20260101:userdebug/test-keys',
      bugreportTimestamp: new Date('2026-04-10T09:00:00Z'),
      buildType: 'userdebug',
      ...(overrides.metadata ?? {}),
    } as BugreportMetadata,
    healthScore: overrides.healthScore ?? defaultHealth,
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
    halStatus: overrides.halFamilies ? {
      families: overrides.halFamilies,
      truncated: false,
    } as HALStatusSummary : undefined,
    powerStatus: overrides.powerStatus,
    telephonyStatus: overrides.telephonyStatus,
    timeline: [],
  } as AnalysisResult;
}

function makeInsight(title: string, category: string, severity: 'critical' | 'warning' | 'info' = 'warning', source = 'logcat'): InsightCard {
  return { id: '', title, category, severity, source, description: '' };
}

describe('compareAnalyses', () => {
  it('should compute health score diffs (delta = right - left)', () => {
    const left = makeResult({
      healthScore: { overall: 60, breakdown: { stability: 70, memory: 80, responsiveness: 50, kernel: 40 } },
    });
    const right = makeResult({
      healthScore: { overall: 85, breakdown: { stability: 90, memory: 85, responsiveness: 80, kernel: 85 } },
    });

    const result = compareAnalyses('left-id', 'right-id', left, right);

    expect(result.healthDiff.overall.delta).toBe(25);
    expect(result.healthDiff.stability.delta).toBe(20);
    expect(result.healthDiff.memory.delta).toBe(5);
    expect(result.healthDiff.responsiveness.delta).toBe(30);
    expect(result.healthDiff.kernel.delta).toBe(45);
  });

  it('should identify resolved insights (in left only)', () => {
    const left = makeResult({
      insights: [makeInsight('ANR: Slow Binder Call', 'anr', 'critical')],
    });
    const right = makeResult({ insights: [] });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.insightDiff.resolved).toHaveLength(1);
    expect(result.insightDiff.newIssues).toHaveLength(0);
    expect(result.insightDiff.persistent).toHaveLength(0);
  });

  it('should identify new issues (in right only)', () => {
    const left = makeResult({ insights: [] });
    const right = makeResult({
      insights: [makeInsight('OOM kill detected', 'memory', 'critical')],
    });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.insightDiff.newIssues).toHaveLength(1);
    expect(result.insightDiff.resolved).toHaveLength(0);
  });

  it('should match persistent insights with normalized titles (strip counts)', () => {
    const leftInsight = makeInsight('SELinux denial ×221', 'kernel', 'info');
    const rightInsight = makeInsight('SELinux denial ×150', 'kernel', 'info');

    const left = makeResult({ insights: [leftInsight] });
    const right = makeResult({ insights: [rightInsight] });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.insightDiff.persistent).toHaveLength(1);
    expect(result.insightDiff.resolved).toHaveLength(0);
    expect(result.insightDiff.newIssues).toHaveLength(0);
  });

  it('should compare ANR processes', () => {
    const left = makeResult({ anrProcesses: ['com.example.app', 'system_server'] });
    const right = makeResult({ anrProcesses: ['system_server', 'com.new.app'] });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.anrDiff.resolved).toContain('com.example.app');
    expect(result.anrDiff.newIssues).toContain('com.new.app');
    expect(result.anrDiff.persistent).toContain('system_server');
  });

  it('should compare HAL status changes', () => {
    const left = makeResult({
      halFamilies: [
        { familyName: 'IGnss', highestVersion: '2.1', highestStatus: 'alive', instances: [] } as any,
        { familyName: 'ICamera', highestVersion: '1.0', highestStatus: 'alive', instances: [] } as any,
      ],
    });
    const right = makeResult({
      halFamilies: [
        { familyName: 'IGnss', highestVersion: '2.1', highestStatus: 'non-responsive', instances: [] } as any,
        { familyName: 'ICamera', highestVersion: '1.0', highestStatus: 'alive', instances: [] } as any,
      ],
    });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.halDiff.changes).toHaveLength(1);
    expect(result.halDiff.changes[0]).toEqual({
      familyName: 'IGnss',
      leftStatus: 'alive',
      rightStatus: 'non-responsive',
    });
  });

  it('should handle missing HAL status gracefully', () => {
    const left = makeResult({});
    const right = makeResult({});

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.halDiff.changes).toHaveLength(0);
  });

  it('should extract metadata for both sides', () => {
    const left = makeResult({
      metadata: { deviceModel: 'T70', manufacturer: 'Sierra', serialNumber: 'SN001' },
    });
    const right = makeResult({
      metadata: { deviceModel: 'T70', manufacturer: 'Sierra', serialNumber: 'SN002' },
    });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.metadataDiff.left.serialNumber).toBe('SN001');
    expect(result.metadataDiff.right.serialNumber).toBe('SN002');
    expect(result.metadataDiff.left.deviceModel).toBe('T70');
  });

  it('should compare power data when present', () => {
    const left = makeResult({
      powerStatus: {
        batteryStats: {
          totalDischargeMah: 500,
          deepDozeDischargeRateMahPerHr: 10,
          deepDozeTimeMs: 3600000,
          timePeriodMs: 7200000,
        },
        suspendStats: { suspendSuccessRate: 0.95 },
      } as any,
    });
    const right = makeResult({
      powerStatus: {
        batteryStats: {
          totalDischargeMah: 300,
          deepDozeDischargeRateMahPerHr: 5,
          deepDozeTimeMs: 5400000,
          timePeriodMs: 7200000,
        },
        suspendStats: { suspendSuccessRate: 0.98 },
      } as any,
    });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.powerDiff.present).toBe(true);
    expect(result.powerDiff.dozeRateMahPerHr!.delta).toBe(-5);
    expect(result.powerDiff.totalDischargeMah!.delta).toBe(-200);
    expect(result.powerDiff.suspendSuccessPercent!.delta).toBeCloseTo(3);
  });

  it('should return powerDiff.present=false when no power data', () => {
    const left = makeResult({});
    const right = makeResult({});

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.powerDiff.present).toBe(false);
  });

  it('should compare telephony data when present', () => {
    const left = makeResult({
      telephonyStatus: {
        oosEvents: [],
        rilErrors: [{ timestamp: '01-01', type: 'radio_not_available' }] as any,
        callEvents: [],
        smsEvents: [],
        ratChanges: [],
        simSlotCount: 1,
        modemRestartCount: 2,
        signalStrength: { level: 3 } as any,
        dumpsysOosPeriods: [{ durationMs: 5000 }] as any,
      } as TelephonyParseResult,
    });
    const right = makeResult({
      telephonyStatus: {
        oosEvents: [],
        rilErrors: [],
        callEvents: [],
        smsEvents: [],
        ratChanges: [],
        simSlotCount: 1,
        modemRestartCount: 0,
        signalStrength: { level: 4 } as any,
        dumpsysOosPeriods: [],
      } as TelephonyParseResult,
    });

    const result = compareAnalyses('l', 'r', left, right);

    expect(result.telephonyDiff.present).toBe(true);
    expect(result.telephonyDiff.rilErrorCount!.delta).toBe(-1);
    expect(result.telephonyDiff.modemRestartCount!.delta).toBe(-2);
    expect(result.telephonyDiff.signalLevel!.delta).toBe(1);
  });

  it('should return telephonyDiff.present=false when no telephony data', () => {
    const result = compareAnalyses('l', 'r', makeResult({}), makeResult({}));
    expect(result.telephonyDiff.present).toBe(false);
  });

  it('should include leftId and rightId in result', () => {
    const result = compareAnalyses('abc-123', 'def-456', makeResult({}), makeResult({}));

    expect(result.leftId).toBe('abc-123');
    expect(result.rightId).toBe('def-456');
  });

  it('should detect HAL appearing or disappearing', () => {
    const left = makeResult({
      halFamilies: [
        { familyName: 'IGnss', highestVersion: '2.1', highestStatus: 'alive', instances: [] } as any,
      ],
    });
    const right = makeResult({
      halFamilies: [
        { familyName: 'ICamera', highestVersion: '1.0', highestStatus: 'alive', instances: [] } as any,
      ],
    });

    const result = compareAnalyses('l', 'r', left, right);

    // IGnss: alive → absent, ICamera: absent → alive
    expect(result.halDiff.changes).toHaveLength(2);
    const gnss = result.halDiff.changes.find(c => c.familyName === 'IGnss');
    expect(gnss!.leftStatus).toBe('alive');
    expect(gnss!.rightStatus).toBe('absent');
  });
});
