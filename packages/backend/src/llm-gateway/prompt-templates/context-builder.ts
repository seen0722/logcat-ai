import {
  AnalysisResult,
  InsightCard,
  LogcatAnomaly,
  KernelEvent,
  ANRTraceAnalysis,
  ThreadInfo,
  HALFamily,
  BinderTargetInfo,
} from '@logcat-ai/parser';

export interface InsightContext {
  insightId: string;
  anomalyLogs: string[];
  fullStackTrace: string | null;
  blockingChainStacks: string[];
  relevantThreads: string[];
  temporalContext: string[];
}

const MAX_TOTAL_TOKENS = 60_000;
const CHARS_PER_TOKEN = 3.5;
const MAX_TOTAL_CHARS = MAX_TOTAL_TOKENS * CHARS_PER_TOKEN;

/**
 * Build targeted context for each critical/warning insight.
 * Collects raw log entries, full stack traces, blocking chains,
 * and temporal context within a token budget.
 */
export function buildInsightContexts(result: AnalysisResult): InsightContext[] {
  const targetInsights = result.insights.filter(
    (i) => i.severity === 'critical' || i.severity === 'warning'
  );

  const contexts: InsightContext[] = targetInsights.map((insight) => {
    const ctx: InsightContext = {
      insightId: insight.id,
      anomalyLogs: [],
      fullStackTrace: null,
      blockingChainStacks: [],
      relevantThreads: [],
      temporalContext: [],
    };

    if (insight.source === 'logcat') {
      collectLogcatContext(ctx, insight, result);
    } else if (insight.source === 'anr') {
      collectANRContext(ctx, insight, result);
    } else if (insight.source === 'kernel') {
      collectKernelContext(ctx, insight, result);
    } else if (insight.source === 'cross') {
      collectLogcatContext(ctx, insight, result);
      collectKernelContext(ctx, insight, result);
    }

    // Temporal window: W/E/F entries within +/- 2 seconds of insight timestamp
    if (insight.timestamp && insight.severity === 'critical') {
      collectTemporalContext(ctx, insight, result);
    }

    return ctx;
  });

  // Enforce token budget — trim contexts if total exceeds limit
  return enforceTokenBudget(contexts);
}

function collectLogcatContext(
  ctx: InsightContext,
  insight: InsightCard,
  result: AnalysisResult
): void {
  // Find matching anomalies by title keywords
  const titleWords = insight.title.toLowerCase();
  const matchingAnomalies = result.logcatResult.anomalies.filter((a) => {
    return (
      titleWords.includes(a.type.replace(/_/g, ' ')) ||
      titleWords.includes(a.processName?.toLowerCase() ?? '') ||
      a.summary.toLowerCase().includes(titleWords.slice(0, 30))
    );
  });

  // If no exact match, try broader match
  const anomalies = matchingAnomalies.length > 0
    ? matchingAnomalies
    : findAnomaliesByCategory(insight, result.logcatResult.anomalies);

  for (const anomaly of anomalies.slice(0, 3)) {
    const entries = anomaly.entries.slice(0, 15).map((e) => e.raw);
    ctx.anomalyLogs.push(...entries);
  }
}

function findAnomaliesByCategory(
  insight: InsightCard,
  anomalies: LogcatAnomaly[]
): LogcatAnomaly[] {
  const categoryMap: Record<string, string[]> = {
    anr: ['anr'],
    crash: ['fatal_exception', 'native_crash', 'system_server_crash'],
    memory: ['oom'],
    performance: ['slow_operation', 'binder_timeout', 'strict_mode'],
    stability: ['watchdog', 'system_server_crash'],
  };
  const types = categoryMap[insight.category] ?? [];
  return anomalies.filter((a) => types.includes(a.type));
}

function collectANRContext(
  ctx: InsightContext,
  insight: InsightCard,
  result: AnalysisResult
): void {
  // Match ANR analysis by process name or insight title
  const titleLower = insight.title.toLowerCase();
  const anr = result.anrAnalyses.find((a) =>
    titleLower.includes(a.processName.toLowerCase()) ||
    titleLower.includes(`pid ${a.pid}`)
  ) ?? result.anrAnalyses[0];

  if (!anr) return;

  // Full stack trace for blocked thread (no cap)
  const primary = anr.blockedThread ?? anr.mainThread;
  if (primary) {
    ctx.fullStackTrace = primary.thread.stackFrames.map((f) => f.raw).join('\n');

    // Blocking chain: each thread's stack + lock info
    for (const chainThread of primary.blockingChain) {
      const fullThread = anr.threads.find((t) => t.tid === chainThread.tid);
      if (fullThread) {
        const lockInfo = fullThread.waitingOnLock
          ? `  waiting on lock ${fullThread.waitingOnLock.address} (${fullThread.waitingOnLock.className})` +
            (fullThread.waitingOnLock.heldByTid ? ` held by tid=${fullThread.waitingOnLock.heldByTid}` : '')
          : '';
        const heldInfo = fullThread.heldLocks.length > 0
          ? `  holds locks: ${fullThread.heldLocks.map((l) => `${l.address}(${l.className})`).join(', ')}`
          : '';
        const stack = fullThread.stackFrames.map((f) => `    ${f.raw}`).join('\n');
        ctx.blockingChainStacks.push(
          `Thread "${fullThread.name}" tid=${fullThread.tid} (${fullThread.state}):${lockInfo}${heldInfo}\n${stack}`
        );
      }
    }
  }

  // Relevant threads: Blocked or Native state
  const relevantStates = ['Blocked', 'Native'];
  const relevantThreads = anr.threads
    .filter((t) => relevantStates.includes(t.state) && t.tid !== (primary?.thread as ThreadInfo)?.tid)
    .slice(0, 10);

  for (const t of relevantThreads) {
    const topFrames = t.stackFrames.slice(0, 5).map((f) => `    ${f.raw}`).join('\n');
    ctx.relevantThreads.push(`Thread "${t.name}" tid=${t.tid} (${t.state}):\n${topFrames}`);
  }

  // Also collect matching logcat anomalies for ANR
  collectLogcatContext(ctx, insight, result);
}

function collectKernelContext(
  ctx: InsightContext,
  insight: InsightCard,
  result: AnalysisResult
): void {
  const titleLower = insight.title.toLowerCase();
  const matchingEvents = result.kernelResult.events.filter((e) =>
    titleLower.includes(e.type.replace(/_/g, ' ')) ||
    e.summary.toLowerCase().includes(titleLower.slice(0, 30))
  );

  const events = matchingEvents.length > 0
    ? matchingEvents
    : result.kernelResult.events.filter((e) => e.severity === insight.severity).slice(0, 3);

  for (const event of events.slice(0, 3)) {
    // Event's raw entries
    const entries = event.entries.map((e) => e.raw);
    ctx.anomalyLogs.push(...entries);

    // Surrounding kernel context: entries within +/- 5 seconds
    const tStart = event.timestamp - 5;
    const tEnd = event.timestamp + 5;
    const surrounding = result.kernelResult.entries
      .filter((e) => e.timestamp >= tStart && e.timestamp <= tEnd)
      .slice(0, 20)
      .map((e) => e.raw);
    ctx.anomalyLogs.push(...surrounding);
  }

  // Deduplicate
  ctx.anomalyLogs = [...new Set(ctx.anomalyLogs)];
}

function collectTemporalContext(
  ctx: InsightContext,
  insight: InsightCard,
  result: AnalysisResult
): void {
  if (!insight.timestamp) return;

  // Parse insight timestamp to find logcat entries within +/- 2 seconds
  // Insight timestamps are in "MM-DD HH:mm:ss.SSS" or ISO format
  const insightTs = insight.timestamp;

  // Find logcat entries with W/E/F level near the timestamp
  const highLevelEntries = result.logcatResult.entries.filter((e) => {
    if (e.level !== 'W' && e.level !== 'E' && e.level !== 'F') return false;
    return isWithinSeconds(e.timestamp, insightTs, 2);
  });

  ctx.temporalContext = highLevelEntries.slice(0, 20).map((e) => e.raw);
}

function isWithinSeconds(ts1: string, ts2: string, seconds: number): boolean {
  // Both timestamps in "MM-DD HH:mm:ss.SSS" format
  try {
    const parse = (ts: string) => {
      const match = ts.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
      if (!match) return 0;
      const [, mo, d, h, m, s, ms] = match;
      return (
        Number(mo) * 30 * 86400 +
        Number(d) * 86400 +
        Number(h) * 3600 +
        Number(m) * 60 +
        Number(s) +
        Number(ms) / 1000
      );
    };
    return Math.abs(parse(ts1) - parse(ts2)) <= seconds;
  } catch {
    return false;
  }
}

function enforceTokenBudget(contexts: InsightContext[]): InsightContext[] {
  let totalChars = estimateChars(contexts);

  if (totalChars <= MAX_TOTAL_CHARS) return contexts;

  // Step 1: Trim temporal context
  for (const ctx of contexts) {
    if (totalChars <= MAX_TOTAL_CHARS) break;
    const removed = ctx.temporalContext.splice(10);
    totalChars -= removed.join('').length;
  }

  // Step 2: Trim relevant threads
  for (const ctx of contexts) {
    if (totalChars <= MAX_TOTAL_CHARS) break;
    const removed = ctx.relevantThreads.splice(5);
    totalChars -= removed.join('').length;
  }

  // Step 3: Trim anomaly logs
  for (const ctx of contexts) {
    if (totalChars <= MAX_TOTAL_CHARS) break;
    const removed = ctx.anomalyLogs.splice(10);
    totalChars -= removed.join('').length;
  }

  // Step 4: Trim blocking chain stacks
  for (const ctx of contexts) {
    if (totalChars <= MAX_TOTAL_CHARS) break;
    const removed = ctx.blockingChainStacks.splice(3);
    totalChars -= removed.join('').length;
  }

  return contexts;
}

function estimateChars(contexts: InsightContext[]): number {
  let total = 0;
  for (const ctx of contexts) {
    total += ctx.anomalyLogs.join('').length;
    total += (ctx.fullStackTrace ?? '').length;
    total += ctx.blockingChainStacks.join('').length;
    total += ctx.relevantThreads.join('').length;
    total += ctx.temporalContext.join('').length;
  }
  return total;
}

/**
 * Build HAL cross-reference entries for ANR binder targets.
 * Matches ANR binder targets (and suspected targets) against HAL family status.
 */
export function buildHALCrossReference(result: AnalysisResult): string[] {
  if (!result.halStatus || result.halStatus.families.length === 0) return [];

  // Collect all binder targets from all ANR analyses
  const targets: Array<{ packageName: string; interfaceName: string; source: string }> = [];

  for (const anr of result.anrAnalyses) {
    const primary = anr.blockedThread ?? anr.mainThread;
    if (!primary) continue;

    if (primary.binderTarget && primary.binderTarget.interfaceName !== 'Unknown') {
      targets.push({
        packageName: primary.binderTarget.packageName,
        interfaceName: primary.binderTarget.interfaceName,
        source: 'binder_target',
      });
    }

    if (primary.suspectedBinderTargets) {
      for (const t of primary.suspectedBinderTargets) {
        targets.push({
          packageName: t.packageName,
          interfaceName: t.interfaceName,
          source: 'suspected',
        });
      }
    }
  }

  if (targets.length === 0) return [];

  // Deduplicate by packageName
  const seen = new Set<string>();
  const uniqueTargets = targets.filter((t) => {
    if (seen.has(t.packageName)) return false;
    seen.add(t.packageName);
    return true;
  });

  const entries: string[] = [];

  for (const target of uniqueTargets) {
    const family = matchFamilyByPackage(target.packageName, result.halStatus!.families);
    if (family) {
      const oemTag = family.isOem ? ' [OEM]' : '';
      entries.push(
        `- ${target.interfaceName} (${target.packageName}) → ${family.highestStatus}, highest=${family.highestVersion}, ${family.versionCount} version(s)${oemTag}`
      );
    } else {
      entries.push(
        `- ${target.interfaceName} (${target.packageName}) → status unknown (not found in lshal)`
      );
    }
  }

  return entries;
}

/**
 * Match a binder packageName to a HAL family.
 * packageName: "vendor.trimble.hardware.trmbkeypad@1.0"
 * familyName: "vendor.trimble.hardware.trmbkeypad::ITrmbKeypad"
 * Match rule: take prefix before '@' from packageName, compare to prefix before '::' from familyName.
 */
function matchFamilyByPackage(packageName: string, families: HALFamily[]): HALFamily | null {
  // Extract prefix: everything before @version
  const pkgPrefix = packageName.replace(/@[\d.]+.*$/, '').toLowerCase();

  for (const family of families) {
    const familyPrefix = family.familyName.split('::')[0].replace(/@[\d.]+/, '').toLowerCase();
    if (pkgPrefix === familyPrefix) return family;
  }

  return null;
}
