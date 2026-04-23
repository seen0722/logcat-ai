import React from 'react';
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

// ── Bookmark icon (inline SVG, no external dependency) ──

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none" className="shrink-0">
      <path
        d="M1 1.5C1 1.22 1.22 1 1.5 1H8.5C8.78 1 9 1.22 9 1.5V11L5 8.5L1 11V1.5Z"
        fill={active ? '#d4a06a' : 'none'}
        stroke={active ? '#d4a06a' : 'currentColor'}
        strokeWidth="1.2"
      />
    </svg>
  );
}

// ── Row Component (shared for logcat + kernel) ──
// CRITICAL: This component must NOT use any useState — it renders inside react-window virtual scroll
// with potentially 50K entries. Any state change would re-render the entire list.

function RowComponentInner({ index, style, entries, source, currentMatchIndex, matchIndices, focusIdx, onExpandToggle, highlightPattern, bookmarkedKeys, currentBookmarkKey, onBookmarkToggle }: RowComponentProps<RowExtraProps>) {
  const isCurrentMatch = index === currentMatchIndex;
  const isMatch = matchIndices.has(index);
  const isFocus = index === focusIdx;
  const isOdd = index % 2 === 1;

  if (source === 'logcat') {
    const entry = (entries as LogcatEntry[])[index];
    if (!entry) return null;

    const isBookmarked = bookmarkedKeys.has(entry.lineNumber);
    const isCurrentBookmark = entry.lineNumber === currentBookmarkKey;
    const zebra = isOdd ? 'bg-white/[0.015]' : '';
    let rowClass = `group flex items-center text-[11px] leading-[22px] font-mono border-b border-gray-800/20 cursor-pointer hover:!bg-gray-700/30 ${levelBg(entry.level) || zebra}`;
    if (isCurrentBookmark) {
      rowClass += ' !border-l-[3px] !border-l-warm !bg-warm/[0.12] ring-1 ring-inset ring-warm/30';
    } else if (isBookmarked) {
      rowClass += ' !border-l-[3px] !border-l-warm/60 bg-warm/[0.04]';
    }
    if (isCurrentMatch) {
      rowClass += ' !bg-accent/30 !border-l-[3px] !border-l-accent';
    } else if (isFocus) {
      rowClass += ' !border-l-[3px] !border-l-accent';
    } else if (isMatch) {
      rowClass += ' !border-l-[3px] !border-l-yellow-400/60 !bg-yellow-900/15';
    }

    return (
      <div style={style}>
        <div className={rowClass} onClick={() => onExpandToggle(index)}>
          <span
            className={`w-[16px] shrink-0 flex items-center justify-center ${isBookmarked ? 'text-warm' : 'text-transparent group-hover:text-gray-700'} transition-colors`}
            onClick={(e) => { e.stopPropagation(); onBookmarkToggle(index); }}
          >
            <BookmarkIcon active={isBookmarked} />
          </span>
          <span className="text-gray-500 px-1 whitespace-nowrap w-[140px] shrink-0 overflow-hidden tabular-nums">
            {isFocus && <span className="text-accent font-bold text-[9px]">{'\u25B6 '}</span>}
            {entry.timestamp}
          </span>
          <span className="text-gray-600 px-1 whitespace-nowrap w-[75px] shrink-0 tabular-nums">
            {entry.pid ?? '?'}/{entry.tid ?? '?'}
          </span>
          <span className={`px-1 whitespace-nowrap w-[200px] shrink-0 font-semibold truncate ${levelColor(entry.level)}`}>
            {entry.level}/{entry.tag}
          </span>
          <span className="px-2 flex-1 truncate text-gray-400">
            {highlightPattern ? <HighlightText text={entry.message} pattern={highlightPattern} /> : entry.message}
          </span>
        </div>
      </div>
    );
  } else {
    const entry = (entries as KernelEntry[])[index];
    if (!entry) return null;

    const isBookmarked = bookmarkedKeys.has(entry.entryIndex);
    const isCurrentBookmark = entry.entryIndex === currentBookmarkKey;
    const zebra = isOdd ? 'bg-white/[0.015]' : '';
    let rowClass = `group flex items-center text-[11px] leading-[22px] font-mono border-b border-gray-800/20 cursor-pointer hover:!bg-gray-700/30 ${kernelLevelBg(entry.level) || zebra}`;
    if (isCurrentBookmark) {
      rowClass += ' !border-l-[3px] !border-l-warm !bg-warm/[0.12] ring-1 ring-inset ring-warm/30';
    } else if (isBookmarked) {
      rowClass += ' !border-l-[3px] !border-l-warm/60 bg-warm/[0.04]';
    }
    if (isCurrentMatch) {
      rowClass += ' !bg-accent/30 !border-l-[3px] !border-l-accent';
    } else if (isFocus) {
      rowClass += ' !border-l-[3px] !border-l-accent';
    } else if (isMatch) {
      rowClass += ' !border-l-[3px] !border-l-yellow-400/60 !bg-yellow-900/15';
    }

    return (
      <div style={style}>
        <div className={rowClass} onClick={() => onExpandToggle(index)}>
          <span
            className={`w-[16px] shrink-0 flex items-center justify-center ${isBookmarked ? 'text-warm' : 'text-transparent group-hover:text-gray-700'} transition-colors`}
            onClick={(e) => { e.stopPropagation(); onBookmarkToggle(index); }}
          >
            <BookmarkIcon active={isBookmarked} />
          </span>
          <span className="text-gray-500 px-1 whitespace-nowrap w-[140px] shrink-0 overflow-hidden tabular-nums">
            {isFocus && <span className="text-accent font-bold text-[9px]">{'\u25B6 '}</span>}
            [{entry.timestamp}]
          </span>
          <span className={`px-1 whitespace-nowrap w-[70px] shrink-0 font-semibold ${kernelLevelColor(entry.level)}`}>
            {kernelLevelLabel(entry.level)}
          </span>
          <span className="px-2 flex-1 truncate text-gray-400">
            {highlightPattern ? <HighlightText text={entry.message} pattern={highlightPattern} /> : entry.message}
          </span>
        </div>
      </div>
    );
  }
}

export const RowComponent = React.memo(RowComponentInner) as unknown as typeof RowComponentInner;
