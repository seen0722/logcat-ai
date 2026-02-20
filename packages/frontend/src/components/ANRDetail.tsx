import { useState } from 'react';
import { ANRTraceAnalysis, ThreadBlockAnalysis } from '../lib/types';
import StackTrace from './StackTrace';

interface Props {
  analyses: ANRTraceAnalysis[];
}

const REASON_LABELS: Record<string, string> = {
  lock_contention: 'Lock Contention',
  deadlock: 'Deadlock',
  io_on_main_thread: 'I/O on Main Thread',
  network_on_main_thread: 'Network on Main Thread',
  slow_binder_call: 'Slow Binder Call',
  heavy_computation: 'Heavy Computation',
  expensive_rendering: 'Expensive Rendering',
  broadcast_blocking: 'Broadcast Blocking',
  slow_app_startup: 'Slow App Startup',
  idle_main_thread: 'Idle Main Thread',
  no_stack_frames: 'No Stack Frames',
  system_overload_candidate: 'System Overload',
  binder_pool_exhaustion: 'Binder Pool Exhaustion',
  content_provider_slow: 'Slow Content Provider',
  unknown: 'Unknown',
};

export default function ANRDetail({ analyses }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const withAnalysis = analyses.filter((a) => a.mainThread || a.blockedThread);
  if (withAnalysis.length === 0) return null;

  const analysis = withAnalysis[selectedIdx] ?? withAnalysis[0];
  // Prefer blockedThread (from Subject) over mainThread
  const primary: ThreadBlockAnalysis = (analysis.blockedThread ?? analysis.mainThread)!;
  const threadLabel = analysis.blockedThreadName && analysis.blockedThreadName !== 'main'
    ? `"${analysis.blockedThreadName}"`
    : 'Main Thread';

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ANR Detail</h2>
        {withAnalysis.length > 1 && (
          <select
            className="bg-surface border border-border rounded px-2 py-1 text-sm"
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
          >
            {withAnalysis.map((a, i) => (
              <option key={i} value={i}>{a.processName} (PID {a.pid})</option>
            ))}
          </select>
        )}
      </div>

      {/* Subject */}
      {analysis.subject && (
        <div className="text-sm text-gray-400 bg-surface rounded px-3 py-2">
          <span className="text-gray-500">Subject: </span>{analysis.subject}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Process</span>
          <p className="font-medium">{analysis.processName}</p>
        </div>
        <div>
          <span className="text-gray-500">Blocked Thread</span>
          <p className="font-medium text-amber-400">{threadLabel}</p>
        </div>
        <div>
          <span className="text-gray-500">Block Reason</span>
          <p className="font-medium text-red-400">
            {REASON_LABELS[primary.blockReason] ?? primary.blockReason}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Confidence</span>
          <p className={`font-medium ${
            primary.confidence === 'high' ? 'text-green-400' :
            primary.confidence === 'medium' ? 'text-amber-400' : 'text-gray-400'
          }`}>{primary.confidence}</p>
        </div>
      </div>

      {/* Binder/HAL Target (direct) */}
      {primary.binderTarget && primary.binderTarget.interfaceName !== 'Unknown' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <h3 className="text-sm font-medium text-amber-400 mb-2">HAL / Binder Target</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Interface</span>
              <p className="font-mono font-medium text-amber-300">
                {primary.binderTarget.interfaceName}
                {primary.binderTarget.method ? `.${primary.binderTarget.method}()` : ''}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Package</span>
              <p className="font-mono text-gray-300">{primary.binderTarget.packageName}</p>
            </div>
            {primary.binderTarget.callerClass && (
              <div className="md:col-span-2">
                <span className="text-gray-500">Called from</span>
                <p className="font-mono text-gray-300">
                  {primary.binderTarget.callerClass}.{primary.binderTarget.callerMethod}()
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suspected HAL targets (from other threads) */}
      {primary.suspectedBinderTargets && primary.suspectedBinderTargets.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
          <h3 className="text-sm font-medium text-orange-400 mb-2">
            Suspected Blocked HAL Calls (other threads)
          </h3>
          <div className="space-y-2">
            {primary.suspectedBinderTargets.map((t, i) => (
              <div key={i} className="text-sm grid grid-cols-1 md:grid-cols-3 gap-1">
                <div>
                  <span className="text-gray-500">Interface</span>
                  <p className="font-mono font-medium text-orange-300">
                    {t.interfaceName}{t.method ? `.${t.method}()` : ''}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Package</span>
                  <p className="font-mono text-gray-300">{t.packageName}</p>
                </div>
                <div>
                  <span className="text-gray-500">Thread</span>
                  <p className="font-mono text-gray-300">"{t.threadName}" ({t.threadState})</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocking Chain */}
      {primary.blockingChain.length > 0 && (
        <div>
          <h3 className="text-sm text-gray-500 mb-2">Blocking Chain</h3>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="px-2 py-1 bg-red-500/15 text-red-400 rounded">
              {threadLabel} ({primary.thread.state})
            </span>
            {primary.blockingChain.map((t, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-gray-500">→</span>
                <span className="px-2 py-1 bg-amber-500/15 text-amber-400 rounded">
                  {t.name} (tid={t.tid}, {t.state})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Deadlock */}
      {analysis.deadlocks.detected && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <h3 className="text-sm font-medium text-red-400 mb-1">
            Deadlock Detected ({analysis.deadlocks.cycles.length} cycle{analysis.deadlocks.cycles.length > 1 ? 's' : ''})
          </h3>
          {analysis.deadlocks.cycles.map((cycle, i) => (
            <div key={i} className="text-sm text-gray-300">
              {cycle.threads.map((t) => `"${t.name}" (tid=${t.tid})`).join(' ↔ ')}
            </div>
          ))}
        </div>
      )}

      {/* Blocked Thread Stack */}
      {primary.thread.stackFrames.length > 0 && (
        <div>
          <h3 className="text-sm text-gray-500 mb-2">{threadLabel} Stack</h3>
          <StackTrace
            frames={primary.thread.stackFrames.map((f) => f.raw)}
            maxHeight="20rem"
          />
        </div>
      )}

      {/* Lock Graph Summary */}
      {analysis.lockGraph.edges.length > 0 && (
        <div>
          <h3 className="text-sm text-gray-500 mb-2">
            Lock Graph ({analysis.lockGraph.nodes.length} threads, {analysis.lockGraph.edges.length} edges)
          </h3>
          <div className="space-y-1 text-xs text-gray-400">
            {analysis.lockGraph.edges.map((edge, i) => {
              const from = analysis.lockGraph.nodes.find((n) => n.tid === edge.from);
              const to = analysis.lockGraph.nodes.find((n) => n.tid === edge.to);
              return (
                <div key={i}>
                  "{from?.threadName ?? edge.from}" waits for lock {edge.lockAddress}
                  ({edge.lockClassName}) held by "{to?.threadName ?? edge.to}"
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
