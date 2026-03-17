import { useState } from 'react';
import { PowerParseResult } from '../lib/types';
import { IconBattery, IconStopwatch, IconSleep, IconZap, IconChevronDown } from './Icons';

interface Props {
  powerStatus?: PowerParseResult;
}

function formatMs(ms: number): string {
  if (ms <= 0) return '0';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60_000) / 1_000);
  if (m > 0) return `${m}m ${s}s`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function rateColor(rate: number): string {
  if (rate <= 0) return 'text-gray-400';
  if (rate < 20) return 'text-green-400';
  if (rate < 40) return 'text-amber-400';
  return 'text-red-400';
}

function rateGradient(rate: number): string {
  if (rate <= 0) return 'from-gray-500/10 to-gray-500/5';
  if (rate < 20) return 'from-green-500/10 to-green-500/3';
  if (rate < 40) return 'from-amber-500/10 to-amber-500/3';
  return 'from-red-500/10 to-red-500/3';
}

function rateBorder(rate: number): string {
  if (rate <= 0) return 'border-gray-700/30';
  if (rate < 20) return 'border-green-500/20';
  if (rate < 40) return 'border-amber-500/20';
  return 'border-red-500/20';
}

function dozeStateBadge(state: string): string {
  if (state === 'IDLE' || state === 'IDLE_MAINTENANCE') return 'text-green-400';
  if (state === 'ACTIVE') return 'text-gray-400';
  if (state === 'INACTIVE') return 'text-amber-400';
  return 'text-gray-300';
}

// AOSP defaults for comparison
const AOSP_DEFAULTS = {
  inactiveTo: 1800000,
  idleTo: 3600000,
  idleFactor: 2.0,
  maxIdleTo: 21600000,
  lightIdleTo: 300000,
  lightMaxIdleTo: 900000,
  lightIdleFactor: 2.0,
};

function MetricCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl p-4 space-y-1 border border-border/50">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color || 'text-gray-200'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600">{sub}</div>}
    </div>
  );
}

export default function PowerOverview({ powerStatus }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (!powerStatus) return null;

  const { powerManagerState: pm, dozeState, dozeSettings, batteryStats: bs, kernelWakeLocks, alarmWakeups, suspendStats } = powerStatus;
  const hasData = pm || dozeState || bs || kernelWakeLocks.length > 0;
  if (!hasData) return null;

  // Compute Doze settings diffs
  const dozeSettingEntries = dozeSettings ? ([
    ['inactive_to', dozeSettings.inactiveTo, AOSP_DEFAULTS.inactiveTo],
    ['idle_to', dozeSettings.idleTo, AOSP_DEFAULTS.idleTo],
    ['max_idle_to', dozeSettings.maxIdleTo, AOSP_DEFAULTS.maxIdleTo],
    ['idle_factor', dozeSettings.idleFactor, AOSP_DEFAULTS.idleFactor],
    ['light_idle_to', dozeSettings.lightIdleTo, AOSP_DEFAULTS.lightIdleTo],
  ] as [string, number, number][]).filter(([, val]) => val > 0) : [];

  const dozeDiffs = dozeSettingEntries.filter(([, val, def]) => val !== def);

  // Compute screen on percentage
  const screenOnPct = bs && bs.timePeriodMs > 0 && bs.screenOnTimeMs > 0
    ? (bs.screenOnTimeMs / bs.timePeriodMs * 100).toFixed(1)
    : null;

  // Compute Deep Doze percentage
  const dozePct = bs && bs.timePeriodMs > 0 && bs.deepDozeTimeMs > 0
    ? (bs.deepDozeTimeMs / bs.timePeriodMs * 100).toFixed(0)
    : null;

  const dozeRate = bs?.deepDozeDischargeRateMahPerHr ?? 0;

  return (
    <div className="space-y-4">
      {/* ── Hero: Doze Rate ── */}
      <div className={`card p-0 overflow-hidden`}>
        <div className={`bg-gradient-to-r ${rateGradient(dozeRate)} border-b ${rateBorder(dozeRate)} p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg text-gray-100 mb-1">Power Management</h2>
              <div className="flex flex-wrap items-center gap-2">
                {pm && (
                  <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border ${
                    pm.wakefulness === 'Awake' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    pm.wakefulness === 'Dozing' ? 'bg-accent/10 text-accent-light border-accent/20' :
                    'bg-gray-500/10 text-gray-400 border-border'
                  }`}>
                    {pm.wakefulness}
                  </span>
                )}
                {pm?.isPowered && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
                    Charging
                  </span>
                )}
                {dozeDiffs.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg">
                    {dozeDiffs.length} non-AOSP
                  </span>
                )}
              </div>
            </div>
            {bs && bs.deepDozeTimeMs > 0 && (
              <div className="text-right">
                <div className={`text-3xl font-bold ${rateColor(dozeRate)}`}>
                  {dozeRate.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500">mAh/h Deep Doze</div>
                {dozeRate > 20 && (
                  <div className="text-[10px] text-amber-400 mt-0.5">ideal &lt;20</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Key Metrics Grid ── */}
        <div className="p-5 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {pm && (
              <MetricCard
                icon={<IconBattery className="w-4 h-4 text-gray-500" />}
                label="Battery"
                value={`${pm.batteryLevel}%`}
                color={pm.batteryLevel <= 15 ? 'text-red-400' : pm.batteryLevel <= 30 ? 'text-amber-400' : 'text-green-400'}
                sub={bs ? `${bs.totalDischargeMah} mAh used` : undefined}
              />
            )}
            {bs && bs.timePeriod && (
              <MetricCard
                icon={<IconStopwatch className="w-4 h-4 text-gray-500" />}
                label="On Battery"
                value={bs.timePeriod.replace(/\s\d+ms$/, '')}
                sub={screenOnPct ? `Screen ${screenOnPct}%` : undefined}
              />
            )}
            {bs && bs.deepDozeTimeMs > 0 && (
              <MetricCard
                icon={<IconSleep className="w-4 h-4 text-gray-500" />}
                label="Deep Doze"
                value={bs.deepDozeTime?.replace(/\s\d+ms$/, '') ?? formatMs(bs.deepDozeTimeMs)}
                color="text-gray-200"
                sub={dozePct ? `${dozePct}% of battery time` : undefined}
              />
            )}
            {suspendStats && (
              <MetricCard
                icon={<IconZap className="w-4 h-4 text-gray-500" />}
                label="Suspend"
                value={`${suspendStats.suspendSuccessRate.toFixed(0)}%`}
                color={suspendStats.suspendSuccessRate < 70 ? 'text-red-400' : suspendStats.suspendSuccessRate < 90 ? 'text-amber-400' : 'text-green-400'}
                sub={`${suspendStats.suspendAbortCount} aborts / ${suspendStats.totalSuspendAttempts}`}
              />
            )}
          </div>

          {/* Doze Settings Diffs */}
          {dozeDiffs.length > 0 && (
            <div className="mt-4 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3.5 space-y-1.5">
              <div className="text-xs text-amber-400 font-medium">Doze Settings differ from AOSP</div>
              {dozeDiffs.map(([name, val, def]) => {
                const isTime = name !== 'idle_factor';
                const display = isTime ? formatMs(val) : val.toString();
                const defDisplay = isTime ? formatMs(def) : def.toString();
                return (
                  <div key={name} className="flex justify-between text-xs">
                    <span className="text-gray-400 font-mono">{name}</span>
                    <span className="text-amber-400">
                      {display} <span className="text-gray-600">(AOSP: {defDisplay})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Show details toggle ── */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors"
        >
          <IconChevronDown className={`w-3 h-3 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
          {showDetails ? 'Hide details' : `Show details (${[pm, dozeState, bs, kernelWakeLocks.length > 0, (alarmWakeups ?? []).length > 0, suspendStats].filter(Boolean).length} sections)`}
        </button>
      </div>

      {/* ── Detailed sections ── */}
      {showDetails && (
        <div className="space-y-4">
          {/* Power + Doze + Battery row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* PowerManager State */}
            {pm && (
              <div className="card space-y-3">
                <h3 className="font-display text-base text-gray-200">PowerManager State</h3>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <span className="text-gray-500">Auto Suspend</span>
                    <span className={pm.useAutoSuspend ? 'text-green-400' : 'text-amber-400'}>
                      {pm.useAutoSuspend ? 'Enabled' : 'Disabled'}
                    </span>
                    {pm.lastSleepReason && (
                      <>
                        <span className="text-gray-500">Last Sleep</span>
                        <span className="text-gray-300 font-mono">{pm.lastSleepReason}</span>
                      </>
                    )}
                  </div>
                  {pm.activeWakeLocks.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      <span className="text-[10px] text-gray-600 uppercase tracking-wider">Active Wake Locks ({pm.activeWakeLocks.length})</span>
                      {pm.activeWakeLocks.slice(0, 5).map((wl, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-300 truncate mr-2 font-mono" title={`${wl.type} uid=${wl.uid}`}>{wl.tag}</span>
                          <span className="text-gray-500 shrink-0">{wl.type.replace('_WAKE_LOCK', '')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {pm.suspendBlockers.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      <span className="text-[10px] text-gray-600 uppercase tracking-wider">Suspend Blockers ({pm.suspendBlockers.length})</span>
                      {pm.suspendBlockers.filter(sb => sb.refCount > 0).length > 0 ? (
                        pm.suspendBlockers.filter(sb => sb.refCount > 0).map((sb, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-amber-400 truncate mr-2 font-mono">{sb.name}</span>
                            <span className="text-amber-400 shrink-0">ref={sb.refCount}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-gray-600">All blockers ref=0 (none active)</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Doze Status */}
            {dozeState && (
              <div className="card space-y-3">
                <h3 className="font-display text-base text-gray-200">Doze Status</h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-500">Deep:</span>
                  <span className={`text-xs font-bold ${dozeStateBadge(dozeState.deepState)}`}>{dozeState.deepState}</span>
                  <span className="text-xs text-gray-500 ml-1">Light:</span>
                  <span className={`text-xs font-bold ${dozeStateBadge(dozeState.lightState)}`}>{dozeState.lightState}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-gray-500">Deep Doze</span>
                  <span className={dozeState.deepEnabled ? 'text-green-400' : 'text-red-400'}>
                    {dozeState.deepEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <span className="text-gray-500">Light Doze</span>
                  <span className={dozeState.lightEnabled ? 'text-green-400' : 'text-red-400'}>
                    {dozeState.lightEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {dozeSettings && dozeSettingEntries.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-border/50">
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">All Doze Parameters</span>
                    {dozeSettingEntries.map(([name, val, def]) => {
                      const isTime = name !== 'idle_factor';
                      const display = isTime ? formatMs(val) : val.toString();
                      const defDisplay = isTime ? formatMs(def) : def.toString();
                      const isDiff = val !== def;
                      return (
                        <div key={name} className="flex justify-between text-xs">
                          <span className="text-gray-500 font-mono">{name}</span>
                          <span className={isDiff ? 'text-amber-400' : 'text-gray-400'}>
                            {display}
                            {isDiff && <span className="text-gray-600 ml-1">(AOSP: {defDisplay})</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Battery Statistics */}
            {bs && (
              <div className="card space-y-3">
                <h3 className="font-display text-base text-gray-200">Battery Statistics</h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {bs.batteryCapacityMah > 0 && (
                    <>
                      <span className="text-gray-500">Capacity</span>
                      <span className="text-gray-300">{bs.batteryCapacityMah.toLocaleString()} mAh</span>
                    </>
                  )}
                  {bs.totalDischargeMah > 0 && (
                    <>
                      <span className="text-gray-500">Discharged</span>
                      <span className="text-gray-300">{bs.totalDischargeMah.toLocaleString()} mAh</span>
                    </>
                  )}
                  {bs.screenOnTime && (
                    <>
                      <span className="text-gray-500">Screen On</span>
                      <span className="text-gray-300">
                        {bs.screenOnTime}
                        {screenOnPct && <span className="text-gray-600 ml-1">({screenOnPct}%)</span>}
                      </span>
                    </>
                  )}
                  {bs.lightDozeTimeMs > 0 && (
                    <>
                      <span className="text-gray-500">Light Doze</span>
                      <span className="text-gray-300">{bs.lightDozeTime}</span>
                    </>
                  )}
                  {bs.partialWakelockTimeMs > 0 && (
                    <>
                      <span className="text-gray-500">Partial WL</span>
                      <span className={
                        bs.timePeriodMs > 0 && bs.partialWakelockTimeMs / bs.timePeriodMs > 0.1
                          ? 'text-amber-400' : 'text-gray-300'
                      }>
                        {bs.partialWakelockTime}
                        {bs.timePeriodMs > 0 && (
                          <span className="text-gray-600 ml-1">
                            ({(bs.partialWakelockTimeMs / bs.timePeriodMs * 100).toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Top Kernel Wakelocks */}
          {kernelWakeLocks.length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-display text-base text-gray-200">Top Kernel Wakelocks</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
                      <th className="text-left py-2 pr-2">Wake Lock</th>
                      <th className="text-right py-2 px-2">Total Time</th>
                      <th className="text-right py-2 px-2">Count</th>
                      <th className="text-right py-2 pl-2">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kernelWakeLocks.slice(0, 10).map((wl, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-surface-hover/50 transition-colors">
                        <td className="py-2 pr-2 text-gray-300 font-mono">{wl.name}</td>
                        <td className={`py-2 px-2 text-right whitespace-nowrap font-mono ${
                          wl.totalTimeMs > 7_200_000 ? 'text-red-400 font-medium' :
                          wl.totalTimeMs > 1_800_000 ? 'text-amber-400' : 'text-gray-400'
                        }`}>
                          {formatMs(wl.totalTimeMs)}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-400 font-mono">{wl.count.toLocaleString()}</td>
                        <td className="py-2 pl-2 text-right text-gray-500 whitespace-nowrap font-mono">{formatMs(wl.avgTimeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alarm Wakeups */}
          {alarmWakeups && alarmWakeups.length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-display text-base text-gray-200">Alarm Wakeups</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
                      <th className="text-left py-2 pr-2">App</th>
                      <th className="text-right py-2 px-2">Wakeups</th>
                      <th className="text-left py-2 pl-2">Top Alarm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alarmWakeups.slice(0, 10).map((a, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-surface-hover/50 transition-colors">
                        <td className="py-2 pr-2 text-gray-300 truncate max-w-[200px] font-mono" title={a.appName}>{a.appName}</td>
                        <td className={`py-2 px-2 text-right font-mono font-medium ${a.wakeupCount > 1000 ? 'text-red-400' : a.wakeupCount > 500 ? 'text-amber-400' : 'text-gray-300'}`}>
                          {a.wakeupCount.toLocaleString()}
                        </td>
                        <td className="py-2 pl-2 text-gray-500 truncate max-w-[250px] font-mono" title={a.topAlarms[0]?.name}>
                          {a.topAlarms[0]?.name ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Suspend Statistics */}
          {suspendStats && (
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base text-gray-200">Suspend Statistics</h3>
                {suspendStats.source && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface-hover text-gray-500 border border-border/50">
                    {suspendStats.source === 'suspend_stats_section' ? 'suspend_stats' : suspendStats.source}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface rounded-xl p-3 text-center border border-border/50">
                  <div className="text-lg font-bold text-gray-300">{suspendStats.totalSuspendAttempts.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">Attempts</div>
                </div>
                <div className="bg-surface rounded-xl p-3 text-center border border-border/50">
                  <div className={`text-lg font-bold ${suspendStats.suspendSuccessRate < 70 ? 'text-red-400' : suspendStats.suspendSuccessRate < 90 ? 'text-amber-400' : 'text-green-400'}`}>
                    {suspendStats.suspendSuccessRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">Success</div>
                </div>
                <div className="bg-surface rounded-xl p-3 text-center border border-border/50">
                  <div className={`text-lg font-bold ${suspendStats.suspendAbortCount > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                    {suspendStats.suspendAbortCount}
                  </div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">Aborts</div>
                </div>
                <div className="bg-surface rounded-xl p-3 text-center border border-border/50">
                  <div className="text-lg font-bold text-gray-300">{suspendStats.taskFreezeAbortCount}</div>
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">Freeze Fails</div>
                </div>
              </div>

              {suspendStats.lastFailedDev && (
                <div className="text-xs text-gray-400 bg-surface rounded-lg p-2.5 border border-border/50">
                  <span className="text-gray-500">Last Failed: </span>
                  <span className="text-amber-400 font-mono">{suspendStats.lastFailedDev}</span>
                  {suspendStats.lastFailedStep && (
                    <span className="text-gray-500"> (step: <span className="font-mono text-gray-400">{suspendStats.lastFailedStep}</span>)</span>
                  )}
                  {suspendStats.lastFailedErrno != null && (
                    <span className="text-gray-500"> errno: <span className="font-mono text-gray-400">{suspendStats.lastFailedErrno}</span></span>
                  )}
                </div>
              )}

              {suspendStats.topAbortSources.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">
                    Top Abort Sources
                    <span className="normal-case tracking-normal text-gray-700 ml-1" title="Counts reflect kernel log observations per source, not abort events.">(observations)</span>
                  </div>
                  {suspendStats.topAbortSources.slice(0, 5).map((src, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-300 font-mono truncate mr-2">{src.name}</span>
                      <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${Math.min(src.percentage, 100)}%` }} />
                      </div>
                      <span className={`shrink-0 font-mono ${src.percentage > 50 ? 'text-amber-400' : 'text-gray-500'}`}>
                        {src.count.toLocaleString()} ({src.percentage.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {suspendStats.topWakeupSources.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider">Top Wakeup Sources</div>
                  {suspendStats.topWakeupSources.slice(0, 5).map((src, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-300 font-mono truncate mr-2">{src.name}</span>
                      <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent/50" style={{ width: `${Math.min(src.percentage, 100)}%` }} />
                      </div>
                      <span className="shrink-0 text-gray-500 font-mono">{src.count} ({src.percentage.toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
