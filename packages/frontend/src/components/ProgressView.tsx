import { SSEProgress } from '../lib/types';

interface Props {
  progress: SSEProgress | null;
}

const STAGES = [
  { key: 'unpacking', label: 'Unpack', num: '1' },
  { key: 'parsing', label: 'Parse', num: '2' },
  { key: 'analyzing', label: 'Analyze', num: '3' },
  { key: 'deep_analysis', label: 'AI Deep', num: '4' },
] as const;

function stageIndex(stage: string): number {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return idx === -1 ? 0 : idx;
}

export default function ProgressView({ progress }: Props) {
  if (!progress) return null;

  const currentIdx = stageIndex(progress.stage);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx || progress.stage === 'complete';
          return (
            <div key={stage.key} className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${
                  isDone
                    ? 'bg-green-600'
                    : isActive
                      ? 'bg-indigo-600 animate-pulse'
                      : 'bg-surface-card border border-border'
                }`}
              >
                {isDone ? '✓' : stage.num}
              </div>
              <span className={`text-xs mt-1 ${isActive ? 'text-white' : 'text-gray-500'}`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {/* Message */}
      <p className="text-center text-sm text-gray-400">{progress.message}</p>
    </div>
  );
}
