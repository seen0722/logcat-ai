import { DeepAnalysisOverview as OverviewType } from '../lib/types';

interface Props {
  overview: OverviewType;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-green-500/20 text-green-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-gray-500/20 text-gray-400',
};

const EFFORT_STYLES: Record<string, string> = {
  low: 'bg-green-500/15 text-green-400',
  medium: 'bg-amber-500/15 text-amber-400',
  high: 'bg-red-500/15 text-red-400',
};

const IMPACT_STYLES: Record<string, string> = {
  low: 'bg-gray-500/15 text-gray-400',
  medium: 'bg-amber-500/15 text-amber-400',
  high: 'bg-red-500/15 text-red-400',
};

export default function DeepAnalysisOverview({ overview }: Props) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="card border border-indigo-500/30 bg-indigo-500/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-indigo-400 font-semibold text-sm uppercase tracking-wide">
            AI Deep Analysis
          </span>
        </div>
        <p className="text-gray-200 leading-relaxed">{overview.executiveSummary}</p>
        {overview.systemDiagnosis && (
          <p className="text-gray-400 text-sm mt-2 leading-relaxed">{overview.systemDiagnosis}</p>
        )}
      </div>

      {/* Correlation Findings */}
      {overview.correlationFindings.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
            Cross-System Correlations
          </h3>
          <div className="space-y-2">
            {overview.correlationFindings.map((finding, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-surface-hover/50">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${CONFIDENCE_STYLES[finding.confidence]}`}>
                  {finding.confidence}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-sm">{finding.description}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {finding.insightIds.map((id) => (
                      <a
                        key={id}
                        href={`#${id}`}
                        className="text-xs text-indigo-400/80 bg-indigo-500/10 px-1.5 py-0.5 rounded hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('ring-2', 'ring-indigo-500/50');
                            setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500/50'), 2000);
                          }
                        }}
                      >
                        {id}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prioritized Actions */}
      {overview.prioritizedActions.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
            Prioritized Actions
          </h3>
          <div className="space-y-2">
            {overview.prioritizedActions.map((action, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-surface-hover/50">
                <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-sm font-medium">{action.action}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{action.reason}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${EFFORT_STYLES[action.effort]}`}>
                      effort: {action.effort}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${IMPACT_STYLES[action.impact]}`}>
                      impact: {action.impact}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
