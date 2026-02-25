/**
 * Extract comprehensive power management data from bugreports for manual analysis report.
 * Following the methodology in doc/power-management-methodology.md
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const parser = require('./packages/parser/dist/index.js');

const zipPaths = process.argv.slice(2);
if (zipPaths.length === 0) {
  console.error('Usage: node analyze-power.mjs <bugreport1.zip> [bugreport2.zip]');
  process.exit(1);
}

for (const zipPath of zipPaths) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`BUGREPORT: ${zipPath.split('/').pop()}`);
  console.log(`${'='.repeat(100)}\n`);

  // Unpack
  const unpack = await parser.unpackBugreport(zipPath);
  const meta = unpack.metadata;

  // Parse all
  const allEntries = [];
  for (const ls of unpack.logcatSections) {
    const r = parser.parseLogcat(ls.content, ls.buffer);
    for (const e of r.entries) allEntries.push(e);
  }
  const anomalies = parser.detectAnomalies(allEntries);
  const tagStats = parser.computeTagStats(allEntries);
  const logcatResult = { entries: allEntries, anomalies, totalLines: allEntries.length, parsedLines: allEntries.length, parseErrors: 0, tagStats };

  let kernelSection = null;
  for (const s of unpack.sections) {
    if (s.name.includes('KERNEL LOG') || s.command.includes('dmesg')) { kernelSection = s; break; }
  }
  const kernelResult = kernelSection ? parser.parseKernelLog(kernelSection.content) : { entries: [], events: [] };

  const anrAnalyses = [];
  for (const [name, content] of unpack.anrTraceContents) {
    const anr = parser.parseANRTrace(content, name);
    if (anr) anrAnalyses.push(anr);
  }

  let halStatus;
  for (const s of unpack.sections) {
    if (s.content.includes('HIDL') || s.content.includes('All binderized')) {
      halStatus = parser.parseLshal(s.content, meta.manufacturer);
      if (halStatus && halStatus.families.length > 0) break;
    }
  }

  const tombstoneResults = [];
  for (const [name, content] of unpack.tombstoneContents) {
    try { const r = parser.parseTombstones(content, name); if (r && r.backtrace) tombstoneResults.push(r); } catch {}
  }

  const powerStatus = parser.parsePowerSections(unpack.sections, kernelResult.entries);

  let systemProperties, uptimeContent;
  for (const s of unpack.sections) {
    if (s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop')) systemProperties = s.content;
    if (s.name === 'UPTIME' || s.command === 'uptime') uptimeContent = s.content;
  }

  const result = parser.analyzeBasic({
    metadata: meta, logcatResult, kernelResult, anrAnalyses, halStatus,
    tombstoneAnalyses: tombstoneResults, systemProperties, uptimeContent, powerStatus,
  });

  // ========== OUTPUT ==========

  console.log('## 1. Device Info');
  console.log(`Model: ${meta.deviceModel}, Manufacturer: ${meta.manufacturer}`);
  console.log(`Android: ${meta.androidVersion} (SDK ${meta.sdkLevel})`);
  console.log(`Build: ${meta.buildFingerprint}`);
  console.log(`Build Type: ${meta.buildType}`);
  console.log(`Bugreport Time: ${meta.bugreportTimestamp}`);
  console.log(`Serial: ${meta.serialNumber || 'N/A'}`);

  console.log('\n## 2. Health Score');
  const hs = result.healthScore;
  console.log(`Overall: ${hs.overall}/100`);
  console.log(`Stability: ${hs.breakdown.stability}, Memory: ${hs.breakdown.memory}, Responsiveness: ${hs.breakdown.responsiveness}, Kernel: ${hs.breakdown.kernel}`);

  console.log('\n## 3. Power Manager State');
  const pm = powerStatus.powerManagerState;
  if (pm) {
    console.log(`Wakefulness: ${pm.wakefulness}`);
    console.log(`Battery Level: ${pm.batteryLevel}%`);
    console.log(`Is Powered: ${pm.isPowered}, Plug Type: ${pm.plugType}`);
    console.log(`Auto Suspend: ${pm.useAutoSuspend}`);
    console.log(`Last Sleep Reason: ${pm.lastSleepReason}`);
    console.log(`Device Idle Mode: ${pm.deviceIdleMode}`);
    if (pm.activeWakeLocks.length > 0) {
      console.log(`Active Wake Locks (${pm.activeWakeLocks.length}):`);
      for (const wl of pm.activeWakeLocks) {
        console.log(`  ${wl.type} '${wl.tag}' uid=${wl.uid} pid=${wl.pid} ${wl.duration || ''}`);
      }
    } else {
      console.log('Active Wake Locks: none');
    }
    console.log(`Suspend Blockers (${pm.suspendBlockers.length}):`);
    for (const sb of pm.suspendBlockers) {
      console.log(`  ${sb.name}: ref count=${sb.refCount}`);
    }
  } else {
    console.log('(not available)');
  }

  console.log('\n## 4. Battery Statistics');
  const bs = powerStatus.batteryStats;
  if (bs) {
    console.log(`Battery Capacity: ${bs.batteryCapacityMah} mAh`);
    console.log(`Total Discharge: ${bs.totalDischargeMah} mAh`);
    console.log(`Time on Battery: ${bs.timePeriod}`);
    console.log(`Time on Battery (ms): ${bs.timePeriodMs}`);
    console.log(`Screen On Time: ${bs.screenOnTime}`);
    console.log(`Screen On Time (ms): ${bs.screenOnTimeMs}`);
    console.log(`Screen Off Discharge: ${bs.screenOffDischargeMah} mAh`);
    console.log(`Screen On Discharge: ${bs.screenOnDischargeMah} mAh`);
    console.log(`Total Partial Wakelock: ${bs.partialWakelockTime}`);
    console.log(`Deep Doze Time: ${bs.deepDozeTime} (${bs.deepDozeTimeMs}ms)`);
    console.log(`Deep Doze Discharge: ${bs.deepDozeDischargeMah} mAh`);
    console.log(`Deep Doze Discharge Rate: ${bs.deepDozeDischargeRateMahPerHr.toFixed(1)} mAh/h`);
    console.log(`Light Doze Time: ${bs.lightDozeTime} (${bs.lightDozeTimeMs}ms)`);
  } else {
    console.log('(not available)');
  }

  console.log('\n## 5. Doze State');
  const doze = powerStatus.dozeState;
  if (doze) {
    console.log(`Deep State: ${doze.deepState}`);
    console.log(`Light State: ${doze.lightState}`);
    console.log(`Screen On: ${doze.screenOn}`);
    console.log(`Charging: ${doze.charging}`);
    console.log(`Deep Enabled: ${doze.deepEnabled}`);
    console.log(`Light Enabled: ${doze.lightEnabled}`);
  } else {
    console.log('(not available)');
  }

  console.log('\n## 6. Doze Settings (vs AOSP)');
  const ds = powerStatus.dozeSettings;
  if (ds) {
    console.log(`inactive_to: ${ds.inactiveTo}ms (AOSP: 1800000ms)`);
    console.log(`idle_to: ${ds.idleTo}ms (AOSP: 3600000ms)`);
    console.log(`idle_factor: ${ds.idleFactor} (AOSP: 2.0)`);
    console.log(`max_idle_to: ${ds.maxIdleTo}ms (AOSP: 21600000ms)`);
    console.log(`light_idle_to: ${ds.lightIdleTo}ms (AOSP: 300000ms)`);
    console.log(`light_max_idle_to: ${ds.lightMaxIdleTo}ms (AOSP: 900000ms)`);
    console.log(`light_idle_factor: ${ds.lightIdleFactor} (AOSP: 2.0)`);
  } else {
    console.log('(not available)');
  }

  console.log('\n## 7. Kernel Wake Locks (Top 10)');
  if (powerStatus.kernelWakeLocks.length > 0) {
    console.log('Rank  Name                                   Total Time     Count    Avg Time');
    console.log('-'.repeat(85));
    powerStatus.kernelWakeLocks.forEach((wl, i) => {
      const totalSec = (wl.totalTimeMs / 1000);
      const avgSec = (wl.avgTimeMs / 1000);
      const fmtTotal = totalSec >= 60 ? `${Math.floor(totalSec/60)}m ${Math.floor(totalSec%60)}s` : `${totalSec.toFixed(1)}s`;
      const fmtAvg = avgSec >= 60 ? `${Math.floor(avgSec/60)}m ${Math.floor(avgSec%60)}s` : `${avgSec.toFixed(2)}s`;
      console.log(`${String(i+1).padStart(3)}   ${wl.name.padEnd(40)} ${fmtTotal.padStart(10)}  ${String(wl.count).padStart(7)}  ${fmtAvg.padStart(10)}`);
    });
  } else {
    console.log('(not available)');
  }

  console.log('\n## 8. Alarm Wakeup Stats (Top Apps)');
  if (powerStatus.alarmWakeups.length > 0) {
    console.log('Rank  UID        App                                     Wakeups  Top Alarm');
    console.log('-'.repeat(100));
    powerStatus.alarmWakeups.forEach((a, i) => {
      const topAlarm = a.topAlarms[0]?.name || '-';
      console.log(`${String(i+1).padStart(3)}   ${a.uid.padEnd(10)} ${a.appName.padEnd(40)} ${String(a.wakeupCount).padStart(5)}    ${topAlarm}`);
    });
  } else {
    console.log('(not available)');
  }

  console.log('\n## 9. Suspend Statistics');
  const ss = powerStatus.suspendStats;
  if (ss) {
    console.log(`Total Suspend Attempts: ${ss.totalSuspendAttempts}`);
    console.log(`Suspend Abort Count: ${ss.suspendAbortCount}`);
    console.log(`Task Freeze Abort Count: ${ss.taskFreezeAbortCount}`);
    console.log(`Device Suspend Failure: ${ss.deviceSuspendFailureCount}`);
    console.log(`Suspend Success Rate: ${(ss.suspendSuccessRate * 100).toFixed(1)}%`);
    if (ss.topAbortSources.length > 0) {
      console.log('Top Abort Sources:');
      for (const s of ss.topAbortSources) {
        console.log(`  ${s.source}: ${s.count}`);
      }
    }
    if (ss.topWakeupSources.length > 0) {
      console.log('Top Wakeup Sources:');
      for (const s of ss.topWakeupSources) {
        console.log(`  ${s.source}: ${s.count}`);
      }
    }
  } else {
    console.log('(not available)');
  }

  console.log('\n## 10. Insights Summary');
  const criticals = result.insights.filter(i => i.severity === 'critical');
  const warnings = result.insights.filter(i => i.severity === 'warning');
  const infos = result.insights.filter(i => i.severity === 'info');
  console.log(`Total: ${result.insights.length} (${criticals.length} critical, ${warnings.length} warning, ${infos.length} info)`);
  for (const i of [...criticals, ...warnings].slice(0, 20)) {
    console.log(`  [${i.severity.toUpperCase()}] ${i.title}`);
  }

  console.log('\n## 11. ANR Analysis');
  if (anrAnalyses.length > 0) {
    for (const a of anrAnalyses) {
      const primary = a.blockedThread ?? a.mainThread;
      console.log(`Process: ${a.processName} (PID ${a.pid})`);
      console.log(`  Subject: ${a.subject}`);
      if (primary) {
        console.log(`  Block Reason: ${primary.blockReason} (confidence: ${primary.confidence})`);
        if (primary.binderTarget) console.log(`  Binder Target: ${primary.binderTarget.interfaceName}`);
      }
    }
  } else {
    console.log('No ANR traces found');
  }

  console.log('\n## 12. Kernel Events');
  if (kernelResult.events.length > 0) {
    const eventCounts = {};
    for (const e of kernelResult.events) {
      eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(eventCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  } else {
    console.log('No kernel events detected');
  }

  // Extract raw data for sections we can't get from parser
  console.log('\n## 13. Raw Battery Stats Section (first 100 lines)');
  for (const s of unpack.sections) {
    if (s.content.includes('Statistics since last charge:')) {
      const idx = s.content.indexOf('Statistics since last charge:');
      const lines = s.content.slice(idx, idx + 8000).split('\n').slice(0, 100);
      for (const l of lines) console.log(l);
      break;
    }
  }

  // Estimated Power
  console.log('\n## 14. Estimated Power Use');
  for (const s of unpack.sections) {
    if (s.content.includes('Estimated power use (mAh):')) {
      const idx = s.content.indexOf('Estimated power use (mAh):');
      const lines = s.content.slice(idx, idx + 2000).split('\n').slice(0, 30);
      for (const l of lines) console.log(l);
      break;
    }
  }

  // Suspend/resume raw grep
  console.log('\n## 15. Raw Kernel Suspend Data');
  const kContent = kernelSection?.content || '';
  let suspendEntries = 0, pendingAborts = 0, freezeAborts = 0, deviceFails = 0;
  for (const line of kContent.split('\n')) {
    if (/PM:\s*suspend entry/i.test(line)) suspendEntries++;
    if (/Pending Wakeup Sources/i.test(line)) pendingAborts++;
    if (/Freezing of tasks aborted/i.test(line)) freezeAborts++;
    if (/failed to suspend/i.test(line)) deviceFails++;
  }
  console.log(`PM: suspend entry count: ${suspendEntries}`);
  console.log(`Pending Wakeup Sources abort: ${pendingAborts}`);
  console.log(`Freezing of tasks aborted: ${freezeAborts}`);
  console.log(`Device failed to suspend: ${deviceFails}`);

  // Wakeup source breakdown from abort lines
  const abortSources = {};
  for (const line of kContent.split('\n')) {
    if (/Pending Wakeup Sources/i.test(line)) {
      const match = line.match(/Pending Wakeup Sources:\s*(.+)/i);
      if (match) {
        const sources = match[1].trim().split(/\s+/);
        for (const src of sources) {
          if (src) abortSources[src] = (abortSources[src] || 0) + 1;
        }
      }
    }
  }
  if (Object.keys(abortSources).length > 0) {
    console.log('\nSuspend Abort Wakeup Source Breakdown:');
    const sorted = Object.entries(abortSources).sort((a, b) => b[1] - a[1]);
    for (const [src, count] of sorted.slice(0, 15)) {
      console.log(`  ${src}: ${count}`);
    }
  }

  // Last active wakeup source
  const wakeupSources = {};
  for (const line of kContent.split('\n')) {
    if (/last active Wakeup Source/i.test(line)) {
      const match = line.match(/last active Wakeup Source:\s*(\S+)/i);
      if (match) {
        wakeupSources[match[1]] = (wakeupSources[match[1]] || 0) + 1;
      }
    }
  }
  if (Object.keys(wakeupSources).length > 0) {
    console.log('\nLast Active Wakeup Sources:');
    const sorted = Object.entries(wakeupSources).sort((a, b) => b[1] - a[1]);
    for (const [src, count] of sorted.slice(0, 10)) {
      console.log(`  ${src}: ${count}`);
    }
  }

  // Connectivity stats
  console.log('\n## 16. Connectivity Stats');
  for (const s of unpack.sections) {
    if (s.content.includes('Statistics since last charge:')) {
      const idx = s.content.indexOf('Statistics since last charge:');
      const block = s.content.slice(idx, idx + 20000);

      const cellMatch = block.match(/Cellular kernel active time:(.+)/);
      if (cellMatch) console.log(`Cellular kernel active: ${cellMatch[1].trim()}`);

      const cellDataMatch = block.match(/Cellular data received:(.+)/);
      if (cellDataMatch) console.log(`Cellular data Rx: ${cellDataMatch[1].trim()}`);

      const cellDataTxMatch = block.match(/Cellular data sent:(.+)/);
      if (cellDataTxMatch) console.log(`Cellular data Tx: ${cellDataTxMatch[1].trim()}`);

      const wifiMatch = block.match(/Wifi Statistics[\s\S]{0,500}?(?=\n\s*\S)/);
      if (wifiMatch) console.log(`WiFi Stats: ${wifiMatch[0].slice(0, 300)}`);

      const btMatch = block.match(/Bluetooth total energy:(.+)/);
      if (btMatch) console.log(`Bluetooth: ${btMatch[1].trim()}`);

      const connMatch = block.match(/Connectivity changes:(.+)/);
      if (connMatch) console.log(`Connectivity changes: ${connMatch[1].trim()}`);
      break;
    }
  }
}
