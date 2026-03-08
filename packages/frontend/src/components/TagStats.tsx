import { useState } from 'react';
import { TagStat, TagClassification } from '../lib/types';

interface Props {
  tagStats: TagStat[];
  onTagClick?: (tag: string) => void;
}

const classificationConfig: Record<TagClassification, { label: string; text: string; bg: string; bar: string }> = {
  vendor: { label: 'Vendor', text: 'text-amber-400', bg: 'bg-amber-500/15', bar: 'bg-amber-500' },
  framework: { label: 'Framework', text: 'text-purple-400', bg: 'bg-purple-500/15', bar: 'bg-purple-500' },
  app: { label: 'App', text: 'text-cyan-400', bg: 'bg-cyan-500/15', bar: 'bg-cyan-500' },
};

/** Common Android tags with brief explanations */
const TAG_HINTS: Record<string, string> = {
  crash_dump64: 'Native crash dump handler (64-bit)',
  crash_dump32: 'Native crash dump handler (32-bit)',
  lowmemorykiller: 'Low memory killer daemon',
  ActivityManager: 'Android activity lifecycle manager',
  WindowManager: 'Window and display management',
  PackageManager: 'App package installation/management',
  InputDispatcher: 'Touch/key input event dispatcher',
  ServiceManager: 'Binder service registry',
  SurfaceFlinger: 'Display compositor service',
  AudioFlinger: 'Audio mixing and routing service',
  Zygote: 'App process forking daemon',
  SystemServer: 'Core Android system services',
  Watchdog: 'System server hang detector',
  SELinux: 'Mandatory access control policy',
  eiak: 'Vendor-specific error/event tag',
  PowerManagerService: 'Power state and wake lock management',
  BatteryStatsService: 'Battery usage tracking service',
  ConnectivityService: 'Network connectivity management',
  HealthService: 'Hardware health monitoring HAL',
};

export default function TagStats({ tagStats, onTagClick }: Props) {
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
              className={`${classificationConfig[s.classification].bar} transition-all duration-500 first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${Math.max(s.pct, 2)}%` }}
              title={`${classificationConfig[s.classification].label}: ${s.count} (${s.pct.toFixed(0)}%)`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
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
          const hint = TAG_HINTS[t.tag];
          const tooltip = hint
            ? `${t.tag}: ${hint}${onTagClick ? ' (click to search)' : ''}`
            : onTagClick ? `Click to search "${t.tag}" logs` : t.tag;
          return (
            <div
              key={t.tag}
              className={`flex items-center gap-2 text-sm group${onTagClick ? ' cursor-pointer hover:bg-surface-hover rounded-md px-1 -mx-1 transition-colors' : ''}`}
              onClick={onTagClick ? () => onTagClick(t.tag) : undefined}
              title={tooltip}
            >
              <span className="text-gray-600 w-5 text-right text-xs shrink-0">{i + 1}</span>
              <span className={`${cfg.bg} ${cfg.text} text-xs font-medium px-1.5 py-0.5 rounded shrink-0 w-20 text-center`}>
                {cfg.label}
              </span>
              <span className="truncate text-gray-300 min-w-0 w-24 sm:w-56 shrink-0">
                {t.tag}
                {hint && <span className="text-gray-600 text-xs ml-1.5 hidden group-hover:inline">({hint})</span>}
              </span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
                  <div
                    className={`${cfg.bar} h-full rounded-full transition-all duration-500`}
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

      {/* Vendor Error Tags */}
      {(() => {
        const vendorTags = tagStats.filter(t => t.classification === 'vendor');
        if (vendorTags.length === 0) return null;
        return (
          <div className="pt-3 border-t border-border space-y-2">
            <h3 className="text-sm font-semibold text-gray-400">Vendor Error Tags ({vendorTags.length})</h3>
            <div className="flex flex-wrap gap-2">
              {vendorTags.slice(0, 15).map((t) => (
                <span
                  key={t.tag}
                  className={`text-xs bg-amber-900/20 text-amber-400 px-2 py-0.5 rounded font-mono${onTagClick ? ' cursor-pointer hover:bg-amber-900/40 transition-colors' : ''}`}
                  title={`${t.count} occurrences`}
                  onClick={onTagClick ? () => onTagClick(t.tag) : undefined}
                >
                  {t.tag} <span className="text-amber-500/60">{t.count}</span>
                </span>
              ))}
              {vendorTags.length > 15 && (
                <span className="text-xs text-gray-600">+{vendorTags.length - 15} more</span>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
