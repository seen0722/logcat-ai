import { describe, it, expect } from 'vitest';
import { parseTombstone, parseTombstones } from '../src/tombstone-parser.js';

const TOMBSTONE_SIGSEGV = `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: 'google/raven/raven:13/TP1A.221105.002/9080065:userdebug/dev-keys'
Revision: 'MP1.0'
ABI: 'arm64'
Timestamp: 2026-02-04 10:38:15.123456789+0800
pid: 17946, tid: 17949, name: RenderThread  >>> com.example.app <<<
uid: 10234
tagged_addr_ctrl: 0000000000000001 (PR_TAGGED_ADDR_ENABLE)
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x000000000000000c
    x0  0000000000000000  x1  0000000000000080  x2  0000000000000000  x3  0000000000000000
    x4  0000007b574c7000  x5  0000000000000001  x6  0000000000000000  x7  0000000000000000
    x8  0000007b574c8000  x9  0000000000000001  x10 0000000000000000  x11 0000000000000001
    x12 0000000000000000  x13 0000000000000000  x14 0000000000000000  x15 0000000000000000
    x16 0000007c2e4a1234  x17 0000007c2e3b5678  x18 0000007b50000000  x19 0000007b574c7000
    x20 0000007b57abc000  x21 0000000000000000  x22 0000007b574c9000  x23 0000000000000000
    x24 0000007b574c8000  x25 0000007b574cb000  x26 0000000000000000  x27 0000000000000000
    x28 0000000000000000  x29 0000007b574c6fb0
    lr  0000007c2e3b5680  sp  0000007b574c6f90  pc  0000007c2e4a1238  pst 0000000060001000
backtrace:
      #00 pc 0004793e  /vendor/lib64/hw/gralloc.raven.so (gralloc_alloc+158)
      #01 pc 0001a234  /system/lib64/libui.so (android::GraphicBufferAllocator::allocate+196)
      #02 pc 0002b568  /system/lib64/libgui.so (android::BufferQueueProducer::dequeueBuffer+520)
      #03 pc 00045abc  /system/lib64/libhwui.so (android::uirenderer::RenderThread::run+44) (BuildId: abc123def456)
`;

const TOMBSTONE_SIGABRT = `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: 'trimble/T70/T70:14/AQ3A.250408.001/20260101:userdebug/dev-keys'
ABI: 'arm64'
Timestamp: 2026-01-27 15:30:00+0800
pid: 5432, tid: 5432, name: main  >>> /system/bin/mediaserver <<<
uid: 1013
signal 6 (SIGABRT), code -1 (SI_QUEUE), fault addr 0x0000000000001538
Abort message: 'Failed to find buffer for slot 3'
backtrace:
      #00 pc 00089abc  /system/lib64/libc.so (abort+168)
      #01 pc 0003ef12  /system/lib64/libc.so (__fortify_fatal+124)
      #02 pc 00123456  /system/lib64/libmediaplayerservice.so (android::NuPlayerDriver::onLooper+256)
      #03 pc 00045678  /system/lib64/libstagefright.so (android::ALooper::loop+456)
`;

const TOMBSTONE_VENDOR_ODM = `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: 'vendor/device/device:13/TP1A.221105.002/9080065:userdebug/dev-keys'
ABI: 'arm'
pid: 999, tid: 1000, name: worker  >>> com.vendor.hal <<<
signal 7 (SIGBUS), code 2 (BUS_ADRERR), fault addr 0xdeadbeef
backtrace:
      #00 pc 0001234a  /odm/lib/hw/camera.device.so (process_frame+42)
      #01 pc 00056789  /odm/lib/libcamera_impl.so
`;

const TOMBSTONE_NO_BACKTRACE = `*** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
Build fingerprint: 'google/raven/raven:13/TP1A/9080065:userdebug/dev-keys'
ABI: 'arm64'
pid: 100, tid: 100, name: init  >>> /init <<<
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0
`;

describe('parseTombstone', () => {
  it('should parse SIGSEGV tombstone with full backtrace', () => {
    const result = parseTombstone(TOMBSTONE_SIGSEGV, 'tombstone_00');

    expect(result.fileName).toBe('tombstone_00');
    expect(result.pid).toBe(17946);
    expect(result.tid).toBe(17949);
    expect(result.processName).toBe('com.example.app');
    expect(result.threadName).toBe('RenderThread');
    expect(result.signal).toBe(11);
    expect(result.signalName).toBe('SIGSEGV');
    expect(result.signalCode).toBe('SEGV_MAPERR');
    expect(result.faultAddr).toBe('0x000000000000000c');
    expect(result.abi).toBe('arm64');
    expect(result.buildFingerprint).toContain('google/raven');
    expect(result.timestamp).toContain('2026-02-04');
  });

  it('should parse backtrace frames correctly', () => {
    const result = parseTombstone(TOMBSTONE_SIGSEGV, 'tombstone_00');

    expect(result.backtrace).toHaveLength(4);

    // Frame #00
    expect(result.backtrace[0].frameNumber).toBe(0);
    expect(result.backtrace[0].pc).toBe('0004793e');
    expect(result.backtrace[0].binary).toBe('/vendor/lib64/hw/gralloc.raven.so');
    expect(result.backtrace[0].function).toBe('gralloc_alloc');
    expect(result.backtrace[0].offset).toBe(158);

    // Frame #03 with BuildId
    expect(result.backtrace[3].frameNumber).toBe(3);
    expect(result.backtrace[3].binary).toBe('/system/lib64/libhwui.so');
    expect(result.backtrace[3].buildId).toBe('abc123def456');
  });

  it('should detect vendor crash for /vendor/ path', () => {
    const result = parseTombstone(TOMBSTONE_SIGSEGV, 'tombstone_00');
    expect(result.isVendorCrash).toBe(true);
    expect(result.crashedInBinary).toBe('/vendor/lib64/hw/gralloc.raven.so');
  });

  it('should detect vendor crash for /odm/ path', () => {
    const result = parseTombstone(TOMBSTONE_VENDOR_ODM, 'tombstone_01');
    expect(result.isVendorCrash).toBe(true);
    expect(result.crashedInBinary).toBe('/odm/lib/hw/camera.device.so');
    expect(result.signalName).toBe('SIGBUS');
    expect(result.abi).toBe('arm');
  });

  it('should parse SIGABRT with abort message', () => {
    const result = parseTombstone(TOMBSTONE_SIGABRT, 'tombstone_02');

    expect(result.signal).toBe(6);
    expect(result.signalName).toBe('SIGABRT');
    expect(result.signalCode).toBe('SI_QUEUE');
    expect(result.abortMessage).toBe('Failed to find buffer for slot 3');
    expect(result.processName).toBe('/system/bin/mediaserver');
    expect(result.isVendorCrash).toBe(false);
    expect(result.summary).toContain('SIGABRT');
    expect(result.summary).toContain('Failed to find buffer');
  });

  it('should generate meaningful summary for SIGSEGV', () => {
    const result = parseTombstone(TOMBSTONE_SIGSEGV, 'tombstone_00');
    expect(result.summary).toContain('SIGSEGV');
    expect(result.summary).toContain('com.example.app');
    expect(result.summary).toContain('SEGV_MAPERR');
  });

  it('should handle tombstone without backtrace', () => {
    const result = parseTombstone(TOMBSTONE_NO_BACKTRACE, 'tombstone_03');
    expect(result.pid).toBe(100);
    expect(result.signal).toBe(11);
    expect(result.backtrace).toHaveLength(0);
    expect(result.crashedInBinary).toBeUndefined();
    expect(result.isVendorCrash).toBe(false);
  });

  it('should parse registers', () => {
    const result = parseTombstone(TOMBSTONE_SIGSEGV, 'tombstone_00');
    expect(result.registers).toBeDefined();
    expect(result.registers!['x0']).toBe('0000000000000000');
    expect(result.registers!['x1']).toBe('0000000000000080');
    expect(result.registers!['lr']).toBe('0000007c2e3b5680');
    expect(result.registers!['pc']).toBe('0000007c2e4a1238');
  });

  it('should handle empty content gracefully', () => {
    const result = parseTombstone('', 'tombstone_empty');
    expect(result.pid).toBe(0);
    expect(result.processName).toBe('unknown');
    expect(result.signal).toBe(0);
    expect(result.signalName).toBe('UNKNOWN');
    expect(result.backtrace).toHaveLength(0);
  });

  it('should handle malformed content gracefully', () => {
    const result = parseTombstone('random garbage\nnot a tombstone\n', 'tombstone_bad');
    expect(result.pid).toBe(0);
    expect(result.signal).toBe(0);
    expect(result.backtrace).toHaveLength(0);
  });
});

describe('parseTombstones', () => {
  it('should parse multiple tombstone files', () => {
    const contents = new Map<string, string>([
      ['FS/data/tombstones/tombstone_00', TOMBSTONE_SIGSEGV],
      ['FS/data/tombstones/tombstone_01', TOMBSTONE_SIGABRT],
    ]);

    const result = parseTombstones(contents);
    expect(result.totalFiles).toBe(2);
    expect(result.analyses).toHaveLength(2);
    expect(result.analyses[0].signalName).toBe('SIGSEGV');
    expect(result.analyses[1].signalName).toBe('SIGABRT');
  });

  it('should skip .pb (protobuf) files', () => {
    const contents = new Map<string, string>([
      ['FS/data/tombstones/tombstone_00', TOMBSTONE_SIGSEGV],
      ['FS/data/tombstones/tombstone_00.pb', 'binary protobuf content'],
    ]);

    const result = parseTombstones(contents);
    expect(result.totalFiles).toBe(2);
    expect(result.analyses).toHaveLength(1);
    expect(result.analyses[0].signalName).toBe('SIGSEGV');
  });

  it('should skip empty content files', () => {
    const contents = new Map<string, string>([
      ['FS/data/tombstones/tombstone_00', ''],
      ['FS/data/tombstones/tombstone_01', '   \n  '],
      ['FS/data/tombstones/tombstone_02', TOMBSTONE_SIGABRT],
    ]);

    const result = parseTombstones(contents);
    expect(result.totalFiles).toBe(3);
    expect(result.analyses).toHaveLength(1);
  });

  it('should return empty results for empty map', () => {
    const result = parseTombstones(new Map());
    expect(result.totalFiles).toBe(0);
    expect(result.analyses).toHaveLength(0);
  });

  it('should handle mix of valid and invalid files', () => {
    const contents = new Map<string, string>([
      ['FS/data/tombstones/tombstone_00', TOMBSTONE_SIGSEGV],
      ['FS/data/tombstones/tombstone_01.pb', 'proto data'],
      ['FS/data/tombstones/tombstone_02', 'not a tombstone format at all'],
      ['FS/data/tombstones/tombstone_03', TOMBSTONE_VENDOR_ODM],
    ]);

    const result = parseTombstones(contents);
    expect(result.totalFiles).toBe(4);
    // tombstone_00 (valid) + tombstone_03 (valid) = 2
    // tombstone_01.pb (skipped) + tombstone_02 (no signal/backtrace) = filtered
    expect(result.analyses).toHaveLength(2);
  });
});
