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
  return (
    <div className="flex gap-2.5 items-center px-4 py-1.5 border-b border-border/60 shrink-0 flex-wrap">
      {source === 'logcat' && (
        <>
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-500">Tag</label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="e.g. RIL,RILJ"
              className="w-36 bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
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
            <label className="text-[11px] text-gray-500">Exclude</label>
            <input
              type="text"
              value={excludeTags}
              onChange={(e) => setExcludeTags(e.target.value)}
              placeholder="tag1,tag2"
              title="Comma-separated tags to hide"
              className="w-28 bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-500">Buffer</label>
            <select
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              className="bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="main">main</option>
              <option value="system">system</option>
              <option value="events">events</option>
              <option value="crash">crash</option>
              <option value="radio">radio</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-500">Min Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="V">V+</option>
              <option value="D">D+</option>
              <option value="I">I+</option>
              <option value="W">W+</option>
              <option value="E">E+</option>
              <option value="F">F</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-gray-500">PID</label>
            <input
              type="number"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              placeholder="—"
              className="w-16 bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
        </>
      )}

      {source === 'kernel' && (
        <div className="flex items-center gap-1">
          <label className="text-[11px] text-gray-500">Min Level</label>
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
        </div>
      )}

      <div className="w-px h-5 bg-gray-700/50" />

      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-500">From</label>
        <input
          type="text"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          placeholder="MM-DD HH:mm:ss"
          className="w-32 bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent font-mono"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[11px] text-gray-500">To</label>
        <input
          type="text"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          placeholder="MM-DD HH:mm:ss"
          className="w-32 bg-surface-card border border-border/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent font-mono"
        />
      </div>
      {(startTime || endTime) && (
        <button
          onClick={() => { setStartTime(''); setEndTime(''); }}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
