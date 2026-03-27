import { useState } from 'react';
import { TelephonyParseResult, PowerParseResult, RilError } from '../lib/types';
import { IconSignal, IconNoService, IconWarningTriangle, IconAntenna, IconChevronDown } from './Icons';

interface Props {
  telephonyStatus: TelephonyParseResult;
  powerStatus?: PowerParseResult;
}

function voiceStateBadge(state: string): { color: string; label: string } {
  switch (state) {
    case 'IN_SERVICE': return { color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'In Service' };
    case 'OUT_OF_SERVICE': return { color: 'bg-red-500/10 text-red-300 border-red-500/20', label: 'Out of Service' };
    case 'EMERGENCY_ONLY': return { color: 'bg-amber-500/10 text-amber-300 border-amber-500/20', label: 'Emergency Only' };
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

function MetricCard({ label, value, sub, color, icon, highlight }: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-xl p-4 space-y-1 border ${highlight ? 'border-red-500/30' : 'border-border/50'}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color || 'text-gray-200'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600">{sub}</div>}
    </div>
  );
}

export default function TelephonyOverview({ telephonyStatus, powerStatus }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const tel = telephonyStatus;

  // OOS data: RAT distribution for time/%, DataNetwork events for count
  const ratOos = powerStatus?.connectivityStats?.cellularRatDistribution?.find(e => e.rat === 'oos');
  const dnPeriods = tel.dataNetworkOosPeriods ?? [];
  const oosCount = dnPeriods.length;
  const totalOosMs = ratOos ? ratOos.timeMs
    : dnPeriods.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
  const oosPercentage = ratOos?.percentage;
  const hasOosData = ratOos !== undefined || dnPeriods.length > 0;
  // Legacy fallback references
  const dumpsysPeriods = tel.dumpsysOosPeriods ?? [];
  const hasDumpsysData = dumpsysPeriods.length > 0;

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

  const isOos = tel.serviceState?.voiceState === 'OUT_OF_SERVICE';

  return (
    <div className="space-y-4">
      {/* ── Hero Card ── */}
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

            {/* OOS — only show when we have data */}
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
        </div>
      </div>

      {/* ── Show details toggle ── */}
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

      {/* ── Detailed sections - collapsible ── */}
      {showDetails && (
        <div className="space-y-4">
          {/* OOS Event History — prefer dumpsys (full uptime) over radio log */}
          {(hasDumpsysData || tel.oosEvents.length > 0) && (
            <div className="card space-y-3">
              <h3 className="font-display text-base text-gray-200">
                OOS Event History
                {hasDumpsysData && (
                  <span className="ml-2 text-xs font-normal text-accent">(dumpsys — full uptime)</span>
                )}
              </h3>
              <div className="overflow-x-auto">
                {hasDumpsysData ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
                        <th className="text-left py-1.5 pr-2">#</th>
                        <th className="text-left py-1.5 px-2">OOS Start</th>
                        <th className="text-left py-1.5 px-2">OOS End</th>
                        <th className="text-right py-1.5 pl-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dumpsysPeriods.map((p, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
                          <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                          <td className="py-1.5 px-2 text-red-400 font-mono whitespace-nowrap">
                            {p.start.replace('T', ' ').slice(5, 19)}
                          </td>
                          <td className="py-1.5 px-2 text-green-400 font-mono whitespace-nowrap">
                            {p.end ? p.end.replace('T', ' ').slice(5, 19) : <span className="text-amber-400">ongoing</span>}
                          </td>
                          <td className="py-1.5 pl-2 text-right text-gray-400">
                            {p.durationMs ? formatDuration(p.durationMs) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-600 uppercase tracking-wider border-b border-border/50">
                        <th className="text-left py-1.5 pr-2">Timestamp</th>
                        <th className="text-left py-1.5 px-2">Type</th>
                        <th className="text-left py-1.5 px-2">Domain</th>
                        <th className="text-right py-1.5 pl-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tel.oosEvents.map((oos, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
                          <td className="py-1.5 pr-2 text-gray-300 font-mono whitespace-nowrap">{oos.timestamp}</td>
                          <td className={`py-1.5 px-2 ${oos.type === 'oos_start' ? 'text-red-400' : 'text-green-400'}`}>
                            {oos.type === 'oos_start' ? 'OOS Start' : 'OOS End'}
                          </td>
                          <td className="py-1.5 px-2 text-gray-400">{oos.domain}</td>
                          <td className="py-1.5 pl-2 text-right text-gray-400">
                            {oos.durationMs ? formatDuration(oos.durationMs) : oos.type === 'oos_start' ? '' : 'ongoing'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
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
      )}
    </div>
  );
}

// ── RIL Errors Table with full message display ──

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
