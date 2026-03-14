import {
  TelephonyParseResult,
  ServiceStateSnapshot,
  SignalStrengthSnapshot,
  OosEvent,
  RilError,
  CallEvent,
  SmsEvent,
  RatChangeEvent,
  BugreportSection,
  LogEntry,
} from './types.js';

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Parse telephony-related sections from bugreport and radio logcat entries.
 */
export function parseTelephonySections(
  sections: BugreportSection[],
  radioLogEntries?: LogEntry[],
): TelephonyParseResult {
  const result: TelephonyParseResult = {
    oosEvents: [],
    rilErrors: [],
    callEvents: [],
    smsEvents: [],
    ratChanges: [],
    simSlotCount: 1,
  };

  // Parse dumpsys sections for snapshot data
  for (const section of sections) {
    if (section.content.includes('mServiceState=')) {
      const ss = parseServiceStateSnapshot(section.content);
      if (ss && !result.serviceState) {
        result.serviceState = ss;
      }
    }
    if (section.content.includes('mSignalStrength=SignalStrength:')) {
      const sig = parseSignalStrengthSnapshot(section.content);
      if (sig && !result.signalStrength) {
        result.signalStrength = sig;
      }
    }
  }

  // Parse radio log entries for events
  if (radioLogEntries && radioLogEntries.length > 0) {
    result.oosEvents = detectOosEvents(radioLogEntries);
    result.rilErrors = detectRilErrors(radioLogEntries);
    result.ratChanges = detectRatChanges(radioLogEntries);
    result.callEvents = detectCallEvents(radioLogEntries);
    result.smsEvents = detectSmsEvents(radioLogEntries);
  }

  return result;
}

// ============================================================
// ServiceState Snapshot (DUMPSYS TELEPHONY)
// ============================================================

const REG_STATE_MAP: Record<string, ServiceStateSnapshot['voiceState']> = {
  'IN_SERVICE': 'IN_SERVICE',
  'OUT_OF_SERVICE': 'OUT_OF_SERVICE',
  'EMERGENCY_ONLY': 'EMERGENCY_ONLY',
  'POWER_OFF': 'POWER_OFF',
};

/**
 * Parse ServiceState from dumpsys telephony or dumpsys phone content.
 */
export function parseServiceStateSnapshot(content: string): ServiceStateSnapshot | undefined {
  const stateMatch = content.match(
    /mServiceState=\{mVoiceRegState=\d+\((\w+)\),\s*mDataRegState=\d+\((\w+)\)/
  );
  if (!stateMatch) return undefined;

  const voiceState = REG_STATE_MAP[stateMatch[1]] ?? 'OUT_OF_SERVICE';
  const dataState = REG_STATE_MAP[stateMatch[2]] ?? 'OUT_OF_SERVICE';

  // Operator
  const opMatch = content.match(/mOperatorAlphaLong=([^,\n]+)/);
  const operator = opMatch?.[1]?.trim() || undefined;

  // RAT
  const ratMatch = content.match(/getRilVoiceRadioTechnology=\d+\((\w+)\)/);
  const rawRat = ratMatch?.[1];
  const rat = rawRat && rawRat !== 'Unknown' ? rawRat : undefined;

  // MCC/MNC: prefer rRplmn, fallback to mMcc/mMnc
  let mccMnc: string | undefined;
  const rplmnMatch = content.match(/[mR]?[Rr][Pp]lmn=(\d{5,6})/);
  if (rplmnMatch) {
    mccMnc = rplmnMatch[1];
  } else {
    const mccMatch = content.match(/mMcc=(\d+)/);
    const mncMatch = content.match(/mMnc=(\d+)/);
    if (mccMatch && mncMatch) {
      mccMnc = mccMatch[1] + mncMatch[1];
    }
  }

  // Roaming
  const roamingMatch = content.match(/roamingType=(\w+)/);
  const roaming = roamingMatch ? roamingMatch[1] !== 'NOT_ROAMING' : false;

  // SlotId
  const slotMatch = content.match(/Phone Id=(\d+)/);
  const slotId = slotMatch ? parseInt(slotMatch[1], 10) : 0;

  return {
    slotId,
    voiceState,
    dataState,
    operator,
    mccMnc,
    rat,
    roaming,
  };
}

// ============================================================
// SignalStrength Snapshot
// ============================================================

const INT_MAX = 2147483647;

function filterIntMax(value: number): number | undefined {
  return value === INT_MAX ? undefined : value;
}

/**
 * Parse SignalStrength from dumpsys content.
 */
export function parseSignalStrengthSnapshot(content: string): SignalStrengthSnapshot | undefined {
  const sigMatch = content.match(/mSignalStrength=SignalStrength:\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);
  if (!sigMatch) return undefined;

  const sigContent = sigMatch[1];

  // Determine primary technology
  const primaryMatch = sigContent.match(/primary=CellSignalStrength(\w+):/);
  if (!primaryMatch) return undefined;

  const techName = primaryMatch[1]; // Lte, Nr, Wcdma, Gsm, Cdma
  const techMap: Record<string, SignalStrengthSnapshot['technology']> = {
    'Lte': 'LTE',
    'Nr': 'NR',
    'Wcdma': 'WCDMA',
    'Gsm': 'GSM',
    'Cdma': 'CDMA',
  };

  const technology = techMap[techName];
  if (!technology) return undefined;

  // Extract the primary line
  const primaryLineMatch = sigContent.match(new RegExp(`primary=CellSignalStrength${techName}:\\s*([^\\n]+)`));
  if (!primaryLineMatch) return undefined;
  const primaryLine = primaryLineMatch[1];

  // Parse level
  const levelMatch = primaryLine.match(/level=(\d+)/);
  const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;

  const result: SignalStrengthSnapshot = {
    slotId: 0,
    technology,
    level,
  };

  // Parse technology-specific fields
  const getVal = (key: string): number | undefined => {
    const m = primaryLine.match(new RegExp(`${key}=(-?\\d+)`));
    if (!m) return undefined;
    return filterIntMax(parseInt(m[1], 10));
  };

  switch (technology) {
    case 'LTE':
      result.rsrp = getVal('rsrp');
      result.rsrq = getVal('rsrq');
      result.sinr = getVal('rssnr');
      result.rssi = getVal('rssi');
      break;
    case 'NR':
      result.rsrp = getVal('ssRsrp');
      result.rsrq = getVal('ssRsrq');
      result.sinr = getVal('ssSinr');
      break;
    case 'WCDMA':
      result.rscp = getVal('rscp');
      result.ecno = getVal('ecno');
      result.rssi = getVal('ss');
      break;
    case 'GSM':
      result.rssi = getVal('rssi');
      break;
    case 'CDMA':
      result.rssi = getVal('cdmaDbm');
      result.ecno = getVal('cdmaEcio');
      break;
  }

  return result;
}

// ============================================================
// OOS (Out of Service) Event Detection
// ============================================================

function parseTimestampToMs(ts: string): number {
  // Format: "MM-DD HH:mm:ss.SSS"
  const m = ts.match(/(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return 0;
  const [, month, day, hour, min, sec, ms] = m;
  // Use a fixed year — we only care about differences
  return new Date(2026, parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec), parseInt(ms)).getTime();
}

function detectOosEvents(entries: LogEntry[]): OosEvent[] {
  const events: OosEvent[] = [];
  let oosStartTimestamp: string | undefined;

  const OOS_PATTERN = /\[\d+\] Poll ServiceState done:.*?oldSS=\{mVoiceRegState=\d+\((\w+)\),\s*mDataRegState=\d+\((\w+)\)\}.*?newSS=\{mVoiceRegState=\d+\((\w+)\),\s*mDataRegState=\d+\((\w+)\)\}/;

  for (const entry of entries) {
    if (entry.tag.trim() !== 'SST') continue;

    const match = entry.message.match(OOS_PATTERN);
    if (!match) continue;

    const [, oldVoice, oldData, newVoice, newData] = match;

    const wasOos = oldVoice === 'OUT_OF_SERVICE' || oldData === 'OUT_OF_SERVICE';
    const isOos = newVoice === 'OUT_OF_SERVICE' || newData === 'OUT_OF_SERVICE';
    const wasInService = oldVoice === 'IN_SERVICE' && oldData === 'IN_SERVICE';
    const isInService = newVoice === 'IN_SERVICE' && newData === 'IN_SERVICE';

    if (!wasOos && isOos) {
      // Transition to OOS
      const domain = (newVoice === 'OUT_OF_SERVICE' && newData === 'OUT_OF_SERVICE')
        ? 'both'
        : newVoice === 'OUT_OF_SERVICE' ? 'voice' : 'data';

      oosStartTimestamp = entry.timestamp;
      events.push({
        timestamp: entry.timestamp,
        type: 'oos_start',
        domain,
      });
    } else if (wasOos && isInService && oosStartTimestamp) {
      // Transition back to service
      const durationMs = parseTimestampToMs(entry.timestamp) - parseTimestampToMs(oosStartTimestamp);
      events.push({
        timestamp: entry.timestamp,
        type: 'oos_end',
        domain: 'both',
        durationMs,
      });
      oosStartTimestamp = undefined;
    }
  }

  return events;
}

// ============================================================
// RIL Error Detection
// ============================================================

const RIL_TAGS = new Set(['RIL', 'RILJ', 'RilRequest']);

interface RilErrorRule {
  errorType: RilError['errorType'];
  pattern: RegExp;
  tags: Set<string>;
}

const RIL_ERROR_RULES: RilErrorRule[] = [
  { errorType: 'modem_restart', pattern: /UNSOL_MODEM_RESTART|modem.*restart|baseband.*reset/i, tags: new Set(['RILJ']) },
  { errorType: 'radio_crash', pattern: /Radio.*crash|RILD.*died/i, tags: new Set(['RIL', 'RILJ']) },
  { errorType: 'ril_restart', pattern: /RIL.*restart|rild.*start/i, tags: new Set(['RIL']) },
  { errorType: 'modem_err', pattern: /E_MODEM_ERR|CommandException:\s*MODEM_ERR/, tags: new Set(['RIL', 'RILJ']) },
  { errorType: 'timeout', pattern: /RIL_REQUEST_TIMED_OUT|TIMEOUT/, tags: new Set(['RIL', 'RILJ']) },
  { errorType: 'request_not_supported', pattern: /E_REQUEST_NOT_SUPPORTED|CommandException:\s*REQUEST_NOT_SUPPORTED/, tags: new Set(['RIL', 'RILJ', 'RilRequest']) },
  { errorType: 'radio_not_available', pattern: /RADIO_NOT_AVAILABLE/, tags: new Set(['RILJ', 'RilRequest']) },
];

function detectRilErrors(entries: LogEntry[]): RilError[] {
  const errors: RilError[] = [];

  for (const entry of entries) {
    const trimmedTag = entry.tag.trim();
    if (!RIL_TAGS.has(trimmedTag)) continue;

    for (const rule of RIL_ERROR_RULES) {
      if (!rule.tags.has(trimmedTag)) continue;
      if (rule.pattern.test(entry.message)) {
        errors.push({
          timestamp: entry.timestamp,
          errorType: rule.errorType,
          message: entry.message,
        });
        break; // first match wins
      }
    }
  }

  return errors;
}

// ============================================================
// RAT Change Detection
// ============================================================

function detectRatChanges(entries: LogEntry[]): RatChangeEvent[] {
  const changes: RatChangeEvent[] = [];
  const RAT_PATTERN = /\[\d+\] RAT switched (\w+) -> (\w+) at cell/;

  for (const entry of entries) {
    if (entry.tag.trim() !== 'SST') continue;

    const match = entry.message.match(RAT_PATTERN);
    if (match) {
      changes.push({
        timestamp: entry.timestamp,
        fromRat: match[1],
        toRat: match[2],
      });
    }
  }

  return changes;
}

// ============================================================
// Call Event Detection
// ============================================================

const CALL_TAGS = new Set(['GsmCallTracker', 'ImsCallSession', 'Telephony', 'ImsPhoneCallTracker']);

function detectCallEvents(entries: LogEntry[]): CallEvent[] {
  const events: CallEvent[] = [];

  for (const entry of entries) {
    const trimmedTag = entry.tag.trim();
    if (!CALL_TAGS.has(trimmedTag)) continue;

    const msg = entry.message;

    if (/call.*drop|drop.*call|DISCONNECTED.*LOST_SIGNAL|DISCONNECTED.*ERROR/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'call_drop' });
    } else if (/call.*fail|ORIGINATION.*FAILED/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'call_fail' });
    } else if (/Dialing|MO.*call|outgoing.*call/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'call_start' });
    } else if (/DISCONNECTED|call.*ended|hangup/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'call_end' });
    }
  }

  return events;
}

// ============================================================
// SMS Event Detection
// ============================================================

const SMS_TAGS = new Set(['SmsTracker', 'ImsSms', 'SMSDispatcher', 'InboundSmsHandler']);

function detectSmsEvents(entries: LogEntry[]): SmsEvent[] {
  const events: SmsEvent[] = [];

  for (const entry of entries) {
    const trimmedTag = entry.tag.trim();
    if (!SMS_TAGS.has(trimmedTag)) continue;

    const msg = entry.message;

    // Ignore SIM_STATE_CHANGED broadcasts
    if (/SIM_STATE_CHANGED/i.test(msg)) continue;

    if (/send.*fail|SMS.*fail|error.*sending/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'sms_send_fail' });
    } else if (/SMS.*sent|send.*success/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'sms_send_success' });
    } else if (/new.*SMS|SMS.*received|incoming.*message/i.test(msg)) {
      events.push({ timestamp: entry.timestamp, type: 'sms_receive' });
    }
  }

  return events;
}
