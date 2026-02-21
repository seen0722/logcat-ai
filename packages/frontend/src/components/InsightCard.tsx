import { useState } from 'react';
import { InsightCard as InsightCardType } from '../lib/types';
import StackTrace from './StackTrace';

interface Props {
  insight: InsightCardType;
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
    <div className="border border-indigo-500/30 rounded-lg p-3 bg-indigo-500/5 space-y-3">
      {/* Header with category badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-indigo-400 font-medium text-xs uppercase tracking-wide">
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
        <details className="group">
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
                className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded hover:bg-indigo-500/20 transition-colors"
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

export default function InsightCard({ insight }: Props) {
  const [expanded, setExpanded] = useState(false);
  const styles = SEVERITY_STYLES[insight.severity];

  return (
    <div
      id={insight.id}
      className={`card border-l-4 ${styles.border} cursor-pointer transition-colors hover:bg-surface-hover`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
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
            {insight.timestamp && (
              <span className="text-xs text-gray-500">{insight.timestamp}</span>
            )}
          </div>
          <h3 className="font-medium mt-1">{insight.title}</h3>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-3 space-y-3 text-sm">
          <DescriptionBlock text={insight.description} />

          {insight.stackTrace && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Stack Trace</span>
              <div className="mt-1">
                <StackTrace frames={insight.stackTrace} />
              </div>
            </div>
          )}

          {insight.relatedLogSnippet && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Related Logs</span>
              <pre className="mt-1 p-2 bg-surface rounded text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
                {insight.relatedLogSnippet}
              </pre>
            </div>
          )}

          {insight.suggestedAllowRule && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">SELinux Allow Rule</span>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 p-2 bg-surface rounded text-xs text-amber-300 font-mono">
                  {insight.suggestedAllowRule}
                </code>
                <button
                  className="shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
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
              <span className="text-xs text-gray-500 uppercase tracking-wide">Suggested Debug Commands</span>
              <div className="mt-1 space-y-1">
                {insight.debugCommands.map((cmd, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="flex-1 p-1.5 bg-surface rounded text-xs text-green-300 font-mono">
                      {cmd}
                    </code>
                    <button
                      className="shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
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
