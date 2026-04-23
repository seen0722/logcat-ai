import { useState } from 'react';
import type { SearchSource } from './types';

interface SearchFiltersProps {
  source: SearchSource;
  // Logcat filters
  tag: string;
  setTag: (v: string) => void;
  excludeTags: string;
  setExcludeTags: (v: string) => void;
  buffer: string;
  setBuffer: (v: string) => void;
  pid: string;
  setPid: (v: string) => void;
  // Shared filters
  level: string;
  setLevel: (v: string) => void;
  // Time range (client-side filter — no server round-trip)
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  // Actions
  onSaveTag: () => void;
}

// Level pill config for logcat
const LOGCAT_LEVELS = [
  { value: '', label: 'All', color: '' },
  { value: 'V', label: 'V+', color: 'text-gray-400 border-gray-500 bg-gray-500/20' },
  { value: 'D', label: 'D+', color: 'text-blue-400 border-blue-500 bg-blue-500/20' },
  { value: 'I', label: 'I+', color: 'text-green-400 border-green-500 bg-green-500/20' },
  { value: 'W', label: 'W+', color: 'text-yellow-400 border-yellow-500 bg-yellow-500/20' },
  { value: 'E', label: 'E+', color: 'text-red-400 border-red-500 bg-red-500/20' },
  { value: 'F', label: 'F', color: 'text-red-300 border-red-400 bg-red-400/20' },
];

export function SearchFilters({
  source,
  tag, setTag,
  excludeTags, setExcludeTags,
  buffer, setBuffer,
  pid, setPid,
  level, setLevel,
  startTime, setStartTime,
  endTime, setEndTime,
  onSaveTag,
}: SearchFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(() => !!(tag || excludeTags || pid));

  const hasTimeFilter = !!(startTime || endTime);
  const hasAdvancedFilter = !!(tag || excludeTags || pid);

  return (
    <div className="border-b border-border/60 shrink-0">
      {/* Primary row: Level pills + Buffer + Time range */}
      <div className="flex gap-2 items-center px-4 py-1.5 flex-wrap">
        {/* Level pills */}
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-gray-600 mr-1 uppercase tracking-wider">Level</span>
          {source === 'logcat' ? (
            LOGCAT_LEVELS.map(l => (
              <button
                key={l.value}
                onClick={() => setLevel(level === l.value ? '' : l.value)}
                className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded-md border transition-all ${
                  level === l.value
                    ? l.value
                      ? `${l.color} shadow-sm`
                      : 'text-gray-200 border-gray-400 bg-gray-400/20'
                    : 'text-gray-600 border-transparent hover:text-gray-400 hover:border-gray-700'
                }`}
              >
                {l.label}
              </button>
            ))
          ) : (
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="<0>">&lt;0&gt; EMERG</option>
              <option value="<1>">&lt;1&gt;+ ALERT</option>
              <option value="<2>">&lt;2&gt;+ CRIT</option>
              <option value="<3>">&lt;3&gt;+ ERR</option>
              <option value="<4>">&lt;4&gt;+ WARN</option>
              <option value="<5>">&lt;5&gt;+ NOTICE</option>
              <option value="<6>">&lt;6&gt;+ INFO</option>
            </select>
          )}
        </div>

        {source === 'logcat' && (
          <>
            <div className="w-px h-4 bg-gray-700/40" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Buffer</span>
              <select
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                className="bg-surface-card border border-border/60 rounded-md px-2 py-0.5 text-xs text-gray-100 focus:outline-none focus:border-accent"
              >
                <option value="">All</option>
                <option value="main">main</option>
                <option value="system">system</option>
                <option value="events">events</option>
                <option value="crash">crash</option>
                <option value="radio">radio</option>
              </select>
            </div>
          </>
        )}

        <div className="w-px h-4 bg-gray-700/40" />

        {/* Time range — always visible */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">From</span>
          <input
            type="text"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="MM-DD HH:mm:ss"
            className="w-[120px] bg-surface-card border border-border/60 rounded-md px-2 py-0.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent font-mono"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">To</span>
          <input
            type="text"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="MM-DD HH:mm:ss"
            className="w-[120px] bg-surface-card border border-border/60 rounded-md px-2 py-0.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent font-mono"
          />
        </div>
        {hasTimeFilter && (
          <button
            onClick={() => { setStartTime(''); setEndTime(''); }}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}

        {/* Advanced filter toggle (logcat only) */}
        {source === 'logcat' && (
          <>
            <div className="ml-auto" />
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors flex items-center gap-1 ${
                showAdvanced || hasAdvancedFilter
                  ? 'text-accent border-accent/30 bg-accent/10'
                  : 'text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              Filters
              {hasAdvancedFilter && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
              <span className={`text-[8px] transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
            </button>
          </>
        )}
      </div>

      {/* Secondary row: Tag / Exclude / PID (collapsible, logcat only) */}
      {source === 'logcat' && showAdvanced && (
        <div className="flex gap-2.5 items-center px-4 py-1.5 border-t border-border/30 bg-surface-card/30 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Tag</label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="e.g. RIL,RILJ"
              className="w-36 bg-surface-card border border-border/60 rounded-md px-2 py-0.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            {tag.trim() && (
              <button
                onClick={onSaveTag}
                className="text-gray-500 hover:text-accent text-xs px-1 transition-colors"
                title="Save tag preset"
                aria-label="Save tag preset"
              >+</button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Exclude</label>
            <input
              type="text"
              value={excludeTags}
              onChange={(e) => setExcludeTags(e.target.value)}
              placeholder="tag1,tag2"
              title="Comma-separated tags to hide"
              className="w-28 bg-surface-card border border-border/60 rounded-md px-2 py-0.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">PID</label>
            <input
              type="number"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              placeholder="—"
              className="w-16 bg-surface-card border border-border/60 rounded-md px-2 py-0.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
