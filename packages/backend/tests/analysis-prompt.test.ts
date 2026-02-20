import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt } from '../src/llm-gateway/prompt-templates/analysis.js';
import { AnalysisResult } from '@logcat-ai/parser';

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    metadata: {
      androidVersion: '13',
      sdkLevel: 33,
      buildFingerprint: 'google/test/device:13/TP1A.220624.014',
      deviceModel: 'Pixel 7',
      manufacturer: 'Google',
      buildDate: '2024-01-01',
      bugreportTimestamp: new Date(),
      kernelVersion: '5.10.149',
    },
    insights: [],
    timeline: [],
    healthScore: { overall: 45, breakdown: { stability: 30, memory: 60, responsiveness: 40, kernel: 50 } },
    anrAnalyses: [],
    logcatResult: { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 },
    kernelResult: { entries: [], events: [], totalLines: 0 },
    ...overrides,
  };
}

describe('buildAnalysisPrompt', () => {
  it('should return systemPrompt and userPrompt', () => {
    const { systemPrompt, userPrompt } = buildAnalysisPrompt(makeResult());
    expect(systemPrompt).toBeTruthy();
    expect(userPrompt).toBeTruthy();
  });

  it('should include device info in user prompt', () => {
    const { userPrompt } = buildAnalysisPrompt(makeResult());
    expect(userPrompt).toContain('Pixel 7');
    expect(userPrompt).toContain('Google');
    expect(userPrompt).toContain('SDK 33');
  });

  it('should include health score', () => {
    const { userPrompt } = buildAnalysisPrompt(makeResult());
    expect(userPrompt).toContain('45/100');
    expect(userPrompt).toContain('Stability: 30');
  });

  it('should include all insights (not capped at 20)', () => {
    const insights = Array.from({ length: 25 }, (_, i) => ({
      id: `insight-${i + 1}`,
      severity: 'warning' as const,
      category: 'performance' as const,
      title: `Issue ${i + 1}`,
      description: `Description ${i + 1}`,
      source: 'logcat' as const,
    }));
    const { userPrompt } = buildAnalysisPrompt(makeResult({ insights }));
    expect(userPrompt).toContain('insight-25');
    expect(userPrompt).toContain('25 total');
  });

  it('should cap timeline at 50 events', () => {
    const timeline = Array.from({ length: 60 }, (_, i) => ({
      timestamp: `01-15 10:00:${String(i).padStart(2, '0')}.000`,
      source: 'logcat' as const,
      severity: 'info' as const,
      label: `Event ${i + 1}`,
    }));
    const { userPrompt } = buildAnalysisPrompt(makeResult({ timeline }));
    expect(userPrompt).toContain('Event 50');
    expect(userPrompt).not.toContain('Event 51');
  });

  it('should include user description when provided', () => {
    const { userPrompt } = buildAnalysisPrompt(makeResult(), 'Device freezes during GPS lock');
    expect(userPrompt).toContain("User's Problem Description");
    expect(userPrompt).toContain('Device freezes during GPS lock');
  });

  it('should not include user description section when not provided', () => {
    const { userPrompt } = buildAnalysisPrompt(makeResult());
    expect(userPrompt).not.toContain("User's Problem Description");
  });

  it('should include ANR trace analysis when present', () => {
    const anrAnalyses = [{
      pid: 1234,
      processName: 'com.test.app',
      subject: 'Input dispatching timed out',
      threads: [],
      mainThread: {
        thread: {
          name: 'main', priority: 5, tid: 1, state: 'Blocked' as const,
          daemon: false, stackFrames: [
            { className: 'com.test.Main', methodName: 'run', fileName: 'Main.java', lineNumber: 10, isNative: false, raw: 'at com.test.Main.run(Main.java:10)' },
          ],
          waitingOnLock: null, heldLocks: [], raw: '',
        },
        blockReason: 'slow_binder_call' as const,
        blockingChain: [],
        confidence: 'high' as const,
        binderTarget: {
          interfaceName: 'IGnss',
          packageName: 'vendor.gnss@2.0',
          method: 'start',
          callerClass: 'LocationManager',
          callerMethod: 'requestLocation',
        },
      },
      lockGraph: { nodes: [], edges: [] },
      deadlocks: { detected: false, cycles: [] },
      binderThreads: { total: 16, busy: 14, idle: 2, exhausted: false },
    }];
    const { userPrompt } = buildAnalysisPrompt(makeResult({ anrAnalyses }));
    expect(userPrompt).toContain('com.test.app');
    expect(userPrompt).toContain('slow_binder_call');
    expect(userPrompt).toContain('IGnss');
    expect(userPrompt).toContain('Input dispatching timed out');
  });

  it('should request JSON object format (not array)', () => {
    const { userPrompt } = buildAnalysisPrompt(makeResult());
    expect(userPrompt).toContain('"executiveSummary"');
    expect(userPrompt).toContain('"correlationFindings"');
    expect(userPrompt).toContain('"prioritizedActions"');
    expect(userPrompt).toContain('"evidence"');
    expect(userPrompt).toContain('"debuggingSteps"');
    expect(userPrompt).toContain('"category"');
  });

  it('system prompt should require evidence-based reasoning', () => {
    const { systemPrompt } = buildAnalysisPrompt(makeResult());
    expect(systemPrompt).toContain('evidence');
    expect(systemPrompt).toContain('root cause');
    expect(systemPrompt).toContain('cross-subsystem');
  });

  it('should include detailed context section for critical insights', () => {
    const result = makeResult({
      insights: [{
        id: 'insight-1',
        severity: 'critical',
        category: 'anr',
        title: 'ANR in com.test.app',
        description: 'App not responding',
        source: 'logcat',
      }],
      logcatResult: {
        entries: [],
        anomalies: [{
          type: 'anr', severity: 'critical',
          timestamp: '01-15 10:00:00.000',
          entries: [{
            timestamp: '01-15 10:00:00.000', pid: 1234, tid: 1234,
            level: 'E', tag: 'ActivityManager', message: 'ANR in com.test.app',
            raw: 'E ActivityManager: ANR in com.test.app', lineNumber: 100,
          }],
          processName: 'com.test.app', pid: 1234,
          summary: 'ANR in com.test.app',
        }],
        totalLines: 100, parsedLines: 100, parseErrors: 0,
      },
    });
    const { userPrompt } = buildAnalysisPrompt(result);
    expect(userPrompt).toContain('Detailed Context Per Insight');
    expect(userPrompt).toContain('insight-1');
  });
});
