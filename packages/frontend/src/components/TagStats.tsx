import { useState } from 'react';
import { TagStat, TagClassification } from '../lib/types';
import { IconClassification } from './Icons';
import TabSectionHeader from './shared/TabSectionHeader';
import MetricCard from './shared/MetricCard';
import StatusBadge from './shared/StatusBadge';
import DetailsToggle from './shared/DetailsToggle';

interface Props {
  tagStats: TagStat[];
  onTagClick?: (tag: string) => void;
}

const classificationConfig: Record<TagClassification, { label: string; text: string; bg: string; iconColor: string }> = {
  vendor: { label: 'Vendor', text: 'text-warm', bg: 'bg-warm/10', iconColor: 'text-warm/60' },
  framework: { label: 'Framework', text: 'text-accent-light', bg: 'bg-accent/10', iconColor: 'text-accent/60' },
  app: { label: 'App', text: 'text-gray-400', bg: 'bg-gray-500/10', iconColor: 'text-gray-500' },
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

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

interface TagRowProps {
  tag: TagStat;
  index: number;
  maxCount: number;
  isTop3: boolean;
  onTagClick?: (tag: string) => void;
}

function TagRow({ tag: t, index, maxCount, isTop3, onTagClick }: TagRowProps) {
  const cfg = classificationConfig[t.classification];
  const barWidth = (t.count / maxCount) * 100;
  const hint = TAG_HINTS[t.tag];
  const isVendor = t.classification === 'vendor';
  const tooltip = hint
    ? `${t.tag}: ${hint}${onTagClick ? ' (click to search)' : ''}`
    : onTagClick ? `Click to search "${t.tag}" logs` : t.tag;

  return (
    <div
      className={`flex items-center gap-2 py-1.5 text-sm group rounded-lg transition-all duration-200 ${
        onTagClick ? 'cursor-pointer hover:bg-surface-hover px-2 -mx-2' : ''
      } ${isVendor ? 'hover:bg-warm/5' : ''}`}
      onClick={onTagClick ? () => onTagClick(t.tag) : undefined}
      title={tooltip}
    >
      <span className={`w-5 text-right text-xs shrink-0 font-mono ${isTop3 ? 'text-gray-400 font-medium' : 'text-gray-600'}`}>
        {index + 1}
      </span>
      <span className={`${cfg.bg} ${cfg.text} text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 min-w-[68px] text-center border ${
        isVendor ? 'border-warm/20' : t.classification === 'framework' ? 'border-accent/20' : 'border-transparent'
      }`}>
        {cfg.label}
      </span>
      <span className={`truncate min-w-0 w-28 sm:w-56 shrink-0 font-mono text-xs ${
        isTop3 ? 'text-gray-200 font-medium' : 'text-gray-400'
      }`}>
        {t.tag}
        {hint && <span className="text-gray-600 font-sans text-[10px] ml-1.5 hidden group-hover:inline">({hint})</span>}
      </span>
      <div className="flex-1 flex items-center gap-2.5">
        <div className="flex-1 bg-surface rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${barWidth}%`,
              background: isVendor ? '#d4a06a'
                : t.classification === 'framework' ? '#4f8ff7'
                : isTop3 ? '#6b7280' : '#4b5563',
              opacity: isTop3 ? 1 : 0.5,
            }}
          />
        </div>
        <span className={`text-xs w-12 text-right shrink-0 font-mono ${
          isTop3 ? 'text-gray-300 font-medium' : 'text-gray-500'
        }`}>
          {formatCount(t.count)}
        </span>
      </div>
    </div>
  );
}

export default function TagStats({ tagStats, onTagClick }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  const maxCount = tagStats[0]?.count ?? 1;

  // Aggregate counts by classification
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

  const vendorCount = tagStats.filter(t => t.classification === 'vendor').length;
  const topTags = tagStats.slice(0, 10);

  const badges = (
    <>
      {vendorCount > 0 && <StatusBadge variant="warm">{vendorCount} vendor tags</StatusBadge>}
      <StatusBadge variant="gray">{tagStats.length} total tags</StatusBadge>
    </>
  );

  const heroRight = (
    <div>
      <div className="text-3xl font-bold text-gray-200">{formatCount(grandTotal)}</div>
      <div className="text-xs text-gray-500">total entries</div>
    </div>
  );

  // Vendor tags not in top 10
  const visibleTags = new Set(topTags.map(t => t.tag));
  const hiddenVendorTags = tagStats.filter(t => t.classification === 'vendor' && !visibleTags.has(t.tag));

  return (
    <div className="space-y-4">
      <TabSectionHeader
        title="Top Error/Fatal Tags"
        gradient="from-warm/8 to-warm/2"
        borderColor="border-warm/15"
        badges={badges}
        rightContent={heroRight}
      >
        {/* Summary cards — vendor / framework / app */}
        <div className="grid grid-cols-3 gap-3">
          {segments.map((s) => {
            const cfg = classificationConfig[s.classification];
            return (
              <MetricCard
                key={s.classification}
                icon={<IconClassification className={`w-4 h-4 ${cfg.iconColor}`} />}
                label={cfg.label}
                value={formatCount(s.count)}
                color={s.classification === 'app' ? 'text-gray-300' : cfg.text}
                sub={`${s.pct.toFixed(0)}%`}
              />
            );
          })}
        </div>

        {/* Top 10 tag ranking */}
        <div className="mt-4 space-y-1">
          {topTags.map((t, i) => (
            <TagRow key={t.tag} tag={t} index={i} maxCount={maxCount} isTop3={i < 3} onTagClick={onTagClick} />
          ))}
        </div>
      </TabSectionHeader>

      {/* Show details toggle */}
      {(tagStats.length > 10 || hiddenVendorTags.length > 0) && (
        <DetailsToggle
          expanded={showDetails}
          onToggle={() => setShowDetails(!showDetails)}
          expandLabel={`Show all ${tagStats.length} tags`}
          collapseLabel="Show less"
        />
      )}

      {/* Expanded detail: remaining tags + vendor chips */}
      {showDetails && (
        <div className="card space-y-4">
          {tagStats.length > 10 && (
            <div className="space-y-1">
              {tagStats.slice(10).map((t, i) => (
                <TagRow key={t.tag} tag={t} index={i + 10} maxCount={maxCount} isTop3={false} onTagClick={onTagClick} />
              ))}
            </div>
          )}

          {hiddenVendorTags.length > 0 && (
            <div className="pt-4 border-t border-border/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-warm animate-pulse-dot" />
                <h3 className="font-display text-sm text-warm">More Vendor Tags ({hiddenVendorTags.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {hiddenVendorTags.slice(0, 15).map((t) => (
                  <span
                    key={t.tag}
                    className={`text-xs bg-warm/8 text-warm border border-warm/15 px-2.5 py-1 rounded-lg font-mono transition-all duration-200${
                      onTagClick ? ' cursor-pointer hover:bg-warm/15 hover:border-warm/30 hover:-translate-y-0.5' : ''
                    }`}
                    title={`${t.count} occurrences`}
                    onClick={onTagClick ? () => onTagClick(t.tag) : undefined}
                  >
                    {t.tag} <span className="text-warm/50 ml-0.5">{formatCount(t.count)}</span>
                  </span>
                ))}
                {hiddenVendorTags.length > 15 && (
                  <span className="text-xs text-gray-600 self-center">+{hiddenVendorTags.length - 15} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
