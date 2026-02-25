import {
  PowerManagerState,
  ActiveWakeLock,
  SuspendBlocker,
  DozeState,
  DozeSettings,
  BatteryStatsSummary,
  KernelWakeLockStat,
  PowerParseResult,
  BugreportSection,
  AlarmWakeupStat,
  SuspendStats,
  KernelLogEntry,
  EstimatedPowerUse,
  ConnectivityStats,
  PartialWakeLockStat,
} from './types.js';

// ============================================================
// PowerManager State (DUMPSYS POWER)
// ============================================================

/**
 * Parse `dumpsys power` output.
 * Extracts wakefulness, battery state, active wake locks, and suspend blockers.
 */
export function parsePowerManager(content: string): PowerManagerState {
  const result: PowerManagerState = {
    wakefulness: 'Unknown',
    isPowered: false,
    plugType: 0,
    batteryLevel: 0,
    lastSleepReason: '',
    screenOffTimeout: 0,
    useAutoSuspend: false,
    activeWakeLocks: [],
    suspendBlockers: [],
    activeSuspendBlockerCount: 0,
  };

  if (!content) return result;

  // Key=value extraction
  const kv = (key: string): string => {
    const m = content.match(new RegExp(`${key}=(\\S+)`));
    return m ? m[1] : '';
  };

  result.wakefulness = kv('mWakefulness') || 'Unknown';
  result.isPowered = kv('mIsPowered') === 'true';
  result.plugType = parseInt(kv('mPlugType'), 10) || 0;
  result.batteryLevel = parseInt(kv('mBatteryLevel'), 10) || 0;
  result.lastSleepReason = kv('mLastSleepReason') || '';
  result.screenOffTimeout = parseInt(kv('mScreenOffTimeoutSetting'), 10) || 0;
  result.useAutoSuspend = kv('mHalAutoSuspendModeEnabled') === 'true';

  // Parse Wake Locks section
  result.activeWakeLocks = parseActiveWakeLocks(content);

  // Parse Suspend Blockers section
  result.suspendBlockers = parseSuspendBlockers(content);
  result.activeSuspendBlockerCount = result.suspendBlockers.length;

  return result;
}

/**
 * Parse active wake locks from dumpsys power output.
 * Format: "  PARTIAL_WAKE_LOCK  'tag' ACQ=-1h2m3s4ms (uid=1000 pid=1234)"
 *    or:  "  PARTIAL_WAKE_LOCK  'tag' (uid=1000 pid=1234)"
 */
function parseActiveWakeLocks(content: string): ActiveWakeLock[] {
  const locks: ActiveWakeLock[] = [];

  // Find the "Wake Locks:" section
  const sectionMatch = content.match(/Wake Locks:.*?(?:size=\d+)?\s*\n([\s\S]*?)(?:\n\s*\n|\nSuspend Blockers:|\n\w)/);
  if (!sectionMatch) return locks;

  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^\s+(PARTIAL_WAKE_LOCK|FULL_WAKE_LOCK|SCREEN_DIM_WAKE_LOCK|SCREEN_BRIGHT_WAKE_LOCK|PROXIMITY_SCREEN_OFF_WAKE_LOCK|DOZE_WAKE_LOCK|DRAW_WAKE_LOCK)\s+'([^']+)'\s*(?:ACQ=(-?\S+))?\s*.*?\(uid=(\d+)\s+pid=(\d+)/);
    if (m) {
      locks.push({
        type: m[1],
        tag: m[2],
        duration: m[3] || '',
        uid: parseInt(m[4], 10),
        pid: parseInt(m[5], 10),
      });
    }
  }

  return locks;
}

/**
 * Parse suspend blockers from dumpsys power output.
 * Format: "  PowerManagerService.WakeLocks: ref count=1"
 */
function parseSuspendBlockers(content: string): SuspendBlocker[] {
  const blockers: SuspendBlocker[] = [];

  const sectionMatch = content.match(/Suspend Blockers:.*?\n([\s\S]*?)(?:\n\s*\n|\n\w)/);
  if (!sectionMatch) return blockers;

  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^\s+(.+?):\s*ref count=(\d+)/);
    if (m) {
      blockers.push({
        name: m[1].trim(),
        refCount: parseInt(m[2], 10),
      });
    }
  }

  return blockers;
}

// ============================================================
// DeviceIdle (Doze) State (DUMPSYS DEVICEIDLE)
// ============================================================

/**
 * Parse `dumpsys deviceidle` output.
 * Returns Doze state and settings.
 */
export function parseDeviceIdle(content: string): { dozeState: DozeState; dozeSettings: DozeSettings } {
  const dozeState: DozeState = {
    deepState: 'UNKNOWN',
    lightState: 'UNKNOWN',
    screenOn: false,
    charging: false,
    deepEnabled: true,
    lightEnabled: true,
  };

  const dozeSettings: DozeSettings = {
    inactiveTo: 0,
    idleTo: 0,
    idleFactor: 0,
    maxIdleTo: 0,
    lightIdleTo: 0,
    lightMaxIdleTo: 0,
    lightIdleFactor: 0,
  };

  if (!content) return { dozeState, dozeSettings };

  // State extraction
  const stateKv = (key: string): string => {
    const m = content.match(new RegExp(`${key}=([^\\s,]+)`));
    return m ? m[1] : '';
  };

  dozeState.deepState = stateKv('mState') || 'UNKNOWN';
  dozeState.lightState = stateKv('mLightState') || 'UNKNOWN';
  dozeState.screenOn = stateKv('mScreenOn') === 'true';
  dozeState.charging = stateKv('mCharging') === 'true';
  dozeState.deepEnabled = stateKv('mDeepEnabled') !== 'false';
  dozeState.lightEnabled = stateKv('mLightEnabled') !== 'false';

  // Settings extraction — look for the "Settings:" block
  // Match indented lines containing key=value pairs (4+ spaces indent)
  // Stop when indent decreases (e.g. "  Idling history:" at 2 spaces) or at blank line
  const settingsMatch = content.match(/Settings:\s*\n((?:[ \t]{4,}\S+=[^\n]*\n?)+)/);
  if (settingsMatch) {
    const block = settingsMatch[1];

    // Settings values can be plain numbers (ms) or Android duration format (+30m0s0ms)
    // Use line-start anchor to prevent partial key matches (e.g. "idle_to" matching "light_idle_to")
    const settingVal = (key: string): number => {
      const m = block.match(new RegExp(`(?:^|\\n)\\s*${key}=\\+?([^\\n,]+)`));
      if (!m) return 0;
      const raw = m[1].trim();
      // Plain number = milliseconds
      if (/^\d+$/.test(raw)) return parseInt(raw, 10);
      // Android duration format: +30m0s0ms
      return parseDurationToMs(raw);
    };

    dozeSettings.inactiveTo = settingVal('inactive_to');
    dozeSettings.idleTo = settingVal('idle_to') || settingVal('idle_after_inactive_to');
    dozeSettings.idleFactor = parseFloat(block.match(/(?:^|\n)\s*idle_factor=([\d.]+)/)?.[1] ?? '0') || 0;
    dozeSettings.maxIdleTo = settingVal('max_idle_to');
    dozeSettings.lightIdleTo = settingVal('light_idle_to');
    dozeSettings.lightMaxIdleTo = settingVal('light_max_idle_to');
    dozeSettings.lightIdleFactor = parseFloat(block.match(/(?:^|\n)\s*light_idle_factor=([\d.]+)/)?.[1] ?? '0') || 0;
  }

  return { dozeState, dozeSettings };
}

// ============================================================
// BatteryStats Summary (DUMPSYS BATTERYSTATS)
// ============================================================

/**
 * Parse `dumpsys batterystats` output.
 * Extracts pre-calculated statistics from the "Statistics since last charge:" block.
 */
export function parseBatteryStats(content: string): BatteryStatsSummary {
  const result: BatteryStatsSummary = {
    batteryCapacityMah: 0,
    totalDischargeMah: 0,
    screenOnTime: '',
    screenOnTimeMs: 0,
    screenOffDischargeMah: 0,
    deepDozeTime: '',
    deepDozeTimeMs: 0,
    deepDozeDischargeMah: 0,
    deepDozeDischargeRateMahPerHr: 0,
    lightDozeTime: '',
    lightDozeTimeMs: 0,
    partialWakelockTime: '',
    partialWakelockTimeMs: 0,
    timePeriod: '',
    timePeriodMs: 0,
  };

  if (!content) return result;

  // Find "Statistics since last charge:" block
  const statsIdx = content.indexOf('Statistics since last charge:');
  if (statsIdx === -1) return result;
  const statsBlock = content.slice(statsIdx);

  // Battery capacity
  const capMatch = content.match(/Estimated battery capacity:\s*([\d.]+)\s*mAh/);
  if (capMatch) result.batteryCapacityMah = parseFloat(capMatch[1]);

  // Time period: "Time on battery: 1d 2h 3m 4s 567ms (100.0%) ..."
  const timeMatch = statsBlock.match(/Time on battery:\s*([^(]+)\(/);
  if (timeMatch) {
    result.timePeriod = timeMatch[1].trim();
    result.timePeriodMs = parseDurationToMs(result.timePeriod);
  }

  // Screen on time
  const screenOnMatch = statsBlock.match(/Screen on:\s*([^,]+)/);
  if (screenOnMatch) {
    result.screenOnTime = screenOnMatch[1].trim();
    result.screenOnTimeMs = parseDurationToMs(result.screenOnTime);
  }

  // Total discharge: "Discharge: NNN mAh" or "Amount discharged while screen off: NNN mAh"
  const dischargeMatch = statsBlock.match(/(?:^|\n)\s*Discharge:\s*([\d.]+)\s*mAh/);
  if (dischargeMatch) result.totalDischargeMah = parseFloat(dischargeMatch[1]);

  // Screen off discharge — multiple format variants:
  //   "Screen off discharge: 9025 mAh"
  //   "Amount discharged while screen off: NNN mAh"
  const screenOffMatch = statsBlock.match(/(?:Screen off discharge|Amount discharged while screen off):\s*([\d.]+)\s*mAh/);
  if (screenOffMatch) result.screenOffDischargeMah = parseFloat(screenOffMatch[1]);

  // Deep Doze time — multiple format variants:
  //   "Idle mode full time: 5d 20h 16m 37s 183ms (97.0%) 74x"
  //   "Device Idle mode enabled time: ..."
  //   "Device Idle (deep): 2h 10m 15s 123ms"
  const deepDozeMatch = statsBlock.match(/(?:Idle mode full time|Device Idle mode enabled|Device idle time|Device Idle \(deep\))(?:\s*time)?:\s*([^(]+?)(?:\s*\(|$)/m);
  if (deepDozeMatch) {
    result.deepDozeTime = deepDozeMatch[1].trim();
    result.deepDozeTimeMs = parseDurationToMs(result.deepDozeTime);
  }

  // Deep Doze discharge — multiple format variants:
  //   "Device deep doze discharge: 6999 mAh"
  //   "Discharge step during device Idle mode: NNN mAh"
  //   "Amount discharged in deep doze: NNN mAh"
  const deepDozeDischargeMatch = statsBlock.match(/(?:Device deep doze discharge|Discharge step during device Idle mode|Amount discharged.*deep doze):\s*([\d.]+)\s*mAh/i);
  if (deepDozeDischargeMatch) {
    result.deepDozeDischargeMah = parseFloat(deepDozeDischargeMatch[1]);
  }

  // Calculate Deep Doze discharge rate
  if (result.deepDozeTimeMs > 0 && result.deepDozeDischargeMah > 0) {
    const hours = result.deepDozeTimeMs / 3_600_000;
    result.deepDozeDischargeRateMahPerHr = result.deepDozeDischargeMah / hours;
  }

  // Light Doze time — multiple format variants:
  //   "Idle mode light time: 2h 41m 53s 160ms (1.9%) 27x"
  //   "Device light idle time: ..."
  //   "Device Idle (light): ..."
  const lightDozeMatch = statsBlock.match(/(?:Idle mode light time|Device light idle time|Device Idle \(light\))(?:\s*time)?:\s*([^(]+?)(?:\s*\(|$)/m);
  if (lightDozeMatch) {
    result.lightDozeTime = lightDozeMatch[1].trim();
    result.lightDozeTimeMs = parseDurationToMs(result.lightDozeTime);
  }

  // Partial wakelock time
  const partialMatch = statsBlock.match(/Total partial wakelock time:\s*([^\n]+)/);
  if (partialMatch) {
    result.partialWakelockTime = partialMatch[1].trim();
    result.partialWakelockTimeMs = parseDurationToMs(result.partialWakelockTime);
  }

  return result;
}

/**
 * Parse Android duration string to milliseconds.
 * Format examples: "1d 2h 3m 4s 567ms", "3h 15m 30s", "45m 12s 345ms", "2s 100ms"
 */
export function parseDurationToMs(duration: string): number {
  let ms = 0;
  const dMatch = duration.match(/(\d+)\s*d/);
  const hMatch = duration.match(/(\d+)\s*h/);
  const mMatch = duration.match(/(\d+)\s*m(?!s)/);
  const msMatch = duration.match(/(\d+)\s*ms/);
  // Match seconds: "Ns" but not "Nms" — remove ms portion first
  const withoutMs = duration.replace(/\d+\s*ms/g, '');
  const sMatch = withoutMs.match(/(\d+)\s*s/);

  if (dMatch) ms += parseInt(dMatch[1], 10) * 86_400_000;
  if (hMatch) ms += parseInt(hMatch[1], 10) * 3_600_000;
  if (mMatch) ms += parseInt(mMatch[1], 10) * 60_000;
  if (sMatch) ms += parseInt(sMatch[1], 10) * 1_000;
  if (msMatch) ms += parseInt(msMatch[1], 10);

  return ms;
}

// ============================================================
// Kernel Wakelocks (CHECKIN BATTERYSTATS)
// ============================================================

/**
 * Parse kernel wakelocks from CHECKIN BATTERYSTATS format.
 * Format: "9,0,l,kwl,name,totalMs,count,..."
 * Returns top 10 by totalTimeMs.
 */
export function parseKernelWakeLocks(content: string): KernelWakeLockStat[] {
  const locks: KernelWakeLockStat[] = [];

  if (!content) return locks;

  // Match lines: "9,0,l,kwl,<name>,<totalMs>,<count>,..."
  // or: "9,10089,l,kwl,<name>,<totalMs>,<count>,..."
  const regex = /^9,\d+,l,kwl,([^,]+),(\d+),(\d+)/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1].replace(/^"|"$/g, ''); // strip surrounding quotes from CHECKIN format
    const totalTimeMs = parseInt(match[2], 10);
    const count = parseInt(match[3], 10);

    locks.push({
      name,
      count,
      totalTimeMs,
      avgTimeMs: count > 0 ? totalTimeMs / count : 0,
    });
  }

  // Sort by totalTimeMs descending, return top 10
  locks.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  return locks.slice(0, 10);
}

// ============================================================
// Alarm Stats (DUMPSYS ALARM)
// ============================================================

/**
 * Parse `dumpsys alarm` output to extract per-app alarm wakeup stats.
 * Looks for "Alarm Stats:" section with per-uid blocks.
 */
export function parseAlarmStats(content: string): AlarmWakeupStat[] {
  const results: AlarmWakeupStat[] = [];

  if (!content) return results;

  // Find "Alarm Stats:" section
  const statsIdx = content.indexOf('Alarm Stats:');
  if (statsIdx === -1) return results;
  const statsBlock = content.slice(statsIdx);

  // Match per-uid blocks (two UID formats):
  //   u0a123:com.example.app +1h2m3s456ms running, 789 wakeups:   (app UID)
  //   1000:android +1m1s75ms running, 523 wakeups:                 (system UID)
  //     +30s456ms 0 wakes 123 alarms, last -1h2m3s4ms:
  //       *walarm*:com.example.ALARM_ACTION
  const uidRegex = /^\s+(\d+|u\w+):(\S+)\s+\+?([^\n]*?)running,\s*(\d+)\s*wakeups?:/gm;
  let uidMatch: RegExpExecArray | null;

  while ((uidMatch = uidRegex.exec(statsBlock)) !== null) {
    const uid = uidMatch[1];
    const appName = uidMatch[2];
    const runtimeStr = uidMatch[3].trim();
    const wakeupCount = parseInt(uidMatch[4], 10);

    if (wakeupCount === 0) continue;

    // Collect top alarms within this uid block (up to next uid block)
    const blockStart = uidMatch.index + uidMatch[0].length;
    const nextUidIdx = statsBlock.indexOf('\n  u', blockStart);
    const blockEnd = nextUidIdx > -1 ? nextUidIdx : statsBlock.length;
    const uidBlock = statsBlock.slice(blockStart, blockEnd);

    const topAlarms: Array<{ name: string; count: number }> = [];
    const alarmRegex = /(\d+)\s+alarms.*?\n\s+\*(?:walarm|alarm)\*:([^\n]+)/g;
    let alarmMatch: RegExpExecArray | null;
    while ((alarmMatch = alarmRegex.exec(uidBlock)) !== null) {
      topAlarms.push({
        count: parseInt(alarmMatch[1], 10),
        name: alarmMatch[2].trim(),
      });
      if (topAlarms.length >= 5) break;
    }
    topAlarms.sort((a, b) => b.count - a.count);

    results.push({
      appName,
      uid,
      wakeupCount,
      runtimeMs: parseDurationToMs(runtimeStr),
      topAlarms,
    });
  }

  // Sort by wakeup count descending
  results.sort((a, b) => b.wakeupCount - a.wakeupCount);
  return results.slice(0, 20);
}

// ============================================================
// Suspend Statistics (from kernel log entries)
// ============================================================

/**
 * Analyze kernel log entries for suspend/resume statistics.
 * Counts suspend attempts, aborts, and identifies top wakeup sources.
 */
export function parseSuspendStats(entries: KernelLogEntry[]): SuspendStats {
  const result: SuspendStats = {
    totalSuspendAttempts: 0,
    suspendAbortCount: 0,
    taskFreezeAbortCount: 0,
    deviceSuspendFailureCount: 0,
    suspendSuccessRate: 0,
    topAbortSources: [],
    topWakeupSources: [],
  };

  if (!entries || entries.length === 0) return result;

  const abortSources = new Map<string, number>();
  const wakeupSources = new Map<string, number>();

  for (const entry of entries) {
    const msg = entry.message;

    // Count suspend attempts
    if (/PM:\s*suspend entry/i.test(msg) || /suspend_enter/i.test(msg)) {
      result.totalSuspendAttempts++;
    }

    // Count suspend aborts (conservative: only count messages that explicitly say "suspend abort")
    if (/suspend abort/i.test(msg) || /Aborting suspend/i.test(msg) ||
        /PM:\s*Some devices failed to suspend/i.test(msg)) {
      result.suspendAbortCount++;
    }

    // Extract abort sources from both suspend abort messages and kernel "Abort:" messages
    // These "Abort:" messages identify WHY suspend failed but may appear multiple times per attempt
    {
      let abortSource: string | undefined;
      // "Abort: Pending Wakeup Sources: [timerfd] [timerfd]" → timerfd
      const pendingMatch = msg.match(/Pending Wakeup Sources:\s*\[([^\]]+)\]/i);
      if (pendingMatch) {
        abortSource = pendingMatch[1];
      }
      // "Abort: Callback failed on 17a10040.qcom,wcn6750 in ..." → device name
      if (!abortSource) {
        const callbackMatch = msg.match(/Callback failed on\s+(\S+)/i);
        if (callbackMatch) {
          abortSource = callbackMatch[1];
        }
      }
      // "Aborting suspend (timerfd)" or "abort ... source: xxx"
      if (!abortSource) {
        const sourceMatch = msg.match(/Aborting suspend\s*\((\S+)\)/i) ||
                            msg.match(/abort.*?(?:by|from|due to|source:?)\s+(\S+)/i);
        if (sourceMatch) {
          abortSource = sourceMatch[1];
        }
      }
      if (abortSource) {
        abortSources.set(abortSource, (abortSources.get(abortSource) ?? 0) + 1);
      }
    }

    // Task freeze abort
    if (/Freezing of tasks\s+(?:aborted|failed)/i.test(msg)) {
      result.taskFreezeAbortCount++;
    }

    // Device suspend failure
    if (/PM:\s*Some devices failed to suspend/i.test(msg) || /dpm_suspend.*failed/i.test(msg)) {
      result.deviceSuspendFailureCount++;
    }

    // Wakeup sources (from successful resume, not abort messages)
    // "Last active Wakeup Source: qrtr_ws" — specific match to avoid "Pending Wakeup Sources:"
    if (/last active wakeup source/i.test(msg) || /wakeup-source/i.test(msg) || /resume.*irq/i.test(msg)) {
      const srcMatch = msg.match(/last active wakeup source:\s*(\S+)/i) ||
                       msg.match(/wakeup-source:\s*(\S+)/i) ||
                       msg.match(/resume.*?irq\s+\d+,?\s*(\S+)/i);
      if (srcMatch) {
        const source = srcMatch[1];
        wakeupSources.set(source, (wakeupSources.get(source) ?? 0) + 1);
      }
    }
  }

  // Calculate success rate
  if (result.totalSuspendAttempts > 0) {
    const successCount = result.totalSuspendAttempts - result.suspendAbortCount;
    result.suspendSuccessRate = (successCount / result.totalSuspendAttempts) * 100;
  }

  // Top abort sources — percentages are relative to total source observations
  const totalAbortSourceObs = [...abortSources.values()].reduce((a, b) => a + b, 0) || 1;
  result.topAbortSources = [...abortSources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / totalAbortSourceObs) * 100,
    }));

  // Top wakeup sources
  const totalWakeups = [...wakeupSources.values()].reduce((a, b) => a + b, 0) || 1;
  result.topWakeupSources = [...wakeupSources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / totalWakeups) * 100,
    }));

  return result;
}

// ============================================================
// Estimated Power Use (DUMPSYS BATTERYSTATS)
// ============================================================

/**
 * Parse "Estimated power use (mAh):" block from batterystats.
 * Format:
 *   Estimated power use (mAh):
 *     Capacity: 5870, Computed drain: 9112, actual drain: 9025
 *     Screen: 45.2
 *     Uid u0a123: 8.4 ( cpu=5.2 sensor=3.2 )
 */
export function parseEstimatedPowerUse(content: string): EstimatedPowerUse | undefined {
  const idx = content.indexOf('Estimated power use (mAh):');
  if (idx === -1) return undefined;

  const block = content.slice(idx);
  // Find the end: next section header (non-indented line after some indented lines)
  const lines = block.split('\n');

  const components: Array<{ name: string; mah: number }> = [];
  const topUids: Array<{ uid: string; name: string; mah: number }> = [];
  let computedTotal = 0;

  // First line is the header, skip it
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at blank line or non-indented line (next section)
    if (!line || (!/^\s/.test(line) && line.trim().length > 0)) break;

    const trimmed = line.trim();
    if (!trimmed) break;

    // "Capacity: 5870, Computed drain: 9112, actual drain: 9025"
    const capacityMatch = trimmed.match(/Computed drain:\s*([\d.]+)/);
    if (capacityMatch) {
      computedTotal = parseFloat(capacityMatch[1]);
      continue;
    }

    // "Uid u0a123: 8.4 ( cpu=... )" or "UID 1000: 3.2" (case-insensitive)
    const uidMatch = trimmed.match(/^Uid\s+(\S+):\s*([\d.]+)/i);
    if (uidMatch) {
      topUids.push({
        uid: uidMatch[1],
        name: uidMatch[1],
        mah: parseFloat(uidMatch[2]),
      });
      continue;
    }

    // Component line: "Screen: 45.2" or "Wifi: 12.3"
    const compMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9 _-]*):\s*([\d.]+)/);
    if (compMatch && !compMatch[1].startsWith('Capacity')) {
      components.push({
        name: compMatch[1].trim(),
        mah: parseFloat(compMatch[2]),
      });
    }
  }

  if (components.length === 0 && topUids.length === 0) return undefined;

  // Sort UIDs by mah descending, keep top 10
  topUids.sort((a, b) => b.mah - a.mah);

  return {
    components,
    topUids: topUids.slice(0, 10),
    computedTotal,
  };
}

// ============================================================
// Connectivity Stats (DUMPSYS BATTERYSTATS)
// ============================================================

/**
 * Parse connectivity statistics from "Statistics since last charge:" block.
 * Extracts WiFi/Cellular active time, data Rx/Tx, signal distribution.
 */
export function parseConnectivityStats(content: string): ConnectivityStats | undefined {
  const statsIdx = content.indexOf('Statistics since last charge:');
  if (statsIdx === -1) return undefined;
  const block = content.slice(statsIdx);

  const result: ConnectivityStats = {
    cellularActiveTimeMs: 0,
    cellularDataRxBytes: 0,
    cellularDataTxBytes: 0,
    wifiActiveTimeMs: 0,
    wifiDataRxBytes: 0,
    wifiDataTxBytes: 0,
    bluetoothActiveTimeMs: 0,
    gpsActiveTimeMs: 0,
    connectivityChanges: 0,
  };

  let hasData = false;

  // Cellular kernel active time: "Cellular kernel active time: 1h 2m 3s 456ms (1.2%)"
  const cellActiveMatch = block.match(/Cellular kernel active time:\s*([^(]+)/);
  if (cellActiveMatch) {
    result.cellularActiveTimeMs = parseDurationToMs(cellActiveMatch[1].trim());
    hasData = true;
  }

  // Cellular data received/sent (bytes): "Cellular data received: 123456789"
  const cellRxMatch = block.match(/Cellular data received:\s*([\d.]+)\s*(\w+)?/);
  if (cellRxMatch) {
    result.cellularDataRxBytes = parseBytesValue(cellRxMatch[0]);
    hasData = true;
  }
  const cellTxMatch = block.match(/Cellular data sent:\s*([\d.]+)\s*(\w+)?/);
  if (cellTxMatch) {
    result.cellularDataTxBytes = parseBytesValue(cellTxMatch[0]);
    hasData = true;
  }

  // WiFi kernel active time: "Wifi kernel active time: 5m 30s 123ms (0.1%)"
  const wifiActiveMatch = block.match(/Wifi kernel active time:\s*([^(]+)/);
  if (wifiActiveMatch) {
    result.wifiActiveTimeMs = parseDurationToMs(wifiActiveMatch[1].trim());
    hasData = true;
  }

  // WiFi data: "Wifi data received: 123456789" / "Wifi data sent: ..."
  const wifiRxMatch = block.match(/Wifi data received:\s*([\d.]+)\s*(\w+)?/);
  if (wifiRxMatch) {
    result.wifiDataRxBytes = parseBytesValue(wifiRxMatch[0]);
    hasData = true;
  }
  const wifiTxMatch = block.match(/Wifi data sent:\s*([\d.]+)\s*(\w+)?/);
  if (wifiTxMatch) {
    result.wifiDataTxBytes = parseBytesValue(wifiTxMatch[0]);
    hasData = true;
  }

  // Bluetooth active time: "Bluetooth total energy: ... active time: 1m 23s 456ms"
  // or "Bluetooth active time: ..."
  const btMatch = block.match(/Bluetooth.*active time:\s*([^\n,(]+)/);
  if (btMatch) {
    result.bluetoothActiveTimeMs = parseDurationToMs(btMatch[1].trim());
    hasData = true;
  }

  // GPS sensor on time: "GPS sensor on time: 30m 12s 345ms"
  const gpsMatch = block.match(/GPS sensor on time:\s*([^\n(]+)/);
  if (gpsMatch) {
    result.gpsActiveTimeMs = parseDurationToMs(gpsMatch[1].trim());
    hasData = true;
  }

  // Connectivity changes: "Connectivity changes: 42"
  const connMatch = block.match(/Connectivity changes:\s*(\d+)/);
  if (connMatch) {
    result.connectivityChanges = parseInt(connMatch[1], 10);
    hasData = true;
  }

  // Signal strength distribution: "Signal level 0 time: 1h 2m (12.3%)"
  const cellSignalDist: Array<{ level: string; percentage: number }> = [];
  const cellSigRegex = /Signal level (\w+) time:[^(]*\(([\d.]+)%\)/g;
  let sigMatch: RegExpExecArray | null;
  while ((sigMatch = cellSigRegex.exec(block)) !== null) {
    cellSignalDist.push({ level: sigMatch[1], percentage: parseFloat(sigMatch[2]) });
  }
  if (cellSignalDist.length > 0) {
    result.cellularSignalDistribution = cellSignalDist;
    hasData = true;
  }

  // WiFi signal levels: "Wifi signal level 0 time: ...(X%)"
  const wifiSignalDist: Array<{ level: string; percentage: number }> = [];
  const wifiSigRegex = /Wifi signal level (\w+) time:[^(]*\(([\d.]+)%\)/g;
  while ((sigMatch = wifiSigRegex.exec(block)) !== null) {
    wifiSignalDist.push({ level: sigMatch[1], percentage: parseFloat(sigMatch[2]) });
  }
  if (wifiSignalDist.length > 0) {
    result.wifiSignalDistribution = wifiSignalDist;
    hasData = true;
  }

  return hasData ? result : undefined;
}

/**
 * Parse bytes value from strings like "123456789", "1.2 GB", "345 MB", "678 KB".
 */
function parseBytesValue(str: string): number {
  const match = str.match(/([\d.]+)\s*(GB|MB|KB|B)?/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  switch (unit) {
    case 'GB': return Math.round(val * 1_073_741_824);
    case 'MB': return Math.round(val * 1_048_576);
    case 'KB': return Math.round(val * 1024);
    default: return Math.round(val);
  }
}

// ============================================================
// Partial Wake Locks (DUMPSYS BATTERYSTATS)
// ============================================================

/**
 * Parse "All partial wake locks:" block from batterystats.
 * Format:
 *   All partial wake locks:
 *     Wake lock u0a123 *alarm*: 1h 23m 45s 678ms (45 times) realtime
 *     Wake lock 1000 *PowerManagerService.WakeLocks*: 2h 10m (123 times) realtime
 */
export function parsePartialWakeLocks(content: string): PartialWakeLockStat[] {
  const idx = content.indexOf('All partial wake locks:');
  if (idx === -1) return [];

  const block = content.slice(idx);
  const locks: PartialWakeLockStat[] = [];

  // Match: "Wake lock <uid> <tag>: <duration> (<count> times) realtime"
  const regex = /Wake lock\s+(\S+)\s+(.+?):\s*(.+?)\s*\((\d+)\s*times?\)\s*realtime/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(block)) !== null) {
    const uid = match[1];
    const rawName = match[2].trim();
    // Remove surrounding asterisks: "*alarm*" → "alarm"
    const name = rawName.replace(/^\*|\*$/g, '');
    const durationStr = match[3].trim();
    const count = parseInt(match[4], 10);

    locks.push({
      name,
      uid,
      totalTimeMs: parseDurationToMs(durationStr),
      count,
    });
  }

  // Sort by totalTimeMs descending, return top 20
  locks.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  return locks.slice(0, 20);
}

// ============================================================
// Helpers: extract per-service sub-section from large DUMPSYS
// ============================================================

/**
 * Extract a specific "DUMP OF SERVICE <name>:" sub-section from a large DUMPSYS block.
 * Handles both "DUMP OF SERVICE <name>:" and "DUMP OF SERVICE CRITICAL <name>:" formats.
 * Returns the text between the marker and the next "DUMP OF SERVICE" or section boundary.
 * Returns null if not found.
 */
function extractServiceSubSection(content: string, serviceName: string): string | null {
  // Try both formats: "DUMP OF SERVICE power:" and "DUMP OF SERVICE CRITICAL power:"
  let startIdx = content.indexOf(`DUMP OF SERVICE ${serviceName}:`);
  if (startIdx === -1) {
    startIdx = content.indexOf(`DUMP OF SERVICE CRITICAL ${serviceName}:`);
  }
  if (startIdx === -1) return null;

  // Find the end: next "DUMP OF SERVICE" or "------" section boundary
  const searchFrom = startIdx + 30; // skip past current header
  const nextDump = content.indexOf('DUMP OF SERVICE ', searchFrom);
  const nextBoundary = content.indexOf('\n------', searchFrom);

  let endIdx = content.length;
  if (nextDump > -1) endIdx = Math.min(endIdx, nextDump);
  if (nextBoundary > -1) endIdx = Math.min(endIdx, nextBoundary);

  return content.slice(startIdx, endIdx);
}

// ============================================================
// Aggregate: Parse all power-related sections
// ============================================================

/**
 * Parse all power-related sections from a bugreport.
 * Uses content-based detection (not section names) to find relevant sections.
 *
 * Large DUMPSYS sections (e.g. 20MB+) contain multiple "DUMP OF SERVICE xxx:" sub-sections.
 * We extract the specific sub-section for each service to avoid regex matching the wrong fields.
 */
export function parsePowerSections(
  sections: BugreportSection[],
  kernelEntries?: KernelLogEntry[],
): PowerParseResult {
  const result: PowerParseResult = {
    kernelWakeLocks: [],
  };

  for (const section of sections) {
    // Power Manager: extract "DUMP OF SERVICE [CRITICAL] power:" sub-section
    if (!result.powerManagerState && section.content.includes('mWakefulness=')) {
      const subSection = extractServiceSubSection(section.content, 'power');
      // For large multi-service sections, only parse if we found the specific sub-section
      // For small dedicated sections (<100KB), parse the whole content
      const toParse = subSection ?? (section.content.length < 100_000 ? section.content : null);
      if (toParse) {
        result.powerManagerState = parsePowerManager(toParse);
      }
    }

    // DeviceIdle: extract "DUMP OF SERVICE [CRITICAL] deviceidle:" sub-section
    if (!result.dozeState && section.content.includes('mDeepEnabled=')) {
      const subSection = extractServiceSubSection(section.content, 'deviceidle');
      const toParse = subSection ?? (section.content.length < 100_000 ? section.content : null);
      if (toParse) {
        const { dozeState, dozeSettings } = parseDeviceIdle(toParse);
        result.dozeState = dozeState;
        result.dozeSettings = dozeSettings;
      }
    }

    // BatteryStats: contains "Statistics since last charge:"
    if (!result.batteryStats && section.content.includes('Statistics since last charge:')) {
      result.batteryStats = parseBatteryStats(section.content);
      result.estimatedPowerUse = parseEstimatedPowerUse(section.content);
      result.connectivityStats = parseConnectivityStats(section.content);
      result.partialWakeLocks = parsePartialWakeLocks(section.content);
    }

    // Checkin BatteryStats: section name contains "CHECKIN BATTERYSTATS"
    if (result.kernelWakeLocks.length === 0 &&
        (section.name.toUpperCase().includes('CHECKIN BATTERYSTATS') ||
         section.content.includes(',l,kwl,'))) {
      result.kernelWakeLocks = parseKernelWakeLocks(section.content);
    }

    // Alarm Stats: section contains "Alarm Stats:"
    if (!result.alarmWakeups && section.content.includes('Alarm Stats:')) {
      const subSection = extractServiceSubSection(section.content, 'alarm');
      result.alarmWakeups = parseAlarmStats(subSection ?? section.content);
    }
  }

  // Suspend stats from kernel entries
  if (kernelEntries && kernelEntries.length > 0) {
    result.suspendStats = parseSuspendStats(kernelEntries);
  }

  return result;
}
