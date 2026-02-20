import { describe, it, expect } from 'vitest';
import { parseSections } from '../src/unpacker.js';

describe('parseSections', () => {
  it('should parse sections delimited by header lines', () => {
    const content = [
      '------ SYSTEM LOG (logcat -v threadtime) ------',
      '01-15 10:00:00.000  1000  1001 I Tag: message1',
      '01-15 10:00:01.000  1000  1001 W Tag: message2',
      '------ EVENT LOG (logcat -b events -v threadtime) ------',
      '01-15 10:00:02.000  1000  1001 I am_proc_start: [0,1234,1000,com.example.app]',
      '------ SYSTEM PROPERTIES (getprop) ------',
      '[ro.build.version.release]: [14]',
      '[ro.build.version.sdk]: [34]',
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(3);

    expect(sections[0].name).toBe('SYSTEM LOG');
    expect(sections[0].command).toBe('logcat -v threadtime');
    expect(sections[0].content).toContain('message1');
    expect(sections[0].content).toContain('message2');

    expect(sections[1].name).toBe('EVENT LOG');
    expect(sections[1].command).toBe('logcat -b events -v threadtime');
    expect(sections[1].content).toContain('am_proc_start');

    expect(sections[2].name).toBe('SYSTEM PROPERTIES');
    expect(sections[2].command).toBe('getprop');
    expect(sections[2].content).toContain('ro.build.version.release');
  });

  it('should handle empty content', () => {
    const sections = parseSections('');
    expect(sections).toHaveLength(0);
  });

  it('should handle content with no section headers', () => {
    const content = 'just some random text\nwith multiple lines';
    const sections = parseSections(content);
    expect(sections).toHaveLength(0);
  });

  it('should handle section with no content lines', () => {
    const content = [
      '------ EMPTY SECTION (cmd) ------',
      '------ NEXT SECTION (cmd2) ------',
      'some content',
    ].join('\n');

    const sections = parseSections(content);
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe('EMPTY SECTION');
    expect(sections[0].content.trim()).toBe('');
    expect(sections[1].name).toBe('NEXT SECTION');
    expect(sections[1].content).toContain('some content');
  });

  it('should track line numbers correctly', () => {
    const content = [
      'line0 ignored',
      '------ FIRST (cmd1) ------',     // line 1
      'content line 2',
      'content line 3',
      '------ SECOND (cmd2) ------',    // line 4
      'content line 5',
    ].join('\n');

    const sections = parseSections(content);
    expect(sections[0].startLine).toBe(1);
    expect(sections[0].endLine).toBe(3);
    expect(sections[1].startLine).toBe(4);
    expect(sections[1].endLine).toBe(5);
  });
});
