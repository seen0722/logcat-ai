export type SearchSource = 'logcat' | 'kernel';

export interface BaseEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface LogcatEntry extends BaseEntry {
  lineNumber: number;
  pid?: number;
  tid?: number;
  tag: string;
  buffer?: string;
}

export interface KernelEntry extends BaseEntry {
  entryIndex: number;
  facility: string;
}

export interface RowExtraProps {
  entries: LogcatEntry[] | KernelEntry[];
  source: SearchSource;
  currentMatchIndex: number;
  matchIndices: Set<number>;
  focusIdx: number;
  onExpandToggle: (idx: number) => void;
  highlightPattern: RegExp | null;
  bookmarkedKeys: Set<number>;
  currentBookmarkKey: number;
  onBookmarkToggle: (idx: number) => void;
}

export const ROW_HEIGHT = 22;
export const DETAIL_HEIGHT = 100;
