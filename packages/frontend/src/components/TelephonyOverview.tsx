import { useState } from 'react';
import { TelephonyParseResult, PowerParseResult } from '../lib/types';
import { IconChevronDown } from './Icons';
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

  return (
    <div className="space-y-4">
      {/* -- Hero Card -- */}
      <div className="card p-0 overflow-hidden">
        <div className="p-5">
          {/* Title + alert badges */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-display text-lg text-gray-100 mb-2">Telephony</h2>
              <div className="flex flex-wrap gap-2 items-center">
                {(tel.modemRestartCount ?? 0) > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border bg-red-500/10 text-red-300 border-red-500/20">
                    {tel.modemRestartCount} modem restart{(tel.modemRestartCount ?? 0) > 1 ? 's' : ''}
                  </span>
                )}
                {callDrops.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border bg-amber-500/10 text-amber-300 border-amber-500/20">
                    {callDrops.length} call drop{callDrops.length > 1 ? 's' : ''}
                  </span>
                )}
                {smsFails.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border bg-amber-500/10 text-amber-300 border-amber-500/20">
                    {smsFails.length} SMS fail{smsFails.length > 1 ? 's' : ''}
                  </span>
                )}
                {tel.serviceState?.roaming && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border bg-accent/10 text-accent border-accent/20">
                    Roaming
                  </span>
                )}
              </div>
            </div>
            <div className="text-right space-y-1">
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
          </div>

          {/* Summary Cards Row */}
          <TelephonySummaryCards tel={tel} powerStatus={powerStatus} />
        </div>
      </div>

      {/* -- Show details toggle -- */}
      {detailSectionCount > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <IconChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            {showDetails ? 'Show less' : `Show details (${detailSectionCount} sections)`}
          </button>
        </div>
      )}

      {/* -- Detailed sections - collapsible -- */}
      {showDetails && <TelephonyDetails tel={tel} />}
    </div>
  );
}
