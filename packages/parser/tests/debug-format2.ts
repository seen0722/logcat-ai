import { unpackBugreport } from '../src/unpacker.js';

async function main() {
  const zip = '/Users/chenzeming/bugreport-samples/bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip';
  const result = await unpackBugreport(zip);

  // Kernel log - actual dmesg section
  const kernelSection = result.sections.find(
    (s) => s.name === 'KERNEL LOG' && s.command.includes('dmesg')
  );
  if (kernelSection) {
    console.log('=== KERNEL LOG (lines 1-30) ===');
    kernelSection.content.split('\n').slice(0, 30).forEach((l, i) => console.log(`${i}: ${l}`));
    console.log('\n=== KERNEL LOG (last 10 lines) ===');
    const klines = kernelSection.content.split('\n');
    klines.slice(-10).forEach((l, i) => console.log(`${klines.length - 10 + i}: ${l}`));
  }

  // ANR - full first trace, first 80 lines
  console.log('\n=== ANR trace (trace_00 or first anr file, lines 0-100) ===');
  const anrFile = result.anrTraceFiles.find(f => f.includes('trace_00')) ?? result.anrTraceFiles[0];
  const anrContent = result.anrTraceContents.get(anrFile) ?? '';
  anrContent.split('\n').slice(0, 100).forEach((l, i) => console.log(`${i}: ${l}`));

  // Also check the newer ANR format (anr_ files)
  console.log('\n=== ANR anr_* file, lines 0-80 ===');
  const anrFile2 = result.anrTraceFiles.find(f => f.includes('anr_'));
  if (anrFile2) {
    const anrContent2 = result.anrTraceContents.get(anrFile2) ?? '';
    anrContent2.split('\n').slice(0, 80).forEach((l, i) => console.log(`${i}: ${l}`));
  }
}

main().catch(console.error);
