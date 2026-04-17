export function formatMs(ms: number): string {
  if (ms <= 0) return '0';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1_000);
  if (m > 0) return `${m}m ${s}s`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

export function rateBorder(rate: number): string {
  if (rate <= 0) return 'border-gray-700/30';
  if (rate < 20) return 'border-green-500/20';
  if (rate < 40) return 'border-amber-500/20';
  return 'border-red-500/20';
}

export function dozeStateBadge(state: string): string {
  if (state === 'IDLE' || state === 'IDLE_MAINTENANCE') return 'text-green-400';
  if (state === 'ACTIVE') return 'text-gray-400';
  if (state === 'INACTIVE') return 'text-amber-400';
  return 'text-gray-300';
}

// AOSP defaults for comparison
export const AOSP_DEFAULTS = {
  inactiveTo: 1800000,
  idleTo: 3600000,
  idleFactor: 2.0,
  maxIdleTo: 21600000,
  lightIdleTo: 300000,
  lightMaxIdleTo: 900000,
  lightIdleFactor: 2.0,
};
