import { useState } from 'react';
import { InsightCard as InsightCardType, Severity } from '../lib/types';
import InsightCard from './InsightCard';

interface Props {
  insights: InsightCardType[];
}

const FILTERS: { key: Severity | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
];

export default function InsightsCards({ insights }: Props) {
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  const criticalCount = insights.filter((i) => i.severity === 'critical').length;
  const warningCount = insights.filter((i) => i.severity === 'warning').length;
  const infoCount = insights.filter((i) => i.severity === 'info').length;

  const filtered = filter === 'all' ? insights : insights.filter((i) => i.severity === filter);

  const countFor = (key: string) =>
    key === 'critical' ? criticalCount : key === 'warning' ? warningCount : key === 'info' ? infoCount : insights.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Insights <span className="text-gray-500 text-sm font-normal">({filtered.length})</span>
        </h2>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => {
            const count = countFor(f.key);
            if (f.key !== 'all' && count === 0) return null;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  active
                    ? f.key === 'critical' ? 'bg-red-500/20 text-red-400'
                    : f.key === 'warning' ? 'bg-amber-500/20 text-amber-400'
                    : f.key === 'info' ? 'bg-green-500/20 text-green-400'
                    : 'bg-indigo-500/20 text-indigo-400'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-surface'
                }`}
              >
                {f.label} {count > 0 && <span className="ml-1">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card text-center text-gray-500 py-8">
          {filter === 'all'
            ? 'No issues detected. The system appears healthy.'
            : `No ${filter} issues found.`}
        </div>
      )}
    </div>
  );
}
