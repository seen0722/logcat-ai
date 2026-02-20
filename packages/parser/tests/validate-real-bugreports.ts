/**
 * Validate parser pipeline against real bugreport.zip files.
 * Run with: npx tsx tests/validate-real-bugreports.ts <dir>
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { unpackBugreport } from '../src/unpacker.js';
import { parseLogcat } from '../src/logcat-parser.js';
import { parseANRTrace } from '../src/anr-parser.js';
import { parseKernelLog } from '../src/kernel-parser.js';
import { analyzeBasic } from '../src/basic-analyzer.js';

async function main() {
const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npx tsx tests/validate-real-bugreports.ts <dir>');
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.zip'));
console.log(`Found ${files.length} bugreport(s) in ${dir}\n`);

for (const file of files) {
  const zipPath = join(dir, file);
  console.log(`${'='.repeat(80)}`);
  console.log(`FILE: ${file}`);
  console.log(`${'='.repeat(80)}`);

  try {
    // 1. Unpack
    console.log('\n--- UNPACK ---');
    const unpack = await unpackBugreport(zipPath);
    console.log(`  Sections: ${unpack.sections.length}`);
    console.log(`  Logcat sections: ${unpack.logcatSections.length}`);
    console.log(`  ANR trace files: ${unpack.anrTraceFiles.length}`);
    if (unpack.anrTraceFiles.length > 0) {
      console.log(`    ${unpack.anrTraceFiles.join('\n    ')}`);
    }
    console.log(`  Tombstone files: ${unpack.tombstoneFiles.length}`);
    console.log(`  Total files in zip: ${unpack.rawFiles.size}`);

    // Metadata
    const m = unpack.metadata;
    console.log('\n--- METADATA ---');
    console.log(`  Device: ${m.manufacturer} ${m.deviceModel}`);
    console.log(`  Android: ${m.androidVersion} (SDK ${m.sdkLevel})`);
    console.log(`  Build: ${m.buildFingerprint}`);
    console.log(`  Kernel: ${m.kernelVersion}`);
    console.log(`  Timestamp: ${m.bugreportTimestamp}`);

    // 2. Logcat
    console.log('\n--- LOGCAT ---');
    const combinedLogcat = unpack.logcatSections.join('\n');
    const logcatResult = parseLogcat(combinedLogcat);
    console.log(`  Total lines: ${logcatResult.totalLines}`);
    console.log(`  Parsed entries: ${logcatResult.parsedLines}`);
    console.log(`  Parse errors: ${logcatResult.parseErrors}`);
    console.log(`  Anomalies: ${logcatResult.anomalies.length}`);
    for (const a of logcatResult.anomalies) {
      console.log(`    [${a.severity.toUpperCase()}] ${a.type}: ${a.summary}`);
    }

    // 3. ANR Traces
    console.log('\n--- ANR TRACES ---');
    const anrAnalyses = [...unpack.anrTraceContents.entries()].map(([path, content]) => {
      const analysis = parseANRTrace(content);
      return { path, analysis };
    });
    console.log(`  Traces parsed: ${anrAnalyses.length}`);
    for (const { path, analysis } of anrAnalyses) {
      console.log(`\n  File: ${path}`);
      console.log(`    Process: ${analysis.processName} (PID ${analysis.pid})`);
      console.log(`    Threads: ${analysis.threads.length}`);
      if (analysis.mainThread) {
        console.log(`    Main Thread Block Reason: ${analysis.mainThread.blockReason} (${analysis.mainThread.confidence})`);
        if (analysis.mainThread.blockingChain.length > 0) {
          const chain = analysis.mainThread.blockingChain.map((t) => `"${t.name}"`).join(' → ');
          console.log(`    Blocking Chain: main → ${chain}`);
        }
        console.log(`    Main Thread Stack (top 5):`);
        for (const f of analysis.mainThread.thread.stackFrames.slice(0, 5)) {
          console.log(`      ${f.raw}`);
        }
      } else {
        console.log(`    Main Thread: not found`);
      }
      console.log(`    Binder Threads: ${analysis.binderThreads.busy}/${analysis.binderThreads.total} busy (exhausted: ${analysis.binderThreads.exhausted})`);
      console.log(`    Deadlock: ${analysis.deadlocks.detected ? `YES (${analysis.deadlocks.cycles.length} cycle)` : 'no'}`);
      console.log(`    Lock Graph: ${analysis.lockGraph.nodes.length} nodes, ${analysis.lockGraph.edges.length} edges`);
    }

    // 4. Kernel Log
    console.log('\n--- KERNEL LOG ---');
    const kernelSection = unpack.sections.find(
      (s) => s.name === 'KERNEL LOG' || s.command.includes('dmesg')
    );
    const kernelResult = parseKernelLog(kernelSection?.content ?? '');
    console.log(`  Total lines: ${kernelResult.totalLines}`);
    console.log(`  Parsed entries: ${kernelResult.entries.length}`);
    console.log(`  Events: ${kernelResult.events.length}`);
    for (const e of kernelResult.events) {
      console.log(`    [${e.severity.toUpperCase()}] ${e.type}: ${e.summary}`);
    }

    // 5. Basic Analyzer
    console.log('\n--- BASIC ANALYZER ---');
    const result = analyzeBasic({
      metadata: unpack.metadata,
      logcatResult,
      kernelResult,
      anrAnalyses: anrAnalyses.map((a) => a.analysis),
    });
    console.log(`  Insights: ${result.insights.length}`);
    const bySeverity = { critical: 0, warning: 0, info: 0 };
    for (const i of result.insights) bySeverity[i.severity]++;
    console.log(`    Critical: ${bySeverity.critical}, Warning: ${bySeverity.warning}, Info: ${bySeverity.info}`);
    console.log(`  Timeline events: ${result.timeline.length}`);
    console.log(`  Health Score: ${result.healthScore.overall}/100`);
    console.log(`    Stability: ${result.healthScore.breakdown.stability}`);
    console.log(`    Memory: ${result.healthScore.breakdown.memory}`);
    console.log(`    Responsiveness: ${result.healthScore.breakdown.responsiveness}`);
    console.log(`    Kernel: ${result.healthScore.breakdown.kernel}`);

    // Top insights
    console.log('\n  Top Insights:');
    for (const i of result.insights.slice(0, 10)) {
      console.log(`    [${i.severity.toUpperCase()}] [${i.category}] ${i.title}`);
    }

    console.log('\n  ✅ PASS\n');
  } catch (err) {
    console.error(`\n  ❌ FAIL: ${err instanceof Error ? err.message : err}\n`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  }
}
}

main().catch(console.error);
