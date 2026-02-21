import { describe, it, expect } from 'vitest';
import { parseKernelLog, generateSELinuxAllowRule } from '../src/kernel-parser.js';

describe('parseKernelLog', () => {
  it('should parse basic dmesg entries', () => {
    const content = [
      '<6>[    0.000000] Booting Linux on physical CPU 0x0',
      '<6>[    1.234567] Freeing unused kernel memory: 1024K',
      '[    2.000000] init: starting service "zygote"',
    ].join('\n');

    const result = parseKernelLog(content);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].timestamp).toBeCloseTo(0.0);
    expect(result.entries[0].level).toBe('<6>');
    expect(result.entries[0].message).toBe('Booting Linux on physical CPU 0x0');
    expect(result.entries[2].level).toBe('');
    expect(result.totalLines).toBe(3);
  });

  it('should skip empty lines', () => {
    const content = '<6>[    1.000000] hello\n\n<6>[    2.000000] world\n';
    const result = parseKernelLog(content);
    expect(result.entries).toHaveLength(2);
  });

  // Kernel Panic
  it('should detect kernel_panic', () => {
    const content = '<0>[  100.123456] Kernel panic - not syncing: Fatal exception in interrupt';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('kernel_panic');
    expect(result.events[0].severity).toBe('critical');
    expect(result.events[0].summary).toContain('Kernel panic');
  });

  // OOM Kill
  it('should detect oom_kill', () => {
    const content = '<3>[  200.000000] Out of memory: Killed process 1234 (com.example.app) total-vm:512000kB';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('oom_kill');
    expect(result.events[0].severity).toBe('critical');
    expect(result.events[0].summary).toContain('com.example.app');
    expect(result.events[0].details.pid).toBe(1234);
    expect(result.events[0].details.processName).toBe('com.example.app');
  });

  it('should detect oom_kill with alternate format', () => {
    const content = '<3>[  200.000000] Out of memory: Kill process 5678 (chrome) score 900';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('oom_kill');
  });

  // Low Memory Killer
  it('should detect lowmemory_killer', () => {
    const content = "<4>[  300.000000] lowmemorykiller: kill 'com.example.app' (1234), adj 900";
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('lowmemory_killer');
    expect(result.events[0].severity).toBe('warning');
    expect(result.events[0].summary).toContain('com.example.app');
  });

  it('should detect lmkd events', () => {
    const content = '<4>[  300.000000] lmkd: killing process 1234 for memory reclaim';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('lowmemory_killer');
  });

  // kswapd Active
  it('should detect kswapd_active', () => {
    const content = '<4>[  400.000000] kswapd0 running with high memory pressure, active reclaim';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('kswapd_active');
    expect(result.events[0].severity).toBe('warning');
  });

  // Driver Error
  it('should detect driver_error', () => {
    const content = '<3>[  500.000000] msm_sensor: error initializing driver for camera module';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('driver_error');
    expect(result.events[0].severity).toBe('warning');
  });

  it('should detect firmware error', () => {
    const content = '<3>[  500.000000] error loading firmware for wifi hardware';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('driver_error');
  });

  // GPU Error
  it('should detect gpu_error', () => {
    const content = '<3>[  600.000000] adreno gpu fault detected at address 0x12345678';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('gpu_error');
    expect(result.events[0].severity).toBe('warning');
  });

  it('should detect gpu hang', () => {
    const content = '<3>[  600.000000] kgsl: gpu hang detected, attempting recovery';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('gpu_error');
  });

  // Thermal Shutdown
  it('should detect thermal_shutdown', () => {
    const content = '<0>[  700.000000] thermal emergency shutdown triggered at 95C';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('thermal_shutdown');
    expect(result.events[0].severity).toBe('critical');
    expect(result.events[0].details.temperature).toBe(95);
  });

  it('should detect thermal critical', () => {
    const content = '<0>[  700.000000] thermal zone0: critical temperature reached';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('thermal_shutdown');
  });

  // Watchdog Reset
  it('should detect watchdog_reset', () => {
    const content = '<0>[  800.000000] watchdog: bark detected, triggering reset';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('watchdog_reset');
    expect(result.events[0].severity).toBe('critical');
  });

  it('should detect watchdog expired', () => {
    const content = '<0>[  800.000000] watchdog timer expired, system reset';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('watchdog_reset');
  });

  // SELinux Denial
  it('should detect selinux_denial', () => {
    const content =
      '<5>[  900.000000] avc: denied { read } for pid=1234 comm="app" name="config" scontext=u:r:untrusted_app:s0 tcontext=u:object_r:system_file:s0 tclass=file';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('selinux_denial');
    expect(result.events[0].severity).toBe('info');
    expect(result.events[0].details.scontext).toBe('u:r:untrusted_app:s0');
    expect(result.events[0].details.tcontext).toBe('u:object_r:system_file:s0');
    expect(result.events[0].details.tclass).toBe('file');
  });

  // Multiple events
  it('should detect multiple events in one log', () => {
    const content = [
      '<6>[    0.000000] Booting Linux',
      '<4>[  100.000000] lowmemorykiller: kill \'app1\' (100), adj 900',
      '<3>[  200.000000] Out of memory: Killed process 200 (app2) total-vm:1024kB',
      '<0>[  300.000000] Kernel panic - not syncing: Fatal exception',
    ].join('\n');

    const result = parseKernelLog(content);
    expect(result.entries).toHaveLength(4);
    expect(result.events).toHaveLength(3);
    expect(result.events[0].type).toBe('lowmemory_killer');
    expect(result.events[1].type).toBe('oom_kill');
    expect(result.events[2].type).toBe('kernel_panic');
  });

  // Thermal throttling (#32)
  it('should detect thermal_throttling', () => {
    const content = '<4>[  500.000000] thermal thermal_zone0: throttling activated';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('thermal_throttling');
    expect(result.events[0].severity).toBe('warning');
    expect(result.events[0].summary).toContain('Thermal throttling');
  });

  // Storage I/O error (#32)
  it('should detect storage_io_error for mmc', () => {
    const content = '<3>[  600.000000] mmc0: error -110 whilst initialising SD card';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('storage_io_error');
    expect(result.events[0].severity).toBe('warning');
  });

  it('should detect storage_io_error for EXT4-fs', () => {
    const content = '<3>[  601.000000] EXT4-fs error (device sda1): ext4_lookup:1234: inode #5678';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('storage_io_error');
  });

  // Suspend/resume error (#32)
  it('should detect suspend_resume_error for suspend abort', () => {
    const content = '<4>[  700.000000] PM: suspend entry (deep): suspend abort';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('suspend_resume_error');
    expect(result.events[0].summary).toContain('Suspend');
  });

  it('should detect suspend_resume_error for resume fail', () => {
    const content = '<4>[  701.000000] PM: resume from suspend failed';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('suspend_resume_error');
  });

  // SELinux permission extraction (#40)
  it('should extract permission field from SELinux denial', () => {
    const content =
      '<5>[  900.000000] avc: denied { read write } for pid=1234 comm="app" name="config" scontext=u:r:untrusted_app:s0 tcontext=u:object_r:system_file:s0 tclass=file';
    const result = parseKernelLog(content);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].details.permission).toBe('read write');
  });

  // No events
  it('should return empty events for clean log', () => {
    const content = [
      '<6>[    0.000000] Booting Linux on physical CPU 0x0',
      '<6>[    1.000000] CPU: All CPU(s) started at EL1',
      '<6>[    2.000000] Memory: 3800000K/4194304K available',
    ].join('\n');

    const result = parseKernelLog(content);
    expect(result.entries).toHaveLength(3);
    expect(result.events).toHaveLength(0);
  });
});

describe('generateSELinuxAllowRule', () => {
  it('should generate correct allow rule from denial details', () => {
    const details = {
      scontext: 'u:r:untrusted_app:s0',
      tcontext: 'u:object_r:system_file:s0',
      tclass: 'file',
      permission: 'read write',
    };
    const rule = generateSELinuxAllowRule(details);
    expect(rule).toBe('allow untrusted_app system_file:file { read write };');
  });

  it('should handle single permission', () => {
    const details = {
      scontext: 'u:r:hal_audio:s0',
      tcontext: 'u:object_r:proc:s0',
      tclass: 'file',
      permission: 'read',
    };
    const rule = generateSELinuxAllowRule(details);
    expect(rule).toBe('allow hal_audio proc:file { read };');
  });

  it('should return null when scontext is missing', () => {
    const details = {
      tcontext: 'u:object_r:system_file:s0',
      tclass: 'file',
      permission: 'read',
    };
    expect(generateSELinuxAllowRule(details)).toBeNull();
  });

  it('should return null when permission is missing', () => {
    const details = {
      scontext: 'u:r:untrusted_app:s0',
      tcontext: 'u:object_r:system_file:s0',
      tclass: 'file',
    };
    expect(generateSELinuxAllowRule(details)).toBeNull();
  });

  it('should return null for malformed scontext', () => {
    const details = {
      scontext: 'invalid',
      tcontext: 'u:object_r:system_file:s0',
      tclass: 'file',
      permission: 'read',
    };
    expect(generateSELinuxAllowRule(details)).toBeNull();
  });

  it('should work end-to-end with parseKernelLog', () => {
    const content =
      '<5>[  900.000000] avc: denied { read write } for pid=1234 comm="app" name="config" scontext=u:r:untrusted_app:s0 tcontext=u:object_r:system_file:s0 tclass=file';
    const result = parseKernelLog(content);
    const rule = generateSELinuxAllowRule(result.events[0].details);
    expect(rule).toBe('allow untrusted_app system_file:file { read write };');
  });
});
