import { deltaColor } from '../../lib/color-utils';
import type { ComparisonResult } from '../../hooks/useComparison';

interface ComparisonHeroProps {
  comparison: ComparisonResult;
}

// ── Helpers ──

function deltaSign(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function formatDate(iso?: string): string {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function shortBuild(fingerprint: string): string {
  const parts = fingerprint.split('/');
  if (parts.length >= 5) {
    const buildId = parts[3];
    const buildNum = parts[4]?.split(':')[0];
    return buildNum ? `${buildId} / ${buildNum}` : buildId;
  }
  return fingerprint.split('/').slice(-2).join('/');
}

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-gray-800" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${c * pct} ${c * (1 - pct)}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-gray-100">{score}</span>
        </div>
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function ComparisonHero({ comparison }: ComparisonHeroProps) {
  const { metadataDiff, healthDiff, insightDiff } = comparison;
  const overall = healthDiff.overall;

  return (
    <section id="section-cmp-hero" className="card p-0 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr]">
        {/* Left device */}
        <div className="p-5 border-b md:border-b-0 md:border-r border-border/50">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Before</div>
          <div className="text-lg font-display text-gray-100">{metadataDiff.left.deviceModel}</div>
          <div className="text-xs text-gray-400">{metadataDiff.left.manufacturer}</div>
          <div className="mt-2 space-y-0.5 text-xs text-gray-500">
            <div>Android {metadataDiff.left.androidVersion} · {metadataDiff.left.buildType}</div>
            <div className="font-mono truncate" title={metadataDiff.left.buildFingerprint}>{shortBuild(metadataDiff.left.buildFingerprint)}</div>
            {metadataDiff.left.bugreportTimestamp && <div>{formatDate(metadataDiff.left.bugreportTimestamp)}</div>}
          </div>
        </div>

        {/* Center: Overall score delta */}
        <div className="flex flex-col items-center justify-center px-6 py-5 bg-surface/50">
          <div className="flex items-center gap-4">
            <div className="relative"><ScoreRing score={overall.left} label="Before" /></div>
            <div className="flex flex-col items-center">
              <span className="text-gray-600 text-lg">&rarr;</span>
              <span className={`text-2xl font-bold ${deltaColor(overall.delta)}`}>
                {deltaSign(overall.delta)}
              </span>
            </div>
            <div className="relative"><ScoreRing score={overall.right} label="After" /></div>
          </div>
          {/* Quick stats */}
          <div className="flex gap-4 mt-4 text-xs">
            {insightDiff.resolved.length > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                {insightDiff.resolved.length} resolved
              </span>
            )}
            {insightDiff.newIssues.length > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {insightDiff.newIssues.length} new
              </span>
            )}
            {insightDiff.persistent.length > 0 && (
              <span className="flex items-center gap-1 text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                {insightDiff.persistent.length} persistent
              </span>
            )}
          </div>
        </div>

        {/* Right device */}
        <div className="p-5 border-t md:border-t-0 md:border-l border-border/50">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">After</div>
          <div className="text-lg font-display text-gray-100">{metadataDiff.right.deviceModel}</div>
          <div className="text-xs text-gray-400">{metadataDiff.right.manufacturer}</div>
          <div className="mt-2 space-y-0.5 text-xs text-gray-500">
            <div>Android {metadataDiff.right.androidVersion} · {metadataDiff.right.buildType}</div>
            <div className="font-mono truncate" title={metadataDiff.right.buildFingerprint}>{shortBuild(metadataDiff.right.buildFingerprint)}</div>
            {metadataDiff.right.bugreportTimestamp && <div>{formatDate(metadataDiff.right.bugreportTimestamp)}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
