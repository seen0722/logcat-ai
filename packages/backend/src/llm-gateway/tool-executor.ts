/**
 * Tool executor for agentic chat.
 * Executes tools against raw parsed bugreport data stored in RawDataStore.
 */

import { rawDataStore, RawData } from '../raw-data-store.js';
import { analysisStore } from '../store.js';
import { searchLogcatFTS } from '../search/fts-indexer.js';
import type {
  LogEntry,
  LogLevel,
  KernelParseResult,
  KernelEventType,
  ANRTraceAnalysis,
  ThreadInfo,
  BugreportSection,
  AnalysisResult,
  InsightCard,
} from '@logcat-ai/parser';

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

/**
 * Execute a tool call against the stored raw data for an analysis.
 */
export function executeTool(analysisId: string, toolCall: ToolCall): ToolResult {
  const rawData = rawDataStore.get(analysisId);
  const analysisResult = analysisStore.get(analysisId);

  let content: string;

  try {
    const args = JSON.parse(toolCall.function.arguments);

    switch (toolCall.function.name) {
      case 'search_logcat':
        content = searchLogcatWithFTS(analysisId, rawData?.logcatEntries ?? [], args);
        break;
      case 'get_thread_info':
        content = getThreadInfo(rawData?.anrAnalyses ?? [], args);
        break;
      case 'get_kernel_events':
        content = getKernelEvents(rawData?.kernelResult ?? null, args);
        break;
      case 'get_insight_detail':
        content = getInsightDetail(analysisResult ?? null, args);
        break;
      case 'search_section':
        content = searchSection(rawData?.sections ?? [], args);
        break;
      default:
        content = `Unknown tool: ${toolCall.function.name}`;
    }
  } catch (err) {
    content = `Error executing tool: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }

  return { tool_call_id: toolCall.id, content };
}

// ============================================================
// Tool: search_logcat (FTS5-enhanced)
// ============================================================

const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

/**
 * Search logcat with FTS5 first, fallback to in-memory keyword search.
 * FTS5 provides BM25-ranked results for better relevance.
 */
function searchLogcatWithFTS(
  analysisId: string,
  entries: LogEntry[],
  args: { keyword?: string; tag?: string; level?: string; pid?: number; limit?: number },
): string {
  // If keyword search is requested, try FTS5 first
  if (args.keyword && !args.tag && !args.level && !args.pid) {
    const limit = Math.min(args.limit ?? 20, 50);
    const ftsResult = searchLogcatFTS(analysisId, args.keyword, limit, 0);

    if (ftsResult && ftsResult.entries.length > 0) {
      const lines = ftsResult.entries.map(
        (e) => `${e.timestamp} ${e.level}/${e.tag}: ${e.message}`,
      );
      return `Found ${ftsResult.totalMatches} relevant entries (FTS5 ranked, showing ${ftsResult.entries.length}):\n\n${lines.join('\n')}`;
    }
  }

  // Fallback to in-memory search (supports all filters)
  return searchLogcat(entries, args);
}

function searchLogcat(
  entries: LogEntry[],
  args: { keyword?: string; tag?: string; level?: string; pid?: number; limit?: number },
): string {
  if (entries.length === 0) {
    return 'No logcat data available for this analysis.';
  }

  let filtered = entries;

  // Filter by tag (exact match)
  if (args.tag) {
    filtered = filtered.filter((e) => e.tag === args.tag);
  }

  // Filter by minimum log level
  if (args.level) {
    const minIdx = LOG_LEVELS.indexOf(args.level as LogLevel);
    if (minIdx >= 0) {
      filtered = filtered.filter((e) => LOG_LEVELS.indexOf(e.level) >= minIdx);
    }
  }

  // Filter by PID
  if (args.pid !== undefined) {
    filtered = filtered.filter((e) => e.pid === args.pid);
  }

  // Filter by keyword (case-insensitive, match in message or tag)
  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    filtered = filtered.filter(
      (e) => e.message.toLowerCase().includes(kw) || e.tag.toLowerCase().includes(kw),
    );
  }

  const totalMatches = filtered.length;
  const limit = Math.min(args.limit ?? 20, 50);
  const results = filtered.slice(0, limit);

  if (results.length === 0) {
    return 'No matching logcat entries found.';
  }

  const lines = results.map(
    (e) => `${e.timestamp} ${e.pid}/${e.tid} ${e.level}/${e.tag}: ${e.message}`,
  );

  return `Found ${totalMatches} matching entries (showing first ${results.length}):\n\n${lines.join('\n')}`;
}

// ============================================================
// Tool: get_thread_info
// ============================================================

function getThreadInfo(
  anrAnalyses: ANRTraceAnalysis[],
  args: { process_name?: string; thread_name?: string },
): string {
  if (anrAnalyses.length === 0) {
    return 'No ANR trace data available for this analysis.';
  }

  // Filter analyses by process name if specified
  let analyses = anrAnalyses;
  if (args.process_name) {
    const pn = args.process_name.toLowerCase();
    analyses = analyses.filter((a) => a.processName.toLowerCase().includes(pn));
    if (analyses.length === 0) {
      return `No ANR traces found for process "${args.process_name}". Available processes: ${anrAnalyses.map((a) => a.processName).join(', ')}`;
    }
  }

  // Find matching threads
  const matchingThreads: Array<{ analysis: ANRTraceAnalysis; thread: ThreadInfo }> = [];

  for (const analysis of analyses) {
    const threads = analysis.threads ?? [];
    if (args.thread_name) {
      const tn = args.thread_name.toLowerCase();
      for (const thread of threads) {
        if (thread.name.toLowerCase().includes(tn)) {
          matchingThreads.push({ analysis, thread });
        }
      }
    } else {
      // No thread name specified: show main thread analysis summary
      const mainThread = analysis.mainThread?.thread;
      if (mainThread) {
        matchingThreads.push({ analysis, thread: mainThread });
      }
    }
  }

  if (matchingThreads.length === 0) {
    // List available threads from first matching analysis
    const firstAnalysis = analyses[0];
    const threadNames = (firstAnalysis.threads ?? []).slice(0, 20).map((t) => t.name);
    return `No matching threads found. Available threads in ${firstAnalysis.processName} (showing first 20): ${threadNames.join(', ')}`;
  }

  // Format results
  const parts: string[] = [];
  for (const { analysis, thread } of matchingThreads.slice(0, 5)) {
    const lines: string[] = [];
    lines.push(`Process: ${analysis.processName} (PID ${analysis.pid})`);
    lines.push(`Thread: "${thread.name}" (TID ${thread.tid})`);
    lines.push(`State: ${thread.state}`);

    // Lock info
    if (thread.waitingOnLock) {
      lines.push(`Waiting on lock: ${thread.waitingOnLock.className} @ ${thread.waitingOnLock.address}`);
      if (thread.waitingOnLock.heldByTid !== undefined) {
        lines.push(`  Lock held by TID: ${thread.waitingOnLock.heldByTid}`);
      }
    }
    if (thread.heldLocks.length > 0) {
      lines.push(`Holding ${thread.heldLocks.length} lock(s): ${thread.heldLocks.map((l) => `${l.className}@${l.address}`).join(', ')}`);
    }

    // Stack trace (top 15 frames)
    if (thread.stackFrames.length > 0) {
      lines.push('Stack trace:');
      const frames = thread.stackFrames.slice(0, 15);
      for (const frame of frames) {
        lines.push(`  at ${frame.className}.${frame.methodName}(${frame.fileName}:${frame.lineNumber})`);
      }
      if (thread.stackFrames.length > 15) {
        lines.push(`  ... ${thread.stackFrames.length - 15} more frames`);
      }
    }

    // Block analysis if this is the main thread
    if (analysis.mainThread && analysis.mainThread.thread.tid === thread.tid) {
      lines.push(`\nBlock Analysis:`);
      lines.push(`  Reason: ${analysis.mainThread.blockReason}`);
      lines.push(`  Confidence: ${analysis.mainThread.confidence}`);
      if (analysis.mainThread.binderTarget) {
        const bt = analysis.mainThread.binderTarget;
        lines.push(`  Binder Target: ${bt.packageName}::${bt.interfaceName}.${bt.method}`);
      }
      if (analysis.mainThread.blockingChain.length > 0) {
        lines.push(`  Blocking Chain: ${analysis.mainThread.blockingChain.map((t) => `${t.name}(${t.state})`).join(' -> ')}`);
      }
    }

    // Blocked thread analysis (if different from main)
    if (analysis.blockedThread && analysis.blockedThread.thread.tid === thread.tid) {
      lines.push(`\nBlock Analysis (blocked thread "${analysis.blockedThreadName}"):`);
      lines.push(`  Reason: ${analysis.blockedThread.blockReason}`);
      lines.push(`  Confidence: ${analysis.blockedThread.confidence}`);
      if (analysis.blockedThread.binderTarget) {
        const bt = analysis.blockedThread.binderTarget;
        lines.push(`  Binder Target: ${bt.packageName}::${bt.interfaceName}.${bt.method}`);
      }
    }

    // Binder thread stats
    if (analysis.binderThreads) {
      const bt = analysis.binderThreads;
      lines.push(`\nBinder Threads: ${bt.total} total, ${bt.busy} busy, ${bt.idle} idle${bt.exhausted ? ' (EXHAUSTED!)' : ''}`);
    }

    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n---\n\n');
}

// ============================================================
// Tool: get_kernel_events
// ============================================================

function getKernelEvents(
  kernelResult: KernelParseResult | null,
  args: { type?: string; limit?: number },
): string {
  if (!kernelResult || kernelResult.events.length === 0) {
    return 'No kernel events found in this analysis.';
  }

  let events = kernelResult.events;

  // Filter by type
  if (args.type) {
    events = events.filter((e) => e.type === args.type);
  }

  if (events.length === 0) {
    const availableTypes = [...new Set(kernelResult.events.map((e) => e.type))];
    return `No kernel events of type "${args.type}" found. Available types: ${availableTypes.join(', ')}`;
  }

  const limit = Math.min(args.limit ?? 20, 50);
  const results = events.slice(0, limit);

  const lines = results.map((e) => {
    const details = Object.entries(e.details)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    const entries = e.entries.slice(0, 3).map((entry) => `  ${entry.raw}`).join('\n');
    return `[${e.severity.toUpperCase()}] ${e.type} @ boot+${e.timestamp.toFixed(1)}s: ${e.summary}${details ? `\n  Details: ${details}` : ''}${entries ? `\n  Log:\n${entries}` : ''}`;
  });

  return `Found ${events.length} kernel events${args.type ? ` of type "${args.type}"` : ''} (showing ${results.length}):\n\n${lines.join('\n\n')}`;
}

// ============================================================
// Tool: get_insight_detail
// ============================================================

function getInsightDetail(
  analysisResult: AnalysisResult | null,
  args: { insight_id: string },
): string {
  if (!analysisResult) {
    return 'No analysis result available.';
  }

  const insight = analysisResult.insights.find((i) => i.id === args.insight_id);
  if (!insight) {
    const availableIds = analysisResult.insights.map((i) => `${i.id} (${i.title})`);
    return `Insight "${args.insight_id}" not found. Available insights:\n${availableIds.join('\n')}`;
  }

  return formatInsight(insight);
}

function formatInsight(insight: InsightCard): string {
  const lines: string[] = [];
  lines.push(`ID: ${insight.id}`);
  lines.push(`Severity: ${insight.severity}`);
  lines.push(`Category: ${insight.category}`);
  lines.push(`Title: ${insight.title}`);
  lines.push(`Source: ${insight.source}`);
  if (insight.timestamp) lines.push(`Timestamp: ${insight.timestamp}`);
  lines.push(`\nDescription:\n${insight.description}`);

  if (insight.stackTrace) {
    lines.push(`\nStack Trace:\n${insight.stackTrace}`);
  }
  if (insight.relatedLogSnippet) {
    lines.push(`\nRelated Log Snippet:\n${insight.relatedLogSnippet}`);
  }
  if (insight.suggestedAllowRule) {
    lines.push(`\nSuggested SELinux Allow Rule:\n${insight.suggestedAllowRule}`);
  }
  if (insight.debugCommands && insight.debugCommands.length > 0) {
    lines.push(`\nDebug Commands:\n${insight.debugCommands.map((c) => `  $ ${c}`).join('\n')}`);
  }

  if (insight.deepAnalysis) {
    const da = insight.deepAnalysis;
    lines.push('\n--- Deep Analysis ---');
    lines.push(`Root Cause: ${da.rootCause}`);
    lines.push(`Fix Suggestion: ${da.fixSuggestion}`);
    lines.push(`Confidence: ${da.confidence}`);
    lines.push(`Category: ${da.category}`);
    lines.push(`Impact: ${da.impactAssessment}`);
    if (da.evidence.length > 0) {
      lines.push(`Evidence: ${da.evidence.join('; ')}`);
    }
    if (da.debuggingSteps.length > 0) {
      lines.push(`Debugging Steps:\n${da.debuggingSteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`);
    }
    if (da.affectedComponents.length > 0) {
      lines.push(`Affected Components: ${da.affectedComponents.join(', ')}`);
    }
    if (da.relatedInsights.length > 0) {
      lines.push(`Related Insights: ${da.relatedInsights.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ============================================================
// Tool: search_section
// ============================================================

function searchSection(
  sections: BugreportSection[],
  args: { section_name?: string; keyword?: string; limit?: number },
): string {
  if (sections.length === 0) {
    return 'No bugreport sections available (this may be a standalone logcat/dmesg file).';
  }

  let filtered = sections;

  // Filter by section name (case-insensitive partial match)
  if (args.section_name) {
    const sn = args.section_name.toLowerCase();
    filtered = filtered.filter(
      (s) => s.name.toLowerCase().includes(sn) || s.command.toLowerCase().includes(sn),
    );
  }

  // Filter by keyword in content (case-insensitive)
  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    filtered = filtered.filter((s) => s.content.toLowerCase().includes(kw));
  }

  if (filtered.length === 0) {
    if (args.section_name) {
      // Show available section names to help the LLM
      const names = [...new Set(sections.map((s) => s.name))].slice(0, 30);
      return `No sections matching "${args.section_name}" found. Available sections (first 30):\n${names.join('\n')}`;
    }
    return 'No matching sections found.';
  }

  const contentLimit = Math.min(args.limit ?? 2000, 5000);

  // Return up to 3 matching sections
  const results = filtered.slice(0, 3);
  const parts = results.map((s) => {
    let content = s.content;
    let truncated = false;

    // If searching by keyword, extract relevant portion around keyword
    if (args.keyword) {
      const kw = args.keyword.toLowerCase();
      const idx = content.toLowerCase().indexOf(kw);
      if (idx >= 0) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(content.length, idx + contentLimit - 200);
        content = content.slice(start, end);
        truncated = start > 0 || end < s.content.length;
      }
    }

    if (content.length > contentLimit) {
      content = content.slice(0, contentLimit);
      truncated = true;
    }

    return `=== Section: ${s.name} ===\nCommand: ${s.command}\nLines: ${s.startLine}-${s.endLine}\n\n${content}${truncated ? '\n\n[... truncated ...]' : ''}`;
  });

  const header = `Found ${filtered.length} matching section(s) (showing ${results.length}):`;
  return `${header}\n\n${parts.join('\n\n')}`;
}
