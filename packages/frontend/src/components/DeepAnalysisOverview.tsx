import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DeepAnalysisOverview as OverviewType } from '../lib/types';
import { IconChevronDown } from './Icons';

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
  const hasDetails = overview.correlationFindings.length > 0 || overview.prioritizedActions.length > 0;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="card p-0 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-accent to-accent/30" />
        <div className="p-5 space-y-3">
          <h2 className="font-display text-lg text-gray-100">AI Deep Analysis</h2>
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-code:text-accent-light prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs text-gray-200 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{overview.executiveSummary}</ReactMarkdown>
          </div>
          {overview.systemDiagnosis && (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-code:text-accent-light prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs text-gray-400 text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{overview.systemDiagnosis}</ReactMarkdown>
            </div>
          )}
          {hasDetails && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors pt-1"
            >
              <IconChevronDown className={`w-3 h-3 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
              {showDetails ? 'Hide' : 'Show'} correlations & actions
            </button>
          )}
        </div>
      </div>

      {showDetails && (
        <>
          {/* Correlation Findings */}
          {overview.correlationFindings.length > 0 && (
            <div className="card">
              <h3 className="font-display text-base text-gray-200 mb-3">
                Cross-System Correlations
              </h3>
              <div className="space-y-2">
                {overview.correlationFindings.map((finding, i) => (
                  <div key={i} className="flex items-start gap-3 bg-surface rounded-xl p-3.5 border border-border/50">
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
                            className="text-xs text-accent/80 bg-accent/10 px-1.5 py-0.5 rounded hover:bg-accent/20 hover:text-accent-light transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              const el = document.getElementById(id);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                el.classList.add('ring-2', 'ring-accent/50');
                                setTimeout(() => el.classList.remove('ring-2', 'ring-accent/50'), 2000);
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
              <h3 className="font-display text-base text-gray-200 mb-3">
                Prioritized Actions
              </h3>
              <div className="space-y-2">
                {overview.prioritizedActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 bg-surface rounded-xl p-3.5 border border-border/50">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-sm font-medium">{action.action}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{action.reason}</p>
                      <div className="flex gap-2 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-md ${EFFORT_STYLES[action.effort]}`}>
                          effort: {action.effort}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-md ${IMPACT_STYLES[action.impact]}`}>
                          impact: {action.impact}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
