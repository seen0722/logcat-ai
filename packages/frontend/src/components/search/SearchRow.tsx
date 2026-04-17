import type { RowComponentProps } from 'react-window';
import { levelColor, levelBg, kernelLevelColor, kernelLevelBg, kernelLevelLabel } from '../../lib/color-utils';
import type { LogcatEntry, KernelEntry, RowExtraProps } from './types';

// ── Inline text highlight helper ──

function HighlightText({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let safety = 0;
  while ((match = re.exec(text)) !== null && safety++ < 200) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<mark key={match.index} className="bg-accent/40 text-inherit rounded-sm px-[1px]">{match[0]}</mark>);
    lastIndex = re.lastIndex;
    if (match[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : <>{text}</>;
}

// ── Row Component (shared for logcat + kernel) ──
// CRITICAL: This component must NOT use any useState — it renders inside react-window virtual scroll
// with potentially 50K entries. Any state change would re-render the entire list.

export function RowComponent({ index, style, entries, source, currentMatchIndex, matchIndices, focusIdx, onExpandToggle, highlightPattern }: RowComponentProps<RowExtraProps>) {
  const isCurrentMatch = index === currentMatchIndex;
  const isMatch = matchIndices.has(index);
  const isFocus = index === focusIdx;

  if (source === 'logcat') {
    const entry = (entries as LogcatEntry[])[index];
    if (!entry) return null;

    let rowClass = `flex items-center text-[11px] leading-[22px] font-mono border-b border-gray-800/30 cursor-pointer hover:bg-gray-800/30 ${levelBg(entry.level)}`;
    if (isCurrentMatch) {
      rowClass += ' !bg-accent/30 border-l-[3px] border-l-accent';
    } else if (isFocus) {
      rowClass += ' border-l-[3px] border-l-accent';
    } else if (isMatch) {
      rowClass += ' border-l-[3px] border-l-yellow-400/60 !bg-yellow-900/15';
    }

    return (
      <div style={style}>
        <div className={rowClass} onClick={() => onExpandToggle(index)}>
          <span className="text-gray-600 px-2 whitespace-nowrap w-[150px] shrink-0 overflow-hidden">
            {isFocus && <span className="text-accent font-bold text-[9px]">{'\u25B6 '}</span>}
            {entry.timestamp}
          </span>
          <span className="text-gray-600 px-1 whitespace-nowrap w-[75px] shrink-0">
            {entry.pid ?? '?'}/{entry.tid ?? '?'}
          </span>
          <span className={`px-1 whitespace-nowrap w-[130px] shrink-0 font-semibold truncate ${levelColor(entry.level)}`}>
            {entry.level}/{entry.tag}
          </span>
          <span className={`px-2 flex-1 truncate ${levelColor(entry.level)}`}>
            {highlightPattern ? <HighlightText text={entry.message} pattern={highlightPattern} /> : entry.message}
          </span>
        </div>
      </div>
    );
  } else {
    const entry = (entries as KernelEntry[])[index];
    if (!entry) return null;

    let rowClass = `flex items-center text-[11px] leading-[22px] font-mono border-b border-gray-800/30 cursor-pointer hover:bg-gray-800/30 ${kernelLevelBg(entry.level)}`;
    if (isCurrentMatch) {
      rowClass += ' !bg-accent/30 border-l-[3px] border-l-accent';
    } else if (isFocus) {
      rowClass += ' border-l-[3px] border-l-accent';
    } else if (isMatch) {
      rowClass += ' border-l-[3px] border-l-yellow-400/60 !bg-yellow-900/15';
    }

    return (
      <div style={style}>
        <div className={rowClass} onClick={() => onExpandToggle(index)}>
          <span className="text-gray-600 px-2 whitespace-nowrap w-[150px] shrink-0 overflow-hidden">
            {isFocus && <span className="text-accent font-bold text-[9px]">{'\u25B6 '}</span>}
            [{entry.timestamp}]
          </span>
          <span className={`px-1 whitespace-nowrap w-[70px] shrink-0 font-semibold ${kernelLevelColor(entry.level)}`}>
            {kernelLevelLabel(entry.level)}
          </span>
          <span className={`px-2 flex-1 truncate ${kernelLevelColor(entry.level)}`}>
            {highlightPattern ? <HighlightText text={entry.message} pattern={highlightPattern} /> : entry.message}
          </span>
        </div>
      </div>
    );
  }
}
