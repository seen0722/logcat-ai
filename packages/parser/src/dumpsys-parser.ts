import { MemInfoSummary, MemInfoProcess, CpuInfoSummary, CpuInfoProcess } from './types.js';

/**
 * Parse `dumpsys meminfo` system-level summary.
 *
 * Looks for:
 * - `Total RAM: XXX,XXXK` / `Free RAM: XXX,XXXK` / `Used RAM: XXX,XXXK`
 * - `Total PSS by process:` block with lines like `    312,456K: com.android.systemui (pid 1234)`
 */
export function parseMemInfo(content: string): MemInfoSummary {
  const result: MemInfoSummary = {
    totalRamKb: 0,
    freeRamKb: 0,
    usedRamKb: 0,
    topProcesses: [],
  };

  if (!content) return result;

  // Parse RAM summary lines
  // Format: "Total RAM: 5,832,568K (status normal)"
  const totalMatch = content.match(/Total\s+RAM:\s*([\d,]+)K/i);
  if (totalMatch) result.totalRamKb = parseKbValue(totalMatch[1]);

  const freeMatch = content.match(/Free\s+RAM:\s*([\d,]+)K/i);
  if (freeMatch) result.freeRamKb = parseKbValue(freeMatch[1]);

  const usedMatch = content.match(/Used\s+RAM:\s*([\d,]+)K/i);
  if (usedMatch) result.usedRamKb = parseKbValue(usedMatch[1]);

  // Parse "Total PSS by process:" section
  // Each line format: "    312,456K: com.android.systemui (pid 1234)"
  //               or: "    312,456K: com.android.systemui (pid 1234 / activities)"
  const pssSection = content.match(/Total PSS by process:\s*\n([\s\S]*?)(?:\n\s*\n|\nTotal PSS by (?:OOM|category))/i);
  if (pssSection) {
    const lines = pssSection[1].split('\n');
    const processes: MemInfoProcess[] = [];

    for (const line of lines) {
      const match = line.match(/^\s*([\d,]+)K:\s*(.+?)\s*\(pid\s+(\d+)/);
      if (match) {
        processes.push({
          totalPssKb: parseKbValue(match[1]),
          processName: match[2].trim(),
          pid: parseInt(match[3], 10),
        });
      }
    }

    // Already sorted by PSS descending in dumpsys output, take top 10
    result.topProcesses = processes.slice(0, 10);
  }

  return result;
}

/**
 * Parse `dumpsys cpuinfo` output.
 *
 * Looks for:
 * - Per-process lines: `18% 1234/system_server: 12% user + 6% kernel`
 * - TOTAL line: `XX% TOTAL: YY% user + ZZ% kernel + WW% iowait + ...`
 */
export function parseCpuInfo(content: string): CpuInfoSummary {
  const result: CpuInfoSummary = {
    totalCpuPercent: 0,
    userPercent: 0,
    kernelPercent: 0,
    ioWaitPercent: 0,
    topProcesses: [],
  };

  if (!content) return result;

  // Parse TOTAL line
  // Format: "34% TOTAL: 18% user + 12% kernel + 2.1% iowait + 0.3% irq + 0.5% softirq"
  const totalMatch = content.match(/([\d.]+)%\s+TOTAL:\s*([\d.]+)%\s+user\s*\+\s*([\d.]+)%\s+kernel(?:\s*\+\s*([\d.]+)%\s+iowait)?/i);
  if (totalMatch) {
    result.totalCpuPercent = parseFloat(totalMatch[1]);
    result.userPercent = parseFloat(totalMatch[2]);
    result.kernelPercent = parseFloat(totalMatch[3]);
    result.ioWaitPercent = totalMatch[4] ? parseFloat(totalMatch[4]) : 0;
  }

  // Parse per-process lines
  // Format: "18% 1234/system_server: 12% user + 6% kernel"
  //     or: " 0.3% 567/logd: 0.1% user + 0.1% kernel"
  const processRegex = /^\s*([\d.]+)%\s+(\d+)\/([^:]+):\s*([\d.]+)%\s+user\s*\+\s*([\d.]+)%\s+kernel/gm;
  const processes: CpuInfoProcess[] = [];
  let match: RegExpExecArray | null;

  while ((match = processRegex.exec(content)) !== null) {
    processes.push({
      cpuPercent: parseFloat(match[1]),
      pid: parseInt(match[2], 10),
      processName: match[3].trim(),
    });
  }

  // Sort by CPU% descending, take top 10
  processes.sort((a, b) => b.cpuPercent - a.cpuPercent);
  result.topProcesses = processes.slice(0, 10);

  return result;
}

/** Parse a KB value string like "5,832,568" to number 5832568 */
function parseKbValue(str: string): number {
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}
