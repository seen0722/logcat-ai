import type { TelephonyDiff as TelephonyDiffType } from '../../hooks/useComparison';

interface TelephonyDiffProps {
  telephonyDiff: TelephonyDiffType;
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

export default function TelephonyDiffSection({ telephonyDiff }: TelephonyDiffProps) {
  if (!telephonyDiff.present) return null;

  return (
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
  );
}
