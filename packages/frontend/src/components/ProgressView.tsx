import { SSEProgress } from '../lib/types';
import { IconCheck } from './Icons';

interface Props {
  progress: SSEProgress | null;
  onCancel?: () => void;
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

export default function ProgressView({ progress, onCancel }: Props) {
  if (!progress) return null;

  const currentIdx = stageIndex(progress.stage);

  return (
    <div className="max-w-2xl mx-auto space-y-6" role="status" aria-live="polite">
      {/* Stage indicators with connectors */}
      <div className="flex items-center justify-between">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx || progress.stage === 'complete';
          return (
            <div key={stage.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-500 ${
                    isDone
                      ? 'bg-green-600 text-white'
                      : isActive
                        ? 'bg-accent text-white animate-pulse-subtle shadow-lg shadow-accent/30'
                        : 'bg-surface-card border border-border text-gray-500'
                  }`}
                >
                  {isDone ? (
                    <IconCheck className="w-5 h-5" />
                  ) : stage.num}
                </div>
                <span className={`text-xs mt-1.5 transition-colors ${isActive ? 'text-white font-medium' : isDone ? 'text-green-400' : 'text-gray-500'}`}>
                  {stage.label}
                </span>
              </div>
              {/* Connector line */}
              {i < STAGES.length - 1 && (
                <div className="flex-1 h-px mx-2 mt-[-1.25rem]">
                  <div
                    className={`h-full transition-colors duration-500 ${
                      i < currentIdx || progress.stage === 'complete'
                        ? 'bg-green-600'
                        : i === currentIdx
                          ? 'bg-gradient-to-r from-accent to-border'
                          : 'bg-border'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {/* Message */}
      <p className="text-center text-sm text-gray-400">{progress.message}</p>
      {progress.stage === 'deep_analysis' && (
        <p className="text-center text-xs text-gray-600">Typically takes 30 seconds to 2 minutes depending on bugreport complexity</p>
      )}
      {onCancel && (
        <p className="text-center">
          <button onClick={onCancel} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Cancel
          </button>
        </p>
      )}
    </div>
  );
}
