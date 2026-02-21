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
  LogcatAnomalyType,
  KernelParseResult,
  KernelEvent,
  KernelEventType,
  ANRTraceAnalysis,
  MemInfoSummary,
  CpuInfoSummary,
  BootStatusSummary,
  HALStatusSummary,
  TagStat,
  TombstoneAnalysis,
} from './types.js';
import { generateSELinuxAllowRule } from './kernel-parser.js';

// ============================================================
// Main Entry Point
// ============================================================

export interface BasicAnalyzerInput {
  metadata: BugreportMetadata;
  logcatResult: LogcatParseResult;
  kernelResult: KernelParseResult;
  anrAnalyses: ANRTraceAnalysis[];
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  halStatus?: HALStatusSummary;
  tombstoneAnalyses?: TombstoneAnalysis[];
  systemProperties?: string;
}

/**
 * Aggregate results from all parsers into a unified analysis.
 * Pure rule-based — no LLM required.
 */
export function analyzeBasic(input: BasicAnalyzerInput): AnalysisResult {
  const { metadata, logcatResult, kernelResult, anrAnalyses, memInfo, cpuInfo, halStatus, tombstoneAnalyses, systemProperties } = input;

  const bootStatus = analyzeBootStatus(logcatResult, kernelResult, systemProperties);
  const anrInsights = generateANRInsights(anrAnalyses);
  const logcatInsights = generateLogcatInsights(logcatResult);
  const kernelInsights = generateKernelInsights(kernelResult);
  const resourceInsights = generateResourceInsights(memInfo, cpuInfo);
  const bootInsights = generateBootInsights(bootStatus);
  const halInsights = generateHALInsights(halStatus);
  const tombstoneInsights = generateTombstoneInsights(tombstoneAnalyses);

  const tagInsights = generateTagInsights(logcatResult.tagStats);

  // Deduplicate: remove logcat ANR insights when ANR trace insights exist
  const hasANRTraceInsights = anrInsights.length > 0;
  const filteredLogcat = hasANRTraceInsights
    ? logcatInsights.filter((i) => i.category !== 'anr')
    : logcatInsights;

  const merged = [
    ...filteredLogcat,
    ...anrInsights,
    ...mergeKernelInsights(kernelInsights),
    ...resourceInsights,
    ...bootInsights,
    ...halInsights,
    ...tombstoneInsights,
    ...tagInsights,
  ];

  // Merge duplicate insights (same title pattern → single insight with count)
  const insights = mergeDuplicateInsights(merged);

  // Sort by severity: critical > warning > info
  insights.sort(compareBySeverity);

  // Assign stable IDs
  insights.forEach((card, i) => {
    card.id = `insight-${i + 1}`;
  });

  const timeline = buildTimeline(logcatResult, kernelResult, anrAnalyses, tombstoneAnalyses);
  const healthScore = calculateHealthScore(logcatResult, kernelResult, anrAnalyses, memInfo, cpuInfo, tombstoneAnalyses);

  return {
    metadata,
    insights,
    timeline,
    healthScore,
    anrAnalyses,
    logcatResult,
    kernelResult,
    ...(memInfo ? { memInfo } : {}),
    ...(cpuInfo ? { cpuInfo } : {}),
    bootStatus,
    ...(halStatus ? { halStatus } : {}),
    ...(tombstoneAnalyses && tombstoneAnalyses.length > 0 ? { tombstoneAnalyses } : {}),
    ...(logcatResult.tagStats && logcatResult.tagStats.length > 0 ? { logTagStats: logcatResult.tagStats } : {}),
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
// Debug Commands Mapping
// ============================================================

const LOGCAT_DEBUG_COMMANDS: Partial<Record<LogcatAnomalyType, string[]>> = {
  anr: [
    'adb shell dumpsys activity processes',
    'adb shell dumpsys activity top',
    'adb bugreport',
  ],
  fatal_exception: [
    'adb logcat -b crash -d',
    'adb shell dumpsys meminfo <pid>',
  ],
  native_crash: [
    'adb logcat -b crash -d',
    'adb shell dumpsys meminfo <pid>',
  ],
  oom: [
    'adb shell dumpsys meminfo',
    'adb shell cat /proc/meminfo',
    'adb shell dumpsys activity oom',
  ],
  watchdog: [
    'adb shell dumpsys activity services',
    'adb shell top -n 1 -s cpu',
  ],
  binder_timeout: [
    'adb shell dumpsys binder_state',
    'adb shell service list',
  ],
  hal_service_death: [
    'adb shell lshal --all',
    'adb shell dumpsys hwservicemanager',
  ],
  input_dispatching_timeout: [
    'adb shell dumpsys activity processes',
    'adb shell dumpsys input',
  ],
  system_server_crash: [
    'adb logcat -b crash -d',
    'adb shell dumpsys activity services',
  ],
};

const KERNEL_DEBUG_COMMANDS: Partial<Record<KernelEventType, string[]>> = {
  kernel_panic: [
    'adb shell dmesg',
    'adb shell cat /proc/last_kmsg',
  ],
  watchdog_reset: [
    'adb shell dmesg',
    'adb shell cat /proc/last_kmsg',
  ],
  oom_kill: [
    'adb shell dumpsys meminfo',
    'adb shell cat /proc/meminfo',
  ],
  lowmemory_killer: [
    'adb shell dumpsys meminfo',
    'adb shell cat /proc/meminfo',
  ],
  kswapd_active: [
    'adb shell dumpsys meminfo',
    'adb shell procrank',
  ],
  thermal_shutdown: [
    'adb shell dumpsys thermalservice',
    'adb shell cat /sys/class/thermal/thermal_zone*/temp',
  ],
  thermal_throttling: [
    'adb shell dumpsys thermalservice',
    'adb shell cat /sys/class/thermal/thermal_zone*/temp',
  ],
  selinux_denial: [
    'adb shell getenforce',
    'adb shell dmesg | grep avc',
  ],
  storage_io_error: [
    'adb shell df -h',
    'adb shell dumpsys diskstats',
  ],
  driver_error: [
    'adb shell dmesg',
    'adb shell lshal --all',
  ],
  gpu_error: [
    'adb shell dmesg',
    'adb shell dumpsys SurfaceFlinger',
  ],
  suspend_resume_error: [
    'adb shell dmesg',
    'adb shell dumpsys power',
  ],
};

const BOOT_DEBUG_COMMANDS = [
  'adb shell getprop sys.boot_completed',
  'adb shell getprop sys.boot.reason',
];

const RESOURCE_MEMORY_DEBUG_COMMANDS = [
  'adb shell dumpsys meminfo',
  'adb shell procrank',
];

const RESOURCE_CPU_DEBUG_COMMANDS = [
  'adb shell top -n 1 -s cpu',
  'adb shell dumpsys cpuinfo',
];

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
  input_dispatching_timeout: 'anr',
  hal_service_death: 'stability',
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
    debugCommands: LOGCAT_DEBUG_COMMANDS[anomaly.type],
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
    case 'input_dispatching_timeout':
      return `Input dispatching timed out${process}${pid}. The window is not responding to input events within the expected time.`;
    case 'hal_service_death':
      return `A HAL service died or restarted${process}${pid}. This may cause hardware-related functionality to fail temporarily.`;
    default:
      return `Anomaly detected${process}${pid}.`;
  }
}

// ============================================================
// Tag Stats → Insights
// ============================================================

function generateTagInsights(tagStats?: TagStat[]): InsightCard[] {
  if (!tagStats || tagStats.length === 0) return [];

  const vendorTags = tagStats.filter((t) => t.classification === 'vendor');
  const frameworkTags = tagStats.filter((t) => t.classification === 'framework');
  const appTags = tagStats.filter((t) => t.classification === 'app');

  const vendorCount = vendorTags.reduce((s, t) => s + t.count, 0);
  const frameworkCount = frameworkTags.reduce((s, t) => s + t.count, 0);
  const appCount = appTags.reduce((s, t) => s + t.count, 0);

  const lines: string[] = [];
  lines.push(`Error/Fatal log distribution: vendor=${vendorCount}, framework=${frameworkCount}, app=${appCount}`);
  lines.push('');

  for (const stat of tagStats.slice(0, 15)) {
    lines.push(`  [${stat.classification}] ${stat.tag}: ${stat.count} errors`);
  }

  return [{
    id: '',
    severity: 'info',
    category: 'stability',
    title: 'Top Error Tags (E/F level)',
    description: lines.join('\n'),
    source: 'logcat',
  }];
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
  thermal_throttling: 'performance',
  watchdog_reset: 'stability',
  selinux_denial: 'kernel',
  storage_io_error: 'stability',
  suspend_resume_error: 'kernel',
};

function generateKernelInsights(result: KernelParseResult): InsightCard[] {
  return result.events.map((event) => kernelEventToInsight(event));
}

function kernelEventToInsight(event: KernelEvent): InsightCard {
  const category = KERNEL_EVENT_CATEGORY[event.type] ?? 'kernel';

  const card: InsightCard = {
    id: '',
    severity: event.severity,
    category,
    title: event.summary,
    description: describeKernelEvent(event),
    relatedLogSnippet: event.entries.map((e) => e.raw).join('\n'),
    timestamp: `boot+${event.timestamp.toFixed(3)}s`,
    source: 'kernel',
  };

  // Attach SELinux allow rule if applicable
  if (event.type === 'selinux_denial') {
    const allowRule = generateSELinuxAllowRule(event.details);
    if (allowRule) {
      card.suggestedAllowRule = allowRule;
      card.description += `\nSuggested allow rule: ${allowRule}`;
    }
  }

  // Attach debug commands
  const kernelCmds = KERNEL_DEBUG_COMMANDS[event.type];
  if (kernelCmds) {
    card.debugCommands = kernelCmds;
  }

  return card;
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
    case 'thermal_throttling': {
      const temp = event.details.temperature;
      const tempStr = temp ? ` Temperature: ${temp}°C.` : '';
      return `Thermal throttling is active, reducing CPU/GPU performance to prevent overheating.${tempStr}`;
    }
    case 'storage_io_error':
      return `A storage I/O error was detected. This may indicate a failing storage device, filesystem corruption, or eMMC/UFS issues.`;
    case 'suspend_resume_error':
      return `A suspend/resume cycle failed. This can cause excessive battery drain or wake-lock issues.`;
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
// Boot Status Analysis
// ============================================================

export function analyzeBootStatus(
  logcatResult: LogcatParseResult,
  kernelResult: KernelParseResult,
  systemProperties?: string,
): BootStatusSummary {
  let bootCompleted = false;
  let bootReason: string | undefined;
  let systemServerRestarts = 0;

  // 1. Check system properties (most reliable source)
  //    Format: "[sys.boot_completed]: [1]"
  if (systemProperties) {
    if (/\[sys\.boot_completed\]:\s*\[1\]/.test(systemProperties)) {
      bootCompleted = true;
    }
    // Boot reason from properties: "[sys.boot.reason]: [reboot]" or "[ro.boot.bootreason]: [watchdog]"
    const propReason = systemProperties.match(
      /\[(?:sys\.boot\.reason\.last|sys\.boot\.reason|ro\.boot\.bootreason)\]:\s*\[([^\]]+)\]/
    );
    if (propReason) {
      bootReason = propReason[1];
    }
  }

  // 2. Scan logcat for boot_completed and system_server restarts
  for (const entry of logcatResult.entries) {
    if (!bootCompleted && (
        entry.message.includes('sys.boot_completed=1') ||
        (entry.tag === 'BootReceiver' && /boot.*completed/i.test(entry.message)) ||
        (entry.tag === 'ActivityManager' && entry.message.includes('Boot completed')))) {
      bootCompleted = true;
    }

    // Count system_server restarts (Zygote forking system_server)
    if (entry.tag === 'Zygote' && entry.message.includes('System server process')) {
      systemServerRestarts++;
    }
  }

  // 3. Check kernel log for boot_completed property set and boot reason
  for (const entry of kernelResult.entries) {
    if (!bootCompleted && /sys\.boot_completed=1/.test(entry.message)) {
      bootCompleted = true;
    }
    if (!bootReason) {
      const reasonMatch = entry.message.match(/(?:Boot reason|androidboot\.bootreason)[=:\s]+(\S+)/i);
      if (reasonMatch) {
        bootReason = reasonMatch[1];
      }
    }
  }

  // Estimate uptime from last kernel timestamp
  let uptimeSeconds: number | undefined;
  if (kernelResult.entries.length > 0) {
    uptimeSeconds = kernelResult.entries[kernelResult.entries.length - 1].timestamp;
  }

  // First boot counts as 1, so restarts = count - 1 (if > 0)
  const restartCount = systemServerRestarts > 1 ? systemServerRestarts - 1 : 0;

  return {
    bootCompleted,
    bootReason,
    systemServerRestarts: restartCount,
    uptimeSeconds,
  };
}

function generateBootInsights(bootStatus: BootStatusSummary): InsightCard[] {
  const insights: InsightCard[] = [];

  if (!bootStatus.bootCompleted && bootStatus.uptimeSeconds != null) {
    insights.push({
      id: '',
      severity: 'warning',
      category: 'stability',
      title: 'Boot not completed',
      description: 'sys.boot_completed was not set. The device may not have finished booting successfully.',
      source: 'cross',
      debugCommands: BOOT_DEBUG_COMMANDS,
    });
  }

  if (bootStatus.systemServerRestarts > 0) {
    const severity: Severity = bootStatus.systemServerRestarts >= 3 ? 'critical' : 'warning';
    insights.push({
      id: '',
      severity,
      category: 'stability',
      title: `System server restarted ${bootStatus.systemServerRestarts} time(s)`,
      description: `system_server was restarted ${bootStatus.systemServerRestarts} time(s) since boot. Frequent restarts indicate serious system instability.`,
      source: 'cross',
      debugCommands: ['adb logcat -b crash -d', 'adb shell dumpsys activity services'],
    });
  }

  if (bootStatus.bootReason && !/reboot|normal/i.test(bootStatus.bootReason)) {
    insights.push({
      id: '',
      severity: 'warning',
      category: 'stability',
      title: `Abnormal boot reason: ${bootStatus.bootReason}`,
      description: `The device booted with reason "${bootStatus.bootReason}", which may indicate a crash, watchdog reset, or power issue.`,
      source: 'cross',
      debugCommands: BOOT_DEBUG_COMMANDS,
    });
  }

  return insights;
}

// ============================================================
// Resource (meminfo / cpuinfo) → Insights
// ============================================================

function generateResourceInsights(
  memInfo?: MemInfoSummary,
  cpuInfo?: CpuInfoSummary,
): InsightCard[] {
  const insights: InsightCard[] = [];

  if (memInfo && memInfo.totalRamKb > 0) {
    const freeRatio = memInfo.freeRamKb / memInfo.totalRamKb;
    if (freeRatio < 0.1) {
      const usedGb = (memInfo.usedRamKb / 1048576).toFixed(1);
      const totalGb = (memInfo.totalRamKb / 1048576).toFixed(1);
      const topProcs = memInfo.topProcesses
        .slice(0, 3)
        .map((p) => `${p.processName} (${(p.totalPssKb / 1024).toFixed(0)} MB)`)
        .join(', ');
      insights.push({
        id: '',
        severity: 'warning',
        category: 'memory',
        title: 'Low available memory',
        description: `Only ${(freeRatio * 100).toFixed(1)}% of RAM is free (${usedGb} GB used / ${totalGb} GB total). Top consumers: ${topProcs || 'N/A'}.`,
        source: 'cross',
        debugCommands: RESOURCE_MEMORY_DEBUG_COMMANDS,
      });
    }
  }

  if (cpuInfo) {
    if (cpuInfo.totalCpuPercent > 80) {
      const topProcs = cpuInfo.topProcesses
        .slice(0, 3)
        .map((p) => `${p.processName} (${p.cpuPercent}%)`)
        .join(', ');
      insights.push({
        id: '',
        severity: 'warning',
        category: 'performance',
        title: 'High CPU usage',
        description: `Total CPU usage is ${cpuInfo.totalCpuPercent}% (${cpuInfo.userPercent}% user + ${cpuInfo.kernelPercent}% kernel). Top consumers: ${topProcs || 'N/A'}.`,
        source: 'cross',
        debugCommands: RESOURCE_CPU_DEBUG_COMMANDS,
      });
    }

    if (cpuInfo.ioWaitPercent > 20) {
      insights.push({
        id: '',
        severity: 'warning',
        category: 'performance',
        title: 'High I/O wait',
        description: `I/O wait is ${cpuInfo.ioWaitPercent}%, indicating the CPU is frequently waiting for disk or storage operations.`,
        source: 'cross',
        debugCommands: ['adb shell df -h', 'adb shell dumpsys diskstats'],
      });
    }
  }

  return insights;
}

// ============================================================
// HAL Status → Insights
// ============================================================

function generateHALInsights(halStatus?: HALStatusSummary): InsightCard[] {
  if (!halStatus || halStatus.totalServices === 0) return [];

  const insights: InsightCard[] = [];

  // Warn if lshal output was truncated
  if (halStatus.truncated) {
    insights.push({
      id: '',
      severity: 'info',
      category: 'stability',
      title: 'HAL status incomplete — lshal was killed by system',
      description: 'The lshal command was killed before completing (exit code 136 or timeout). Services not yet pinged when lshal was terminated will appear as non-responsive or declared. BSP vendor HAL status is unreliable — only OEM HAL status should be trusted.',
      source: 'cross',
    });
  }

  // Use family-level analysis: only flag vendor families whose HIGHEST version is problematic
  const vendorFamilies = halStatus.families.filter((f) => f.isVendor);

  // Split into OEM and BSP groups
  const oemFamilies = vendorFamilies.filter((f) => f.isOem);
  const bspFamilies = vendorFamilies.filter((f) => !f.isOem);

  // OEM HAL issues → warning severity (more likely to be the root cause)
  const oemNR = oemFamilies.filter((f) => f.highestStatus === 'non-responsive');
  if (oemNR.length > 0) {
    const names = oemNR.map((f) => `${f.shortName}@${f.highestVersion}`).join(', ');
    insights.push({
      id: '',
      severity: 'warning',
      category: 'stability',
      title: `[OEM] ${oemNR.length} vendor HAL family(s) non-responsive`,
      description: `The following OEM vendor HAL families have their highest version non-responsive: ${names}. These may cause hardware-related functionality to fail.`,
      source: 'cross',
    });
  }

  const oemDeclared = oemFamilies.filter((f) => f.highestStatus === 'declared');
  if (oemDeclared.length > 0) {
    const names = oemDeclared.map((f) => `${f.shortName}@${f.highestVersion}`).join(', ');
    insights.push({
      id: '',
      severity: 'warning',
      category: 'stability',
      title: `[OEM] ${oemDeclared.length} vendor HAL family(s) declared but not running`,
      description: `The following OEM vendor HAL families are declared in the VINTF manifest but not registered: ${names}. The corresponding hardware features may be unavailable.`,
      source: 'cross',
    });
  }

  // BSP HAL issues → info severity (less actionable, usually chipset-level)
  // When lshal is truncated, BSP NR/declared are almost certainly artifacts — skip them
  if (!halStatus.truncated) {
    const bspNR = bspFamilies.filter((f) => f.highestStatus === 'non-responsive');
    if (bspNR.length > 0) {
      const names = bspNR.map((f) => `${f.shortName}@${f.highestVersion}`).join(', ');
      insights.push({
        id: '',
        severity: 'info',
        category: 'stability',
        title: `[BSP] ${bspNR.length} vendor HAL family(s) non-responsive`,
        description: `The following BSP vendor HAL families have their highest version non-responsive: ${names}. These are typically chipset-bundled HALs.`,
        source: 'cross',
      });
    }

    const bspDeclared = bspFamilies.filter((f) => f.highestStatus === 'declared');
    if (bspDeclared.length > 0) {
      const names = bspDeclared.map((f) => `${f.shortName}@${f.highestVersion}`).join(', ');
      insights.push({
        id: '',
        severity: 'info',
        category: 'stability',
        title: `[BSP] ${bspDeclared.length} vendor HAL family(s) declared but not running`,
        description: `The following BSP vendor HAL families are declared in the VINTF manifest but not registered: ${names}. These are typically chipset-bundled HALs.`,
        source: 'cross',
      });
    }
  }

  return insights;
}

// ============================================================
// Tombstone → Insights
// ============================================================

const TOMBSTONE_DEBUG_COMMANDS = [
  'adb shell ls -la /data/tombstones/',
  'adb logcat -b crash -d',
  'adb shell debuggerd <pid>',
];

function generateTombstoneInsights(analyses?: TombstoneAnalysis[]): InsightCard[] {
  if (!analyses || analyses.length === 0) return [];

  return analyses.map((analysis) => {
    const vendorTag = analysis.isVendorCrash ? ' [Vendor]' : '';
    const title = `Native Crash: ${analysis.signalName}${vendorTag} in ${analysis.processName}`;

    const descParts: string[] = [];
    descParts.push(analysis.summary);

    if (analysis.crashedInBinary) {
      descParts.push(`Crashed in: ${analysis.crashedInBinary}`);
    }
    if (analysis.faultAddr) {
      descParts.push(`Fault address: ${analysis.faultAddr}`);
    }
    if (analysis.abi) {
      descParts.push(`ABI: ${analysis.abi}`);
    }
    if (analysis.abortMessage) {
      descParts.push(`Abort message: ${analysis.abortMessage}`);
    }

    const stackTrace = analysis.backtrace.length > 0
      ? analysis.backtrace.slice(0, 20).map((f) => f.raw).join('\n')
      : undefined;

    return {
      id: '',
      severity: 'critical' as Severity,
      category: 'crash' as InsightCategory,
      title,
      description: descParts.join('\n'),
      stackTrace,
      timestamp: analysis.timestamp,
      source: 'tombstone' as const,
      debugCommands: TOMBSTONE_DEBUG_COMMANDS,
    };
  });
}

// ============================================================
// Timeline Builder
// ============================================================

export function buildTimeline(
  logcatResult: LogcatParseResult,
  kernelResult: KernelParseResult,
  anrAnalyses: ANRTraceAnalysis[],
  tombstoneAnalyses?: TombstoneAnalysis[],
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

  // Tombstone native crashes
  if (tombstoneAnalyses) {
    for (const analysis of tombstoneAnalyses) {
      events.push({
        timestamp: analysis.timestamp ?? 'unknown',
        source: 'tombstone',
        severity: 'critical',
        label: analysis.summary,
        details: analysis.crashedInBinary ?? undefined,
      });
    }
  }

  // Sort: logcat timestamps (MM-DD HH:mm:ss) first, then kernel (boot+), then unknown
  events.sort((a, b) => {
    const ta = normalizeTimestamp(a.timestamp);
    const tb = normalizeTimestamp(b.timestamp);
    return ta.localeCompare(tb);
  });

  return aggregateTimelineEvents(events);
}

/**
 * Aggregate adjacent timeline events with same label + source + severity.
 * Adjacent duplicates (e.g. repeated SELinux denials) get merged into one
 * event with a count and time range.
 */
export function aggregateTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  if (events.length === 0) return [];

  const result: TimelineEvent[] = [];
  let current = { ...events[0] };
  let count = 1;
  let firstTimestamp = current.timestamp;

  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    if (e.label === current.label && e.source === current.source && e.severity === current.severity) {
      count++;
      // Update last timestamp for range
      if (count === 2) {
        // Start tracking range
        current.timeRange = `${firstTimestamp} ~ ${e.timestamp}`;
      } else {
        // Extend range end
        current.timeRange = `${firstTimestamp} ~ ${e.timestamp}`;
      }
      current.count = count;
    } else {
      result.push(current);
      current = { ...e };
      count = 1;
      firstTimestamp = e.timestamp;
    }
  }
  result.push(current);

  return result;
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

/**
 * Apply frequency-based damping to repeated events of the same type.
 * 1st occurrence: full penalty
 * 2nd occurrence: 50% penalty
 * 3rd occurrence: 25% penalty
 * 4th+ occurrences: 10% penalty each (capped at maxTotal per type)
 *
 * This prevents 270 SELinux denials from scoring -540 (→0).
 * Instead: -2 + -1 + -0.5 + 267×-0.2 = ~-57 (→43), much more reasonable.
 */
function dampedDeduction(
  counts: Map<string, number>,
  type: string,
  basePenalty: number,
  maxTotalPerType: number = basePenalty * 5,
): number {
  const n = (counts.get(type) ?? 0) + 1;
  counts.set(type, n);

  let factor: number;
  if (n === 1) factor = 1.0;
  else if (n === 2) factor = 0.5;
  else if (n === 3) factor = 0.25;
  else factor = 0.1;

  const penalty = basePenalty * factor;

  // Check if we've already reached the max total deduction for this type
  // Approximate: sum of previous penalties
  const prevTotal = sumDampedPenalties(n - 1, basePenalty);
  if (prevTotal >= maxTotalPerType) return 0;
  return Math.min(penalty, maxTotalPerType - prevTotal);
}

/** Sum of damped penalties for the first n occurrences */
function sumDampedPenalties(n: number, basePenalty: number): number {
  if (n <= 0) return 0;
  let sum = basePenalty; // 1st: 100%
  if (n >= 2) sum += basePenalty * 0.5; // 2nd: 50%
  if (n >= 3) sum += basePenalty * 0.25; // 3rd: 25%
  if (n >= 4) sum += (n - 3) * basePenalty * 0.1; // 4th+: 10% each
  return sum;
}

export function calculateHealthScore(
  logcatResult: LogcatParseResult,
  kernelResult: KernelParseResult,
  anrAnalyses: ANRTraceAnalysis[],
  memInfo?: MemInfoSummary,
  cpuInfo?: CpuInfoSummary,
  tombstoneAnalyses?: TombstoneAnalysis[],
): SystemHealthScore {
  let stability = calcStabilityScore(logcatResult, kernelResult, tombstoneAnalyses);
  let memory = calcMemoryScore(logcatResult, kernelResult);
  let responsiveness = calcResponsivenessScore(logcatResult, anrAnalyses);
  let kernel = calcKernelScore(kernelResult);

  // Factor in dumpsys meminfo
  if (memInfo && memInfo.totalRamKb > 0) {
    const freeRatio = memInfo.freeRamKb / memInfo.totalRamKb;
    if (freeRatio < 0.05) memory -= 20;
    else if (freeRatio < 0.1) memory -= 10;
    memory = clamp(memory, 0, 100);
  }

  // Factor in dumpsys cpuinfo
  if (cpuInfo) {
    if (cpuInfo.totalCpuPercent > 90) responsiveness -= 15;
    else if (cpuInfo.totalCpuPercent > 80) responsiveness -= 8;
    if (cpuInfo.ioWaitPercent > 30) responsiveness -= 10;
    else if (cpuInfo.ioWaitPercent > 20) responsiveness -= 5;
    responsiveness = clamp(responsiveness, 0, 100);
  }

  // Round all sub-scores to integers
  stability = Math.round(stability);
  memory = Math.round(memory);
  responsiveness = Math.round(responsiveness);
  kernel = Math.round(kernel);

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

function calcStabilityScore(logcat: LogcatParseResult, kernel: KernelParseResult, tombstoneAnalyses?: TombstoneAnalysis[]): number {
  let score = 100;
  const counts = new Map<string, number>();

  const STABILITY_LOGCAT: Record<string, [number, number]> = {
    system_server_crash: [30, 60],
    fatal_exception: [10, 30],
    native_crash: [15, 40],
    watchdog: [25, 50],
    hal_service_death: [10, 30],
  };

  for (const a of logcat.anomalies) {
    const cfg = STABILITY_LOGCAT[a.type];
    if (cfg) {
      score -= dampedDeduction(counts, a.type, cfg[0], cfg[1]);
    }
  }

  const STABILITY_KERNEL: Record<string, [number, number]> = {
    kernel_panic: [40, 60],
    watchdog_reset: [30, 50],
  };

  for (const e of kernel.events) {
    const cfg = STABILITY_KERNEL[e.type];
    if (cfg) {
      score -= dampedDeduction(counts, e.type, cfg[0], cfg[1]);
    }
  }

  // Tombstone native crashes: 15 per crash, max 40
  if (tombstoneAnalyses) {
    for (const _t of tombstoneAnalyses) {
      score -= dampedDeduction(counts, 'tombstone_native_crash', 15, 40);
    }
  }

  return clamp(score, 0, 100);
}

function calcMemoryScore(logcat: LogcatParseResult, kernel: KernelParseResult): number {
  let score = 100;
  const counts = new Map<string, number>();

  for (const a of logcat.anomalies) {
    if (a.type === 'oom') {
      score -= dampedDeduction(counts, 'oom', 20, 40);
    }
  }

  const MEMORY_KERNEL: Record<string, [number, number]> = {
    oom_kill: [25, 50],
    lowmemory_killer: [10, 30],
    kswapd_active: [5, 20],
  };

  for (const e of kernel.events) {
    const cfg = MEMORY_KERNEL[e.type];
    if (cfg) {
      score -= dampedDeduction(counts, e.type, cfg[0], cfg[1]);
    }
  }

  return clamp(score, 0, 100);
}

function calcResponsivenessScore(logcat: LogcatParseResult, anrAnalyses: ANRTraceAnalysis[]): number {
  let score = 100;
  const counts = new Map<string, number>();

  const RESP_LOGCAT: Record<string, [number, number]> = {
    anr: [20, 50],
    input_dispatching_timeout: [20, 50],
    binder_timeout: [10, 30],
    slow_operation: [5, 20],
  };

  for (const a of logcat.anomalies) {
    const cfg = RESP_LOGCAT[a.type];
    if (cfg) {
      score -= dampedDeduction(counts, a.type, cfg[0], cfg[1]);
    }
  }

  for (const analysis of anrAnalyses) {
    if (!analysis.mainThread) continue;
    const reason = analysis.mainThread.blockReason;
    if (reason === 'idle_main_thread') {
      score -= dampedDeduction(counts, 'anr_idle', 2, 10);
    } else if (reason === 'deadlock') {
      score -= dampedDeduction(counts, 'anr_deadlock', 25, 50);
    } else {
      score -= dampedDeduction(counts, 'anr_trace', 15, 40);
    }
  }

  return clamp(score, 0, 100);
}

function calcKernelScore(kernel: KernelParseResult): number {
  let score = 100;
  const counts = new Map<string, number>();

  const KERNEL_PENALTIES: Record<string, [number, number]> = {
    kernel_panic: [40, 60],
    thermal_shutdown: [30, 50],
    watchdog_reset: [30, 50],
    gpu_error: [15, 35],
    driver_error: [10, 30],
    thermal_throttling: [8, 25],
    storage_io_error: [10, 30],
    suspend_resume_error: [5, 20],
    selinux_denial: [2, 15],
  };

  for (const e of kernel.events) {
    const cfg = KERNEL_PENALTIES[e.type];
    if (cfg) {
      score -= dampedDeduction(counts, e.type, cfg[0], cfg[1]);
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
