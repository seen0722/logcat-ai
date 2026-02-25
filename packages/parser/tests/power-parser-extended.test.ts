import { describe, it, expect } from 'vitest';
import { parseEstimatedPowerUse, parseConnectivityStats, parsePartialWakeLocks } from '../src/power-parser.js';

// ============================================================
// parseEstimatedPowerUse
// ============================================================

describe('parseEstimatedPowerUse', () => {
  it('should parse component and UID power entries', () => {
    const content = `
  Estimated power use (mAh):
    Capacity: 5870, Computed drain: 9112.4, actual drain: 9025
    Screen: 45.2
    Wifi: 12.3
    Bluetooth: 3.1
    Uid u0a123: 8.4 ( cpu=5.2 sensor=3.2 )
    Uid u0a456: 5.1
    Uid 1000: 3.2

  All partial wake locks:
`;
    const result = parseEstimatedPowerUse(content);
    expect(result).toBeDefined();
    expect(result!.computedTotal).toBe(9112.4);
    expect(result!.components).toEqual([
      { name: 'Screen', mah: 45.2 },
      { name: 'Wifi', mah: 12.3 },
      { name: 'Bluetooth', mah: 3.1 },
    ]);
    expect(result!.topUids).toHaveLength(3);
    expect(result!.topUids[0]).toEqual({ uid: 'u0a123', name: 'u0a123', mah: 8.4 });
    expect(result!.topUids[1]).toEqual({ uid: 'u0a456', name: 'u0a456', mah: 5.1 });
    expect(result!.topUids[2]).toEqual({ uid: '1000', name: '1000', mah: 3.2 });
  });

  it('should return undefined for empty content', () => {
    expect(parseEstimatedPowerUse('')).toBeUndefined();
  });

  it('should return undefined when section not found', () => {
    expect(parseEstimatedPowerUse('Statistics since last charge:\n  Screen on: 1h')).toBeUndefined();
  });

  it('should handle only components, no UIDs', () => {
    const content = `
  Estimated power use (mAh):
    Capacity: 5000, Computed drain: 100, actual drain: 95
    Screen: 50.0
    Idle: 20.0

  Next section:
`;
    const result = parseEstimatedPowerUse(content);
    expect(result).toBeDefined();
    expect(result!.components).toHaveLength(2);
    expect(result!.topUids).toHaveLength(0);
    expect(result!.computedTotal).toBe(100);
  });
});

// ============================================================
// parseConnectivityStats
// ============================================================

describe('parseConnectivityStats', () => {
  it('should parse cellular and WiFi stats', () => {
    const content = `
  Statistics since last charge:
    Time on battery: 6d 0h 49m 14s 620ms (100.0%) realtime
    Cellular kernel active time: 1h 30m 45s 123ms (1.0%)
    Cellular data received: 123456789
    Cellular data sent: 987654321
    Wifi kernel active time: 5m 30s 456ms (0.1%)
    Wifi data received: 555666777
    Wifi data sent: 111222333
    Bluetooth total energy: 0.00 mAh, active time: 2m 15s 100ms
    GPS sensor on time: 10m 5s 200ms
    Connectivity changes: 42
    Signal level 0 time: 1h 2m 3s (12.3%)
    Signal level 1 time: 3h 4m 5s (37.5%)
    Signal level 2 time: 5h (50.2%)
    Wifi signal level 3 time: 2h (80.0%)
    Wifi signal level 2 time: 30m (20.0%)
`;
    const result = parseConnectivityStats(content);
    expect(result).toBeDefined();
    expect(result!.cellularActiveTimeMs).toBe(5445123); // 1h30m45s123ms
    expect(result!.cellularDataRxBytes).toBe(123456789);
    expect(result!.cellularDataTxBytes).toBe(987654321);
    expect(result!.wifiActiveTimeMs).toBe(330456); // 5m30s456ms
    expect(result!.wifiDataRxBytes).toBe(555666777);
    expect(result!.wifiDataTxBytes).toBe(111222333);
    expect(result!.bluetoothActiveTimeMs).toBe(135100); // 2m15s100ms
    expect(result!.gpsActiveTimeMs).toBe(605200); // 10m5s200ms
    expect(result!.connectivityChanges).toBe(42);
    expect(result!.cellularSignalDistribution).toHaveLength(3);
    expect(result!.cellularSignalDistribution![0]).toEqual({ level: '0', percentage: 12.3 });
    expect(result!.wifiSignalDistribution).toHaveLength(2);
    expect(result!.wifiSignalDistribution![0]).toEqual({ level: '3', percentage: 80.0 });
  });

  it('should return undefined for empty content', () => {
    expect(parseConnectivityStats('')).toBeUndefined();
  });

  it('should return undefined when section not found', () => {
    expect(parseConnectivityStats('No stats here')).toBeUndefined();
  });

  it('should return undefined when section exists but no connectivity data', () => {
    const content = `Statistics since last charge:
    Time on battery: 1h
    Screen on: 30m
`;
    expect(parseConnectivityStats(content)).toBeUndefined();
  });

  it('should parse partial data (only cellular)', () => {
    const content = `Statistics since last charge:
    Cellular kernel active time: 30s 500ms (0.01%)
    Cellular data received: 1024
`;
    const result = parseConnectivityStats(content);
    expect(result).toBeDefined();
    expect(result!.cellularActiveTimeMs).toBe(30500);
    expect(result!.cellularDataRxBytes).toBe(1024);
    expect(result!.wifiActiveTimeMs).toBe(0);
  });
});

// ============================================================
// parsePartialWakeLocks
// ============================================================

describe('parsePartialWakeLocks', () => {
  it('should parse partial wake lock entries', () => {
    const content = `
  All partial wake locks:
    Wake lock u0a123 *alarm*: 1h 23m 45s 678ms (45 times) realtime
    Wake lock 1000 *PowerManagerService.WakeLocks*: 2h 10m 0s 0ms (123 times) realtime
    Wake lock u0a456 *NetworkStats*: 5m 30s 200ms (10 times) realtime

  Statistics since last full charge:
`;
    const result = parsePartialWakeLocks(content);
    expect(result).toHaveLength(3);
    // Sorted by totalTimeMs descending
    expect(result[0].name).toBe('PowerManagerService.WakeLocks');
    expect(result[0].uid).toBe('1000');
    expect(result[0].count).toBe(123);
    expect(result[0].totalTimeMs).toBe(7800000); // 2h10m
    expect(result[1].name).toBe('alarm');
    expect(result[1].uid).toBe('u0a123');
    expect(result[1].count).toBe(45);
    expect(result[2].name).toBe('NetworkStats');
    expect(result[2].uid).toBe('u0a456');
  });

  it('should return empty array for empty content', () => {
    expect(parsePartialWakeLocks('')).toEqual([]);
  });

  it('should return empty array when section not found', () => {
    expect(parsePartialWakeLocks('Some other content')).toEqual([]);
  });

  it('should limit to top 20', () => {
    const lines: string[] = ['All partial wake locks:'];
    for (let i = 0; i < 30; i++) {
      lines.push(`    Wake lock u0a${i} *lock${i}*: ${i + 1}m 0s 0ms (${i + 1} times) realtime`);
    }
    const content = lines.join('\n');
    const result = parsePartialWakeLocks(content);
    expect(result).toHaveLength(20);
    // Should be sorted descending — highest time first
    expect(result[0].name).toBe('lock29');
  });
});
