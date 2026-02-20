/**
 * Debug script to inspect raw bugreport format.
 * Run: npx tsx tests/debug-format.ts
 */
import { unpackBugreport } from '../src/unpacker.js';

const ZIP_PATH =
  '/Users/chenzeming/bugreport-samples/bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip';

async function main() {
  console.log('=== Unpacking bugreport ===\n');
  const result = await unpackBugreport(ZIP_PATH);

  console.log(`Device: ${result.metadata.deviceModel} (${result.metadata.manufacturer})`);
  console.log(`Android: ${result.metadata.androidVersion} (SDK ${result.metadata.sdkLevel})`);
  console.log(`Sections found: ${result.sections.length}`);
  console.log(`Logcat sections: ${result.logcatSections.length}`);
  console.log(`ANR trace files: ${result.anrTraceFiles.length}`);
  console.log();

  // --- List all section names ---
  console.log('=== All section names ===');
  for (const s of result.sections) {
    console.log(`  [${s.name}] (${s.command}) lines ${s.startLine}-${s.endLine}`);
  }
  console.log();

  // --- 1. First 20 lines of the first logcat section ---
  console.log('=== First logcat section (first 20 lines) ===');
  if (result.logcatSections.length > 0) {
    const lines = result.logcatSections[0].split('\n').slice(0, 20);
    for (const line of lines) {
      console.log(line);
    }
  } else {
    console.log('(no logcat sections found)');
  }
  console.log();

  // --- 2. First 20 lines of kernel log section ---
  console.log('=== Kernel log section (first 20 lines) ===');
  const kernelSection = result.sections.find(
    (s) => s.name === 'KERNEL LOG' || s.name.includes('KERNEL') || s.command.includes('dmesg'),
  );
  if (kernelSection) {
    const lines = kernelSection.content.split('\n').slice(0, 20);
    for (const line of lines) {
      console.log(line);
    }
  } else {
    console.log('(no kernel log section found)');
  }
  console.log();

  // --- 3. ANR trace thread headers ---
  console.log('=== ANR trace thread headers (first file, first 30 matching lines) ===');
  if (result.anrTraceFiles.length > 0) {
    const firstFile = result.anrTraceFiles[0];
    console.log(`File: ${firstFile}`);
    const traceContent = result.anrTraceContents.get(firstFile) ?? '';
    const allLines = traceContent.split('\n');

    // Collect lines that look like thread headers or contain "Binder:" in thread name
    const matching: string[] = [];
    for (const line of allLines) {
      if (matching.length >= 30) break;
      // Thread header pattern: "thread-name" prio=N tid=N STATE
      // or lines containing "Binder:" as thread name
      if (
        /^"/.test(line) ||                   // starts with quote (thread header)
        /Binder:/.test(line) ||              // binder thread mention
        /^----- pid \d+/.test(line) ||       // process header
        /^Cmd line:/.test(line) ||           // cmd line
        /^----- end \d+/.test(line)          // end marker
      ) {
        matching.push(line);
      }
    }

    for (const line of matching) {
      console.log(line);
    }

    // Also print first 15 raw lines to see the exact format
    console.log('\n--- Raw first 15 lines of ANR trace ---');
    for (const line of allLines.slice(0, 15)) {
      console.log(line);
    }
  } else {
    console.log('(no ANR trace files found)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
