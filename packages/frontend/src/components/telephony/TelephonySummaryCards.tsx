import { TelephonyParseResult, PowerParseResult } from '../../lib/types';
import { IconSignal, IconNoService, IconWarningTriangle, IconAntenna } from '../Icons';
import MetricCard from '../shared/MetricCard';
import { voiceStateBadge, signalLevelColor, formatDuration } from './telephony-utils';

interface TelephonySummaryCardsProps {
  tel: TelephonyParseResult;
  powerStatus?: PowerParseResult;
}

export default function TelephonySummaryCards({ tel, powerStatus }: TelephonySummaryCardsProps) {
  const ratOos = powerStatus?.connectivityStats?.cellularRatDistribution?.find(e => e.rat === 'oos');
  const dnPeriods = tel.dataNetworkOosPeriods ?? [];
  const oosCount = dnPeriods.length;
  const totalOosMs = ratOos ? ratOos.timeMs
    : dnPeriods.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
  const oosPercentage = ratOos?.percentage;
  const hasOosData = ratOos !== undefined || dnPeriods.length > 0;

  const criticalRilErrors = tel.rilErrors.filter(
    e => e.errorType === 'radio_crash' || e.errorType === 'modem_restart'
  );

  const isOos = tel.serviceState?.voiceState === 'OUT_OF_SERVICE';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Voice State */}
      <MetricCard
        icon={<IconSignal className="w-4 h-4" />}
        label="Voice State"
        highlight={isOos}
        color={isOos ? 'text-red-400' : 'text-gray-200'}
        value={
          tel.serviceState ? (
            <span className={`inline-flex px-2 py-0.5 rounded-lg text-sm font-medium border ${voiceStateBadge(tel.serviceState.voiceState).color}`}>
              {voiceStateBadge(tel.serviceState.voiceState).label}
            </span>
          ) : (
            <span className="text-sm text-gray-400">N/A</span>
          )
        }
      />

      {/* OOS -- only show when we have data */}
      {hasOosData && (
        <MetricCard
          icon={<IconNoService className="w-4 h-4" />}
          label="OOS"
          value={ratOos
            ? `${oosPercentage!.toFixed(1)}%`
            : oosCount > 0 ? oosCount : '-'
          }
          color={
            ratOos
              ? (oosPercentage! > 5 ? 'text-red-400' : oosPercentage! > 0 ? 'text-warm' : 'text-gray-300')
              : (oosCount >= 3 ? 'text-red-400' : oosCount > 0 ? 'text-warm' : 'text-gray-300')
          }
          sub={ratOos
            ? `${formatDuration(totalOosMs)}${oosCount > 0 ? ` / ${oosCount} times` : ''}`
            : (totalOosMs > 0 ? `${formatDuration(totalOosMs)} total` : undefined)
          }
        />
      )}

      {/* RIL Errors */}
      <MetricCard
        icon={<IconWarningTriangle className="w-4 h-4" />}
        label="RIL Errors"
        value={tel.rilErrors.length}
        color={criticalRilErrors.length > 0 ? 'text-red-400' : tel.rilErrors.length > 0 ? 'text-warm' : 'text-gray-300'}
        sub={criticalRilErrors.length > 0 ? `${criticalRilErrors.length} critical` : undefined}
      />

      {/* Signal */}
      <MetricCard
        icon={<IconAntenna className="w-4 h-4" />}
        label="Signal Level"
        value={tel.signalStrength ? `Lv ${tel.signalStrength.level}` : 'N/A'}
        color={tel.signalStrength ? signalLevelColor(tel.signalStrength.level) : 'text-gray-400'}
        sub={tel.signalStrength?.technology}
      />
    </div>
  );
}
