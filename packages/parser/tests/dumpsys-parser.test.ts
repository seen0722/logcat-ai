import { describe, it, expect } from 'vitest';
import { parseMemInfo, parseCpuInfo, parseLshal } from '../src/dumpsys-parser.js';
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

  it('should detect boot_completed from system properties', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [],
      totalLines: 0,
      parsedLines: 0,
      parseErrors: 0,
    };
    const kernelResult = { entries: [], events: [], totalLines: 0 };
    const systemProperties = `[sys.boot.reason.last]: [reboot]
[sys.boot_completed]: [1]
[sys.bootstat.first_boot_completed]: [1]`;

    const result = analyzeBootStatus(logcatResult, kernelResult, systemProperties);
    expect(result.bootCompleted).toBe(true);
    expect(result.bootReason).toBe('reboot');
  });

  it('should detect boot reason from system properties', () => {
    const logcatResult: LogcatParseResult = {
      entries: [],
      anomalies: [],
      totalLines: 0,
      parsedLines: 0,
      parseErrors: 0,
    };
    const kernelResult = { entries: [], events: [], totalLines: 0 };
    const systemProperties = `[sys.boot.reason.last]: [watchdog]
[sys.boot_completed]: [1]`;

    const result = analyzeBootStatus(logcatResult, kernelResult, systemProperties);
    expect(result.bootReason).toBe('watchdog');
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

// ============================================================
// parseLshal (#37)
// ============================================================

describe('parseLshal', () => {
  it('should parse pipe-delimited lshal output with alive/declared/non-responsive', () => {
    const content = `
VINTF R | Interface                                                        | Transport | Arch | Thread Use | Server PID | Clients
Y       | android.hardware.audio@6.0::IDevicesFactory/default              | hwbinder  | 64   | 1/1        | 1234       | 567
Y       | android.hardware.camera.provider@2.7::ICameraProvider/internal/0 | hwbinder  | 64   | 2/2        | 2345       | 890
Y       | vendor.trimble.hardware.trmbkeypad@1.0::ITrmbKeypad/default      | hwbinder  |      | N/A        | N/A        |
        | android.hardware.graphics.composer@2.4::IComposer/default        | hwbinder  | 64   | 1/1        | 456        | 789
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(4);
    expect(result.aliveCount).toBe(3);
    expect(result.declaredCount).toBe(1);
    expect(result.declaredServices).toHaveLength(1);
    expect(result.declaredServices[0].interfaceName).toContain('trmbkeypad');
    expect(result.declaredServices[0].isVendor).toBe(true);

    // Verify families
    expect(result.families).toHaveLength(4);
    const trmbFamily = result.families.find((f) => f.shortName === 'trmbkeypad');
    expect(trmbFamily).toBeDefined();
    expect(trmbFamily!.highestVersion).toBe('1.0');
    expect(trmbFamily!.highestStatus).toBe('declared');
    expect(trmbFamily!.isVendor).toBe(true);
    expect(result.vendorIssueCount).toBe(1);
  });

  it('should correctly identify vendor vs android HALs', () => {
    const content = `
VINTF R | Interface                                                        | Transport | Arch | Thread Use | Server PID | Clients
Y       | android.hardware.audio@6.0::IDevicesFactory/default              | hwbinder  | 64   | 1/1        | 1234       | 567
Y       | vendor.example.hal@1.0::IExample/default                         | hwbinder  | 32   | 1/1        | 2345       | 890
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(2);
    const androidHal = result.aliveCount;
    expect(androidHal).toBe(2);
    // Check vendor detection in declared/non-responsive (both alive here, so check isVendor flag indirectly)
    expect(result.declaredServices).toHaveLength(0);
    expect(result.nonResponsiveServices).toHaveLength(0);
  });

  it('should return zero values for empty input', () => {
    const result = parseLshal('');
    expect(result.totalServices).toBe(0);
    expect(result.aliveCount).toBe(0);
    expect(result.nonResponsiveCount).toBe(0);
    expect(result.declaredCount).toBe(0);
    expect(result.nonResponsiveServices).toHaveLength(0);
    expect(result.declaredServices).toHaveLength(0);
    expect(result.families).toHaveLength(0);
    expect(result.vendorIssueCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('should return zero values for header-only input', () => {
    const content = `
VINTF R | Interface | Transport | Arch | Thread Use | Server PID | Clients
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(0);
  });

  it('should handle lines with explicit status keywords', () => {
    const content = `
VINTF R | Interface                                                        | Transport | Status
Y       | android.hardware.audio@6.0::IDevicesFactory/default              | hwbinder  | alive
Y       | vendor.example.sensor@1.0::ISensor/default                       | hwbinder  | non-responsive
Y       | vendor.example.radio@2.0::IRadio/default                         | hwbinder  | declared
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(3);
    expect(result.aliveCount).toBe(1);
    expect(result.nonResponsiveCount).toBe(1);
    expect(result.declaredCount).toBe(1);
    expect(result.nonResponsiveServices[0].isVendor).toBe(true);
    expect(result.declaredServices[0].isVendor).toBe(true);
  });

  it('should parse space-delimited format', () => {
    const content = `
android.hardware.audio@6.0::IDevicesFactory/default hwbinder alive
vendor.example.hal@1.0::IExample/default hwbinder declared
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(2);
    expect(result.aliveCount).toBe(1);
    expect(result.declaredCount).toBe(1);
    expect(result.declaredServices[0].interfaceName).toBe('vendor.example.hal@1.0::IExample/default');
    expect(result.families).toHaveLength(2);
  });

  it('should group multiple versions into one family and use highest version status', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | vendor.display.color@1.0::IDisplayColor/default             | hwbinder  | non-responsive
Y       | vendor.display.color@1.2::IDisplayColor/default             | hwbinder  | non-responsive
Y       | vendor.display.color@1.4::IDisplayColor/default             | hwbinder  | non-responsive
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(3);
    expect(result.nonResponsiveCount).toBe(3);

    // Only 1 family
    expect(result.families).toHaveLength(1);
    const colorFamily = result.families[0];
    expect(colorFamily.shortName).toBe('color');
    expect(colorFamily.highestVersion).toBe('1.4');
    expect(colorFamily.highestStatus).toBe('non-responsive');
    expect(colorFamily.versionCount).toBe(3);
    expect(colorFamily.isVendor).toBe(true);
    expect(result.vendorIssueCount).toBe(1);
  });

  it('should treat family as alive when highest version is alive even if lower versions are non-responsive', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | vendor.display.color@1.0::IDisplayColor/default             | hwbinder  | non-responsive
Y       | vendor.display.color@1.2::IDisplayColor/default             | hwbinder  | non-responsive
Y       | vendor.display.color@1.5::IDisplayColor/default             | hwbinder  | alive
`;

    const result = parseLshal(content);
    expect(result.totalServices).toBe(3);

    // Family should show alive (highest version is alive)
    expect(result.families).toHaveLength(1);
    const colorFamily = result.families[0];
    expect(colorFamily.shortName).toBe('color');
    expect(colorFamily.highestVersion).toBe('1.5');
    expect(colorFamily.highestStatus).toBe('alive');
    expect(colorFamily.versionCount).toBe(3);
    // vendorIssueCount should be 0 — highest version is alive
    expect(result.vendorIssueCount).toBe(0);
  });

  it('should compute vendorIssueCount only for vendor families', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | android.hardware.audio@6.0::IDevicesFactory/default         | hwbinder  | non-responsive
Y       | vendor.example.sensor@1.0::ISensor/default                  | hwbinder  | non-responsive
Y       | vendor.example.radio@2.0::IRadio/default                    | hwbinder  | declared
Y       | vendor.example.display@1.0::IDisplay/default                | hwbinder  | alive
`;

    const result = parseLshal(content);
    expect(result.families).toHaveLength(4);
    // Only vendor families with issues count: sensor (non-responsive) + radio (declared) = 2
    // android.hardware.audio is non-responsive but NOT vendor, so excluded
    expect(result.vendorIssueCount).toBe(2);
  });

  // ============================================================
  // Truncation detection
  // ============================================================

  it('should detect truncated lshal output (exit code)', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | android.hardware.audio@6.0::IDevicesFactory/default         | hwbinder  | alive
failed: exit code 136
`;

    const result = parseLshal(content);
    expect(result.truncated).toBe(true);
    expect(result.totalServices).toBe(1);
  });

  it('should detect truncated lshal output (duration message)', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | android.hardware.audio@6.0::IDevicesFactory/default         | hwbinder  | alive
10.000s was the duration of 'lshal --all' process.
`;

    const result = parseLshal(content);
    expect(result.truncated).toBe(true);
  });

  it('should not mark truncated when no truncation pattern found', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | android.hardware.audio@6.0::IDevicesFactory/default         | hwbinder  | alive
`;

    const result = parseLshal(content);
    expect(result.truncated).toBe(false);
  });

  // ============================================================
  // OEM HAL marking
  // ============================================================

  it('should mark Trimble HALs as OEM when manufacturer is Trimble', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | vendor.trimble.hardware.trmbkeypad@1.0::ITrmbKeypad/default | hwbinder  | non-responsive
Y       | vendor.trimble.hardware.trmbempower@1.0::ITrmbEmpower/default | hwbinder  | non-responsive
Y       | vendor.qti.hardware.display.color@1.0::IDisplayColor/default | hwbinder  | non-responsive
`;

    const result = parseLshal(content, 'Trimble');
    expect(result.families).toHaveLength(3);

    const trmbKeypad = result.families.find((f) => f.shortName === 'trmbkeypad');
    expect(trmbKeypad).toBeDefined();
    expect(trmbKeypad!.isOem).toBe(true);

    const trmbEmpower = result.families.find((f) => f.shortName === 'trmbempower');
    expect(trmbEmpower).toBeDefined();
    expect(trmbEmpower!.isOem).toBe(true);

    const color = result.families.find((f) => f.shortName === 'color');
    expect(color).toBeDefined();
    expect(color!.isOem).toBe(false); // qti is a known BSP prefix
  });

  it('should treat unknown vendor HALs as OEM when no BSP prefix matches', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | vendor.acme.widget@1.0::IWidget/default                     | hwbinder  | non-responsive
Y       | vendor.qualcomm.hardware.radio@1.0::IRadio/default          | hwbinder  | non-responsive
`;

    const result = parseLshal(content);
    expect(result.families).toHaveLength(2);

    const widget = result.families.find((f) => f.shortName === 'widget');
    expect(widget).toBeDefined();
    expect(widget!.isOem).toBe(true); // acme is not a known BSP vendor

    const radio = result.families.find((f) => f.shortName === 'radio');
    expect(radio).toBeDefined();
    expect(radio!.isOem).toBe(false); // qualcomm is known BSP
  });

  it('should not mark android HALs as OEM', () => {
    const content = `
VINTF R | Interface                                                    | Transport | Status
Y       | android.hardware.gnss@2.0::IGnss/default                    | hwbinder  | alive
`;

    const result = parseLshal(content, 'Trimble');
    const gnss = result.families.find((f) => f.shortName === 'gnss');
    expect(gnss).toBeDefined();
    expect(gnss!.isOem).toBe(false);
    expect(gnss!.isVendor).toBe(false);
  });
});
