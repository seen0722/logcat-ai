import { useState } from 'react';
import { TagStat, TagClassification } from '../lib/types';

interface Props {
  tagStats: TagStat[];
}

const classificationConfig: Record<TagClassification, { label: string; text: string; bg: string; bar: string }> = {
  vendor: { label: 'Vendor', text: 'text-amber-400', bg: 'bg-amber-500/15', bar: 'bg-amber-500' },
  framework: { label: 'Framework', text: 'text-blue-400', bg: 'bg-blue-500/15', bar: 'bg-blue-500' },
  app: { label: 'App', text: 'text-green-400', bg: 'bg-green-500/15', bar: 'bg-green-500' },
};

export default function TagStats({ tagStats }: Props) {
  const [expanded, setExpanded] = useState(false);

  const maxCount = tagStats[0]?.count ?? 1;
  const displayedTags = expanded ? tagStats : tagStats.slice(0, 10);

  // Aggregate counts by classification for the stacked bar
  const totals = tagStats.reduce(
    (acc, t) => {
      acc[t.classification] = (acc[t.classification] || 0) + t.count;
      return acc;
    },
    {} as Record<TagClassification, number>,
  );
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0) || 1;

  const segments: { classification: TagClassification; count: number; pct: number }[] = (
    ['vendor', 'framework', 'app'] as TagClassification[]
  )
    .filter((c) => totals[c] > 0)
    .map((c) => ({ classification: c, count: totals[c], pct: (totals[c] / grandTotal) * 100 }));

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">Top Error/Fatal Tags</h2>

      {/* Stacked bar */}
      <div className="space-y-2">
        <div className="flex h-3 rounded-full overflow-hidden">
          {segments.map((s) => (
            <div
              key={s.classification}
              className={`${classificationConfig[s.classification].bar} transition-all duration-500`}
              style={{ width: `${s.pct}%` }}
              title={`${classificationConfig[s.classification].label}: ${s.count} (${s.pct.toFixed(0)}%)`}
            />
          ))}
        </div>
        <div className="flex gap-4 text-xs text-gray-400">
          {segments.map((s) => {
            const cfg = classificationConfig[s.classification];
            return (
              <span key={s.classification} className="flex items-center gap-1.5">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${cfg.bar}`} />
                <span className={cfg.text}>{cfg.label}</span>
                <span className="text-gray-500">{s.count} ({s.pct.toFixed(0)}%)</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Tag ranking list */}
      <div className="space-y-1.5">
        {displayedTags.map((t, i) => {
          const cfg = classificationConfig[t.classification];
          const barWidth = (t.count / maxCount) * 100;
          return (
            <div key={t.tag} className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 w-5 text-right text-xs shrink-0">{i + 1}</span>
              <span className={`${cfg.bg} ${cfg.text} text-xs font-medium px-1.5 py-0.5 rounded shrink-0 w-20 text-center`}>
                {cfg.label}
              </span>
              <span className="truncate text-gray-300 min-w-0 w-56 shrink-0" title={t.tag}>{t.tag}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 bg-surface rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${cfg.bar} opacity-80 h-full rounded-full transition-all duration-500`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-gray-400 text-xs w-10 text-right shrink-0">{t.count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {tagStats.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${tagStats.length} tags`}
        </button>
      )}
    </div>
  );
}
