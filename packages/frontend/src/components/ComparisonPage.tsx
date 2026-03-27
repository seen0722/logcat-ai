import { useState } from 'react';
import { ComparisonResult, HealthDiffItem, ComparisonInsight, HALChange } from '../hooks/useComparison';

interface Props {
  comparison: ComparisonResult;
  onBack: () => void;
}

// ── Helpers ──

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-green-400';
  if (delta < 0) return 'text-red-400';
  return 'text-gray-400';
}

function deltaSign(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function deltaSignF(n: number, decimals = 1): string {
  const s = n.toFixed(decimals);
  return n > 0 ? `+${s}` : s;
}

function formatMs(ms: number): string {
  if (ms <= 0) return '0s';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso?: string): string {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function severityBadge(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-900/50 text-red-300 border-red-700/50';
    case 'warning': return 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50';
    case 'info': return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
    default: return 'bg-gray-800 text-gray-300 border-gray-700';
  }
}

function statusColor(status: string): string {
  if (status === 'alive') return 'text-green-400';
  if (status === 'non-responsive') return 'text-red-400';
  if (status === 'declared') return 'text-yellow-400';
  if (status === 'absent') return 'text-gray-500';
  return 'text-gray-400';
}

// ── Sub-components ──

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-gray-800" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${c * pct} ${c * (1 - pct)}`} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xl font-bold text-gray-100">{score}</span>
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function DiffBar({ label, item }: { label: string; item: HealthDiffItem }) {
  const leftColor = item.left >= 80 ? 'bg-green-500' : item.left >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  const rightColor = item.right >= 80 ? 'bg-green-500' : item.right >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-28 text-sm text-gray-300 shrink-0">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <span className="text-sm text-gray-400 w-8 text-right">{item.left}</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${leftColor}`} style={{ width: `${item.left}%` }} />
        </div>
      </div>
      <span className={`text-sm font-semibold w-10 text-center ${deltaColor(item.delta)}`}>
        {deltaSign(item.delta)}
      </span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${rightColor}`} style={{ width: `${item.right}%` }} />
        </div>
        <span className="text-sm text-gray-400 w-8">{item.right}</span>
      </div>
    </div>
  );
}

function MetricDiffCard({ label, left, right, delta, unit, lowerIsBetter }: {
  label: string; left: string; right: string; delta: number; unit?: string; lowerIsBetter?: boolean;
}) {
  const effectiveDelta = lowerIsBetter ? -delta : delta;
  const color = effectiveDelta > 0.01 ? 'text-green-400' : effectiveDelta < -0.01 ? 'text-red-400' : 'text-gray-400';
  return (
    <div className="bg-surface border border-border/50 rounded-xl p-4">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-lg text-gray-300">{left}</span>
          <span className="text-gray-600 mx-2">&rarr;</span>
          <span className="text-lg text-gray-100 font-semibold">{right}</span>
          {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
        </div>
        <span className={`text-sm font-semibold ${color}`}>{deltaSignF(delta)}</span>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function ComparisonPage({ comparison, onBack }: Props) {
  const { metadataDiff, healthDiff, insightDiff, anrDiff, halDiff, powerDiff, telephonyDiff } = comparison;
  const [showPersistent, setShowPersistent] = useState(false);

  const hasInsightChanges = insightDiff.resolved.length > 0 || insightDiff.newIssues.length > 0;
  const hasANRChanges = anrDiff.resolved.length > 0 || anrDiff.newIssues.length > 0;
  const hasHALChanges = halDiff.changes.length > 0;
  const overall = healthDiff.overall;

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
      <section id="section-cmp-hero" className="card p-0 overflow-hidden">
        {/* Device metadata side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr]">
          {/* Left device */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Before (Left)</div>
            <div className="text-lg font-display text-gray-100">{metadataDiff.left.deviceModel}</div>
            <div className="text-xs text-gray-400">{metadataDiff.left.manufacturer}</div>
            <div className="mt-2 space-y-0.5 text-xs text-gray-500">
              <div>Android {metadataDiff.left.androidVersion} · {metadataDiff.left.buildType}</div>
              <div className="font-mono truncate" title={metadataDiff.left.buildFingerprint}>{metadataDiff.left.buildFingerprint.split('/').slice(-1)[0]}</div>
              {metadataDiff.left.bugreportTimestamp && <div>{formatDate(metadataDiff.left.bugreportTimestamp)}</div>}
            </div>
          </div>

          {/* Center: Overall score delta */}
          <div className="flex flex-col items-center justify-center px-6 py-5 bg-surface/50">
            <div className="flex items-center gap-4">
              <div className="relative"><ScoreRing score={overall.left} label="Before" /></div>
              <div className="flex flex-col items-center">
                <span className="text-gray-600 text-lg">&rarr;</span>
                <span className={`text-2xl font-bold ${deltaColor(overall.delta)}`}>
                  {deltaSign(overall.delta)}
                </span>
              </div>
              <div className="relative"><ScoreRing score={overall.right} label="After" /></div>
            </div>
            {/* Quick stats */}
            <div className="flex gap-4 mt-4 text-xs">
              {insightDiff.resolved.length > 0 && (
                <span className="flex items-center gap-1 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {insightDiff.resolved.length} resolved
                </span>
              )}
              {insightDiff.newIssues.length > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {insightDiff.newIssues.length} new
                </span>
              )}
              {insightDiff.persistent.length > 0 && (
                <span className="flex items-center gap-1 text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  {insightDiff.persistent.length} persistent
                </span>
              )}
            </div>
          </div>

          {/* Right device */}
          <div className="p-5 border-t md:border-t-0 md:border-l border-border/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">After (Right)</div>
            <div className="text-lg font-display text-gray-100">{metadataDiff.right.deviceModel}</div>
            <div className="text-xs text-gray-400">{metadataDiff.right.manufacturer}</div>
            <div className="mt-2 space-y-0.5 text-xs text-gray-500">
              <div>Android {metadataDiff.right.androidVersion} · {metadataDiff.right.buildType}</div>
              <div className="font-mono truncate" title={metadataDiff.right.buildFingerprint}>{metadataDiff.right.buildFingerprint.split('/').slice(-1)[0]}</div>
              {metadataDiff.right.bugreportTimestamp && <div>{formatDate(metadataDiff.right.bugreportTimestamp)}</div>}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Health Dimensions ── */}
      <section id="section-cmp-health" className="card">
        <h2 className="section-title mb-4">Health Score Comparison</h2>
        <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-wider mb-1 px-[calc(7rem+0.75rem)]">
          <span>Before</span>
          <span>After</span>
        </div>
        <div className="divide-y divide-border/30">
          <DiffBar label="Stability" item={healthDiff.stability} />
          <DiffBar label="Memory" item={healthDiff.memory} />
          <DiffBar label="Responsiveness" item={healthDiff.responsiveness} />
          <DiffBar label="Kernel" item={healthDiff.kernel} />
        </div>
      </section>

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
      {powerDiff.present && (
        <section id="section-cmp-power" className="card">
          <h2 className="section-title mb-4">Power Management</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {powerDiff.dozeRateMahPerHr && (
              <MetricDiffCard
                label="Deep Doze Rate"
                left={powerDiff.dozeRateMahPerHr.left.toFixed(1)}
                right={powerDiff.dozeRateMahPerHr.right.toFixed(1)}
                delta={powerDiff.dozeRateMahPerHr.delta}
                unit="mAh/h"
                lowerIsBetter
              />
            )}
            {powerDiff.suspendSuccessPercent && (
              <MetricDiffCard
                label="Suspend Success"
                left={`${powerDiff.suspendSuccessPercent.left.toFixed(0)}%`}
                right={`${powerDiff.suspendSuccessPercent.right.toFixed(0)}%`}
                delta={powerDiff.suspendSuccessPercent.delta}
              />
            )}
            {powerDiff.deepDozePercent && (
              <MetricDiffCard
                label="Deep Doze Time"
                left={`${powerDiff.deepDozePercent.left.toFixed(1)}%`}
                right={`${powerDiff.deepDozePercent.right.toFixed(1)}%`}
                delta={powerDiff.deepDozePercent.delta}
              />
            )}
            {powerDiff.totalDischargeMah && (
              <MetricDiffCard
                label="Total Discharge"
                left={powerDiff.totalDischargeMah.left.toFixed(0)}
                right={powerDiff.totalDischargeMah.right.toFixed(0)}
                delta={powerDiff.totalDischargeMah.delta}
                unit="mAh"
                lowerIsBetter
              />
            )}
          </div>
        </section>
      )}

      {/* ── Section 5: Telephony Diff ── */}
      {telephonyDiff.present && (
        <section id="section-cmp-telephony" className="card">
          <h2 className="section-title mb-4">Telephony</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {telephonyDiff.totalOosMs && (
              <MetricDiffCard
                label="OOS Duration"
                left={formatMs(telephonyDiff.totalOosMs.left)}
                right={formatMs(telephonyDiff.totalOosMs.right)}
                delta={telephonyDiff.totalOosMs.delta / 60000}
                unit="min"
                lowerIsBetter
              />
            )}
            {telephonyDiff.oosPercentage && (
              <MetricDiffCard
                label="OOS Percentage"
                left={`${telephonyDiff.oosPercentage.left.toFixed(1)}%`}
                right={`${telephonyDiff.oosPercentage.right.toFixed(1)}%`}
                delta={telephonyDiff.oosPercentage.delta}
                lowerIsBetter
              />
            )}
            {telephonyDiff.rilErrorCount && (
              <MetricDiffCard
                label="RIL Errors"
                left={String(telephonyDiff.rilErrorCount.left)}
                right={String(telephonyDiff.rilErrorCount.right)}
                delta={telephonyDiff.rilErrorCount.delta}
                lowerIsBetter
              />
            )}
            {telephonyDiff.modemRestartCount && (
              <MetricDiffCard
                label="Modem Restarts"
                left={String(telephonyDiff.modemRestartCount.left)}
                right={String(telephonyDiff.modemRestartCount.right)}
                delta={telephonyDiff.modemRestartCount.delta}
                lowerIsBetter
              />
            )}
            {telephonyDiff.signalLevel && (
              <MetricDiffCard
                label="Signal Level"
                left={`Lv ${telephonyDiff.signalLevel.left}`}
                right={`Lv ${telephonyDiff.signalLevel.right}`}
                delta={telephonyDiff.signalLevel.delta}
              />
            )}
          </div>
        </section>
      )}

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
