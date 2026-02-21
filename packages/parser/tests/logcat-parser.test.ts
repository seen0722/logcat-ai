import { describe, it, expect } from 'vitest';
import { parseLogcat, classifyTag, computeTagStats } from '../src/logcat-parser.js';

describe('parseLogcat', () => {
  it('should parse standard logcat lines', () => {
    const content = [
      '01-15 10:00:00.123  1000  1001 I ActivityManager: Start proc 1234:com.example.app/u0a10',
      '01-15 10:00:00.456  1000  1002 D WindowManager: relayoutWindow',
      '01-15 10:00:01.000  2000  2001 W System.err: java.lang.NullPointerException',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.entries).toHaveLength(3);
    expect(result.parseErrors).toBe(0);

    expect(result.entries[0].timestamp).toBe('01-15 10:00:00.123');
    expect(result.entries[0].pid).toBe(1000);
    expect(result.entries[0].tid).toBe(1001);
    expect(result.entries[0].level).toBe('I');
    expect(result.entries[0].tag).toBe('ActivityManager');
    expect(result.entries[0].message).toContain('Start proc');
  });

  it('should append continuation lines to previous entry', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 E AndroidRuntime: FATAL EXCEPTION: main',
      '\tat com.example.app.MainActivity.onCreate(MainActivity.java:42)',
      '\tat android.app.Activity.performCreate(Activity.java:1234)',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toContain('FATAL EXCEPTION');
    expect(result.entries[0].message).toContain('MainActivity.onCreate');
    expect(result.entries[0].message).toContain('Activity.performCreate');
  });

  it('should detect ANR anomaly', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 I ActivityManager: ANR in com.example.app (com.example.app/.MainActivity)',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('anr');
    expect(result.anomalies[0].severity).toBe('critical');
    expect(result.anomalies[0].summary).toContain('com.example.app');
  });

  it('should detect FATAL EXCEPTION anomaly', () => {
    const content = [
      '01-15 10:00:00.000  2000  2001 E AndroidRuntime: FATAL EXCEPTION: main',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('fatal_exception');
    expect(result.anomalies[0].severity).toBe('critical');
  });

  it('should detect OOM anomaly', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 I ActivityManager: Out of memory for process com.example.app',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('oom');
  });

  it('should detect watchdog anomaly', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 W Watchdog: Blocked in handler on ActivityManager (ActivityManager)',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('watchdog');
    expect(result.anomalies[0].summary).toContain('ActivityManager');
  });

  it('should detect binder timeout', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 W JavaBinder: Binder transaction timeout for 1000->1001',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('binder_timeout');
    expect(result.anomalies[0].severity).toBe('warning');
  });

  it('should detect slow operation', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 W Looper: Slow dispatch took 2500ms',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('slow_operation');
  });

  it('should deduplicate same-type anomalies within 1 second', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 I ActivityManager: ANR in com.example.app',
      '01-15 10:00:00.500  1000  1001 I ActivityManager: ANR in com.example.app (reason)',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
  });

  it('should not deduplicate different-type anomalies', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 I ActivityManager: ANR in com.example.app',
      '01-15 10:00:00.500  2000  2001 E AndroidRuntime: FATAL EXCEPTION: main',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(2);
  });

  // Input dispatching timeout (#33)
  it('should detect input_dispatching_timeout', () => {
    const content = '01-15 10:00:00.000  1000  1001 E InputDispatcher: Input dispatching timed out (com.example.app/com.example.app.MainActivity)';
    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('input_dispatching_timeout');
    expect(result.anomalies[0].severity).toBe('critical');
  });

  // HAL service death (#37)
  it('should detect hal_service_death', () => {
    const content = '01-15 10:00:00.000  1000  1001 E hwservicemanager: service vendor.audio@2.0::IAudio has died';
    const result = parseLogcat(content);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].type).toBe('hal_service_death');
    expect(result.anomalies[0].severity).toBe('warning');
    expect(result.anomalies[0].summary).toContain('HAL service died');
  });

  it('should handle empty content', () => {
    const result = parseLogcat('');
    expect(result.entries).toHaveLength(0);
    expect(result.anomalies).toHaveLength(0);
  });

  it('should report totalLines and parsedLines', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 I Tag: msg1',
      'not a logcat line',
      '01-15 10:00:01.000  1000  1001 I Tag: msg2',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.totalLines).toBe(3);
    expect(result.parsedLines).toBe(2);
    expect(result.parseErrors).toBe(1);
  });

  // Tag stats (#39)
  it('should compute tagStats for E/F level entries', () => {
    const content = [
      '01-15 10:00:00.000  1000  1001 E vendor_sensor: sensor error',
      '01-15 10:00:00.100  1000  1001 E vendor_sensor: another error',
      '01-15 10:00:00.200  1000  1001 E ActivityManager: process crash',
      '01-15 10:00:00.300  1000  1001 F AndroidRuntime: FATAL EXCEPTION: main',
      '01-15 10:00:00.400  1000  1001 I ActivityManager: Start proc',
      '01-15 10:00:00.500  1000  1001 D WindowManager: relayout',
    ].join('\n');

    const result = parseLogcat(content);
    expect(result.tagStats).toBeDefined();
    expect(result.tagStats!.length).toBe(3);
    // vendor_sensor has 2 errors, should be first
    expect(result.tagStats![0].tag).toBe('vendor_sensor');
    expect(result.tagStats![0].count).toBe(2);
    expect(result.tagStats![0].classification).toBe('vendor');
  });
});

describe('classifyTag', () => {
  it('should classify framework tags', () => {
    expect(classifyTag('ActivityManager')).toBe('framework');
    expect(classifyTag('WindowManager')).toBe('framework');
    expect(classifyTag('SystemServer')).toBe('framework');
    expect(classifyTag('Watchdog')).toBe('framework');
    expect(classifyTag('AndroidRuntime')).toBe('framework');
  });

  it('should classify vendor tags by prefix', () => {
    expect(classifyTag('vendor_sensor')).toBe('vendor');
    expect(classifyTag('hal_audio')).toBe('vendor');
    expect(classifyTag('hw_camera')).toBe('vendor');
    expect(classifyTag('thermal_monitor')).toBe('vendor');
    expect(classifyTag('camera_service')).toBe('vendor');
    expect(classifyTag('gnss_driver')).toBe('vendor');
  });

  it('should classify vendor tags by chipset keywords', () => {
    expect(classifyTag('QtiTelephony')).toBe('vendor');
    expect(classifyTag('qcom_audio')).toBe('vendor');
    expect(classifyTag('mtk_gps')).toBe('vendor');
    expect(classifyTag('MediaTekPower')).toBe('vendor');
  });

  it('should classify app tags as default', () => {
    expect(classifyTag('MyApp')).toBe('app');
    expect(classifyTag('com.example.app')).toBe('app');
    expect(classifyTag('FlutterEngine')).toBe('app');
  });
});

describe('computeTagStats', () => {
  it('should return empty array for no E/F entries', () => {
    const entries = [
      { timestamp: '', pid: 1, tid: 1, level: 'I' as const, tag: 'Tag', message: '', raw: '', lineNumber: 1 },
    ];
    expect(computeTagStats(entries)).toHaveLength(0);
  });

  it('should limit to top 20 tags', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      timestamp: '', pid: 1, tid: 1, level: 'E' as const,
      tag: `Tag${i}`, message: '', raw: '', lineNumber: i,
    }));
    expect(computeTagStats(entries).length).toBeLessThanOrEqual(20);
  });
});
