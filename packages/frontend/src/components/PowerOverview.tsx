import { useState } from 'react';
import { PowerParseResult } from '../lib/types';
import { IconBattery, IconStopwatch, IconSleep, IconZap, IconChevronDown } from './Icons';
import { rateColor, rateGradient } from '../lib/color-utils';
import { formatMs, rateBorder, AOSP_DEFAULTS } from './power/power-utils';
import PowerMetricCard from './power/PowerMetricCard';
import { DozeSettingsDiffBanner } from './power/DozeSettings';
import PowerDetails from './power/PowerDetails';

interface Props {
  powerStatus?: PowerParseResult;
}

export default function PowerOverview({ powerStatus }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (!powerStatus) return null;

  const { powerManagerState: pm, dozeState, batteryStats: bs, kernelWakeLocks, alarmWakeups, suspendStats } = powerStatus;
  const hasData = pm || dozeState || bs || kernelWakeLocks.length > 0;
  if (!hasData) return null;

  // Compute Doze settings diffs
  const dozeSettingEntries = powerStatus.dozeSettings ? ([
    ['inactive_to', powerStatus.dozeSettings.inactiveTo, AOSP_DEFAULTS.inactiveTo],
    ['idle_to', powerStatus.dozeSettings.idleTo, AOSP_DEFAULTS.idleTo],
    ['max_idle_to', powerStatus.dozeSettings.maxIdleTo, AOSP_DEFAULTS.maxIdleTo],
    ['idle_factor', powerStatus.dozeSettings.idleFactor, AOSP_DEFAULTS.idleFactor],
    ['light_idle_to', powerStatus.dozeSettings.lightIdleTo, AOSP_DEFAULTS.lightIdleTo],
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
              <PowerMetricCard
                icon={<IconBattery className="w-4 h-4 text-gray-500" />}
                label="Battery"
                value={`${pm.batteryLevel}%`}
                color={pm.batteryLevel <= 15 ? 'text-red-400' : pm.batteryLevel <= 30 ? 'text-amber-400' : 'text-green-400'}
                sub={bs ? `${bs.totalDischargeMah} mAh used` : undefined}
              />
            )}
            {bs && bs.timePeriod && (
              <PowerMetricCard
                icon={<IconStopwatch className="w-4 h-4 text-gray-500" />}
                label="On Battery"
                value={bs.timePeriod.replace(/\s\d+ms$/, '')}
                sub={screenOnPct ? `Screen ${screenOnPct}%` : undefined}
              />
            )}
            {bs && bs.deepDozeTimeMs > 0 && (
              <PowerMetricCard
                icon={<IconSleep className="w-4 h-4 text-gray-500" />}
                label="Deep Doze"
                value={bs.deepDozeTime?.replace(/\s\d+ms$/, '') ?? formatMs(bs.deepDozeTimeMs)}
                color="text-gray-200"
                sub={dozePct ? `${dozePct}% of battery time` : undefined}
              />
            )}
            {suspendStats && (
              <PowerMetricCard
                icon={<IconZap className="w-4 h-4 text-gray-500" />}
                label="Suspend"
                value={`${suspendStats.suspendSuccessRate.toFixed(0)}%`}
                color={suspendStats.suspendSuccessRate < 70 ? 'text-red-400' : suspendStats.suspendSuccessRate < 90 ? 'text-amber-400' : 'text-green-400'}
                sub={`${suspendStats.suspendAbortCount} aborts / ${suspendStats.totalSuspendAttempts}`}
              />
            )}
          </div>

          {/* Doze Settings Diffs */}
          <DozeSettingsDiffBanner diffs={dozeDiffs} />
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
        <PowerDetails
          powerStatus={powerStatus}
          dozeSettingEntries={dozeSettingEntries}
          screenOnPct={screenOnPct}
        />
      )}
    </div>
  );
}
