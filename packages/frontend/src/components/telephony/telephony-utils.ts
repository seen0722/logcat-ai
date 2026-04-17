export function voiceStateBadge(state: string): { color: string; label: string } {
  switch (state) {
    case 'IN_SERVICE': return { color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'In Service' };
    case 'OUT_OF_SERVICE': return { color: 'bg-red-500/10 text-red-300 border-red-500/20', label: 'Out of Service' };
    case 'EMERGENCY_ONLY': return { color: 'bg-amber-500/10 text-amber-300 border-amber-500/20', label: 'Emergency Only' };
    case 'POWER_OFF': return { color: 'bg-gray-700/50 text-gray-400 border-gray-600/50', label: 'Power Off' };
    default: return { color: 'bg-gray-700/50 text-gray-400 border-gray-600/50', label: state };
  }
}

export function signalLevelColor(level: number): string {
  if (level >= 4) return 'text-green-400';
  if (level >= 3) return 'text-green-300';
  if (level >= 2) return 'text-amber-400';
  return 'text-red-400';
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
