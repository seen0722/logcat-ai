import { useState } from 'react';
import { PowerParseResult } from '../lib/types';
import { IconBattery, IconStopwatch, IconSleep, IconZap } from './Icons';
import { rateColor, rateGradient } from '../lib/color-utils';
import { formatMs, rateBorder, AOSP_DEFAULTS } from './power/power-utils';
import { DozeSettingsDiffBanner } from './power/DozeSettings';
import PowerDetails from './power/PowerDetails';
import TabSectionHeader from './shared/TabSectionHeader';
import MetricCard from './shared/MetricCard';
import StatusBadge from './shared/StatusBadge';
import DetailsToggle from './shared/DetailsToggle';

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

  const detailSectionCount = [pm, dozeState, bs, kernelWakeLocks.length > 0, (alarmWakeups ?? []).length > 0, suspendStats].filter(Boolean).length;

  const badges = (
    <>
      {pm && (
        <StatusBadge variant={
          pm.wakefulness === 'Awake' ? 'green' :
          pm.wakefulness === 'Dozing' ? 'accent' : 'gray'
        }>
          {pm.wakefulness}
        </StatusBadge>
      )}
      {pm?.isPowered && <StatusBadge variant="green">Charging</StatusBadge>}
      {dozeDiffs.length > 0 && <StatusBadge variant="amber">{dozeDiffs.length} non-AOSP</StatusBadge>}
    </>
  );

  const heroRight = bs && bs.deepDozeTimeMs > 0 ? (
    <div>
      <div className={`text-3xl font-bold ${rateColor(dozeRate)}`}>
        {dozeRate.toFixed(1)}
      </div>
      <div className="text-xs text-gray-500">mAh/h Deep Doze</div>
      {dozeRate > 20 && (
        <div className="text-[10px] text-amber-400 mt-0.5">ideal &lt;20</div>
      )}
    </div>
  ) : undefined;

  return (
    <div className="space-y-4">
      <TabSectionHeader
        title="Power Management"
        gradient={rateGradient(dozeRate)}
        borderColor={rateBorder(dozeRate)}
        badges={badges}
        rightContent={heroRight}
      >
        {/* Key Metrics Grid */}
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
        <DozeSettingsDiffBanner diffs={dozeDiffs} />
      </TabSectionHeader>

      {/* Show details toggle */}
      <DetailsToggle
        expanded={showDetails}
        onToggle={() => setShowDetails(!showDetails)}
        sectionCount={detailSectionCount}
      />

      {/* Detailed sections */}
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
