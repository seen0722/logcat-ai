import {
  NativeCrashSignal,
  NativeStackFrame,
  TombstoneAnalysis,
  TombstoneParseResult,
} from './types.js';

// ============================================================
// Signal number → name mapping
// ============================================================

const SIGNAL_NAME_MAP: Record<number, NativeCrashSignal> = {
  4: 'SIGILL',
  5: 'SIGTRAP',
  6: 'SIGABRT',
  7: 'SIGBUS',
  8: 'SIGFPE',
  11: 'SIGSEGV',
};

function signalNumberToName(num: number): NativeCrashSignal {
  return SIGNAL_NAME_MAP[num] ?? 'UNKNOWN';
}

// ============================================================
// Regex patterns
// ============================================================

const RE_BUILD_FINGERPRINT = /^Build fingerprint:\s*'(.+)'/m;
const RE_ABI = /^ABI:\s*'(\w+)'/m;
const RE_TIMESTAMP = /^Timestamp:\s*(.+)/m;
const RE_PID_TID = /^pid:\s*(\d+),\s*tid:\s*(\d+),\s*name:\s*(\S+)\s*>>>\s*(.+?)\s*<<</m;
const RE_SIGNAL = /^signal\s+(\d+)\s*\((\w+)\),\s*code\s+[-\d]+\s*\(([^)]*)\)(?:,\s*fault addr\s+(0x[0-9a-fA-F]+|0x0+))?/m;
const RE_ABORT_MESSAGE = /^Abort message:\s*'(.+)'/m;

// Backtrace frame: #00 pc 0004793e  /system/lib/libc.so (func+offset) (BuildId: ...)
const RE_BACKTRACE_FRAME = /^\s*#(\d+)\s+pc\s+([0-9a-fA-F]+)\s+(\S+)(?:\s+\(([^)]+)\))?(?:\s+\(BuildId:\s*([0-9a-fA-F]+)\))?/;

// Register lines: e.g. "    x0  0000007b574c7000  x1  0000000000000080"
// Also matches: "    lr  ... sp  ... pc  ... pst ..."
const RE_REGISTER_LINE = /^\s+((?:[xr]\d+|[a-z]{2,3})\s+[0-9a-fA-F]+(?:\s+(?:[xr]\d+|[a-z]{2,3})\s+[0-9a-fA-F]+)*)\s*$/;
const RE_REGISTER_PAIR = /([xr]\d+|[a-z]{2,3})\s+([0-9a-fA-F]+)/g;
// Quick test: line starts with whitespace followed by register name pattern
const RE_REGISTER_QUICK = /^\s+(?:[xr]\d+|lr|sp|pc|pst)\s+[0-9a-fA-F]{8,}/;

// ============================================================
// Single tombstone parser
// ============================================================

export function parseTombstone(content: string, fileName: string): TombstoneAnalysis {
  const lines = content.split('\n');

  // Defaults
  let pid = 0;
  let tid = 0;
  let processName = 'unknown';
  let threadName: string | undefined;
  let signal = 0;
  let signalName: NativeCrashSignal = 'UNKNOWN';
  let signalCode: string | undefined;
  let faultAddr: string | undefined;
  let abi: string | undefined;
  let buildFingerprint: string | undefined;
  let timestamp: string | undefined;
  let abortMessage: string | undefined;
  const backtrace: NativeStackFrame[] = [];
  const registers: Record<string, string> = {};

  // Parse header fields using regex on full content
  const fpMatch = content.match(RE_BUILD_FINGERPRINT);
  if (fpMatch) buildFingerprint = fpMatch[1];

  const abiMatch = content.match(RE_ABI);
  if (abiMatch) abi = abiMatch[1];

  const tsMatch = content.match(RE_TIMESTAMP);
  if (tsMatch) timestamp = tsMatch[1].trim();

  const pidMatch = content.match(RE_PID_TID);
  if (pidMatch) {
    pid = parseInt(pidMatch[1], 10);
    tid = parseInt(pidMatch[2], 10);
    threadName = pidMatch[3];
    processName = pidMatch[4];
  }

  const sigMatch = content.match(RE_SIGNAL);
  if (sigMatch) {
    signal = parseInt(sigMatch[1], 10);
    signalName = sigMatch[2] as NativeCrashSignal;
    // Validate signalName is one we know, otherwise derive from number
    if (!Object.values(SIGNAL_NAME_MAP).includes(signalName)) {
      signalName = signalNumberToName(signal);
    }
    signalCode = sigMatch[3] || undefined;
    faultAddr = sigMatch[4] || undefined;
  }

  const abortMatch = content.match(RE_ABORT_MESSAGE);
  if (abortMatch) abortMessage = abortMatch[1];

  // Parse backtrace and registers line by line
  let inBacktrace = false;
  let inRegisters = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect backtrace section
    if (trimmed === 'backtrace:' || trimmed === 'backtrace:') {
      inBacktrace = true;
      inRegisters = false;
      continue;
    }

    // Detect register section
    if (/^registers?:/i.test(trimmed)) {
      inRegisters = true;
      inBacktrace = false;
      continue;
    }

    // End of section on blank line or new section header
    if (trimmed === '' || (trimmed.endsWith(':') && !trimmed.startsWith('#'))) {
      if (inBacktrace && backtrace.length > 0) inBacktrace = false;
      if (inRegisters && Object.keys(registers).length > 0) inRegisters = false;
    }

    // Parse backtrace frames
    if (inBacktrace || RE_BACKTRACE_FRAME.test(line)) {
      const frameMatch = line.match(RE_BACKTRACE_FRAME);
      if (frameMatch) {
        const funcPart = frameMatch[4];
        let funcName: string | undefined;
        let offset: number | undefined;

        if (funcPart) {
          // Parse "func+offset" or just "func"
          const funcOffsetMatch = funcPart.match(/^(.+)\+(\d+)$/);
          if (funcOffsetMatch) {
            funcName = funcOffsetMatch[1];
            offset = parseInt(funcOffsetMatch[2], 10);
          } else {
            funcName = funcPart;
          }
        }

        backtrace.push({
          frameNumber: parseInt(frameMatch[1], 10),
          pc: frameMatch[2],
          binary: frameMatch[3],
          function: funcName,
          offset,
          buildId: frameMatch[5],
          raw: line.trim(),
        });
        inBacktrace = true;
      }
    }

    // Parse register values (either in explicit register section or inline after signal)
    if (inRegisters || (!inBacktrace && RE_REGISTER_QUICK.test(line))) {
      const regMatch = line.match(RE_REGISTER_LINE);
      if (regMatch) {
        let m: RegExpExecArray | null;
        RE_REGISTER_PAIR.lastIndex = 0;
        while ((m = RE_REGISTER_PAIR.exec(regMatch[1])) !== null) {
          registers[m[1]] = m[2];
        }
      }
    }
  }

  // Determine crashed binary and vendor crash
  const crashedInBinary = backtrace.length > 0 ? backtrace[0].binary : undefined;
  const isVendorCrash = crashedInBinary
    ? /^\/(vendor|odm)\//.test(crashedInBinary)
    : false;

  // Build summary
  const summary = buildSummary(processName, signalName, signalCode, crashedInBinary, abortMessage);

  return {
    fileName,
    pid,
    tid,
    processName,
    threadName,
    signal,
    signalName,
    signalCode,
    faultAddr,
    abi,
    buildFingerprint,
    timestamp,
    backtrace,
    crashedInBinary,
    isVendorCrash,
    abortMessage,
    registers: Object.keys(registers).length > 0 ? registers : undefined,
    summary,
  };
}

function buildSummary(
  processName: string,
  signalName: NativeCrashSignal,
  signalCode: string | undefined,
  crashedInBinary: string | undefined,
  abortMessage: string | undefined,
): string {
  const binaryShort = crashedInBinary?.split('/').pop() ?? 'unknown';

  if (signalName === 'SIGABRT' && abortMessage) {
    const msg = abortMessage.length > 80 ? abortMessage.slice(0, 80) + '...' : abortMessage;
    return `Native crash (SIGABRT) in ${processName}: ${msg}`;
  }

  const codeStr = signalCode ? ` (${signalCode})` : '';
  return `Native crash (${signalName}${codeStr}) in ${processName} at ${binaryShort}`;
}

// ============================================================
// Batch parser
// ============================================================

export function parseTombstones(contents: Map<string, string>): TombstoneParseResult {
  const analyses: TombstoneAnalysis[] = [];
  let totalFiles = 0;

  for (const [fileName, content] of contents) {
    totalFiles++;

    // Skip protobuf files
    if (fileName.endsWith('.pb')) continue;

    // Skip empty content
    if (!content || content.trim().length === 0) continue;

    try {
      const analysis = parseTombstone(content, fileName);
      // Only include if we got meaningful data (at least signal or backtrace)
      if (analysis.signal > 0 || analysis.backtrace.length > 0) {
        analyses.push(analysis);
      }
    } catch {
      // Skip unparseable files silently
    }
  }

  return { analyses, totalFiles };
}
