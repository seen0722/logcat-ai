import { AnalysisResult, InsightCard } from '@logcat-ai/parser';
import { getReportCSS, getReportScript, THEME_GENERAL, escapeHtml as sharedEscapeHtml, formatDate } from './report-styles.js';

// Re-export for internal use (keeps call sites unchanged)
const escapeHtml = sharedEscapeHtml;

/**
 * Prefix-to-color mapping for description lines, mirroring frontend LINE_STYLES.
 */
const LINE_COLOR_MAP: Record<string, string> = {
  'Subject:': '#9ca3af',
  'ANR in': '#d1d5db',
  'Target HAL:': '#fcd34d',
  'Suspected HAL:': '#fdba74',
  'Blocking chain:': '#fca5a5',
  'Deadlock': '#f87171',
  'Binder pool': '#fbbf24',
  'Occurred': '#6b7280',
};

function renderDescription(description: string): string {
  const lines = description.split('\n').filter(Boolean);
  if (lines.length <= 1) {
    return `<p class="insight-desc">${escapeHtml(description)}</p>`;
  }
  return lines.map(line => {
    const match = Object.entries(LINE_COLOR_MAP).find(([prefix]) => line.startsWith(prefix));
    const color = match ? match[1] : '#d1d5db';
    const extra = match && (match[0] === 'Target HAL:' || match[0] === 'Suspected HAL:' || match[0] === 'Blocking chain:')
      ? 'font-family:monospace;font-size:12px;' : '';
    const bold = match && match[0] === 'Deadlock' ? 'font-weight:500;' : '';
    return `<div class="insight-desc-line" style="color:${color};${extra}${bold}">${escapeHtml(line)}</div>`;
  }).join('\n');
}

function renderInsightExtras(insight: InsightCard): string {
  const parts: string[] = [];

  // Stack trace
  if (insight.stackTrace) {
    parts.push(`
      <div class="detail-section">
        <div class="detail-label">Stack Trace</div>
        <pre class="code-block">${escapeHtml(insight.stackTrace)}</pre>
      </div>
    `);
  }

  // Related log snippet
  if (insight.relatedLogSnippet) {
    parts.push(`
      <div class="detail-section">
        <div class="detail-label">Related Logs</div>
        <pre class="code-block">${escapeHtml(insight.relatedLogSnippet)}</pre>
      </div>
    `);
  }

  // SELinux allow rule
  if (insight.suggestedAllowRule) {
    parts.push(`
      <div class="detail-section">
        <div class="detail-label">SELinux Allow Rule</div>
        <code class="selinux-rule">${escapeHtml(insight.suggestedAllowRule)}</code>
      </div>
    `);
  }

  // Debug commands
  if (insight.debugCommands && insight.debugCommands.length > 0) {
    parts.push(`
      <div class="detail-section">
        <div class="detail-label">Suggested Debug Commands</div>
        <div class="debug-commands">
          ${insight.debugCommands.map(cmd =>
            `<code class="debug-cmd">$ ${escapeHtml(cmd)}</code>`
          ).join('\n')}
        </div>
      </div>
    `);
  }

  return parts.join('\n');
}

function renderDeepAnalysis(da: NonNullable<InsightCard['deepAnalysis']>): string {
  const confidenceColor =
    da.confidence === 'high' ? '#22c55e' :
    da.confidence === 'medium' ? '#eab308' : '#6b7280';

  const categoryColor =
    da.category === 'root_cause' ? 'background:rgba(239,68,68,0.2);color:#f87171;' :
    da.category === 'symptom' ? 'background:rgba(234,179,8,0.2);color:#fbbf24;' :
    'background:rgba(59,130,246,0.2);color:#60a5fa;';

  const categoryLabel =
    da.category === 'root_cause' ? 'Root Cause' :
    da.category === 'symptom' ? 'Symptom' :
    da.category === 'contributing_factor' ? 'Contributing Factor' : da.category;

  const sections: string[] = [];

  // Header with badges
  sections.push(`
    <div class="da-header">
      <span class="da-title">AI Deep Analysis</span>
      <span class="badge" style="background:${confidenceColor}33;color:${confidenceColor};">${da.confidence}</span>
      <span class="badge" style="${categoryColor}">${categoryLabel}</span>
    </div>
  `);

  // Root Cause
  sections.push(`
    <div class="da-field">
      <div class="da-field-label">Root Cause</div>
      <p class="da-field-text">${escapeHtml(da.rootCause)}</p>
    </div>
  `);

  // Fix Suggestion
  sections.push(`
    <div class="da-field">
      <div class="da-field-label">Fix Suggestion</div>
      <p class="da-field-text">${escapeHtml(da.fixSuggestion)}</p>
    </div>
  `);

  // Impact Assessment
  if (da.impactAssessment) {
    sections.push(`
      <div class="da-field">
        <div class="da-field-label">User Impact</div>
        <p class="da-field-text">${escapeHtml(da.impactAssessment)}</p>
      </div>
    `);
  }

  // Affected Components
  if (da.affectedComponents && da.affectedComponents.length > 0) {
    sections.push(`
      <div class="da-field">
        <div class="da-field-label">Affected Components</div>
        <div class="component-tags">
          ${da.affectedComponents.map(comp =>
            `<span class="component-tag">${escapeHtml(comp)}</span>`
          ).join('\n')}
        </div>
      </div>
    `);
  }

  // Evidence
  if (da.evidence && da.evidence.length > 0) {
    sections.push(`
      <div class="da-field">
        <div class="da-field-label">Evidence</div>
        <ul class="da-evidence-list">
          ${da.evidence.map(e =>
            `<li>${escapeHtml(e)}</li>`
          ).join('\n')}
        </ul>
      </div>
    `);
  }

  // Debugging Steps
  if (da.debuggingSteps && da.debuggingSteps.length > 0) {
    sections.push(`
      <div class="da-field">
        <div class="da-field-label">Debugging Steps</div>
        <ol class="da-steps-list">
          ${da.debuggingSteps.map(step =>
            `<li>${escapeHtml(step)}</li>`
          ).join('\n')}
        </ol>
      </div>
    `);
  }

  // Related Insights
  if (da.relatedInsights && da.relatedInsights.length > 0) {
    sections.push(`
      <div class="da-field">
        <div class="da-field-label">Related Insights</div>
        <div class="related-tags">
          ${da.relatedInsights.map(id =>
            `<a href="#${escapeHtml(id)}" class="related-link">${escapeHtml(id)}</a>`
          ).join('\n')}
        </div>
      </div>
    `);
  }

  return `
    <div class="deep-analysis">
      ${sections.join('\n')}
    </div>
  `;
}

export function exportAsHTML(result: AnalysisResult): string {
  const m = result.metadata;
  const h = result.healthScore;

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return '#ef4444';
      case 'warning': return '#eab308';
      default: return '#6b7280';
    }
  };

  const scoreColor = (score: number) =>
    score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

  const insightsHTML = result.insights.map(insight => `
    <div id="${escapeHtml(insight.id)}" class="insight-card ${escapeHtml(insight.severity)}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="badge badge-${escapeHtml(insight.severity === 'info' ? 'info' : insight.severity === 'warning' ? 'warning' : 'critical')}">
          ${insight.severity.toUpperCase()}
        </span>
        <span class="badge" style="background:rgba(99,102,241,0.2);color:#818cf8;">${escapeHtml(insight.category)}</span>
        <span class="badge" style="background:rgba(107,114,128,0.2);color:#9ca3af;">${escapeHtml(insight.source)}</span>
        ${insight.timestamp ? `<span style="font-size:12px;color:var(--text-muted);">${escapeHtml(insight.timestamp)}</span>` : ''}
      </div>
      <h3 style="margin-bottom:8px;">${escapeHtml(insight.title)}</h3>
      <div class="insight-desc-block">
        ${renderDescription(insight.description)}
      </div>
      ${renderInsightExtras(insight)}
      ${insight.deepAnalysis ? renderDeepAnalysis(insight.deepAnalysis) : ''}
    </div>
  `).join('');

  // Build TOC entries for all sections
  const hasSummary = !!result.deepAnalysisOverview;
  const tocEntries = [
    '<a href="#section-health">Health Score</a>',
    ...(hasSummary ? ['<a href="#section-summary">Executive Summary</a>'] : []),
    `<a href="#section-insights">Insights (${result.insights.length})</a>`,
    `<a href="#section-timeline">Timeline</a>`,
  ].join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logcat AI Report — ${escapeHtml(m.deviceModel || 'Unknown Device')}</title>
${getReportCSS(THEME_GENERAL)}
<style>
  /* Insight-specific extras not in shared CSS */
  .insight-desc-block { margin-bottom: 8px; }
  .da-evidence-list { padding-left: 16px; margin-top: 4px; }
  .da-evidence-list li { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); line-height: 1.6; white-space: pre-wrap; }
  .da-steps-list { padding-left: 20px; margin-top: 4px; }
  .da-steps-list li { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); line-height: 1.6; }
  .related-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .related-link { font-size: 11px; color: var(--accent); background: var(--accent-glow); padding: 2px 8px; border-radius: var(--radius-sm); text-decoration: none; }
  .related-link:hover { opacity: 0.8; }
  .timeline-item { padding: 8px 0; border-bottom: 1px solid var(--border-subtle); font-size: 13px; }
  .timeline-item .time { color: var(--text-muted); font-family: var(--font-mono); }
</style>
</head>
<body>
<div class="page">
  <nav class="toc">
    <h2>Logcat <span>AI</span></h2>
    ${tocEntries}
  </nav>
  <main>
    <div class="report-header">
      <div class="type-badge">${escapeHtml(THEME_GENERAL.reportType)} &mdash; ${result.deepAnalysisOverview ? 'AI Deep' : 'Quick'}</div>
      <h1>Logcat <span class="brand">AI</span></h1>
      <div class="subtitle">
        ${m.deviceModel ? `<div>Device: ${escapeHtml(m.deviceModel)}${m.manufacturer ? ` (${escapeHtml(m.manufacturer)})` : ''}</div>` : ''}
        ${m.androidVersion ? `<div>Android ${escapeHtml(m.androidVersion)} (SDK ${m.sdkLevel})</div>` : ''}
        ${m.buildFingerprint ? `<div>Build: ${escapeHtml(m.buildFingerprint)}</div>` : ''}
        ${m.platform || m.hardware ? `<div>Platform: ${escapeHtml(m.platform || '')}${m.hardware ? ` (${escapeHtml(m.hardware)})` : ''}</div>` : ''}
        ${m.kernelVersion && m.kernelVersion !== 'unknown' ? `<div>Kernel: ${escapeHtml(m.kernelVersion)}</div>` : ''}
        ${m.basebandVersion ? `<div>Baseband: ${escapeHtml(m.basebandVersion)}</div>` : ''}
        ${m.securityPatchLevel ? `<div>Security Patch: ${escapeHtml(m.securityPatchLevel)}</div>` : ''}
        <div>Generated: ${formatDate(new Date())}</div>
      </div>
    </div>

    <h2 id="section-health">Health Score</h2>
    <div class="card-grid card-grid-4">
      <div class="metric-card">
        <div class="label">Overall</div>
        <div class="value" style="color:${scoreColor(h.overall)}">${h.overall}</div>
      </div>
      <div class="metric-card">
        <div class="label">Stability</div>
        <div class="value" style="color:${scoreColor(h.breakdown.stability)}">${h.breakdown.stability}</div>
      </div>
      <div class="metric-card">
        <div class="label">Memory</div>
        <div class="value" style="color:${scoreColor(h.breakdown.memory)}">${h.breakdown.memory}</div>
      </div>
      <div class="metric-card">
        <div class="label">Responsiveness</div>
        <div class="value" style="color:${scoreColor(h.breakdown.responsiveness)}">${h.breakdown.responsiveness}</div>
      </div>
    </div>

    ${result.deepAnalysisOverview ? `
    <h2 id="section-summary">Executive Summary</h2>
    <div class="card">
      <p style="color:var(--text-dim);line-height:1.7;">${escapeHtml(result.deepAnalysisOverview.executiveSummary)}</p>
    </div>
    ` : ''}

    <h2 id="section-insights">Insights (${result.insights.length})</h2>
    ${insightsHTML}

    <h2 id="section-timeline">Timeline (${Math.min(result.timeline.length, 50)} of ${result.timeline.length} events)</h2>
    ${result.timeline.slice(0, 50).map(e => `
      <div class="timeline-item">
        <span class="time">${escapeHtml(e.timestamp || '')}</span>
        <span style="color:${severityColor(e.severity)};margin:0 8px;">[${e.severity}]</span>
        <span>${escapeHtml(e.label)}</span>
      </div>
    `).join('')}

    <div class="footer">
      Generated by Logcat AI &middot; ${formatDate(new Date())}
    </div>
  </main>
</div>
${getReportScript()}
</body>
</html>`;
}
