import type { PowerDiff as PowerDiffType } from '../../hooks/useComparison';

interface PowerDiffProps {
  powerDiff: PowerDiffType;
}

function deltaSignF(n: number, decimals = 1): string {
  const s = n.toFixed(decimals);
  return n > 0 ? `+${s}` : s;
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

export default function PowerDiffSection({ powerDiff }: PowerDiffProps) {
  if (!powerDiff.present) return null;

  return (
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
  );
}
