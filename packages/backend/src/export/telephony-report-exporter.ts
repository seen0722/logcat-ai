import {
  AnalysisResult,
  TelephonyParseResult,
  ServiceStateSnapshot,
  SignalStrengthSnapshot,
  OosEvent,
  RilError,
  CallEvent,
  SmsEvent,
  RatChangeEvent,
  DumpsysOosPeriod,
  TransportError,
  SimState,
} from '@logcat-ai/parser';
import { getReportCSS, getReportScript, THEME_TELEPHONY, escapeHtml } from './report-styles.js';

// Alias for brevity inside this module
const esc = escapeHtml;

// ============================================================
// Main Export Function
// ============================================================

export function exportTelephonyReport(result: AnalysisResult): string {
  const ts = result.telephonyStatus;
  if (!ts) return minimalReport(result, 'No telephony data available.');

  const meta = result.metadata;
  const sections: string[] = [];
  const tocEntries: Array<{ id: string; label: string }> = [];

  const addSection = (id: string, label: string, html: string) => {
    tocEntries.push({ id, label });
    const numMatch = label.match(/^(\d+)\.\s*/);
    const num = numMatch ? numMatch[1].padStart(2, '0') : '';
    const displayLabel = numMatch ? label.slice(numMatch[0].length) : label;
    sections.push(`<section id="${id}"><h2 data-num="${num}">${esc(displayLabel)}</h2>${html}</section>`);
  };

  // Section 1: Executive Summary
  const summaryHtml = renderExecutiveSummary(ts);
  if (summaryHtml) addSection('summary', '1. Executive Summary', summaryHtml);

  // Section 2: Service State & SIM
  addSection('service-state', '2. Service State & SIM', renderServiceState(ts));

  // Section 3: Signal Strength
  if (ts.signalStrength) {
    addSection('signal', '3. Signal Strength', renderSignalStrength(ts.signalStrength));
  }

  // Section 4: OOS Event History
  const oosHtml = renderOosHistory(ts);
  if (oosHtml) addSection('oos-history', '4. OOS Event History', oosHtml);

  // Section 5: RIL & Modem Errors
  const rilHtml = renderRilErrors(ts);
  if (rilHtml) addSection('ril-errors', '5. RIL & Modem Errors', rilHtml);

  // Section 6: Call & SMS Events
  const callSmsHtml = renderCallSmsEvents(ts);
  if (callSmsHtml) addSection('call-sms', '6. Call & SMS Events', callSmsHtml);

  // Section 7: RAT Changes
  if (ts.ratChanges.length > 0) {
    addSection('rat-changes', '7. RAT Changes', renderRatChanges(ts));
  }

  // Section 8: Findings & Recommendations
  const findingsHtml = renderFindings(ts);
  if (findingsHtml) addSection('findings', '8. Findings & Recommendations', findingsHtml);

  // Summary cards
  const summaryCards = renderSummaryCards(ts);

  return buildHtml(meta, summaryCards, tocEntries, sections.join('\n'));
}

// ============================================================
// HTML Shell
// ============================================================

function buildHtml(
  meta: AnalysisResult['metadata'],
  summaryCards: string,
  toc: Array<{ id: string; label: string }>,
  body: string,
): string {
  const title = `Telephony Analysis \u2014 ${esc(meta.deviceModel)}`;
  const tocHtml = toc.map(t => `<a href="#${t.id}" data-target="${t.id}">${esc(t.label)}</a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${getReportCSS(THEME_TELEPHONY)}
<style>
/* Telephony-specific supplemental styles */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 32px;
}
/* Summary card color variants */
.card-ok { border-left: 3px solid var(--green); }
.card-ok .metric-card { box-shadow: inset 0 0 24px var(--green-bg); }
.card-danger { border-left: 3px solid var(--red); }
.card-warn { border-left: 3px solid var(--amber); }
.card-info { border-left: 3px solid var(--accent); }
.card-ok .value { color: var(--green); }
.card-danger .value { color: var(--red); }
.card-warn .value { color: var(--amber); }
.card-info .value { color: var(--accent); }

/* h2 section number badge */
h2[data-num]::before {
  content: attr(data-num);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid rgba(212, 160, 106, 0.25);
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  margin-right: 8px;
}

/* Callouts */
.callout {
  background: var(--surface2);
  border-left: 3px solid var(--accent);
  padding: 12px 16px;
  margin: 12px 0;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.5;
}
.callout strong { color: var(--text); }
.callout code {
  font-family: var(--font-mono);
  background: var(--surface);
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
  word-break: break-all;
  white-space: pre-wrap;
}
.callout-warn { border-left-color: var(--amber); background: var(--amber-bg); }
.callout-danger { border-left-color: var(--red); background: var(--red-bg); }
.callout-ok { border-left-color: var(--green); background: var(--green-bg); }

/* Executive Summary */
.exec-summary {
  margin: 12px 0;
  padding-left: 0;
  list-style: none;
}
.exec-summary li {
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 1.55;
  padding: 8px 12px 8px 28px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  position: relative;
}
.exec-summary li::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
}
.exec-summary code {
  font-family: var(--font-mono);
  background: var(--surface2);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--accent-light);
}

/* State badges */
.state-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
}
.state-ok { background: var(--green-bg); color: var(--green); border: 1px solid rgba(34,197,94,0.2); }
.state-danger { background: var(--red-bg); color: var(--red); border: 1px solid rgba(239,68,68,0.2); }
.state-warn { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(245,158,11,0.2); }
.state-info { background: var(--accent-glow); color: var(--accent); border: 1px solid rgba(212,160,106,0.2); }

/* Signal bars */
.signal-display {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin: 12px 0 20px;
  padding: 16px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.signal-bars { display: flex; align-items: flex-end; gap: 4px; }
.signal-bar {
  width: 10px;
  background: var(--surface3);
  border-radius: 2px;
  transition: background 0.3s;
}
.signal-bar.filled { background: var(--accent); }
.signal-level {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  margin-left: 8px;
}
.signal-tech {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-left: 4px;
  align-self: center;
}

/* Table wrap */
.table-wrap {
  overflow-x: auto;
  margin: 8px 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
tbody tr:nth-child(even) td { background: rgba(255,255,255,0.012); }
tr:hover td { background: var(--accent-glow); }
tr.highlight td { background: var(--red-bg); }
tr.highlight-amber td { background: var(--amber-bg); }
td:first-child { color: var(--text-dim); }

/* Bar Charts */
.bar-chart { margin: 12px 0; }
.bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  padding: 4px 0;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.bar-row:hover { background: rgba(255,255,255,0.02); }
.bar-label {
  width: 180px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  flex: 1;
  height: 20px;
  background: var(--surface2);
  border-radius: 10px;
  overflow: hidden;
  margin: 0 12px;
}
.bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.bar-fill.bar-danger { background: linear-gradient(90deg, #b03030, var(--red)); }
.bar-fill.bar-warn { background: linear-gradient(90deg, #a07020, var(--amber)); }
.bar-fill.bar-ok { background: linear-gradient(90deg, #1a7040, var(--green)); }
.bar-fill.bar-info { background: linear-gradient(90deg, #a07020, var(--accent)); }
.bar-value {
  width: 60px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-align: right;
  flex-shrink: 0;
}

/* Priority heading accents */
h3.p0 { border-left: 3px solid var(--red); padding-left: 12px; color: var(--red); }
h3.p1 { border-left: 3px solid var(--amber); padding-left: 12px; color: var(--amber); }
h3.p2 { border-left: 3px solid var(--accent); padding-left: 12px; color: var(--accent-light); }

/* Scroll to top button */
.scroll-top {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s;
  z-index: 99;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.scroll-top.visible { opacity: 1; pointer-events: auto; }
.scroll-top:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

@media (max-width: 900px) {
  .summary-cards { grid-template-columns: repeat(2, 1fr); }
}
@media print {
  .scroll-top { display: none; }
  .state-badge { border: 1px solid currentColor; background: transparent; }
  .signal-display { background: #fafafa; border-color: #ddd; }
  .signal-bar { background: #ddd; }
  .signal-bar.filled { background: #888; }
  .callout { background: #f8f8fa; border-left-color: #aaa; }
  .exec-summary li { background: #fafafa; border-color: #eee; }
  .bar-track { background: #eee; }
}
</style>
</head>
<body>
<div class="page">
<nav class="toc">
  <h2>Logcat <span>AI</span></h2>
  ${tocHtml}
</nav>
<main>
<div class="report-header">
  <div class="type-badge">Telephony Analysis Report</div>
  <h1>Logcat <span class="brand">AI</span></h1>
  <div class="subtitle">
    <strong>${esc(meta.deviceModel)}</strong> &mdash; ${esc(meta.manufacturer)}<br>
    ${esc(meta.androidVersion)} (SDK ${meta.sdkLevel}) &bull; ${esc(meta.buildType)} build<br>
    ${meta.platform || meta.hardware ? `${esc(meta.platform || '')}${meta.hardware ? ` (${esc(meta.hardware)})` : ''} &bull; ` : ''}${meta.basebandVersion ? `Baseband: ${esc(meta.basebandVersion)} &bull; ` : ''}Report: ${esc(fmtTimestamp(meta.bugreportTimestamp))}
  </div>
</div>
${summaryCards}
${body}
<div class="footer">
  <span>Logcat <strong>AI</strong></span>
  <span>Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC</span>
</div>
</main>
</div>
<button class="scroll-top" aria-label="Scroll to top">&#x2191;</button>
<script>
const stb = document.querySelector('.scroll-top');
if (stb) {
  window.addEventListener('scroll', () => stb.classList.toggle('visible', window.scrollY > 400));
  stb.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
</script>
${getReportScript()}
</body>
</html>`;
}

function minimalReport(result: AnalysisResult, msg: string): string {
  return buildHtml(result.metadata, '', [], `<div class="callout">${esc(msg)}</div>`);
}

// ============================================================
// Summary Cards
// ============================================================

function renderSummaryCards(ts: TelephonyParseResult): string {
  const cards: string[] = [];

  // Voice State
  if (ts.serviceState) {
    const vs = ts.serviceState.voiceState;
    const cls = vs === 'IN_SERVICE' ? 'ok' : vs === 'OUT_OF_SERVICE' ? 'danger' : 'warn';
    cards.push(metricCard('Voice State', vs.replace(/_/g, ' '), ts.serviceState.operator, cls));
  }

  // SIM State
  const simCls = simStateClass(ts.simState);
  const simLabel = ts.simState ?? 'N/A';
  cards.push(metricCard('SIM State', simLabel, `Slot count: ${ts.simSlotCount}`, simCls));

  // OOS Count
  const dumpsysOosCount = ts.dumpsysOosPeriods?.length ?? 0;
  const radioOosCount = ts.oosEvents.filter(e => e.type === 'oos_start').length;
  const oosCount = dumpsysOosCount > 0 ? dumpsysOosCount : radioOosCount;
  const oosCls = oosCount >= 3 ? 'danger' : oosCount > 0 ? 'warn' : 'ok';
  const oosSource = dumpsysOosCount > 0 ? 'dumpsys' : 'radio log';
  cards.push(metricCard('OOS Events', String(oosCount), `Source: ${oosSource}`, oosCls));

  // Signal Level
  if (ts.signalStrength) {
    const lvl = ts.signalStrength.level;
    const cls = lvl <= 1 ? 'danger' : lvl <= 2 ? 'warn' : 'ok';
    cards.push(metricCard('Signal Level', `${lvl}/4`, ts.signalStrength.technology, cls));
  }

  if (cards.length === 0) return '';
  return `<div class="summary-cards card-grid">${cards.join('\n')}</div>`;
}

function metricCard(label: string, value: string, sub: string | undefined, cls: string): string {
  return `<div class="metric-card card-${cls}">
<div class="label">${esc(label)}</div>
<div class="value">${esc(value)}</div>
${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
</div>`;
}

// ============================================================
// Section Renderers
// ============================================================

function renderExecutiveSummary(ts: TelephonyParseResult): string {
  const bullets: string[] = [];

  // Voice/Data state
  if (ts.serviceState) {
    const { voiceState, dataState } = ts.serviceState;
    if (voiceState === 'OUT_OF_SERVICE' || dataState === 'OUT_OF_SERVICE') {
      bullets.push(`Device is <strong>out of service</strong> (voice: ${voiceState}, data: ${dataState}).`);
    } else {
      bullets.push(`Service state: voice <strong>${voiceState}</strong>, data <strong>${dataState}</strong>${ts.serviceState.rat ? ` on ${ts.serviceState.rat}` : ''}.`);
    }
  }

  // SIM state
  if (ts.simState === 'ABSENT') {
    bullets.push(`<strong>No SIM card detected.</strong> This is the primary root cause for out-of-service state.`);
  } else if (ts.simState === 'ERROR') {
    bullets.push(`SIM card is in <strong>ERROR</strong> state. The SIM may be damaged or incompatible.`);
  }

  // OOS count & duration
  const dumpsysPeriods = ts.dumpsysOosPeriods ?? [];
  const oosStarts = ts.oosEvents.filter(e => e.type === 'oos_start');
  const oosCount = dumpsysPeriods.length > 0 ? dumpsysPeriods.length : oosStarts.length;
  if (oosCount > 0) {
    const totalMs = dumpsysPeriods.length > 0
      ? dumpsysPeriods.reduce((sum, p) => sum + (p.durationMs || 0), 0)
      : ts.oosEvents.filter(e => e.type === 'oos_end').reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const durStr = totalMs > 0 ? ` with total duration <strong>${fmtMs(totalMs)}</strong>` : '';
    bullets.push(`<strong>${oosCount}</strong> out-of-service event${oosCount > 1 ? 's' : ''} detected${durStr}.`);
  }

  // Modem restarts
  const modemRestarts = ts.modemRestartCount ?? 0;
  if (modemRestarts > 0) {
    const reasons = ts.modemRestartReasons ?? [];
    const reasonStr = reasons.length > 0 ? ` Reason${reasons.length > 1 ? 's' : ''}: <code>${esc(reasons.join(', '))}</code>` : '';
    bullets.push(`<strong>${modemRestarts}</strong> modem restart${modemRestarts > 1 ? 's' : ''} detected.${reasonStr}`);
  }

  // Transport errors
  const transportErrors = ts.transportErrors ?? [];
  if (transportErrors.length > 0) {
    const enodevCount = transportErrors.filter(e => e.type === 'enodev').length;
    bullets.push(`<strong>${transportErrors.length}</strong> USB transport error${transportErrors.length > 1 ? 's' : ''} detected${enodevCount > 0 ? ` (${enodevCount} ENODEV)` : ''}, indicating modem USB disconnect.`);
  }

  // Signal quality
  if (ts.signalStrength) {
    const { level, technology, rsrp } = ts.signalStrength;
    const qualityStr = rsrp != null ? signalQuality(rsrp) : (level <= 1 ? 'Poor' : level <= 2 ? 'Fair' : 'Good');
    bullets.push(`Signal quality: <strong>${qualityStr}</strong> (level ${level}/4, ${technology}${rsrp != null ? `, RSRP ${rsrp} dBm` : ''}).`);
  }

  // RIL errors
  if (ts.rilErrors.length > 0) {
    bullets.push(`<strong>${ts.rilErrors.length}</strong> RIL/modem error${ts.rilErrors.length > 1 ? 's' : ''} recorded in radio log.`);
  }

  if (bullets.length === 0) return '';
  return `<ul class="exec-summary">${bullets.map(b => `<li>${b}</li>`).join('\n')}</ul>`;
}

function renderServiceState(ts: TelephonyParseResult): string {
  let html = '';

  if (ts.serviceState) {
    const ss = ts.serviceState;
    const voiceCls = stateColorClass(ss.voiceState);
    const dataCls = stateColorClass(ss.dataState);

    html += '<div class="table-wrap"><table><thead><tr><th>Parameter</th><th>Value</th></tr></thead><tbody>';
    html += `<tr><td>Voice State</td><td><span class="state-badge state-${voiceCls}">${esc(ss.voiceState)}</span></td></tr>`;
    html += `<tr><td>Data State</td><td><span class="state-badge state-${dataCls}">${esc(ss.dataState)}</span></td></tr>`;
    html += `<tr><td>Operator</td><td>${esc(ss.operator || 'N/A')}</td></tr>`;
    html += `<tr><td>MCC/MNC</td><td>${esc(ss.mccMnc || 'N/A')}</td></tr>`;
    html += `<tr><td>RAT</td><td>${esc(ss.rat || 'N/A')}</td></tr>`;
    html += `<tr><td>Roaming</td><td>${ss.roaming ? 'Yes' : 'No'}</td></tr>`;
    const simBadge = ts.simState ? `<span class="state-badge state-${simStateClass(ts.simState)}">${esc(ts.simState)}</span>` : 'N/A';
    html += `<tr><td>SIM State</td><td>${simBadge}</td></tr>`;
    html += `<tr><td>SIM Slot Count</td><td>${ts.simSlotCount}</td></tr>`;
    html += '</tbody></table></div>';
  } else {
    html += table(['Parameter', 'Value'], [
      ['SIM State', ts.simState ?? 'N/A'],
      ['SIM Slot Count', String(ts.simSlotCount)],
    ]);
  }

  if (ts.simState === 'ABSENT') {
    html += '<div class="callout callout-danger"><strong>No SIM card detected.</strong> Without a SIM card, voice and data services cannot function. Verify SIM insertion and tray contact.</div>';
  } else if (ts.simState === 'ERROR') {
    html += '<div class="callout callout-danger"><strong>SIM card error.</strong> The SIM card may be damaged, incorrectly inserted, or incompatible with this device.</div>';
  }

  return html;
}

function renderSignalStrength(sig: SignalStrengthSnapshot): string {
  let html = '';

  // Level bar
  const bars = Array.from({ length: 4 }, (_, i) => {
    const filled = i < sig.level;
    return `<span class="signal-bar${filled ? ' filled' : ''}" style="height:${8 + i * 6}px"></span>`;
  }).join('');
  html += `<div class="signal-display"><div class="signal-bars">${bars}</div><span class="signal-level">${sig.level}/4</span><span class="signal-tech">${esc(sig.technology)}</span></div>`;

  // Quality assessment
  if (sig.rsrp != null) {
    const quality = signalQuality(sig.rsrp);
    const cls = sig.rsrp >= -80 ? 'ok' : sig.rsrp >= -100 ? 'warn' : sig.rsrp >= -110 ? 'warn' : 'danger';
    html += `<div class="callout callout-${cls}">Signal quality: <strong>${quality}</strong> (RSRP ${sig.rsrp} dBm)</div>`;
  }

  // Metrics table
  const metrics: string[][] = [];
  if (sig.rsrp != null) metrics.push(['RSRP', `${sig.rsrp} dBm`, 'Reference Signal Received Power']);
  if (sig.rsrq != null) metrics.push(['RSRQ', `${sig.rsrq} dB`, 'Reference Signal Received Quality']);
  if (sig.sinr != null) metrics.push(['SINR', `${sig.sinr} dB`, 'Signal-to-Interference-plus-Noise Ratio']);
  if (sig.rssi != null) metrics.push(['RSSI', `${sig.rssi} dBm`, 'Received Signal Strength Indicator']);
  if (sig.rscp != null) metrics.push(['RSCP', `${sig.rscp} dBm`, 'Received Signal Code Power (WCDMA)']);
  if (sig.ecno != null) metrics.push(['Ec/No', `${sig.ecno} dB`, 'Energy per Chip over Noise (WCDMA)']);

  if (metrics.length > 0) {
    html += '<h3>Signal Metrics</h3>';
    html += table(['Metric', 'Value', 'Description'], metrics);
  }

  return html;
}

function renderOosHistory(ts: TelephonyParseResult): string {
  const dumpsysPeriods = ts.dumpsysOosPeriods ?? [];
  const hasRadioOos = ts.oosEvents.length > 0;

  if (dumpsysPeriods.length === 0 && !hasRadioOos) return '';

  let html = '';

  // Prefer dumpsys periods
  if (dumpsysPeriods.length > 0) {
    html += '<h3>OOS Periods (dumpsys \u2014 full uptime)</h3>';
    const rows = dumpsysPeriods.map((p, i) => [
      String(i + 1),
      esc(p.start),
      p.end ? esc(p.end) : '(ongoing)',
      p.durationMs != null ? fmtMs(p.durationMs) : 'N/A',
    ]);
    html += table(['#', 'Start', 'End', 'Duration'], rows);

    const totalMs = dumpsysPeriods.reduce((sum, p) => sum + (p.durationMs || 0), 0);
    if (totalMs > 0) {
      html += `<p>Total OOS duration: <strong>${fmtMs(totalMs)}</strong> across ${dumpsysPeriods.length} period${dumpsysPeriods.length > 1 ? 's' : ''}</p>`;
    }
  }

  // Radio log OOS events (always show if available as supplementary)
  if (hasRadioOos) {
    if (dumpsysPeriods.length > 0) {
      html += '<h3>OOS Events (radio log)</h3>';
    }
    const rows = ts.oosEvents.map((e, i) => [
      String(i + 1),
      esc(e.timestamp),
      esc(e.type),
      esc(e.domain),
      e.durationMs != null ? fmtMs(e.durationMs) : 'N/A',
    ]);
    html += table(['#', 'Timestamp', 'Type', 'Domain', 'Duration'], rows);
  }

  // Radio log coverage warning
  if (ts.radioLogTimeRange) {
    html += `<div class="callout">Radio log buffer coverage: <strong>${esc(ts.radioLogTimeRange.start)}</strong> to <strong>${esc(ts.radioLogTimeRange.end)}</strong>. Events outside this window are not captured in radio log OOS events.</div>`;
  }

  return html;
}

function renderRilErrors(ts: TelephonyParseResult): string {
  const hasRilErrors = ts.rilErrors.length > 0;
  const hasModemRestart = (ts.modemRestartCount ?? 0) > 0;
  const hasTransportErrors = (ts.transportErrors ?? []).length > 0;

  if (!hasRilErrors && !hasModemRestart && !hasTransportErrors) return '';

  let html = '';

  // Transport errors (critical — show first)
  if (hasTransportErrors) {
    const errors = ts.transportErrors!;
    const chain = errors.map(e => `[${esc(e.timestamp)}] ${esc(e.type)}: ${esc(e.message)}`).join('<br>');
    html += `<div class="callout callout-danger"><strong>USB Transport Error Chain (${errors.length} events)</strong><br><code>${chain}</code></div>`;
  }

  // Modem restart reasons
  if (hasModemRestart) {
    const reasons = ts.modemRestartReasons ?? [];
    const reasonStr = reasons.length > 0 ? reasons.join(', ') : 'unknown';
    html += `<div class="callout callout-warn"><strong>Modem Restarts: ${ts.modemRestartCount}</strong><br>Reason: <code>${esc(reasonStr)}</code></div>`;
  }

  if (hasRilErrors) {
    // Group by errorType for bar chart
    const grouped = new Map<string, number>();
    for (const err of ts.rilErrors) {
      grouped.set(err.errorType, (grouped.get(err.errorType) || 0) + 1);
    }
    const chartItems = Array.from(grouped.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ label: type, value: count, display: String(count) }));

    html += '<h3>Error Distribution</h3>';
    html += renderBarChart(chartItems);

    // Full error list
    html += '<h3>Error Log</h3>';
    const rows = ts.rilErrors.map((e, i) => [
      String(i + 1),
      esc(e.timestamp),
      esc(e.errorType),
      esc(truncate(e.message, 120)),
    ]);
    html += table(['#', 'Timestamp', 'Type', 'Message'], rows);
  }

  return html;
}

function renderCallSmsEvents(ts: TelephonyParseResult): string {
  const hasCalls = ts.callEvents.length > 0;
  const hasSms = ts.smsEvents.length > 0;
  if (!hasCalls && !hasSms) return '';

  let html = '';

  if (hasCalls) {
    // Call stats
    const totalCalls = ts.callEvents.filter(e => e.type === 'call_start').length;
    const drops = ts.callEvents.filter(e => e.type === 'call_drop').length;
    const failures = ts.callEvents.filter(e => e.type === 'call_fail').length;
    html += `<p>Total calls: <strong>${totalCalls}</strong>, Drops: <strong>${drops}</strong>, Failures: <strong>${failures}</strong></p>`;

    html += '<h3>Call Events</h3>';
    const rows = ts.callEvents.map((e, i) => [
      String(i + 1),
      esc(e.timestamp),
      esc(e.type),
      esc(e.failReason || '\u2014'),
    ]);
    html += table(['#', 'Timestamp', 'Type', 'Reason'], rows);
  }

  if (hasSms) {
    const sentOk = ts.smsEvents.filter(e => e.type === 'sms_send_success').length;
    const sentFail = ts.smsEvents.filter(e => e.type === 'sms_send_fail').length;
    const received = ts.smsEvents.filter(e => e.type === 'sms_receive').length;
    html += `<p>SMS sent: <strong>${sentOk}</strong>, Failed: <strong>${sentFail}</strong>, Received: <strong>${received}</strong></p>`;

    html += '<h3>SMS Events</h3>';
    const rows = ts.smsEvents.map((e, i) => [
      String(i + 1),
      esc(e.timestamp),
      esc(e.type),
      esc(e.failReason || '\u2014'),
    ]);
    html += table(['#', 'Timestamp', 'Type', 'Reason'], rows);
  }

  return html;
}

function renderRatChanges(ts: TelephonyParseResult): string {
  let html = '';

  if (ts.ratChanges.length >= 5) {
    html += `<div class="callout callout-warn"><strong>Frequent RAT switching detected (${ts.ratChanges.length} changes).</strong> This may indicate unstable network conditions or cell edge coverage issues, leading to increased battery consumption and potential call drops.</div>`;
  }

  const rows = ts.ratChanges.map((e, i) => [
    String(i + 1),
    esc(e.timestamp),
    esc(e.fromRat),
    esc(e.toRat),
  ]);
  html += table(['#', 'Timestamp', 'From', 'To'], rows);

  return html;
}

// ============================================================
// Findings & Recommendations (Rule-based)
// ============================================================

interface Finding {
  priority: 'P0' | 'P1' | 'P2';
  issue: string;
  evidence: string;
  recommendation: string;
}

function renderFindings(ts: TelephonyParseResult): string {
  const findings: Finding[] = [];

  // P0: SIM ABSENT + OOS
  if (ts.simState === 'ABSENT') {
    const isOos = ts.serviceState?.voiceState === 'OUT_OF_SERVICE' || ts.serviceState?.dataState === 'OUT_OF_SERVICE';
    if (isOos || !ts.serviceState) {
      findings.push({
        priority: 'P0',
        issue: 'No SIM card detected',
        evidence: `SIM state: ABSENT${ts.serviceState ? `, voice: ${ts.serviceState.voiceState}` : ''}`,
        recommendation: 'Verify SIM card insertion, check SIM tray contacts, and test with a known-good SIM.',
      });
    }
  }

  // P0: Transport errors (ENODEV)
  const transportErrors = ts.transportErrors ?? [];
  const enodevCount = transportErrors.filter(e => e.type === 'enodev').length;
  if (enodevCount > 0) {
    findings.push({
      priority: 'P0',
      issue: 'USB modem transport failure',
      evidence: `${enodevCount} ENODEV error${enodevCount > 1 ? 's' : ''} in transport layer`,
      recommendation: 'Check USB modem hardware connection, PCIE/USB link stability, and modem firmware. This typically indicates a physical disconnect.',
    });
  }

  // P0: Modem restart with "Modem removed"
  const modemReasons = ts.modemRestartReasons ?? [];
  if (modemReasons.some(r => r.toLowerCase().includes('modem removed'))) {
    findings.push({
      priority: 'P0',
      issue: 'Modem USB disconnect',
      evidence: `Modem restart reason: "${modemReasons.find(r => r.toLowerCase().includes('modem removed'))}"`,
      recommendation: 'Investigate USB/PCIE hardware path to modem. Check power management, voltage regulators, and connector integrity.',
    });
  }

  // P0: Modem crash (radio_crash)
  const modemCrashes = ts.rilErrors.filter(e => e.errorType === 'radio_crash');
  if (modemCrashes.length > 0) {
    findings.push({
      priority: 'P0',
      issue: 'Modem firmware crash',
      evidence: `${modemCrashes.length} radio crash event${modemCrashes.length > 1 ? 's' : ''}`,
      recommendation: 'Collect modem crash dump, update modem firmware, and check for known chipset errata.',
    });
  }

  // P1: OOS count >= 3
  const dumpsysOosCount = ts.dumpsysOosPeriods?.length ?? 0;
  const radioOosCount = ts.oosEvents.filter(e => e.type === 'oos_start').length;
  const oosCount = dumpsysOosCount > 0 ? dumpsysOosCount : radioOosCount;
  if (oosCount >= 3) {
    findings.push({
      priority: 'P1',
      issue: 'Frequent service outages',
      evidence: `${oosCount} OOS events detected`,
      recommendation: 'Investigate RF path, antenna connection, and network coverage. Cross-reference with modem restart events.',
    });
  }

  // P1: Modem errors >= 5
  const modemErrCount = ts.rilErrors.filter(e => e.errorType === 'modem_err').length;
  if (modemErrCount >= 5) {
    findings.push({
      priority: 'P1',
      issue: 'Frequent modem errors',
      evidence: `${modemErrCount} E_MODEM_ERR events`,
      recommendation: 'Check modem firmware version and known issues. Monitor modem temperature and power supply stability.',
    });
  }

  // P1: Call drops
  const callDrops = ts.callEvents.filter(e => e.type === 'call_drop').length;
  if (callDrops > 0) {
    findings.push({
      priority: 'P1',
      issue: 'Call stability issues',
      evidence: `${callDrops} call drop${callDrops > 1 ? 's' : ''} recorded`,
      recommendation: 'Check signal quality during call periods, RAT handover behavior, and VoLTE/CSFB configuration.',
    });
  }

  // P2: Weak signal
  if (ts.signalStrength && ts.signalStrength.level <= 1) {
    findings.push({
      priority: 'P2',
      issue: 'Poor signal quality',
      evidence: `Signal level ${ts.signalStrength.level}/4 on ${ts.signalStrength.technology}${ts.signalStrength.rsrp != null ? `, RSRP ${ts.signalStrength.rsrp} dBm` : ''}`,
      recommendation: 'Verify antenna path, check for RF interference, and compare with reference device at same location.',
    });
  }

  // P2: Frequent RAT changes
  if (ts.ratChanges.length >= 5) {
    findings.push({
      priority: 'P2',
      issue: 'Network instability',
      evidence: `${ts.ratChanges.length} RAT changes detected`,
      recommendation: 'Review network mode selection settings, band priority configuration, and cell reselection parameters.',
    });
  }

  if (findings.length === 0) {
    return '<div class="callout callout-ok">No critical telephony issues detected based on automated analysis.</div>';
  }

  let html = '';
  for (const prio of ['P0', 'P1', 'P2'] as const) {
    const items = findings.filter(f => f.priority === prio);
    if (items.length === 0) continue;
    const label = prio === 'P0' ? 'Critical' : prio === 'P1' ? 'High Priority' : 'Medium Priority';
    const cls = prio.toLowerCase();
    html += `<h3 class="${cls}">${prio}: ${label}</h3>`;
    html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Issue</th><th>Evidence</th><th>Recommendation</th></tr></thead><tbody>';
    items.forEach((f, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(f.issue)}</td><td>${esc(f.evidence)}</td><td>${esc(f.recommendation)}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  return html;
}

// ============================================================
// Utility Functions
// ============================================================

function table(headers: string[], rows: string[][]): string {
  const ths = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
  return `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function renderBarChart(items: Array<{ label: string; value: number; display: string }>): string {
  const max = Math.max(...items.map(i => i.value), 1);
  const rows = items.map(item => {
    const pct = (item.value / max) * 100;
    const cls = item.value > 66 ? 'bar-danger' : item.value > 33 ? 'bar-warn' : 'bar-ok';
    return `<div class="bar-row">
<span class="bar-label">${esc(item.label)}</span>
<div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
<span class="bar-value">${esc(item.display)}</span>
</div>`;
  });
  return `<div class="bar-chart">${rows.join('\n')}</div>`;
}

function fmtMs(ms: number): string {
  if (ms <= 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function fmtTimestamp(ts?: Date | string | null): string {
  if (!ts) return 'N/A';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offset) / 60));
  const om = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${sign}${oh}:${om})`;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

function signalQuality(rsrp: number): string {
  if (rsrp >= -80) return 'Excellent';
  if (rsrp >= -100) return 'Good';
  if (rsrp >= -110) return 'Fair';
  return 'Poor';
}

function stateColorClass(state: string): string {
  switch (state) {
    case 'IN_SERVICE': return 'ok';
    case 'OUT_OF_SERVICE': return 'danger';
    case 'EMERGENCY_ONLY':
    case 'POWER_OFF': return 'warn';
    default: return 'info';
  }
}

function simStateClass(simState?: SimState): string {
  if (!simState) return 'info';
  switch (simState) {
    case 'LOADED':
    case 'READY': return 'ok';
    case 'ABSENT':
    case 'ERROR': return 'danger';
    case 'NOT_READY':
    case 'UNKNOWN': return 'warn';
    default: return 'info';
  }
}
