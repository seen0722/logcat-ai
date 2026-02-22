import { BootStatusSummary, MemInfoSummary, CpuInfoSummary, HALStatusSummary, TagStat } from '../lib/types';

interface Props {
  bootStatus?: BootStatusSummary;
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  halStatus?: HALStatusSummary;
  logTagStats?: TagStat[];
}

function formatKbToGb(kb: number): string {
  return (kb / 1048576).toFixed(1);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function BSPQuickReference({ bootStatus, memInfo, cpuInfo, halStatus, logTagStats }: Props) {
  const vendorTags = logTagStats?.filter(t => t.classification === 'vendor') ?? [];
  const hasData = bootStatus || memInfo || cpuInfo ||
    (halStatus && halStatus.families.length > 0) ||
    vendorTags.length > 0;

  if (!hasData) return null;

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">BSP Quick Reference</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Boot & Reliability */}
        {bootStatus && (
          <div className="bg-surface rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-400">Boot & Reliability</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="text-gray-500">Boot Status</div>
              <div className={bootStatus.bootCompleted ? 'text-green-400' : 'text-red-400'}>
                {bootStatus.bootCompleted ? 'Completed' : 'Incomplete'}
              </div>

              {bootStatus.bootReason && (
                <>
                  <div className="text-gray-500">Boot Reason</div>
                  <div className={/reboot|normal/i.test(bootStatus.bootReason) ? 'text-gray-300' : 'text-amber-400'}>
                    {bootStatus.bootReason}
                  </div>
                </>
              )}

              {bootStatus.uptimeSeconds != null && (
                <>
                  <div className="text-gray-500">Uptime</div>
                  <div className="text-gray-300">{formatUptime(bootStatus.uptimeSeconds)}</div>
                </>
              )}

              <div className="text-gray-500">SS Restarts</div>
              <div className={bootStatus.systemServerRestarts > 0 ? 'text-red-400 font-medium' : 'text-gray-300'}>
                {bootStatus.systemServerRestarts}
              </div>
            </div>
          </div>
        )}

        {/* Resource Pressure */}
        {(memInfo || cpuInfo) && (
          <div className="bg-surface rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-400">Resource Pressure</h3>

            {memInfo && memInfo.totalRamKb > 0 && (() => {
              const usedPct = ((memInfo.usedRamKb / memInfo.totalRamKb) * 100);
              return (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Memory</span>
                    <span>{formatKbToGb(memInfo.usedRamKb)} / {formatKbToGb(memInfo.totalRamKb)} GB ({usedPct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(usedPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {cpuInfo && cpuInfo.totalCpuPercent > 0 && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>CPU Total</span>
                  <span>{cpuInfo.totalCpuPercent}%</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-gray-400">user {cpuInfo.userPercent}%</span>
                  <span className="text-gray-400">kernel {cpuInfo.kernelPercent}%</span>
                  {cpuInfo.ioWaitPercent > 0 && (
                    <span className={cpuInfo.ioWaitPercent >= 10 ? 'text-red-400 font-medium' : 'text-amber-400'}>
                      iowait {cpuInfo.ioWaitPercent}%
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HAL Health */}
        {halStatus && halStatus.families.length > 0 && (() => {
          const aliveFamilies = halStatus.families.filter(f => f.highestStatus === 'alive').length;
          const oemIssues = halStatus.families.filter(f => f.isOem && f.highestStatus !== 'alive');
          const bspIssues = halStatus.families.filter(f => f.isVendor && !f.isOem && f.highestStatus !== 'alive');

          return (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">HAL Health</h3>

              {halStatus.truncated && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded px-2 py-1 text-xs text-amber-300">
                  lshal truncated — BSP HAL status unreliable
                </div>
              )}

              <div className="text-sm">
                <span className="text-green-400 font-medium">{aliveFamilies}</span>
                <span className="text-gray-400"> / {halStatus.families.length} families alive</span>
                {halStatus.vendorIssueCount > 0 && (
                  <span className="text-red-400 ml-2">({halStatus.vendorIssueCount} vendor issues)</span>
                )}
              </div>

              {oemIssues.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-gray-500">OEM HAL issues</span>
                  {oemIssues.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-300 truncate mr-2" title={f.familyName}>{f.shortName}@{f.highestVersion}</span>
                      <span className={f.highestStatus === 'non-responsive' ? 'text-red-400' : 'text-amber-400'}>{f.highestStatus}</span>
                    </div>
                  ))}
                </div>
              )}

              {bspIssues.length > 0 && (
                <div className={`space-y-1 ${halStatus.truncated ? 'opacity-50' : ''}`}>
                  <span className="text-xs text-gray-500">
                    BSP HAL issues ({bspIssues.length})
                    {halStatus.truncated && <span className="italic"> (unreliable — lshal truncated)</span>}
                  </span>
                  {bspIssues.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-400 truncate mr-2" title={f.familyName}>{f.shortName}@{f.highestVersion}</span>
                      <span className={f.highestStatus === 'non-responsive' ? 'text-red-400/70' : 'text-amber-400/70'}>{f.highestStatus}</span>
                    </div>
                  ))}
                  {bspIssues.length > 5 && (
                    <div className="text-xs text-gray-600">...and {bspIssues.length - 5} more</div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Vendor Errors */}
        {vendorTags.length > 0 && (
          <div className="bg-surface rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-400">Vendor Error Tags</h3>
            <div className="space-y-1">
              {vendorTags.slice(0, 10).map((t, i) => (
                <div key={t.tag} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 w-4 text-right">{i + 1}</span>
                  <span className="text-amber-400 truncate flex-1" title={t.tag}>{t.tag}</span>
                  <span className="text-gray-400 shrink-0">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
