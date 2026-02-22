/**
 * Detect whether text content is logcat or dmesg (kernel log) format.
 * Samples the first 50 non-empty lines and scores each against known patterns.
 */

export type LogFormat = 'logcat' | 'dmesg' | 'unknown';

export function detectLogFormat(content: string): LogFormat {
  // Sample first 50 non-empty lines
  const lines = content.split('\n').filter((l) => l.trim().length > 0).slice(0, 50);

  let logcatScore = 0;
  let dmesgScore = 0;

  for (const line of lines) {
    // Logcat format: "MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG: message"
    if (/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+\d+\s+\d+\s+[VDIWEF]\s/.test(line)) {
      logcatScore++;
    }
    // Alternative logcat: "[ MM-DD HH:MM:SS.mmm PID:TID LEVEL/TAG ]"
    if (/^\[\s*\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(line)) {
      logcatScore++;
    }
    // Dmesg format: "[seconds.microseconds] message"
    if (/^\[\s*\d+\.\d+\]\s/.test(line)) {
      dmesgScore++;
    }
    // Dmesg with log-level prefix: "<level>[seconds.microseconds]"
    if (/^<\d+>\[\s*\d+\.\d+\]/.test(line)) {
      dmesgScore++;
    }
  }

  if (logcatScore > dmesgScore && logcatScore >= 3) return 'logcat';
  if (dmesgScore > logcatScore && dmesgScore >= 3) return 'dmesg';
  return 'unknown';
}
