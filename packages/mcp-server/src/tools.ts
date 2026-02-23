import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  unpackBugreport,
  parseLogcat,
  detectAnomalies,
  computeTagStats,
  parseANRTrace,
  parseKernelLog,
  parseMemInfo,
  parseCpuInfo,
  parseLshal,
  parseTombstones,
  analyzeBasic,
  detectLogFormat,
} from '@logcat-ai/parser';
import type { AnalysisResult, LogEntry } from '@logcat-ai/parser';

// Store last analysis result for follow-up queries
let lastAnalysisResult: AnalysisResult | null = null;

/**
 * Register all MCP tools on the given McpServer instance.
 */
export function registerTools(server: McpServer): void {
  // ----------------------------------------------------------------
  // Tool 1: analyze_bugreport
  // ----------------------------------------------------------------
  server.registerTool(
    'analyze_bugreport',
    {
      title: 'Analyze Android Bugreport',
      description:
        'Analyze an Android bugreport file (.zip, .txt, or .log). Returns health scores, insights, ANR analysis, and more.',
      inputSchema: {
        file_path: z
          .string()
          .describe('Absolute path to the bugreport file (.zip, .txt, or .log)'),
      },
    },
    async ({ file_path: filePath }) => {
      return analyzeFile(filePath);
    },
  );

  // ----------------------------------------------------------------
  // Tool 2: search_history
  // ----------------------------------------------------------------
  server.registerTool(
    'search_history',
    {
      title: 'Search Analysis History',
      description:
        'Search past bugreport analysis history stored in the SQLite database. Returns summary of past analyses.',
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe('Maximum number of results (default 10)'),
      },
    },
    async ({ limit }) => {
      return searchHistory(limit);
    },
  );

  // ----------------------------------------------------------------
  // Tool 3: ask_about_analysis
  // ----------------------------------------------------------------
  server.registerTool(
    'ask_about_analysis',
    {
      title: 'Ask About Analysis',
      description:
        'Get specific details about the most recent analysis result. Can ask about insights, ANR details, health scores, HAL status, etc.',
      inputSchema: {
        question: z
          .string()
          .describe(
            'What do you want to know about the analysis? e.g., "What are the critical issues?", "Show ANR details", "What is the health score breakdown?"',
          ),
      },
    },
    async ({ question }) => {
      return askAboutAnalysis(question);
    },
  );
}

// ================================================================
// Tool implementations
// ================================================================

async function analyzeFile(
  filePath: string,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!filePath) {
    return { content: [{ type: 'text', text: 'Error: file_path is required' }] };
  }

  if (!fs.existsSync(filePath)) {
    return {
      content: [{ type: 'text', text: `Error: File not found: ${filePath}` }],
    };
  }

  const ext = path.extname(filePath).toLowerCase();
  let result: AnalysisResult;

  try {
    if (ext === '.zip') {
      result = await analyzeZipFile(filePath);
    } else if (ext === '.txt' || ext === '.log') {
      result = await analyzeTextFile(filePath);
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Unsupported file type: ${ext}. Use .zip, .txt, or .log`,
          },
        ],
      };
    }

    lastAnalysisResult = result;
    return { content: [{ type: 'text', text: formatAnalysisResult(result) }] };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error analyzing file: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

async function analyzeZipFile(filePath: string): Promise<AnalysisResult> {
  const unpackResult = await unpackBugreport(filePath);

  // Parse logcat per-section to preserve buffer info
  const allEntries: LogEntry[] = [];
  let totalParseErrors = 0;
  let totalLines = 0;
  let parsedLines = 0;
  for (const section of unpackResult.logcatSections) {
    const result = parseLogcat(section.content, section.buffer);
    allEntries.push(...result.entries);
    totalParseErrors += result.parseErrors;
    totalLines += result.totalLines;
    parsedLines += result.parsedLines;
  }
  const logcatResult = {
    entries: allEntries,
    anomalies: detectAnomalies(allEntries),
    totalLines,
    parsedLines,
    parseErrors: totalParseErrors,
    tagStats: computeTagStats(allEntries),
  };

  const anrAnalyses = [...unpackResult.anrTraceContents.values()].map((content) =>
    parseANRTrace(content),
  );

  const kernelSection = unpackResult.sections.find(
    (s) => s.name === 'KERNEL LOG' || s.command.includes('dmesg'),
  );
  const kernelResult = parseKernelLog(kernelSection?.content ?? '');

  const memInfoSection =
    unpackResult.sections.find((s) => s.command.includes('dumpsys meminfo')) ??
    unpackResult.sections.find(
      (s) => /^DUMPSYS/i.test(s.name) && /Total RAM:/i.test(s.content),
    );
  const memInfo = memInfoSection ? parseMemInfo(memInfoSection.content) : undefined;

  const cpuInfoSection =
    unpackResult.sections.find((s) => s.command.includes('dumpsys cpuinfo')) ??
    unpackResult.sections.find(
      (s) => /^DUMPSYS/i.test(s.name) && /TOTAL:.*user.*kernel/i.test(s.content),
    );
  const cpuInfo = cpuInfoSection ? parseCpuInfo(cpuInfoSection.content) : undefined;

  const halSection = unpackResult.sections.find(
    (s) => s.name === 'HARDWARE HALS' || s.command.includes('lshal'),
  );
  const halStatus = halSection
    ? parseLshal(halSection.content, unpackResult.metadata.manufacturer)
    : undefined;

  const tombstoneResult = parseTombstones(unpackResult.tombstoneContents);

  const sysPropSection = unpackResult.sections.find(
    (s) => s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop'),
  );

  return analyzeBasic({
    metadata: unpackResult.metadata,
    logcatResult,
    kernelResult,
    anrAnalyses,
    memInfo,
    cpuInfo,
    halStatus,
    tombstoneAnalyses: tombstoneResult.analyses,
    systemProperties: sysPropSection?.content,
  });
}

async function analyzeTextFile(filePath: string): Promise<AnalysisResult> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const format = detectLogFormat(content);

  if (format === 'unknown') {
    throw new Error(
      'Could not detect file format. Expected logcat or dmesg output.',
    );
  }

  const emptyMetadata = {
    androidVersion: '',
    sdkLevel: 0,
    buildFingerprint: '',
    deviceModel: '',
    manufacturer: '',
    buildDate: '',
    kernelVersion: '',
    bugreportTimestamp: new Date(),
  };

  if (format === 'logcat') {
    const logcatResult = parseLogcat(content);
    return analyzeBasic({
      metadata: emptyMetadata,
      logcatResult,
      kernelResult: { entries: [], events: [], totalLines: 0 },
      anrAnalyses: [],
    });
  } else {
    const kernelResult = parseKernelLog(content);
    return analyzeBasic({
      metadata: emptyMetadata,
      logcatResult: {
        entries: [],
        anomalies: [],
        totalLines: 0,
        parsedLines: 0,
        parseErrors: 0,
      },
      kernelResult,
      anrAnalyses: [],
    });
  }
}

// ================================================================
// Formatting helpers
// ================================================================

function formatAnalysisResult(result: AnalysisResult): string {
  const lines: string[] = [];
  const m = result.metadata;

  lines.push('# Bugreport Analysis Result\n');

  // Device info
  if (m.deviceModel) {
    lines.push('## Device');
    lines.push(`- Model: ${m.deviceModel} (${m.manufacturer})`);
    lines.push(`- Android: ${m.androidVersion} (SDK ${m.sdkLevel})`);
    lines.push(`- Build: ${m.buildFingerprint}`);
    lines.push('');
  }

  // Health scores
  const h = result.healthScore;
  lines.push(`## Health Score: ${h.overall}/100`);
  lines.push(`- Stability: ${h.breakdown.stability}/100`);
  lines.push(`- Memory: ${h.breakdown.memory}/100`);
  lines.push(`- Responsiveness: ${h.breakdown.responsiveness}/100`);
  lines.push(`- Kernel: ${h.breakdown.kernel}/100`);
  lines.push('');

  // Insights
  const criticals = result.insights.filter((i) => i.severity === 'critical');
  const warnings = result.insights.filter((i) => i.severity === 'warning');
  const infos = result.insights.filter((i) => i.severity === 'info');

  lines.push(
    `## Insights (${result.insights.length} total: ${criticals.length} critical, ${warnings.length} warning, ${infos.length} info)\n`,
  );

  for (const insight of result.insights) {
    const badge =
      insight.severity === 'critical'
        ? '[CRITICAL]'
        : insight.severity === 'warning'
          ? '[WARNING]'
          : '[INFO]';
    lines.push(`### ${badge} ${insight.title}`);
    lines.push(insight.description);
    if (insight.debugCommands?.length) {
      lines.push(`Debug: \`${insight.debugCommands[0]}\``);
    }
    lines.push('');
  }

  // ANR Summary
  if (result.anrAnalyses.length > 0) {
    lines.push(`## ANR Traces (${result.anrAnalyses.length})\n`);
    for (const anr of result.anrAnalyses) {
      const primary = anr.blockedThread ?? anr.mainThread;
      const reason = primary?.blockReason ?? 'unknown';
      const target = primary?.binderTarget?.interfaceName;
      lines.push(
        `- **${anr.processName}** (PID ${anr.pid}): ${reason}${target ? ` -> ${target}` : ''}`,
      );
    }
    lines.push('');
  }

  // Tombstone Summary
  if (result.tombstoneAnalyses && result.tombstoneAnalyses.length > 0) {
    lines.push(
      `## Native Crashes (${result.tombstoneAnalyses.length})\n`,
    );
    for (const t of result.tombstoneAnalyses) {
      lines.push(
        `- **${t.processName}** (PID ${t.pid}): ${t.signalName} - ${t.summary}`,
      );
    }
    lines.push('');
  }

  // Memory summary
  if (result.memInfo) {
    lines.push('## Memory');
    lines.push(`- Total: ${(result.memInfo.totalRamKb / 1024).toFixed(0)} MB`);
    lines.push(`- Free: ${(result.memInfo.freeRamKb / 1024).toFixed(0)} MB`);
    lines.push(`- Used: ${(result.memInfo.usedRamKb / 1024).toFixed(0)} MB`);
    lines.push('');
  }

  // CPU summary
  if (result.cpuInfo) {
    lines.push('## CPU');
    lines.push(`- Total: ${result.cpuInfo.totalCpuPercent.toFixed(1)}%`);
    lines.push(`- User: ${result.cpuInfo.userPercent.toFixed(1)}%`);
    lines.push(`- Kernel: ${result.cpuInfo.kernelPercent.toFixed(1)}%`);
    lines.push(`- IO Wait: ${result.cpuInfo.ioWaitPercent.toFixed(1)}%`);
    lines.push('');
  }

  return lines.join('\n');
}

// ================================================================
// search_history implementation
// ================================================================

async function searchHistory(
  limit?: number,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const { default: Database } = await import('better-sqlite3');
    const dbPath = findDatabasePath();

    if (!dbPath || !fs.existsSync(dbPath)) {
      return {
        content: [
          {
            type: 'text',
            text: 'No analysis history database found. Run analyses through the web UI first, or use analyze_bugreport tool to analyze a file directly.',
          },
        ],
      };
    }

    const db = new Database(dbPath, { readonly: true });
    const maxResults = limit ?? 10;

    const rows = db
      .prepare(
        'SELECT id, filename, file_size, created_at, device_model, manufacturer, android_ver, health_overall, insight_count, critical_count, anr_count FROM analyses ORDER BY created_at DESC LIMIT ?',
      )
      .all(maxResults) as Array<Record<string, unknown>>;

    db.close();

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'No analysis history found.' }] };
    }

    const lines = ['# Analysis History\n'];
    for (const row of rows) {
      lines.push(`- **${row.filename}** (${row.created_at})`);
      lines.push(
        `  Device: ${row.device_model ?? 'Unknown'} | Android: ${row.android_ver ?? '?'} | Health: ${row.health_overall ?? '?'}/100`,
      );
      lines.push(
        `  Insights: ${row.insight_count} (${row.critical_count} critical) | ANRs: ${row.anr_count}`,
      );
      lines.push(`  ID: ${row.id}`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch {
    // better-sqlite3 is an optional dependency; if not installed, inform the user
    return {
      content: [
        {
          type: 'text',
          text: 'History search is not available. The optional dependency "better-sqlite3" is not installed, or the database could not be opened. Use the analyze_bugreport tool to analyze files directly.',
        },
      ],
    };
  }
}

function findDatabasePath(): string | null {
  // Try common locations relative to the MCP server
  const candidates = [
    path.resolve(process.cwd(), 'data/logcat-ai.db'),
    path.resolve(process.cwd(), '../data/logcat-ai.db'),
    // If the MCP server is in packages/mcp-server, the data dir is at project root
    path.resolve(import.meta.dirname ?? '.', '../../../data/logcat-ai.db'),
    path.resolve(import.meta.dirname ?? '.', '../../data/logcat-ai.db'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Check environment variable
  const envPath = process.env.LOGCAT_AI_DB_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  return null;
}

// ================================================================
// ask_about_analysis implementation
// ================================================================

function askAboutAnalysis(
  question: string,
): { content: Array<{ type: 'text'; text: string }> } {
  if (!lastAnalysisResult) {
    return {
      content: [
        {
          type: 'text',
          text: 'No analysis result available. Use analyze_bugreport first to analyze a file.',
        },
      ],
    };
  }

  const result = lastAnalysisResult;
  const q = question.toLowerCase();

  // Route to appropriate data based on question keywords
  if (q.includes('critical') || q.includes('severe') || q.includes('urgent')) {
    return formatCriticalInsights(result);
  }

  if (q.includes('anr') || q.includes('not responding')) {
    return formatANRDetails(result);
  }

  if (q.includes('health') || q.includes('score')) {
    return formatHealthScore(result);
  }

  if (q.includes('hal') || q.includes('hardware')) {
    return formatHALStatus(result);
  }

  if (q.includes('memory') || q.includes('ram') || q.includes('oom')) {
    return formatMemoryInfo(result);
  }

  if (q.includes('kernel') || q.includes('dmesg')) {
    return formatKernelIssues(result);
  }

  if (
    q.includes('tombstone') ||
    q.includes('native crash') ||
    q.includes('sigsegv') ||
    q.includes('sigabrt')
  ) {
    return formatTombstones(result);
  }

  if (q.includes('cpu') || q.includes('processor') || q.includes('load')) {
    return formatCPUInfo(result);
  }

  if (q.includes('timeline') || q.includes('chronolog') || q.includes('sequence')) {
    return formatTimeline(result);
  }

  // Default: return full summary
  return { content: [{ type: 'text', text: formatAnalysisResult(result) }] };
}

// ================================================================
// Response formatters for ask_about_analysis
// ================================================================

function formatCriticalInsights(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  const criticals = result.insights.filter((i) => i.severity === 'critical');
  if (criticals.length === 0) {
    return { content: [{ type: 'text', text: 'No critical issues found.' }] };
  }

  const lines = [`# Critical Issues (${criticals.length})\n`];
  for (const c of criticals) {
    lines.push(`## ${c.title}`);
    lines.push(c.description);
    if (c.stackTrace) lines.push(`\n\`\`\`\n${c.stackTrace}\n\`\`\``);
    if (c.debugCommands?.length) {
      lines.push(
        `\nDebug commands:\n${c.debugCommands.map((cmd) => `- \`${cmd}\``).join('\n')}`,
      );
    }
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatANRDetails(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  if (result.anrAnalyses.length === 0) {
    return {
      content: [{ type: 'text', text: 'No ANR traces found in this analysis.' }],
    };
  }

  const lines = [`# ANR Details (${result.anrAnalyses.length})\n`];
  for (const anr of result.anrAnalyses) {
    lines.push(`## ${anr.processName} (PID ${anr.pid})`);
    if (anr.subject) lines.push(`Subject: ${anr.subject}`);
    const primary = anr.blockedThread ?? anr.mainThread;
    if (primary) {
      lines.push(`Block Reason: ${primary.blockReason}`);
      lines.push(`Confidence: ${primary.confidence}`);
      if (primary.binderTarget) {
        lines.push(
          `Binder Target: ${primary.binderTarget.interfaceName} (${primary.binderTarget.packageName})`,
        );
      }
      if (primary.blockingChain.length > 0) {
        lines.push(
          `Blocking Chain: ${primary.blockingChain.map((t) => `${t.name}(${t.state})`).join(' -> ')}`,
        );
      }
      if (primary.thread.stackFrames.length > 0) {
        lines.push('\nStack trace:\n```');
        lines.push(
          primary.thread.stackFrames
            .slice(0, 20)
            .map((f) => f.raw)
            .join('\n'),
        );
        lines.push('```');
      }
    }
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatHealthScore(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  const h = result.healthScore;
  return {
    content: [
      {
        type: 'text',
        text: `# Health Score Breakdown\n\n- **Overall: ${h.overall}/100**\n- Stability: ${h.breakdown.stability}/100\n- Memory: ${h.breakdown.memory}/100\n- Responsiveness: ${h.breakdown.responsiveness}/100\n- Kernel: ${h.breakdown.kernel}/100`,
      },
    ],
  };
}

function formatHALStatus(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  if (!result.halStatus) {
    return { content: [{ type: 'text', text: 'No HAL status data available.' }] };
  }
  const hal = result.halStatus;
  const lines = ['# HAL Status\n'];
  lines.push(`Total services: ${hal.totalServices}`);
  lines.push(`Alive: ${hal.aliveCount}`);
  lines.push(`Non-responsive: ${hal.nonResponsiveCount}`);
  lines.push(`Declared (not started): ${hal.declaredCount}`);
  lines.push(`Vendor issues: ${hal.vendorIssueCount}`);
  if (hal.truncated) {
    lines.push(
      '\n**Warning**: lshal output was truncated. BSP HAL non-responsive/declared status may be unreliable.',
    );
  }
  lines.push('');
  if (hal.nonResponsiveServices.length > 0) {
    lines.push('## Non-responsive Services\n');
    for (const nr of hal.nonResponsiveServices.slice(0, 15)) {
      lines.push(`- ${nr.interfaceName} (${nr.transport})`);
    }
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatMemoryInfo(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  if (!result.memInfo) {
    return { content: [{ type: 'text', text: 'No memory info available.' }] };
  }
  const mem = result.memInfo;
  const lines = ['# Memory Info\n'];
  lines.push(`- Total RAM: ${(mem.totalRamKb / 1024).toFixed(0)} MB`);
  lines.push(`- Free RAM: ${(mem.freeRamKb / 1024).toFixed(0)} MB`);
  lines.push(`- Used RAM: ${(mem.usedRamKb / 1024).toFixed(0)} MB`);
  if (mem.topProcesses.length > 0) {
    lines.push('\n## Top Processes by Memory\n');
    for (const p of mem.topProcesses.slice(0, 10)) {
      lines.push(
        `- ${p.processName} (PID ${p.pid}): ${(p.totalPssKb / 1024).toFixed(1)} MB`,
      );
    }
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatKernelIssues(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  const kernelInsights = result.insights.filter((i) => i.category === 'kernel');
  if (kernelInsights.length === 0) {
    return { content: [{ type: 'text', text: 'No kernel issues found.' }] };
  }
  const lines = [`# Kernel Issues (${kernelInsights.length})\n`];
  for (const k of kernelInsights) {
    lines.push(`### [${k.severity.toUpperCase()}] ${k.title}`);
    lines.push(k.description);
    if (k.relatedLogSnippet) {
      lines.push(`\n\`\`\`\n${k.relatedLogSnippet}\n\`\`\``);
    }
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatTombstones(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  if (!result.tombstoneAnalyses || result.tombstoneAnalyses.length === 0) {
    return {
      content: [{ type: 'text', text: 'No native crash (tombstone) data available.' }],
    };
  }
  const lines = [`# Native Crashes (${result.tombstoneAnalyses.length})\n`];
  for (const t of result.tombstoneAnalyses) {
    lines.push(`## ${t.processName} (PID ${t.pid})`);
    lines.push(`- Signal: ${t.signalName} (${t.signal})`);
    lines.push(`- Summary: ${t.summary}`);
    if (t.isVendorCrash) lines.push('- **Vendor crash** (in /vendor/ or /odm/)');
    if (t.crashedInBinary) lines.push(`- Crashed in: ${t.crashedInBinary}`);
    if (t.abortMessage) lines.push(`- Abort message: ${t.abortMessage}`);
    if (t.backtrace.length > 0) {
      lines.push('\nBacktrace:\n```');
      lines.push(
        t.backtrace
          .slice(0, 15)
          .map((f) => f.raw)
          .join('\n'),
      );
      lines.push('```');
    }
    lines.push('');
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatCPUInfo(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  if (!result.cpuInfo) {
    return { content: [{ type: 'text', text: 'No CPU info available.' }] };
  }
  const cpu = result.cpuInfo;
  const lines = ['# CPU Info\n'];
  lines.push(`- Total CPU: ${cpu.totalCpuPercent.toFixed(1)}%`);
  lines.push(`- User: ${cpu.userPercent.toFixed(1)}%`);
  lines.push(`- Kernel: ${cpu.kernelPercent.toFixed(1)}%`);
  lines.push(`- IO Wait: ${cpu.ioWaitPercent.toFixed(1)}%`);
  if (cpu.topProcesses.length > 0) {
    lines.push('\n## Top Processes by CPU\n');
    for (const p of cpu.topProcesses.slice(0, 10)) {
      lines.push(`- ${p.processName} (PID ${p.pid}): ${p.cpuPercent.toFixed(1)}%`);
    }
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function formatTimeline(
  result: AnalysisResult,
): { content: Array<{ type: 'text'; text: string }> } {
  if (result.timeline.length === 0) {
    return { content: [{ type: 'text', text: 'No timeline events found.' }] };
  }
  const lines = [`# Event Timeline (${result.timeline.length} events)\n`];
  for (const event of result.timeline.slice(0, 30)) {
    const badge =
      event.severity === 'critical'
        ? '[CRITICAL]'
        : event.severity === 'warning'
          ? '[WARNING]'
          : '[INFO]';
    const ts = event.timeRange ?? event.timestamp;
    lines.push(`- ${ts} ${badge} [${event.source}] ${event.label}`);
    if (event.details) lines.push(`  ${event.details}`);
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
