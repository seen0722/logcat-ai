import { BugreportMetadata, SystemHealthScore } from '../lib/types';

interface Props {
  metadata: BugreportMetadata;
  healthScore: SystemHealthScore;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function ScoreRing({ score, label, size = 64 }: { score: number; label: string; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#2a2d3e" strokeWidth={4}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className={`text-lg font-bold -mt-10 ${scoreColor(score)}`}>{score}</span>
      <span className="text-xs text-gray-500 mt-5">{label}</span>
    </div>
  );
}

export default function SystemOverview({ metadata, healthScore }: Props) {
  const { breakdown } = healthScore;

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">System Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Device</span>
          <p className="font-medium">{metadata.deviceModel}</p>
        </div>
        <div>
          <span className="text-gray-500">Manufacturer</span>
          <p className="font-medium">{metadata.manufacturer}</p>
        </div>
        <div>
          <span className="text-gray-500">Android</span>
          <p className="font-medium">{metadata.androidVersion} (SDK {metadata.sdkLevel})</p>
        </div>
        <div>
          <span className="text-gray-500">Build</span>
          <p className="font-medium truncate" title={metadata.buildFingerprint}>
            {metadata.buildFingerprint.split('/').slice(-2).join('/')}
          </p>
        </div>
      </div>

      {/* Health Scores */}
      <div className="flex items-center justify-around pt-2">
        <ScoreRing score={healthScore.overall} label="Overall" size={80} />
        <ScoreRing score={breakdown.stability} label="Stability" />
        <ScoreRing score={breakdown.memory} label="Memory" />
        <ScoreRing score={breakdown.responsiveness} label="Response" />
        <ScoreRing score={breakdown.kernel} label="Kernel" />
      </div>
    </div>
  );
}
