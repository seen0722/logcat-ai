import { describe, it, expect } from 'vitest';
import { parseANRTrace } from '../src/anr-parser.js';

// Helper to build an ANR trace string
function buildTrace(opts: {
  pid?: number;
  process?: string;
  threads: Array<{
    name: string;
    daemon?: boolean;
    prio?: number;
    tid: number;
    state: string;
    sysTid?: number;
    stack?: string[];
    waitingLock?: { addr: string; cls: string; heldByTid: number };
    heldLocks?: Array<{ addr: string; cls: string }>;
  }>;
}): string {
  const lines: string[] = [];
  lines.push(`----- pid ${opts.pid ?? 1234} at 2024-01-15 10:00:00.000 -----`);
  lines.push(`Cmd line: ${opts.process ?? 'com.example.app'}`);
  lines.push('');

  for (const t of opts.threads) {
    const daemon = t.daemon ? 'daemon ' : '';
    lines.push(`"${t.name}" ${daemon}prio=${t.prio ?? 5} tid=${t.tid} ${t.state}`);
    lines.push(`  | group="main" sCount=1 ucsCount=0 flags=1 obj=0x12345 self=0x67890`);
    if (t.sysTid) {
      lines.push(`  | sysTid=${t.sysTid} nice=0 cgrp=default sched=0/0`);
    }

    if (t.waitingLock) {
      lines.push(`  - waiting to lock <${t.waitingLock.addr}> (a ${t.waitingLock.cls}) held by thread ${t.waitingLock.heldByTid}`);
    }
    for (const hl of t.heldLocks ?? []) {
      lines.push(`  - locked <${hl.addr}> (a ${hl.cls})`);
    }
    for (const frame of t.stack ?? []) {
      lines.push(`  at ${frame}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

describe('parseANRTrace', () => {
  it('should parse process info', () => {
    const trace = buildTrace({
      pid: 5678,
      process: 'com.test.myapp',
      threads: [
        { name: 'main', tid: 1, state: 'Runnable', stack: [] },
      ],
    });
    const result = parseANRTrace(trace);
    expect(result.pid).toBe(5678);
    expect(result.processName).toBe('com.test.myapp');
    expect(result.timestamp).toBe('2024-01-15 10:00:00.000');
  });

  it('should parse thread info', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Blocked',
          sysTid: 5678,
          stack: [
            'com.example.app.MainActivity.doWork(MainActivity.java:42)',
            'android.app.Activity.performResume(Activity.java:100)',
          ],
        },
        {
          name: 'Worker-1',
          daemon: true,
          tid: 12,
          state: 'Runnable',
          stack: ['com.example.app.Worker.run(Worker.java:10)'],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.threads).toHaveLength(2);

    const main = result.threads.find((t) => t.name === 'main')!;
    expect(main.tid).toBe(1);
    expect(main.state).toBe('Blocked');
    expect(main.sysTid).toBe(5678);
    expect(main.daemon).toBe(false);
    expect(main.stackFrames).toHaveLength(2);
    expect(main.stackFrames[0].className).toBe('com.example.app.MainActivity');
    expect(main.stackFrames[0].methodName).toBe('doWork');
    expect(main.stackFrames[0].lineNumber).toBe(42);

    const worker = result.threads.find((t) => t.name === 'Worker-1')!;
    expect(worker.daemon).toBe(true);
    expect(worker.state).toBe('Runnable');
  });

  // Case 1: Lock Contention
  it('should detect lock_contention', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Blocked',
          waitingLock: { addr: '0xabc', cls: 'java.lang.Object', heldByTid: 2 },
          stack: ['com.example.app.Foo.bar(Foo.java:10)'],
        },
        {
          name: 'Worker',
          tid: 2,
          state: 'Runnable',
          heldLocks: [{ addr: '0xabc', cls: 'java.lang.Object' }],
          stack: ['com.example.app.Worker.run(Worker.java:20)'],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('lock_contention');
    expect(result.mainThread?.confidence).toBe('high');
    expect(result.mainThread?.blockingChain).toHaveLength(1);
    expect(result.mainThread?.blockingChain[0].name).toBe('Worker');
  });

  // Case 2: Deadlock
  it('should detect deadlock', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Blocked',
          waitingLock: { addr: '0xaaa', cls: 'LockA', heldByTid: 2 },
          heldLocks: [{ addr: '0xbbb', cls: 'LockB' }],
          stack: ['com.example.app.A.method(A.java:1)'],
        },
        {
          name: 'Worker',
          tid: 2,
          state: 'Blocked',
          waitingLock: { addr: '0xbbb', cls: 'LockB', heldByTid: 1 },
          heldLocks: [{ addr: '0xaaa', cls: 'LockA' }],
          stack: ['com.example.app.B.method(B.java:1)'],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.deadlocks.detected).toBe(true);
    expect(result.deadlocks.cycles).toHaveLength(1);
    expect(result.deadlocks.cycles[0].threads).toHaveLength(2);
    expect(result.mainThread?.blockReason).toBe('deadlock');
  });

  // Case 3: I/O on Main Thread
  it('should detect io_on_main_thread', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Waiting',
          stack: [
            'android.database.sqlite.SQLiteDatabase.rawQuery(SQLiteDatabase.java:100)',
            'com.example.app.DbHelper.query(DbHelper.java:50)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('io_on_main_thread');
  });

  // Case 4: Network on Main Thread
  it('should detect network_on_main_thread', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Native',
          stack: [
            'java.net.Socket.connect(Socket.java:100)',
            'okhttp3.internal.connection.RealConnection.connect(RealConnection.java:200)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('network_on_main_thread');
  });

  // Case 5: Slow Binder Call
  it('should detect slow_binder_call', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Native',
          stack: [
            'android.os.BinderProxy.transact(BinderProxy.java:100)',
            'android.app.IActivityManager$Stub$Proxy.getRunningAppProcesses(IActivityManager.java:200)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('slow_binder_call');
  });

  // Case 6: Heavy Computation
  it('should detect heavy_computation', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Runnable',
          stack: [
            'com.example.app.ImageProcessor.processPixels(ImageProcessor.java:100)',
            'com.example.app.MainActivity.onResume(MainActivity.java:50)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('heavy_computation');
  });

  // Case 7: Expensive Rendering
  it('should detect expensive_rendering', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Runnable',
          stack: [
            'android.view.View.measure(View.java:100)',
            'android.view.ViewGroup.dispatchDraw(ViewGroup.java:200)',
            'android.view.ViewRootImpl.performTraversals(ViewRootImpl.java:300)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('expensive_rendering');
  });

  // Case 8: Broadcast Blocking
  it('should detect broadcast_blocking', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Runnable',
          stack: [
            'com.example.app.MyReceiver.onReceive(MyReceiver.java:30)',
            'android.app.LoadedApk$ReceiverDispatcher.performReceive(LoadedApk.java:100)',
            'android.app.ActivityThread.handleReceiver(ActivityThread.java:200)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('broadcast_blocking');
  });

  // Case 9: Slow App Startup
  it('should detect slow_app_startup', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Runnable',
          stack: [
            'com.example.app.App.onCreate(App.java:20)',
            'android.app.Instrumentation.callApplicationOnCreate(Instrumentation.java:100)',
            'android.app.ActivityThread.handleBindApplication(ActivityThread.java:200)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('slow_app_startup');
  });

  // Case 10: Idle main thread (nativePollOnce — possible false ANR)
  it('should detect idle_main_thread', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Native',
          stack: [
            'android.os.MessageQueue.nativePollOnce(Native Method)',
            'android.os.MessageQueue.next(MessageQueue.java:335)',
            'android.os.Looper.loopOnce(Looper.java:162)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('idle_main_thread');
    expect(result.mainThread?.confidence).toBe('low');
  });

  // Case 11: No Stack Frames
  it('should detect no_stack_frames', () => {
    const trace = buildTrace({
      threads: [
        { name: 'main', tid: 1, state: 'Unknown', stack: [] },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('no_stack_frames');
  });

  // Case 12: System Overload Candidate
  it('should detect system_overload_candidate', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Runnable',
          stack: [
            'android.os.Handler.dispatchMessage(Handler.java:106)',
            'android.os.Looper.loopOnce(Looper.java:201)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('system_overload_candidate');
  });

  // Case 13: Binder Pool Exhaustion
  it('should detect binder_pool_exhaustion', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Waiting',
          stack: ['android.os.Looper.loopOnce(Looper.java:201)'],
        },
        {
          name: 'Binder:1234_1',
          daemon: true,
          tid: 10,
          state: 'Blocked',
          stack: ['com.android.server.am.ActivityManagerService.broadcastIntent(AMS.java:100)'],
        },
        {
          name: 'Binder:1234_2',
          daemon: true,
          tid: 11,
          state: 'Runnable',
          stack: ['com.android.server.pm.PackageManagerService.getPackageInfo(PMS.java:200)'],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.binderThreads.total).toBe(2);
    expect(result.binderThreads.exhausted).toBe(true);
    expect(result.mainThread?.blockReason).toBe('binder_pool_exhaustion');
  });

  // Case 14: Content Provider Slow
  it('should detect content_provider_slow', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Waiting',
          stack: [
            'android.content.ContentProvider$Transport.query(ContentProvider.java:100)',
            'com.example.app.MyProvider.query(MyProvider.java:50)',
          ],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread?.blockReason).toBe('content_provider_slow');
  });

  // Lock Graph
  it('should build lock graph correctly', () => {
    const trace = buildTrace({
      threads: [
        {
          name: 'main',
          tid: 1,
          state: 'Blocked',
          waitingLock: { addr: '0xabc', cls: 'java.lang.Object', heldByTid: 2 },
        },
        {
          name: 'Worker',
          tid: 2,
          state: 'Blocked',
          waitingLock: { addr: '0xdef', cls: 'java.util.HashMap', heldByTid: 3 },
          heldLocks: [{ addr: '0xabc', cls: 'java.lang.Object' }],
        },
        {
          name: 'IO-Thread',
          tid: 3,
          state: 'Runnable',
          heldLocks: [{ addr: '0xdef', cls: 'java.util.HashMap' }],
        },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.lockGraph.nodes).toHaveLength(3);
    expect(result.lockGraph.edges).toHaveLength(2);
    expect(result.mainThread?.blockingChain).toHaveLength(2);
    expect(result.mainThread?.blockingChain[0].name).toBe('Worker');
    expect(result.mainThread?.blockingChain[1].name).toBe('IO-Thread');
  });

  it('should handle trace with no main thread', () => {
    const trace = buildTrace({
      threads: [
        { name: 'Worker-1', tid: 10, state: 'Runnable', stack: [] },
      ],
    });

    const result = parseANRTrace(trace);
    expect(result.mainThread).toBeNull();
  });
});
