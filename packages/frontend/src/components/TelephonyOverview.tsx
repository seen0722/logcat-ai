import { useState } from 'react';
import { TelephonyParseResult, PowerParseResult } from '../lib/types';
import TabSectionHeader from './shared/TabSectionHeader';
import StatusBadge from './shared/StatusBadge';
import DetailsToggle from './shared/DetailsToggle';
import TelephonySummaryCards from './telephony/TelephonySummaryCards';
import TelephonyDetails from './telephony/TelephonyDetails';

interface Props {
  telephonyStatus: TelephonyParseResult;
  powerStatus?: PowerParseResult;
}

export default function TelephonyOverview({ telephonyStatus, powerStatus }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const tel = telephonyStatus;

  const callDrops = tel.callEvents.filter(e => e.type === 'call_drop');
  const smsFails = tel.smsEvents.filter(e => e.type === 'sms_send_fail');

  const hasCallSmsEvents = tel.callEvents.length > 0 || tel.smsEvents.length > 0;

  const detailSectionCount = [
    tel.oosEvents.length > 0,
    tel.rilErrors.length > 0,
    hasCallSmsEvents,
    tel.signalStrength || tel.ratChanges.length > 0,
  ].filter(Boolean).length;

  const isOos = tel.serviceState?.voiceState === 'OUT_OF_SERVICE';

  const badges = (
    <>
      {(tel.modemRestartCount ?? 0) > 0 && (
        <StatusBadge variant="red">
          {tel.modemRestartCount} modem restart{(tel.modemRestartCount ?? 0) > 1 ? 's' : ''}
        </StatusBadge>
      )}
      {callDrops.length > 0 && (
        <StatusBadge variant="amber">
          {callDrops.length} call drop{callDrops.length > 1 ? 's' : ''}
        </StatusBadge>
      )}
      {smsFails.length > 0 && (
        <StatusBadge variant="amber">
          {smsFails.length} SMS fail{smsFails.length > 1 ? 's' : ''}
        </StatusBadge>
      )}
      {tel.serviceState?.roaming && <StatusBadge variant="accent">Roaming</StatusBadge>}
    </>
  );

  const heroRight = (
    <div className="space-y-1">
      {tel.serviceState?.operator && (
        <div className="text-xs text-gray-400">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider block">Operator</span>
          <span className="text-gray-300 font-medium">{tel.serviceState.operator}</span>
        </div>
      )}
      {tel.radioLogTimeRange && (
        <div className="text-[10px] text-gray-600 font-mono" title="Radio log buffer only covers a limited time window">
          {tel.radioLogTimeRange.start} ~ {tel.radioLogTimeRange.end}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <TabSectionHeader
        title="Telephony"
        gradient={isOos ? 'from-red-500/10 to-red-500/3' : 'from-accent/8 to-accent/2'}
        borderColor={isOos ? 'border-red-500/20' : 'border-accent/15'}
        badges={badges}
        rightContent={heroRight}
      >
        {/* Summary Cards Row */}
        <TelephonySummaryCards tel={tel} powerStatus={powerStatus} />
      </TabSectionHeader>

      {/* Show details toggle */}
      {detailSectionCount > 0 && (
        <DetailsToggle
          expanded={showDetails}
          onToggle={() => setShowDetails(!showDetails)}
          sectionCount={detailSectionCount}
        />
      )}

      {/* Detailed sections - collapsible */}
      {showDetails && <TelephonyDetails tel={tel} />}
    </div>
  );
}
