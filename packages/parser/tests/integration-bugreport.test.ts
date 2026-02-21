/**
 * Integration test: verify #38 boot status analysis with a real bugreport.
 *
 * Requires the sample file at BUGREPORT_PATH to exist.
 * Skipped automatically if the file is not present.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  unpackBugreport,
  parseLogcat,
  parseANRTrace,
  parseKernelLog,
  parseMemInfo,
  parseCpuInfo,
  analyzeBasic,
} from '../src/index.js';

const BUGREPORT_PATH =
  '/Users/chenzeming/bugreport-samples/bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip';

const fileExists = fs.existsSync(BUGREPORT_PATH);

describe.skipIf(!fileExists)('Integration: real bugreport — boot status (#38)', () => {
  // Shared state across tests (unpack once)
  let analysisResult: Awaited<ReturnType<typeof runAnalysis>> | null = null;

  async function runAnalysis() {
    const unpackResult = await unpackBugreport(BUGREPORT_PATH);

    // Parse logcat
    const combinedLogcat = unpackResult.logcatSections.join('\n');
    const logcatResult = parseLogcat(combinedLogcat);

    // Parse ANR traces
    const anrAnalyses = [...unpackResult.anrTraceContents.values()]
      .map((content) => parseANRTrace(content));

    // Parse kernel log
    const kernelSection = unpackResult.sections.find(
      (s) => s.name === 'KERNEL LOG' || s.command.includes('dmesg')
    );
    const kernelResult = parseKernelLog(kernelSection?.content ?? '');

    // Parse dumpsys meminfo — try dedicated section first, then search in DUMPSYS sections
    const memInfoSection = unpackResult.sections.find(
      (s) => s.command.includes('dumpsys meminfo')
    ) ?? unpackResult.sections.find(
      (s) => /^DUMPSYS/i.test(s.name) && /Total RAM:/i.test(s.content)
    );
    const memInfo = memInfoSection ? parseMemInfo(memInfoSection.content) : undefined;

    // Parse dumpsys cpuinfo — try dedicated section first, then search in DUMPSYS sections
    const cpuInfoSection = unpackResult.sections.find(
      (s) => s.command.includes('dumpsys cpuinfo')
    ) ?? unpackResult.sections.find(
      (s) => /^DUMPSYS/i.test(s.name) && /TOTAL:.*user.*kernel/i.test(s.content)
    );
    const cpuInfo = cpuInfoSection ? parseCpuInfo(cpuInfoSection.content) : undefined;

    // Extract system properties section
    const sysPropSection = unpackResult.sections.find(
      (s) => s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop')
    );

    const result = analyzeBasic({
      metadata: unpackResult.metadata,
      logcatResult,
      kernelResult,
      anrAnalyses,
      memInfo,
      cpuInfo,
      systemProperties: sysPropSection?.content,
    });

    return { unpackResult, result, logcatResult, kernelResult };
  }

  it('should unpack and analyze without errors', async () => {
    analysisResult = await runAnalysis();
    expect(analysisResult.result).toBeDefined();
    expect(analysisResult.result.metadata.deviceModel).toBeTruthy();
  }, 30000);

  it('should produce bootStatus', () => {
    expect(analysisResult).not.toBeNull();
    const { bootStatus } = analysisResult!.result;
    expect(bootStatus).toBeDefined();

    console.log('\n=== Boot Status ===');
    console.log(`  bootCompleted: ${bootStatus!.bootCompleted}`);
    console.log(`  bootReason: ${bootStatus!.bootReason ?? 'N/A'}`);
    console.log(`  systemServerRestarts: ${bootStatus!.systemServerRestarts}`);
    console.log(`  uptimeSeconds: ${bootStatus!.uptimeSeconds?.toFixed(0) ?? 'N/A'}`);
  });

  it('should produce memInfo if section exists', () => {
    expect(analysisResult).not.toBeNull();
    const { memInfo } = analysisResult!.result;

    console.log('\n=== Memory Info ===');
    if (memInfo) {
      console.log(`  totalRamKb: ${memInfo.totalRamKb} (${(memInfo.totalRamKb / 1048576).toFixed(1)} GB)`);
      console.log(`  freeRamKb: ${memInfo.freeRamKb} (${(memInfo.freeRamKb / 1048576).toFixed(1)} GB)`);
      console.log(`  usedRamKb: ${memInfo.usedRamKb} (${(memInfo.usedRamKb / 1048576).toFixed(1)} GB)`);
      console.log(`  topProcesses (${memInfo.topProcesses.length}):`);
      memInfo.topProcesses.slice(0, 5).forEach((p) => {
        console.log(`    ${p.processName} (pid ${p.pid}): ${(p.totalPssKb / 1024).toFixed(0)} MB`);
      });
    } else {
      console.log('  (no memInfo section found)');
    }
  });

  it('should produce cpuInfo if section exists', () => {
    expect(analysisResult).not.toBeNull();
    const { cpuInfo } = analysisResult!.result;

    console.log('\n=== CPU Info ===');
    if (cpuInfo) {
      console.log(`  totalCpuPercent: ${cpuInfo.totalCpuPercent}%`);
      console.log(`  userPercent: ${cpuInfo.userPercent}%`);
      console.log(`  kernelPercent: ${cpuInfo.kernelPercent}%`);
      console.log(`  ioWaitPercent: ${cpuInfo.ioWaitPercent}%`);
      console.log(`  topProcesses (${cpuInfo.topProcesses.length}):`);
      cpuInfo.topProcesses.slice(0, 5).forEach((p) => {
        console.log(`    ${p.processName} (pid ${p.pid}): ${p.cpuPercent}%`);
      });
    } else {
      console.log('  (no cpuInfo section found)');
    }
  });

  it('should produce health score and insights', () => {
    expect(analysisResult).not.toBeNull();
    const { healthScore, insights } = analysisResult!.result;

    console.log('\n=== Health Score ===');
    console.log(`  overall: ${healthScore.overall}`);
    console.log(`  stability: ${healthScore.breakdown.stability}`);
    console.log(`  memory: ${healthScore.breakdown.memory}`);
    console.log(`  responsiveness: ${healthScore.breakdown.responsiveness}`);
    console.log(`  kernel: ${healthScore.breakdown.kernel}`);

    console.log(`\n=== Insights (${insights.length} total) ===`);
    insights.slice(0, 10).forEach((i) => {
      console.log(`  [${i.severity}] ${i.title} (${i.source})`);
    });

    expect(healthScore.overall).toBeGreaterThanOrEqual(0);
    expect(healthScore.overall).toBeLessThanOrEqual(100);
  });
});
