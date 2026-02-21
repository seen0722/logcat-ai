import { BugreportMetadata, SystemHealthScore, MemInfoSummary, CpuInfoSummary, BootStatusSummary, HALStatusSummary } from '../lib/types';

interface Props {
  metadata: BugreportMetadata;
  healthScore: SystemHealthScore;
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  bootStatus?: BootStatusSummary;
  halStatus?: HALStatusSummary;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function ScoreRing({ score, label, size = 64 }: { score: number; label: string; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#2a2d3e" strokeWidth={4}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className={`text-lg font-bold -mt-10 ${scoreColor(score)}`}>{score}</span>
      <span className="text-xs text-gray-500 mt-5">{label}</span>
    </div>
  );
}

function formatKbToGb(kb: number): string {
  return (kb / 1048576).toFixed(1);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemOverview({ metadata, healthScore, memInfo, cpuInfo, bootStatus, halStatus }: Props) {
  const { breakdown } = healthScore;

  return (
    <div className="card space-y-4">
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

      {/* Health Scores */}
      <div className="flex items-center justify-around pt-2">
        <ScoreRing score={healthScore.overall} label="Overall" size={80} />
        <ScoreRing score={breakdown.stability} label="Stability" />
        <ScoreRing score={breakdown.memory} label="Memory" />
        <ScoreRing score={breakdown.responsiveness} label="Response" />
        <ScoreRing score={breakdown.kernel} label="Kernel" />
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
              <div className="bg-surface rounded-lg p-3 space-y-2">
                <h3 className="text-sm font-semibold text-gray-400">HAL Services</h3>
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
