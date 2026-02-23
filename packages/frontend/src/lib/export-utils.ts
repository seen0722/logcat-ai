/**
 * Search result export utilities — CSV and logcat text format.
 */

interface ExportEntry {
  timestamp: string;
  pid?: number;
  tid?: number;
  level: string;
  tag: string;
  message: string;
}

/** Export entries as CSV with header row. */
export function entriesToCSV(entries: ExportEntry[]): string {
  const header = 'timestamp,pid,tid,level,tag,message';
  const rows = entries.map((e) => {
    const fields = [
      e.timestamp,
      String(e.pid ?? ''),
      String(e.tid ?? ''),
      e.level,
      e.tag,
      e.message,
    ];
    // Escape fields that contain commas, quotes, or newlines
    return fields.map((f) => {
      if (/[,"\n\r]/.test(f)) {
        return `"${f.replace(/"/g, '""')}"`;
      }
      return f;
    }).join(',');
  });
  return [header, ...rows].join('\n');
}

/** Export entries as logcat raw text format (adb logcat output style). */
export function entriesToLogcatText(entries: ExportEntry[]): string {
  return entries.map((e) => {
    const pid = String(e.pid ?? '?').padStart(5);
    const tid = String(e.tid ?? '?').padStart(5);
    return `${e.timestamp} ${pid} ${tid} ${e.level} ${e.tag}: ${e.message}`;
  }).join('\n');
}

// ---- Kernel Export ----

interface KernelExportEntry {
  timestamp: string;
  level: string;
  facility: string;
  message: string;
}

/** Export kernel entries as CSV with header row. */
export function kernelEntriesToCSV(entries: KernelExportEntry[]): string {
  const header = 'timestamp,level,facility,message';
  const rows = entries.map((e) => {
    const fields = [e.timestamp, e.level, e.facility, e.message];
    return fields.map((f) => {
      if (/[,"\n\r]/.test(f)) {
        return `"${f.replace(/"/g, '""')}"`;
      }
      return f;
    }).join(',');
  });
  return [header, ...rows].join('\n');
}

/** Export kernel entries as dmesg text format. */
export function kernelEntriesToDmesgText(entries: KernelExportEntry[]): string {
  return entries.map((e) => {
    return `${e.level}[${e.timestamp.padStart(12)}] ${e.message}`;
  }).join('\n');
}

/** Trigger a browser download for the given content. */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
