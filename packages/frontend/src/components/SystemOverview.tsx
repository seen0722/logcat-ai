import { useState } from 'react';
import { InsightCard } from '../lib/types';
import { BugreportMetadata, SystemHealthScore, MemInfoSummary, CpuInfoSummary, BootStatusSummary, HALStatusSummary, BufferTimeRange } from '../lib/types';
import { IconChevronDown } from './Icons';
import { scoreColor, scoreStrokeColor, scoreLabel } from '../lib/color-utils';

interface Props {
  metadata: BugreportMetadata;
  healthScore: SystemHealthScore;
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  bootStatus?: BootStatusSummary;
  halStatus?: HALStatusSummary;
  insights?: InsightCard[];
  bufferTimeRanges?: BufferTimeRange[];
}

/** Build a brief deduction reason for a given health dimension */
function deductionHint(dimension: string, score: number, insights?: InsightCard[]): string {
  if (score >= 80 || !insights) return '';
  const counts: Record<string, number> = {};
  for (const i of insights) {
    if (dimension === 'stability' && (i.category === 'crash' || i.category === 'stability')) {
      counts[i.source] = (counts[i.source] || 0) + 1;
    } else if (dimension === 'memory' && i.category === 'memory') {
      counts[i.source] = (counts[i.source] || 0) + 1;
    } else if (dimension === 'responsiveness' && (i.category === 'anr' || i.category === 'performance')) {
      counts[i.category] = (counts[i.category] || 0) + 1;
    } else if (dimension === 'kernel' && i.category === 'kernel') {
      counts[i.source] = (counts[i.source] || 0) + 1;
    }
  }
  const parts: string[] = [];
  for (const [key, count] of Object.entries(counts)) {
    parts.push(`${count} ${key}`);
  }
  return parts.slice(0, 2).join(', ');
}

function OverallScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const isLow = score < 70;

  return (
    <div className={`relative ${isLow ? 'animate-pulse-subtle' : ''}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--color-ring-track)" strokeWidth={5}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={scoreStrokeColor(score)}
          strokeWidth={isLow ? 6 : 5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${scoreStrokeColor(score)}40)` }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-bold leading-none ${scoreColor(score)}`}>{score}</span>
      </span>
    </div>
  );
}

function DimensionCard({ score, label, hint, isWorst }: { score: number; label: string; hint?: string; isWorst?: boolean }) {
  const isCritical = score < 50;
  const isLow = score < 70;

  return (
    <div className={`rounded-xl p-3 transition-all border ${
      isWorst && isCritical
        ? 'bg-red-500/8 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.1)]'
        : isWorst && isLow
          ? 'bg-amber-500/8 border-amber-500/30'
          : 'bg-surface border-border/40'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium ${isLow ? scoreColor(score) : 'text-gray-400'}`}>{label}</span>
        <span className={`text-lg font-bold leading-none ${scoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${score}%`,
            background: scoreStrokeColor(score),
            boxShadow: isLow ? `0 0 8px ${scoreStrokeColor(score)}60` : 'none',
          }}
        />
      </div>
      {hint && <span className={`text-[10px] leading-tight block mt-1.5 ${isCritical ? 'text-gray-400' : 'text-gray-600'}`}>{hint}</span>}
    </div>
  );
}

function formatKbToGb(kb: number): string {
  return (kb / 1048576).toFixed(1);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemOverview({ metadata, healthScore, memInfo, cpuInfo, bootStatus, halStatus, insights, bufferTimeRanges }: Props) {
  const { breakdown } = healthScore;
  const [showHwSwDetails, setShowHwSwDetails] = useState(false);

  const hwSwDetails: Array<{ label: string; value: string }> = [];
  if (metadata.platform && metadata.platform !== 'unknown') hwSwDetails.push({ label: 'Platform', value: metadata.platform });
  if (metadata.hardware && metadata.hardware !== 'unknown') hwSwDetails.push({ label: 'Hardware', value: metadata.hardware });
  if (metadata.cpuAbi && metadata.cpuAbi !== 'unknown') hwSwDetails.push({ label: 'CPU', value: metadata.cpuAbi });
  if (metadata.kernelVersion && metadata.kernelVersion !== 'unknown') hwSwDetails.push({ label: 'Kernel', value: metadata.kernelVersion });
  if (metadata.basebandVersion && metadata.basebandVersion !== 'unknown') hwSwDetails.push({ label: 'Baseband', value: metadata.basebandVersion });
  if (metadata.securityPatchLevel && metadata.securityPatchLevel !== 'unknown') hwSwDetails.push({ label: 'Security Patch', value: metadata.securityPatchLevel });
  if (metadata.serialNumber && metadata.serialNumber !== 'unknown') hwSwDetails.push({ label: 'Serial', value: metadata.serialNumber });
  if (metadata.buildDate && metadata.buildDate !== 'unknown') hwSwDetails.push({ label: 'Build Date', value: metadata.buildDate });
  if (metadata.bootloaderVersion && metadata.bootloaderVersion !== 'unknown') hwSwDetails.push({ label: 'Boot Image', value: metadata.bootloaderVersion });

  return (
    <div className="space-y-5">
      {/* ── Hero: Device Identity + Health Score ── */}
      <div className="card p-0 overflow-hidden">
        {/* Top gradient bar */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${scoreStrokeColor(healthScore.overall)}, ${scoreStrokeColor(healthScore.overall)}80, transparent)` }} />

        <div className="p-5 pb-4">
          {/* Device heading row — device left, score right */}
          <div className="flex items-start gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="font-display text-xl text-gray-100 tracking-tight">{metadata.deviceModel || 'Unknown Device'}</h2>
                {metadata.manufacturer && (
                  <span className="text-sm text-gray-500 font-light">{metadata.manufacturer}</span>
                )}
              </div>

              {/* Inline tags */}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-accent/10 text-accent border border-accent/20 rounded-lg">
                  Android {metadata.androidVersion}
                </span>
                {metadata.buildType && metadata.buildType !== 'unknown' && (
                  <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg ${
                    metadata.buildType === 'user' && !metadata.isDebuggable
                      ? 'bg-surface-hover text-gray-400 border border-border'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {metadata.buildType}
                  </span>
                )}
                {metadata.isDebuggable && !metadata.isAdbSecure && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
                    adb root
                  </span>
                )}
                {metadata.isDebuggable && metadata.isAdbSecure && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
                    debuggable
                  </span>
                )}
                {bootStatus?.bootCompleted != null && (
                  <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg ${
                    bootStatus.bootCompleted
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    Boot {bootStatus.bootCompleted ? 'OK' : 'Incomplete'}
                  </span>
                )}
                {bootStatus?.uptimeSeconds != null && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs text-gray-400 bg-surface-hover border border-border rounded-lg">
                    Uptime {formatUptime(bootStatus.uptimeSeconds)}
                  </span>
                )}
                {bootStatus?.bootReason && !/reboot|normal/i.test(bootStatus.bootReason) && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
                    {bootStatus.bootReason}
                  </span>
                )}
                {bootStatus && bootStatus.systemServerRestarts > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
                    SS Restart ×{bootStatus.systemServerRestarts}
                  </span>
                )}
              </div>

              {/* Build fingerprint */}
              <p className="text-xs text-gray-600 mt-2.5 font-mono truncate" title={metadata.buildFingerprint}>
                {metadata.buildFingerprint}
              </p>

              {/* Details toggle button only — content renders below the header row */}
              {(hwSwDetails.length > 0 || (bufferTimeRanges && bufferTimeRanges.length > 0)) && (
                <button
                  onClick={() => setShowHwSwDetails(!showHwSwDetails)}
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors mt-2"
                >
                  <IconChevronDown className={`w-3 h-3 transition-transform duration-200 ${showHwSwDetails ? 'rotate-180' : ''}`} />
                  {showHwSwDetails ? 'Hide' : 'Show'} details
                </button>
              )}
            </div>

            {/* Score badge — right side */}
            <div className="flex items-center gap-3 shrink-0">
              <OverallScoreRing score={healthScore.overall} size={56} />
              <span className={`text-sm font-medium ${scoreColor(healthScore.overall)}`}>{scoreLabel(healthScore.overall)}</span>
            </div>
          </div>

          {/* Expanded details — full width, outside the header flex row */}
          {showHwSwDetails && (
            <div className="mt-3 pt-3 space-y-4 border-t border-border/30">
              {hwSwDetails.length > 0 && (
                <table className="w-full text-xs">
                  <tbody>
                    {(() => {
                      const rows: Array<typeof hwSwDetails> = [];
                      for (let i = 0; i < hwSwDetails.length; i += 4) {
                        rows.push(hwSwDetails.slice(i, i + 4));
                      }
                      return rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((d) => (
                            <td key={d.label} className="py-1 pr-4 align-top" style={{ width: '25%' }}>
                              <span className="text-[10px] text-gray-600 uppercase tracking-wider block">{d.label}</span>
                              <span className="text-gray-300 break-all leading-tight">{d.value}</span>
                            </td>
                          ))}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              )}
              {bufferTimeRanges && bufferTimeRanges.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider block mb-1.5">Log Buffers</span>
                  <table className="text-xs font-mono">
                    <tbody>
                      {bufferTimeRanges.map((r) => (
                        <tr key={r.buffer} className="text-gray-500">
                          <td className="pr-3 py-0.5 text-gray-400 font-medium">{r.buffer}</td>
                          <td className="pr-2 py-0.5">{r.firstTimestamp.slice(0, 14)}</td>
                          <td className="pr-2 py-0.5 text-gray-600">~</td>
                          <td className="pr-3 py-0.5">{r.lastTimestamp.slice(0, 14)}</td>
                          <td className="py-0.5 text-gray-600">{r.entryCount.toLocaleString()} entries</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Separator between details/header and dimension cards */}
          <div className="border-t border-border/30 mt-4 pt-4" />

          {/* Dimension score cards — worst dimension highlighted */}
          {(() => {
            const dims = [
              { key: 'stability', label: 'Stability', score: breakdown.stability },
              { key: 'memory', label: 'Memory', score: breakdown.memory },
              { key: 'responsiveness', label: 'Responsiveness', score: breakdown.responsiveness },
              { key: 'kernel', label: 'Kernel', score: breakdown.kernel },
            ];
            const worstKey = dims.reduce((a, b) => a.score < b.score ? a : b).key;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {dims.map(d => (
                  <DimensionCard
                    key={d.key}
                    score={d.score}
                    label={d.label}
                    hint={deductionHint(d.key, d.score, insights)}
                    isWorst={d.key === worstKey && d.score < 80}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── System Resources: Memory, CPU, HAL ── */}
      {(memInfo || cpuInfo || halStatus) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {memInfo && memInfo.totalRamKb > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base text-gray-200">Memory</h3>
                <span className="text-xs text-gray-500">{((memInfo.freeRamKb / memInfo.totalRamKb) * 100).toFixed(0)}% free</span>
              </div>
              {/* Usage bar */}
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${((memInfo.usedRamKb / memInfo.totalRamKb) * 100).toFixed(0)}%`,
                    background: memInfo.freeRamKb / memInfo.totalRamKb < 0.2 ? '#ef4444' : memInfo.freeRamKb / memInfo.totalRamKb < 0.4 ? '#f59e0b' : '#22c55e',
                  }}
                />
              </div>
              <p className="text-sm text-gray-400">
                <span className="text-gray-200 font-medium">{formatKbToGb(memInfo.usedRamKb)} GB</span>
                <span className="mx-1">/</span>
                {formatKbToGb(memInfo.totalRamKb)} GB
              </p>
              {memInfo.topProcesses.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-border/50">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Top Processes (PSS)</span>
                  {memInfo.topProcesses.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-400 truncate mr-2">{p.processName}</span>
                      <span className="text-gray-300 shrink-0 font-mono">{(p.totalPssKb / 1024).toFixed(0)} MB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {cpuInfo && cpuInfo.totalCpuPercent > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base text-gray-200">CPU</h3>
                <span className={`text-xs font-medium ${cpuInfo.totalCpuPercent > 80 ? 'text-red-400' : cpuInfo.totalCpuPercent > 50 ? 'text-amber-400' : 'text-gray-500'}`}>
                  {cpuInfo.totalCpuPercent}% total
                </span>
              </div>
              {/* Usage bar */}
              <div className="h-2 bg-surface rounded-full overflow-hidden flex">
                <div
                  className="h-full transition-all duration-700"
                  style={{ width: `${cpuInfo.userPercent}%`, background: '#4f8ff7' }}
                  title={`User ${cpuInfo.userPercent}%`}
                />
                <div
                  className="h-full transition-all duration-700"
                  style={{ width: `${cpuInfo.kernelPercent}%`, background: '#d4a06a' }}
                  title={`Kernel ${cpuInfo.kernelPercent}%`}
                />
                {cpuInfo.ioWaitPercent > 0 && (
                  <div
                    className="h-full transition-all duration-700"
                    style={{ width: `${cpuInfo.ioWaitPercent}%`, background: '#ef4444' }}
                    title={`IO Wait ${cpuInfo.ioWaitPercent}%`}
                  />
                )}
              </div>
              <div className="flex gap-3 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" />User {cpuInfo.userPercent}%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warm inline-block" />Kernel {cpuInfo.kernelPercent}%</span>
                {cpuInfo.ioWaitPercent > 0 && (
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />IO {cpuInfo.ioWaitPercent}%</span>
                )}
              </div>
              {cpuInfo.topProcesses.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-border/50">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Top Processes</span>
                  {cpuInfo.topProcesses.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-400 truncate mr-2">{p.processName}</span>
                      <span className="text-gray-300 shrink-0 font-mono">{p.cpuPercent}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {halStatus && halStatus.families.length > 0 && (() => {
            const aliveFamilies = halStatus.families.filter((f) => f.highestStatus === 'alive').length;
            const totalFamilies = halStatus.families.length;
            const oemIssues = halStatus.families.filter((f) => f.isVendor && f.isOem && f.highestStatus !== 'alive');
            const isTruncated = halStatus.truncated;
            const alivePercent = Math.round((aliveFamilies / totalFamilies) * 100);
            return (
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base text-gray-200">HAL Services</h3>
                  <span className={`text-xs font-medium ${alivePercent >= 90 ? 'text-green-400' : alivePercent >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {aliveFamilies}/{totalFamilies} alive
                  </span>
                </div>
                {isTruncated && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                    lshal truncated — BSP HAL status unreliable
                  </p>
                )}
                {/* Usage bar */}
                <div className="h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${alivePercent}%`,
                      background: alivePercent >= 90 ? '#22c55e' : alivePercent >= 70 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                {oemIssues.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-border/50">
                    <span className="text-[10px] text-red-400 uppercase tracking-wider">OEM Issues ({oemIssues.length})</span>
                    {oemIssues.map((f, i) => (
                      <div key={i} className="text-xs text-red-400/80 truncate" title={f.familyName}>
                        {f.shortName}@{f.highestVersion} — {f.highestStatus}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
