export type SearchSource = 'logcat' | 'kernel';

export interface LogcatEntry {
  lineNumber: number;
  timestamp: string;
  pid?: number;
  tid?: number;
  level: string;
  tag: string;
  message: string;
  buffer?: string;
}

export interface KernelEntry {
  entryIndex: number;
  timestamp: string;
  level: string;
  facility: string;
  message: string;
}

export interface RowExtraProps {
  entries: LogcatEntry[] | KernelEntry[];
  source: SearchSource;
  currentMatchIndex: number;
  matchIndices: Set<number>;
  focusIdx: number;
  onExpandToggle: (idx: number) => void;
  highlightPattern: RegExp | null;
}

export const MAX_ENTRIES = 50_000;
export const ROW_HEIGHT = 22;
export const DETAIL_HEIGHT = 100;
