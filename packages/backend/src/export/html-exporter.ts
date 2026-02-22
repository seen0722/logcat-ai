import { AnalysisResult, InsightCard } from '@logcat-ai/parser';

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

  const insightsHTML = result.insights.map(insight => `
    <div id="${escapeHtml(insight.id)}" class="insight-card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="severity-badge" style="background:${severityColor(insight.severity)};">
          ${insight.severity.toUpperCase()}
        </span>
        <span class="badge" style="background:rgba(99,102,241,0.2);color:#818cf8;">${escapeHtml(insight.category)}</span>
        <span class="badge" style="background:rgba(107,114,128,0.2);color:#9ca3af;">${escapeHtml(insight.source)}</span>
        ${insight.timestamp ? `<span style="font-size:12px;color:#6b7280;">${escapeHtml(insight.timestamp)}</span>` : ''}
      </div>
      <h3 style="font-weight:600;margin-bottom:8px;">${escapeHtml(insight.title)}</h3>
      <div class="insight-desc-block">
        ${renderDescription(insight.description)}
      </div>
      ${renderInsightExtras(insight)}
      ${insight.deepAnalysis ? renderDeepAnalysis(insight.deepAnalysis) : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logcat AI Report - ${escapeHtml(m.deviceModel || 'Unknown Device')}</title>
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;max-width:900px;margin:0 auto; }
  .header { margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #1e293b; }
  .header h1 { font-size:24px;margin-bottom:8px; }
  .header .meta { color:#94a3b8;font-size:14px; }
  .section { margin-bottom:32px; }
  .section h2 { font-size:18px;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b; }
  .health-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px; }
  .health-card { background:#1e293b;border-radius:8px;padding:16px;text-align:center; }
  .health-card .score { font-size:24px;font-weight:700; }
  .health-card .label { color:#94a3b8;font-size:12px;margin-top:4px; }
  .timeline-item { padding:8px 0;border-bottom:1px solid #1e293b;font-size:13px; }
  .timeline-item .time { color:#6b7280;font-family:monospace; }
  .footer { margin-top:32px;padding-top:16px;border-top:1px solid #1e293b;color:#6b7280;font-size:12px; }

  /* Insight cards */
  .insight-card { border:1px solid #374151;border-radius:8px;padding:16px;margin-bottom:12px;background:#1f2937; }
  .severity-badge { color:white;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600; }
  .badge { padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500; }
  .insight-desc { color:#9ca3af;font-size:14px; }
  .insight-desc-block { margin-bottom:8px; }
  .insight-desc-line { font-size:14px;line-height:1.5; }

  /* Detail sections */
  .detail-section { margin-top:12px; }
  .detail-label { font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px; }
  .code-block { padding:10px 12px;background:#111827;border-radius:6px;font-size:12px;color:#9ca3af;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-all;line-height:1.5;margin:0; }
  .selinux-rule { display:block;padding:8px 12px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.2);border-radius:6px;font-size:12px;color:#fcd34d;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace; }
  .debug-commands { display:flex;flex-direction:column;gap:4px; }
  .debug-cmd { display:block;padding:6px 10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);border-radius:4px;font-size:12px;color:#86efac;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace; }

  /* Deep Analysis */
  .deep-analysis { margin-top:12px;padding:12px;background:#111827;border:1px solid rgba(99,102,241,0.3);border-radius:8px; }
  .da-header { display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px; }
  .da-title { color:#818cf8;font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em; }
  .da-field { margin-bottom:10px; }
  .da-field:last-child { margin-bottom:0; }
  .da-field-label { font-size:11px;color:#6b7280;margin-bottom:2px; }
  .da-field-text { color:#d1d5db;font-size:14px;line-height:1.5; }
  .component-tags { display:flex;gap:4px;flex-wrap:wrap;margin-top:4px; }
  .component-tag { font-size:11px;background:rgba(107,114,128,0.3);color:#d1d5db;padding:2px 8px;border-radius:4px;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace; }
  .da-evidence-list { padding-left:16px;margin-top:4px; }
  .da-evidence-list li { font-size:12px;color:#9ca3af;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;line-height:1.6;white-space:pre-wrap; }
  .da-steps-list { padding-left:20px;margin-top:4px; }
  .da-steps-list li { font-size:12px;color:#d1d5db;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;line-height:1.6; }
  .related-tags { display:flex;gap:4px;flex-wrap:wrap;margin-top:4px; }
  .related-link { font-size:11px;color:#818cf8;background:rgba(99,102,241,0.1);padding:2px 8px;border-radius:4px;text-decoration:none; }
  .related-link:hover { background:rgba(99,102,241,0.2); }
</style>
</head>
<body>
  <div class="header">
    <h1>Logcat AI Analysis Report</h1>
    <div class="meta">
      ${m.deviceModel ? `<div>Device: ${escapeHtml(m.deviceModel)} (${escapeHtml(m.manufacturer || '')})</div>` : ''}
      ${m.androidVersion ? `<div>Android ${escapeHtml(m.androidVersion)} (SDK ${m.sdkLevel})</div>` : ''}
      ${m.buildFingerprint ? `<div>Build: ${escapeHtml(m.buildFingerprint)}</div>` : ''}
      <div>Generated: ${new Date().toISOString()}</div>
    </div>
  </div>

  <div class="section">
    <h2>Health Score</h2>
    <div class="health-grid">
      <div class="health-card">
        <div class="score" style="color:${h.overall >= 80 ? '#22c55e' : h.overall >= 60 ? '#eab308' : '#ef4444'}">${h.overall}</div>
        <div class="label">Overall</div>
      </div>
      <div class="health-card">
        <div class="score">${h.breakdown.stability}</div>
        <div class="label">Stability</div>
      </div>
      <div class="health-card">
        <div class="score">${h.breakdown.memory}</div>
        <div class="label">Memory</div>
      </div>
      <div class="health-card">
        <div class="score">${h.breakdown.responsiveness}</div>
        <div class="label">Responsiveness</div>
      </div>
    </div>
  </div>

  ${result.deepAnalysisOverview ? `
  <div class="section">
    <h2>Executive Summary</h2>
    <p style="color:#d1d5db;line-height:1.6;">${escapeHtml(result.deepAnalysisOverview.executiveSummary)}</p>
  </div>
  ` : ''}

  <div class="section">
    <h2>Insights (${result.insights.length})</h2>
    ${insightsHTML}
  </div>

  <div class="section">
    <h2>Timeline (${Math.min(result.timeline.length, 50)} of ${result.timeline.length} events)</h2>
    ${result.timeline.slice(0, 50).map(e => `
      <div class="timeline-item">
        <span class="time">${escapeHtml(e.timestamp || '')}</span>
        <span style="color:${severityColor(e.severity)};margin:0 8px;">[${e.severity}]</span>
        <span>${escapeHtml(e.label)}</span>
      </div>
    `).join('')}
  </div>

  <div class="footer">
    Generated by Logcat AI &middot; ${new Date().toISOString()}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
