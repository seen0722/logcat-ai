import { describe, it, expect } from 'vitest';
import { detectLogFormat } from '../src/format-detector.js';

describe('detectLogFormat', () => {
  it('should detect standard logcat format', () => {
    const content = [
      '01-15 10:00:00.123  1000  1001 I ActivityManager: Start proc',
      '01-15 10:00:00.456  1000  1002 D WindowManager: relayoutWindow',
      '01-15 10:00:01.000  2000  2001 W System.err: NullPointerException',
      '01-15 10:00:01.500  2000  2001 E AndroidRuntime: FATAL EXCEPTION',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('logcat');
  });

  it('should detect bracket logcat format', () => {
    const content = [
      '[ 01-15 10:00:00.123 1000:1001 I/ActivityManager ]',
      '[ 01-15 10:00:00.456 1000:1002 D/WindowManager ]',
      '[ 01-15 10:00:01.000 2000:2001 W/System.err ]',
      '[ 01-15 10:00:01.500 2000:2001 E/AndroidRuntime ]',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('logcat');
  });

  it('should detect dmesg format with timestamps', () => {
    const content = [
      '[    0.000000] Booting Linux on physical CPU 0x0000000000 [0x51af8014]',
      '[    0.000001] Machine model: Qualcomm Technologies, Inc.',
      '[    1.234567] init: Service started',
      '[    3.772783] binder: 1702:1702 ioctl',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('dmesg');
  });

  it('should detect dmesg format with priority prefix', () => {
    const content = [
      '<6>[    0.000000] Booting Linux on physical CPU',
      '<6>[    0.000001] Machine model: Qualcomm',
      '<4>[    1.234567] init: Service warning',
      '<3>[    3.772783] binder: error occurred',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('dmesg');
  });

  it('should return unknown for unrecognizable content', () => {
    const content = [
      'This is just some random text',
      'No log format here',
      'Another line of nothing',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('unknown');
  });

  it('should return unknown when fewer than 3 matches', () => {
    const content = [
      '01-15 10:00:00.123  1000  1001 I ActivityManager: one match',
      'random text line',
      'another random line',
      'yet another random line',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('unknown');
  });

  it('should handle empty content', () => {
    expect(detectLogFormat('')).toBe('unknown');
  });

  it('should prefer logcat when logcat score > dmesg score', () => {
    const content = [
      '01-15 10:00:00.123  1000  1001 I ActivityManager: Start',
      '01-15 10:00:00.456  1000  1002 D WindowManager: relay',
      '01-15 10:00:01.000  2000  2001 W System.err: err',
      '01-15 10:00:01.500  2000  2001 E AndroidRuntime: fatal',
      '[    0.000000] Booting Linux',
    ].join('\n');

    expect(detectLogFormat(content)).toBe('logcat');
  });

  it('should only sample first 50 lines', () => {
    const randomLines = Array(47).fill('random text line');
    const logcatLines = [
      '01-15 10:00:00.123  1000  1001 I ActivityManager: Start',
      '01-15 10:00:00.456  1000  1002 D WindowManager: relay',
      '01-15 10:00:01.000  2000  2001 W System.err: err',
    ];
    const content = [...randomLines, ...logcatLines].join('\n');

    expect(detectLogFormat(content)).toBe('logcat');
  });
});
