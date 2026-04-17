import { deltaColor } from '../../lib/color-utils';
import type { HealthDiffItem, ComparisonResult } from '../../hooks/useComparison';

interface HealthDiffProps {
  healthDiff: ComparisonResult['healthDiff'];
}

function deltaSign(n: number): string {
  return n > 0 ? `+${n}` : String(n);
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

export default function HealthDiff({ healthDiff }: HealthDiffProps) {
  return (
    <section id="section-cmp-health" className="card">
      <h2 className="section-title mb-4">Health Score Comparison</h2>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-28 shrink-0" />
        <div className="flex-1 text-[10px] text-gray-500 uppercase tracking-wider text-center">Before</div>
        <span className="w-10" />
        <div className="flex-1 text-[10px] text-gray-500 uppercase tracking-wider text-center">After</div>
      </div>
      <div className="divide-y divide-border/30">
        <DiffBar label="Stability" item={healthDiff.stability} />
        <DiffBar label="Memory" item={healthDiff.memory} />
        <DiffBar label="Responsiveness" item={healthDiff.responsiveness} />
        <DiffBar label="Kernel" item={healthDiff.kernel} />
      </div>
    </section>
  );
}
