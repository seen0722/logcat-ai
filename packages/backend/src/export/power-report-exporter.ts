import {
  AnalysisResult,
  PowerParseResult,
  PowerManagerState,
  DozeState,
  DozeSettings,
  BatteryStatsSummary,
  KernelWakeLockStat,
  AlarmWakeupStat,
  SuspendStats,
  EstimatedPowerUse,
  ConnectivityStats,
  PartialWakeLockStat,
} from '@logcat-ai/parser';
import { getReportCSS, getReportScript, THEME_POWER, escapeHtml } from './report-styles.js';

// ============================================================
// Main Export Function
// ============================================================

export function exportPowerReport(result: AnalysisResult): string {
  const ps = result.powerStatus;
  if (!ps) return minimalReport(result, 'No power management data available.');

  const meta = result.metadata;
  const sections: string[] = [];
  const tocEntries: Array<{ id: string; label: string }> = [];

  const addSection = (id: string, label: string, html: string) => {
    tocEntries.push({ id, label });
    // Extract section number from label (e.g., "1. Foo" → "01") and strip it from display text
    const numMatch = label.match(/^(\d+)\.\s*/);
    const num = numMatch ? numMatch[1].padStart(2, '0') : '';
    const displayLabel = numMatch ? label.slice(numMatch[0].length) : label;
    sections.push(`<section id="${id}"><h2 data-num="${num}">${esc(displayLabel)}</h2>${html}</section>`);
  };

  // Section 1: Executive Summary
  const summaryHtml = renderExecutiveSummary(ps);
  if (summaryHtml) addSection('summary', '1. Executive Summary', summaryHtml);

  // Section 2: Power Manager State
  if (ps.powerManagerState) {
    addSection('power-manager', '2. Power Manager State Snapshot', renderPowerManager(ps.powerManagerState));
  }

  // Section 3: Battery Statistics
  if (ps.batteryStats) {
    addSection('battery-stats', '3. Battery Statistics', renderBatteryStats(ps.batteryStats, ps.connectivityStats));
  }

  // Section 4: Suspend/Resume
  if (ps.suspendStats && ps.suspendStats.totalSuspendAttempts > 0) {
    addSection('suspend', '4. Kernel Suspend/Resume Analysis', renderSuspendStats(ps.suspendStats));
  }

  // Section 5: Kernel Wakelocks
  if (ps.kernelWakeLocks.length > 0) {
    addSection('kernel-wakelocks', '5. Kernel Wake Lock Analysis', renderKernelWakeLocks(ps.kernelWakeLocks));
  }

  // Section 6: Partial Wakelocks
  const partialHtml = renderPartialWakeLocks(ps.partialWakeLocks);
  addSection('partial-wakelocks', '6. Application-Level Partial Wake Locks', partialHtml);

  // Section 7: Alarm Wakeups
  if (ps.alarmWakeups && ps.alarmWakeups.length > 0) {
    addSection('alarms', '7. Alarm Manager Wakeup Analysis', renderAlarmWakeups(ps.alarmWakeups, ps.batteryStats));
  }

  // Section 8: Doze State
  if (ps.dozeState) {
    addSection('doze', '8. Device Idle (Doze) State', renderDozeState(ps.dozeState, ps.dozeSettings));
  }

  // Section 9: Estimated Power
  const powerHtml = renderEstimatedPower(ps.estimatedPowerUse, ps.batteryStats);
  addSection('estimated-power', '9. Estimated Power Consumption', powerHtml);

  // Section 10: Findings
  const findingsHtml = renderFindings(ps);
  if (findingsHtml) addSection('findings', '10. Findings & Recommendations', findingsHtml);

  // Section 11: Data Sources
  addSection('data-sources', '11. Data Sources Used', renderDataSources(ps));

  // Summary cards
  const summaryCards = renderSummaryCards(ps);

  const isDeep = !!result.deepAnalysisOverview;
  return buildHtml(meta, summaryCards, tocEntries, sections.join('\n'), isDeep);
}

// ============================================================
// HTML Shell
// ============================================================

function buildHtml(
  meta: AnalysisResult['metadata'],
  summaryCards: string,
  toc: Array<{ id: string; label: string }>,
  body: string,
  isDeep = false,
): string {
  const title = `Power Management Analysis — ${esc(meta.deviceModel)}`;
  const tocHtml = toc.map(t => `<a href="#${t.id}" data-target="${t.id}">${esc(t.label)}</a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${getReportCSS(THEME_POWER)}
<style>
/* Power report-specific styles */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 32px;
}
.card-danger { border-left: 4px solid var(--red); box-shadow: inset 0 0 30px rgba(239,68,68,0.08); }
.card-danger .metric-card-value { color: var(--red); }
.card-warn { border-left: 4px solid var(--amber); box-shadow: inset 0 0 30px rgba(245,158,11,0.08); }
.card-warn .metric-card-value { color: var(--amber); }
.card-ok { border-left: 4px solid var(--green); }
.card-ok .metric-card-value { color: var(--green); }
.card-info { border-left: 4px solid var(--accent); }
.metric-card-value {
  font-size: 22px; font-weight: 700;
  color: #fff;
  margin: 6px 0 3px;
  line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis;
}
.metric-card-sub { font-size: 11px; color: var(--text-muted); }
.table-wrap {
  overflow-x: auto;
  margin: 8px 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
tr.highlight td { background: rgba(239,68,68,0.08); }
tr.highlight-amber td { background: rgba(245,158,11,0.08); }
.bar-chart { margin: 12px 0; }
.bar-row {
  display: flex; align-items: center;
  margin-bottom: 6px; padding: 4px 0;
  border-radius: var(--radius-sm);
}
.bar-label {
  width: 150px; font-family: var(--font-mono);
  font-size: 12px; color: var(--text-dim);
  flex-shrink: 0; overflow: hidden; text-overflow: ellipsis;
}
.bar-track {
  flex: 1; height: 20px; background: var(--surface2);
  border-radius: 10px; overflow: hidden; margin: 0 12px;
}
.bar-fill { height: 100%; border-radius: 10px; }
.bar-fill.bar-danger { background: linear-gradient(90deg, #b03030, var(--red)); }
.bar-fill.bar-warn { background: linear-gradient(90deg, #b07020, var(--amber)); }
.bar-fill.bar-ok { background: linear-gradient(90deg, #207040, var(--green)); }
.bar-fill.bar-info { background: linear-gradient(90deg, #2a5fcc, var(--accent)); }
.bar-value {
  width: 130px; font-family: var(--font-mono);
  font-size: 12px; font-weight: 600;
  color: var(--text); text-align: right; flex-shrink: 0;
}
.callout {
  background: var(--surface2);
  border-left: 3px solid var(--accent);
  padding: 12px 16px; margin: 12px 0;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: 13px; color: var(--text-dim); line-height: 1.5;
}
.callout strong { color: var(--text); }
.callout-warn { border-left-color: var(--amber); background: rgba(245,158,11,0.08); }
.callout-danger { border-left-color: var(--red); background: rgba(239,68,68,0.08); }
.callout-ok { border-left-color: var(--green); background: rgba(34,197,94,0.08); }
.exec-summary { margin: 12px 0; padding-left: 0; list-style: none; }
.exec-summary li {
  margin-bottom: 8px; font-size: 13px; line-height: 1.55;
  padding: 8px 12px 8px 32px;
  background: var(--surface); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm); position: relative;
}
.exec-summary li::before {
  content: ''; position: absolute; left: 14px; top: 50%;
  transform: translateY(-50%);
  width: 6px; height: 6px; background: var(--accent); border-radius: 50%;
}
.exec-summary code {
  font-family: var(--font-mono); background: var(--surface2);
  padding: 2px 6px; border-radius: 3px;
  font-size: 12px; color: var(--accent-light);
}
.diff-changed {
  display: inline-block; font-family: var(--font-mono);
  font-size: 11px; font-weight: 600; padding: 2px 7px;
  border-radius: 3px; background: rgba(245,158,11,0.1);
  color: var(--amber); border: 1px solid rgba(245,158,11,0.2);
}
.diff-default { display: inline-block; font-size: 11px; color: var(--text-muted); padding: 2px 7px; }
h3.p0 { border-left: 3px solid var(--red); padding-left: 12px; color: var(--red); }
h3.p1 { border-left: 3px solid var(--amber); padding-left: 12px; color: var(--amber); }
h3.p2 { border-left: 3px solid var(--accent); padding-left: 12px; color: var(--accent-light); }
.meta-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 4px 24px; margin-top: 16px;
}
.meta-item { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.meta-label {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 1px; flex-shrink: 0; min-width: 80px;
}
.meta-value { font-size: 12px; color: var(--text-dim); word-break: break-all; }
.scroll-top {
  position: fixed; bottom: 24px; right: 24px;
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text-dim); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; opacity: 0; pointer-events: none;
  transition: all 0.2s; z-index: 99;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.scroll-top.visible { opacity: 1; pointer-events: auto; }
.scroll-top:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
section { margin-bottom: 40px; }
h4 {
  font-family: var(--font-display); font-size: 13px; font-weight: 400;
  color: var(--text-dim); margin: 12px 0 6px;
}
p { margin: 6px 0; }
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
<div class="type-badge">Power Management Report &mdash; ${isDeep ? 'AI Deep' : 'Quick'}</div>
<h1>Logcat <span class="brand">AI</span></h1>
<div class="report-header subtitle" style="margin-top:4px">${esc(meta.deviceModel)} &mdash; ${esc(meta.manufacturer)}</div>
<div class="meta-grid">
<div class="meta-item"><span class="meta-label">Device</span><span class="meta-value">${esc(meta.deviceModel)}</span></div>
<div class="meta-item"><span class="meta-label">Manufacturer</span><span class="meta-value">${esc(meta.manufacturer)}</span></div>
<div class="meta-item"><span class="meta-label">Build</span><span class="meta-value">${esc(meta.buildFingerprint)}</span></div>
<div class="meta-item"><span class="meta-label">Build Type</span><span class="meta-value">${esc(meta.buildType)}</span></div>
<div class="meta-item"><span class="meta-label">Android</span><span class="meta-value">${esc(meta.androidVersion)} (SDK ${meta.sdkLevel})</span></div>
${meta.platform || meta.hardware ? `<div class="meta-item"><span class="meta-label">Platform</span><span class="meta-value">${esc(meta.platform || '')}${meta.hardware ? ` (${esc(meta.hardware)})` : ''}</span></div>` : ''}
${meta.kernelVersion && meta.kernelVersion !== 'unknown' ? `<div class="meta-item"><span class="meta-label">Kernel</span><span class="meta-value">${esc(meta.kernelVersion)}</span></div>` : ''}
${meta.basebandVersion ? `<div class="meta-item"><span class="meta-label">Baseband</span><span class="meta-value">${esc(meta.basebandVersion)}</span></div>` : ''}
${meta.securityPatchLevel ? `<div class="meta-item"><span class="meta-label">Sec Patch</span><span class="meta-value">${esc(meta.securityPatchLevel)}</span></div>` : ''}
<div class="meta-item"><span class="meta-label">Report Time</span><span class="meta-value">${esc(fmtTimestamp(meta.bugreportTimestamp))}</span></div>
</div>
</div>
<button class="scroll-top" aria-label="Scroll to top">\u2191</button>
${summaryCards}
${body}
<div class="footer">
<span>Logcat <strong>AI</strong></span>
<span>Generated on ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC</span>
</div>
</main>
</div>
<script>
const stb = document.querySelector('.scroll-top');
if (stb) {
  window.addEventListener('scroll', () => { stb.classList.toggle('visible', window.scrollY > 400); });
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

function renderSummaryCards(ps: PowerParseResult): string {
  const cards: string[] = [];

  // Time period
  if (ps.batteryStats?.timePeriod) {
    cards.push(card('Time on Battery', ps.batteryStats.timePeriod, undefined, 'info'));
  }

  // Deep Doze discharge rate
  if (ps.batteryStats && ps.batteryStats.deepDozeDischargeRateMahPerHr > 0) {
    const rate = ps.batteryStats.deepDozeDischargeRateMahPerHr;
    const cls = rate > 40 ? 'danger' : rate > 20 ? 'warn' : 'ok';
    cards.push(card('Deep Doze Rate', `${rate.toFixed(1)} mAh/h`, 'Ideal: < 20 mAh/h', cls));
  }

  // Suspend success rate
  if (ps.suspendStats && ps.suspendStats.totalSuspendAttempts > 0) {
    const rate = ps.suspendStats.suspendSuccessRate;
    const cls = rate < 50 ? 'danger' : rate < 80 ? 'warn' : 'ok';
    cards.push(card('Suspend Success', `${rate.toFixed(1)}%`, `${ps.suspendStats.totalSuspendAttempts} attempts`, cls));
  }

  // Top kernel wakelock
  if (ps.kernelWakeLocks.length > 0) {
    const top = ps.kernelWakeLocks[0];
    cards.push(card('Top Kernel Wakelock', top.name, fmtMs(top.totalTimeMs), 'info'));
  }

  if (cards.length === 0) return '';
  return `<div class="summary-cards">${cards.join('\n')}</div>`;
}

function card(label: string, value: string, sub: string | undefined, cls: string): string {
  return `<div class="metric-card card-${cls}">
<div class="label">${esc(label)}</div>
<div class="metric-card-value">${esc(value)}</div>
${sub ? `<div class="metric-card-sub">${esc(sub)}</div>` : ''}
</div>`;
}

// ============================================================
// Section Renderers
// ============================================================

function renderExecutiveSummary(ps: PowerParseResult): string {
  const bullets: string[] = [];

  // Deep Doze rate
  if (ps.batteryStats && ps.batteryStats.deepDozeDischargeRateMahPerHr > 0) {
    const rate = ps.batteryStats.deepDozeDischargeRateMahPerHr;
    const ratio = (rate / 20).toFixed(1);
    if (rate > 20) {
      bullets.push(`Deep Doze discharge rate is <strong>${rate.toFixed(1)} mAh/h</strong> (${ratio}x the ideal &lt;20 mAh/h target), indicating significant background power drain.`);
    } else {
      bullets.push(`Deep Doze discharge rate is <strong>${rate.toFixed(1)} mAh/h</strong>, within the ideal &lt;20 mAh/h target.`);
    }
  }

  // Suspend abort
  if (ps.suspendStats && ps.suspendStats.totalSuspendAttempts > 0) {
    const { suspendSuccessRate, topAbortSources } = ps.suspendStats;
    if (suspendSuccessRate < 80 && topAbortSources.length > 0) {
      const top = topAbortSources[0];
      bullets.push(`Suspend success rate is <strong>${suspendSuccessRate.toFixed(1)}%</strong>. Top abort source: <code>${esc(top.name)}</code> (${top.percentage.toFixed(1)}% of aborts).`);
    } else if (suspendSuccessRate >= 80) {
      bullets.push(`Suspend success rate is healthy at <strong>${suspendSuccessRate.toFixed(1)}%</strong>.`);
    }
  }

  // Top kernel wakelock
  if (ps.kernelWakeLocks.length > 0) {
    const top = ps.kernelWakeLocks[0];
    bullets.push(`Top kernel wakelock: <code>${esc(top.name)}</code> held for <strong>${fmtMs(top.totalTimeMs)}</strong> across ${top.count} acquisitions.`);
  }

  // Connectivity anomaly
  if (ps.connectivityStats) {
    const cs = ps.connectivityStats;
    const totalBytes = cs.wifiDataRxBytes + cs.wifiDataTxBytes;
    if (totalBytes > 500_000_000) { // >500MB
      bullets.push(`WiFi transferred <strong>${fmtBytes(totalBytes)}</strong> total — investigate background data activity.`);
    }
  }

  if (bullets.length === 0) return '';
  return `<ul class="exec-summary">${bullets.map(b => `<li>${b}</li>`).join('\n')}</ul>`;
}

function renderPowerManager(pm: PowerManagerState): string {
  const rows = [
    ['mWakefulness', pm.wakefulness],
    ['mIsPowered', String(pm.isPowered)],
    ['mPlugType', pm.plugType === 1 ? '1 (AC)' : pm.plugType === 2 ? '2 (USB)' : pm.plugType === 4 ? '4 (Wireless)' : String(pm.plugType)],
    ['mBatteryLevel', `${pm.batteryLevel}%`],
    ['mLastSleepReason', pm.lastSleepReason || 'N/A'],
    ['mScreenOffTimeout', `${pm.screenOffTimeout}ms (${(pm.screenOffTimeout / 1000).toFixed(0)}s)`],
    ['mUseAutoSuspend', String(pm.useAutoSuspend)],
  ];

  let html = table(['Parameter', 'Value'], rows);

  // Wake locks
  if (pm.activeWakeLocks.length > 0) {
    html += '<h3>Active Wake Locks</h3>';
    html += table(
      ['Type', 'Tag', 'UID', 'PID', 'Duration'],
      pm.activeWakeLocks.map(l => [l.type, l.tag, String(l.uid), String(l.pid), l.duration || 'N/A']),
    );
  } else {
    html += '<div class="callout callout-ok">No active wake locks at snapshot time.</div>';
  }

  // Suspend blockers
  if (pm.suspendBlockers.length > 0) {
    html += '<h3>Suspend Blockers</h3>';
    html += table(
      ['Name', 'Ref Count'],
      pm.suspendBlockers.map(b => [b.name, String(b.refCount)]),
    );
  }

  return html;
}

function renderBatteryStats(bs: BatteryStatsSummary, cs?: ConnectivityStats): string {
  let html = '<h3>3.1 Overall Battery Usage</h3>';
  html += table(['Metric', 'Value'], [
    ['Battery Capacity', `${bs.batteryCapacityMah} mAh`],
    ['Total Discharge', `${bs.totalDischargeMah} mAh`],
    ['Time on Battery', bs.timePeriod],
    ['Screen On Time', bs.screenOnTime],
    ['Screen Off Discharge', `${bs.screenOffDischargeMah} mAh`],
    ['Total Partial Wakelock Time', bs.partialWakelockTime || 'N/A'],
  ]);

  // Doze stats
  html += '<h3>3.2 Doze Mode Statistics</h3>';
  const dozeRows: string[][] = [];
  if (bs.deepDozeTimeMs > 0) {
    const rate = bs.deepDozeDischargeRateMahPerHr;
    const rateStr = rate > 0 ? `${rate.toFixed(1)} mAh/h` : 'N/A';
    const cls = rate > 40 ? 'highlight' : rate > 20 ? 'highlight-amber' : '';
    dozeRows.push(['Deep Doze', bs.deepDozeTime, `${bs.deepDozeDischargeMah} mAh`, rateStr, cls]);
  }
  if (bs.lightDozeTimeMs > 0) {
    dozeRows.push(['Light Doze', bs.lightDozeTime, 'N/A', 'N/A', '']);
  }
  if (dozeRows.length > 0) {
    html += '<div class="table-wrap"><table><thead><tr><th>Mode</th><th>Duration</th><th>Discharge</th><th>Discharge Rate</th></tr></thead><tbody>';
    for (const r of dozeRows) {
      const cls = r[4] ? ` class="${r[4]}"` : '';
      html += `<tr${cls}><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`;
    }
    html += '</tbody></table></div>';

    if (bs.deepDozeDischargeRateMahPerHr > 20) {
      html += `<div class="callout callout-danger"><strong>Deep Doze discharge rate ${bs.deepDozeDischargeRateMahPerHr.toFixed(1)} mAh/h exceeds ideal target (&lt;20 mAh/h).</strong> Investigate modem/WiFi wakeup sources and kernel wakelocks.</div>`;
    }
  }

  // Connectivity
  if (cs) {
    html += '<h3>3.3 Connectivity Power Summary</h3>';
    const connRows: string[][] = [];
    if (cs.cellularActiveTimeMs > 0 || cs.cellularDataRxBytes > 0) {
      connRows.push(['Cellular', fmtMs(cs.cellularActiveTimeMs), `Rx: ${fmtBytes(cs.cellularDataRxBytes)}`, `Tx: ${fmtBytes(cs.cellularDataTxBytes)}`]);
    }
    if (cs.wifiActiveTimeMs > 0 || cs.wifiDataRxBytes > 0) {
      connRows.push(['WiFi', fmtMs(cs.wifiActiveTimeMs), `Rx: ${fmtBytes(cs.wifiDataRxBytes)}`, `Tx: ${fmtBytes(cs.wifiDataTxBytes)}`]);
    }
    if (cs.bluetoothActiveTimeMs > 0) {
      connRows.push(['Bluetooth', fmtMs(cs.bluetoothActiveTimeMs), '-', '-']);
    }
    if (cs.gpsActiveTimeMs > 0) {
      connRows.push(['GPS', fmtMs(cs.gpsActiveTimeMs), '-', '-']);
    }
    if (connRows.length > 0) {
      html += table(['Radio', 'Active Time', 'Data Received', 'Data Sent'], connRows);
    }
    if (cs.connectivityChanges > 0) {
      html += `<p>Connectivity changes: <strong>${cs.connectivityChanges}</strong></p>`;
    }
    // Signal distribution
    if (cs.cellularSignalDistribution && cs.cellularSignalDistribution.length > 0) {
      html += '<h4>Cellular Signal Distribution</h4>';
      html += renderBarChart(cs.cellularSignalDistribution.map(s => ({
        label: `Level ${s.level}`,
        value: s.percentage,
        display: `${s.percentage.toFixed(1)}%`,
      })));
    }
  }

  return html;
}

function renderSuspendStats(ss: SuspendStats): string {
  let html = '<h3>4.1 Suspend Cycle Statistics</h3>';
  if (ss.source) {
    const sourceLabel = ss.source === 'suspend_stats_section' ? 'DUMPSYS SUSPEND_CONTROL_INTERNAL'
      : ss.source === 'kernel_log' ? 'KERNEL LOG'
      : 'MERGED (section counters + kernel log sources)';
    html += `<div class="callout">Data source: <strong>${sourceLabel}</strong></div>`;
  }
  const successCount = ss.suspendSuccessCount ?? (ss.totalSuspendAttempts - ss.suspendAbortCount);
  html += table(['Event', 'Count'], [
    ['Suspend Entry', String(ss.totalSuspendAttempts)],
    ['Successful Suspend', String(successCount)],
    ['Suspend Abort', String(ss.suspendAbortCount)],
    ['Task Freeze Abort', String(ss.taskFreezeAbortCount)],
    ['Device Suspend Failure', String(ss.deviceSuspendFailureCount)],
    ['Success Rate', `${ss.suspendSuccessRate.toFixed(1)}%`],
  ]);

  if (ss.lastFailedDev) {
    html += '<h4>Last Failed Device</h4>';
    const rows: string[][] = [['Device', ss.lastFailedDev]];
    if (ss.lastFailedStep) rows.push(['Failed Step', ss.lastFailedStep]);
    if (ss.lastFailedErrno != null) rows.push(['Errno', String(ss.lastFailedErrno)]);
    html += table(['Field', 'Value'], rows);
  }

  if (ss.suspendSuccessRate < 50) {
    html += '<div class="callout callout-danger"><strong>Suspend success rate critically low.</strong> The device is failing to enter deep sleep, leading to severe battery drain.</div>';
  }

  // Abort sources
  if (ss.topAbortSources.length > 0) {
    html += '<h3>4.2 Suspend Abort Source Breakdown</h3>';
    html += '<div class="callout">Counts reflect kernel log observations per source. A single abort event may produce multiple log entries.</div>';
    html += renderBarChart(ss.topAbortSources.map(s => ({
      label: s.name,
      value: s.percentage,
      display: `${s.count} (${s.percentage.toFixed(1)}%)`,
    })));
  }

  // Wakeup sources
  if (ss.topWakeupSources.length > 0) {
    html += '<h3>4.3 Wakeup Sources</h3>';
    html += table(
      ['Source', 'Count', 'Percentage'],
      ss.topWakeupSources.map(s => [s.name, String(s.count), `${s.percentage.toFixed(1)}%`]),
    );
  }

  return html;
}

function renderKernelWakeLocks(locks: KernelWakeLockStat[]): string {
  const KNOWN_DESCRIPTIONS: Record<string, string> = {
    'PowerManagerService.WakeLocks': 'Aggregate of all user-space partial wakelocks',
    'em7590_wake_ws': 'Sierra EM7590 LTE Modem',
    'qcom_rx_wakelock': 'Qualcomm modem RX wakeup',
    'hal_bluetooth_lock': 'Bluetooth HAL',
    'bq40z50-monitor-info': 'TI BQ40Z50 battery gauge',
    'NETLINK': 'Network event notification',
    'qup_uart': 'Qualcomm UART serial port',
    'wlan_wow_wl': 'WLAN Wake-on-Wireless',
    'wlan_rx_wake': 'WLAN RX wakeup',
    'event_timer': 'Kernel event timer',
    'alarmtimer': 'Kernel alarm timer',
  };

  const rows = locks.slice(0, 10).map((l, i) => [
    String(i + 1),
    l.name,
    fmtMs(l.totalTimeMs),
    String(l.count),
    l.avgTimeMs > 0 ? fmtMs(l.avgTimeMs) : 'N/A',
    KNOWN_DESCRIPTIONS[l.name] || '',
  ]);

  return table(['#', 'Wake Lock', 'Total Time', 'Count', 'Avg Time', 'Description'], rows);
}

function renderPartialWakeLocks(locks?: PartialWakeLockStat[]): string {
  if (!locks || locks.length === 0) {
    return '<div class="callout">Partial wake lock data not available in this bugreport. This data requires BATTERYSTATS "All partial wake locks" section.</div>';
  }

  return table(
    ['#', 'Wake Lock', 'UID', 'Total Time', 'Count'],
    locks.slice(0, 10).map((l, i) => [
      String(i + 1),
      l.name,
      l.uid,
      fmtMs(l.totalTimeMs),
      String(l.count),
    ]),
  );
}

function renderAlarmWakeups(alarms: AlarmWakeupStat[], bs?: BatteryStatsSummary): string {
  let html = '<h3>7.1 Top Alarm Apps</h3>';
  html += table(
    ['#', 'App (UID)', 'Wakeups', 'Top Alarms'],
    alarms.slice(0, 10).map((a, i) => [
      String(i + 1),
      `${a.appName} (${a.uid})`,
      String(a.wakeupCount),
      a.topAlarms.map(t => `${t.name} (${t.count})`).join(', ') || 'N/A',
    ]),
  );

  // Frequency analysis
  if (bs && bs.timePeriodMs > 0) {
    const periodMinutes = bs.timePeriodMs / 60_000;
    html += '<h3>7.2 Frequency Analysis</h3>';
    const freqRows = alarms.slice(0, 5).filter(a => a.wakeupCount > 0).map(a => {
      const interval = periodMinutes / a.wakeupCount;
      return [a.appName, String(a.wakeupCount), `${interval.toFixed(1)} min`];
    });
    if (freqRows.length > 0) {
      html += table(['App', 'Total Wakeups', 'Avg Interval'], freqRows);
    }
  }

  return html;
}

function renderDozeState(state: DozeState, settings?: DozeSettings): string {
  let html = '<h3>8.1 Snapshot State</h3>';
  html += table(['Parameter', 'Value'], [
    ['mState (Deep)', state.deepState],
    ['mLightState', state.lightState],
    ['mScreenOn', String(state.screenOn)],
    ['mCharging', String(state.charging)],
    ['mDeepEnabled', String(state.deepEnabled)],
    ['mLightEnabled', String(state.lightEnabled)],
  ]);

  if (settings) {
    // AOSP defaults
    const AOSP: Record<string, number> = {
      inactiveTo: 1800000,  // 30m
      idleTo: 300000,       // 5m
      idleFactor: 2,
      maxIdleTo: 21600000,  // 6h
      lightIdleTo: 300000,  // 5m
      lightMaxIdleTo: 900000, // 15m
      lightIdleFactor: 2,
    };

    html += '<h3>8.2 Doze Parameters vs AOSP Defaults</h3>';
    html += '<div class="table-wrap"><table><thead><tr><th>Parameter</th><th>Value</th><th>AOSP Default</th><th>Status</th></tr></thead><tbody>';
    for (const [key, aospVal] of Object.entries(AOSP)) {
      const val = (settings as unknown as Record<string, number>)[key] ?? 0;
      const isChanged = val !== 0 && val !== aospVal;
      const valStr = key.includes('Factor') ? String(val) : fmtMs(val);
      const aospStr = key.includes('Factor') ? String(aospVal) : fmtMs(aospVal);
      const diffHtml = isChanged
        ? `<span class="diff-changed">${esc(valStr)} vs ${esc(aospStr)}</span>`
        : `<span class="diff-default">Default</span>`;
      const cls = isChanged ? ' class="highlight-amber"' : '';
      html += `<tr${cls}><td>${esc(key)}</td><td>${esc(valStr)}</td><td>${esc(aospStr)}</td><td>${diffHtml}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  return html;
}

function renderEstimatedPower(epu?: EstimatedPowerUse, bs?: BatteryStatsSummary): string {
  if (!epu) {
    return '<div class="callout">Estimated power use data not available. This section requires BATTERYSTATS "Estimated power use" block.</div>';
  }

  let html = '<h3>9.1 Per-Component Power</h3>';
  html += table(
    ['Component', 'Estimated Power (mAh)'],
    epu.components.map(c => [c.name, c.mah.toFixed(1)]),
  );

  if (epu.topUids.length > 0) {
    html += '<h3>9.2 Top Power UIDs</h3>';
    html += table(
      ['UID', 'Name', 'Estimated Power (mAh)'],
      epu.topUids.filter(u => u.mah >= 0.05).map(u => [u.uid, resolveUidName(u.uid), u.mah.toFixed(1)]),
    );
  }

  // Gap analysis: compare Computed drain (power model) vs actual drain (coulomb counter)
  if (epu.computedTotal > 0 && epu.actualDrain) {
    const actualMid = (epu.actualDrain.min + epu.actualDrain.max) / 2;
    const isRange = epu.actualDrain.min !== epu.actualDrain.max;
    const actualLabel = isRange
      ? `${epu.actualDrain.min.toFixed(0)}–${epu.actualDrain.max.toFixed(0)} mAh (midpoint: ${actualMid.toFixed(0)})`
      : `${actualMid.toFixed(0)} mAh`;
    const unaccounted = epu.computedTotal - actualMid;
    const unaccountedPct = actualMid > 0 ? (unaccounted / actualMid) * 100 : 0;
    html += '<h3>9.3 Gap Analysis</h3>';
    html += table(['Metric', 'Value'], [
      ['Computed Drain (power model)', `${epu.computedTotal.toFixed(1)} mAh`],
      ['Actual Drain (coulomb counter)', actualLabel],
      ['Overestimate', `${unaccounted.toFixed(1)} mAh`],
      ['Overestimate %', `${unaccountedPct.toFixed(1)}%`],
    ]);
    if (Math.abs(unaccountedPct) > 50) {
      html += '<div class="callout callout-warn">Significant gap between power model and coulomb counter — power profile calibration may need adjustment.</div>';
    }
  } else if (epu.computedTotal > 0 && bs && bs.totalDischargeMah > 0) {
    // Fallback: no actual drain available, compare against battery stats discharge
    const unaccounted = bs.totalDischargeMah - epu.computedTotal;
    const unaccountedPct = (unaccounted / bs.totalDischargeMah) * 100;
    html += '<h3>9.3 Gap Analysis</h3>';
    html += table(['Metric', 'Value'], [
      ['Computed Drain', `${epu.computedTotal.toFixed(1)} mAh`],
      ['Reported Discharge', `${bs.totalDischargeMah} mAh`],
      ['Difference', `${unaccounted.toFixed(1)} mAh`],
      ['Difference %', `${unaccountedPct.toFixed(1)}%`],
    ]);
  }

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

function renderFindings(ps: PowerParseResult): string {
  const findings: Finding[] = [];

  const bs = ps.batteryStats;
  const ss = ps.suspendStats;

  // P0: Deep Doze > 40 mAh/h
  if (bs && bs.deepDozeDischargeRateMahPerHr > 40) {
    findings.push({
      priority: 'P0',
      issue: 'Excessive Deep Doze discharge rate',
      evidence: `${bs.deepDozeDischargeRateMahPerHr.toFixed(1)} mAh/h (ideal < 20)`,
      recommendation: 'Investigate modem/WiFi wakeup sources and kernel wakelocks preventing deep sleep.',
    });
  }

  // P0: Suspend success < 50%
  if (ss && ss.totalSuspendAttempts > 0 && ss.suspendSuccessRate < 50) {
    findings.push({
      priority: 'P0',
      issue: 'Critical suspend failure rate',
      evidence: `Success rate: ${ss.suspendSuccessRate.toFixed(1)}%${ss.topAbortSources.length > 0 ? `, top abort: ${ss.topAbortSources[0].name}` : ''}`,
      recommendation: 'Analyze suspend abort sources. Check for timerfd, wakelock, or driver-level issues.',
    });
  }

  // P1: Deep Doze 20-40 mAh/h
  if (bs && bs.deepDozeDischargeRateMahPerHr > 20 && bs.deepDozeDischargeRateMahPerHr <= 40) {
    findings.push({
      priority: 'P1',
      issue: 'Elevated Deep Doze discharge rate',
      evidence: `${bs.deepDozeDischargeRateMahPerHr.toFixed(1)} mAh/h`,
      recommendation: 'Review kernel wakelock holders and partial wakelock distribution.',
    });
  }

  // P1: Top wakelock > 2h
  if (ps.kernelWakeLocks.length > 0 && ps.kernelWakeLocks[0].totalTimeMs > 7_200_000) {
    const top = ps.kernelWakeLocks[0];
    findings.push({
      priority: 'P1',
      issue: `Top kernel wakelock held > 2 hours`,
      evidence: `${top.name}: ${fmtMs(top.totalTimeMs)}`,
      recommendation: 'Investigate the corresponding driver/service holding this wakelock.',
    });
  }

  // P1: Alarm wakeups > 100/hr
  if (ps.alarmWakeups && ps.alarmWakeups.length > 0 && bs && bs.timePeriodMs > 0) {
    const totalWakeups = ps.alarmWakeups.reduce((s, a) => s + a.wakeupCount, 0);
    const hours = bs.timePeriodMs / 3_600_000;
    const wakeupRate = totalWakeups / hours;
    if (wakeupRate > 100) {
      findings.push({
        priority: 'P1',
        issue: 'High alarm wakeup frequency',
        evidence: `${wakeupRate.toFixed(0)} wakeups/hr (${totalWakeups} total)`,
        recommendation: 'Check GMS/app alarm frequency. Consider reducing heartbeat intervals.',
      });
    }
  }

  // P2: Partial wakelock > 10% of battery time
  if (bs && bs.partialWakelockTimeMs > 0 && bs.timePeriodMs > 0) {
    const pct = (bs.partialWakelockTimeMs / bs.timePeriodMs) * 100;
    if (pct > 10) {
      findings.push({
        priority: 'P2',
        issue: 'Excessive partial wakelock time',
        evidence: `${bs.partialWakelockTime} (${pct.toFixed(1)}% of battery time)`,
        recommendation: 'Check application-level wakelock holders.',
      });
    }
  }

  if (findings.length === 0) {
    return '<div class="callout callout-ok">No critical power management issues detected based on automated analysis.</div>';
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
// Data Sources
// ============================================================

function renderDataSources(ps: PowerParseResult): string {
  const sources: string[][] = [];
  if (ps.powerManagerState) sources.push(['Power Manager State', 'DUMPSYS POWER']);
  if (ps.dozeState) sources.push(['Doze State & Settings', 'DUMPSYS DEVICEIDLE']);
  if (ps.batteryStats) sources.push(['Battery Statistics', 'DUMPSYS BATTERYSTATS']);
  if (ps.kernelWakeLocks.length > 0) sources.push(['Kernel Wakelocks', 'CHECKIN BATTERYSTATS']);
  if (ps.alarmWakeups) sources.push(['Alarm Stats', 'DUMPSYS ALARM']);
  if (ps.suspendStats) {
    const src = ps.suspendStats.source === 'suspend_stats_section' ? 'DUMPSYS SUSPEND_CONTROL_INTERNAL'
      : ps.suspendStats.source === 'merged' ? 'DUMPSYS SUSPEND_CONTROL_INTERNAL + KERNEL LOG'
      : 'KERNEL LOG';
    sources.push(['Suspend Statistics', src]);
  }
  if (ps.estimatedPowerUse) sources.push(['Estimated Power Use', 'DUMPSYS BATTERYSTATS']);
  if (ps.connectivityStats) sources.push(['Connectivity Stats', 'DUMPSYS BATTERYSTATS']);
  if (ps.partialWakeLocks && ps.partialWakeLocks.length > 0) sources.push(['Partial Wake Locks', 'DUMPSYS BATTERYSTATS']);

  return table(['Section', 'Data Source'], sources);
}

// ============================================================
// Utility Functions
// ============================================================

const KNOWN_UIDS: Record<string, string> = {
  '0': 'root / kernel',
  '1000': 'system_server',
  '1001': 'radio (telephony)',
  '1002': 'bluetooth',
  '1010': 'wifi',
  '1013': 'mediaserver',
  '1017': 'shell',
  '1019': 'DRM service',
  '1021': 'GPS / GNSS',
  '1027': 'NFC',
  '1036': 'logd',
  '1040': 'MediaDrm',
  '1041': 'audioserver',
  '1046': 'cameraserver',
  '1047': 'network_stack',
  '1053': 'webview_zygote',
  '1058': 'vehicle HAL',
  '1066': 'statsd',
  '1067': 'incidentd',
  '1068': 'secure_element',
  '1069': 'uwb',
  '1072': 'artd',
  '1073': 'network_stack',
  '1082': 'credstore',
  '1092': 'virtual_device',
  '2000': 'adb shell',
  '9999': 'nobody',
};

function fmtTimestamp(ts?: Date | string | null): string {
  if (!ts) return 'N/A';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  // Format: YYYY-MM-DD HH:mm:ss (local timezone offset)
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offset) / 60));
  const om = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${sign}${oh}:${om})`;
}

function resolveUidName(uid: string): string {
  if (KNOWN_UIDS[uid]) return KNOWN_UIDS[uid];
  if (uid.startsWith('u0a')) return `app (${uid})`;
  return uid;
}

// Local alias for the shared escapeHtml utility
const esc = escapeHtml;

function table(headers: string[], rows: string[][]): string {
  const ths = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n');
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

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

