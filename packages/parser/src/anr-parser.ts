import {
  ThreadInfo,
  ThreadState,
  StackFrame,
  LockInfo,
  MainThreadBlockReason,
  DeadlockCycle,
  LockGraphNode,
  LockGraphEdge,
  ANRTraceAnalysis,
  ThreadBlockAnalysis,
  BinderTargetInfo,
} from './types.js';

// ============================================================
// Regex Patterns
// ============================================================

// "main" prio=5 tid=1 Blocked
// "Binder:1234_1" daemon prio=5 tid=12 Native
const THREAD_HEADER_RE =
  /^"(.+?)"\s+(?:(daemon)\s+)?prio=(\d+)\s+tid=(\d+)\s+(\w+)/;

// Native backtrace format: "android.fg" sysTid=1755
const NATIVE_THREAD_HEADER_RE =
  /^"(.+?)"\s+sysTid=(\d+)/;

// | group="main" sCount=1 ucsCount=0 flags=1 obj=0x... self=0x...
// | sysTid=1234 nice=-10 cgrp=...
const SYS_TID_RE = /sysTid=(\d+)/;

// - waiting to lock <0x0a2b3c4d> (a java.lang.Object) held by thread 5
const WAITING_ON_LOCK_RE =
  /- waiting to lock <(0x[\da-fA-F]+)>\s+\(a (.+?)\)\s+held by thread (\d+)/;

// - locked <0x0a2b3c4d> (a java.lang.Object)
const HELD_LOCK_RE = /- locked <(0x[\da-fA-F]+)>\s+\(a (.+?)\)/;

// at com.example.app.MainActivity.onCreate(MainActivity.java:42)
const STACK_FRAME_RE = /at\s+([\w$.<>]+)\.([\w$<>]+)\((.+?)(?::(\d+))?\)/;

// native: #00 pc 0x... /system/lib/libc.so (function+offset)
// Also matches native backtrace format: #00 pc 0x... /path/lib.so (func+offset)
const NATIVE_FRAME_RE = /(?:native:\s+)?#\d+\s+pc\s+/;

// ----- pid 1234 at 2024-01-15 10:00:00.000 -----
// Also: ----- Waiting Channels: pid 1234 at ...
// Also: ----- dumping pid: 1234 at ...
const PID_HEADER_RE = /^----- (?:(?:Waiting Channels: )?pid|dumping pid:)\s+(\d+)\s+at\s+(.+?)(?:\s*-----)?$/;

// Cmd line: com.example.app
const CMD_LINE_RE = /^Cmd line:\s+(.+)/;

// Subject: Blocked in handler on foreground thread (android.fg) for 15s
const SUBJECT_RE = /^Subject:\s+(.+)/;
// Extract thread name from Subject like "Blocked in handler on ... thread (android.fg) ..."
const SUBJECT_THREAD_RE = /thread\s+\(([^)]+)\)/;

// ============================================================
// Main Parser
// ============================================================

/**
 * Parse ANR trace text (from /data/anr/ files) into structured analysis.
 */
export function parseANRTrace(content: string): ANRTraceAnalysis {
  const lines = content.split('\n');

  // Extract process info and Subject line
  let pid = 0;
  let processName = 'unknown';
  let timestamp: string | undefined;
  let subject: string | undefined;
  let blockedThreadName: string | undefined;

  for (const line of lines) {
    const subjectMatch = line.match(SUBJECT_RE);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      const threadMatch = subject.match(SUBJECT_THREAD_RE);
      if (threadMatch) {
        blockedThreadName = threadMatch[1]; // e.g. "android.fg"
      }
    }
    const pidMatch = line.match(PID_HEADER_RE);
    if (pidMatch) {
      pid = parseInt(pidMatch[1], 10);
      timestamp = pidMatch[2];
    }
    // Fallback: extract PID from CriticalEventLog "pid: 1702"
    if (pid === 0) {
      const critPidMatch = line.match(/^\s+pid:\s+(\d+)/);
      if (critPidMatch) {
        pid = parseInt(critPidMatch[1], 10);
      }
    }
    const cmdMatch = line.match(CMD_LINE_RE);
    if (cmdMatch) {
      processName = cmdMatch[1].trim();
      break; // Cmd line comes after pid header
    }
  }

  // Parse all threads
  const threads = parseThreads(lines);

  // Build lock graph
  const lockGraph = buildLockGraph(threads);

  // Detect deadlocks
  const deadlocks = detectDeadlocks(threads, lockGraph);

  // Analyze binder threads
  const binderThreads = analyzeBinderThreads(threads);

  // Find and analyze main thread.
  // In standard Java dumps: thread named "main" with tid=1.
  // In native backtrace dumps: thread named after the process (e.g. "system_server") with the lowest sysTid.
  let mainThread = analyzeThread(threads, 'main', deadlocks, binderThreads);
  if (!mainThread && processName !== 'unknown') {
    mainThread = analyzeThread(threads, processName, deadlocks, binderThreads);
  }

  // If Subject indicates a different blocked thread, analyze that too
  let blockedThread: ThreadBlockAnalysis | null | undefined;
  if (blockedThreadName && blockedThreadName !== 'main') {
    blockedThread = analyzeThread(threads, blockedThreadName, deadlocks, binderThreads);
  }

  return {
    pid,
    processName,
    timestamp,
    subject,
    threads,
    mainThread,
    blockedThread,
    blockedThreadName,
    lockGraph,
    deadlocks,
    binderThreads,
  };
}

// ============================================================
// Thread Parsing
// ============================================================

function parseThreads(lines: string[]): ThreadInfo[] {
  const threads: ThreadInfo[] = [];
  let currentThread: Partial<ThreadInfo> | null = null;
  let currentRawLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Try standard Java thread dump header first
    const headerMatch = line.match(THREAD_HEADER_RE);
    if (headerMatch) {
      if (currentThread) {
        threads.push(finalizeThread(currentThread, currentRawLines));
      }
      currentThread = {
        name: headerMatch[1],
        daemon: headerMatch[2] === 'daemon',
        priority: parseInt(headerMatch[3], 10),
        tid: parseInt(headerMatch[4], 10),
        state: normalizeThreadState(headerMatch[5]),
        stackFrames: [],
        waitingOnLock: null,
        heldLocks: [],
      };
      currentRawLines = [line];
      continue;
    }

    // Try native backtrace header: "android.fg" sysTid=1755
    const nativeHeaderMatch = line.match(NATIVE_THREAD_HEADER_RE);
    if (nativeHeaderMatch) {
      if (currentThread) {
        threads.push(finalizeThread(currentThread, currentRawLines));
      }
      const sysTid = parseInt(nativeHeaderMatch[2], 10);
      currentThread = {
        name: nativeHeaderMatch[1],
        daemon: false,
        priority: 0,
        tid: sysTid, // use sysTid as tid for native-only dumps
        state: 'Native' as ThreadState,
        sysTid,
        stackFrames: [],
        waitingOnLock: null,
        heldLocks: [],
      };
      currentRawLines = [line];
      continue;
    }

    if (!currentThread) continue;
    currentRawLines.push(line);

    // Parse sysTid from "| sysTid=..." lines (standard format)
    const sysTidMatch = line.match(SYS_TID_RE);
    if (sysTidMatch) {
      currentThread.sysTid = parseInt(sysTidMatch[1], 10);
    }

    // Parse waiting-on-lock
    const waitMatch = line.match(WAITING_ON_LOCK_RE);
    if (waitMatch) {
      currentThread.waitingOnLock = {
        address: waitMatch[1],
        className: waitMatch[2],
        heldByTid: parseInt(waitMatch[3], 10),
      };
    }

    // Parse held locks
    const heldMatch = line.match(HELD_LOCK_RE);
    if (heldMatch) {
      currentThread.heldLocks!.push({
        address: heldMatch[1],
        className: heldMatch[2],
      });
    }

    // Parse stack frames — Java "at" frames
    const frameMatch = line.match(STACK_FRAME_RE);
    if (frameMatch) {
      currentThread.stackFrames!.push({
        className: frameMatch[1],
        methodName: frameMatch[2],
        fileName: frameMatch[3],
        lineNumber: frameMatch[4] ? parseInt(frameMatch[4], 10) : -1,
        isNative: false,
        raw: line.trim(),
      });
    } else if (NATIVE_FRAME_RE.test(line)) {
      // Native frame: #NN pc 0xaddr /path/lib.so (func+offset)
      // Some native frames contain OAT-compiled Java methods, extract them
      const oatJavaMatch = line.match(/\.oat\s+\((\S+?)\.(\w+)[+)]/);
      if (oatJavaMatch) {
        // e.g. "android.os.Looper.loopOnce+96" → className=android.os.Looper, method=loopOnce
        currentThread.stackFrames!.push({
          className: oatJavaMatch[1],
          methodName: oatJavaMatch[2],
          fileName: line.trim(),
          lineNumber: -1,
          isNative: false, // treat OAT Java frames as Java for classification
          raw: line.trim(),
        });
      } else {
        currentThread.stackFrames!.push({
          className: '',
          methodName: '',
          fileName: line.trim(),
          lineNumber: -1,
          isNative: true,
          raw: line.trim(),
        });
      }
    }
  }

  // Don't forget the last thread
  if (currentThread) {
    threads.push(finalizeThread(currentThread, currentRawLines));
  }

  return threads;
}

function finalizeThread(partial: Partial<ThreadInfo>, rawLines: string[]): ThreadInfo {
  return {
    name: partial.name ?? 'unknown',
    priority: partial.priority ?? 0,
    tid: partial.tid ?? 0,
    state: partial.state ?? 'Unknown',
    daemon: partial.daemon ?? false,
    sysTid: partial.sysTid,
    stackFrames: partial.stackFrames ?? [],
    waitingOnLock: partial.waitingOnLock ?? null,
    heldLocks: partial.heldLocks ?? [],
    raw: rawLines.join('\n'),
  };
}

function normalizeThreadState(raw: string): ThreadState {
  const map: Record<string, ThreadState> = {
    Runnable: 'Runnable',
    Sleeping: 'Sleeping',
    Waiting: 'Waiting',
    TimedWaiting: 'TimedWaiting',
    Blocked: 'Blocked',
    Native: 'Native',
    Suspended: 'Suspended',
  };
  return map[raw] ?? 'Unknown';
}

// ============================================================
// Lock Graph
// ============================================================

function buildLockGraph(
  threads: ThreadInfo[]
): { nodes: LockGraphNode[]; edges: LockGraphEdge[] } {
  const nodes: LockGraphNode[] = [];
  const edges: LockGraphEdge[] = [];
  const nodeSet = new Set<number>();

  for (const thread of threads) {
    if (thread.waitingOnLock?.heldByTid != null) {
      // This thread is waiting for a lock held by another thread
      const fromTid = thread.tid;
      const toTid = thread.waitingOnLock.heldByTid;

      if (!nodeSet.has(fromTid)) {
        nodeSet.add(fromTid);
        nodes.push({ tid: fromTid, threadName: thread.name });
      }
      if (!nodeSet.has(toTid)) {
        nodeSet.add(toTid);
        const holder = threads.find((t) => t.tid === toTid);
        nodes.push({ tid: toTid, threadName: holder?.name ?? `thread-${toTid}` });
      }

      edges.push({
        from: fromTid,
        to: toTid,
        lockAddress: thread.waitingOnLock.address,
        lockClassName: thread.waitingOnLock.className,
      });
    }
  }

  return { nodes, edges };
}

// ============================================================
// Deadlock Detection (DFS cycle finding)
// ============================================================

function detectDeadlocks(
  threads: ThreadInfo[],
  lockGraph: { nodes: LockGraphNode[]; edges: LockGraphEdge[] }
): { detected: boolean; cycles: DeadlockCycle[] } {
  const cycles: DeadlockCycle[] = [];
  if (lockGraph.edges.length === 0) return { detected: false, cycles };

  // Build adjacency list: tid -> [tid it's waiting on]
  const adj = new Map<number, number[]>();
  for (const edge of lockGraph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  const visited = new Set<number>();
  const inStack = new Set<number>();
  const path: number[] = [];

  function dfs(tid: number): void {
    if (inStack.has(tid)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(tid);
      if (cycleStart !== -1) {
        const cycleTids = path.slice(cycleStart);
        const cycleThreads = cycleTids
          .map((t) => threads.find((th) => th.tid === t))
          .filter((t): t is ThreadInfo => t != null);
        const cycleLocks = cycleTids
          .map((t) => {
            const thread = threads.find((th) => th.tid === t);
            return thread?.waitingOnLock;
          })
          .filter((l): l is LockInfo => l != null);

        if (cycleThreads.length >= 2) {
          cycles.push({ threads: cycleThreads, locks: cycleLocks });
        }
      }
      return;
    }

    if (visited.has(tid)) return;
    visited.add(tid);
    inStack.add(tid);
    path.push(tid);

    const neighbors = adj.get(tid) ?? [];
    for (const next of neighbors) {
      dfs(next);
    }

    path.pop();
    inStack.delete(tid);
  }

  for (const node of lockGraph.nodes) {
    if (!visited.has(node.tid)) {
      dfs(node.tid);
    }
  }

  return { detected: cycles.length > 0, cycles };
}

// ============================================================
// Binder Thread Analysis
// ============================================================

function analyzeBinderThreads(threads: ThreadInfo[]) {
  const binderThreads = threads.filter(
    (t) => /^binder[_:]/i.test(t.name)
  );
  const idle = binderThreads.filter(
    (t) => t.state === 'Native' && hasNativePollOnce(t)
  );
  const busy = binderThreads.length - idle.length;

  return {
    total: binderThreads.length,
    busy,
    idle: idle.length,
    exhausted: binderThreads.length > 0 && idle.length === 0,
  };
}

function hasNativePollOnce(thread: ThreadInfo): boolean {
  return thread.stackFrames.some(
    (f) => f.raw.includes('nativePollOnce') || f.raw.includes('IPCThreadState')
  );
}

// ============================================================
// Main Thread Analysis + 18-case Classification
// ============================================================

/**
 * Analyze a specific thread by name. Used for both main thread and Subject-identified blocked thread.
 */
function analyzeThread(
  threads: ThreadInfo[],
  threadName: string,
  deadlocks: { detected: boolean; cycles: DeadlockCycle[] },
  binderThreads: { exhausted: boolean }
): ThreadBlockAnalysis | null {
  const target = threadName === 'main'
    ? threads.find((t) => t.name === 'main' || t.tid === 1)
    : threads.find((t) => t.name === threadName);
  if (!target) return null;

  const blockReason = classifyMainThreadBlock(target, threads, deadlocks, binderThreads);
  const blockingChain = buildBlockingChain(target, threads);
  const confidence = estimateConfidence(blockReason, target);
  const binderTarget = blockReason === 'slow_binder_call'
    ? extractBinderTarget(target)
    : undefined;

  // When thread is idle/unknown, scan other threads for stuck HAL/binder calls
  let suspectedBinderTargets: ThreadBlockAnalysis['suspectedBinderTargets'];
  if (blockReason === 'idle_main_thread' || blockReason === 'system_overload_candidate' || blockReason === 'unknown') {
    suspectedBinderTargets = scanOtherThreadsForBinderTargets(threads, target);
  }

  return {
    thread: target,
    blockReason,
    blockingChain,
    confidence: suspectedBinderTargets && suspectedBinderTargets.length > 0
      ? 'medium' as const
      : confidence,
    binderTarget,
    suspectedBinderTargets: suspectedBinderTargets && suspectedBinderTargets.length > 0
      ? suspectedBinderTargets
      : undefined,
  };
}

function classifyMainThreadBlock(
  mainThread: ThreadInfo,
  allThreads: ThreadInfo[],
  deadlocks: { detected: boolean; cycles: DeadlockCycle[] },
  binderThreads: { exhausted: boolean }
): MainThreadBlockReason {
  const stack = mainThread.stackFrames;
  const stackText = stack.map((f) => f.raw).join('\n');

  // 1. Lock Contention
  if (mainThread.state === 'Blocked' && mainThread.waitingOnLock) {
    // 2. Check if it's part of a deadlock
    if (deadlocks.detected) {
      const inDeadlock = deadlocks.cycles.some((c) =>
        c.threads.some((t) => t.tid === mainThread.tid)
      );
      if (inDeadlock) return 'deadlock';
    }
    return 'lock_contention';
  }

  // 3. I/O on Main Thread
  if (matchesIOPatterns(stackText)) return 'io_on_main_thread';

  // 4. Network on Main Thread
  if (matchesNetworkPatterns(stackText)) return 'network_on_main_thread';

  // 5. Slow Binder Call
  if (matchesBinderCallPatterns(stackText)) return 'slow_binder_call';

  // 7. Expensive Rendering
  if (matchesRenderingPatterns(stackText)) return 'expensive_rendering';

  // 14. Content Provider Slow
  if (matchesContentProviderPatterns(stackText)) return 'content_provider_slow';

  // 8. Broadcast Blocking
  if (matchesBroadcastPatterns(stackText)) return 'broadcast_blocking';

  // 9. Slow App Startup
  if (matchesAppStartupPatterns(stackText)) return 'slow_app_startup';

  // 13. Binder Pool Exhaustion
  if (binderThreads.exhausted) return 'binder_pool_exhaustion';

  // 10. nativePollOnce — idle main thread (possible false ANR)
  if (stackText.includes('nativePollOnce') || stackText.includes('MessageQueue.next')) {
    return 'idle_main_thread';
  }

  // 6. Heavy Computation (state=Runnable + app frames in stack)
  if (mainThread.state === 'Runnable' && hasAppFrames(stack)) {
    return 'heavy_computation';
  }

  // 12. System Overload Candidate (Runnable but no meaningful app stack)
  if (mainThread.state === 'Runnable' && !hasAppFrames(stack)) {
    return 'system_overload_candidate';
  }

  // 11. No Stack Frames
  if (stack.length === 0) return 'no_stack_frames';

  return 'unknown';
}

// ============================================================
// Binder/HAL Target Extraction
// ============================================================

/**
 * Extract the HIDL/AIDL HAL interface or Binder service being called
 * by scanning the main thread stack for known patterns.
 */
function extractBinderTarget(mainThread: ThreadInfo): BinderTargetInfo {
  const frames = mainThread.stackFrames;

  // Strategy 1: Look for HIDL getService() / AIDL getService() pattern
  // e.g. "at vendor.trimble.hardware.trmbkeypad.V1_0.ITrmbKeypad.getService(ITrmbKeypad.java:57)"
  for (const f of frames) {
    if (f.isNative) continue;
    // HIDL pattern: <package>.V<major>_<minor>.I<Name>.getService
    const hidlMatch = f.raw.match(
      /at\s+([\w.]+\.V\d+_\d+)\.(I\w+)\.(getService|castFrom)/
    );
    if (hidlMatch) {
      const pkg = hidlMatch[1].replace(/\./g, '.').replace(/\.V/, '@').replace(/_/, '.');
      const ifaceFqn = `${hidlMatch[1]}.${hidlMatch[2]}`;
      // Find the caller: skip HIDL proxy class itself
      const caller = findCallerFrame(frames, f, [ifaceFqn]);
      return {
        interfaceName: hidlMatch[2],
        packageName: pkg,
        method: hidlMatch[3],
        callerClass: caller?.className ?? '',
        callerMethod: caller?.methodName ?? '',
      } satisfies BinderTargetInfo;
    }

    // AIDL pattern: <package>.I<Name>.Stub.asInterface / getService
    const aidlMatch = f.raw.match(
      /at\s+([\w.]+)\.(I\w+)\$Stub\.(asInterface|getService)/
    );
    if (aidlMatch) {
      const stubFqn = `${aidlMatch[1]}.${aidlMatch[2]}`;
      const caller = findCallerFrame(frames, f, [stubFqn, `${stubFqn}$Stub`, `${stubFqn}$Stub$Proxy`]);
      return {
        interfaceName: aidlMatch[2],
        packageName: aidlMatch[1],
        method: aidlMatch[3],
        callerClass: caller?.className ?? '',
        callerMethod: caller?.methodName ?? '',
      } satisfies BinderTargetInfo;
    }
  }

  // Strategy 2: Look for BinderProxy.transact called from a recognizable service
  for (const f of frames) {
    if (f.isNative) continue;
    if (f.raw.includes('BinderProxy.transact')) {
      const caller = findCallerFrame(frames, f);
      if (caller) {
        // Try to extract interface name from caller class
        const ifaceMatch = caller.className.match(/\.(I\w+)\$Stub\$Proxy$/);
        return {
          interfaceName: ifaceMatch?.[1] ?? caller.className.split('.').pop() ?? '',
          packageName: caller.className.replace(/\.\w+$/, ''),
          method: caller.methodName,
          callerClass: caller.className,
          callerMethod: caller.methodName,
        } satisfies BinderTargetInfo;
      }
    }
  }

  // Strategy 3: Use extractBinderTargetFromFrames for native HAL .so detection
  // This handles HIDL .so in /system/lib64/ and /vendor/lib64/
  const nativeTarget = extractBinderTargetFromFrames(frames);
  if (nativeTarget && nativeTarget.interfaceName !== 'Unknown') {
    return nativeTarget;
  }

  // Fallback: return generic info from the first Java frame after native binder frames
  const firstJavaFrame = frames.find((f) => !f.isNative && f.className &&
    !f.className.startsWith('android.os.') &&
    !f.className.startsWith('android.hidl.')
  );
  if (firstJavaFrame) {
    return {
      interfaceName: firstJavaFrame.className.split('.').pop() ?? 'Unknown',
      packageName: firstJavaFrame.className.replace(/\.\w+$/, ''),
      method: firstJavaFrame.methodName,
      callerClass: firstJavaFrame.className,
      callerMethod: firstJavaFrame.methodName,
    } satisfies BinderTargetInfo;
  }

  return {
    interfaceName: 'Unknown',
    packageName: '',
    method: '',
    callerClass: '',
    callerMethod: '',
  } satisfies BinderTargetInfo;
}

/**
 * Find the first "caller" frame — the frame that invoked the binder/HAL proxy.
 * Skip framework and binder infrastructure frames.
 */
function findCallerFrame(
  frames: StackFrame[],
  proxyFrame: StackFrame,
  skipClasses: string[] = []
): StackFrame | null {
  const idx = frames.indexOf(proxyFrame);
  if (idx === -1) return null;

  for (let i = idx + 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.isNative) continue;
    // Skip android framework / binder infrastructure
    if (
      f.className.startsWith('android.os.') ||
      f.className.startsWith('android.hidl.') ||
      f.className.includes('$Stub$Proxy') ||
      f.className.includes('HwBinder')
    ) continue;
    // Skip the proxy interface class itself
    if (skipClasses.some((c) => f.className === c || f.className.startsWith(c + '$'))) continue;
    return f;
  }
  return null;
}

// ============================================================
// Scan Other Threads for Binder/HAL Targets
// ============================================================

/**
 * When the main thread is idle, scan all other threads for stuck HAL/binder calls.
 * This reveals the actual root cause when the system is overloaded.
 */
function scanOtherThreadsForBinderTargets(
  threads: ThreadInfo[],
  mainThread: ThreadInfo
): Array<BinderTargetInfo & { threadName: string; threadState: string }> {
  const results: Array<BinderTargetInfo & { threadName: string; threadState: string }> = [];
  const seen = new Set<string>();

  for (const t of threads) {
    if (t === mainThread) continue;
    if (t.state === 'Waiting' || t.state === 'Sleeping' || t.state === 'TimedWaiting') continue;

    const stackText = t.stackFrames.map((f) => f.raw).join('\n');
    const isStuckInBinder =
      stackText.includes('IPCThreadState::transact') ||
      stackText.includes('IPCThreadState::talkWithDriver') ||
      stackText.includes('IPCThreadState::waitForResponse') ||
      stackText.includes('BinderProxy.transact');

    if (!isStuckInBinder) continue;

    // Try to extract the HAL target from this thread's stack
    const target = extractBinderTargetFromFrames(t.stackFrames);
    if (!target || target.interfaceName === 'Unknown') continue;

    const key = `${target.interfaceName}:${target.method}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      ...target,
      threadName: t.name,
      threadState: t.state,
    });
  }

  return results;
}

/**
 * Extract binder target from any thread's stack frames.
 * Similar to extractBinderTarget but works on arbitrary frames.
 */
function extractBinderTargetFromFrames(frames: StackFrame[]): BinderTargetInfo | null {
  // Strategy 1: HIDL HAL .so in native frames
  // e.g. "android.hardware.gnss@1.0.so (android::hardware::gnss::V1_0::BpHwGnss::_hidl_start+260)"
  for (const f of frames) {
    if (!f.isNative) continue;
    const hidlSoMatch = f.raw.match(
      /\/(android\.hardware\.\w[\w.]*@[\d.]+)\.so\s+\(.*?::(?:BpHw)?(\w+?)::_hidl_(\w+)/
    );
    if (hidlSoMatch) {
      const pkg = hidlSoMatch[1];
      const iface = `I${hidlSoMatch[2]}`;
      const method = hidlSoMatch[3];
      // Find the Java caller
      const javaCaller = frames.find(
        (jf) => !jf.isNative && jf.className && !jf.className.startsWith('android.os.')
      );
      return {
        interfaceName: iface,
        packageName: pkg,
        method,
        callerClass: javaCaller?.className ?? '',
        callerMethod: javaCaller?.methodName ?? '',
      };
    }

    // Vendor HAL .so: /vendor/lib64/hw/android.hardware.xxx@1.0-impl.so
    const vendorHalMatch = f.raw.match(
      /\/vendor\/lib(?:64)?\/(?:hw\/)?([\w.-]+)\.so/
    );
    if (vendorHalMatch && !vendorHalMatch[1].includes('libbinder') && !vendorHalMatch[1].includes('libhidl')) {
      const javaCaller = frames.find(
        (jf) => !jf.isNative && jf.className && !jf.className.startsWith('android.os.')
      );
      if (javaCaller) {
        return {
          interfaceName: vendorHalMatch[1],
          packageName: 'vendor',
          method: '',
          callerClass: javaCaller.className,
          callerMethod: javaCaller.methodName,
        };
      }
    }
  }

  // Strategy 2: Java HIDL proxy
  for (const f of frames) {
    if (f.isNative) continue;
    const hidlMatch = f.raw.match(
      /at\s+([\w.]+\.V\d+_\d+)\.(I\w+)\.(getService|castFrom|\w+)/
    );
    if (hidlMatch) {
      const pkg = hidlMatch[1].replace(/\.V/, '@').replace(/_/, '.');
      const javaCaller = frames.find(
        (jf) =>
          !jf.isNative &&
          jf !== f &&
          jf.className &&
          !jf.className.startsWith('android.os.') &&
          !jf.className.startsWith('android.hidl.') &&
          jf.className !== `${hidlMatch[1]}.${hidlMatch[2]}`
      );
      return {
        interfaceName: hidlMatch[2],
        packageName: pkg,
        method: hidlMatch[3],
        callerClass: javaCaller?.className ?? '',
        callerMethod: javaCaller?.methodName ?? '',
      };
    }
  }

  // Strategy 3: Java caller with hal/gnss/vendor in class name
  for (const f of frames) {
    if (f.isNative) continue;
    if (
      f.className &&
      (f.className.includes('.hal.') || f.className.includes('.gnss.') || f.className.includes('vendor.'))
    ) {
      return {
        interfaceName: f.className.split('.').pop() ?? 'Unknown',
        packageName: f.className.replace(/\.\w+$/, ''),
        method: f.methodName,
        callerClass: f.className,
        callerMethod: f.methodName,
      };
    }
  }

  return null;
}

// ============================================================
// Pattern Matchers
// ============================================================

const IO_PATTERNS = [
  'SQLiteDatabase',
  'SQLiteSession',
  'SharedPreferencesImpl',
  'FileInputStream',
  'FileOutputStream',
  'FileReader',
  'FileWriter',
  'RandomAccessFile',
  'ContentResolver.query',
  'ContentResolver.insert',
  'ContentResolver.update',
  'ContentResolver.delete',
  'AssetManager.open',
  'ZipFile.',
  'android.database.sqlite',
];

const NETWORK_PATTERNS = [
  'HttpURLConnection',
  'OkHttp',
  'okhttp3.',
  'Socket.connect',
  'Socket.read',
  'SocketInputStream',
  'SocketOutputStream',
  'SSLSocket',
  'InetAddress',
  'NetworkDispatcher',
  'Volley',
  'retrofit2.',
  'java.net.URL.openConnection',
];

const BINDER_CALL_PATTERNS = [
  'BinderProxy.transact',
  'BinderProxy.transactNative',
  'android.os.BinderProxy.transact',
  'IPCThreadState::transact',
  'IPCThreadState::waitForResponse',
  'android::IPCThreadState',
];

const RENDERING_PATTERNS = [
  'android.view.View.draw',
  'android.view.View.measure',
  'android.view.View.layout',
  'android.view.ViewGroup.dispatchDraw',
  'LayoutInflater.inflate',
  'RecyclerView.onLayout',
  'RecyclerView.onMeasure',
  'ThreadedRenderer',
  'ViewRootImpl.performTraversals',
];

const BROADCAST_PATTERNS = [
  'BroadcastReceiver.onReceive',
  'LoadedApk$ReceiverDispatcher',
  'ActivityThread.handleReceiver',
];

const APP_STARTUP_PATTERNS = [
  'handleBindApplication',
  'Application.onCreate',
  'ContentProvider.onCreate',
  'ActivityThread.handleBindApplication',
];

const CONTENT_PROVIDER_PATTERNS = [
  'ContentProvider$Transport.query',
  'ContentProvider$Transport.insert',
  'ContentProvider$Transport.update',
  'ContentProvider$Transport.delete',
  'ContentProvider$Transport.call',
];

function matchesIOPatterns(stackText: string): boolean {
  return IO_PATTERNS.some((p) => stackText.includes(p));
}

function matchesNetworkPatterns(stackText: string): boolean {
  return NETWORK_PATTERNS.some((p) => stackText.includes(p));
}

function matchesBinderCallPatterns(stackText: string): boolean {
  return BINDER_CALL_PATTERNS.some((p) => stackText.includes(p));
}

function matchesRenderingPatterns(stackText: string): boolean {
  return RENDERING_PATTERNS.some((p) => stackText.includes(p));
}

function matchesBroadcastPatterns(stackText: string): boolean {
  return BROADCAST_PATTERNS.some((p) => stackText.includes(p));
}

function matchesAppStartupPatterns(stackText: string): boolean {
  return APP_STARTUP_PATTERNS.some((p) => stackText.includes(p));
}

function matchesContentProviderPatterns(stackText: string): boolean {
  return CONTENT_PROVIDER_PATTERNS.some((p) => stackText.includes(p));
}

/**
 * Check if stack frames contain app-level code (not just framework/system).
 */
function hasAppFrames(frames: StackFrame[]): boolean {
  return frames.some(
    (f) =>
      !f.isNative &&
      !f.className.startsWith('android.') &&
      !f.className.startsWith('com.android.') &&
      !f.className.startsWith('java.') &&
      !f.className.startsWith('javax.') &&
      !f.className.startsWith('dalvik.') &&
      !f.className.startsWith('libcore.') &&
      !f.className.startsWith('sun.')
  );
}

// ============================================================
// Blocking Chain
// ============================================================

/**
 * Build the chain of threads blocking the main thread.
 * main -> waits on thread A -> waits on thread B -> ...
 */
function buildBlockingChain(
  startThread: ThreadInfo,
  allThreads: ThreadInfo[]
): ThreadInfo[] {
  const chain: ThreadInfo[] = [];
  const visited = new Set<number>();
  let current: ThreadInfo | undefined = startThread;

  while (current) {
    if (visited.has(current.tid)) break; // cycle guard
    visited.add(current.tid);

    const heldByTid: number | undefined = current.waitingOnLock?.heldByTid;
    if (heldByTid == null) break;

    const holder: ThreadInfo | undefined = allThreads.find((t) => t.tid === heldByTid);
    if (!holder) break;

    chain.push(holder);
    current = holder;
  }

  return chain;
}

// ============================================================
// Confidence Estimation
// ============================================================

function estimateConfidence(
  reason: MainThreadBlockReason,
  mainThread: ThreadInfo
): 'high' | 'medium' | 'low' {
  switch (reason) {
    case 'deadlock':
    case 'lock_contention':
    case 'network_on_main_thread':
      return 'high';
    case 'io_on_main_thread':
    case 'slow_binder_call':
    case 'broadcast_blocking':
    case 'binder_pool_exhaustion':
    case 'content_provider_slow':
      return 'high';
    case 'heavy_computation':
    case 'expensive_rendering':
    case 'slow_app_startup':
      return mainThread.stackFrames.length > 3 ? 'high' : 'medium';
    case 'idle_main_thread':
    case 'system_overload_candidate':
      return 'low';
    case 'no_stack_frames':
    case 'unknown':
      return 'low';
    default:
      return 'medium';
  }
}
