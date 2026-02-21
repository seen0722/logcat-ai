import { useState } from 'react';
import { TimelineEvent, Severity } from '../lib/types';

interface Props {
  events: TimelineEvent[];
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-green-500',
};

const SEVERITY_BTN: Record<Severity, { active: string; label: string }> = {
  critical: { active: 'bg-red-500/20 text-red-400 border-red-500/50', label: 'Critical' },
  warning: { active: 'bg-amber-500/20 text-amber-400 border-amber-500/50', label: 'Warning' },
  info: { active: 'bg-green-500/20 text-green-400 border-green-500/50', label: 'Info' },
};

const SOURCE_COLOR: Record<string, string> = {
  logcat: 'text-blue-400',
  anr: 'text-red-400',
  kernel: 'text-amber-400',
  tombstone: 'text-rose-500',
};

const SOURCE_BTN: Record<string, { active: string; label: string }> = {
  logcat: { active: 'bg-blue-500/20 text-blue-400 border-blue-500/50', label: 'Logcat' },
  kernel: { active: 'bg-amber-500/20 text-amber-400 border-amber-500/50', label: 'Kernel' },
  anr: { active: 'bg-red-500/20 text-red-400 border-red-500/50', label: 'ANR' },
  tombstone: { active: 'bg-rose-500/20 text-rose-500 border-rose-500/50', label: 'Tombstone' },
};

const INACTIVE_BTN = 'bg-transparent text-gray-500 border-gray-700';

const ALL_SEVERITIES: Severity[] = ['critical', 'warning', 'info'];
const ALL_SOURCES = ['logcat', 'kernel', 'anr', 'tombstone'] as const;

export default function Timeline({ events }: Props) {
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set(['critical', 'warning']));
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set(['logcat', 'anr', 'kernel', 'tombstone']));

  if (events.length === 0) return null;

  const filteredEvents = events.filter(
    (e) => severityFilter.has(e.severity) && sourceFilter.has(e.source)
  );

  const toggleSeverity = (s: Severity) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleSource = (s: string) => {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">
        Timeline{' '}
        <span className="text-gray-500 text-sm font-normal">
          ({filteredEvents.length} shown / {events.length} total)
        </span>
      </h2>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {ALL_SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => toggleSeverity(s)}
            className={`px-2 py-1 rounded border transition-colors ${
              severityFilter.has(s) ? SEVERITY_BTN[s].active : INACTIVE_BTN
            }`}
          >
            {SEVERITY_BTN[s].label}
          </button>
        ))}
        <span className="text-gray-600 mx-1">|</span>
        {ALL_SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => toggleSource(s)}
            className={`px-2 py-1 rounded border transition-colors ${
              sourceFilter.has(s) ? SOURCE_BTN[s].active : INACTIVE_BTN
            }`}
          >
            {SOURCE_BTN[s].label}
          </button>
        ))}
      </div>

      {/* Event List */}
      <div className="relative space-y-0 max-h-96 overflow-y-auto pr-2">
        {filteredEvents.length === 0 && (
          <p className="text-sm text-gray-500 py-4 text-center">No events match current filters.</p>
        )}
        {filteredEvents.map((event, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 py-2 group ${
              event.severity === 'critical' ? 'border-l-2 border-red-500 pl-2' : ''
            }`}
          >
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[event.severity]} shrink-0 mt-1.5`} />
              {i < filteredEvents.length - 1 && (
                <div className="w-px flex-1 bg-border min-h-[20px]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                  {event.timeRange ?? event.timestamp}
                </span>
                <span className={`text-xs font-medium uppercase ${SOURCE_COLOR[event.source] ?? 'text-gray-400'}`}>
                  {event.source}
                </span>
                {event.count && event.count > 1 && (
                  <span className="text-xs font-semibold bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                    &times;{event.count}
                  </span>
                )}
              </div>
              <p className="text-gray-300 group-hover:text-white transition-colors">
                {event.label}
              </p>
              {event.details && (
                <p className="text-xs text-gray-500">{event.details}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
