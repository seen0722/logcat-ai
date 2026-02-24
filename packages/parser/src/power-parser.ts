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
  const settingsMatch = content.match(/Settings:\s*\n([\s\S]*?)(?:\n\s*\n|\n\w)/);
  if (settingsMatch) {
    const block = settingsMatch[1];

    // Settings values can be plain numbers (ms) or Android duration format (+30m0s0ms)
    const settingVal = (key: string): number => {
      const m = block.match(new RegExp(`${key}=\\+?([^\\n,]+)`));
      if (!m) return 0;
      const raw = m[1].trim();
      // Plain number = milliseconds
      if (/^\d+$/.test(raw)) return parseInt(raw, 10);
      // Android duration format: +30m0s0ms
      return parseDurationToMs(raw);
    };

    dozeSettings.inactiveTo = settingVal('inactive_to');
    dozeSettings.idleTo = settingVal('idle_to') || settingVal('idle_after_inactive_to');
    dozeSettings.idleFactor = parseFloat(block.match(/idle_factor=([\d.]+)/)?.[1] ?? '0') || 0;
    dozeSettings.maxIdleTo = settingVal('max_idle_to');
    dozeSettings.lightIdleTo = settingVal('light_idle_to');
    dozeSettings.lightMaxIdleTo = settingVal('light_max_idle_to');
    dozeSettings.lightIdleFactor = parseFloat(block.match(/light_idle_factor=([\d.]+)/)?.[1] ?? '0') || 0;
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

  // Screen off discharge
  const screenOffMatch = statsBlock.match(/Amount discharged while screen off:\s*([\d.]+)\s*mAh/);
  if (screenOffMatch) result.screenOffDischargeMah = parseFloat(screenOffMatch[1]);

  // Deep Doze time: "Device Idle mode enabled time: ..." or "Device deep doze ..."
  // Pattern: "Device Idle (deep): 2h 10m 15s 123ms"
  const deepDozeMatch = statsBlock.match(/(?:Device Idle mode enabled|Device idle time|Device Idle \(deep\))(?:\s*time)?:\s*([^(]+?)(?:\s*\(|$)/m);
  if (deepDozeMatch) {
    result.deepDozeTime = deepDozeMatch[1].trim();
    result.deepDozeTimeMs = parseDurationToMs(result.deepDozeTime);
  }

  // Deep Doze discharge: "Discharge step during device Idle mode: NNN mAh"
  // Or: "Amount discharged in deep doze: NNN mAh"
  const deepDozeDischargeMatch = statsBlock.match(/(?:Discharge step during device Idle mode|Amount discharged.*deep doze):\s*([\d.]+)\s*mAh/i);
  if (deepDozeDischargeMatch) {
    result.deepDozeDischargeMah = parseFloat(deepDozeDischargeMatch[1]);
  }

  // Calculate Deep Doze discharge rate
  if (result.deepDozeTimeMs > 0 && result.deepDozeDischargeMah > 0) {
    const hours = result.deepDozeTimeMs / 3_600_000;
    result.deepDozeDischargeRateMahPerHr = result.deepDozeDischargeMah / hours;
  }

  // Light Doze time
  const lightDozeMatch = statsBlock.match(/(?:Device light idle time|Device Idle \(light\))(?:\s*time)?:\s*([^(]+?)(?:\s*\(|$)/m);
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
    const name = match[1];
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

  // Match per-uid blocks:
  //   u0a123:com.example.app +1h2m3s456ms running, 789 wakeups:
  //     +30s456ms 0 wakes 123 alarms, last -1h2m3s4ms:
  //       *walarm*:com.example.ALARM_ACTION
  const uidRegex = /^\s+u(\w+):(\S+)\s+\+?([^\n]*?)running,\s*(\d+)\s*wakeups?:/gm;
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

    // Count suspend aborts
    if (/suspend abort/i.test(msg) || /Aborting suspend/i.test(msg) || /PM:\s*Some devices failed to suspend/i.test(msg)) {
      result.suspendAbortCount++;

      // Extract abort source
      const sourceMatch = msg.match(/abort.*?(?:by|from|due to|source:?)\s*(\S+)/i) ||
                          msg.match(/Aborting suspend\s*\((\S+)\)/i);
      if (sourceMatch) {
        const source = sourceMatch[1];
        abortSources.set(source, (abortSources.get(source) ?? 0) + 1);
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

    // Wakeup sources
    if (/wakeup.*source/i.test(msg) || /wakeup-source/i.test(msg) || /resume.*irq/i.test(msg)) {
      const srcMatch = msg.match(/wakeup.*?source:?\s*(\S+)/i) ||
                       msg.match(/resume.*?irq\s*\d+,?\s*(\S+)/i);
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

  // Top abort sources
  const totalAborts = result.suspendAbortCount || 1;
  result.topAbortSources = [...abortSources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / totalAborts) * 100,
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
// Aggregate: Parse all power-related sections
// ============================================================

/**
 * Parse all power-related sections from a bugreport.
 * Uses content-based detection (not section names) to find relevant sections.
 */
export function parsePowerSections(
  sections: BugreportSection[],
  kernelEntries?: KernelLogEntry[],
): PowerParseResult {
  const result: PowerParseResult = {
    kernelWakeLocks: [],
  };

  for (const section of sections) {
    // Power Manager: contains "mWakefulness="
    if (!result.powerManagerState && section.content.includes('mWakefulness=')) {
      result.powerManagerState = parsePowerManager(section.content);
    }

    // DeviceIdle: contains "DeviceIdleController" and "mState="
    if (!result.dozeState && section.content.includes('DeviceIdleController') && section.content.includes('mState=')) {
      const { dozeState, dozeSettings } = parseDeviceIdle(section.content);
      result.dozeState = dozeState;
      result.dozeSettings = dozeSettings;
    }

    // BatteryStats: contains "Statistics since last charge:"
    if (!result.batteryStats && section.content.includes('Statistics since last charge:')) {
      result.batteryStats = parseBatteryStats(section.content);
    }

    // Checkin BatteryStats: section name contains "CHECKIN BATTERYSTATS"
    if (result.kernelWakeLocks.length === 0 &&
        (section.name.toUpperCase().includes('CHECKIN BATTERYSTATS') ||
         section.content.includes(',l,kwl,'))) {
      result.kernelWakeLocks = parseKernelWakeLocks(section.content);
    }

    // Alarm Stats: section contains "Alarm Stats:"
    if (!result.alarmWakeups && section.content.includes('Alarm Stats:')) {
      result.alarmWakeups = parseAlarmStats(section.content);
    }
  }

  // Suspend stats from kernel entries
  if (kernelEntries && kernelEntries.length > 0) {
    result.suspendStats = parseSuspendStats(kernelEntries);
  }

  return result;
}
