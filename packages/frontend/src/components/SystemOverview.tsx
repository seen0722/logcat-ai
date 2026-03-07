import { useState } from 'react';
import { InsightCard } from '../lib/types';
import { BugreportMetadata, SystemHealthScore, MemInfoSummary, CpuInfoSummary, BootStatusSummary, HALStatusSummary } from '../lib/types';

interface Props {
  metadata: BugreportMetadata;
  healthScore: SystemHealthScore;
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  bootStatus?: BootStatusSummary;
  halStatus?: HALStatusSummary;
  insights?: InsightCard[];
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
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

function ScoreRing({ score, label, size = 64, hint, showMax }: { score: number; label: string; size?: number; hint?: string; showMax?: boolean }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const isLow = score < 70;

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${isLow ? 'animate-pulse-subtle' : ''}`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#2a2d3e" strokeWidth={4}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'}
            strokeWidth={isLow ? 5 : 4}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span className={`absolute inset-0 flex flex-col items-center justify-center ${scoreColor(score)}`}>
          <span className="text-lg font-bold leading-none">{score}</span>
          {showMax && <span className="text-[9px] text-gray-600 leading-none mt-0.5">/100</span>}
        </span>
      </div>
      <span className={`text-xs mt-1.5 ${isLow ? 'text-amber-400 font-medium' : 'text-gray-500'}`}>{label}</span>
      {hint && <span className="text-[10px] text-gray-600 mt-0.5 max-w-[120px] text-center leading-tight" title={hint}>{hint}</span>}
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

export default function SystemOverview({ metadata, healthScore, memInfo, cpuInfo, bootStatus, halStatus, insights }: Props) {
  const { breakdown } = healthScore;
  const overallBorderColor = healthScore.overall >= 80 ? 'border-l-green-500' : healthScore.overall >= 50 ? 'border-l-amber-500' : 'border-l-red-500';
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
    <div className={`card space-y-4 border-l-4 ${overallBorderColor}`}>
      <h2 className="text-lg font-semibold">System Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Device</span>
          <p className="font-medium">{metadata.deviceModel}</p>
        </div>
        <div>
          <span className="text-gray-500">Manufacturer</span>
          <p className="font-medium">{metadata.manufacturer}</p>
        </div>
        <div>
          <span className="text-gray-500">Android</span>
          <p className="font-medium">{metadata.androidVersion} (SDK {metadata.sdkLevel})</p>
        </div>
        <div>
          <span className="text-gray-500">Build</span>
          <p className="font-medium truncate" title={metadata.buildFingerprint}>
            {metadata.buildFingerprint.split('/').slice(-2).join('/')}
          </p>
        </div>
        {metadata.buildType && metadata.buildType !== 'unknown' && (
          <div>
            <span className="text-gray-500">Build Type</span>
            <p className={`font-medium ${metadata.buildType !== 'user' ? 'text-amber-400' : ''}`}>
              {metadata.buildType}
              {metadata.buildType !== 'user' && (
                <span className="text-xs text-amber-500 ml-1">(non-production)</span>
              )}
            </p>
          </div>
        )}
        {bootStatus && (
          <>
            <div>
              <span className="text-gray-500">Boot</span>
              <p className={`font-medium ${bootStatus.bootCompleted ? 'text-green-400' : 'text-red-400'}`}>
                {bootStatus.bootCompleted ? 'Completed' : 'Incomplete'}
              </p>
            </div>
            {bootStatus.uptimeSeconds != null && (
              <div>
                <span className="text-gray-500">Uptime</span>
                <p className="font-medium">{formatUptime(bootStatus.uptimeSeconds)}</p>
              </div>
            )}
            {bootStatus.bootReason && (
              <div>
                <span className="text-gray-500">Boot Reason</span>
                <p className={`font-medium ${/reboot|normal/i.test(bootStatus.bootReason) ? '' : 'text-amber-400'}`}>
                  {bootStatus.bootReason}
                </p>
              </div>
            )}
            {bootStatus.systemServerRestarts > 0 && (
              <div>
                <span className="text-gray-500">SS Restarts</span>
                <p className="font-medium text-red-400">{bootStatus.systemServerRestarts}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* HW & SW Details */}
      {hwSwDetails.length > 0 && (
        <div>
          <button
            onClick={() => setShowHwSwDetails(!showHwSwDetails)}
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-surface px-3 py-1 rounded-md border border-border hover:border-indigo-500/30 transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showHwSwDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            {showHwSwDetails ? 'Hide' : 'Show'} HW & SW details ({hwSwDetails.length})
          </button>
          {showHwSwDetails && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 mt-2 text-sm">
              {hwSwDetails.map((d) => (
                <div key={d.label} className="flex flex-col">
                  <span className="text-xs text-gray-500">{d.label}</span>
                  <p className="font-medium text-gray-300 truncate" title={d.value}>{d.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Health Scores */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 justify-items-center pt-2">
        <ScoreRing score={healthScore.overall} label="Overall" size={80} showMax />
        <ScoreRing score={breakdown.stability} label="Stability" hint={deductionHint('stability', breakdown.stability, insights)} />
        <ScoreRing score={breakdown.memory} label="Memory" hint={deductionHint('memory', breakdown.memory, insights)} />
        <ScoreRing score={breakdown.responsiveness} label="Response" hint={deductionHint('responsiveness', breakdown.responsiveness, insights)} />
        <ScoreRing score={breakdown.kernel} label="Kernel" hint={deductionHint('kernel', breakdown.kernel, insights)} />
      </div>

      {/* Memory, CPU & HAL Summary */}
      {(memInfo || cpuInfo || halStatus) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {memInfo && memInfo.totalRamKb > 0 && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">Memory</h3>
              <p className="text-sm">
                Used <span className="font-medium text-gray-200">{formatKbToGb(memInfo.usedRamKb)} GB</span>
                {' / '}
                Total <span className="font-medium text-gray-200">{formatKbToGb(memInfo.totalRamKb)} GB</span>
                <span className="text-gray-500 ml-2">
                  ({((memInfo.freeRamKb / memInfo.totalRamKb) * 100).toFixed(0)}% free)
                </span>
              </p>
              {memInfo.topProcesses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-500">Top processes (PSS)</span>
                  {memInfo.topProcesses.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-400">
                      <span className="truncate mr-2">{p.processName}</span>
                      <span className="shrink-0">{(p.totalPssKb / 1024).toFixed(0)} MB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {cpuInfo && cpuInfo.totalCpuPercent > 0 && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">CPU</h3>
              <p className="text-sm">
                Total <span className="font-medium text-gray-200">{cpuInfo.totalCpuPercent}%</span>
                <span className="text-gray-500 ml-2">
                  ({cpuInfo.userPercent}% user / {cpuInfo.kernelPercent}% kernel
                  {cpuInfo.ioWaitPercent > 0 && ` / ${cpuInfo.ioWaitPercent}% iowait`})
                </span>
              </p>
              {cpuInfo.topProcesses.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-500">Top processes (per-core %)</span>
                  {cpuInfo.topProcesses.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-400">
                      <span className="truncate mr-2">{p.processName}</span>
                      <span className="shrink-0">{p.cpuPercent}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {halStatus && halStatus.families.length > 0 && (() => {
            const aliveFamilies = halStatus.families.filter((f) => f.highestStatus === 'alive').length;
            const totalFamilies = halStatus.families.length;
            const oemNR = halStatus.families.filter((f) => f.isVendor && f.isOem && f.highestStatus === 'non-responsive');
            const oemDeclared = halStatus.families.filter((f) => f.isVendor && f.isOem && f.highestStatus === 'declared');
            const bspNR = halStatus.families.filter((f) => f.isVendor && !f.isOem && f.highestStatus === 'non-responsive');
            const bspDeclared = halStatus.families.filter((f) => f.isVendor && !f.isOem && f.highestStatus === 'declared');
            const isTruncated = halStatus.truncated;
            return (
              <div className="bg-surface rounded-lg p-3 space-y-2 max-h-[320px] overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-400 sticky top-0 bg-surface pb-1">HAL Services</h3>
                {isTruncated && (
                  <div className="bg-amber-900/30 border border-amber-700/50 rounded px-2 py-1.5 text-xs text-amber-300">
                    <span className="font-semibold">lshal was killed by system</span>
                    <span className="text-amber-400/80"> — Services not yet pinged when lshal was terminated will appear as non-responsive or declared. Only OEM HAL status below is reliable.</span>
                  </div>
                )}
                <p className="text-sm">
                  Alive <span className="font-medium text-green-400">{aliveFamilies}</span>
                  {' / '}
                  <span className="font-medium text-gray-200">{totalFamilies} families</span>
                  {oemNR.length > 0 && (
                    <span className="text-red-400 ml-2">({oemNR.length} OEM non-responsive)</span>
                  )}
                  {!isTruncated && bspNR.length > 0 && (
                    <span className="text-red-400/70 ml-2">({bspNR.length} BSP non-responsive)</span>
                  )}
                </p>
                {oemNR.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">OEM HALs — non-responsive</span>
                    {oemNR.map((f, i) => (
                      <div key={i} className="text-xs text-red-400 truncate" title={f.familyName}>
                        {f.shortName}@{f.highestVersion}
                      </div>
                    ))}
                  </div>
                )}
                {oemDeclared.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs text-gray-500">OEM HALs — declared (not running)</span>
                    {oemDeclared.map((f, i) => (
                      <div key={i} className="text-xs text-amber-400 truncate" title={f.familyName}>
                        {f.shortName}@{f.highestVersion}
                      </div>
                    ))}
                  </div>
                )}
                {isTruncated && bspNR.length > 0 && (
                  <details className="text-xs">
                    <summary className="text-gray-600 cursor-pointer">BSP HALs — {bspNR.length} shown as non-responsive (unreliable — lshal was killed before completion)</summary>
                    <div className="space-y-1 mt-1">
                      {bspNR.slice(0, 10).map((f, i) => (
                        <div key={i} className="text-gray-500 truncate" title={f.familyName}>
                          {f.shortName}@{f.highestVersion}
                        </div>
                      ))}
                      {bspNR.length > 10 && (
                        <div className="text-gray-600">...and {bspNR.length - 10} more</div>
                      )}
                    </div>
                  </details>
                )}
                {!isTruncated && bspNR.length > 0 && (
                  <details className="text-xs">
                    <summary className="text-gray-500 cursor-pointer">BSP HALs — non-responsive ({bspNR.length})</summary>
                    <div className="space-y-1 mt-1">
                      {bspNR.slice(0, 10).map((f, i) => (
                        <div key={i} className="text-red-400/70 truncate" title={f.familyName}>
                          {f.shortName}@{f.highestVersion}
                        </div>
                      ))}
                      {bspNR.length > 10 && (
                        <div className="text-gray-500">...and {bspNR.length - 10} more</div>
                      )}
                    </div>
                  </details>
                )}
                {!isTruncated && bspDeclared.length > 0 && (
                  <details className="text-xs">
                    <summary className="text-gray-500 cursor-pointer">BSP HALs — declared ({bspDeclared.length})</summary>
                    <div className="space-y-1 mt-1">
                      {bspDeclared.slice(0, 10).map((f, i) => (
                        <div key={i} className="text-amber-400/70 truncate" title={f.familyName}>
                          {f.shortName}@{f.highestVersion}
                        </div>
                      ))}
                      {bspDeclared.length > 10 && (
                        <div className="text-gray-500">...and {bspDeclared.length - 10} more</div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
