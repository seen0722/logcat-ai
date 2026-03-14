import { describe, it, expect } from 'vitest';
import {
  parseServiceStateSnapshot,
  parseSignalStrengthSnapshot,
  parseTelephonySections,
} from '../src/telephony-parser.js';
import { LogEntry, BugreportSection } from '../src/types.js';

// Helper to create a LogEntry
function mkEntry(partial: Partial<LogEntry>): LogEntry {
  return {
    timestamp: partial.timestamp ?? '01-01 00:00:00.000',
    pid: partial.pid ?? 1000,
    tid: partial.tid ?? 1000,
    level: partial.level ?? 'I',
    tag: partial.tag ?? 'SST',
    message: partial.message ?? '',
    raw: partial.raw ?? '',
    lineNumber: partial.lineNumber ?? 0,
    buffer: partial.buffer ?? 'radio',
  };
}

// ============================================================
// Task 2: Dumpsys Snapshot Parsing
// ============================================================

describe('parseServiceStateSnapshot', () => {
  it('parses IN_SERVICE state with LTE', () => {
    const content = `
      mServiceState={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE),
        mChannelNumber=-1, duplexMode()=0, mCellBandwidths=[], mOperatorAlphaLong=Chunghwa Telecom,
        mOperatorAlphaShort=CHT, mOperatorNumeric=46692,
        mIsManualNetworkSelection=false(automatic),
        getRilVoiceRadioTechnology=14(LTE),
        getRilDataRadioTechnology=14(LTE),
        mCssIndicator=unsupported, mNetworkId=-1, mSystemId=-1, mCdmaRoamingIndicator=-1,
        mCdmaDefaultRoamingIndicator=-1, mIsEmergencyOnly=false,
        isUsingCarrierAggregation=false, mArfcnRsrpBoost=0,
        mNetworkRegistrationInfos=[NetworkRegistrationInfo{ domain=PS
        roamingType=NOT_ROAMING mRplmn=46692
        Phone Id=0
    `;
    const result = parseServiceStateSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.voiceState).toBe('IN_SERVICE');
    expect(result!.dataState).toBe('IN_SERVICE');
    expect(result!.operator).toBe('Chunghwa Telecom');
    expect(result!.rat).toBe('LTE');
    expect(result!.roaming).toBe(false);
    expect(result!.slotId).toBe(0);
    expect(result!.mccMnc).toBe('46692');
  });

  it('parses OUT_OF_SERVICE state', () => {
    const content = `
      mServiceState={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE),
        mOperatorAlphaLong=,
        getRilVoiceRadioTechnology=0(Unknown),
        roamingType=NOT_ROAMING
        Phone Id=0
    `;
    const result = parseServiceStateSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.voiceState).toBe('OUT_OF_SERVICE');
    expect(result!.dataState).toBe('OUT_OF_SERVICE');
    expect(result!.rat).toBeUndefined();
    expect(result!.operator).toBeUndefined();
  });

  it('returns undefined when no mServiceState found', () => {
    const content = 'Some random dumpsys content without service state';
    const result = parseServiceStateSnapshot(content);
    expect(result).toBeUndefined();
  });
});

describe('parseSignalStrengthSnapshot', () => {
  it('parses LTE signal strength', () => {
    const content = `
      mSignalStrength=SignalStrength:{
        primary=CellSignalStrengthLte: rssi=-89 rsrp=-105 rsrq=-12 rssnr=3 cqi=7 ta=2147483647 level=2 parametersUseForLevel=0
        CellSignalStrengthGsm: rssi=2147483647 ber=2147483647 mTa=2147483647 mLevel=0
        CellSignalStrengthWcdma: ss=2147483647 ber=2147483647 rscp=2147483647 ecno=2147483647 level=0
        CellSignalStrengthNr: csiRsrp=2147483647 csiRsrq=2147483647 csiCqiTableIndex=2147483647 csiCqiReport=[] ssRsrp=2147483647 ssRsrq=2147483647 ssSinr=2147483647 level=0
      }
    `;
    const result = parseSignalStrengthSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.technology).toBe('LTE');
    expect(result!.rsrp).toBe(-105);
    expect(result!.rsrq).toBe(-12);
    expect(result!.sinr).toBe(3);
    expect(result!.level).toBe(2);
  });

  it('filters Integer.MAX_VALUE (2147483647) as undefined for NR', () => {
    const content = `
      mSignalStrength=SignalStrength:{
        primary=CellSignalStrengthNr: csiRsrp=2147483647 csiRsrq=2147483647 csiCqiTableIndex=2147483647 csiCqiReport=[] ssRsrp=-95 ssRsrq=-10 ssSinr=15 level=3
        CellSignalStrengthLte: rssi=2147483647 rsrp=2147483647 rsrq=2147483647 rssnr=2147483647 cqi=2147483647 ta=2147483647 level=0
      }
    `;
    const result = parseSignalStrengthSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.technology).toBe('NR');
    expect(result!.rsrp).toBe(-95);
    expect(result!.rsrq).toBe(-10);
    expect(result!.sinr).toBe(15);
    expect(result!.level).toBe(3);
  });

  it('returns undefined when no mSignalStrength found', () => {
    const content = 'No signal info here';
    const result = parseSignalStrengthSnapshot(content);
    expect(result).toBeUndefined();
  });
});

// ============================================================
// Task 3: Radio Log Event Detection
// ============================================================

describe('OOS detection', () => {
  it('detects OOS start/end pair with duration', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'SST',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)}',
      }),
      mkEntry({
        timestamp: '03-01 10:00:30.000',
        tag: 'SST',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)} newSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(2);
    expect(result.oosEvents[0].type).toBe('oos_start');
    expect(result.oosEvents[0].domain).toBe('both');
    expect(result.oosEvents[1].type).toBe('oos_end');
    expect(result.oosEvents[1].durationMs).toBe(30000);
  });

  it('leaves durationMs undefined when OOS ongoing at end', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'SST',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(1);
    expect(result.oosEvents[0].type).toBe('oos_start');
    expect(result.oosEvents[0].durationMs).toBeUndefined();
  });

  it('detects voice-only OOS domain', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'SST',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=0(IN_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(1);
    expect(result.oosEvents[0].domain).toBe('voice');
  });

  it('ignores non-SST tags', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'DefaultPhoneNotifier',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(0);
  });
});

describe('RIL error detection', () => {
  it('detects E_MODEM_ERR from native RIL', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'RIL',
        level: 'E',
        message: 'sendRequest: E_MODEM_ERR on request SETUP_DATA_CALL',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('modem_err');
    expect(result.rilErrors[0].message).toContain('E_MODEM_ERR');
  });

  it('detects UNSOL_MODEM_RESTART', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'RILJ',
        level: 'E',
        message: 'UNSOL_MODEM_RESTART: silent_reset',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('modem_restart');
  });

  it('detects REQUEST_NOT_SUPPORTED from Java RILJ', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'RILJ',
        level: 'E',
        message: 'CommandException: REQUEST_NOT_SUPPORTED',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('request_not_supported');
  });

  it('detects RADIO_NOT_AVAILABLE', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'RILJ',
        level: 'E',
        message: 'RADIO_NOT_AVAILABLE',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('radio_not_available');
  });
});

describe('RAT change detection', () => {
  it('detects RAT switched from SST tag', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'SST',
        message: '[0] RAT switched LTE -> Unknown at cell -1',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.ratChanges).toHaveLength(1);
    expect(result.ratChanges[0].fromRat).toBe('LTE');
    expect(result.ratChanges[0].toRat).toBe('Unknown');
  });
});

describe('Call event detection', () => {
  it('detects call drop from GsmCallTracker', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'GsmCallTracker',
        message: 'call drop detected DISCONNECTED LOST_SIGNAL',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.callEvents).toHaveLength(1);
    expect(result.callEvents[0].type).toBe('call_drop');
  });

  it('detects call start/end from ImsCallSession', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'ImsCallSession',
        message: 'Dialing MO call',
      }),
      mkEntry({
        timestamp: '03-01 10:05:00.000',
        tag: 'ImsCallSession',
        message: 'DISCONNECTED call ended normally',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.callEvents).toHaveLength(2);
    expect(result.callEvents[0].type).toBe('call_start');
    expect(result.callEvents[1].type).toBe('call_end');
  });

  it('ignores non-call tags', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'ActivityManager',
        message: 'Dialing MO call',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.callEvents).toHaveLength(0);
  });

  it('never populates number field (PII)', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'GsmCallTracker',
        message: 'Dialing +886912345678 MO call',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.callEvents).toHaveLength(1);
    expect(result.callEvents[0].number).toBeUndefined();
  });
});

describe('SMS event detection', () => {
  it('detects SMS send failure from SMSDispatcher', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'SMSDispatcher',
        message: 'SMS send failed: error sending message',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.smsEvents).toHaveLength(1);
    expect(result.smsEvents[0].type).toBe('sms_send_fail');
  });

  it('ignores SIM_STATE_CHANGED broadcast from SMSDispatcher', () => {
    const entries: LogEntry[] = [
      mkEntry({
        timestamp: '03-01 10:00:00.000',
        tag: 'SMSDispatcher',
        message: 'Received SIM_STATE_CHANGED broadcast',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.smsEvents).toHaveLength(0);
  });
});
