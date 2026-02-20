import { TimelineEvent, Severity } from '../lib/types';

interface Props {
  events: TimelineEvent[];
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-green-500',
};

const SOURCE_COLOR: Record<string, string> = {
  logcat: 'text-blue-400',
  anr: 'text-red-400',
  kernel: 'text-amber-400',
};

export default function Timeline({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">
        Timeline <span className="text-gray-500 text-sm font-normal">({events.length} events)</span>
      </h2>

      <div className="relative space-y-0 max-h-96 overflow-y-auto pr-2">
        {events.map((event, i) => (
          <div key={i} className="flex items-start gap-3 py-2 group">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[event.severity]} shrink-0 mt-1.5`} />
              {i < events.length - 1 && (
                <div className="w-px flex-1 bg-border min-h-[20px]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                  {event.timestamp}
                </span>
                <span className={`text-xs font-medium uppercase ${SOURCE_COLOR[event.source] ?? 'text-gray-400'}`}>
                  {event.source}
                </span>
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
