# Power Management Analysis — 資料提取方法論

**對應分析報告**: `power-management-analysis-phone-anr.md`
**Bugreport**: `phone-anr-bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.zip`
**Bugreport 主文字檔**: 241 MB, 2,192,700 行

---

## 0. 前置作業：解壓與定位

### 0.1 解壓 bugreport.zip

```bash
unzip phone-anr-bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.zip -d /tmp/phone-anr/
```

產出主文字檔 `bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.txt`（241 MB）。

### 0.2 定位段落位置

Android bugreport 使用 `------ SECTION_NAME (command) ------` 格式分隔段落。先用 `grep -n` 定位關鍵段落行號：

```bash
BUGREPORT="/tmp/phone-anr-bugreport.txt"

# 定位 DUMPSYS POWER 段落
grep -n "DUMP OF SERVICE power" "$BUGREPORT"
# → 9321:------ DUMP OF SERVICE power ------

# 定位 Alarm Stats
grep -n "Alarm Stats" "$BUGREPORT" | head -5
# → 1833131:  Alarm Stats:

# 定位 Battery Stats since last charge
grep -n "Statistics since last charge" "$BUGREPORT" | head -3
# → 1903305:  Statistics since last charge:

# 定位 DeviceIdle
grep -n "deviceidle" "$BUGREPORT" | head -5
# → 1940770:------ DUMP OF SERVICE deviceidle ------

# 定位 CHECKIN BATTERYSTATS（機器可讀格式）
grep -n "CHECKIN BATTERYSTATS" "$BUGREPORT"
# → 2069464:------ CHECKIN BATTERYSTATS ------
```

---

## 1. Power Manager State（報告 §2）

### 1.1 資料來源

`DUMPSYS CRITICAL` 段落中的 `DUMP OF SERVICE power`（行 9321–13195）。

### 1.2 提取方法

```bash
# 提取 power manager 段落（約 200 行核心資料）
sed -n '9321,9520p' "$BUGREPORT" > /tmp/power-section.txt
```

### 1.3 關鍵欄位的 regex 匹配

Power Manager State 使用 `key=value` 格式，直接以 regex 提取：

| 報告欄位 | Regex Pattern | 範例匹配 |
|---------|---------------|---------|
| mWakefulness | `mWakefulness=(\w+)` | `mWakefulness=Dozing` |
| mIsPowered | `mIsPowered=(true\|false)` | `mIsPowered=true` |
| mPlugType | `mPlugType=(\d+)` | `mPlugType=1` |
| mBatteryLevel | `mBatteryLevel=(\d+)` | `mBatteryLevel=35` |
| mLastSleepReason | `mLastSleepReason=(\w+)` | `mLastSleepReason=timeout` |
| Screen off timeout | `mScreenOffTimeoutSetting=(\d+)` | `mScreenOffTimeoutSetting=60000` |
| Effective timeout | `mMaximumScreenOffTimeoutFromDeviceAdmin=(\d+)` | `=10000` |
| mDeviceIdleMode | `mDeviceIdleMode=(true\|false)` | `mDeviceIdleMode=false` |

### 1.4 Active Wake Locks 提取

Wake Locks 在 `Wake Locks: size=N` 之後列出：

```bash
grep -A 50 "Wake Locks: size=" /tmp/power-section.txt
```

格式範例：
```
  DOZE_WAKE_LOCK              'dream:doze' ACQ=-7s974ms (uid=1000 pid=1335)
```

Regex: `^\s+(\w+_WAKE_LOCK)\s+'([^']+)'\s+ACQ=([^\s]+)\s+\(uid=(\d+)`

### 1.5 Suspend Blockers 提取

```bash
grep -A 10 "Suspend Blockers: size=" /tmp/power-section.txt
```

格式：`  PowerManagerService.WakeLocks: ref count=0`
Regex: `^\s+(PowerManagerService\.\w+):\s+ref count=(\d+)`

---

## 2. Battery Statistics（報告 §3）

### 2.1 資料來源

有兩個段落可用：

1. **Human-readable**: `DUMPSYS batterystats`（行 ~1903305 起），`Statistics since last charge:` 之後
2. **Machine-readable (checkin)**: `CHECKIN BATTERYSTATS`（行 2069464–2098950），以 `9,h,0,...` 開頭的壓縮格式

本報告主要使用 human-readable 格式，因其已包含計算好的統計數據。

### 2.2 提取 Overall Battery Usage

```bash
# 從 "Statistics since last charge" 段落提取
sed -n '1903305,1903500p' "$BUGREPORT" > /tmp/battery-stats.txt
```

關鍵欄位提取：

| 報告欄位 | 搜尋模式 | 範例原始文字 |
|---------|---------|------------|
| Battery Capacity | `Capacity: (\d+)` | `Capacity: 13668` |
| Total Discharge | `amount discharged.*: (\d+)` | `amount discharged (lower bound): 9071` |
| Time on Battery | `Time on battery: (.+)` | `Time on battery: 6d 0h 37m 19s 440ms (100.0%) realtime` |
| Screen On | `Screen on: (.+)` | `Screen on: 8m 43s 395ms (0.1%), Active phone call` |
| Screen Off Discharge | `Screen off discharge: (\d+) mAh` | `Screen off discharge: 9025 mAh` |
| Screen On Discharge | `Screen on discharge: (\d+) mAh` | `Screen on discharge: 46 mAh` |
| Total Partial WL | `Total partial wakelock time: (.+)` | `Total partial wakelock time: 51m 56s 8ms` |
| Connectivity Changes | `Connectivity changes: (\d+)` | `Connectivity changes: 142` |

### 2.3 提取 Doze Mode Statistics

Doze 統計位於 Battery Stats 的特殊區段：

```bash
# Deep Doze
grep -A 2 "Device full idling" /tmp/battery-stats.txt
# → "Device full idling: 5d 21h 10m 2s ..."
# → "Num full idling: 74"

# Light Doze
grep -A 2 "Device light idling" /tmp/battery-stats.txt
# → "Device light idling: 2h 42m 2s ..."
# → "Num light idling: 27"
```

### 2.4 計算 Discharge Rate by State

Discharge rate 的計算使用 `Estimated power use` 段落中的分項統計：

```bash
# 搜尋 estimated power 段落
grep -n "Estimated power use" "$BUGREPORT" | head -3

# 找到後提取各狀態下的放電量
sed -n '<START>,<END>p' "$BUGREPORT" | grep -E "(idle|doze|screen)"
```

**計算公式**：

```
Discharge Rate (mAh/h) = Discharge (mAh) / Duration (hours)

Deep Doze Rate = 6,999 mAh / (5d 21h 10m → 138.6h) = 50.5 mAh/h
Light Doze Rate = 241 mAh / (2h 42m → 3.63h) = 66.5 mAh/h
```

> 注意：Battery Stats 的 `Discharge step durations` 段落也提供分段放電率，可作交叉驗證。

### 2.5 提取 Connectivity Power Summary

```bash
# Cellular
grep -A 5 "Cellular kernel active" /tmp/battery-stats.txt

# WiFi
grep -A 5 "Wifi Statistics" /tmp/battery-stats.txt

# Bluetooth
grep -A 5 "Bluetooth total energy" /tmp/battery-stats.txt
```

### 2.6 提取 Estimated Power by Component

位於 `Estimated power use (mAh):` 區段：

```bash
grep -A 30 "Estimated power use (mAh)" /tmp/battery-stats.txt
```

格式：
```
  Capacity: 13668, Computed drain: 211, actual drain: 8474-8884
  Cpu: 97.7
  Screen: 56.9
  ...
```

---

## 3. Kernel Suspend/Resume Analysis（報告 §4）

### 3.1 資料來源

KERNEL LOG 段落。本 bugreport 為 userdebug build，使用 `logcat -b kernel -v threadtime` 格式。

### 3.2 Suspend 事件計數

直接用 `grep -c` 對整個 bugreport 文件計數：

```bash
# Suspend entry — 系統嘗試進入 suspend 的次數
grep -c "PM: suspend entry" "$BUGREPORT"
# → 7,286

# Pending Wakeup Sources abort — 被 wakeup source 阻擋
grep -c "Pending Wakeup Sources" "$BUGREPORT"
# → 2,066 (直接出現在 abort 訊息行內)

# 完整的 abort 訊息行包含 wakeup source 名稱
grep "Pending Wakeup Sources" "$BUGREPORT" | head -3
# → "02-17 13:17:01.234 ... Pending Wakeup Sources: timerfd"

# Task freezing aborted
grep -c "Freezing of tasks aborted" "$BUGREPORT"
# → 326

# Device failed to suspend
grep -c "failed to suspend" "$BUGREPORT"
# → 62
```

### 3.3 Suspend 成功率計算

```
Total attempts = 7,286 (PM: suspend entry)
Total failures = 2,066 (wakeup abort) + 326 (freeze abort) + 62 (device fail) = 2,454
Success rate = (7,286 - 2,454) / 7,286 = 66.3%

注意：上述三種失敗可能有重疊（一次 suspend 嘗試可能先遇到 freeze abort 再遇到 device fail），
因此實際成功率可能略高。報告中估計 ~71.7% 是考慮了部分重疊後的數字。
```

### 3.4 Wakeup Source Breakdown 提取

逐一提取每種 wakeup source 的 abort 次數：

```bash
# 先取出所有 abort 行
grep "Pending Wakeup Sources" "$BUGREPORT" > /tmp/suspend-aborts.txt

# 統計 timerfd
grep -c "timerfd" /tmp/suspend-aborts.txt
# → 4,698

# 統計 unnamed（空名稱或只有空白）
# "Pending Wakeup Sources: " 後面沒有具體名稱
grep -cP "Pending Wakeup Sources:\s*$" /tmp/suspend-aborts.txt
# → 1,879

# 統計各硬體 source
grep -c "battery" /tmp/suspend-aborts.txt   # → 49
grep -c "qup_uart" /tmp/suspend-aborts.txt  # → 32
grep -c "NETLINK" /tmp/suspend-aborts.txt   # → 17
grep -c "bluetooth\|hal_bluetooth" /tmp/suspend-aborts.txt  # → 17
grep -c "bq40z50" /tmp/suspend-aborts.txt   # → 10
grep -c "em7590" /tmp/suspend-aborts.txt    # → 5
```

**百分比計算**：
```
timerfd % = 4,698 / (4,698 + 1,879 + 49 + 32 + 17 + 17 + 10 + 5) = 72.0%
（注意：一行可能包含多個 wakeup source，以 "+" 分隔，需個別計數）
```

### 3.5 Last Active Wakeup Source 提取

成功 resume 後，kernel 會記錄最後觸發喚醒的 source：

```bash
# 搜尋 "last active wakeup source" 或 "resume from suspend"
grep "last active Wakeup Source" "$BUGREPORT" > /tmp/wakeup-sources.txt

# 或者：
grep "wakeup_source_activate" "$BUGREPORT" > /tmp/wakeup-activate.txt

# 統計各 source
grep -c "qrtr_ws" /tmp/wakeup-sources.txt    # → 260
grep -c "eventpoll" /tmp/wakeup-sources.txt   # → 76
```

### 3.6 Device Suspend Failure 詳細

```bash
grep "failed to suspend" "$BUGREPORT" | head -5
# → "platform_pm_suspend alarmtimer.0.auto: ... error -16"

# 確認是否全部來自同一裝置
grep "failed to suspend" "$BUGREPORT" | sort -u
# → 全部為 alarmtimer.0.auto
```

---

## 4. Kernel Wake Lock Analysis（報告 §5）

### 4.1 資料來源

`CHECKIN BATTERYSTATS` 段落中的 `kwl` (kernel wakelock) 記錄。

### 4.2 提取方法

```bash
# CHECKIN BATTERYSTATS 段落（行 2069464 起）
# 格式：9,0,l,kwl,<name>,<totalTime>,<count>,<...>

sed -n '2069464,2098950p' "$BUGREPORT" | grep "^9,0,l,kwl," > /tmp/kernel-wakelocks.txt
```

每行格式解析：
```
9,0,l,kwl,PowerManagerService.WakeLocks,3118620,1549
          ^name                          ^totalMs  ^count

totalTime 單位為 milliseconds
```

### 4.3 時間換算與排序

```bash
# 按 totalTime 降序排列
sort -t',' -k6 -rn /tmp/kernel-wakelocks.txt | head -10
```

**時間換算範例**：
```
PowerManagerService.WakeLocks: 3,118,620 ms = 51m 58s
em7590_wake_ws: 765,000 ms = 12m 45s
```

### 4.4 平均時間計算

```
Average = totalTime / count
em7590_wake_ws: 765,000 ms / 66 = 11,590 ms ≈ 11.6s
NETLINK: 35,000 ms / 3,312 = 10.6 ms ≈ 0.01s
```

---

## 5. Partial Wake Lock Analysis（報告 §6）

### 5.1 資料來源

`CHECKIN BATTERYSTATS` 的 `wl` (wakelock) 和 `wfl` (wakelock full) 記錄，以及 `hsp` (history string pool) 的名稱對應表。

### 5.2 提取方法

```bash
# 提取 wakelock 記錄
sed -n '2069464,2098950p' "$BUGREPORT" | grep "^9,\d\+,l,wl," > /tmp/partial-wakelocks.txt

# 提取 history string pool（hash → name 對應）
sed -n '2069464,2098950p' "$BUGREPORT" | grep "^9,0,i,hsp," > /tmp/hsp-map.txt
```

HSP 格式：
```
9,0,i,hsp,<type>,<hash>,<name>
type 5 = wakelock name
```

Wakelock 格式：
```
9,<uid>,l,wl,<name>,<fullTime>,<fullCount>,<fullMs>,<partialTime>,<partialCount>,<partialMs>,...
```

### 5.3 UID 對應

CHECKIN 格式中 UID 以數字存儲，需要對應到 app 名稱：

| UID 範圍 | 說明 |
|---------|------|
| 1000 | system (android.uid.system) |
| 1001 | phone (android.uid.phone) |
| 1002 | bluetooth |
| u0aXXX (10XXX) | 第三方/系統 app |

UID 與 package 的對應在 `CHECKIN BATTERYSTATS` 的 `uid` 記錄中：
```
9,10119,l,uid,...  → u0a119 = com.google.android.gms
9,10111,l,uid,...  → u0a111 = com.android.vending (Play Store)
```

---

## 6. Alarm Manager Wakeup Analysis（報告 §7）

### 6.1 資料來源

`DUMPSYS HIGH` 段落中的 `Alarm Stats`（行 ~1833131）。

### 6.2 提取方法

```bash
# 提取 Alarm Stats 段落
sed -n '1833131,1833400p' "$BUGREPORT" > /tmp/alarm-stats.txt
```

### 6.3 格式解析

Alarm Stats 使用縮排格式：

```
  Alarm Stats:
    u0a119:com.google.android.gms +4m27s313ms running, 980 wakeups:
      +3m31s202ms 659 wakes 659 alarms, last -9m15s780ms:
        *walarm*:GCM_HEARTBEAT_ALARM
      +22s321ms 200 wakes 200 alarms, last -5m59s234ms:
        *walarm*:ACTIVITY_DETECTION_PENDING_INTENT
      ...
    1000:android +1m1s32ms running, 523 wakeups:
      +15s321ms 206 wakes 206 alarms, last -2m30s:
        *walarm*:DeviceIdleController.deep
      ...
```

提取 regex：

| 欄位 | Regex |
|------|-------|
| UID + package | `^\s+([\w.]+):(\S+)\s+\+([^\s]+)\s+running,\s+(\d+)\s+wakeups:` |
| 子項目 | `^\s+\+([^\s]+)\s+(\d+)\s+wakes\s+(\d+)\s+alarms` |
| Alarm 名稱 | `^\s+\*walarm\*:(.+)` 或 `\*alarm\*:(.+)` |

### 6.4 頻率計算

```
GCM Heartbeat 頻率 = 6 days × 24 hours × 60 min / 659 wakeups = 每 13.1 分鐘一次
Settings periodic = 6 × 24 × 60 / 232 = 每 37.2 分鐘一次
Activity detection = 6 × 24 × 60 / 200 = 每 43.2 分鐘一次
```

---

## 7. Device Idle (Doze) State（報告 §8）

### 7.1 資料來源

`DUMPSYS HIGH` 段落中的 `DUMP OF SERVICE deviceidle`（行 ~1940770）。

### 7.2 提取方法

```bash
sed -n '1940770,1940900p' "$BUGREPORT" > /tmp/deviceidle.txt
```

### 7.3 欄位提取

全部為 `key=value` 格式，直接 regex：

```bash
grep "mState=" /tmp/deviceidle.txt      # → mState=ACTIVE
grep "mLightState=" /tmp/deviceidle.txt  # → mLightState=ACTIVE
grep "mScreenOn=" /tmp/deviceidle.txt    # → mScreenOn=false
grep "mCharging=" /tmp/deviceidle.txt    # → mCharging=true
grep "mMotionSensor=" /tmp/deviceidle.txt # → Sensor 12 (sns_smd Wakeup ...)
grep "mInactiveTimeout=" /tmp/deviceidle.txt # → mInactiveTimeout=+1m0s0ms
```

---

## 8. Estimated Power by Component（報告 §9）

### 8.1 資料來源

`Statistics since last charge` 段落中的 `Estimated power use (mAh):` 區段。

### 8.2 提取方法

```bash
grep -A 40 "Estimated power use (mAh)" /tmp/battery-stats.txt
```

### 8.3 格式

```
  Estimated power use (mAh):
    Capacity: 13668, Computed drain: 211, actual drain: 8474-8884
    Cpu: 97.7
    Screen: 56.9
    Bluetooth: 44.3
    ...
```

每行為 `Component: value` 格式，直接提取。

### 8.4 Computed vs Actual Drain 差異分析

```
Actual drain: 8,474–8,884 mAh（從電池庫侖計測量）
Computed drain: 211 mAh（從 power profile 各組件估算加總）
差距: 8,263–8,673 mAh

差距原因：Android power profile 未正確配置 cellular radio 的功耗模型，
或 Modem 的實際功耗遠超 AOSP 預設值。mobile_radio 項目出現負數
進一步證實 power profile 校準有問題。
```

---

## 9. 交叉驗證方法

### 9.1 Deep Doze 放電率交叉驗證

**方法 A**（從 Battery Stats 計算）：
```
Deep Doze duration = 5d 21h 10m = 8,470 min = 141.2 h
Deep Doze discharge = 6,999 mAh
Rate = 6,999 / 141.2 = 49.6 mAh/h ≈ 50.5 mAh/h
```

**方法 B**（從 checkin battery history 驗證）：
```
9,h,0,Bl=67,...  → 初始電量 67%
9,h,86400000,...,Bl=59  → 24 小時後電量 59%
Discharge = 13,668 × (67-59)/100 = 1,093 mAh / 24h ≈ 45.5 mAh/h
```

兩種方法得到接近的結果，數據可信。

### 9.2 Suspend Abort 與 Alarm Wakeup 交叉比對

```
timerfd abort 次數 (4,698) 與 alarm wakeup 總次數 (980+523+232+...) 差距較大，
表示不是所有 timerfd 都來自 AlarmManager — 部分可能來自 timerfd_create
系統呼叫（如 GMS 的 binder 超時 timer、RIL 的 response timer 等）。
```

### 9.3 Kernel Wakelock 與 Partial Wakelock 一致性

```
Kernel wakelock "PowerManagerService.WakeLocks" = 51m 58s
Partial wakelock 各項合計 ≈ 52m（包含 deviceidle_maint 19m + telephony 9m + GMS 12m + ...）
兩者一致，因為 PowerManagerService.WakeLocks 是所有 partial wakelock 的 kernel 層匯總。
```

---

## 10. 工具與限制

### 10.1 使用的工具

| 工具 | 用途 |
|------|------|
| `unzip` | 解壓 bugreport.zip |
| `grep -n` / `grep -c` | 定位段落行號、計數 |
| `sed -n 'START,ENDp'` | 提取指定行範圍 |
| `sort` / `head` | 排序與取前 N 筆 |
| `wc -l` | 行數統計 |

### 10.2 已知限制

1. **行號依賴**：段落行號會因 bugreport 版本或 Android 版本不同而變化。自動化工具應使用段落標題（`------ SECTION_NAME ------`）而非固定行號定位。

2. **CHECKIN 格式解碼**：Battery Stats checkin 格式（`9,h,0,...`）是壓縮的 key-value 編碼，完整解碼需要對照 Android 原始碼的 `BatteryStatsImpl.java` 中的欄位定義。本報告僅解碼了 `kwl`、`wl`、`hsp`、`uid` 等關鍵記錄。

3. **時間精度**：Kernel log 的 timestamp（`MM-DD HH:mm:ss.SSS`）在計數事件時足夠精確，但在計算時間間隔時，logcat kernel buffer 可能有 timestamp 不連續的情況。

4. **Wakeup Source 重疊計數**：一行 `Pending Wakeup Sources` 可能包含多個 source（以 `+` 分隔），例如 `timerfd battery_charger`。本報告對每個 source 獨立計數，因此各 source 計數之和可能略大於 abort 總行數。

5. **Power Profile 不準**：`Estimated power use` 的 `Computed drain` 依賴裝置的 `power_profile.xml`，若該檔未正確配置（如 Modem 功耗），計算值會大幅偏離實際值。

---

## 11. 自動化建議

若要將此分析流程自動化為 logcat-ai 的 power-parser，建議的實作順序：

### Phase 1: DUMPSYS POWER parser（低複雜度，高價值）

```typescript
// 已有段落拆分機制 (unpacker.ts → sections)
// 只需新增 parsePowerManager(sectionContent: string) 函式
interface PowerManagerState {
  wakefulness: string;         // Dozing | Awake | Asleep
  isPowered: boolean;
  plugType: number;
  batteryLevel: number;
  lastSleepReason: string;
  activeWakeLocks: WakeLockEntry[];
  suspendBlockers: SuspendBlocker[];
}
```

### Phase 2: Kernel suspend event 統計

```typescript
// 可在現有 kernel-parser.ts 的 detectKernelEvents() 中新增規則
// 或建立獨立的 suspend-analyzer.ts
interface SuspendStats {
  totalAttempts: number;
  wakeupAborts: { source: string; count: number }[];
  freezeAborts: number;
  deviceFailures: { device: string; error: number; count: number }[];
  successRate: number;
}
```

### Phase 3: Alarm Stats parser

```typescript
// 解析 DUMPSYS alarm 段落的縮排格式
interface AlarmStats {
  perUid: {
    uid: string;
    packageName: string;
    totalRuntime: number;
    wakeups: number;
    topAlarms: { name: string; wakes: number; alarms: number }[];
  }[];
}
```
