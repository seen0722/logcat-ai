import { useState } from 'react';
import { TelephonyParseResult } from '../lib/types';

interface Props {
  telephonyStatus: TelephonyParseResult;
}

function voiceStateBadge(state: string): { color: string; label: string } {
  switch (state) {
    case 'IN_SERVICE': return { color: 'bg-green-900/50 text-green-300 border-green-700/50', label: 'In Service' };
    case 'OUT_OF_SERVICE': return { color: 'bg-red-900/50 text-red-300 border-red-700/50', label: 'Out of Service' };
    case 'EMERGENCY_ONLY': return { color: 'bg-amber-900/50 text-amber-300 border-amber-700/50', label: 'Emergency Only' };
    case 'POWER_OFF': return { color: 'bg-gray-700/50 text-gray-400 border-gray-600/50', label: 'Power Off' };
    default: return { color: 'bg-gray-700/50 text-gray-400 border-gray-600/50', label: state };
  }
}

function signalLevelColor(level: number): string {
  if (level >= 4) return 'text-green-400';
  if (level >= 3) return 'text-green-300';
  if (level >= 2) return 'text-amber-400';
  return 'text-red-400';
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function TelephonyOverview({ telephonyStatus }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const tel = telephonyStatus;

  const oosStarts = tel.oosEvents.filter(e => e.type === 'oos_start');
  const totalOosMs = tel.oosEvents
    .filter(e => e.type === 'oos_end')
    .reduce((sum, e) => sum + (e.durationMs || 0), 0);

  const criticalRilErrors = tel.rilErrors.filter(
    e => e.errorType === 'radio_crash' || e.errorType === 'modem_restart'
  );
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
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Telephony</h2>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {showDetails ? 'Show less' : `Show details (${detailSectionCount} sections)`}
        </button>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Voice State */}
        <div className={`rounded-lg p-3 border ${tel.serviceState && tel.serviceState.voiceState !== 'IN_SERVICE' ? 'bg-red-900/20 border-red-700/30' : 'bg-surface border-border'}`}>
          <div className="text-xs text-gray-500 mb-1">Voice State</div>
          {tel.serviceState ? (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${voiceStateBadge(tel.serviceState.voiceState).color}`}>
              {voiceStateBadge(tel.serviceState.voiceState).label}
            </span>
          ) : (
            <span className="text-sm text-gray-400">N/A</span>
          )}
        </div>

        {/* OOS Count */}
        <div className={`rounded-lg p-3 border ${oosStarts.length > 0 ? 'bg-amber-900/20 border-amber-700/30' : 'bg-surface border-border'}`}>
          <div className="text-xs text-gray-500 mb-1">OOS Count</div>
          <div className={`text-lg font-bold ${oosStarts.length >= 3 ? 'text-red-400' : oosStarts.length > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
            {oosStarts.length}
          </div>
          {totalOosMs > 0 && (
            <div className="text-xs text-gray-500">{formatDuration(totalOosMs)} total</div>
          )}
        </div>

        {/* RIL Errors */}
        <div className={`rounded-lg p-3 border ${criticalRilErrors.length > 0 ? 'bg-red-900/20 border-red-700/30' : 'bg-surface border-border'}`}>
          <div className="text-xs text-gray-500 mb-1">RIL Errors</div>
          <div className={`text-lg font-bold ${criticalRilErrors.length > 0 ? 'text-red-400' : tel.rilErrors.length > 0 ? 'text-amber-400' : 'text-gray-300'}`}>
            {tel.rilErrors.length}
          </div>
          {criticalRilErrors.length > 0 && (
            <div className="text-xs text-red-400">{criticalRilErrors.length} critical</div>
          )}
        </div>

        {/* Signal */}
        <div className="rounded-lg p-3 bg-surface border border-border">
          <div className="text-xs text-gray-500 mb-1">Signal</div>
          {tel.signalStrength ? (
            <>
              <div className={`text-lg font-bold ${signalLevelColor(tel.signalStrength.level)}`}>
                Lv {tel.signalStrength.level}
              </div>
              <div className="text-xs text-gray-500">{tel.signalStrength.technology}</div>
            </>
          ) : (
            <span className="text-sm text-gray-400">N/A</span>
          )}
        </div>
      </div>

      {/* Alert badges */}
      <div className="flex flex-wrap gap-2">
        {callDrops.length > 0 && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700/50">
            {callDrops.length} call drop{callDrops.length > 1 ? 's' : ''}
          </span>
        )}
        {smsFails.length > 0 && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700/50">
            {smsFails.length} SMS fail{smsFails.length > 1 ? 's' : ''}
          </span>
        )}
        {tel.serviceState?.roaming && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
            Roaming
          </span>
        )}
        {tel.serviceState?.operator && (
          <span className="text-xs text-gray-400">
            Operator: <span className="text-gray-300">{tel.serviceState.operator}</span>
          </span>
        )}
      </div>

      {/* Detailed sections - collapsible */}
      {showDetails && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* OOS Event History */}
          {tel.oosEvents.length > 0 && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">OOS Event History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-1 pr-2">Timestamp</th>
                      <th className="text-left py-1 px-2">Type</th>
                      <th className="text-left py-1 px-2">Domain</th>
                      <th className="text-right py-1 pl-2">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tel.oosEvents.map((oos, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-1 pr-2 text-gray-300 font-mono whitespace-nowrap">{oos.timestamp}</td>
                        <td className={`py-1 px-2 ${oos.type === 'oos_start' ? 'text-red-400' : 'text-green-400'}`}>
                          {oos.type === 'oos_start' ? 'OOS Start' : 'OOS End'}
                        </td>
                        <td className="py-1 px-2 text-gray-400">{oos.domain}</td>
                        <td className="py-1 pl-2 text-right text-gray-400">
                          {oos.durationMs ? formatDuration(oos.durationMs) : oos.type === 'oos_start' ? '' : 'ongoing'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RIL/Modem Errors */}
          {tel.rilErrors.length > 0 && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">RIL/Modem Errors ({tel.rilErrors.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-1 pr-2">Timestamp</th>
                      <th className="text-left py-1 px-2">Error Type</th>
                      <th className="text-left py-1 pl-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tel.rilErrors.slice(0, 20).map((err, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-1 pr-2 text-gray-300 font-mono whitespace-nowrap">{err.timestamp}</td>
                        <td className={`py-1 px-2 whitespace-nowrap ${
                          err.errorType === 'radio_crash' || err.errorType === 'modem_restart'
                            ? 'text-red-400 font-medium' : 'text-amber-400'
                        }`}>
                          {err.errorType}
                        </td>
                        <td className="py-1 pl-2 text-gray-400 truncate max-w-[300px]" title={err.message}>
                          {err.message.slice(0, 120)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tel.rilErrors.length > 20 && (
                  <div className="text-xs text-gray-600 mt-1">...and {tel.rilErrors.length - 20} more</div>
                )}
              </div>
            </div>
          )}

          {/* Call/SMS Events */}
          {hasCallSmsEvents && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-400">Call/SMS Events</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-1 pr-2">Timestamp</th>
                      <th className="text-left py-1 px-2">Type</th>
                      <th className="text-left py-1 pl-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...tel.callEvents, ...tel.smsEvents]
                      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                      .slice(0, 20)
                      .map((evt, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="py-1 pr-2 text-gray-300 font-mono whitespace-nowrap">{evt.timestamp}</td>
                          <td className={`py-1 px-2 whitespace-nowrap ${
                            evt.type === 'call_drop' || evt.type === 'call_fail' || evt.type === 'sms_send_fail'
                              ? 'text-red-400' : 'text-gray-300'
                          }`}>
                            {evt.type.replace(/_/g, ' ')}
                          </td>
                          <td className="py-1 pl-2 text-gray-400">
                            {'failReason' in evt && evt.failReason ? evt.failReason : ''}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Signal & Network Details */}
          {(tel.signalStrength || tel.ratChanges.length > 0 || tel.serviceState) && (
            <div className="bg-surface rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-400">Signal & Network Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                {tel.signalStrength && (
                  <>
                    <div>
                      <span className="text-gray-500">Technology</span>
                      <div className="text-gray-300 font-medium">{tel.signalStrength.technology}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Level</span>
                      <div className={`font-medium ${signalLevelColor(tel.signalStrength.level)}`}>
                        {tel.signalStrength.level}/4
                      </div>
                    </div>
                    {tel.signalStrength.rsrp != null && (
                      <div>
                        <span className="text-gray-500">RSRP</span>
                        <div className="text-gray-300">{tel.signalStrength.rsrp} dBm</div>
                      </div>
                    )}
                    {tel.signalStrength.rsrq != null && (
                      <div>
                        <span className="text-gray-500">RSRQ</span>
                        <div className="text-gray-300">{tel.signalStrength.rsrq} dB</div>
                      </div>
                    )}
                    {tel.signalStrength.sinr != null && (
                      <div>
                        <span className="text-gray-500">SINR</span>
                        <div className="text-gray-300">{tel.signalStrength.sinr} dB</div>
                      </div>
                    )}
                    {tel.signalStrength.rscp != null && (
                      <div>
                        <span className="text-gray-500">RSCP</span>
                        <div className="text-gray-300">{tel.signalStrength.rscp} dBm</div>
                      </div>
                    )}
                    {tel.signalStrength.ecno != null && (
                      <div>
                        <span className="text-gray-500">Ec/No</span>
                        <div className="text-gray-300">{tel.signalStrength.ecno} dB</div>
                      </div>
                    )}
                    {tel.signalStrength.rssi != null && (
                      <div>
                        <span className="text-gray-500">RSSI</span>
                        <div className="text-gray-300">{tel.signalStrength.rssi} dBm</div>
                      </div>
                    )}
                  </>
                )}
                {tel.serviceState?.mccMnc && (
                  <div>
                    <span className="text-gray-500">MCC/MNC</span>
                    <div className="text-gray-300">{tel.serviceState.mccMnc}</div>
                  </div>
                )}
                {tel.serviceState?.rat && (
                  <div>
                    <span className="text-gray-500">RAT</span>
                    <div className="text-gray-300">{tel.serviceState.rat}</div>
                  </div>
                )}
                {tel.ratChanges.length > 0 && (
                  <div>
                    <span className="text-gray-500">RAT Changes</span>
                    <div className={`font-medium ${tel.ratChanges.length >= 5 ? 'text-amber-400' : 'text-gray-300'}`}>
                      {tel.ratChanges.length}
                    </div>
                  </div>
                )}
              </div>

              {/* RAT Change History */}
              {tel.ratChanges.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">RAT Change History</div>
                  <div className="space-y-0.5">
                    {tel.ratChanges.slice(0, 10).map((rc, i) => (
                      <div key={i} className="text-xs flex gap-2">
                        <span className="text-gray-400 font-mono">{rc.timestamp}</span>
                        <span className="text-gray-300">{rc.fromRat} → {rc.toRat}</span>
                      </div>
                    ))}
                    {tel.ratChanges.length > 10 && (
                      <div className="text-xs text-gray-600">...and {tel.ratChanges.length - 10} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
