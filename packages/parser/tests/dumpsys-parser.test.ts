import { describe, it, expect } from 'vitest';
import { parseMemInfo, parseCpuInfo } from '../src/dumpsys-parser.js';
import { analyzeBasic, analyzeBootStatus, BasicAnalyzerInput } from '../src/basic-analyzer.js';
import { BugreportMetadata, LogcatParseResult, KernelParseResult, LogEntry } from '../src/types.js';

// ============================================================
// parseMemInfo
// ============================================================

describe('parseMemInfo', () => {
  it('should parse Total/Free/Used RAM', () => {
    const content = `
Applications Memory Usage (in Kilobytes):
Uptime: 123456789 Realtime: 123456789

Total PSS by process:
    312,456K: com.android.systemui (pid 1234)
    256,789K: system_server (pid 567)
    128,000K: com.google.android.gms (pid 890)

Total PSS by OOM adjustment:

Total RAM: 5,832,568K (status normal)
 Free RAM: 1,234,567K (  456,789K cached pss +   777,778K cached kernel +        0K cached)
 Used RAM: 4,598,001K (3,000,000K used pss + 1,598,001K kernel)
`;

    const result = parseMemInfo(content);
    expect(result.totalRamKb).toBe(5832568);
    expect(result.freeRamKb).toBe(1234567);
    expect(result.usedRamKb).toBe(4598001);
    expect(result.topProcesses).toHaveLength(3);
    expect(result.topProcesses[0]).toEqual({
      pid: 1234,
      processName: 'com.android.systemui',
      totalPssKb: 312456,
    });
    expect(result.topProcesses[1]).toEqual({
      pid: 567,
      processName: 'system_server',
      totalPssKb: 256789,
    });
  });

  it('should return zero values for empty input', () => {
    const result = parseMemInfo('');
    expect(result.totalRamKb).toBe(0);
    expect(result.freeRamKb).toBe(0);
    expect(result.usedRamKb).toBe(0);
    expect(result.topProcesses).toHaveLength(0);
  });

  it('should limit topProcesses to 10', () => {
    const processLines = Array.from({ length: 15 }, (_, i) =>
      `    ${100000 - i * 1000}K: com.app.process${i} (pid ${1000 + i})`
    ).join('\n');

    const content = `
Total PSS by process:
${processLines}

Total PSS by OOM adjustment:

Total RAM: 8,000,000K (status normal)
 Free RAM: 2,000,000K (cached)
 Used RAM: 6,000,000K (used)
`;

    const result = parseMemInfo(content);
    expect(result.topProcesses).toHaveLength(10);
    expect(result.topProcesses[0].processName).toBe('com.app.process0');
  });
});

// ============================================================
// parseCpuInfo
// ============================================================

describe('parseCpuInfo', () => {
  it('should parse TOTAL line and per-process CPU%', () => {
    const content = `
Load: 12.45 / 8.32 / 5.67
CPU usage from 12345ms to 6789ms ago (2024-01-15 10:00:00.000 to 2024-01-15 10:00:05.556):
  18% 1234/system_server: 12% user + 6% kernel / faults: 500 minor
  8.5% 567/com.android.systemui: 5% user + 3.5% kernel
  4.2% 890/com.google.android.gms: 3% user + 1.2% kernel
  0.3% 111/logd: 0.1% user + 0.1% kernel
34% TOTAL: 18% user + 12% kernel + 2.1% iowait + 0.3% irq + 0.5% softirq
`;

    const result = parseCpuInfo(content);
    expect(result.totalCpuPercent).toBe(34);
    expect(result.userPercent).toBe(18);
    expect(result.kernelPercent).toBe(12);
    expect(result.ioWaitPercent).toBe(2.1);
    expect(result.topProcesses).toHaveLength(4);
    // Sorted by CPU% descending
    expect(result.topProcesses[0]).toEqual({
      pid: 1234,
      processName: 'system_server',
      cpuPercent: 18,
    });
    expect(result.topProcesses[1]).toEqual({
      pid: 567,
      processName: 'com.android.systemui',
      cpuPercent: 8.5,
    });
  });

  it('should return zero values for empty input', () => {
    const result = parseCpuInfo('');
    expect(result.totalCpuPercent).toBe(0);
    expect(result.userPercent).toBe(0);
    expect(result.kernelPercent).toBe(0);
    expect(result.ioWaitPercent).toBe(0);
    expect(result.topProcesses).toHaveLength(0);
  });

  it('should handle TOTAL line without iowait', () => {
    const content = `
50% TOTAL: 30% user + 20% kernel
`;
    const result = parseCpuInfo(content);
    expect(result.totalCpuPercent).toBe(50);
    expect(result.userPercent).toBe(30);
    expect(result.kernelPercent).toBe(20);
    expect(result.ioWaitPercent).toBe(0);
  });

  it('should limit topProcesses to 10', () => {
    const processLines = Array.from({ length: 15 }, (_, i) =>
      `  ${50 - i}% ${1000 + i}/process${i}: ${30 - i}% user + ${20}% kernel`
    ).join('\n');

    const content = `
${processLines}
90% TOTAL: 50% user + 30% kernel + 5% iowait
`;

    const result = parseCpuInfo(content);
    expect(result.topProcesses).toHaveLength(10);
  });
});

// ============================================================
// Resource Insights integration
// ============================================================

describe('Resource Insights integration', () => {
  function makeInput(overrides?: Partial<BasicAnalyzerInput>): BasicAnalyzerInput {
    return {
      metadata: {
        androidVersion: '14',
        sdkLevel: 34,
        buildFingerprint: 'google/raven/raven:14/UP1A/10754064:userdebug/dev-keys',
        deviceModel: 'Pixel 6 Pro',
        manufacturer: 'Google',
        buildDate: '2024-01-01',
        bugreportTimestamp: new Date('2024-01-15T10:00:00Z'),
        kernelVersion: '5.10.149',
      } as BugreportMetadata,
      logcatResult: { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 },
      kernelResult: { entries: [], events: [], totalLines: 0 },
      anrAnalyses: [],
      ...overrides,
    };
  }

  it('should generate warning insight for low memory (<10% free)', () => {
    const result = analyzeBasic(makeInput({
      memInfo: {
        totalRamKb: 8000000,
        freeRamKb: 500000, // 6.25% free
        usedRamKb: 7500000,
        topProcesses: [
          { pid: 1, processName: 'com.big.app', totalPssKb: 300000 },
        ],
      },
    }));

    const memInsight = result.insights.find((i) => i.title === 'Low available memory');
    expect(memInsight).toBeDefined();
    expect(memInsight!.severity).toBe('warning');
    expect(memInsight!.category).toBe('memory');
    expect(result.memInfo).toBeDefined();
    expect(result.memInfo!.totalRamKb).toBe(8000000);
  });

  it('should NOT generate memory warning when free RAM is sufficient', () => {
    const result = analyzeBasic(makeInput({
      memInfo: {
        totalRamKb: 8000000,
        freeRamKb: 2000000, // 25% free
        usedRamKb: 6000000,
        topProcesses: [],
      },
    }));

    const memInsight = result.insights.find((i) => i.title === 'Low available memory');
    expect(memInsight).toBeUndefined();
  });

  it('should generate warning insight for high CPU usage', () => {
    const result = analyzeBasic(makeInput({
      cpuInfo: {
        totalCpuPercent: 92,
        userPercent: 60,
        kernelPercent: 30,
        ioWaitPercent: 2,
        topProcesses: [
          { pid: 1, processName: 'system_server', cpuPercent: 40 },
        ],
      },
    }));

    const cpuInsight = result.insights.find((i) => i.title === 'High CPU usage');
    expect(cpuInsight).toBeDefined();
    expect(cpuInsight!.severity).toBe('warning');
    expect(result.cpuInfo).toBeDefined();
  });

  it('should generate warning insight for high I/O wait', () => {
    const result = analyzeBasic(makeInput({
      cpuInfo: {
        totalCpuPercent: 50,
        userPercent: 20,
        kernelPercent: 10,
        ioWaitPercent: 25,
        topProcesses: [],
      },
    }));

    const ioInsight = result.insights.find((i) => i.title === 'High I/O wait');
    expect(ioInsight).toBeDefined();
    expect(ioInsight!.severity).toBe('warning');
  });

  it('should reduce health score for low memory', () => {
    const withLowMem = analyzeBasic(makeInput({
      memInfo: {
        totalRamKb: 8000000,
        freeRamKb: 300000, // 3.75% free → < 5%
        usedRamKb: 7700000,
        topProcesses: [],
      },
    }));

    const baseline = analyzeBasic(makeInput());

    expect(withLowMem.healthScore.breakdown.memory).toBeLessThan(baseline.healthScore.breakdown.memory);
  });

  it('should reduce health score for high CPU', () => {
    const withHighCpu = analyzeBasic(makeInput({
      cpuInfo: {
        totalCpuPercent: 95,
        userPercent: 60,
        kernelPercent: 30,
        ioWaitPercent: 5,
        topProcesses: [],
      },
    }));

    const baseline = analyzeBasic(makeInput());

    expect(withHighCpu.healthScore.breakdown.responsiveness).toBeLessThan(baseline.healthScore.breakdown.responsiveness);
  });
});

// ============================================================
// Boot Status Analysis (#38)
// ============================================================

describe('analyzeBootStatus', () => {
  function makeLogEntry(overrides: Partial<LogEntry>): LogEntry {
    return {
      timestamp: '01-15 10:00:00.000',
      pid: 1000,
      tid: 1000,
      level: 'I',
      tag: 'System',
      message: '',
      raw: '',
      lineNumber: 1,
      ...overrides,
    };
  }

  it('should detect boot_completed', () => {
    const logcatResult: LogcatParseResult = {
      entries: [
        makeLogEntry({ tag: 'BootReceiver', message: 'sys.boot_completed=1' }),
      ],
      anomalies: [],
      totalLines: 1,
      parsedLines: 1,
      parseErrors: 0,
    };
    const kernelResult = { entries: [], events: [], totalLines: 0 };

    const result = analyzeBootStatus(logcatResult, kernelResult);
    expect(result.bootCompleted).toBe(true);
    expect(result.systemServerRestarts).toBe(0);
  });

  it('should detect boot reason from kernel log', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [],
      totalLines: 0,
      parsedLines: 0,
      parseErrors: 0,
    };
    const kernelResult = {
      entries: [{
        timestamp: 0.001,
        level: '<6>',
        facility: '',
        message: 'androidboot.bootreason=watchdog',
        raw: '<6>[    0.001000] androidboot.bootreason=watchdog',
      }],
      events: [],
      totalLines: 1,
    };

    const result = analyzeBootStatus(logcatResult, kernelResult);
    expect(result.bootReason).toBe('watchdog');
    expect(result.uptimeSeconds).toBeCloseTo(0.001);
  });

  it('should count system_server restarts', () => {
    const logcatResult: LogcatParseResult = {
      entries: [
        makeLogEntry({ tag: 'Zygote', message: 'System server process 1234 has been created' }),
        makeLogEntry({ tag: 'Zygote', message: 'System server process 5678 has been created' }),
        makeLogEntry({ tag: 'Zygote', message: 'System server process 9012 has been created' }),
      ],
      anomalies: [],
      totalLines: 3,
      parsedLines: 3,
      parseErrors: 0,
    };
    const kernelResult = { entries: [], events: [], totalLines: 0 };

    const result = analyzeBootStatus(logcatResult, kernelResult);
    expect(result.systemServerRestarts).toBe(2); // 3 starts - 1 initial = 2 restarts
  });

  it('should generate insight for abnormal boot reason', () => {
    const input: BasicAnalyzerInput = {
      metadata: {
        androidVersion: '14',
        sdkLevel: 34,
        buildFingerprint: 'test',
        deviceModel: 'Test',
        manufacturer: 'Test',
        buildDate: '2024-01-01',
        bugreportTimestamp: new Date('2024-01-15T10:00:00Z'),
        kernelVersion: '5.10',
      } as BugreportMetadata,
      logcatResult: { entries: [], anomalies: [], totalLines: 0, parsedLines: 0, parseErrors: 0 },
      kernelResult: {
        entries: [{
          timestamp: 100,
          level: '<6>',
          facility: '',
          message: 'androidboot.bootreason=kernel_panic',
          raw: '',
        }],
        events: [],
        totalLines: 1,
      },
      anrAnalyses: [],
    };

    const result = analyzeBasic(input);
    const bootInsight = result.insights.find((i) => i.title.includes('Abnormal boot reason'));
    expect(bootInsight).toBeDefined();
    expect(bootInsight!.severity).toBe('warning');
    expect(result.bootStatus).toBeDefined();
    expect(result.bootStatus!.bootReason).toBe('kernel_panic');
  });
});
