import type { Severity } from './types';

// ── Health score colors (SystemOverview thresholds: 80/50) ──

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export function scoreStrokeColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
}

// ── Batch score colors (BatchResults thresholds: 70/40) ──

export function batchScoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

export function batchScoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ── Severity badge (shared by ComparisonPage, BatchResults) ──

export function severityBadge(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-900/50 text-red-300 border-red-700/50';
    case 'warning': return 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50';
    case 'info': return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
    default: return 'bg-gray-800 text-gray-300 border-gray-700';
  }
}

// ── Comparison delta colors ──

export function deltaColor(delta: number): string {
  if (delta > 0) return 'text-green-400';
  if (delta < 0) return 'text-red-400';
  return 'text-gray-400';
}

// ── Logcat level colors (SearchModal) ──

export function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'E': return 'text-red-400';
    case 'W': return 'text-yellow-400';
    case 'I': return 'text-green-400';
    case 'D': return 'text-blue-400';
    default: return 'text-gray-400';
  }
}

export function levelBg(level: string): string {
  switch (level.toUpperCase()) {
    case 'E': return 'bg-red-950/30';
    case 'W': return 'bg-yellow-950/20';
    default: return '';
  }
}

// ── Kernel level colors (SearchModal) ──

export function kernelLevelColor(level: string): string {
  const num = parseInt(level.replace(/[<>]/g, ''), 10);
  if (num <= 3) return 'text-red-400';
  if (num === 4) return 'text-yellow-400';
  if (num === 5) return 'text-blue-400';
  if (num === 6) return 'text-green-400';
  return 'text-gray-400';
}

export function kernelLevelBg(level: string): string {
  const num = parseInt(level.replace(/[<>]/g, ''), 10);
  if (num <= 3) return 'bg-red-950/30';
  if (num === 4) return 'bg-yellow-950/20';
  return '';
}

export function kernelLevelLabel(level: string): string {
  const num = parseInt(level.replace(/[<>]/g, ''), 10);
  const labels: Record<number, string> = {
    0: 'EMERG', 1: 'ALERT', 2: 'CRIT', 3: 'ERR',
    4: 'WARN', 5: 'NOTICE', 6: 'INFO', 7: 'DEBUG',
  };
  return labels[num] ?? level;
}

// ── Timeline dot colors ──

export function dotColor(severity: Severity, source: string): string {
  if (severity === 'critical') return 'bg-red-500';
  if (severity === 'info') return 'bg-green-500';
  if (source === 'kernel') return 'bg-orange-400';
  if (source === 'anr') return 'bg-rose-400';
  if (source === 'tombstone') return 'bg-rose-500';
  return 'bg-amber-500';
}

// ── Power rate colors ──

export function rateColor(rate: number): string {
  if (rate <= 0) return 'text-gray-400';
  if (rate < 20) return 'text-green-400';
  if (rate < 40) return 'text-amber-400';
  return 'text-red-400';
}

export function rateGradient(rate: number): string {
  if (rate <= 0) return 'from-gray-500/10 to-gray-500/5';
  if (rate < 20) return 'from-green-500/10 to-green-500/3';
  if (rate < 40) return 'from-amber-500/10 to-amber-500/3';
  return 'from-red-500/10 to-red-500/3';
}

// ── HAL status colors (ComparisonPage) ──

export function statusColor(status: string): string {
  if (status === 'alive') return 'text-green-400';
  if (status === 'non-responsive') return 'text-red-400';
  if (status === 'declared') return 'text-yellow-400';
  if (status === 'absent') return 'text-gray-500';
  return 'text-gray-400';
}
