import {
  AnalysisResult,
  BugreportMetadata,
  InsightCard,
  InsightCategory,
  Severity,
  TimelineEvent,
  SystemHealthScore,
  LogcatParseResult,
  LogcatAnomaly,
  KernelParseResult,
  KernelEvent,
  ANRTraceAnalysis,
} from './types.js';

// ============================================================
// Main Entry Point
// ============================================================

export interface BasicAnalyzerInput {
  metadata: BugreportMetadata;
  logcatResult: LogcatParseResult;
  kernelResult: KernelParseResult;
  anrAnalyses: ANRTraceAnalysis[];
}

/**
 * Aggregate results from all parsers into a unified analysis.
 * Pure rule-based — no LLM required.
 */
export function analyzeBasic(input: BasicAnalyzerInput): AnalysisResult {
  const { metadata, logcatResult, kernelResult, anrAnalyses } = input;

  const anrInsights = generateANRInsights(anrAnalyses);
  const logcatInsights = generateLogcatInsights(logcatResult);
  const kernelInsights = generateKernelInsights(kernelResult);

  // Deduplicate: remove logcat ANR insights when ANR trace insights exist
  const hasANRTraceInsights = anrInsights.length > 0;
  const filteredLogcat = hasANRTraceInsights
    ? logcatInsights.filter((i) => i.category !== 'anr')
    : logcatInsights;

  const merged = [
    ...filteredLogcat,
    ...anrInsights,
    ...mergeKernelInsights(kernelInsights),
  ];

  // Merge duplicate insights (same title pattern → single insight with count)
  const insights = mergeDuplicateInsights(merged);

  // Sort by severity: critical > warning > info
  insights.sort(compareBySeverity);

  // Assign stable IDs
  insights.forEach((card, i) => {
    card.id = `insight-${i + 1}`;
  });

  const timeline = buildTimeline(logcatResult, kernelResult, anrAnalyses);
  const healthScore = calculateHealthScore(logcatResult, kernelResult, anrAnalyses);

  return {
    metadata,
    insights,
    timeline,
    healthScore,
    anrAnalyses,
    logcatResult,
    kernelResult,
  };
}

// ============================================================
// Severity Helpers
// ============================================================

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function compareBySeverity(a: InsightCard, b: InsightCard): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}

// ============================================================
// Logcat → Insights
// ============================================================

const LOGCAT_ANOMALY_CATEGORY: Record<string, InsightCategory> = {
  anr: 'anr',
  fatal_exception: 'crash',
  native_crash: 'crash',
  system_server_crash: 'stability',
  oom: 'memory',
  watchdog: 'stability',
  binder_timeout: 'performance',
  slow_operation: 'performance',
  strict_mode: 'performance',
};

function generateLogcatInsights(result: LogcatParseResult): InsightCard[] {
  return result.anomalies.map((anomaly) => logcatAnomalyToInsight(anomaly));
}

function logcatAnomalyToInsight(anomaly: LogcatAnomaly): InsightCard {
  const category = LOGCAT_ANOMALY_CATEGORY[anomaly.type] ?? 'stability';
  const logSnippet = anomaly.entries
    .slice(0, 10)
    .map((e) => e.raw)
    .join('\n');

  return {
    id: '', // assigned later
    severity: anomaly.severity,
    category,
    title: anomaly.summary,
    description: describeLogcatAnomaly(anomaly),
    relatedLogSnippet: logSnippet,
    timestamp: anomaly.timestamp,
    source: 'logcat',
  };
}

function describeLogcatAnomaly(anomaly: LogcatAnomaly): string {
  const process = anomaly.processName ? ` in process ${anomaly.processName}` : '';
  const pid = anomaly.pid ? ` (PID ${anomaly.pid})` : '';

  switch (anomaly.type) {
    case 'anr':
      return `Application Not Responding detected${process}${pid}. The main thread was blocked for too long.`;
    case 'fatal_exception':
      return `A fatal exception occurred${process}${pid}, causing the application to crash.`;
    case 'native_crash':
      return `A native crash (signal) was detected${process}${pid}. This typically indicates a C/C++ level issue.`;
    case 'system_server_crash':
      return `The system_server process crashed, which affects overall system stability and may cause a soft reboot.`;
    case 'oom':
      return `Out of memory event detected${process}${pid}. The system killed a process to reclaim memory.`;
    case 'watchdog':
      return `System watchdog detected a blocked component${process}. This may cause a system restart.`;
    case 'binder_timeout':
      return `A Binder IPC transaction timed out${process}${pid}. Cross-process communication is taking too long.`;
    case 'slow_operation':
      return `A slow operation was detected on the main thread${process}${pid}.`;
    case 'strict_mode':
      return `StrictMode violation detected${process}${pid}. This indicates a policy violation (e.g., disk I/O on main thread).`;
    default:
      return `Anomaly detected${process}${pid}.`;
  }
}

// ============================================================
// ANR → Insights
// ============================================================

const BLOCK_REASON_LABELS: Record<string, string> = {
  lock_contention: 'Lock Contention',
  deadlock: 'Deadlock',
  io_on_main_thread: 'I/O on Main Thread',
  network_on_main_thread: 'Network on Main Thread',
  slow_binder_call: 'Slow Binder Call',
  heavy_computation: 'Heavy Computation on Main Thread',
  expensive_rendering: 'Expensive Rendering',
  broadcast_blocking: 'Broadcast Receiver Blocking',
  slow_app_startup: 'Slow App Startup',
  idle_main_thread: 'Idle Main Thread (Possible False ANR)',
  no_stack_frames: 'No Stack Frames Available',
  system_overload_candidate: 'System Overload (CPU Saturation)',
  binder_pool_exhaustion: 'Binder Thread Pool Exhaustion',
  content_provider_slow: 'Slow Content Provider',
  consecutive_binder_calls: 'Consecutive Binder Calls',
  go_async_not_finished: 'goAsync() Not Finished',
  oom_memory_pressure: 'OOM / Memory Pressure',
  gpu_hang: 'GPU Hang',
  unknown: 'Unknown Cause',
};

function generateANRInsights(analyses: ANRTraceAnalysis[]): InsightCard[] {
  const insights: InsightCard[] = [];

  for (const analysis of analyses) {
    // Determine which thread analysis to use as the primary one:
    // If Subject identifies a specific blocked thread, prefer that; otherwise use main thread.
    const primaryAnalysis = analysis.blockedThread ?? analysis.mainThread;
    if (!primaryAnalysis) continue;

    const { blockReason, confidence, blockingChain, thread: blockedThread, binderTarget: _bt, suspectedBinderTargets } = primaryAnalysis;
    const reasonLabel = BLOCK_REASON_LABELS[blockReason] ?? blockReason;
    const hasSuspectedTargets = suspectedBinderTargets && suspectedBinderTargets.length > 0;
    const severity = anrSeverity(blockReason, confidence, hasSuspectedTargets);

    const stackTrace = blockedThread.stackFrames
      .slice(0, 15)
      .map((f) => f.raw)
      .join('\n');

    // Thread context for title/description
    const threadContext = analysis.blockedThreadName && analysis.blockedThreadName !== 'main'
      ? ` on thread "${analysis.blockedThreadName}"`
      : '';

    // Build title with HAL target if available
    let title = `ANR: ${reasonLabel}${threadContext} in ${analysis.processName}`;
    if (_bt && _bt.interfaceName !== 'Unknown') {
      title = `ANR: ${reasonLabel} to ${_bt.interfaceName}${threadContext} in ${analysis.processName}`;
    } else if (suspectedBinderTargets && suspectedBinderTargets.length > 0) {
      const topTarget = suspectedBinderTargets[0];
      title = `ANR: ${reasonLabel} in ${analysis.processName} (suspected: ${topTarget.interfaceName} HAL)`;
    }

    const descParts: string[] = [];

    // Add Subject context if available
    if (analysis.subject) {
      descParts.push(`Subject: ${analysis.subject}`);
    }

    descParts.push(`ANR in ${analysis.processName}: ${reasonLabel} (confidence: ${confidence})`);

    // Add HAL/Binder target details
    if (_bt && _bt.interfaceName !== 'Unknown') {
      let halDesc = `Target HAL: ${_bt.interfaceName} (${_bt.packageName})`;
      if (_bt.method) {
        halDesc += ` → ${_bt.interfaceName}.${_bt.method}()`;
      }
      if (_bt.callerClass) {
        halDesc += ` called from ${_bt.callerClass}.${_bt.callerMethod}()`;
      }
      descParts.push(halDesc);
    }

    // Add suspected targets from other threads
    if (suspectedBinderTargets && suspectedBinderTargets.length > 0) {
      for (const t of suspectedBinderTargets) {
        descParts.push(`Suspected HAL: ${t.interfaceName}.${t.method}() on thread "${t.threadName}" (${t.packageName})`);
      }
    }

    if (blockingChain.length > 0) {
      const startName = analysis.blockedThreadName ?? 'main';
      const chainNames = blockingChain.map((t) => `"${t.name}"`).join(' → ');
      descParts.push(`Blocking chain: ${startName} → ${chainNames}`);
    }

    if (blockReason === 'deadlock') {
      descParts.push(`Deadlock detected involving ${analysis.deadlocks.cycles[0]?.threads.length ?? 0} threads`);
    }

    if (analysis.binderThreads.exhausted) {
      descParts.push(`Binder pool exhausted: all ${analysis.binderThreads.total} threads busy`);
    }

    const description = descParts.join('\n');

    insights.push({
      id: '',
      severity,
      category: 'anr',
      title,
      description,
      stackTrace: stackTrace || undefined,
      timestamp: analysis.timestamp,
      source: 'anr',
    });

    // Additional insight for deadlock details
    if (analysis.deadlocks.detected) {
      for (const cycle of analysis.deadlocks.cycles) {
        const threadNames = cycle.threads.map((t) => `"${t.name}" (tid=${t.tid})`).join(', ');
        insights.push({
          id: '',
          severity: 'critical',
          category: 'anr',
          title: `Deadlock: ${cycle.threads.length} threads in circular wait`,
          description: `Deadlock cycle involving: ${threadNames}. Each thread holds a lock needed by another thread in the cycle.`,
          source: 'anr',
          timestamp: analysis.timestamp,
        });
      }
    }

    // Binder exhaustion as separate insight if relevant
    if (analysis.binderThreads.exhausted && blockReason !== 'binder_pool_exhaustion') {
      insights.push({
        id: '',
        severity: 'warning',
        category: 'performance',
        title: `Binder Pool Exhausted in ${analysis.processName}`,
        description: `All ${analysis.binderThreads.total} binder threads are busy (0 idle). IPC calls may be queuing or timing out.`,
        source: 'anr',
        timestamp: analysis.timestamp,
      });
    }
  }

  return insights;
}

function anrSeverity(
  reason: string,
  confidence: 'high' | 'medium' | 'low',
  hasSuspectedTargets?: boolean
): Severity {
  if (reason === 'idle_main_thread') {
    // Upgrade to warning/critical if we found HAL calls stuck on other threads
    return hasSuspectedTargets ? 'warning' : 'info';
  }
  if (reason === 'no_stack_frames' || reason === 'unknown') return 'warning';
  if (confidence === 'low') return 'warning';
  return 'critical';
}

// ============================================================
// Kernel → Insights
// ============================================================

const KERNEL_EVENT_CATEGORY: Record<string, InsightCategory> = {
  kernel_panic: 'kernel',
  oom_kill: 'memory',
  lowmemory_killer: 'memory',
  kswapd_active: 'memory',
  driver_error: 'kernel',
  gpu_error: 'kernel',
  thermal_shutdown: 'kernel',
  watchdog_reset: 'stability',
  selinux_denial: 'kernel',
};

function generateKernelInsights(result: KernelParseResult): InsightCard[] {
  return result.events.map((event) => kernelEventToInsight(event));
}

function kernelEventToInsight(event: KernelEvent): InsightCard {
  const category = KERNEL_EVENT_CATEGORY[event.type] ?? 'kernel';

  return {
    id: '',
    severity: event.severity,
    category,
    title: event.summary,
    description: describeKernelEvent(event),
    relatedLogSnippet: event.entries.map((e) => e.raw).join('\n'),
    timestamp: `boot+${event.timestamp.toFixed(3)}s`,
    source: 'kernel',
  };
}

function describeKernelEvent(event: KernelEvent): string {
  switch (event.type) {
    case 'kernel_panic':
      return 'A kernel panic occurred, causing the system to halt. This is the most severe kernel-level error.';
    case 'oom_kill': {
      const name = event.details.processName ?? 'unknown';
      const pid = event.details.pid ?? 0;
      return `The kernel OOM killer terminated process "${name}" (PID ${pid}) due to extreme memory pressure.`;
    }
    case 'lowmemory_killer':
      return 'The low memory killer daemon reclaimed memory by killing a background process. Frequent occurrences indicate memory pressure.';
    case 'kswapd_active':
      return 'The kernel swap daemon (kswapd) is actively reclaiming memory pages, indicating significant memory pressure.';
    case 'driver_error':
      return `A hardware driver error was detected: ${event.entries[0]?.message.slice(0, 200) ?? ''}.`;
    case 'gpu_error':
      return `A GPU fault or error was detected. This may cause rendering issues or application crashes.`;
    case 'thermal_shutdown': {
      const temp = event.details.temperature;
      const tempStr = temp ? ` Temperature: ${temp}°C.` : '';
      return `A thermal emergency triggered a system shutdown.${tempStr} The device may be overheating.`;
    }
    case 'watchdog_reset':
      return 'The hardware watchdog timer expired and triggered a system reset. A critical system component may have become unresponsive.';
    case 'selinux_denial': {
      const src = event.details.scontext ?? 'unknown';
      const tgt = event.details.tcontext ?? 'unknown';
      return `SELinux denied an access request from ${src} to ${tgt}. This may indicate a missing policy rule or a security violation.`;
    }
    default:
      return `Kernel event detected: ${event.summary}`;
  }
}

// ============================================================
// Timeline Builder
// ============================================================

export function buildTimeline(
  logcatResult: LogcatParseResult,
  kernelResult: KernelParseResult,
  anrAnalyses: ANRTraceAnalysis[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Logcat anomalies
  for (const anomaly of logcatResult.anomalies) {
    events.push({
      timestamp: anomaly.timestamp,
      source: 'logcat',
      severity: anomaly.severity,
      label: anomaly.summary,
      details: anomaly.processName ?? undefined,
    });
  }

  // Kernel events
  for (const event of kernelResult.events) {
    events.push({
      timestamp: `boot+${event.timestamp.toFixed(3)}s`,
      source: 'kernel',
      severity: event.severity,
      label: event.summary,
    });
  }

  // ANR analyses
  for (const analysis of anrAnalyses) {
    if (!analysis.mainThread) continue;
    const reasonLabel = BLOCK_REASON_LABELS[analysis.mainThread.blockReason] ?? 'ANR';
    events.push({
      timestamp: analysis.timestamp ?? 'unknown',
      source: 'anr',
      severity: analysis.mainThread.blockReason === 'idle_main_thread' ? 'info' : 'critical',
      label: `ANR: ${reasonLabel} in ${analysis.processName}`,
      details: `Confidence: ${analysis.mainThread.confidence}`,
    });
  }

  // Sort: logcat timestamps (MM-DD HH:mm:ss) first, then kernel (boot+), then unknown
  events.sort((a, b) => {
    const ta = normalizeTimestamp(a.timestamp);
    const tb = normalizeTimestamp(b.timestamp);
    return ta.localeCompare(tb);
  });

  return events;
}

function normalizeTimestamp(ts: string): string {
  // Keep logcat timestamps as-is (they sort lexicographically)
  // Prefix kernel boot timestamps with 'boot+' for grouping
  if (ts.startsWith('boot+')) return `Z_${ts}`;
  if (ts === 'unknown') return 'ZZ_unknown';
  return ts;
}

// ============================================================
// Health Score Calculator
// ============================================================

export function calculateHealthScore(
  logcatResult: LogcatParseResult,
  kernelResult: KernelParseResult,
  anrAnalyses: ANRTraceAnalysis[]
): SystemHealthScore {
  const stability = calcStabilityScore(logcatResult, kernelResult);
  const memory = calcMemoryScore(logcatResult, kernelResult);
  const responsiveness = calcResponsivenessScore(logcatResult, anrAnalyses);
  const kernel = calcKernelScore(kernelResult);

  // Weighted average
  const overall = Math.round(
    stability * 0.30 +
    memory * 0.25 +
    responsiveness * 0.25 +
    kernel * 0.20
  );

  return {
    overall,
    breakdown: { stability, memory, responsiveness, kernel },
  };
}

function calcStabilityScore(logcat: LogcatParseResult, kernel: KernelParseResult): number {
  let score = 100;

  for (const a of logcat.anomalies) {
    switch (a.type) {
      case 'system_server_crash': score -= 30; break;
      case 'fatal_exception': score -= 10; break;
      case 'native_crash': score -= 15; break;
      case 'watchdog': score -= 25; break;
    }
  }

  for (const e of kernel.events) {
    if (e.type === 'kernel_panic') score -= 40;
    if (e.type === 'watchdog_reset') score -= 30;
  }

  return clamp(score, 0, 100);
}

function calcMemoryScore(logcat: LogcatParseResult, kernel: KernelParseResult): number {
  let score = 100;

  for (const a of logcat.anomalies) {
    if (a.type === 'oom') score -= 20;
  }

  for (const e of kernel.events) {
    switch (e.type) {
      case 'oom_kill': score -= 25; break;
      case 'lowmemory_killer': score -= 10; break;
      case 'kswapd_active': score -= 5; break;
    }
  }

  return clamp(score, 0, 100);
}

function calcResponsivenessScore(logcat: LogcatParseResult, anrAnalyses: ANRTraceAnalysis[]): number {
  let score = 100;

  for (const a of logcat.anomalies) {
    switch (a.type) {
      case 'anr': score -= 20; break;
      case 'binder_timeout': score -= 10; break;
      case 'slow_operation': score -= 5; break;
    }
  }

  for (const analysis of anrAnalyses) {
    if (!analysis.mainThread) continue;
    const reason = analysis.mainThread.blockReason;
    if (reason === 'idle_main_thread') {
      // Likely false ANR, minimal penalty
      score -= 2;
    } else if (reason === 'deadlock') {
      score -= 25;
    } else {
      score -= 15;
    }
  }

  return clamp(score, 0, 100);
}

function calcKernelScore(kernel: KernelParseResult): number {
  let score = 100;

  for (const e of kernel.events) {
    switch (e.type) {
      case 'kernel_panic': score -= 40; break;
      case 'thermal_shutdown': score -= 30; break;
      case 'watchdog_reset': score -= 30; break;
      case 'gpu_error': score -= 15; break;
      case 'driver_error': score -= 10; break;
      case 'selinux_denial': score -= 2; break;
    }
  }

  return clamp(score, 0, 100);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ============================================================
// Insight Deduplication & Merging
// ============================================================

/**
 * Merge kernel insights: group SELinux denials by context pair,
 * keeping only unique denial types.
 */
function mergeKernelInsights(insights: InsightCard[]): InsightCard[] {
  const selinux: InsightCard[] = [];
  const others: InsightCard[] = [];

  for (const i of insights) {
    if (i.title.startsWith('SELinux denial:')) {
      selinux.push(i);
    } else {
      others.push(i);
    }
  }

  if (selinux.length === 0) return insights;

  // Group by title (same source→target context)
  const groups = new Map<string, InsightCard[]>();
  for (const i of selinux) {
    const existing = groups.get(i.title);
    if (existing) {
      existing.push(i);
    } else {
      groups.set(i.title, [i]);
    }
  }

  const merged: InsightCard[] = [];
  for (const [title, group] of groups) {
    const first = group[0];
    if (group.length > 1) {
      merged.push({
        ...first,
        title: `${title} (×${group.length})`,
        description: `${first.description}\nOccurred ${group.length} times.`,
      });
    } else {
      merged.push(first);
    }
  }

  return [...others, ...merged];
}

/**
 * Merge duplicate insights with the same title into a single entry with count.
 * Applies to logcat anomalies like "Slow operation: delivery" that repeat.
 */
function mergeDuplicateInsights(insights: InsightCard[]): InsightCard[] {
  const groups = new Map<string, InsightCard[]>();

  for (const i of insights) {
    const key = `${i.severity}:${i.category}:${i.source}:${i.title}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(i);
    } else {
      groups.set(key, [i]);
    }
  }

  const result: InsightCard[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    if (group.length > 1) {
      result.push({
        ...first,
        title: `${first.title} (×${group.length})`,
        description: `${first.description}\nOccurred ${group.length} times.`,
      });
    } else {
      result.push(first);
    }
  }

  return result;
}
