import { useState } from 'react';
import { PowerParseResult } from '../lib/types';

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

function rateBg(rate: number): string {
  if (rate <= 0) return 'bg-gray-700';
  if (rate < 20) return 'bg-green-900/40';
  if (rate < 40) return 'bg-amber-900/40';
  return 'bg-red-900/40';
}

function wakefulnessBadge(w: string): { color: string; label: string } {
  switch (w) {
    case 'Awake': return { color: 'bg-green-900/50 text-green-300 border-green-700/50', label: 'Awake' };
    case 'Dozing': return { color: 'bg-blue-900/50 text-blue-300 border-blue-700/50', label: 'Dozing' };
    case 'Asleep': return { color: 'bg-gray-700/50 text-gray-300 border-gray-600/50', label: 'Asleep' };
    default: return { color: 'bg-gray-700/50 text-gray-400 border-gray-600/50', label: w };
  }
}

function dozeStateBadge(state: string): string {
  if (state === 'IDLE' || state === 'IDLE_MAINTENANCE') return 'text-green-400';
  if (state === 'ACTIVE') return 'text-gray-400';
  if (state === 'INACTIVE') return 'text-amber-400';
  return 'text-gray-300';
}

// AOSP defaults for comparison
const AOSP_DEFAULTS = {
  inactiveTo: 1800000,      // 30min
  idleTo: 3600000,          // 1h
  idleFactor: 2.0,
  maxIdleTo: 21600000,      // 6h
  lightIdleTo: 300000,      // 5min
  lightMaxIdleTo: 900000,   // 15min
  lightIdleFactor: 2.0,
};

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

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Power Management</h2>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showDetails ? 'Show less' : 'Show details'}
        </button>
      </div>

      {/* Key Metrics Summary Bar */}
      <div className="flex flex-wrap gap-3">
        {pm && (
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${wakefulnessBadge(pm.wakefulness).color}`}>
            {wakefulnessBadge(pm.wakefulness).label}
          </span>
        )}
        {pm && pm.isPowered && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
            Charging
          </span>
        )}
        {pm && (
          <span className="text-xs text-gray-400">
            Battery <span className={`font-medium ${pm.batteryLevel <= 15 ? 'text-red-400' : pm.batteryLevel <= 30 ? 'text-amber-400' : 'text-green-400'}`}>{pm.batteryLevel}%</span>
          </span>
        )}
        {dozeState && (
          <span className="text-xs text-gray-400">
            Deep Doze: <span className={`font-medium ${dozeStateBadge(dozeState.deepState)}`}>{dozeState.deepState}</span>
          </span>
        )}
        {bs && bs.deepDozeTimeMs > 0 && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${rateBg(bs.deepDozeDischargeRateMahPerHr)} ${rateColor(bs.deepDozeDischargeRateMahPerHr)}`}>
            Doze Rate: {bs.deepDozeDischargeRateMahPerHr.toFixed(1)} mAh/h
          </span>
        )}
        {dozeDiffs.length > 0 && (
          <span className="text-xs text-amber-400 px-2 py-0.5 rounded bg-amber-900/30">
            {dozeDiffs.length} non-AOSP setting{dozeDiffs.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Deep Doze discharge rate - key metric, always visible */}
      {bs && bs.deepDozeTimeMs > 0 && (
        <div className={`rounded-lg p-3 ${rateBg(bs.deepDozeDischargeRateMahPerHr)}`}>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Deep Doze Discharge Rate</span>
            <span className={`text-lg font-bold ${rateColor(bs.deepDozeDischargeRateMahPerHr)}`}>
              {bs.deepDozeDischargeRateMahPerHr.toFixed(1)} mAh/h
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {bs.deepDozeTime} | {bs.deepDozeDischargeMah.toFixed(1)} mAh discharged
            {bs.deepDozeDischargeRateMahPerHr > 20 && (
              <span className="text-amber-400 ml-1">(ideal &lt;20)</span>
            )}
          </div>
        </div>
      )}

      {/* Doze Settings Diffs - only show non-AOSP values */}
      {dozeDiffs.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 space-y-1">
          <div className="text-xs text-amber-400 font-medium mb-1">Doze Settings differ from AOSP</div>
          {dozeDiffs.map(([name, val, def]) => {
            const isTime = name !== 'idle_factor';
            const display = isTime ? formatMs(val) : val.toString();
            const defDisplay = isTime ? formatMs(def) : def.toString();
            return (
              <div key={name} className="flex justify-between text-xs">
                <span className="text-gray-400">{name}</span>
                <span className="text-amber-400">
                  {display} <span className="text-gray-600">(AOSP: {defDisplay})</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed sections - collapsible */}
      {showDetails && (
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left: Power Manager State */}
            <div className="bg-surface rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">PowerManager State</h3>

              {pm && (
                <>
                  {/* Battery level bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Battery Level</span>
                      <span>{pm.batteryLevel}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pm.batteryLevel <= 15 ? 'bg-red-500' : pm.batteryLevel <= 30 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${pm.batteryLevel}%` }}
                      />
                    </div>
                  </div>

                  {/* Key-value pairs */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-gray-500">Auto Suspend</span>
                    <span className={pm.useAutoSuspend ? 'text-green-400' : 'text-amber-400'}>
                      {pm.useAutoSuspend ? 'Enabled' : 'Disabled'}
                    </span>
                    {pm.lastSleepReason && (
                      <>
                        <span className="text-gray-500">Last Sleep</span>
                        <span className="text-gray-300">{pm.lastSleepReason}</span>
                      </>
                    )}
                  </div>

                  {/* Active wake locks */}
                  {pm.activeWakeLocks.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">Active Wake Locks ({pm.activeWakeLocks.length})</div>
                      {pm.activeWakeLocks.slice(0, 5).map((wl, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-300 truncate mr-2" title={`${wl.type} uid=${wl.uid}`}>{wl.tag}</span>
                          <span className="text-gray-500 shrink-0">{wl.type.replace('_WAKE_LOCK', '')}</span>
                        </div>
                      ))}
                      {pm.activeWakeLocks.length > 5 && (
                        <div className="text-xs text-gray-600">...and {pm.activeWakeLocks.length - 5} more</div>
                      )}
                    </div>
                  )}

                  {/* Suspend blockers */}
                  {pm.suspendBlockers.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">Suspend Blockers ({pm.suspendBlockers.length})</div>
                      {pm.suspendBlockers.map((sb, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-300 truncate mr-2">{sb.name}</span>
                          <span className="text-gray-500">ref={sb.refCount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Middle: Doze Status */}
            <div className="bg-surface rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">Doze Status</h3>

              {dozeState && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">Deep:</span>
                    <span className={`text-xs font-medium ${dozeStateBadge(dozeState.deepState)}`}>
                      {dozeState.deepState}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">Light:</span>
                    <span className={`text-xs font-medium ${dozeStateBadge(dozeState.lightState)}`}>
                      {dozeState.lightState}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-gray-500">Screen</span>
                    <span className={dozeState.screenOn ? 'text-amber-400' : 'text-gray-300'}>
                      {dozeState.screenOn ? 'On' : 'Off'}
                    </span>
                    <span className="text-gray-500">Charging</span>
                    <span className="text-gray-300">{dozeState.charging ? 'Yes' : 'No'}</span>
                    <span className="text-gray-500">Deep Doze</span>
                    <span className={dozeState.deepEnabled ? 'text-green-400' : 'text-red-400'}>
                      {dozeState.deepEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-gray-500">Light Doze</span>
                    <span className={dozeState.lightEnabled ? 'text-green-400' : 'text-red-400'}>
                      {dozeState.lightEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </>
              )}

              {/* All Doze settings (in detail mode) */}
              {dozeSettings && dozeSettingEntries.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-xs text-gray-500">All Doze Settings</div>
                  <div className="space-y-0.5">
                    {dozeSettingEntries.map(([name, val, def]) => {
                      const isTime = name !== 'idle_factor';
                      const display = isTime ? formatMs(val) : val.toString();
                      const defDisplay = isTime ? formatMs(def) : def.toString();
                      const isDiff = val !== def;
                      return (
                        <div key={name} className="flex justify-between text-xs">
                          <span className="text-gray-500">{name}</span>
                          <span className={isDiff ? 'text-amber-400' : 'text-gray-300'}>
                            {display}
                            {isDiff && <span className="text-gray-600 ml-1">(AOSP: {defDisplay})</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Battery Statistics */}
            <div className="bg-surface rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">Battery Statistics</h3>

              {bs && (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {bs.batteryCapacityMah > 0 && (
                      <>
                        <span className="text-gray-500">Capacity</span>
                        <span className="text-gray-300">{bs.batteryCapacityMah} mAh</span>
                      </>
                    )}
                    {bs.totalDischargeMah > 0 && (
                      <>
                        <span className="text-gray-500">Discharged</span>
                        <span className="text-gray-300">{bs.totalDischargeMah} mAh</span>
                      </>
                    )}
                    {bs.timePeriod && (
                      <>
                        <span className="text-gray-500">On Battery</span>
                        <span className="text-gray-300">{bs.timePeriod}</span>
                      </>
                    )}
                    {bs.screenOnTime && (
                      <>
                        <span className="text-gray-500">Screen On</span>
                        <span className="text-gray-300">{bs.screenOnTime}</span>
                      </>
                    )}
                  </div>

                  {bs.lightDozeTimeMs > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 text-xs">
                      <span className="text-gray-500">Light Doze</span>
                      <span className="text-gray-300">{bs.lightDozeTime}</span>
                    </div>
                  )}

                  {bs.partialWakelockTimeMs > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 text-xs">
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
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Top Kernel Wakelocks */}
          {kernelWakeLocks.length > 0 && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">Top Kernel Wakelocks</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-1 pr-2">Wake Lock</th>
                      <th className="text-right py-1 px-2">Total Time</th>
                      <th className="text-right py-1 px-2">Count</th>
                      <th className="text-right py-1 pl-2">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kernelWakeLocks.slice(0, 10).map((wl, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-1 pr-2 text-gray-300" title={wl.name}>
                          {wl.name}
                        </td>
                        <td className={`py-1 px-2 text-right whitespace-nowrap ${
                          wl.totalTimeMs > 7_200_000 ? 'text-red-400' :
                          wl.totalTimeMs > 1_800_000 ? 'text-amber-400' :
                          'text-gray-400'
                        }`}>
                          {formatMs(wl.totalTimeMs)}
                        </td>
                        <td className="py-1 px-2 text-right text-gray-400">
                          {wl.count.toLocaleString()}
                        </td>
                        <td className="py-1 pl-2 text-right text-gray-400 whitespace-nowrap">
                          {formatMs(wl.avgTimeMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alarm Wakeups */}
          {alarmWakeups && alarmWakeups.length > 0 && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">Alarm Wakeups (Top Apps)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700/50">
                      <th className="text-left py-1 pr-2">App</th>
                      <th className="text-right py-1 px-2">Wakeups</th>
                      <th className="text-left py-1 pl-2">Top Alarm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alarmWakeups.slice(0, 10).map((a, i) => (
                      <tr key={i} className="border-b border-gray-800/30">
                        <td className="py-1 pr-2 text-gray-300 truncate max-w-[200px]" title={a.appName}>{a.appName}</td>
                        <td className={`py-1 px-2 text-right font-medium ${a.wakeupCount > 1000 ? 'text-red-400' : a.wakeupCount > 500 ? 'text-amber-400' : 'text-gray-300'}`}>
                          {a.wakeupCount.toLocaleString()}
                        </td>
                        <td className="py-1 pl-2 text-gray-500 truncate max-w-[250px]" title={a.topAlarms[0]?.name}>
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
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-400">Suspend Statistics</h3>
                {suspendStats.source && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    {suspendStats.source === 'suspend_stats_section' ? 'suspend_stats' : suspendStats.source}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-300">{suspendStats.totalSuspendAttempts}</div>
                  <div className="text-xs text-gray-500">Total Attempts</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${suspendStats.suspendSuccessRate < 50 ? 'text-red-400' : suspendStats.suspendSuccessRate < 70 ? 'text-amber-400' : 'text-green-400'}`}>
                    {suspendStats.suspendSuccessRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${suspendStats.suspendAbortCount > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                    {suspendStats.suspendAbortCount}
                  </div>
                  <div className="text-xs text-gray-500">Aborts</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-300">{suspendStats.taskFreezeAbortCount}</div>
                  <div className="text-xs text-gray-500">Task Freeze Failures</div>
                </div>
              </div>

              {suspendStats.lastFailedDev && (
                <div className="text-xs text-gray-400 pt-1">
                  <span className="text-gray-500">Last Failed Device: </span>
                  <span className="text-amber-400 font-mono">{suspendStats.lastFailedDev}</span>
                  {suspendStats.lastFailedStep && (
                    <span> (step: <span className="font-mono">{suspendStats.lastFailedStep}</span>)</span>
                  )}
                  {suspendStats.lastFailedErrno != null && (
                    <span> errno: <span className="font-mono">{suspendStats.lastFailedErrno}</span></span>
                  )}
                </div>
              )}

              {suspendStats.topAbortSources.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-xs text-gray-500">Top Abort Sources</div>
                  {suspendStats.topAbortSources.slice(0, 5).map((src, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-300 truncate mr-2">{src.name}</span>
                      <span className={src.percentage > 50 ? 'text-red-400' : 'text-gray-400'}>
                        {src.count} ({src.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {suspendStats.topWakeupSources.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-xs text-gray-500">Top Wakeup Sources</div>
                  {suspendStats.topWakeupSources.slice(0, 5).map((src, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-300 truncate mr-2">{src.name}</span>
                      <span className="text-gray-400">{src.count} ({src.percentage.toFixed(1)}%)</span>
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
