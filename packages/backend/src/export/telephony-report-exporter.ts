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

  const scrollScript = `<script>
// Scroll-to-top button
const stb = document.querySelector('.scroll-top');
if (stb) {
  window.addEventListener('scroll', () => {
    stb.classList.toggle('visible', window.scrollY > 400);
  });
  stb.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
// TOC scroll spy
const tocLinks = document.querySelectorAll('.toc a[data-target]');
const sections = [];
tocLinks.forEach(a => {
  const s = document.getElementById(a.getAttribute('data-target'));
  if (s) sections.push({ el: s, link: a });
});
function updateToc() {
  let current = '';
  for (const s of sections) {
    if (s.el.getBoundingClientRect().top <= 120) current = s.link.getAttribute('data-target');
  }
  tocLinks.forEach(a => a.classList.toggle('active', a.getAttribute('data-target') === current));
}
window.addEventListener('scroll', updateToc, { passive: true });
updateToc();
</script>`;

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<header>
<div class="container">
<div class="header-title">
<div class="header-icon">\uD83D\uDCE1</div>
<h1>Telephony Analysis <span>\u2014 ${esc(meta.deviceModel)}</span></h1>
</div>
<div class="meta-grid">
<div class="meta-item"><span class="meta-label">Device</span><span class="meta-value">${esc(meta.deviceModel)}</span></div>
<div class="meta-item"><span class="meta-label">Manufacturer</span><span class="meta-value">${esc(meta.manufacturer)}</span></div>
<div class="meta-item"><span class="meta-label">Build</span><span class="meta-value">${esc(meta.buildFingerprint)}</span></div>
<div class="meta-item"><span class="meta-label">Build Type</span><span class="meta-value">${esc(meta.buildType)}</span></div>
<div class="meta-item"><span class="meta-label">Android</span><span class="meta-value">${esc(meta.androidVersion)} (SDK ${meta.sdkLevel})</span></div>
${meta.platform || meta.hardware ? `<div class="meta-item"><span class="meta-label">Platform</span><span class="meta-value">${esc(meta.platform || '')}${meta.hardware ? ` (${esc(meta.hardware)})` : ''}</span></div>` : ''}
${meta.basebandVersion ? `<div class="meta-item"><span class="meta-label">Baseband</span><span class="meta-value">${esc(meta.basebandVersion)}</span></div>` : ''}
<div class="meta-item"><span class="meta-label">Report Time</span><span class="meta-value">${esc(fmtTimestamp(meta.bugreportTimestamp))}</span></div>
</div>
</div>
</header>
<nav class="toc"><div class="toc-title">Contents</div>${tocHtml}</nav>
<button class="scroll-top" aria-label="Scroll to top">\u2191</button>
<div class="container">
${summaryCards}
${body}
</div>
<footer class="container">
<span class="brand">logcat-ai</span>
<span>Generated on ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC</span>
</footer>
${scrollScript}
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
    cards.push(card('Voice State', vs.replace(/_/g, ' '), ts.serviceState.operator, cls));
  }

  // SIM State
  const simCls = simStateClass(ts.simState);
  const simLabel = ts.simState ?? 'N/A';
  cards.push(card('SIM State', simLabel, `Slot count: ${ts.simSlotCount}`, simCls));

  // OOS Count
  const dumpsysOosCount = ts.dumpsysOosPeriods?.length ?? 0;
  const radioOosCount = ts.oosEvents.filter(e => e.type === 'oos_start').length;
  const oosCount = dumpsysOosCount > 0 ? dumpsysOosCount : radioOosCount;
  const oosCls = oosCount >= 3 ? 'danger' : oosCount > 0 ? 'warn' : 'ok';
  const oosSource = dumpsysOosCount > 0 ? 'dumpsys' : 'radio log';
  cards.push(card('OOS Events', String(oosCount), `Source: ${oosSource}`, oosCls));

  // Signal Level
  if (ts.signalStrength) {
    const lvl = ts.signalStrength.level;
    const cls = lvl <= 1 ? 'danger' : lvl <= 2 ? 'warn' : 'ok';
    cards.push(card('Signal Level', `${lvl}/4`, ts.signalStrength.technology, cls));
  }

  if (cards.length === 0) return '';
  return `<div class="summary-cards">${cards.join('\n')}</div>`;
}

function card(label: string, value: string, sub: string | undefined, cls: string): string {
  return `<div class="card card-${cls}">
<div class="card-label">${esc(label)}</div>
<div class="card-value">${esc(value)}</div>
${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ============================================================
// CSS (Dark Theme — Amber accent for telephony)
// ============================================================

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
:root {
  --bg: #0a0c10;
  --surface: #13161e;
  --surface2: #1b1f2b;
  --surface3: #222838;
  --border: #2a3040;
  --border-subtle: #1e2430;
  --text: #dce0ec;
  --text-dim: #7c8298;
  --text-muted: #555b72;
  --accent: #e8a840;
  --accent-bright: #f0c060;
  --accent-glow: rgba(232, 168, 64, 0.15);
  --red: #f06060;
  --red-glow: rgba(240, 96, 96, 0.12);
  --amber: #e8a840;
  --amber-glow: rgba(232, 168, 64, 0.12);
  --green: #50c878;
  --green-glow: rgba(80, 200, 120, 0.12);
  --cyan: #50c8c8;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --font-sans: 'DM Sans', system-ui, -apple-system, sans-serif;
  --radius: 10px;
  --radius-sm: 6px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  line-height: 1.65;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.container { max-width: 1100px; margin: 0 auto; padding: 0 2rem; }

/* Header */
header {
  position: relative;
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface2) 60%, rgba(232, 168, 64, 0.06) 100%);
  border-bottom: 1px solid var(--border);
  padding: 2.5rem 0 2rem;
  margin-bottom: 2rem;
  overflow: hidden;
}
header::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -10%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  pointer-events: none;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.2rem;
}
.header-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--accent) 0%, #d08020 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}
header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}
header h1 span {
  color: var(--accent-bright);
  font-weight: 500;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.5rem 2rem;
}
.meta-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.2rem 0;
}
.meta-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
  min-width: 5.5rem;
}
.meta-value {
  font-size: 0.82rem;
  color: var(--text-dim);
  word-break: break-all;
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 0.75rem;
  margin-bottom: 2.5rem;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.4rem;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.card:hover { border-color: var(--border-subtle); }
.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
}
.card-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.card-value {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0.4rem 0 0.15rem;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
.card-sub { font-size: 0.75rem; color: var(--text-muted); }
.card-danger::before { background: linear-gradient(90deg, var(--red), transparent); }
.card-danger { box-shadow: inset 0 0 30px var(--red-glow); }
.card-danger .card-value { color: var(--red); }
.card-warn::before { background: linear-gradient(90deg, var(--amber), transparent); }
.card-warn { box-shadow: inset 0 0 30px var(--amber-glow); }
.card-warn .card-value { color: var(--amber); }
.card-ok::before { background: linear-gradient(90deg, var(--green), transparent); }
.card-ok .card-value { color: var(--green); }
.card-info::before { background: linear-gradient(90deg, var(--accent), transparent); }

/* Sections */
section {
  margin-bottom: 2.5rem;
  animation: fadeUp 0.4s ease-out both;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 1rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
h2::before {
  content: attr(data-num);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-glow);
  border: 1px solid rgba(232, 168, 64, 0.2);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  letter-spacing: 0.04em;
}
h3 {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text);
  margin: 1.4rem 0 0.6rem;
}
h4 {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-dim);
  margin: 1rem 0 0.4rem;
}
h3.p0 {
  border-left: 3px solid var(--red);
  padding-left: 0.8rem;
  color: var(--red);
}
h3.p1 {
  border-left: 3px solid var(--amber);
  padding-left: 0.8rem;
  color: var(--amber);
}
h3.p2 {
  border-left: 3px solid var(--accent);
  padding-left: 0.8rem;
  color: var(--accent-bright);
}
p { margin: 0.5rem 0; }

/* Tables */
.table-wrap {
  overflow-x: auto;
  margin: 0.8rem 0 1.2rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  white-space: nowrap;
}
th {
  background: var(--surface2);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-weight: 600;
  text-align: left;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--border);
  text-transform: uppercase;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  position: sticky;
  top: 0;
  z-index: 1;
}
td {
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
  font-variant-numeric: tabular-nums;
}
tbody tr:nth-child(even) td { background: rgba(255,255,255, 0.015); }
tr:hover td { background: rgba(232, 168, 64, 0.05); }
tr.highlight td { background: var(--red-glow); }
tr.highlight-amber td { background: var(--amber-glow); }
td:first-child { color: var(--text-dim); }

/* Bar Charts */
.bar-chart { margin: 1rem 0; }
.bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
  padding: 0.35rem 0;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.bar-row:hover { background: rgba(255,255,255,0.02); }
.bar-label {
  width: 180px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
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
  margin: 0 0.8rem;
  position: relative;
}
.bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}
.bar-fill.bar-danger { background: linear-gradient(90deg, #d04040, var(--red)); }
.bar-fill.bar-warn { background: linear-gradient(90deg, #c08020, var(--amber)); }
.bar-fill.bar-ok { background: linear-gradient(90deg, #2a9050, var(--green)); }
.bar-fill.bar-info { background: linear-gradient(90deg, #c08020, var(--accent)); }
.bar-value {
  width: 80px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* Callouts */
.callout {
  background: var(--surface2);
  border-left: 3px solid var(--accent);
  padding: 0.9rem 1.1rem;
  margin: 1rem 0;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: 0.85rem;
  color: var(--text-dim);
  line-height: 1.5;
}
.callout strong { color: var(--text); }
.callout code {
  font-family: var(--font-mono);
  background: var(--surface);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.8rem;
  word-break: break-all;
  white-space: pre-wrap;
}
.callout-warn { border-left-color: var(--amber); background: var(--amber-glow); }
.callout-danger { border-left-color: var(--red); background: var(--red-glow); }
.callout-ok { border-left-color: var(--green); background: var(--green-glow); }

/* Executive Summary */
.exec-summary {
  margin: 1rem 0;
  padding-left: 0;
  list-style: none;
}
.exec-summary li {
  margin-bottom: 0.6rem;
  font-size: 0.9rem;
  line-height: 1.55;
  padding: 0.6rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  position: relative;
  padding-left: 2.2rem;
}
.exec-summary li::before {
  content: '';
  position: absolute;
  left: 1rem;
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
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  font-size: 0.8rem;
  color: var(--accent-bright);
}

/* State badges */
.state-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
}
.state-ok { background: var(--green-glow); color: var(--green); border: 1px solid rgba(80, 200, 120, 0.2); }
.state-danger { background: var(--red-glow); color: var(--red); border: 1px solid rgba(240, 96, 96, 0.2); }
.state-warn { background: var(--amber-glow); color: var(--amber); border: 1px solid rgba(232, 168, 64, 0.2); }
.state-info { background: var(--accent-glow); color: var(--accent); border: 1px solid rgba(232, 168, 64, 0.2); }

/* Signal bars */
.signal-display {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  margin: 1rem 0 1.5rem;
  padding: 1.2rem 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
}
.signal-bar {
  width: 10px;
  background: var(--surface3);
  border-radius: 2px;
  transition: background 0.3s;
}
.signal-bar.filled { background: var(--accent); }
.signal-level {
  font-family: var(--font-mono);
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
  line-height: 1;
  margin-left: 0.5rem;
}
.signal-tech {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
  margin-left: 0.25rem;
  align-self: center;
}

/* TOC */
.toc {
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: 240px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  font-size: 0.72rem;
  z-index: 100;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.toc::-webkit-scrollbar { width: 4px; }
.toc::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.toc-title {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.6rem;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.toc-title::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--accent);
  border-radius: 2px;
}
.toc a {
  display: block;
  color: var(--text-dim);
  text-decoration: none;
  padding: 0.3rem 0.5rem;
  margin: 0.05rem 0;
  border-radius: 4px;
  border-left: 2px solid transparent;
  transition: all 0.15s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc a:hover {
  color: var(--accent-bright);
  background: var(--accent-glow);
  border-left-color: var(--accent);
}
.toc a.active {
  color: var(--accent-bright);
  background: var(--accent-glow);
  border-left-color: var(--accent);
}

/* Scroll to top */
.scroll-top {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
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
  font-size: 1rem;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s;
  z-index: 99;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.scroll-top.visible { opacity: 1; pointer-events: auto; }
.scroll-top:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

/* Footer */
footer {
  padding: 2rem 0;
  margin-top: 2rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
footer .brand {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-dim);
}

/* Print */
@media (max-width: 1400px) { .toc { display: none; } }
@media print {
  .toc, .scroll-top { display: none; }
  body { background: white; color: #333; font-size: 11px; }
  .card, table, .callout, section { break-inside: avoid; }
  header { background: #f8f8fa; }
  header::before { display: none; }
  .card { box-shadow: none; border: 1px solid #ddd; }
  .card-danger .card-value, .card-warn .card-value, .card-ok .card-value { color: #333; }
  .card::before { display: none; }
  h2::before { background: #e8e8f0; color: #555; border-color: #ddd; }
  .table-wrap { border-color: #ddd; }
  th { background: #f0f0f4; color: #666; }
  td { border-color: #eee; }
  .callout { background: #f8f8fa; }
  .exec-summary li { background: #fafafa; border-color: #eee; }
  .state-badge { border-color: #ddd; background: #f0f0f4; color: #333; }
  .signal-display { background: #fafafa; border-color: #ddd; }
  .signal-bar { background: #ddd; }
  .signal-bar.filled { background: #888; }
}
`;
