# Power Management Analysis Report

**Bugreport**: `phone-anr-bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.zip`
**Device**: Trimble T70, Android 15 (API 35), Qualcomm SoC
**Build**: `AQ3A.250408.001` (userdebug), kernel 5.4.289-qgki-debug
**Analysis Date**: 2026-02-24
**Statistics Period**: 2026-02-17 13:16 ~ 2026-02-23 14:00 (**6 days**)

---

## 1. Executive Summary

本裝置在 6 天統計期間內，螢幕僅開啟 8 分 43 秒（0.1%），97.6% 的時間處於 Deep Doze 模式。然而 Deep Doze 期間的放電率達 **50.5 mAh/h**（理想值應低於 20 mAh/h），超出預期 2.5 倍。

主要問題：
1. **timerfd 頻繁阻擋 suspend** — 4,698 次 suspend abort（佔全部 abort 的 72%）
2. **Google Mobile Services (GMS) 過度喚醒** — 980 次 alarm wakeup，其中 GCM Heartbeat 659 次
3. **Settings battery periodic job 過於頻繁** — 232 次 wakeup，約每 2.5 分鐘一次
4. **Modem (Sierra EM7590) 持續喚醒系統** — kernel wakelock 持有 12 分 45 秒，qrtr_ws 是最大硬體喚醒源

---

## 2. Power Manager State Snapshot

Bugreport 抓取時刻的電源管理器快照（DUMPSYS POWER）：

| Parameter | Value | Note |
|-----------|-------|------|
| mWakefulness | Dozing | 打盹模式 |
| mIsPowered | true | 正在充電 |
| mPlugType | 1 (USB/AC) | USB 充電 |
| mBatteryLevel | 35% | 電池殘量 |
| mLastSleepReason | timeout | 螢幕逾時自動關閉 |
| mLastWakeTime | 19.3s ago | |
| mLastSleepTime | 8.8s ago | |
| mHoldingWakeLockSuspendBlocker | false | 無 wakelock 阻擋 suspend |
| mHoldingDisplaySuspendBlocker | false | 無 display 阻擋 suspend |
| mDeviceIdleMode | false | 充電中，Doze 未啟動 |
| mUseAutoSuspend | true | 自動 suspend 啟用 |
| mWakeLockSummary | 0x40 | |
| Screen off timeout | 60s (effective 10s) | WindowManager override 為 10s |

### 2.1 Active Wake Locks

快照時僅持有 1 個 wakelock：

```
DOZE_WAKE_LOCK 'dream:doze' ACQ=-7s974ms (uid=1000 pid=1335)
```

此為 Doze 模式正常需要的 wakelock，無異常。

### 2.2 Suspend Blockers

全部 5 個 suspend blocker 的 ref count 均為 0（已釋放）：

| Suspend Blocker | Ref Count |
|----------------|-----------|
| PowerManagerService.Booting | 0 |
| PowerManagerService.WakeLocks | 0 |
| PowerManagerService.Display | 0 |
| PowerManagerService.Broadcasts | 0 |
| PowerManagerService.WirelessChargerDetector | 0 |

**結論**: 快照時刻電源狀態健康，無異常 wakelock 持有或 suspend blocker 殘留。

---

## 3. Battery Statistics (6-Day Period)

### 3.1 Overall Battery Usage

| Metric | Value |
|--------|-------|
| Battery Capacity | 13,668 mAh |
| Total Discharge | 9,071 mAh (62–65%) |
| Start Clock Time | 2026-02-17 13:16:22 |
| Time on Battery | 6d 0h 37m (99.9% realtime) |
| Screen On Time | **8m 43s (0.1%)**, 14 times |
| Screen Off Discharge | **9,025 mAh (99.5%)** |
| Screen On Discharge | 46 mAh (0.5%) |
| Total Partial Wakelock Time | **51m 56s** |
| Total Full Wakelock Time | 7s |
| Connectivity Changes | 142 |

### 3.2 Doze Mode Statistics

| Mode | Duration | Discharge | Discharge Rate |
|------|----------|-----------|----------------|
| Deep Doze (Full Idle) | **5d 21h 10m (97.6%)** | **6,999 mAh** | **50.5 mAh/h** |
| Light Doze | 2h 42m (1.9%) | 241 mAh | 66.5 mAh/h |
| Deep Doze cycles | 74x | longest 6h 0m 2s | |
| Light Doze cycles | 27x | longest 24m 1s | |

### 3.3 Discharge Rate by State

| State | Duration | Discharge | Rate |
|-------|----------|-----------|------|
| Non-Doze, Non-Interactive | 164 min | 2,296 mAh | **839 mAh/h** |
| Non-Doze, Interactive | 20 min | 627 mAh | **1,793 mAh/h** |
| **Deep Doze, Non-Interactive** | **13,161 min** | **11,083 mAh** | **50.5 mAh/h** |
| Deep Doze, Interactive | <1 min | 52 mAh | 6,892 mAh/h |
| Light Doze, Non-Interactive | 265 min | 294 mAh | 66.5 mAh/h |

> **Deep Doze 放電率 50.5 mAh/h 是本報告最關鍵的異常指標。** 以 13,668 mAh 電池容量計算，6 天可耗盡 7,272 mAh，與實際觀測值 6,999 mAh 吻合。理想的 Deep Doze 放電率應低於 20 mAh/h。

### 3.4 Connectivity Power Summary

| Radio | Active Time | Power | Data |
|-------|------------|-------|------|
| Cellular kernel active | 1d 10h 52m (24.1%) | — | Rx 73.5MB / Tx 17.3MB |
| WiFi | Sleep 100% | 0.594 mAh | 0 bytes (not connected) |
| Bluetooth | Idle 1h 37m / Rx 59m / Tx 7s | 44.3 mAh | 0 bytes |
| GPS | — | 1.82 mAh | |

> Cellular 在 6 天中 24.1% 的時間保持 kernel active，LTE 連接 95.3%，OOS (Out of Service) 4.7%。WiFi 未連接（100% sleep），但 scanning 狀態持續。

---

## 4. Kernel Suspend/Resume Analysis

### 4.1 Suspend Cycle Statistics

| Event | Count | Description |
|-------|-------|-------------|
| Suspend entry (s2idle) | **7,286** | 嘗試進入 suspend |
| Pending Wakeup Sources abort | **2,066** | 被 wakeup source 阻擋 (28.3%) |
| Task freezing aborted | **326** | Process 無法凍結 |
| Device failed to suspend | **62** | 全部為 `alarmtimer.0.auto` (EBUSY -16) |

**Suspend 成功率**: ~71.7%（7,286 次嘗試，2,066 + 326 + 62 = 2,454 次失敗）

### 4.2 Suspend Abort — Wakeup Source Breakdown

| Wakeup Source | Abort Count | Percentage | Description |
|--------------|-------------|------------|-------------|
| **timerfd** | **4,698** | **72.0%** | 系統/應用層 timer 不斷觸發 |
| (unnamed) | 1,879 | 28.8% | 無名 wakeup source |
| battery_charger + battery | 49 | 0.8% | PMIC 電池充電 |
| qup_uart (99c000) | 32 | 0.5% | UART 串口 |
| NETLINK | 17 | 0.3% | 網路事件 |
| hal_bluetooth_lock + uart | 17 | 0.3% | BT HAL |
| bq40z50-monitor-info | 10 | 0.2% | 電池電量計 IC |
| em7590_wake_ws | 5 | 0.1% | Modem |

> **timerfd 是 suspend abort 的首要原因**，佔超過 7 成。timerfd 來自 userspace timer，通常對應 AlarmManager 或 timerfd_create 系統呼叫。結合 Alarm Stats 分析，GMS (980 wakeups) 和 Settings (232 wakeups) 是最可能的上層來源。

### 4.3 Last Active Wakeup Source（成功喚醒後）

| Source | Count | Percentage | Description |
|--------|-------|------------|-------------|
| **qrtr_ws** | **260** | **68.6%** | QMI Router — Modem (EM7590) 通訊 |
| eventpoll | 76 | 20.1% | Kernel epoll 事件 |
| Others | 43 | 11.3% | — |

> **qrtr_ws (QMI Router)** 是最頻繁的硬體喚醒源，表示 Modem 與 AP 之間的通訊頻率過高。

### 4.4 Device Suspend Failure

所有 62 次 device suspend 失敗均來自同一裝置：

```
alarmtimer.0.auto failed to suspend: error -16 (EBUSY)
```

error -16 (EBUSY) 表示 alarmtimer 有 pending alarm 無法完成 suspend，為已知的 kernel timer 競爭問題。

---

## 5. Kernel Wake Lock Analysis

### 5.1 Kernel Wake Lock 排行榜

| Rank | Wake Lock | Total Time | Count | Avg Time | Description |
|------|-----------|-----------|-------|----------|-------------|
| 1 | **PowerManagerService.WakeLocks** | **51m 58s** | 1,549 | 2.0s | 上層 partial wakelock 匯總 |
| 2 | **em7590_wake_ws** | **12m 45s** | 66 | 11.6s | Sierra EM7590 LTE Modem |
| 3 | 99c000.qcom,qup_uart | 5m 37s | 617 | 0.5s | Qualcomm UART 串口 |
| 4 | hal_bluetooth_lock | 5m 18s | 419 | 0.8s | BT HAL |
| 5 | bq40z50-monitor-info | 1m 48s | 180 | 0.6s | TI BQ40Z50 電池電量計 |
| 6 | 1-000b | 1m 13s | 1,016 | 0.07s | I2C device |
| 7 | NETLINK | 35s | 3,312 | 0.01s | 網路事件 |
| 8 | alarmtimer | 34s | 17 | 2.0s | 系統鬧鐘 |
| 9 | 4-0028 | 33s | 18 | 1.8s | I2C device |
| 10 | battery_charger (PMIC) | 4s | 70 | 0.06s | PMIC 充電控制 |

> **em7590_wake_ws** 平均每次持有 11.6 秒，表示 Modem 每次喚醒後執行時間較長。**NETLINK** 次數多但單次時間極短（0.01s），影響較小。

---

## 6. Application-Level Partial Wake Lock Analysis

### 6.1 Top Partial Wake Locks

| Rank | Wake Lock | Owner | Total Time | Count |
|------|-----------|-------|-----------|-------|
| 1 | **deviceidle_maint** | system (1000) | **19m 53s** | 65 |
| 2 | *telephony-radio* | system (1000) | 5m 18s | 513 |
| 3 | *telephony-radio* | phone (1001) | 4m 3s | 1,907 |
| 4 | euto:SnetNormal | **GMS (u0a119)** | 3m 45s | 42 |
| 5 | CollectionLib-SigCollector | **GMS (u0a119)** | 3m 13s | 174 |
| 6 | AnyMotionDetector | system (1000) | 2m 38s | 18 |
| 7 | NetworkLocationLocator | **GMS (u0a119)** | 2m 9s | 127 |
| 8 | DynamicCodeLoggingService | system (1000) | 1m 38s | 53 |
| 9 | RILJ_ACK_WL | phone (1001) | 1m 19s | 312 |
| 10 | Play Store (Finsky) | Vending (u0a111) | 1m 1s | 41 |

### 6.2 Per-UID Wakelock Summary

| UID | App | Total Wakelock Time | Main Wakelocks |
|-----|-----|-------------------|----------------|
| 1000 | system | ~30m 33s | deviceidle_maint, telephony, AnyMotionDetector |
| 1001 | phone | ~5m 27s | telephony-radio, RILJ_ACK_WL |
| **u0a119** | **GMS** | **~11m 52s** | SnetNormal, SigCollector, NetworkLocation, GCM |
| u0a111 | Play Store | ~1m 36s | Finsky JobService |
| u0a174 | SystemUI | ~42s | Doze:KeyguardIndication |
| u0a109 | Messages | ~30s | SyncPeriodicWorker |

---

## 7. Alarm Manager Wakeup Analysis

### 7.1 Top Alarm Wakeup Sources

| Rank | App (UID) | Wakeups | Runtime | Top Alarms |
|------|-----------|---------|---------|------------|
| 1 | **GMS (u0a119)** | **980** | 4m 27s | GCM_HEARTBEAT (659), ACTIVITY_DETECTION (200), GCM_RECONNECT (51) |
| 2 | **system (1000)** | **523** | 1m 1s | DeviceIdleController.deep (206), job.deadline (132), DeviceIdleController.light (45) |
| 3 | **Settings (1000)** | **232** | 16s | battery.PERIODIC_JOB_UPDATE (232) |
| 4 | Calendar (u0a57) | 40 | 4s | CalendarProvider2 |
| 5 | Bluetooth (1002) | 35 | 1s | BluetoothMetricsLogger |
| 6 | Calendar (u0a123) | 12 | 5s | CHECK_NOTIFICATIONS |
| 7 | SystemUI (u0a174) | 10 | <1s | DELAYED_KEYGUARD (9), doze_time_tick (1) |
| 8 | Messages (u0a109) | 9 | 1s | ACTION.VIEW |

### 7.2 Alarm Wakeup 分析

- **GMS GCM_HEARTBEAT_ALARM**: 659 次 wakeup（平均每 13 分鐘一次），用於維持 GCM push 連線。在無 WiFi 且 LTE 連線的環境下，heartbeat interval 可能偏短。
- **GMS ACTIVITY_DETECTION**: 200 次（平均每 43 分鐘一次），用於活動偵測。在靜止裝置上仍頻繁執行。
- **Settings PERIODIC_JOB_UPDATE**: 232 次（平均每 37 分鐘一次），觸發頻率異常高。
- **DeviceIdleController.deep**: 206 次，為 Doze 正常的 deep maintenance window。

---

## 8. Device Idle (Doze) State

### 8.1 Doze 機制簡介

Android Doze 分為 **Light Doze** 和 **Deep Doze** 兩層，在裝置閒置時逐步限制背景活動以省電：

- **Light Doze**：螢幕關閉 + 未充電即觸發。限制 job/sync 批次處理，維護窗口間隔 5–30 分鐘。
- **Deep Doze**：螢幕關閉 + 未充電 + **裝置靜止**才觸發。限制更嚴格 — alarm 延遲、wakelock 被忽略、app 網路存取受限（但 Modem 基頻處理器獨立運作，不受 Doze 控制）。維護窗口間隔以指數遞增，從 15 分鐘到最長 6 小時。

```
螢幕關閉 → INACTIVE ─→ Light Idle ⇄ Light Maintenance（5-30m 間隔）
                │
          裝置靜止偵測
                │
                ▼
         SENSING → LOCATING
                │
                ▼
         Deep Idle ⇄ Deep Maintenance（15m → 30m → 1h → 2h → 4h → 6h 遞增）
```

### 8.2 Bugreport 快照狀態

| Parameter | Value | Note |
|-----------|-------|------|
| mState | **ACTIVE** | 因正在充電 |
| mLightState | **ACTIVE** | 因正在充電 |
| mScreenOn | false | 螢幕關閉 |
| mCharging | **true** | 正在充電 — Doze 不啟動 |
| mMotionActive | false | 無動態 |
| mNotMoving | true | 裝置靜止 |
| mDeepEnabled | true | Deep Doze 啟用 |
| mLightEnabled | true | Light Doze 啟用 |
| mMotionSensor | sns_smd Wakeup (Qualcomm) | 使用 QC SMD 動態感測器 |
| mInactiveTimeout | 1m 0s | 進入 inactive 的等待時間 |
| mNextLightIdleDelay | 5m 0s (flex=1m) | |

> 充電時 Doze 不進入 idle 是 Android 預設行為。歷史數據顯示非充電時 Deep Doze 正常運作（97.6% 時間）。

### 8.3 Light Doze 參數（實際值，來自 dumpsys deviceidle Settings）

| Parameter | Value | AOSP Default | Description |
|-----------|-------|-------------|-------------|
| `light_after_inactive_to` | **1m** | 3m | 螢幕關閉後多久進入 Light Idle |
| `light_idle_to` | **5m** | 5m | 第一次 Light Idle 持續時間 |
| `light_idle_to_initial_flex` | 1m | 1m | 第一次 idle 的彈性時間 |
| `light_idle_factor` | 2.0 | 2.0 | 每次 idle 時間乘以此倍數 |
| `light_idle_increase_linearly` | **true** | false | 線性遞增（取代指數遞增） |
| `light_idle_linear_increase_factor_ms` | **300000 (5m)** | — | 每次增加 5 分鐘 |
| `light_max_idle_to` | **30m** | 15m | idle 時間上限（加倍至 30m） |
| `light_max_idle_to_flex` | 15m | — | 上限彈性時間 |
| `light_idle_maintenance_min_budget` | 1m | 1m | 維護窗口最短時間 |
| `light_idle_maintenance_max_budget` | 5m | 5m | 維護窗口最長時間 |

**Light Doze 維護窗口時間線**（線性遞增模式）：
```
5m → 10m → 15m → 20m → 25m → 30m (上限，之後都是 30m)
```

### 8.4 Deep Doze 參數（實際值）

| Parameter | Value | AOSP Default | Description |
|-----------|-------|-------------|-------------|
| `inactive_to` | **1m** | 30m | 螢幕關閉後進入 inactive 的等待時間 |
| `sensing_to` | 30s | 4m | 動態感測持續時間 |
| `locating_to` | 15s | 30s | 定位持續時間 |
| `motion_inactive_to` | **10m** | 10m | 偵測到靜止後等待時間 |
| `motion_inactive_to_flex` | 1m | — | 彈性時間 |
| `idle_after_inactive_to` | **1m** | 30m | 確認靜止後進入 idle 的等待 |
| `idle_pending_to` | 5m | 5m | 維護窗口結束後等多久再進 idle |
| `max_idle_pending_to` | 10m | 10m | idle_pending 上限 |
| `idle_pending_factor` | 2.0 | 2.0 | idle_pending 每次遞增倍數 |
| `idle_to` | **15m** | 60m | 第一次 Deep Idle 持續時間 |
| `idle_factor` | 2.0 | 2.0 | 每次 idle 時間乘以此倍數 |
| `max_idle_to` | **6h** | 6h | idle 時間上限 |
| `min_time_to_alarm` | 1h | 1h | 最少 idle 時間（有 alarm 時） |
| `quick_doze_delay_to` | 1m | 1m | 快速 Doze 延遲 |
| `wait_for_unlock` | true | true | 等待解鎖後才完全退出 Doze |

**Deep Doze 維護窗口時間線**（指數遞增）：
```
15m → 30m → 1h → 2h → 4h → 6h (上限，之後每 6h 開一次)
```

> 注意：本裝置的 `inactive_to` 和 `idle_after_inactive_to` 已從 AOSP 預設的 30 分鐘縮短為 1 分鐘，`idle_to` 從 60 分鐘縮短為 15 分鐘，表示裝置被設定為**更快進入 Deep Doze**。這可能是為了在工業/企業場景中加速省電。

### 8.5 Deep Doze Idling 歷史（最近 9 筆紀錄）

從 `dumpsys deviceidle` 的 Idling history 可看到最近的 Deep Doze cycle 間隔：

```
deep-idle:  -1d16h12m   ← 進入 idle
deep-maint: -1d15h12m   ← 維護窗口 (idle 了 1h)
deep-idle:  -1d15h12m   ← 回到 idle
deep-maint: -1d13h12m   ← 維護窗口 (idle 了 2h)
deep-idle:  -1d13h10m   ← 回到 idle
deep-maint: -1d9h10m    ← 維護窗口 (idle 了 ~4h)
deep-idle:  -1d9h10m    ← 回到 idle
deep-maint: -1d3h10m    ← 維護窗口 (idle 了 6h — 到達上限)
deep-idle:  -1d3h9m     ← 回到 idle
```

**實際觀測的遞增模式**：1h → 2h → 4h → 6h，與 `idle_to=15m, idle_factor=2.0, max_idle_to=6h` 的設定吻合（此段紀錄從較後面的 cycle 開始，前面的 15m/30m 已被覆蓋）。

### 8.6 Doze 控制指令參考

```bash
# 關閉 Deep Doze（保留 Light Doze）
adb shell dumpsys deviceidle disable deep

# 關閉全部 Doze
adb shell dumpsys deviceidle disable

# 重新啟用
adb shell dumpsys deviceidle enable all

# 強制進入 Deep Idle（測試用）
adb shell dumpsys deviceidle force-idle deep

# 查看當前狀態
adb shell dumpsys deviceidle get deep
adb shell dumpsys deviceidle get light
```

---

## 9. Estimated Power Consumption by Component

| Component | Estimated Power (mAh) | Note |
|-----------|----------------------|------|
| CPU | 97.7 | |
| Screen | 56.9 | 僅 8m 43s |
| Bluetooth | 44.3 | Rx 59 min |
| Sensors | 9.93 | GMS location sensors |
| GPS/GNSS | 1.82 | |
| WiFi | 0.594 | 未連接但持續掃描 |
| Wakelock overhead | 0.152 | |
| Idle baseline | 0.167 | |
| **Computed Total** | **~211 mAh** | 僅計入以上組件 |
| **Actual Discharge** | **8,474–8,884 mAh** | 差距極大 |

> Computed drain (211 mAh) 與 actual drain (8,474–8,884 mAh) 差距巨大，表示 **大部分功耗來自未被 BatteryStats 追蹤的來源**，最可能是 Modem (cellular radio) 基頻處理器的持續耗電。mobile_radio 的估算值出現負數（Android 已知的 power profile 校準問題），進一步證實 cellular radio power model 不準確。

---

## 10. Findings & Recommendations

### 10.1 Critical Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 1 | **Deep Doze 放電率過高** | 50.5 mAh/h（理想 <20） | Battery Stats drain analysis | 調查 cellular modem 和 timerfd 的交互影響 |
| 2 | **timerfd 大量阻擋 suspend** | 4,698 次 abort（72%） | Kernel suspend abort logs | 追蹤哪些 userspace process 建立了高頻 timerfd |
| 3 | **Cellular radio 功耗異常** | BatteryStats 無法正確估算 | Computed vs actual drain 差異 8,000+ mAh | 檢查 modem power profile、EM7590 firmware 版本 |

### 10.2 High Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 4 | **GMS GCM Heartbeat 過頻** | 659 wakeups / 6 days | Alarm Stats | 調整 GCM heartbeat interval，或確認網路環境是否導致頻繁重連 |
| 5 | **Settings battery periodic job** | 232 wakeups / 6 days | Alarm Stats | 檢查 `com.android.settings.battery.action.PERIODIC_JOB_UPDATE` 的觸發邏輯 |
| 6 | **Modem EM7590 wakelock** | 12m 45s kernel wakelock | Kernel wake locks | 檢查 EM7590 firmware 的 sleep/wakeup 行為和 AT command keepalive 設定 |
| 7 | **qrtr_ws 頻繁喚醒** | 69% 的硬體喚醒來源 | Last active wakeup source | 減少 AP-Modem QMI 通訊頻率 |

### 10.3 Medium Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 8 | GMS location/sensor collection | ~12m wakelock, 174 SigCollector calls | Partial wake locks | 評估是否需要 GMS location 服務 |
| 9 | WiFi scanning in disconnected state | 100% scanning | Connectivity stats | 若不需 WiFi，考慮關閉 WiFi scanning |
| 10 | alarmtimer suspend failure | 62 次 EBUSY | Device suspend logs | 已知 kernel 問題，影響較小 |

---

## 11. Data Sources Used

本報告所有數據均來自同一份 bugreport 檔案，未使用其他資料來源：

| Section | Location in Bugreport | Lines |
|---------|----------------------|-------|
| POWER MANAGER (dumpsys power) | DUMPSYS CRITICAL | 9321–13195 |
| Battery Stats (dumpsys batterystats) | DUMPSYS | 1903305–1907007 |
| Alarm Manager (dumpsys alarm) | DUMPSYS HIGH | 1833131–1833299 |
| Device Idle (dumpsys deviceidle) | DUMPSYS HIGH | 1940770–1940796 |
| KERNEL LOG (logcat -b kernel) | KERNEL LOG section | — |
| CHECKIN BATTERYSTATS | Dedicated section | 2069464–2098950 |

**Bugreport file**: `phone-anr-bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.zip` (31 MB)
**Main text file**: `bugreport-T70-AQ3A.250408.001-2026-02-23-14-00-41.txt` (241 MB, 2,192,700 lines)
