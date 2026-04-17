import { useState } from 'react';
import { TelephonyParseResult, RilError } from '../../lib/types';
import { signalLevelColor, formatDuration } from './telephony-utils';

interface TelephonyDetailsProps {
  tel: TelephonyParseResult;
}

export default function TelephonyDetails({ tel }: TelephonyDetailsProps) {
  const dnPeriods = tel.dataNetworkOosPeriods ?? [];
  const hasCallSmsEvents = tel.callEvents.length > 0 || tel.smsEvents.length > 0;

  return (
    <div className="space-y-4">
      {/* OOS Event History -- from DataNetworkController Local logs */}
      {dnPeriods.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-display text-base text-gray-200">
            OOS Event History
            <span className="ml-2 text-xs font-normal text-accent">(DataNetwork — dumpsys phone)</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
                  <th className="text-left py-1.5 pr-2">#</th>
                  <th className="text-left py-1.5 px-2">Disconnected</th>
                  <th className="text-left py-1.5 px-2">Reconnected</th>
                  <th className="text-left py-1.5 px-2">Cause</th>
                  <th className="text-right py-1.5 pl-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {dnPeriods.map((p, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
                    <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                    <td className="py-1.5 px-2 text-red-400 font-mono whitespace-nowrap">
                      {p.disconnectedAt.replace('T', ' ').slice(5, 19)}
                    </td>
                    <td className="py-1.5 px-2 text-green-400 font-mono whitespace-nowrap">
                      {p.connectedAt ? p.connectedAt.replace('T', ' ').slice(5, 19) : <span className="text-amber-400">ongoing</span>}
                    </td>
                    <td className="py-1.5 px-2 text-gray-500 truncate max-w-[200px]" title={p.cause}>
                      {p.cause?.replace(/\([^)]*\)/g, '').trim() || '\u2014'}
                    </td>
                    <td className={`py-1.5 pl-2 text-right font-mono ${
                      p.durationMs && p.durationMs >= 300_000 ? 'text-red-400 font-semibold'
                      : p.durationMs && p.durationMs >= 30_000 ? 'text-warm'
                      : 'text-gray-400'
                    }`}>
                      {p.durationMs ? formatDuration(p.durationMs) : '\u2014'}
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
        <RilErrorsTable errors={tel.rilErrors} />
      )}

      {/* Call/SMS Events */}
      {hasCallSmsEvents && (
        <div className="card space-y-3">
          <h3 className="font-display text-base text-gray-200">Call/SMS Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
                  <th className="text-left py-1.5 pr-2">Timestamp</th>
                  <th className="text-left py-1.5 px-2">Type</th>
                  <th className="text-left py-1.5 pl-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {[...tel.callEvents, ...tel.smsEvents]
                  .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                  .slice(0, 20)
                  .map((evt, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
                      <td className="py-1.5 pr-2 text-gray-300 font-mono whitespace-nowrap">{evt.timestamp}</td>
                      <td className={`py-1.5 px-2 whitespace-nowrap ${
                        evt.type === 'call_drop' || evt.type === 'call_fail' || evt.type === 'sms_send_fail'
                          ? 'text-red-400' : 'text-gray-300'
                      }`}>
                        {evt.type.replace(/_/g, ' ')}
                      </td>
                      <td className="py-1.5 pl-2 text-gray-400">
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
        <div className="card space-y-3">
          <h3 className="font-display text-base text-gray-200">Signal &amp; Network Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            {tel.signalStrength && (
              <>
                <div>
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Technology</span>
                  <div className="text-gray-300 font-medium mt-0.5">{tel.signalStrength.technology}</div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Level</span>
                  <div className={`font-medium mt-0.5 ${signalLevelColor(tel.signalStrength.level)}`}>
                    {tel.signalStrength.level}/4
                  </div>
                </div>
                {tel.signalStrength.rsrp != null && (
                  <div>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">RSRP</span>
                    <div className="text-gray-300 font-mono mt-0.5">{tel.signalStrength.rsrp} dBm</div>
                  </div>
                )}
                {tel.signalStrength.rsrq != null && (
                  <div>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">RSRQ</span>
                    <div className="text-gray-300 font-mono mt-0.5">{tel.signalStrength.rsrq} dB</div>
                  </div>
                )}
                {tel.signalStrength.sinr != null && (
                  <div>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">SINR</span>
                    <div className="text-gray-300 font-mono mt-0.5">{tel.signalStrength.sinr} dB</div>
                  </div>
                )}
                {tel.signalStrength.rscp != null && (
                  <div>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">RSCP</span>
                    <div className="text-gray-300 font-mono mt-0.5">{tel.signalStrength.rscp} dBm</div>
                  </div>
                )}
                {tel.signalStrength.ecno != null && (
                  <div>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">Ec/No</span>
                    <div className="text-gray-300 font-mono mt-0.5">{tel.signalStrength.ecno} dB</div>
                  </div>
                )}
                {tel.signalStrength.rssi != null && (
                  <div>
                    <span className="text-[10px] text-gray-600 uppercase tracking-wider">RSSI</span>
                    <div className="text-gray-300 font-mono mt-0.5">{tel.signalStrength.rssi} dBm</div>
                  </div>
                )}
              </>
            )}
            {tel.serviceState?.mccMnc && (
              <div>
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">MCC/MNC</span>
                <div className="text-gray-300 font-mono mt-0.5">{tel.serviceState.mccMnc}</div>
              </div>
            )}
            {tel.serviceState?.rat && (
              <div>
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">RAT</span>
                <div className="text-gray-300 mt-0.5">{tel.serviceState.rat}</div>
              </div>
            )}
            {tel.ratChanges.length > 0 && (
              <div>
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">RAT Changes</span>
                <div className={`font-medium mt-0.5 ${tel.ratChanges.length >= 5 ? 'text-warm' : 'text-gray-300'}`}>
                  {tel.ratChanges.length}
                </div>
              </div>
            )}
          </div>

          {/* RAT Change History */}
          {tel.ratChanges.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">RAT Change History</div>
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
  );
}

// -- RIL Errors Table with full message display --

const INITIAL_SHOW = 20;

function RilErrorsTable({ errors }: { errors: RilError[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? errors : errors.slice(0, INITIAL_SHOW);
  const hasMore = errors.length > INITIAL_SHOW;

  return (
    <div className="card space-y-3">
      <h3 className="font-display text-base text-gray-200">RIL/Modem Errors ({errors.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
              <th className="text-left py-1.5 pr-2">Timestamp</th>
              <th className="text-left py-1.5 px-2">Error Type</th>
              <th className="text-left py-1.5 pl-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((err, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors align-top">
                <td className="py-1.5 pr-2 text-gray-300 font-mono whitespace-nowrap">{err.timestamp}</td>
                <td className={`py-1.5 px-2 whitespace-nowrap ${
                  err.errorType === 'radio_crash' || err.errorType === 'modem_restart'
                    ? 'text-red-400 font-medium' : 'text-warm'
                }`}>
                  {err.errorType}
                </td>
                <td className="py-1.5 pl-2 text-gray-400 font-mono break-all">{err.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasMore && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowAll(!showAll); }}
            className="mt-2 text-xs text-accent hover:text-accent-light transition-colors"
          >
            {showAll ? 'Show less' : `Show all ${errors.length} errors`}
          </button>
        )}
      </div>
    </div>
  );
}
