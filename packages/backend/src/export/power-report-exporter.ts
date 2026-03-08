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
  const title = `Power Management Analysis — ${esc(meta.deviceModel)}`;
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
<div class="header-icon">\u26A1</div>
<h1>Power Management Analysis <span>\u2014 ${esc(meta.deviceModel)}</span></h1>
</div>
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
  return `<div class="card card-${cls}">
<div class="card-label">${esc(label)}</div>
<div class="card-value">${esc(value)}</div>
${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ============================================================
// CSS (Dark Theme)
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
  --accent: #5b7fff;
  --accent-bright: #7c9dff;
  --accent-glow: rgba(91, 127, 255, 0.15);
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
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface2) 60%, rgba(91, 127, 255, 0.06) 100%);
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
  background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
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
  border: 1px solid rgba(91, 127, 255, 0.2);
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
tr:hover td { background: rgba(91, 127, 255, 0.05); }
tr.highlight td { background: var(--red-glow); }
tr.highlight-amber td { background: var(--amber-glow); }
td:first-child { color: var(--text-dim); }
.table-wrap table td.val-num {
  font-family: var(--font-mono);
  font-weight: 500;
}

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
  width: 150px;
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
.bar-fill.bar-info { background: linear-gradient(90deg, #3a5fcc, var(--accent)); }
.bar-value {
  width: 130px;
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

/* Diff badges */
.diff-changed {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  background: var(--amber-glow);
  color: var(--amber);
  border: 1px solid rgba(232, 168, 64, 0.2);
}
.diff-default {
  display: inline-block;
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 0.15rem 0.5rem;
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
}
`;
