import { useState } from 'react';
import { ComparisonResult, ComparisonInsight } from '../hooks/useComparison';
import { severityBadge, statusColor } from '../lib/color-utils';
import ComparisonHero from './comparison/ComparisonHero';
import HealthDiff from './comparison/HealthDiff';
import PowerDiffSection from './comparison/PowerDiff';
import TelephonyDiffSection from './comparison/TelephonyDiff';

interface Props {
  comparison: ComparisonResult;
  onBack: () => void;
}

// ── Insight Row ──
function InsightRow({ insight }: { insight: ComparisonInsight }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${severityBadge(insight.severity)}`}>
        {insight.severity}
      </span>
      <span className="text-sm text-gray-200">{insight.title}</span>
      <span className="text-xs text-gray-500 ml-auto shrink-0">{insight.category}</span>
    </div>
  );
}

// ── Main Component ──

export default function ComparisonPage({ comparison, onBack }: Props) {
  const { insightDiff, anrDiff, halDiff, powerDiff, telephonyDiff } = comparison;
  const [showPersistent, setShowPersistent] = useState(false);

  const hasInsightChanges = insightDiff.resolved.length > 0 || insightDiff.newIssues.length > 0;
  const hasANRChanges = anrDiff.resolved.length > 0 || anrDiff.newIssues.length > 0;
  const hasHALChanges = halDiff.changes.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 -mx-6 md:-mx-10 px-6 md:px-10 py-3 glass">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="btn-ghost text-sm px-3 py-1.5">
              &larr; Back to Analysis
            </button>
            <h1 className="font-display text-lg">
              Comparison <span className="text-warm">Report</span>
            </h1>
          </div>
        </div>
      </div>

      {/* ── Section 1: Hero Summary ── */}
      <ComparisonHero comparison={comparison} />

      {/* ── Section 2: Health Dimensions ── */}
      <HealthDiff healthDiff={comparison.healthDiff} />

      {/* ── Section 3: Key Changes ── */}
      <section id="section-cmp-changes" className="card">
        <h2 className="section-title mb-4">Insight Changes</h2>

        {!hasInsightChanges && insightDiff.persistent.length === 0 && (
          <p className="text-gray-500 text-sm">No insights in either analysis.</p>
        )}

        {/* New Issues (show first — bad news is more important) */}
        {insightDiff.newIssues.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-sm font-medium text-red-400">
                New Issues ({insightDiff.newIssues.length})
              </span>
            </div>
            <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3 space-y-1.5">
              {insightDiff.newIssues.map((ins, i) => (
                <InsightRow key={i} insight={ins} />
              ))}
            </div>
          </div>
        )}

        {/* Resolved */}
        {insightDiff.resolved.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-green-400">
                Resolved ({insightDiff.resolved.length})
              </span>
            </div>
            <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-3 space-y-1.5">
              {insightDiff.resolved.map((ins, i) => (
                <InsightRow key={i} insight={ins} />
              ))}
            </div>
          </div>
        )}

        {/* Persistent (collapsed by default) */}
        {insightDiff.persistent.length > 0 && (
          <div>
            <button
              onClick={() => setShowPersistent(!showPersistent)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span>Persistent ({insightDiff.persistent.length})</span>
              <span className={`transition-transform ${showPersistent ? 'rotate-180' : ''}`}>&#x25BC;</span>
            </button>
            {showPersistent && (
              <div className="mt-2 bg-surface border border-border rounded-lg p-3 space-y-1.5">
                {insightDiff.persistent.map((ins, i) => (
                  <InsightRow key={i} insight={ins} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 4: Power Diff ── */}
      <PowerDiffSection powerDiff={powerDiff} />

      {/* ── Section 5: Telephony Diff ── */}
      <TelephonyDiffSection telephonyDiff={telephonyDiff} />

      {/* ── Section 6: HAL Changes ── */}
      <section id="section-cmp-hal" className="card">
        <h2 className="section-title mb-4">HAL Status Changes</h2>
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
                  <tr key={change.familyName} className="border-t border-border">
                    <td className="py-2 px-3 text-gray-200 text-sm font-mono truncate max-w-xs" title={change.familyName}>
                      {change.familyName}
                    </td>
                    <td className={`py-2 px-3 text-center text-sm ${statusColor(change.leftStatus)}`}>
                      {change.leftStatus}
                    </td>
                    <td className="py-2 px-3 text-center text-gray-500">&rarr;</td>
                    <td className={`py-2 px-3 text-center text-sm ${statusColor(change.rightStatus)}`}>
                      {change.rightStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 7: ANR Changes ── */}
      <section id="section-cmp-anr" className="card">
        <h2 className="section-title mb-4">ANR Process Changes</h2>
        {!hasANRChanges && anrDiff.persistent.length === 0 && (
          <p className="text-gray-500 text-sm">No ANRs in either analysis.</p>
        )}
        <div className="flex flex-wrap gap-4">
          {anrDiff.newIssues.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-sm font-medium text-red-400">New ({anrDiff.newIssues.length})</span>
              </div>
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                {anrDiff.newIssues.map((name) => (
                  <div key={name} className="text-sm text-gray-200 py-0.5 font-mono">{name}</div>
                ))}
              </div>
            </div>
          )}
          {anrDiff.resolved.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm font-medium text-green-400">Resolved ({anrDiff.resolved.length})</span>
              </div>
              <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-3">
                {anrDiff.resolved.map((name) => (
                  <div key={name} className="text-sm text-gray-200 py-0.5 font-mono">{name}</div>
                ))}
              </div>
            </div>
          )}
          {anrDiff.persistent.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-sm font-medium text-gray-400">Persistent ({anrDiff.persistent.length})</span>
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

      {/* Bottom spacing */}
      <div className="h-8" />
    </div>
  );
}
