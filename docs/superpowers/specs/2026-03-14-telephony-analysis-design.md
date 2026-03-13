# Telephony Analysis 設計規格

## 概述

為 logcat-ai 新增 telephony bug/performance 分析功能，從 bugreport 中提取 radio log 事件和 dumpsys 快照，偵測斷訊 (OOS)、RIL/Modem 異常、通話/SMS 問題、訊號品質和網路制式切換等 telephony 相關問題。

### 優先順序

1. OOS / 斷訊分析
2. RIL / Modem 異常
3. 通話 / SMS 問題
4. 訊號品質 (RSRP/RSRQ/SINR)
5. 數據連線 / RAT 切換

### 範圍

- 全套：Parser + 前端 TelephonyOverview + LLM Deep Analysis 整合
- 資料來源：radio logcat buffer（事件歷史）+ dumpsys 段落（當下快照）
- SIM 支援：MVP 單 SIM，資料結構預留多 SIM（`slotId` 欄位）

---

## 1. 資料模型（types.ts）

### TelephonyParseResult

```typescript
export interface TelephonyParseResult {
  serviceState?: ServiceStateSnapshot;
  signalStrength?: SignalStrengthSnapshot;
  oosEvents: OosEvent[];
  rilErrors: RilError[];
  callEvents: CallEvent[];
  smsEvents: SmsEvent[];
  ratChanges: RatChangeEvent[];
  simSlotCount: number;              // MVP=1，預留多 SIM
}
```

### Dumpsys 快照型別

```typescript
export interface ServiceStateSnapshot {
  slotId: number;
  voiceState: 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'EMERGENCY_ONLY' | 'POWER_OFF';
  dataState: 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'EMERGENCY_ONLY' | 'POWER_OFF';
  operator?: string;
  mccMnc?: string;
  rat?: string;                      // UMTS / LTE / NR
  roaming: boolean;
}

export interface SignalStrengthSnapshot {
  slotId: number;
  technology: 'WCDMA' | 'LTE' | 'NR' | 'GSM' | 'CDMA';
  rsrp?: number;                     // LTE/NR (dBm)
  rsrq?: number;                     // LTE/NR (dB)
  sinr?: number;                     // LTE/NR (dB)
  rscp?: number;                     // WCDMA (dBm)
  ecno?: number;                     // WCDMA (dB)
  rssi?: number;                     // GSM (dBm)
  level: number;                     // Android 0-4 level
}
```

### Radio Log 事件型別

```typescript
export interface OosEvent {
  timestamp: string;                  // MM-DD HH:mm:ss.SSS
  type: 'oos_start' | 'oos_end';
  domain: 'voice' | 'data' | 'both';
  durationMs?: number;                // oos_end 時計算
  previousRat?: string;
}

export interface RilError {
  timestamp: string;
  errorType: 'modem_err' | 'timeout' | 'radio_crash' | 'ril_restart'
           | 'request_not_supported' | 'modem_restart';
  request?: string;                   // e.g. "OPERATOR"
  errorCode?: number;
  message: string;
}

export interface CallEvent {
  timestamp: string;
  type: 'call_start' | 'call_end' | 'call_drop' | 'call_fail';
  number?: string;                    // 遮蔽處理
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

---

## 2. Parser 模組（telephony-parser.ts）

### 架構

```
telephony-parser.ts
├── parseTelephonySections(sections, radioLogEntries?)
│   ├── parseServiceStateSnapshot(content)    ← dumpsys
│   ├── parseSignalStrengthSnapshot(content)  ← dumpsys
│   └── parseRadioLogEvents(entries)          ← radio buffer
│       ├── detectOosEvents()
│       ├── detectRilErrors()
│       ├── detectCallEvents()
│       ├── detectSmsEvents()
│       └── detectRatChanges()
```

### 函式簽名

```typescript
export function parseTelephonySections(
  sections: BugreportSection[],
  radioLogEntries?: LogEntry[],
): TelephonyParseResult;
```

與 `parsePowerSections(sections, kernelEntries?)` 模式一致。

### 資料來源對照

| 功能 | 來源段落 | 辨識方式 |
|------|----------|----------|
| ServiceState 快照 | `DUMPSYS TELEPHONY REGISTRY` | content 含 `mServiceState` |
| SignalStrength 快照 | `DUMPSYS TELEPHONY REGISTRY` | content 含 `mSignalStrength` |
| OOS 事件 | Radio logcat buffer | `OUT_OF_SERVICE` / `IN_SERVICE` 狀態切換 |
| RIL 錯誤 | Radio logcat buffer | tag=`RIL`/`RILJ` + error patterns |
| 通話事件 | Radio logcat buffer | tag=`Telephony`/`GsmCallTracker`/`ImsCallSession` |
| SMS 事件 | Radio logcat buffer | tag=`SmsTracker`/`ImsSms`/`SMSDispatcher` |
| RAT 切換 | Radio logcat buffer | `ServiceStateTracker` + RAT 變更 |

### OOS 偵測邏輯

1. 掃描 radio log 中 `ServiceStateTracker` / `NetworkRegistrationInfo` 的狀態變化
2. 遇到 `OUT_OF_SERVICE` → 記錄 `oos_start`
3. 遇到 `IN_SERVICE` → 配對最近的 `oos_start`，計算 `durationMs` → 記錄 `oos_end`
4. 若 bugreport 結束時仍 OOS → `durationMs = undefined`（進行中）
5. 區分 voice/data domain（CS vs PS）

### RIL 錯誤偵測規則

| errorType | Pattern |
|-----------|---------|
| `modem_err` | `E_MODEM_ERR` 或 `MODEM_ERR` |
| `timeout` | `RIL_REQUEST_TIMED_OUT` 或 `TIMEOUT` |
| `radio_crash` | `Radio.*crash` 或 `RILD.*died` |
| `ril_restart` | `RIL.*restart` 或 `rild.*start` |
| `request_not_supported` | `REQUEST_NOT_SUPPORTED` |
| `modem_restart` | `modem.*restart` 或 `baseband.*reset` |

---

## 3. Insight 生成（basic-analyzer.ts）

### 新增 InsightCategory

```typescript
export type InsightCategory = '...' | 'telephony';
```

### Insight 規則

| # | 條件 | Severity | 標題範例 |
|---|------|----------|----------|
| 1 | OOS 累計 > 5 分鐘 或 次數 >= 3 | `critical` | 頻繁斷訊：{N}次，累計{M}分鐘 |
| 2 | OOS 單次 > 30 秒 | `warning` | 斷訊持續 {N} 秒 |
| 3 | RIL error `radio_crash` / `modem_restart` | `critical` | Modem crash / restart 偵測 |
| 4 | RIL error `modem_err` >= 5 次 | `warning` | RIL modem error 頻繁 ({N}次) |
| 5 | 通話中斷 `call_drop` | `warning` | 通話中斷偵測 |
| 6 | SMS 發送失敗 | `warning` | SMS 發送失敗 ({N}次) |
| 7 | 當前 ServiceState = OOS | `critical` | 裝置目前處於斷訊狀態 |
| 8 | SignalStrength level <= 1 | `info` | 訊號品質偏低 (level={N}) |
| 9 | RAT 頻繁切換 >= 5 次 | `info` | 網路制式頻繁切換 ({N}次) |

### 健康評分整合

不新增第五維，歸入現有維度：

- OOS / 斷訊 → **stability** 扣分
- RIL / modem crash → **stability** 扣分
- 通話 / SMS 失敗 → **responsiveness** 扣分

---

## 4. 前端 TelephonyOverview 元件

### 佈局

```
┌─────────────────────────────────────────────────┐
│ Telephony                                        │
├─────────────────────────────────────────────────┤
│ [摘要卡片列] — 永遠顯示                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐│
│ │Voice State│ │OOS Count │ │RIL Errors│ │Signal││
│ │IN_SERVICE │ │  3 次    │ │  11 次   │ │Lv 2  ││
│ └──────────┘ └──────────┘ └──────────┘ └──────┘│
├─────────────────────────────────────────────────┤
│ [Show details ▼]                                 │
│                                                   │
│ ┌─ OOS 事件歷史 ─────────────────────────────┐  │
│ │ 02-28 10:15:32  OOS start (voice+data)     │  │
│ │ 02-28 10:18:45  OOS end   → 持續 3m13s     │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ RIL/Modem 錯誤 ───────────────────────────┐  │
│ │ 02-28 10:15:30  E_MODEM_ERR  OPERATOR      │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ 通話/SMS 事件 ────────────────────────────┐  │
│ │ (若無事件則不顯示此區塊)                    │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ 訊號 & 網路詳情 ──────────────────────────┐  │
│ │ Technology: WCDMA │ RSCP: -120 │ Ec/No: -24│  │
│ │ Operator: 530/01  │ RAT changes: 2 次      │  │
│ └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 設計原則

- 摘要卡片永遠可見，詳細資料藏在 "Show details" 後面（同 PowerOverview 模式）
- OOS 事件和 RIL 錯誤排最前面（優先順序最高）
- 通話/SMS 和訊號詳情只在有資料時顯示
- 當前若 OOS → Voice State 卡片顯示紅色

### SectionNav 整合

位置放在 Power 之後、BSP 之前：

```typescript
if (result.telephonyStatus) {
  sections.push({ id: 'section-telephony', label: 'Telephony', icon: '📡' });
}
```

---

## 5. LLM Deep Analysis 整合

### context-builder.ts

新增 `collectTelephonyContext()` 函式，`source === 'telephony'` 時觸發：

- 當前 ServiceState 快照
- OOS 事件列表（時間、持續時間、domain）
- RIL 錯誤列表
- Insight 時間戳 **±10 秒**內的 radio log entries（原始 log）
- 相關 kernel log（modem/ril 相關，若有）

±10 秒窗口大於一般 logcat insight 的 ±2 秒，因為 telephony 事件牽涉較長的狀態機轉換。

### analysis.ts prompt 擴充

在 deep analysis prompt 中增加 telephony 區塊：

```
## Telephony Status
- Current Voice: {voiceState}, Data: {dataState}
- OOS events: {count} times, total duration: {totalMinutes} min
- RIL errors: {count} ({breakdown by type})
- Signal: {technology} level {level}

When analyzing telephony insights, focus on:
1. Root cause of OOS (modem crash? signal loss? network rejection?)
2. Correlation between RIL errors and OOS events
3. Whether OOS is device-side or network-side issue
```

### Tool Calling 擴充

新增 `search_radio_log` tool，讓 chat 時 LLM 可查詢 radio log：

```typescript
{
  name: 'search_radio_log',
  description: 'Search radio log entries by keyword, tag, or time range',
  parameters: { keyword, tag, startTime, endTime }
}
```

透過現有 FTS5 search 實現，radio entries 已在 `logcat_fts` 中，加 `buffer='radio'` 過濾即可。

---

## 6. 整合要點

### Backend（analyze.ts）

在分析管線中加入 telephony 解析：

```typescript
const radioEntries = allEntries.filter(e => e.buffer === 'radio');
const telephonyStatus = parseTelephonySections(unpackResult.sections, radioEntries);
```

### AnalysisResult 擴充

```typescript
export interface AnalysisResult {
  // ... 現有欄位
  telephonyStatus?: TelephonyParseResult;
}
```

### 匯出支援

`telephonyStatus` 包含在 JSON export 中。HTML export 和 Power Report 不受影響（telephony 有自己的前端 section）。

---

## 7. 測試策略

### Parser 單元測試

- `telephony-parser.test.ts`：模擬 radio log 和 dumpsys 段落，驗證各事件偵測
- 重點測試 OOS start/end 配對邏輯和 duration 計算
- 測試 bugreport 結尾仍 OOS 的邊界情況

### Insight 測試

- 在 `basic-analyzer.test.ts` 中新增 telephony insight 生成測試

### E2E 測試

- 使用現有 sample bugreport（已有 34 次 OOS 和 11 個 RIL error）
- 驗證 TelephonyOverview 元件渲染和 section nav

---

## 8. 檔案變更清單

### 新增

| 檔案 | 說明 |
|------|------|
| `packages/parser/src/telephony-parser.ts` | Telephony 解析模組 |
| `packages/parser/tests/telephony-parser.test.ts` | Parser 單元測試 |
| `packages/frontend/src/components/TelephonyOverview.tsx` | 前端顯示元件 |

### 修改

| 檔案 | 變更 |
|------|------|
| `packages/parser/src/types.ts` | 新增 telephony 相關型別、InsightCategory 加 `'telephony'` |
| `packages/parser/src/index.ts` | 匯出 telephony-parser |
| `packages/parser/src/basic-analyzer.ts` | 新增 `generateTelephonyInsights()`、健康評分扣分 |
| `packages/backend/src/routes/analyze.ts` | 呼叫 `parseTelephonySections()`、結果存入 AnalysisResult |
| `packages/backend/src/llm-gateway/prompt-templates/context-builder.ts` | 新增 `collectTelephonyContext()` |
| `packages/backend/src/llm-gateway/prompt-templates/analysis.ts` | Prompt 加 telephony 區塊 |
| `packages/backend/src/llm-gateway/tool-definitions.ts` | 新增 `search_radio_log` tool |
| `packages/backend/src/llm-gateway/tool-executor.ts` | 實作 `search_radio_log` |
| `packages/frontend/src/App.tsx` | 新增 section-telephony nav + 渲染 |
| `packages/frontend/src/lib/types.ts` | Mirror telephony 型別 |
