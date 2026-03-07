import { useState, useEffect } from 'react';
import { ComparisonResult, HealthDiffItem, ComparisonInsight, HALChange } from '../hooks/useComparison';

interface Props {
  comparison: ComparisonResult;
  onClose: () => void;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-green-400';
  if (delta < 0) return 'text-red-400';
  return 'text-gray-400';
}

function deltaSign(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function severityBadge(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-900/50 text-red-300 border-red-700/50';
    case 'warning': return 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50';
    case 'info': return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
    default: return 'bg-gray-800 text-gray-300 border-gray-700';
  }
}

function HealthRow({ label, item }: { label: string; item: HealthDiffItem }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2 px-3 text-gray-300 font-medium">{label}</td>
      <td className="py-2 px-3 text-center">{item.left}</td>
      <td className="py-2 px-3 text-center">{item.right}</td>
      <td className={`py-2 px-3 text-center font-semibold ${deltaColor(item.delta)}`}>
        {deltaSign(item.delta)}
      </td>
    </tr>
  );
}

function InsightItem({ insight }: { insight: ComparisonInsight }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`text-xs px-1.5 py-0.5 rounded border ${severityBadge(insight.severity)}`}>
        {insight.severity}
      </span>
      <span className="text-sm text-gray-200">{insight.title}</span>
      <span className="text-xs text-gray-500 ml-auto">{insight.category}</span>
    </div>
  );
}

function HALChangeRow({ change }: { change: HALChange }) {
  function statusColor(status: string): string {
    if (status === 'alive') return 'text-green-400';
    if (status === 'non-responsive') return 'text-red-400';
    if (status === 'declared') return 'text-yellow-400';
    if (status === 'absent') return 'text-gray-500';
    return 'text-gray-400';
  }

  return (
    <tr className="border-t border-border">
      <td className="py-2 px-3 text-gray-200 text-sm font-mono truncate max-w-xs" title={change.familyName}>
        {change.familyName}
      </td>
      <td className={`py-2 px-3 text-center text-sm ${statusColor(change.leftStatus)}`}>
        {change.leftStatus}
      </td>
      <td className="py-2 px-3 text-center text-gray-500">-&gt;</td>
      <td className={`py-2 px-3 text-center text-sm ${statusColor(change.rightStatus)}`}>
        {change.rightStatus}
      </td>
    </tr>
  );
}

export default function ComparisonView({ comparison, onClose }: Props) {
  const { healthDiff, insightDiff, anrDiff, halDiff } = comparison;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const hasInsightChanges = insightDiff.resolved.length > 0 || insightDiff.newIssues.length > 0;
  const hasANRChanges = anrDiff.resolved.length > 0 || anrDiff.newIssues.length > 0;
  const hasHALChanges = halDiff.changes.length > 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 transition-colors duration-200 ${visible ? 'bg-black/80' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-4xl bg-[#0d1117] border border-gray-700/60 rounded-xl shadow-2xl mx-4 transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60">
          <h2 className="text-lg font-semibold text-gray-100">
            Comparison: <span className="font-mono text-indigo-400">{shortId(comparison.leftId)}</span>
            {' '}vs{' '}
            <span className="font-mono text-indigo-400">{shortId(comparison.rightId)}</span>
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Health Score Diff */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Health Score Comparison
            </h3>
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs uppercase">
                    <th className="py-2 px-3 text-left">Dimension</th>
                    <th className="py-2 px-3 text-center">Left (Before)</th>
                    <th className="py-2 px-3 text-center">Right (After)</th>
                    <th className="py-2 px-3 text-center">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <HealthRow label="Overall" item={healthDiff.overall} />
                  <HealthRow label="Stability" item={healthDiff.stability} />
                  <HealthRow label="Memory" item={healthDiff.memory} />
                  <HealthRow label="Responsiveness" item={healthDiff.responsiveness} />
                  <HealthRow label="Kernel" item={healthDiff.kernel} />
                </tbody>
              </table>
            </div>
          </section>

          {/* Insight Changes */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Insight Changes
            </h3>

            {!hasInsightChanges && insightDiff.persistent.length === 0 && (
              <p className="text-gray-500 text-sm">No insights in either analysis.</p>
            )}

            {insightDiff.resolved.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm font-medium text-green-400">
                    Resolved ({insightDiff.resolved.length})
                  </span>
                </div>
                <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-3 space-y-1">
                  {insightDiff.resolved.map((ins, i) => (
                    <InsightItem key={i} insight={ins} />
                  ))}
                </div>
              </div>
            )}

            {insightDiff.newIssues.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-sm font-medium text-red-400">
                    New Issues ({insightDiff.newIssues.length})
                  </span>
                </div>
                <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3 space-y-1">
                  {insightDiff.newIssues.map((ins, i) => (
                    <InsightItem key={i} insight={ins} />
                  ))}
                </div>
              </div>
            )}

            {insightDiff.persistent.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-sm font-medium text-gray-400">
                    Persistent ({insightDiff.persistent.length})
                  </span>
                </div>
                <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
                  {insightDiff.persistent.map((ins, i) => (
                    <InsightItem key={i} insight={ins} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ANR Changes */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              ANR Process Changes
            </h3>

            {!hasANRChanges && anrDiff.persistent.length === 0 && (
              <p className="text-gray-500 text-sm">No ANRs in either analysis.</p>
            )}

            <div className="flex flex-wrap gap-4">
              {anrDiff.resolved.length > 0 && (
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-sm font-medium text-green-400">Resolved</span>
                  </div>
                  <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-3">
                    {anrDiff.resolved.map((name) => (
                      <div key={name} className="text-sm text-gray-200 py-0.5 font-mono">{name}</div>
                    ))}
                  </div>
                </div>
              )}

              {anrDiff.newIssues.length > 0 && (
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-sm font-medium text-red-400">New</span>
                  </div>
                  <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                    {anrDiff.newIssues.map((name) => (
                      <div key={name} className="text-sm text-gray-200 py-0.5 font-mono">{name}</div>
                    ))}
                  </div>
                </div>
              )}

              {anrDiff.persistent.length > 0 && (
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="text-sm font-medium text-gray-400">Persistent</span>
                  </div>
                  <div className="bg-surface border border-border rounded-lg p-3">
                    {anrDiff.persistent.map((name) => (
                      <div key={name} className="text-sm text-gray-200 py-0.5 font-mono">{name}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* HAL Changes */}
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              HAL Status Changes
            </h3>

            {!hasHALChanges ? (
              <p className="text-gray-500 text-sm">No HAL status changes detected.</p>
            ) : (
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="py-2 px-3 text-left">HAL Family</th>
                      <th className="py-2 px-3 text-center">Before</th>
                      <th className="py-2 px-3 text-center" />
                      <th className="py-2 px-3 text-center">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {halDiff.changes.map((change) => (
                      <HALChangeRow key={change.familyName} change={change} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
