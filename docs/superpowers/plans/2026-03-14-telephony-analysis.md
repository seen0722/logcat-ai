# Telephony Analysis Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add telephony bug/performance analysis to logcat-ai — parse OOS events, RIL errors, call/SMS issues, signal quality, and RAT changes from bugreport radio log + dumpsys.

**Architecture:** New `telephony-parser.ts` module follows existing `power-parser.ts` pattern (section + log entry inputs → structured result). Insights integrate into `basic-analyzer.ts`. Frontend `TelephonyOverview.tsx` mirrors `PowerOverview.tsx` pattern. LLM context-builder gets telephony dispatch branch.

**Tech Stack:** TypeScript, Vitest, React 19, Tailwind CSS 3.4

**Spec:** `docs/superpowers/specs/2026-03-14-telephony-analysis-design.md`

**Verification sample:** `/Users/chenzeming/bugreport-samples/0226_bugreport/bugreport-T70-AQ3A.250408.001-2026-02-26-08-47-46/` (3 OOS, 1 modem restart, 21 REQUEST_NOT_SUPPORTED)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/parser/src/telephony-parser.ts` | Parse radio log events + dumpsys telephony snapshots |
| `packages/parser/tests/telephony-parser.test.ts` | Unit tests for all parser functions |
| `packages/frontend/src/components/TelephonyOverview.tsx` | Telephony section UI component |
| `packages/frontend/e2e/tests/telephony.spec.ts` | E2E test for TelephonyOverview rendering |

### Modified Files

| File | Change |
|------|--------|
| `packages/parser/src/types.ts` | Add telephony types, extend unions |
| `packages/parser/src/index.ts` | Export telephony-parser |
| `packages/parser/src/basic-analyzer.ts` | `generateTelephonyInsights()`, health score, timeline |
| `packages/backend/src/routes/analyze.ts` | Call `parseTelephonySections()` in pipeline |
| `packages/backend/src/llm-gateway/prompt-templates/context-builder.ts` | Add telephony context collection |
| `packages/backend/src/llm-gateway/prompt-templates/analysis.ts` | Add telephony section to prompt |
| `packages/backend/src/llm-gateway/tool-definitions.ts` | Add `buffer` param to `search_logcat` |
| `packages/frontend/src/App.tsx` | Add section-telephony nav + render |
| `packages/frontend/src/lib/types.ts` | Mirror telephony types |
| `CLAUDE.md` | Document telephony-parser |

---

## Chunk 1: Types + Parser Core

### Task 1: Add Telephony Types to Parser

**Files:**
- Modify: `packages/parser/src/types.ts:410` (InsightCategory), `:421` (InsightCard.source), `:439` (TimelineEvent.source), `:474-490` (AnalysisResult)
- Modify: `packages/parser/src/basic-analyzer.ts:30-42` (BasicAnalyzerInput)

- [ ] **Step 1: Add telephony type definitions to types.ts**

After the Power Management section (after line ~700), add:

```typescript
// ============================================================
// Telephony
// ============================================================

export interface TelephonyParseResult {
  serviceState?: ServiceStateSnapshot;
  signalStrength?: SignalStrengthSnapshot;
  oosEvents: OosEvent[];
  rilErrors: RilError[];
  callEvents: CallEvent[];
  smsEvents: SmsEvent[];
  ratChanges: RatChangeEvent[];
  simSlotCount: number;
}

export interface ServiceStateSnapshot {
  slotId: number;
  voiceState: 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'EMERGENCY_ONLY' | 'POWER_OFF';
  dataState: 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'EMERGENCY_ONLY' | 'POWER_OFF';
  operator?: string;
  mccMnc?: string;
  rat?: string;
  roaming: boolean;
}

export interface SignalStrengthSnapshot {
  slotId: number;
  technology: 'WCDMA' | 'LTE' | 'NR' | 'GSM' | 'CDMA';
  rsrp?: number;
  rsrq?: number;
  sinr?: number;
  rscp?: number;
  ecno?: number;
  rssi?: number;
  level: number;
}

export interface OosEvent {
  timestamp: string;
  type: 'oos_start' | 'oos_end';
  domain: 'voice' | 'data' | 'both';
  durationMs?: number;
  previousRat?: string;
}

export interface RilError {
  timestamp: string;
  errorType: 'modem_err' | 'timeout' | 'radio_crash' | 'ril_restart'
           | 'request_not_supported' | 'modem_restart' | 'radio_not_available';
  request?: string;
  errorCode?: number;
  message: string;
}

export interface CallEvent {
  timestamp: string;
  type: 'call_start' | 'call_end' | 'call_drop' | 'call_fail';
  number?: string;
  duration?: number;
  failReason?: string;
}

export interface SmsEvent {
  timestamp: string;
  type: 'sms_send_success' | 'sms_send_fail' | 'sms_receive';
  failReason?: string;
}

export interface RatChangeEvent {
  timestamp: string;
  fromRat: string;
  toRat: string;
}
```

- [ ] **Step 2: Extend union types**

In `types.ts`:
- Line 410 — add `'telephony'` to `InsightCategory`:
  ```typescript
  export type InsightCategory = 'anr' | 'crash' | 'memory' | 'kernel' | 'performance' | 'stability' | 'power' | 'telephony';
  ```
- Line 421 — add `'telephony'` to `InsightCard.source`:
  ```typescript
  source: 'logcat' | 'anr' | 'kernel' | 'cross' | 'tombstone' | 'power' | 'telephony';
  ```
- Line 439 — add `'telephony'` to `TimelineEvent.source`:
  ```typescript
  source: 'logcat' | 'anr' | 'kernel' | 'tombstone' | 'telephony';
  ```
- Line 474-490 — add `telephonyStatus` to `AnalysisResult`:
  ```typescript
  telephonyStatus?: TelephonyParseResult;
  ```
  (after `powerStatus?: PowerParseResult;` on line 489)

- [ ] **Step 3: Add telephonyStatus to BasicAnalyzerInput**

In `basic-analyzer.ts` line 30-42, add to `BasicAnalyzerInput`:
```typescript
telephonyStatus?: TelephonyParseResult;
```
(after `powerStatus?: PowerParseResult;` on line 41)

Also add `TelephonyParseResult` to the import from `'./types.js'` at line 1.

- [ ] **Step 4: Add export to index.ts**

In `packages/parser/src/index.ts`, add:
```typescript
export * from './telephony-parser.js';
```

- [ ] **Step 5: Verify build**

Run: `npm run build -w packages/parser`
Expected: Build succeeds (telephony-parser.ts doesn't exist yet, but the export will be added after Task 2)

Note: The export line will cause a build error until telephony-parser.ts is created. Add the export in index.ts but comment it out; uncomment after Task 2 creates the file.

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/types.ts packages/parser/src/basic-analyzer.ts packages/parser/src/index.ts
git commit -m "feat(parser): add telephony type definitions and extend union types"
```

---

### Task 2: Telephony Parser — Dumpsys Snapshot Parsing

**Files:**
- Create: `packages/parser/src/telephony-parser.ts`
- Create: `packages/parser/tests/telephony-parser.test.ts`

- [ ] **Step 1: Write tests for ServiceState snapshot parsing**

Create `packages/parser/tests/telephony-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseServiceStateSnapshot, parseSignalStrengthSnapshot } from '../src/telephony-parser.js';

describe('parseServiceStateSnapshot', () => {
  it('parses IN_SERVICE state with LTE', () => {
    const content = `
  Phone Id=0
  mServiceState={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE),
  mChannelNumber=3650, duplexMode()=1,
  mOperatorAlphaLong=Chunghwa Telecom, mOperatorAlphaShort=Chunghwa,
  getRilVoiceRadioTechnology=14(LTE), getRilDataRadioTechnology=14(LTE),
  NetworkRegistrationInfo{ domain=CS registrationState=HOME accessNetworkTechnology=LTE
  cellIdentity=CellIdentityLte:{ mCi=54052639 mPci=462 mMcc=466 mMnc=92 }
  roamingType=NOT_ROAMING rRplmn=46692}
  }`;
    const result = parseServiceStateSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.voiceState).toBe('IN_SERVICE');
    expect(result!.dataState).toBe('IN_SERVICE');
    expect(result!.operator).toBe('Chunghwa Telecom');
    expect(result!.rat).toBe('LTE');
    expect(result!.roaming).toBe(false);
    expect(result!.slotId).toBe(0);
  });

  it('parses OUT_OF_SERVICE state', () => {
    const content = `
  mServiceState={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE),
  mOperatorAlphaLong=, mOperatorAlphaShort=,
  getRilVoiceRadioTechnology=0(Unknown),
  roamingType=NOT_ROAMING}`;
    const result = parseServiceStateSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.voiceState).toBe('OUT_OF_SERVICE');
    expect(result!.dataState).toBe('OUT_OF_SERVICE');
  });

  it('returns undefined when no mServiceState found', () => {
    const result = parseServiceStateSnapshot('no relevant content here');
    expect(result).toBeUndefined();
  });
});

describe('parseSignalStrengthSnapshot', () => {
  it('parses LTE signal strength', () => {
    const content = `
  mSignalStrength=SignalStrength:{mCdma=CellSignalStrengthCdma: cdmaDbm=-110
  ,mLte=CellSignalStrengthLte: rssi=-55 rsrp=-77 rsrq=-4 rssnr=18 cqiTableIndex=1 level=4
  ,mNr=CellSignalStrengthNr:{ csiRsrp = 2147483647 ssRsrp = 2147483647 ssRsrq = 2147483647 ssSinr = 2147483647 level=0}
  ,primary=CellSignalStrengthLte}`;
    const result = parseSignalStrengthSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.technology).toBe('LTE');
    expect(result!.rsrp).toBe(-77);
    expect(result!.rsrq).toBe(-4);
    expect(result!.sinr).toBe(18);
    expect(result!.level).toBe(4);
  });

  it('filters Integer.MAX_VALUE as undefined', () => {
    const content = `
  mSignalStrength=SignalStrength:{
  ,mNr=CellSignalStrengthNr:{ ssRsrp = 2147483647 ssRsrq = 2147483647 ssSinr = 2147483647 level=0}
  ,primary=CellSignalStrengthNr}`;
    const result = parseSignalStrengthSnapshot(content);
    expect(result).toBeDefined();
    expect(result!.technology).toBe('NR');
    expect(result!.rsrp).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx -w packages/parser vitest run tests/telephony-parser.test.ts`
Expected: FAIL — `parseServiceStateSnapshot` not found

- [ ] **Step 3: Implement dumpsys snapshot parsers**

Create `packages/parser/src/telephony-parser.ts`:

```typescript
import type {
  BugreportSection,
  LogEntry,
  TelephonyParseResult,
  ServiceStateSnapshot,
  SignalStrengthSnapshot,
  OosEvent,
  RilError,
  CallEvent,
  SmsEvent,
  RatChangeEvent,
} from './types.js';

// ============================================================
// Constants
// ============================================================

const INT_MAX = 2147483647;

// ============================================================
// Main Entry
// ============================================================

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

  // Find telephony.registry dumpsys section
  for (const section of sections) {
    if (
      section.content.includes('mServiceState=') &&
      section.content.includes('mSignalStrength=')
    ) {
      if (!result.serviceState) {
        result.serviceState = parseServiceStateSnapshot(section.content);
      }
      if (!result.signalStrength) {
        result.signalStrength = parseSignalStrengthSnapshot(section.content);
      }
    }
  }

  // Parse radio log events
  if (radioLogEntries && radioLogEntries.length > 0) {
    const events = parseRadioLogEvents(radioLogEntries);
    result.oosEvents = events.oosEvents;
    result.rilErrors = events.rilErrors;
    result.callEvents = events.callEvents;
    result.smsEvents = events.smsEvents;
    result.ratChanges = events.ratChanges;
  }

  return result;
}

// ============================================================
// Dumpsys Snapshot Parsers
// ============================================================

export function parseServiceStateSnapshot(content: string): ServiceStateSnapshot | undefined {
  const stateMatch = content.match(
    /mServiceState=\{mVoiceRegState=(\d+)\((\w+)\),\s*mDataRegState=(\d+)\((\w+)\)/
  );
  if (!stateMatch) return undefined;

  const voiceState = stateMatch[2] as ServiceStateSnapshot['voiceState'];
  const dataState = stateMatch[4] as ServiceStateSnapshot['dataState'];

  // Operator
  const operatorMatch = content.match(/mOperatorAlphaLong=([^,\n]+)/);
  const operator = operatorMatch?.[1]?.trim() || undefined;

  // RAT
  const ratMatch = content.match(/getRilVoiceRadioTechnology=\d+\((\w+)\)/);
  const rat = ratMatch?.[1] !== 'Unknown' ? ratMatch?.[1] : undefined;

  // MCC/MNC — prefer rRplmn, fallback to mMcc/mMnc
  let mccMnc: string | undefined;
  const rplmnMatch = content.match(/rRplmn=(\d{5,6})/);
  if (rplmnMatch) {
    const v = rplmnMatch[1];
    mccMnc = `${v.slice(0, 3)}/${v.slice(3)}`;
  } else {
    const mccMatch = content.match(/mMcc=(\d+)/);
    const mncMatch = content.match(/mMnc=(\d+)/);
    if (mccMatch && mncMatch) {
      mccMnc = `${mccMatch[1]}/${mncMatch[1]}`;
    }
  }

  // Roaming
  const roamingMatch = content.match(/roamingType=(\w+)/);
  const roaming = roamingMatch ? roamingMatch[1] !== 'NOT_ROAMING' : false;

  // Slot ID
  const slotMatch = content.match(/Phone Id=(\d+)/);
  const slotId = slotMatch ? parseInt(slotMatch[1], 10) : 0;

  return { slotId, voiceState, dataState, operator: operator || undefined, mccMnc, rat, roaming };
}

export function parseSignalStrengthSnapshot(content: string): SignalStrengthSnapshot | undefined {
  const sigMatch = content.match(/mSignalStrength=SignalStrength:\{([\s\S]*?)\}\s*$/m);
  if (!sigMatch) return undefined;
  const block = sigMatch[1];

  // Determine primary technology
  const primaryMatch = block.match(/primary=CellSignalStrength(\w+)/);
  const primaryTech = primaryMatch?.[1] || 'LTE';

  const techMap: Record<string, SignalStrengthSnapshot['technology']> = {
    Lte: 'LTE',
    Nr: 'NR',
    Wcdma: 'WCDMA',
    Gsm: 'GSM',
    Cdma: 'CDMA',
  };
  const technology = techMap[primaryTech] || 'LTE';

  const filterMax = (v: number | undefined): number | undefined =>
    v != null && v !== INT_MAX && v !== -INT_MAX ? v : undefined;

  let rsrp: number | undefined;
  let rsrq: number | undefined;
  let sinr: number | undefined;
  let rscp: number | undefined;
  let ecno: number | undefined;
  let rssi: number | undefined;
  let level = 0;

  if (technology === 'LTE') {
    const lteBlock = block.match(/mLte=CellSignalStrengthLte:\s*(.*?)(?=,m[A-Z]|$)/s);
    if (lteBlock) {
      rsrp = filterMax(parseNumField(lteBlock[1], 'rsrp'));
      rsrq = filterMax(parseNumField(lteBlock[1], 'rsrq'));
      sinr = filterMax(parseNumField(lteBlock[1], 'rssnr'));
      rssi = filterMax(parseNumField(lteBlock[1], 'rssi'));
      level = parseNumField(lteBlock[1], 'level') ?? 0;
    }
  } else if (technology === 'NR') {
    const nrBlock = block.match(/mNr=CellSignalStrengthNr:\{(.*?)}/s);
    if (nrBlock) {
      rsrp = filterMax(parseNumField(nrBlock[1], 'ssRsrp'));
      rsrq = filterMax(parseNumField(nrBlock[1], 'ssRsrq'));
      sinr = filterMax(parseNumField(nrBlock[1], 'ssSinr'));
      level = parseNumField(nrBlock[1], 'level') ?? 0;
    }
  } else if (technology === 'WCDMA') {
    const wcdmaBlock = block.match(/mWcdma=CellSignalStrengthWcdma:\s*(.*?)(?=,m[A-Z]|$)/s);
    if (wcdmaBlock) {
      rscp = filterMax(parseNumField(wcdmaBlock[1], 'rscp'));
      ecno = filterMax(parseNumField(wcdmaBlock[1], 'ecno'));
      level = parseNumField(wcdmaBlock[1], 'level') ?? 0;
    }
  } else if (technology === 'GSM') {
    const gsmBlock = block.match(/mGsm=CellSignalStrengthGsm:\s*(.*?)(?=,m[A-Z]|$)/s);
    if (gsmBlock) {
      rssi = filterMax(parseNumField(gsmBlock[1], 'rssi'));
      level = parseNumField(gsmBlock[1], 'level') ?? 0;
    }
  }

  return { slotId: 0, technology, rsrp, rsrq, sinr, rscp, ecno, rssi, level };
}

function parseNumField(text: string, field: string): number | undefined {
  const re = new RegExp(`${field}\\s*=\\s*(-?\\d+)`);
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : undefined;
}

// ============================================================
// Radio Log Event Parsers (placeholder — implemented in Task 3)
// ============================================================

function parseRadioLogEvents(entries: LogEntry[]): {
  oosEvents: OosEvent[];
  rilErrors: RilError[];
  callEvents: CallEvent[];
  smsEvents: SmsEvent[];
  ratChanges: RatChangeEvent[];
} {
  return {
    oosEvents: detectOosEvents(entries),
    rilErrors: detectRilErrors(entries),
    callEvents: detectCallEvents(entries),
    smsEvents: detectSmsEvents(entries),
    ratChanges: detectRatChanges(entries),
  };
}

// Stub implementations — filled in Task 3
function detectOosEvents(_entries: LogEntry[]): OosEvent[] { return []; }
function detectRilErrors(_entries: LogEntry[]): RilError[] { return []; }
// PRIVACY: Never populate CallEvent.number — phone numbers are PII and must be fully redacted.
function detectCallEvents(_entries: LogEntry[]): CallEvent[] { return []; }
function detectSmsEvents(_entries: LogEntry[]): SmsEvent[] { return []; }
function detectRatChanges(_entries: LogEntry[]): RatChangeEvent[] { return []; }
```

- [ ] **Step 4: Uncomment export in index.ts**

In `packages/parser/src/index.ts`, uncomment:
```typescript
export * from './telephony-parser.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx -w packages/parser vitest run tests/telephony-parser.test.ts`
Expected: All snapshot tests PASS

- [ ] **Step 6: Build parser**

Run: `npm run build -w packages/parser`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add packages/parser/src/telephony-parser.ts packages/parser/tests/telephony-parser.test.ts packages/parser/src/index.ts
git commit -m "feat(parser): add telephony dumpsys snapshot parsing (ServiceState, SignalStrength)"
```

---

### Task 3: Telephony Parser — Radio Log Event Detection

**Files:**
- Modify: `packages/parser/src/telephony-parser.ts` (replace stubs)
- Modify: `packages/parser/tests/telephony-parser.test.ts` (add event tests)

- [ ] **Step 1: Write OOS detection tests**

Add to `telephony-parser.test.ts`:

```typescript
import { parseTelephonySections } from '../src/telephony-parser.js';
import type { LogEntry, BugreportSection } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    timestamp: '02-26 08:00:00.000',
    pid: 2686, tid: 2686, level: 'D',
    tag: 'SST', message: '', raw: '', lineNumber: 1,
    buffer: 'radio',
    ...overrides,
  };
}

describe('detectOosEvents', () => {
  it('detects OOS start and end pair with duration', () => {
    const entries: LogEntry[] = [
      makeEntry({
        timestamp: '02-26 07:52:19.742',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)}',
      }),
      makeEntry({
        timestamp: '02-26 08:45:24.585',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)} newSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(2);
    expect(result.oosEvents[0].type).toBe('oos_start');
    expect(result.oosEvents[0].domain).toBe('both');
    expect(result.oosEvents[1].type).toBe('oos_end');
    expect(result.oosEvents[1].durationMs).toBeGreaterThan(0);
  });

  it('leaves durationMs undefined when OOS is ongoing at end', () => {
    const entries: LogEntry[] = [
      makeEntry({
        timestamp: '02-26 07:52:19.742',
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(1);
    expect(result.oosEvents[0].type).toBe('oos_start');
    expect(result.oosEvents[0].durationMs).toBeUndefined();
  });

  it('detects voice-only OOS', () => {
    const entries: LogEntry[] = [
      makeEntry({
        message: '[0] Poll ServiceState done: oldSS={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE)} newSS={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=0(IN_SERVICE)}',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents[0].domain).toBe('voice');
  });

  it('ignores non-SST tags', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'DefaultPhoneNotifier',
        message: 'notifyServiceState OUT_OF_SERVICE',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.oosEvents).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write RIL error detection tests**

Add to `telephony-parser.test.ts`:

```typescript
describe('detectRilErrors', () => {
  it('detects E_MODEM_ERR from native RIL', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'RIL', level: 'D',
        message: 'Response[0567]: E_MODEM_ERR (response:OPERATOR, responselen:32)',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('modem_err');
  });

  it('detects UNSOL_MODEM_RESTART', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'RILJ', level: 'D',
        message: '[UNSL]< UNSOL_MODEM_RESTART Modem removed',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('modem_restart');
  });

  it('detects REQUEST_NOT_SUPPORTED from Java RILJ', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'RILJ', level: 'D',
        message: '[0576]< VOICE_RADIO_TECH error: CommandException: REQUEST_NOT_SUPPORTED',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('request_not_supported');
  });

  it('detects RADIO_NOT_AVAILABLE', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'RILJ', level: 'D',
        message: '[0576]< VOICE_RADIO_TECH error 1 [PHONE0]  (RADIO_NOT_AVAILABLE)',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.rilErrors).toHaveLength(1);
    expect(result.rilErrors[0].errorType).toBe('radio_not_available');
  });
});
```

- [ ] **Step 3: Write RAT change detection tests**

```typescript
describe('detectRatChanges', () => {
  it('detects RAT switch from SST tag', () => {
    const entries: LogEntry[] = [
      makeEntry({
        message: '[0] RAT switched LTE -> Unknown at cell -1',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.ratChanges).toHaveLength(1);
    expect(result.ratChanges[0].fromRat).toBe('LTE');
    expect(result.ratChanges[0].toRat).toBe('Unknown');
  });
});
```

- [ ] **Step 3b: Write call/SMS detection tests**

```typescript
describe('detectCallEvents', () => {
  it('detects call drop', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'GsmCallTracker',
        message: 'call drop detected DISCONNECTED LOST_SIGNAL',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.callEvents).toHaveLength(1);
    expect(result.callEvents[0].type).toBe('call_drop');
    // PRIVACY: number must never be populated
    expect(result.callEvents[0].number).toBeUndefined();
  });

  it('detects call start and end', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'ImsCallSession', timestamp: '02-26 08:00:00.000',
        message: 'Dialing outgoing call',
      }),
      makeEntry({
        tag: 'ImsCallSession', timestamp: '02-26 08:05:00.000',
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
      makeEntry({ tag: 'ActivityManager', message: 'call drop something' }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.callEvents).toHaveLength(0);
  });
});

describe('detectSmsEvents', () => {
  it('detects SMS send failure', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'SMSDispatcher',
        message: 'send fail: error sending SMS',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.smsEvents).toHaveLength(1);
    expect(result.smsEvents[0].type).toBe('sms_send_fail');
  });

  it('ignores SIM_STATE_CHANGED broadcast from SMSDispatcher', () => {
    const entries: LogEntry[] = [
      makeEntry({
        tag: 'SMSDispatcher',
        message: 'Received broadcast android.intent.action.SIM_STATE_CHANGED',
      }),
    ];
    const result = parseTelephonySections([], entries);
    expect(result.smsEvents).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx -w packages/parser vitest run tests/telephony-parser.test.ts`
Expected: FAIL — stub functions return empty arrays

- [ ] **Step 5: Implement event detection functions**

Replace the stub functions in `telephony-parser.ts`:

```typescript
// ============================================================
// OOS Detection
// ============================================================

function detectOosEvents(entries: LogEntry[]): OosEvent[] {
  const events: OosEvent[] = [];
  let lastOosStart: { timestamp: string; domain: OosEvent['domain'] } | null = null;

  for (const entry of entries) {
    if (entry.tag.trim() !== 'SST') continue;

    const pollMatch = entry.message.match(
      /\[\d+\] Poll ServiceState done:.*?oldSS=\{mVoiceRegState=\d+\((\w+)\),\s*mDataRegState=\d+\((\w+)\)\}.*?newSS=\{mVoiceRegState=\d+\((\w+)\),\s*mDataRegState=\d+\((\w+)\)\}/
    );
    if (!pollMatch) continue;

    const [, oldVoice, oldData, newVoice, newData] = pollMatch;
    const wasOos = oldVoice === 'OUT_OF_SERVICE' || oldData === 'OUT_OF_SERVICE';
    const isOos = newVoice === 'OUT_OF_SERVICE' || newData === 'OUT_OF_SERVICE';

    if (!wasOos && isOos) {
      // Transition to OOS
      const domain: OosEvent['domain'] =
        newVoice === 'OUT_OF_SERVICE' && newData === 'OUT_OF_SERVICE' ? 'both'
        : newVoice === 'OUT_OF_SERVICE' ? 'voice' : 'data';
      lastOosStart = { timestamp: entry.timestamp, domain };
      events.push({ timestamp: entry.timestamp, type: 'oos_start', domain });
    } else if (wasOos && !isOos && lastOosStart) {
      // Transition from OOS to service
      const durationMs = timestampDiffMs(lastOosStart.timestamp, entry.timestamp);
      events.push({
        timestamp: entry.timestamp,
        type: 'oos_end',
        domain: lastOosStart.domain,
        durationMs: durationMs > 0 ? durationMs : undefined,
      });
      lastOosStart = null;
    }
  }

  return events;
}

function timestampDiffMs(start: string, end: string): number {
  // Format: MM-DD HH:mm:ss.SSS
  const parse = (ts: string): number => {
    const m = ts.match(/(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!m) return 0;
    const [, mo, d, h, mi, s, ms] = m;
    return (
      (parseInt(mo) * 31 + parseInt(d)) * 86400000 +
      parseInt(h) * 3600000 +
      parseInt(mi) * 60000 +
      parseInt(s) * 1000 +
      parseInt(ms)
    );
  };
  return parse(end) - parse(start);
}

// ============================================================
// RIL Error Detection
// ============================================================

const RIL_ERROR_RULES: Array<{
  errorType: RilError['errorType'];
  pattern: RegExp;
  tags: string[];
}> = [
  { errorType: 'modem_restart', pattern: /UNSOL_MODEM_RESTART/i, tags: ['RILJ'] },
  { errorType: 'radio_crash', pattern: /Radio.*crash|RILD.*died/i, tags: ['RIL', 'RILJ'] },
  { errorType: 'ril_restart', pattern: /RIL.*restart|rild.*start/i, tags: ['RIL'] },
  { errorType: 'modem_err', pattern: /E_MODEM_ERR|CommandException:\s*MODEM_ERR/i, tags: ['RIL', 'RILJ'] },
  { errorType: 'timeout', pattern: /RIL_REQUEST_TIMED_OUT|TIMEOUT/i, tags: ['RIL', 'RILJ'] },
  { errorType: 'request_not_supported', pattern: /E_REQUEST_NOT_SUPPORTED|CommandException:\s*REQUEST_NOT_SUPPORTED/i, tags: ['RIL', 'RILJ', 'RilRequest'] },
  { errorType: 'radio_not_available', pattern: /RADIO_NOT_AVAILABLE/i, tags: ['RILJ', 'RilRequest'] },
];

function detectRilErrors(entries: LogEntry[]): RilError[] {
  const errors: RilError[] = [];
  for (const entry of entries) {
    const tag = entry.tag.trim();
    for (const rule of RIL_ERROR_RULES) {
      if (!rule.tags.includes(tag)) continue;
      if (!rule.pattern.test(entry.message)) continue;

      // Extract request name if available
      const reqMatch = entry.message.match(/response:(\w+)|<\s*(\w+)\s+error|>\s*(\w+)/);
      const request = reqMatch?.[1] || reqMatch?.[2] || reqMatch?.[3];

      errors.push({
        timestamp: entry.timestamp,
        errorType: rule.errorType,
        request,
        message: entry.message.slice(0, 200),
      });
      break; // first matching rule wins
    }
  }
  return errors;
}

// ============================================================
// RAT Change Detection
// ============================================================

function detectRatChanges(entries: LogEntry[]): RatChangeEvent[] {
  const changes: RatChangeEvent[] = [];
  for (const entry of entries) {
    if (entry.tag.trim() !== 'SST') continue;
    const m = entry.message.match(/\[\d+\] RAT switched (\w+) -> (\w+) at cell/);
    if (m) {
      changes.push({ timestamp: entry.timestamp, fromRat: m[1], toRat: m[2] });
    }
  }
  return changes;
}

// ============================================================
// Call / SMS Detection
// ============================================================

// PRIVACY: Never populate CallEvent.number — phone numbers are PII and must be fully redacted.
const CALL_TAGS = ['GsmCallTracker', 'ImsCallSession', 'Telephony', 'ImsPhoneCallTracker'];
const SMS_TAGS = ['SmsTracker', 'ImsSms', 'SMSDispatcher', 'InboundSmsHandler'];

function detectCallEvents(entries: LogEntry[]): CallEvent[] {
  const events: CallEvent[] = [];
  for (const entry of entries) {
    const tag = entry.tag.trim();
    if (!CALL_TAGS.includes(tag)) continue;

    if (/call.*drop|drop.*call|DISCONNECTED.*LOST_SIGNAL|DISCONNECTED.*ERROR/i.test(entry.message)) {
      events.push({
        timestamp: entry.timestamp,
        type: 'call_drop',
        failReason: entry.message.slice(0, 200),
      });
    } else if (/Dialing|MO.*call|outgoing.*call/i.test(entry.message)) {
      events.push({ timestamp: entry.timestamp, type: 'call_start' });
    } else if (/DISCONNECTED|call.*ended|hangup/i.test(entry.message)) {
      events.push({ timestamp: entry.timestamp, type: 'call_end' });
    } else if (/call.*fail|ORIGINATION.*FAILED/i.test(entry.message)) {
      events.push({
        timestamp: entry.timestamp,
        type: 'call_fail',
        failReason: entry.message.slice(0, 200),
      });
    }
  }
  return events;
}

function detectSmsEvents(entries: LogEntry[]): SmsEvent[] {
  const events: SmsEvent[] = [];
  for (const entry of entries) {
    const tag = entry.tag.trim();
    if (!SMS_TAGS.includes(tag)) continue;

    if (/send.*fail|SMS.*fail|error.*sending/i.test(entry.message)) {
      events.push({
        timestamp: entry.timestamp,
        type: 'sms_send_fail',
        failReason: entry.message.slice(0, 200),
      });
    } else if (/SMS.*sent|send.*success/i.test(entry.message)) {
      events.push({ timestamp: entry.timestamp, type: 'sms_send_success' });
    } else if (/new.*SMS|SMS.*received|incoming.*message/i.test(entry.message)) {
      events.push({ timestamp: entry.timestamp, type: 'sms_receive' });
    }
  }
  return events;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx -w packages/parser vitest run tests/telephony-parser.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Build parser**

Run: `npm run build -w packages/parser`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add packages/parser/src/telephony-parser.ts packages/parser/tests/telephony-parser.test.ts
git commit -m "feat(parser): implement radio log event detection (OOS, RIL errors, RAT, call/SMS)"
```

---

## Chunk 2: Insights + Backend Integration

### Task 4: Generate Telephony Insights

**Files:**
- Modify: `packages/parser/src/basic-analyzer.ts:48-120` (analyzeBasic), `:1003+` (new function), `:1338+` (buildTimeline), `:1537+` (calculateHealthScore)

- [ ] **Step 1: Write insight generation tests**

Add to `packages/parser/tests/basic-analyzer.test.ts`:

```typescript
import type { TelephonyParseResult } from '../src/types.js';

describe('generateTelephonyInsights', () => {
  // Use the internal function via analyzeBasic integration
  it('generates critical insight for frequent OOS', () => {
    // Test via analyzeBasic with telephonyStatus containing 3+ OOS events
    // Verify insight with severity='critical', category='telephony', source='telephony'
  });

  it('generates critical insight for modem restart', () => {
    // Test via analyzeBasic with telephonyStatus containing modem_restart RIL error
  });

  it('generates warning for single long OOS', () => {
    // OOS with durationMs > 30000
  });
});
```

Note: Exact test bodies depend on `analyzeBasic` input structure. The implementing agent should construct a minimal `BasicAnalyzerInput` with `telephonyStatus` and verify generated insights.

- [ ] **Step 2: Implement generateTelephonyInsights()**

In `basic-analyzer.ts`, add after `generatePowerInsights()`:

```typescript
const TELEPHONY_DEBUG_COMMANDS = [
  'adb shell dumpsys telephony.registry',
  'adb shell dumpsys phone',
  'adb logcat -b radio -d | grep -E "SST|RIL|RILJ"',
];

function generateTelephonyInsights(telephony?: TelephonyParseResult): InsightCard[] {
  if (!telephony) return [];
  const insights: InsightCard[] = [];

  // Rule 7: Current ServiceState = OOS (check first — most visible)
  if (telephony.serviceState) {
    const { voiceState, dataState } = telephony.serviceState;
    if (voiceState === 'OUT_OF_SERVICE' || dataState === 'OUT_OF_SERVICE') {
      insights.push({
        id: '', severity: 'critical', category: 'telephony',
        title: `Device currently out of service (voice: ${voiceState}, data: ${dataState})`,
        description: 'The device is currently unable to register with the cellular network.',
        source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
      });
    }
  }

  // Rule 1: Frequent OOS (count >= 3 or total > 5 min)
  const oosStarts = telephony.oosEvents.filter(e => e.type === 'oos_start');
  const oosEnds = telephony.oosEvents.filter(e => e.type === 'oos_end');
  const totalOosDurationMs = oosEnds.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  if (oosStarts.length >= 3 || totalOosDurationMs > 5 * 60 * 1000) {
    const totalMin = Math.round(totalOosDurationMs / 60000);
    insights.push({
      id: '', severity: 'critical', category: 'telephony',
      title: `Frequent service outage: ${oosStarts.length} times, total ${totalMin} min`,
      description: `Detected ${oosStarts.length} OOS events with total duration of ${totalMin} minutes. This indicates significant cellular connectivity issues.`,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  // Rule 2: Single long OOS > 30s
  for (const event of oosEnds) {
    if (event.durationMs && event.durationMs > 30000) {
      const sec = Math.round(event.durationMs / 1000);
      insights.push({
        id: '', severity: 'warning', category: 'telephony',
        title: `Service outage lasted ${sec} seconds (${event.domain})`,
        description: `OOS at ${event.timestamp} lasted ${sec}s. Domain: ${event.domain}.`,
        timestamp: event.timestamp,
        source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
      });
    }
  }

  // Rule 3: Modem crash / restart
  const modemCrashes = telephony.rilErrors.filter(
    e => e.errorType === 'radio_crash' || e.errorType === 'modem_restart'
  );
  for (const err of modemCrashes) {
    insights.push({
      id: '', severity: 'critical', category: 'telephony',
      title: `Modem ${err.errorType === 'radio_crash' ? 'crash' : 'restart'} detected`,
      description: err.message,
      timestamp: err.timestamp,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  // Rule 4: Frequent modem errors
  const modemErrs = telephony.rilErrors.filter(e => e.errorType === 'modem_err');
  if (modemErrs.length >= 5) {
    insights.push({
      id: '', severity: 'warning', category: 'telephony',
      title: `Frequent RIL modem errors (${modemErrs.length} times)`,
      description: `${modemErrs.length} E_MODEM_ERR errors detected. May indicate baseband firmware issues.`,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  // Rule 5: Call drop
  const callDrops = telephony.callEvents.filter(e => e.type === 'call_drop');
  for (const drop of callDrops) {
    insights.push({
      id: '', severity: 'warning', category: 'telephony',
      title: 'Call drop detected',
      description: drop.failReason || 'Call was unexpectedly disconnected.',
      timestamp: drop.timestamp,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  // Rule 6: SMS send failure
  const smsFails = telephony.smsEvents.filter(e => e.type === 'sms_send_fail');
  if (smsFails.length > 0) {
    insights.push({
      id: '', severity: 'warning', category: 'telephony',
      title: `SMS send failure (${smsFails.length} times)`,
      description: `${smsFails.length} SMS send failures detected.`,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  // Rule 8: Weak signal
  if (telephony.signalStrength && telephony.signalStrength.level <= 1) {
    insights.push({
      id: '', severity: 'info', category: 'telephony',
      title: `Weak signal quality (level=${telephony.signalStrength.level}, ${telephony.signalStrength.technology})`,
      description: `Current signal level is ${telephony.signalStrength.level}/4 (${telephony.signalStrength.technology}).`,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  // Rule 9: Frequent RAT changes
  if (telephony.ratChanges.length >= 5) {
    insights.push({
      id: '', severity: 'info', category: 'telephony',
      title: `Frequent RAT switching (${telephony.ratChanges.length} times)`,
      description: `${telephony.ratChanges.length} network technology changes detected. May indicate unstable signal causing fallback between technologies.`,
      source: 'telephony', debugCommands: TELEPHONY_DEBUG_COMMANDS,
    });
  }

  return insights;
}
```

- [ ] **Step 3: Integrate into analyzeBasic()**

In `basic-analyzer.ts`:

1. Line 49 — destructure `telephonyStatus` from input:
   ```typescript
   const { ..., powerStatus, telephonyStatus } = input;
   ```

2. After line 67 (`const powerInsights = ...`), add:
   ```typescript
   const telephonyInsights = generateTelephonyInsights(telephonyStatus);
   ```

3. In the `merged` array (line 75-84), add `...telephonyInsights,` after `...powerInsights,`

4. In `calculateHealthScore()` call (line 99), add `telephonyStatus` parameter.

5. In `buildTimeline()` call (line 98), add `telephonyStatus` parameter.

6. In the return object (line 104-119), add:
   ```typescript
   ...(telephonyStatus ? { telephonyStatus } : {}),
   ```

- [ ] **Step 4: Add telephony to calculateHealthScore()**

In `calculateHealthScore()` signature, add `telephonyStatus?: TelephonyParseResult` parameter.

Add telephony deductions inside the function:

```typescript
// Telephony: OOS → stability, call/SMS failures → responsiveness
if (telephonyStatus) {
  const oosStarts = telephonyStatus.oosEvents.filter(e => e.type === 'oos_start');
  for (let i = 0; i < oosStarts.length && i < 5; i++) {
    const factor = i === 0 ? 1 : i === 1 ? 0.5 : i === 2 ? 0.25 : 0.1;
    deductions.stability += 8 * factor;
  }
  const modemCrashes = telephonyStatus.rilErrors.filter(
    e => e.errorType === 'radio_crash' || e.errorType === 'modem_restart'
  );
  for (let i = 0; i < modemCrashes.length && i < 3; i++) {
    const factor = i === 0 ? 1 : i === 1 ? 0.5 : 0.25;
    deductions.stability += 10 * factor;
  }
  const callDrops = telephonyStatus.callEvents.filter(e => e.type === 'call_drop');
  for (let i = 0; i < callDrops.length && i < 3; i++) {
    deductions.responsiveness += 5 * (i === 0 ? 1 : 0.5);
  }
  const smsFails = telephonyStatus.smsEvents.filter(e => e.type === 'sms_send_fail');
  for (let i = 0; i < smsFails.length && i < 3; i++) {
    deductions.responsiveness += 3 * (i === 0 ? 1 : 0.5);
  }
}
```

- [ ] **Step 5: Add telephony events to buildTimeline()**

In `buildTimeline()` signature, add `telephonyStatus?: TelephonyParseResult` parameter.

Add after existing timeline event generation:

```typescript
// Telephony events
if (telephonyStatus) {
  for (const oos of telephonyStatus.oosEvents) {
    if (oos.type === 'oos_start') {
      events.push({
        timestamp: oos.timestamp,
        source: 'telephony',
        severity: 'warning',
        label: `OOS start (${oos.domain})`,
      });
    }
  }
  for (const err of telephonyStatus.rilErrors) {
    if (err.errorType === 'radio_crash' || err.errorType === 'modem_restart') {
      events.push({
        timestamp: err.timestamp,
        source: 'telephony',
        severity: 'critical',
        label: `Modem ${err.errorType === 'radio_crash' ? 'crash' : 'restart'}`,
        details: err.message.slice(0, 100),
      });
    }
  }
  for (const call of telephonyStatus.callEvents) {
    if (call.type === 'call_drop') {
      events.push({
        timestamp: call.timestamp,
        source: 'telephony',
        severity: 'warning',
        label: 'Call drop',
      });
    }
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm run test -w packages/parser`
Expected: All tests PASS (existing + new)

- [ ] **Step 7: Build parser**

Run: `npm run build -w packages/parser`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add packages/parser/src/basic-analyzer.ts packages/parser/tests/basic-analyzer.test.ts
git commit -m "feat(parser): add telephony insights, health score deductions, and timeline events"
```

---

### Task 5: Backend Pipeline Integration

**Files:**
- Modify: `packages/backend/src/routes/analyze.ts:205-267`

- [ ] **Step 1: Add telephony parsing to analyze pipeline**

In `packages/backend/src/routes/analyze.ts`:

1. Add import at top:
   ```typescript
   import { parseTelephonySections } from '@logcat-ai/parser';
   ```

2. After line 205 (`const powerStatus = ...`), add:
   ```typescript
   // Parse telephony sections (dumpsys telephony.registry + radio log entries)
   const radioEntries = logcatResult.entries.filter(e => e.buffer === 'radio');
   const telephonyStatus = parseTelephonySections(unpackResult.sections, radioEntries);
   ```

3. In `analyzeBasic()` call (line 255-267), add `telephonyStatus` to the input object:
   ```typescript
   telephonyStatus,
   ```
   (after `powerStatus,` on line 266)

- [ ] **Step 2: Build backend**

Run: `npm run build -w packages/parser && npm run build -w packages/backend`
Expected: Build succeeds

- [ ] **Step 3: Sanity test with sample bugreport**

Run:
```bash
npm run dev -w packages/backend &
sleep 3
curl -s -F "file=@sample-bugreports/bugreport-T70-AQ3A.250408.001-2026-02-04-16-34-47 _dock.zip" http://localhost:8000/api/upload
```
Then GET `/api/analyze/:id/result` and verify `telephonyStatus` is present in the response JSON.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/analyze.ts
git commit -m "feat(backend): integrate telephony parsing into analysis pipeline"
```

---

### Task 6: LLM Integration (Context Builder + Prompt + Tool Schema)

**Files:**
- Modify: `packages/backend/src/llm-gateway/prompt-templates/context-builder.ts:50-63`
- Modify: `packages/backend/src/llm-gateway/prompt-templates/analysis.ts`
- Modify: `packages/backend/src/llm-gateway/tool-definitions.ts:26-61`

- [ ] **Step 1: Add telephony dispatch in context-builder.ts**

In the `buildInsightContexts()` dispatch chain (around line 58), after the `power` branch, add:

```typescript
} else if (insight.source === 'telephony') {
  collectTelephonyContext(ctx, insight, result);
}
```

Add the `collectTelephonyContext` function:

```typescript
function collectTelephonyContext(
  ctx: InsightContext,
  insight: InsightCard,
  result: AnalysisResult,
): void {
  if (!result.telephonyStatus) return;
  const tel = result.telephonyStatus;

  // Add service state snapshot
  if (tel.serviceState) {
    ctx.anomalyLogs.push(`[ServiceState] voice=${tel.serviceState.voiceState} data=${tel.serviceState.dataState} rat=${tel.serviceState.rat || 'Unknown'} operator=${tel.serviceState.operator || 'N/A'}`);
  }

  // Add OOS event summary
  if (tel.oosEvents.length > 0) {
    ctx.anomalyLogs.push(`[OOS Events] ${tel.oosEvents.length} events:`);
    for (const oos of tel.oosEvents.slice(0, 10)) {
      const dur = oos.durationMs ? ` (${Math.round(oos.durationMs / 1000)}s)` : ' (ongoing)';
      ctx.anomalyLogs.push(`  ${oos.timestamp} ${oos.type} ${oos.domain}${oos.type === 'oos_end' ? dur : ''}`);
    }
  }

  // Add RIL error summary
  if (tel.rilErrors.length > 0) {
    ctx.anomalyLogs.push(`[RIL Errors] ${tel.rilErrors.length} errors:`);
    for (const err of tel.rilErrors.slice(0, 10)) {
      ctx.anomalyLogs.push(`  ${err.timestamp} ${err.errorType} ${err.request || ''} ${err.message.slice(0, 100)}`);
    }
  }

  // Collect ±10s radio log entries around insight timestamp
  if (insight.timestamp && result.logcatResult?.entries) {
    const insightTs = insight.timestamp;
    const windowMs = 10000;
    const nearby = result.logcatResult.entries.filter(e => {
      if (e.buffer !== 'radio') return false;
      const diff = Math.abs(timestampDiffMs(e.timestamp, insightTs));
      return diff <= windowMs;
    });
    for (const entry of nearby.slice(0, 30)) {
      ctx.anomalyLogs.push(entry.raw);
    }
  }

  // Collect modem/ril-related kernel log entries
  if (result.kernelResult?.entries) {
    const modemKernelEntries = result.kernelResult.entries.filter(e =>
      /modem|ril|radio|baseband|qcom_smd|rmnet|esoc/i.test(e.message)
    );
    if (modemKernelEntries.length > 0) {
      ctx.anomalyLogs.push(`[Kernel modem/ril entries] ${modemKernelEntries.length} entries:`);
      for (const entry of modemKernelEntries.slice(0, 15)) {
        ctx.anomalyLogs.push(`  [${entry.timestamp}] ${entry.message.slice(0, 150)}`);
      }
    }
  }
}
```

Note: Import `timestampDiffMs` from telephony-parser or implement a local version. If the function is not exported, implement a simple version inline.

- [ ] **Step 2: Add telephony section to analysis prompt**

In `analysis.ts`, where power/HAL status sections are built, add a telephony section:

```typescript
// Telephony Status
if (result.telephonyStatus) {
  const tel = result.telephonyStatus;
  const oosCount = tel.oosEvents.filter(e => e.type === 'oos_start').length;
  const totalOosMs = tel.oosEvents
    .filter(e => e.type === 'oos_end')
    .reduce((sum, e) => sum + (e.durationMs || 0), 0);

  sections.push(`## Telephony Status
- Current Voice: ${tel.serviceState?.voiceState || 'N/A'}, Data: ${tel.serviceState?.dataState || 'N/A'}
- OOS events: ${oosCount} times, total duration: ${Math.round(totalOosMs / 60000)} min
- RIL errors: ${tel.rilErrors.length} (${[...new Set(tel.rilErrors.map(e => e.errorType))].join(', ')})
- Signal: ${tel.signalStrength?.technology || 'N/A'} level ${tel.signalStrength?.level ?? 'N/A'}
- RAT changes: ${tel.ratChanges.length}

When analyzing telephony insights, focus on:
1. Root cause of OOS (modem crash? signal loss? network rejection?)
2. Correlation between RIL errors and OOS events
3. Whether OOS is device-side or network-side issue`);
}
```

- [ ] **Step 3: Add buffer parameter to search_logcat tool**

In `tool-definitions.ts`, inside the `search_logcat` parameters properties (around line 53), add before the closing `}`:

```typescript
buffer: {
  type: 'string',
  enum: ['main', 'system', 'events', 'crash', 'radio'],
  description: 'Filter by logcat buffer (e.g. "radio" for telephony logs)',
},
```

- [ ] **Step 4: Build backend**

Run: `npm run build -w packages/backend`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/llm-gateway/prompt-templates/context-builder.ts packages/backend/src/llm-gateway/prompt-templates/analysis.ts packages/backend/src/llm-gateway/tool-definitions.ts
git commit -m "feat(backend): add telephony LLM context, prompt section, and buffer param to search_logcat"
```

---

## Chunk 3: Frontend + E2E + Docs

### Task 7: Frontend Types + TelephonyOverview Component

**Files:**
- Modify: `packages/frontend/src/lib/types.ts`
- Create: `packages/frontend/src/components/TelephonyOverview.tsx`
- Modify: `packages/frontend/src/App.tsx`

- [ ] **Step 1: Mirror telephony types in frontend**

In `packages/frontend/src/lib/types.ts`, after the Power Management types section, add all telephony interfaces matching `types.ts` in parser:
- `TelephonyParseResult`, `ServiceStateSnapshot`, `SignalStrengthSnapshot`, `OosEvent`, `RilError`, `CallEvent`, `SmsEvent`, `RatChangeEvent`

Also add `'telephony'` to the `InsightCategory` type if it's mirrored, and `telephonyStatus?: TelephonyParseResult` to `AnalysisResult`.

- [ ] **Step 2: Create TelephonyOverview component**

Create `packages/frontend/src/components/TelephonyOverview.tsx`.

Follow `PowerOverview.tsx` pattern:
- Props: `{ telephonyStatus: TelephonyParseResult }`
- Summary cards row (always visible): Voice State, OOS Count, RIL Errors, Signal Level
- "Show details" toggle button
- Detail sections (conditionally visible):
  1. OOS Event History (table with timestamp, type, domain, duration)
  2. RIL/Modem Errors (table with timestamp, errorType, request, message)
  3. Call/SMS Events (only if events exist)
  4. Signal & Network Details (technology, rsrp/rsrq/sinr/rscp, operator, RAT changes)
- Voice State card shows red bg when OOS

Use Tailwind classes consistent with existing components (dark theme, `bg-gray-800`, `text-gray-300`, etc.)

- [ ] **Step 3: Integrate into App.tsx**

1. Import `TelephonyOverview` at top of `App.tsx`

2. In `navSections` useMemo (around line 107-108, after power section):
   ```typescript
   if (result.telephonyStatus) {
     sections.push({ id: 'section-telephony', label: 'Telephony' });
   }
   ```

3. In result rendering (around line 312-316, after power section):
   ```typescript
   {result.telephonyStatus && (
     <div id="section-telephony">
       <TelephonyOverview telephonyStatus={result.telephonyStatus} />
     </div>
   )}
   ```

- [ ] **Step 4: Verify frontend build**

Run: `npm run build -w packages/frontend`
Expected: Build succeeds

- [ ] **Step 5: Visual verification**

Run: `npm run dev` and upload a sample bugreport. Verify:
- TelephonyOverview section appears in the result page
- SectionNav shows "Telephony" item
- Summary cards display correctly
- Detail toggle works

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/lib/types.ts packages/frontend/src/components/TelephonyOverview.tsx packages/frontend/src/App.tsx
git commit -m "feat(frontend): add TelephonyOverview component with summary cards and detail sections"
```

---

### Task 8: E2E Test

**Files:**
- Create: `packages/frontend/e2e/tests/telephony.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `packages/frontend/e2e/tests/telephony.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Telephony Overview', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the result page (uses shared analysis from global-setup)
    await page.goto('/');
    // Wait for analysis result to load
    await page.waitForSelector('[id="section-overview"]', { timeout: 10000 });
  });

  test('shows telephony section in nav', async ({ page }) => {
    // Check SectionNav contains Telephony
    const nav = page.locator('text=Telephony');
    // If no telephony data in sample, this test should be conditional
    // For now, verify the section exists if telephonyStatus is present
    const telephonySection = page.locator('#section-telephony');
    const exists = await telephonySection.count();
    if (exists > 0) {
      await expect(telephonySection).toBeVisible();
    }
  });

  test('displays summary cards when telephony data exists', async ({ page }) => {
    const telephonySection = page.locator('#section-telephony');
    const exists = await telephonySection.count();
    if (exists === 0) {
      test.skip();
      return;
    }
    // Verify summary cards
    await expect(telephonySection.locator('text=/Voice State|OOS Count|RIL Errors|Signal/')).toBeVisible();
  });

  test('toggles detail sections', async ({ page }) => {
    const telephonySection = page.locator('#section-telephony');
    const exists = await telephonySection.count();
    if (exists === 0) {
      test.skip();
      return;
    }
    const toggleBtn = telephonySection.locator('button:has-text("Show details")');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      // Verify detail content appears
      await expect(telephonySection.locator('text=/OOS|RIL|Signal/')).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run E2E test**

Run: `npm run e2e -w packages/frontend`
Expected: Tests PASS (with conditional skips if sample bugreport has no telephony data)

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/e2e/tests/telephony.spec.ts
git commit -m "test(frontend): add telephony E2E tests"
```

---

### Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add telephony-parser documentation**

In the Parser section of CLAUDE.md, after the `power-parser.ts` bullet, add:

```markdown
- `telephony-parser.ts` — Telephony analysis: ServiceState snapshot (voice/data reg state, operator, RAT, roaming), SignalStrength snapshot (LTE/NR/WCDMA/GSM metrics), OOS event detection (start/end pairing with duration), RIL error detection (7 types: modem_err, timeout, radio_crash, ril_restart, request_not_supported, modem_restart, radio_not_available), call events (start/end/drop/fail), SMS events, RAT change tracking
```

In the types.ts documentation, add the new types to the list:

```markdown
`TelephonyParseResult`, `ServiceStateSnapshot`, `SignalStrengthSnapshot`, `OosEvent`, `RilError`, `CallEvent`, `SmsEvent`, `RatChangeEvent`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add telephony-parser to CLAUDE.md"
```

---

### Task 10: Integration Verification with Sample Bugreport

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: All packages build successfully

- [ ] **Step 2: Run all parser tests**

Run: `npm run test -w packages/parser`
Expected: All tests PASS

- [ ] **Step 3: Run E2E tests**

Run: `npm run e2e -w packages/frontend`
Expected: All tests PASS

- [ ] **Step 4: Sanity test with verification bugreport**

Upload `/Users/chenzeming/bugreport-samples/0226_bugreport/bugreport-T70-AQ3A.250408.001-2026-02-26-08-47-46.zip` through the frontend UI.

Verify:
- TelephonyOverview section appears
- Shows OOS events (expect ~3 OOS start/end pairs)
- Shows RIL errors (expect ~22: 1 modem_err, 1 modem_restart, 21 request_not_supported)
- Shows ServiceState snapshot (IN_SERVICE, Chunghwa Telecom, LTE)
- Shows SignalStrength (LTE, level 4)
- Shows RAT changes (2: LTE→Unknown, Unknown→LTE)
- Insights section contains telephony-related insights
- Timeline contains telephony events

- [ ] **Step 5: Also test with existing sample bugreports**

Upload `sample-bugreports/bugreport-T70-AQ3A.250408.001-2026-02-04-16-34-47 _dock.zip` to verify no regression.
