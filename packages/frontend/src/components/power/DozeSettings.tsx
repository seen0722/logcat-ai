import { formatMs } from './power-utils';

interface DozeSettingsDiffProps {
  diffs: [string, number, number][];
}

/** Renders non-AOSP Doze setting diffs (used in hero card). */
export function DozeSettingsDiffBanner({ diffs }: DozeSettingsDiffProps) {
  if (diffs.length === 0) return null;

  return (
    <div className="mt-4 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3.5 space-y-1.5">
      <div className="text-xs text-amber-400 font-medium">Doze Settings differ from AOSP</div>
      {diffs.map(([name, val, def]) => {
        const isTime = name !== 'idle_factor';
        const display = isTime ? formatMs(val) : val.toString();
        const defDisplay = isTime ? formatMs(def) : def.toString();
        return (
          <div key={name} className="flex justify-between text-xs">
            <span className="text-gray-400 font-mono">{name}</span>
            <span className="text-amber-400">
              {display} <span className="text-gray-600">(AOSP: {defDisplay})</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface DozeSettingsTableProps {
  entries: [string, number, number][];
}

/** Renders all Doze parameters table (used in detail section). */
export function DozeSettingsTable({ entries }: DozeSettingsTableProps) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1 pt-2 border-t border-border/50">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">All Doze Parameters</span>
      {entries.map(([name, val, def]) => {
        const isTime = name !== 'idle_factor';
        const display = isTime ? formatMs(val) : val.toString();
        const defDisplay = isTime ? formatMs(def) : def.toString();
        const isDiff = val !== def;
        return (
          <div key={name} className="flex justify-between text-xs">
            <span className="text-gray-500 font-mono">{name}</span>
            <span className={isDiff ? 'text-amber-400' : 'text-gray-400'}>
              {display}
              {isDiff && <span className="text-gray-600 ml-1">(AOSP: {defDisplay})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
