import { BootStatusSummary, MemInfoSummary, CpuInfoSummary, HALStatusSummary, TagStat, PowerParseResult } from '../lib/types';

interface Props {
  bootStatus?: BootStatusSummary;
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  halStatus?: HALStatusSummary;
  logTagStats?: TagStat[];
  powerStatus?: PowerParseResult;
}

/** Generate a severity-colored verdict for each dimension */
function verdict(ok: boolean, good: string, bad: string): { text: string; color: string } {
  return ok ? { text: good, color: 'text-green-400' } : { text: bad, color: 'text-amber-400' };
}

export default function BSPQuickReference({ bootStatus, memInfo, cpuInfo, halStatus, logTagStats, powerStatus }: Props) {
  const vendorTags = logTagStats?.filter(t => t.classification === 'vendor') ?? [];
  const hasData = bootStatus || memInfo || cpuInfo ||
    (halStatus && halStatus.families.length > 0) ||
    vendorTags.length > 0 ||
    powerStatus;

  if (!hasData) return null;

  // Compute summary verdicts
  const findings: Array<{ label: string; value: string; color: string; detail?: string }> = [];

  if (bootStatus) {
    if (!bootStatus.bootCompleted) {
      findings.push({ label: 'Boot', value: 'Incomplete', color: 'text-red-400' });
    }
    if (bootStatus.systemServerRestarts > 0) {
      findings.push({ label: 'SS Restarts', value: `${bootStatus.systemServerRestarts}`, color: 'text-red-400', detail: 'System server has restarted' });
    }
    if (bootStatus.bootReason && !/reboot|normal/i.test(bootStatus.bootReason)) {
      findings.push({ label: 'Boot Reason', value: bootStatus.bootReason, color: 'text-amber-400' });
    }
  }

  if (memInfo && memInfo.totalRamKb > 0) {
    const usedPct = (memInfo.usedRamKb / memInfo.totalRamKb) * 100;
    if (usedPct >= 90) {
      findings.push({ label: 'Memory', value: `${usedPct.toFixed(0)}% used`, color: 'text-red-400', detail: 'Critical memory pressure' });
    } else if (usedPct >= 70) {
      findings.push({ label: 'Memory', value: `${usedPct.toFixed(0)}% used`, color: 'text-amber-400' });
    }
  }

  if (cpuInfo && cpuInfo.ioWaitPercent >= 10) {
    findings.push({ label: 'I/O Wait', value: `${cpuInfo.ioWaitPercent}%`, color: 'text-red-400', detail: 'High I/O wait indicates storage bottleneck' });
  }

  if (halStatus && halStatus.vendorIssueCount > 0) {
    const oemIssues = halStatus.families.filter(f => f.isOem && f.highestStatus !== 'alive');
    if (oemIssues.length > 0) {
      findings.push({
        label: 'OEM HALs',
        value: `${oemIssues.length} issue${oemIssues.length > 1 ? 's' : ''}`,
        color: 'text-red-400',
        detail: oemIssues.map(f => `${f.shortName}@${f.highestVersion}: ${f.highestStatus}`).join(', '),
      });
    }
    if (!halStatus.truncated) {
      const bspIssues = halStatus.families.filter(f => f.isVendor && !f.isOem && f.highestStatus !== 'alive');
      if (bspIssues.length > 0) {
        findings.push({
          label: 'BSP HALs',
          value: `${bspIssues.length} issue${bspIssues.length > 1 ? 's' : ''}`,
          color: 'text-amber-400',
          detail: bspIssues.slice(0, 3).map(f => `${f.shortName}@${f.highestVersion}`).join(', ') + (bspIssues.length > 3 ? ` +${bspIssues.length - 3} more` : ''),
        });
      }
    }
    if (halStatus.truncated) {
      findings.push({ label: 'lshal', value: 'truncated', color: 'text-amber-400', detail: 'BSP HAL status unreliable' });
    }
  }

  if (powerStatus?.batteryStats) {
    const rate = powerStatus.batteryStats.deepDozeDischargeRateMahPerHr;
    if (rate > 40) {
      findings.push({ label: 'Doze Rate', value: `${rate.toFixed(1)} mAh/h`, color: 'text-red-400', detail: 'Excessive drain in Deep Doze' });
    } else if (rate > 20) {
      findings.push({ label: 'Doze Rate', value: `${rate.toFixed(1)} mAh/h`, color: 'text-amber-400' });
    }
  }

  // If no notable findings, show a brief "all clear" instead of duplicating data
  if (findings.length === 0 && vendorTags.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">BSP Quick Reference</h2>
        <p className="text-sm text-gray-500">No significant BSP-level issues detected.</p>
      </div>
    );
  }

  return (
    <div className="card space-y-3 border-l-2 border-indigo-500/30">
      <h2 className="text-lg font-semibold">BSP Quick Reference</h2>

      {/* Findings as compact list */}
      {findings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {findings.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm bg-surface rounded-lg px-3 py-2" title={f.detail}>
              <span className="text-gray-500 shrink-0 w-24">{f.label}</span>
              <span className={`font-medium ${f.color}`}>{f.value}</span>
              {f.detail && <span className="text-gray-600 text-xs truncate ml-auto hidden sm:block max-w-[200px]">{f.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Vendor Error Tags - always useful for BSP engineers */}
      {vendorTags.length > 0 && (
        <div className="bg-surface rounded-lg p-3 space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">Vendor Error Tags ({vendorTags.length})</h3>
          <div className="flex flex-wrap gap-2">
            {vendorTags.slice(0, 15).map((t) => (
              <span key={t.tag} className="text-xs bg-amber-900/20 text-amber-400 px-2 py-0.5 rounded font-mono" title={`${t.count} occurrences`}>
                {t.tag} <span className="text-amber-500/60">{t.count}</span>
              </span>
            ))}
            {vendorTags.length > 15 && (
              <span className="text-xs text-gray-600">+{vendorTags.length - 15} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
