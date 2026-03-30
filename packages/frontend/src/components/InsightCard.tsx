import { useState } from 'react';
import { InsightCard as InsightCardType } from '../lib/types';
import StackTrace from './StackTrace';
import { IconExpand, IconCollapse } from './Icons';

interface Props {
  insight: InsightCardType;
  halCorrelation?: string | null;
}

const SEVERITY_STYLES = {
  critical: { badge: 'badge-critical', border: 'border-l-red-500' },
  warning: { badge: 'badge-warning', border: 'border-l-amber-500' },
  info: { badge: 'badge-info', border: 'border-l-green-500' },
};

const SEVERITY_ICONS: Record<string, string> = {
  critical: '!!',
  warning: '!',
  info: 'i',
};

const LINE_STYLES: Record<string, string> = {
  'Subject:': 'text-gray-400',
  'ANR in': 'text-gray-300',
  'Target HAL:': 'text-amber-300/90 font-mono text-xs',
  'Suspected HAL:': 'text-orange-300/80 font-mono text-xs',
  'Blocking chain:': 'text-red-300/80 font-mono text-xs',
  'Deadlock': 'text-red-400 font-medium',
  'Binder pool': 'text-amber-400',
  'Occurred': 'text-gray-500',
};

function DescriptionBlock({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) {
    return <p className="text-gray-300 text-sm">{text}</p>;
  }

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const match = Object.entries(LINE_STYLES).find(([prefix]) => line.startsWith(prefix));
        const cls = match?.[1] ?? 'text-gray-300';
        return (
          <div key={i} className={`text-sm ${cls}`}>{line}</div>
        );
      })}
    </div>
  );
}

const CATEGORY_STYLES: Record<string, string> = {
  root_cause: 'bg-red-500/20 text-red-400',
  symptom: 'bg-amber-500/20 text-amber-400',
  contributing_factor: 'bg-blue-500/20 text-blue-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  root_cause: 'Root Cause',
  symptom: 'Symptom',
  contributing_factor: 'Contributing Factor',
};

function DeepAnalysisBlock({ deepAnalysis }: { deepAnalysis: NonNullable<InsightCardType['deepAnalysis']> }) {
  return (
    <div className="rounded-xl p-4 bg-accent/5 border border-accent/20 space-y-3">
      {/* Header with category badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-accent font-medium text-xs uppercase tracking-wide">
          AI Deep Analysis
        </span>
        <span className="badge-info">{deepAnalysis.confidence}</span>
        {deepAnalysis.category && (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_STYLES[deepAnalysis.category] ?? 'badge-info'}`}>
            {CATEGORY_LABELS[deepAnalysis.category] ?? deepAnalysis.category}
          </span>
        )}
      </div>

      {/* Root Cause */}
      <div>
        <span className="text-xs text-gray-500">Root Cause</span>
        <p className="text-gray-300">{deepAnalysis.rootCause}</p>
      </div>

      {/* Fix Suggestion */}
      <div>
        <span className="text-xs text-gray-500">Fix Suggestion</span>
        <p className="text-gray-300">{deepAnalysis.fixSuggestion}</p>
      </div>

      {/* Impact Assessment */}
      {deepAnalysis.impactAssessment && (
        <div>
          <span className="text-xs text-gray-500">User Impact</span>
          <p className="text-gray-300">{deepAnalysis.impactAssessment}</p>
        </div>
      )}

      {/* Affected Components */}
      {deepAnalysis.affectedComponents && deepAnalysis.affectedComponents.length > 0 && (
        <div>
          <span className="text-xs text-gray-500">Affected Components</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {deepAnalysis.affectedComponents.map((comp, i) => (
              <span key={i} className="text-xs bg-gray-700/50 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                {comp}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evidence (collapsible) */}
      {deepAnalysis.evidence && deepAnalysis.evidence.length > 0 && (
        <details className="group" onClick={(e) => e.stopPropagation()}>
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 select-none">
            Evidence ({deepAnalysis.evidence.length} items) ▸
          </summary>
          <div className="mt-1 p-2 bg-surface rounded space-y-1">
            {deepAnalysis.evidence.map((e, i) => (
              <p key={i} className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{e}</p>
            ))}
          </div>
        </details>
      )}

      {/* Debugging Steps */}
      {deepAnalysis.debuggingSteps && deepAnalysis.debuggingSteps.length > 0 && (
        <div>
          <span className="text-xs text-gray-500">Debugging Steps</span>
          <ol className="mt-1 space-y-1 list-decimal list-inside">
            {deepAnalysis.debuggingSteps.map((step, i) => (
              <li key={i} className="text-xs text-gray-300 font-mono">{step}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Related Insights */}
      {deepAnalysis.relatedInsights && deepAnalysis.relatedInsights.length > 0 && (
        <div>
          <span className="text-xs text-gray-500">Related Insights</span>
          <div className="flex gap-1 mt-1 flex-wrap">
            {deepAnalysis.relatedInsights.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded hover:bg-accent/20 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {id}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InsightCard({ insight, halCorrelation }: Props) {
  const [expanded, setExpanded] = useState(false);
  const styles = SEVERITY_STYLES[insight.severity];

  return (
    <div
      id={insight.id}
      className={`border-l-4 ${styles.border} card p-0 overflow-hidden transition-colors`}
    >
      {/* Header — clickable to expand/collapse */}
      <div
        className="flex items-start gap-3 cursor-pointer hover:bg-surface-hover p-4 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`w-6 h-6 shrink-0 rounded flex items-center justify-center text-xs font-bold ${
          insight.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
          insight.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
          'bg-blue-500/20 text-blue-400'
        }`}>{SEVERITY_ICONS[insight.severity] ?? 'i'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={styles.badge}>{insight.severity}</span>
            <span className="badge-info">{insight.category}</span>
            <span className="badge-info">{insight.source}</span>
            {halCorrelation && (
              <span className="text-xs bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-800/50 shrink-0" title={halCorrelation}>
                HAL down
              </span>
            )}
            {insight.timestamp && (
              <span className="text-xs text-gray-500">{insight.timestamp}</span>
            )}
          </div>
          <h3 className="font-medium mt-1">{insight.title}</h3>
        </div>
        {expanded ? <IconCollapse className="w-4 h-4 text-gray-500" /> : <IconExpand className="w-4 h-4 text-gray-500" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-5 pb-5 space-y-3 text-sm border-t border-border/50 pt-3">
          <DescriptionBlock text={insight.description} />

          {insight.stackTrace && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-600">Stack Trace</span>
              <div className="mt-1">
                <StackTrace frames={insight.stackTrace} />
              </div>
            </div>
          )}

          {insight.relatedLogSnippet && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-600">Related Logs</span>
              <LogSnippet content={insight.relatedLogSnippet} />
            </div>
          )}

          {insight.suggestedAllowRule && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-600">SELinux Allow Rule</span>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 p-2 bg-surface rounded text-xs text-amber-300 font-mono">
                  {insight.suggestedAllowRule}
                </code>
                <button
                  className="shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-surface-hover text-gray-300 rounded-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(insight.suggestedAllowRule!);
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {insight.debugCommands && insight.debugCommands.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-600">Suggested Debug Commands</span>
              <div className="mt-1 space-y-1">
                {insight.debugCommands.map((cmd, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="flex-1 p-1.5 bg-surface rounded text-xs text-green-300 font-mono">
                      {cmd}
                    </code>
                    <button
                      className="shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-surface-hover text-gray-300 rounded-lg transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(cmd);
                      }}
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insight.deepAnalysis && (
            <DeepAnalysisBlock deepAnalysis={insight.deepAnalysis} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Log Snippet with syntax highlighting ──

// Logcat: "03-26 12:43:32.378  1000  1512  1512 I Watchdog: message"
const LOGCAT_RE = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(\S+?)\s*:\s*(.*)$/;
// Kernel dmesg: "[12345.678] message" or "<6>[12345.678] message"
const KERNEL_RE = /^(?:<\d+>)?\[\s*([\d.]+)\]\s+(.*)$/;

function LogSnippet({ content }: { content: string }) {
  const lines = content.split('\n').filter(Boolean);

  return (
    <div className="mt-1 rounded-lg overflow-hidden border border-border/50 bg-[#0a0e17]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono border-collapse">
          <tbody>
            {lines.map((line, i) => {
              const logcat = line.match(LOGCAT_RE);
              if (logcat) {
                const [, ts, , pid, tid, level, tag, msg] = logcat;
                return <LogcatRow key={i} n={i+1} ts={ts} pid={pid} tid={tid} level={level} tag={tag} msg={msg} />;
              }
              const kernel = line.match(KERNEL_RE);
              if (kernel) {
                const [, ts, msg] = kernel;
                return <KernelRow key={i} n={i+1} ts={ts} msg={msg} />;
              }
              return <PlainRow key={i} n={i+1} text={line} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Colors match SearchModal's levelColor/levelBg for consistency
const LEVEL_STYLE: Record<string, { text: string; bg: string }> = {
  F: { text: 'text-red-400',             bg: 'bg-red-950/30' },
  E: { text: 'text-red-400',             bg: 'bg-red-950/30' },
  W: { text: 'text-yellow-400',          bg: 'bg-yellow-950/20' },
  I: { text: 'text-green-400',           bg: '' },
  D: { text: 'text-blue-400',            bg: '' },
  V: { text: 'text-gray-400',            bg: '' },
};

function LogcatRow({ n, ts, pid, tid, level, tag, msg }: {
  n: number; ts: string; pid: string; tid: string; level: string; tag: string; msg: string;
}) {
  const style = LEVEL_STYLE[level] ?? LEVEL_STYLE.D;
  return (
    <tr className={`${style.bg} hover:bg-white/[0.03] transition-colors`}>
      <td className="py-[2px] px-1.5 text-gray-600 whitespace-nowrap">{ts}</td>
      <td className="py-[2px] px-1 text-gray-500 whitespace-nowrap">{pid}/{tid}</td>
      <td className={`py-[2px] px-1 ${style.text} font-semibold whitespace-nowrap`}>{level}/{tag}</td>
      <td className={`py-[2px] px-1.5 ${style.text} whitespace-pre-wrap break-all`}>{msg}</td>
    </tr>
  );
}

function KernelRow({ n, ts, msg }: { n: number; ts: string; msg: string }) {
  const isErr = /error|fail|panic|oops|bug/i.test(msg);
  return (
    <tr className={`${isErr ? 'bg-red-950/25' : ''} hover:bg-white/[0.03] transition-colors`}>
      <td className="py-[2px] px-1.5 text-gray-600 whitespace-nowrap">[{ts}]</td>
      <td colSpan={3} className={`py-[2px] px-1.5 ${isErr ? 'text-red-400' : 'text-gray-300'} whitespace-pre-wrap break-all`}>{msg}</td>
    </tr>
  );
}

function PlainRow({ n, text }: { n: number; text: string }) {
  return (
    <tr className="hover:bg-white/[0.03] transition-colors">
      <td colSpan={4} className="py-[2px] px-1.5 text-gray-400 whitespace-pre-wrap break-all">{text}</td>
    </tr>
  );
}
