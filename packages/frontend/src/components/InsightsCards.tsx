import { useState, useMemo } from 'react';
import { InsightCard as InsightCardType, Severity, HALStatusSummary } from '../lib/types';
import InsightCard from './InsightCard';

interface Props {
  insights: InsightCardType[];
  halStatus?: HALStatusSummary;
}

const FILTERS: { key: Severity | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
];

/** Group key for same-type grouping: strips process-specific details from titles */
function groupKey(insight: InsightCardType): string {
  // Group SELinux denials together
  if (insight.title.toLowerCase().includes('selinux')) return `selinux_${insight.severity}`;
  // Strip process-specific suffixes (pid, count, process name) to allow grouping
  let normalized = insight.title
    .replace(/\s*\(pid\s+\d+\)/g, '')
    .replace(/\s*\(\u00d7\d+\)/g, '')      // (×N)
    .replace(/\s+in\s+[\w.]+$/g, '')         // " in com.example.app"
    .trim();
  // Normalize driver_error titles: strip varying addresses and firmware names
  // e.g. "Driver error: subsys-pil-tz 3700000.qcom,lpass: Direct firmware load for adsp.b02 failed..."
  //    → "Driver error: subsys-pil-tz qcom,lpass: Direct firmware load failed"
  if (normalized.startsWith('Driver error:')) {
    normalized = normalized
      .replace(/\b[0-9a-f]{4,}\b[.,]?/gi, '')  // hex/numeric addresses
      .replace(/for\s+\S+/g, 'for firmware')     // specific firmware names
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Normalize "Low memory killer event (×N)" variants
  if (normalized.startsWith('Low memory killer')) {
    normalized = 'Low memory killer event';
  }
  return `${insight.category}_${insight.source}_${insight.severity}_${normalized}`;
}

interface InsightGroup {
  key: string;
  label: string;
  insights: InsightCardType[];
}

/** Check if an ANR insight references a HAL that is non-responsive */
function findHalCorrelation(insight: InsightCardType, halStatus?: HALStatusSummary): string | null {
  if (!halStatus || insight.source !== 'anr') return null;
  const text = `${insight.title}\n${insight.description}`;
  const nonAlive = halStatus.families.filter(f => f.highestStatus !== 'alive');
  for (const family of nonAlive) {
    // Match full familyName (e.g. "vendor.trimble.hardware.trmbkeypad::ITrmbKeypad")
    if (text.includes(family.familyName)) {
      return `${family.shortName}@${family.highestVersion}: ${family.highestStatus}`;
    }
    // Match interface name with I-prefix and word boundary (e.g. "ITrmbKeypad", "IGnss")
    // This is the most reliable signal — shortName matching is too prone to false positives
    // (e.g. "alarm" matches AlarmManager, "cas" matches "broadcast")
    const interfaceMatch = family.familyName.match(/::I(\w+)$/);
    const interfaceName = interfaceMatch ? interfaceMatch[1] : null;
    if (interfaceName && new RegExp(`\\bI${interfaceName}\\b`).test(text)) {
      return `${family.shortName}@${family.highestVersion}: ${family.highestStatus}`;
    }
  }
  return null;
}

export default function InsightsCards({ insights, halStatus }: Props) {
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const [showAllInfo, setShowAllInfo] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const criticalCount = insights.filter((i) => i.severity === 'critical').length;
  const warningCount = insights.filter((i) => i.severity === 'warning').length;
  const infoCount = insights.filter((i) => i.severity === 'info').length;

  const filtered = filter === 'all' ? insights : insights.filter((i) => i.severity === filter);

  const countFor = (key: string) =>
    key === 'critical' ? criticalCount : key === 'warning' ? warningCount : key === 'info' ? infoCount : insights.length;

  /** Build grouped insight list from a flat array */
  function buildGroups(items: InsightCardType[]): InsightGroup[] {
    const map = new Map<string, InsightCardType[]>();
    for (const item of items) {
      const key = groupKey(item);
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
    }
    const groups: InsightGroup[] = [];
    for (const [key, group] of map) {
      if (group.length > 1) {
        const label = group[0].title.toLowerCase().includes('selinux')
          ? 'SELinux denials'
          : group[0].title.replace(/\s*\(\u00d7\d+\)/, '');
        groups.push({ key, label, insights: group });
      } else {
        for (const item of group) {
          groups.push({ key: item.id, label: '', insights: [item] });
        }
      }
    }
    return groups;
  }

  // Group and organize insights
  const { displayItems, hiddenInfoCount } = useMemo(() => {
    const critical = filtered.filter((i) => i.severity === 'critical');
    const warning = filtered.filter((i) => i.severity === 'warning');
    const info = filtered.filter((i) => i.severity === 'info');

    const warningGroups = buildGroups(warning);
    const infoGrouped = buildGroups(info);

    // In "all" filter mode with info items, hide info by default
    const shouldHideInfo = filter === 'all' && !showAllInfo && info.length > 0;

    return {
      displayItems: {
        critical,
        warningGroups,
        infoGroups: shouldHideInfo ? [] : infoGrouped,
      },
      hiddenInfoCount: shouldHideInfo ? info.length : 0,
    };
  }, [filtered, filter, showAllInfo]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
                onClick={() => { setFilter(f.key); setShowAllInfo(f.key === 'info'); }}
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
        {/* Critical insights - always shown */}
        {displayItems.critical.map((insight) => (
          <InsightCard key={insight.id} insight={insight} halCorrelation={findHalCorrelation(insight, halStatus)} />
        ))}

        {/* Warning insights - grouped when >2 similar */}
        {displayItems.warningGroups.map((group) => {
          if (group.insights.length <= 1) {
            return <InsightCard key={group.insights[0].id} insight={group.insights[0]} halCorrelation={findHalCorrelation(group.insights[0], halStatus)} />;
          }
          const isExpanded = expandedGroups.has(group.key);
          return (
            <div key={group.key} className="space-y-2">
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-card border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
              >
                <span className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-xs bg-amber-500/20 text-amber-400">
                  {group.insights.length}
                </span>
                <span className="badge-warning">{group.insights[0].source}</span>
                <span className="text-gray-300 flex-1 text-left truncate">{group.label}</span>
                <span className="text-gray-500 text-xs">
                  {isExpanded ? 'Collapse' : `Show ${group.insights.length} items`}
                </span>
                <span className="text-gray-500 text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>
              {isExpanded && (
                <div className="space-y-2 ml-4 border-l-2 border-amber-500/20 pl-3 max-h-[400px] overflow-y-auto">
                  {group.insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} halCorrelation={findHalCorrelation(insight, halStatus)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Info insights - grouped and collapsible */}
        {displayItems.infoGroups.map((group) => {
          if (group.insights.length <= 1) {
            return <InsightCard key={group.insights[0].id} insight={group.insights[0]} halCorrelation={findHalCorrelation(group.insights[0], halStatus)} />;
          }

          const isExpanded = expandedGroups.has(group.key);
          return (
            <div key={group.key} className="space-y-2">
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-card border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
              >
                <span className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-xs bg-green-500/20 text-green-400">
                  {group.insights.length}
                </span>
                <span className="badge-info">{group.insights[0].source}</span>
                <span className="text-gray-300 flex-1 text-left truncate">{group.label}</span>
                <span className="text-gray-500 text-xs">
                  {isExpanded ? 'Collapse' : `Show ${group.insights.length} items`}
                </span>
                <span className="text-gray-500 text-sm">{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>
              {isExpanded && (
                <div className="space-y-2 ml-4 border-l-2 border-green-500/20 pl-3 max-h-[400px] overflow-y-auto">
                  {group.insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} halCorrelation={findHalCorrelation(insight, halStatus)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Show more info items button */}
        {hiddenInfoCount > 0 && (
          <button
            onClick={() => setShowAllInfo(true)}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-300 bg-surface-card border border-border border-dashed rounded-lg hover:bg-surface-hover transition-colors"
          >
            Show {hiddenInfoCount} info-level items
          </button>
        )}
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
