import { describe, it, expect } from 'vitest';
import {
  parsePowerManager,
  parseDeviceIdle,
  parseBatteryStats,
  parseKernelWakeLocks,
  parsePowerSections,
  parseDurationToMs,
  parseAlarmStats,
  parseSuspendStats,
} from '../src/power-parser.js';
import { BugreportSection, KernelLogEntry } from '../src/types.js';

describe('parseDurationToMs', () => {
  it('parses days, hours, minutes, seconds, milliseconds', () => {
    expect(parseDurationToMs('1d 2h 3m 4s 567ms')).toBe(
      86400000 + 7200000 + 180000 + 4000 + 567,
    );
  });

  it('parses hours and minutes only', () => {
    expect(parseDurationToMs('3h 15m 30s')).toBe(
      10800000 + 900000 + 30000,
    );
  });

  it('parses minutes and seconds', () => {
    expect(parseDurationToMs('45m 12s 345ms')).toBe(
      2700000 + 12000 + 345,
    );
  });

  it('returns 0 for empty string', () => {
    expect(parseDurationToMs('')).toBe(0);
  });
});

describe('parsePowerManager', () => {
  const POWER_CONTENT = `
Power Manager State:
  mWakefulness=Dozing
  mIsPowered=false
  mPlugType=0
  mBatteryLevel=75
  mLastSleepReason=timeout
  mScreenOffTimeoutSetting=30000
  mHalAutoSuspendModeEnabled=true

Wake Locks: size=2
  PARTIAL_WAKE_LOCK  'dream:doze' ACQ=-1h2m3s (uid=1000 pid=1234)
  DOZE_WAKE_LOCK     'DreamManagerService' (uid=1000 pid=5678)

Suspend Blockers: size=2
  PowerManagerService.WakeLocks: ref count=1
  PowerManagerService.Display: ref count=0

Settings and Configuration:
  mDecoupleHalAutoSuspendModeFromDisplayConfig=false
`;

  it('extracts wakefulness and battery state', () => {
    const result = parsePowerManager(POWER_CONTENT);
    expect(result.wakefulness).toBe('Dozing');
    expect(result.isPowered).toBe(false);
    expect(result.plugType).toBe(0);
    expect(result.batteryLevel).toBe(75);
    expect(result.lastSleepReason).toBe('timeout');
    expect(result.screenOffTimeout).toBe(30000);
    expect(result.useAutoSuspend).toBe(true);
  });

  it('parses active wake locks', () => {
    const result = parsePowerManager(POWER_CONTENT);
    expect(result.activeWakeLocks).toHaveLength(2);
    expect(result.activeWakeLocks[0]).toEqual({
      type: 'PARTIAL_WAKE_LOCK',
      tag: 'dream:doze',
      duration: '-1h2m3s',
      uid: 1000,
      pid: 1234,
    });
    expect(result.activeWakeLocks[1].type).toBe('DOZE_WAKE_LOCK');
  });

  it('parses suspend blockers', () => {
    const result = parsePowerManager(POWER_CONTENT);
    expect(result.suspendBlockers).toHaveLength(2);
    expect(result.suspendBlockers[0]).toEqual({
      name: 'PowerManagerService.WakeLocks',
      refCount: 1,
    });
    expect(result.activeSuspendBlockerCount).toBe(2);
  });

  it('handles empty content', () => {
    const result = parsePowerManager('');
    expect(result.wakefulness).toBe('Unknown');
    expect(result.activeWakeLocks).toHaveLength(0);
  });
});

describe('parseDeviceIdle', () => {
  const DEVICEIDLE_CONTENT = `
DeviceIdleController:
  mState=IDLE
  mLightState=OVERRIDE
  mScreenOn=false
  mCharging=false
  mDeepEnabled=true
  mLightEnabled=true

  Settings:
    inactive_to=+30m0s0ms
    idle_to=+1h0m0s0ms
    idle_factor=2.0
    max_idle_to=+6h0m0s0ms
    light_idle_to=+5m0s0ms
    light_max_idle_to=+15m0s0ms
    light_idle_factor=2.0

  Idling history:
`;

  it('extracts doze state', () => {
    const { dozeState } = parseDeviceIdle(DEVICEIDLE_CONTENT);
    expect(dozeState.deepState).toBe('IDLE');
    expect(dozeState.lightState).toBe('OVERRIDE');
    expect(dozeState.screenOn).toBe(false);
    expect(dozeState.charging).toBe(false);
    expect(dozeState.deepEnabled).toBe(true);
    expect(dozeState.lightEnabled).toBe(true);
  });

  it('extracts doze settings', () => {
    const { dozeSettings } = parseDeviceIdle(DEVICEIDLE_CONTENT);
    expect(dozeSettings.inactiveTo).toBeGreaterThan(0);
    expect(dozeSettings.idleFactor).toBe(2.0);
    expect(dozeSettings.lightIdleFactor).toBe(2.0);
  });

  it('handles empty content', () => {
    const { dozeState } = parseDeviceIdle('');
    expect(dozeState.deepState).toBe('UNKNOWN');
  });
});

describe('parseBatteryStats', () => {
  const BATTERY_CONTENT = `
Estimated battery capacity: 4500 mAh

Statistics since last charge:
  System starts: 1, currently on battery: true
  Time on battery: 1d 2h 10m 15s 123ms (100.0%) realtime, 23h 45m 12s 456ms (95.0%) uptime
  Screen on: 3h 45m 30s 200ms (15.8%) 5x, Interactive: 3h 44m 15s 100ms (15.7%)
  Discharge: 1050 mAh
  Amount discharged while screen off: 850 mAh
  Device Idle (deep): 2h 10m 15s 123ms
  Amount discharged in deep doze: 103 mAh
  Device Idle (light): 5h 30m 0s 0ms
  Total partial wakelock time: 4h 20m 15s 800ms
`;

  it('extracts battery capacity', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.batteryCapacityMah).toBe(4500);
  });

  it('extracts time on battery', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.timePeriod).not.toBe('');
    expect(result.timePeriodMs).toBeGreaterThan(0);
  });

  it('extracts screen on time', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.screenOnTime).not.toBe('');
    expect(result.screenOnTimeMs).toBeGreaterThan(0);
  });

  it('extracts discharge amounts', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.totalDischargeMah).toBe(1050);
    expect(result.screenOffDischargeMah).toBe(850);
  });

  it('extracts deep doze stats and calculates discharge rate', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.deepDozeTimeMs).toBeGreaterThan(0);
    expect(result.deepDozeDischargeMah).toBe(103);
    // 103 mAh / (2h 10m 15s in hours) ≈ 47.5 mAh/h
    expect(result.deepDozeDischargeRateMahPerHr).toBeGreaterThan(40);
    expect(result.deepDozeDischargeRateMahPerHr).toBeLessThan(55);
  });

  it('extracts light doze time', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.lightDozeTimeMs).toBeGreaterThan(0);
  });

  it('extracts partial wakelock time', () => {
    const result = parseBatteryStats(BATTERY_CONTENT);
    expect(result.partialWakelockTimeMs).toBeGreaterThan(0);
  });

  it('handles empty content', () => {
    const result = parseBatteryStats('');
    expect(result.batteryCapacityMah).toBe(0);
  });
});

describe('parseKernelWakeLocks', () => {
  const CHECKIN_CONTENT = `
9,0,i,vers,36,230,SPU
9,0,i,uid,1000,com.android.phone
9,0,l,kwl,timerfd,5400000,1800
9,0,l,kwl,qcom_rx_wakelock,3200000,900
9,0,l,kwl,alarm_rtc,1500000,450
9,0,l,kwl,PowerManagerService.WakeLocks,800000,200
9,0,l,kwl,wlan_wow_wl,600000,300
`;

  it('parses kernel wakelocks sorted by totalTimeMs', () => {
    const result = parseKernelWakeLocks(CHECKIN_CONTENT);
    expect(result).toHaveLength(5);
    expect(result[0].name).toBe('timerfd');
    expect(result[0].totalTimeMs).toBe(5400000);
    expect(result[0].count).toBe(1800);
    expect(result[0].avgTimeMs).toBe(3000);
    expect(result[1].name).toBe('qcom_rx_wakelock');
  });

  it('returns top 10 only', () => {
    let content = '';
    for (let i = 0; i < 15; i++) {
      content += `9,0,l,kwl,wl_${i},${(15 - i) * 1000},${10 + i}\n`;
    }
    const result = parseKernelWakeLocks(content);
    expect(result).toHaveLength(10);
  });

  it('handles empty content', () => {
    expect(parseKernelWakeLocks('')).toHaveLength(0);
  });
});

describe('parseAlarmStats', () => {
  const ALARM_CONTENT = `
Current Alarm Manager state:

Alarm Stats:
  u0a123:com.example.app +1h2m3s456ms running, 789 wakeups:
    +30s456ms 0 wakes 123 alarms, last -1h2m3s4ms:
      *walarm*:com.example.ALARM_ACTION
    +10s200ms 0 wakes 50 alarms, last -30m:
      *walarm*:com.example.SYNC
  u0a456:com.other.app +45m running, 50 wakeups:
    +5s100ms 0 wakes 30 alarms, last -15m:
      *walarm*:com.other.CHECK
`;

  it('parses per-app alarm wakeup stats', () => {
    const result = parseAlarmStats(ALARM_CONTENT);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].appName).toBe('com.example.app');
    expect(result[0].wakeupCount).toBe(789);
  });

  it('sorts by wakeup count descending', () => {
    const result = parseAlarmStats(ALARM_CONTENT);
    if (result.length >= 2) {
      expect(result[0].wakeupCount).toBeGreaterThanOrEqual(result[1].wakeupCount);
    }
  });

  it('handles empty content', () => {
    expect(parseAlarmStats('')).toHaveLength(0);
  });
});

describe('parseSuspendStats', () => {
  it('counts suspend attempts and aborts', () => {
    const entries: KernelLogEntry[] = [
      { timestamp: 100, level: '<6>', facility: '', message: 'PM: suspend entry (deep)', raw: '' },
      { timestamp: 101, level: '<6>', facility: '', message: 'PM: suspend exit', raw: '' },
      { timestamp: 200, level: '<6>', facility: '', message: 'PM: suspend entry (deep)', raw: '' },
      { timestamp: 201, level: '<4>', facility: '', message: 'Aborting suspend (timerfd)', raw: '' },
      { timestamp: 300, level: '<6>', facility: '', message: 'PM: suspend entry (deep)', raw: '' },
      { timestamp: 301, level: '<6>', facility: '', message: 'PM: suspend exit', raw: '' },
    ];
    const result = parseSuspendStats(entries);
    expect(result.totalSuspendAttempts).toBe(3);
    expect(result.suspendAbortCount).toBe(1);
    expect(result.suspendSuccessRate).toBeCloseTo(66.67, 0);
  });

  it('handles empty entries', () => {
    const result = parseSuspendStats([]);
    expect(result.totalSuspendAttempts).toBe(0);
    expect(result.suspendSuccessRate).toBe(0);
  });
});

describe('parsePowerSections', () => {
  it('identifies sections by content features', () => {
    const sections: BugreportSection[] = [
      {
        name: 'DUMPSYS',
        command: 'dumpsys power',
        content: 'Power Manager State:\n  mWakefulness=Awake\n  mIsPowered=true\n  mPlugType=2\n  mBatteryLevel=50\n\nSuspend Blockers:\n  test: ref count=1\n\nother',
        startLine: 0,
        endLine: 10,
      },
      {
        name: 'DUMPSYS',
        command: 'dumpsys deviceidle',
        content: 'DeviceIdleController:\n  mState=ACTIVE\n  mLightState=ACTIVE\n  mScreenOn=true\n  mCharging=true\n  mDeepEnabled=true\n  mLightEnabled=true\n\n  Settings:\n    inactive_to=1800000\n\nother',
        startLine: 11,
        endLine: 20,
      },
      {
        name: 'DUMPSYS BATTERYSTATS',
        command: 'dumpsys batterystats',
        content: 'Estimated battery capacity: 3000 mAh\n\nStatistics since last charge:\n  Time on battery: 5h 0m 0s 0ms (100.0%) realtime\n  Discharge: 500 mAh\n\n',
        startLine: 21,
        endLine: 30,
      },
      {
        name: 'CHECKIN BATTERYSTATS',
        command: 'dumpsys batterystats -c',
        content: '9,0,l,kwl,test_wl,60000,10\n',
        startLine: 31,
        endLine: 40,
      },
    ];

    const result = parsePowerSections(sections);

    expect(result.powerManagerState).toBeDefined();
    expect(result.powerManagerState!.wakefulness).toBe('Awake');
    expect(result.powerManagerState!.isPowered).toBe(true);

    expect(result.dozeState).toBeDefined();
    expect(result.dozeState!.deepState).toBe('ACTIVE');

    expect(result.batteryStats).toBeDefined();
    expect(result.batteryStats!.batteryCapacityMah).toBe(3000);

    expect(result.kernelWakeLocks).toHaveLength(1);
    expect(result.kernelWakeLocks[0].name).toBe('test_wl');
  });

  it('handles missing sections', () => {
    const result = parsePowerSections([]);
    expect(result.powerManagerState).toBeUndefined();
    expect(result.dozeState).toBeUndefined();
    expect(result.batteryStats).toBeUndefined();
    expect(result.kernelWakeLocks).toHaveLength(0);
  });
});
