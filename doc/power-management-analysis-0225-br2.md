# Power Management Analysis Report

**Bugreport**: `bugreport-T70-AQ3A.250408.001-2026-02-25-08-54-53.zip`
**Device**: Trimble T70, Android 15 (API 35), Qualcomm SoC
**Build**: `AQ3A.250408.001` (user), build 02.01.04.260212
**Analysis Date**: 2026-02-25
**Statistics Period**: 2026-02-24 18:35 ~ 2026-02-25 08:54 (**14 小時 55 分**)

> **注意**：本 bugreport 與 BR1（08-51-45）來自同一裝置，採集時間僅相差 3 分鐘。統計期間起始時間幾乎相同（18:35 vs 18:36），但本次多了一次系統重啟（System starts: 3 vs 2），統計期間略長 40 分鐘。

---

## 1. Executive Summary

本裝置在 14 小時 55 分的統計期間內，螢幕開啟 12 分 29 秒（1.4%），96.8% 的時間處於 Deep Doze 模式。Deep Doze 期間的放電率為 **79.9 mAh/h**（理想值 <20 mAh/h），超出預期 4 倍。

主要問題：
1. **Deep Doze 放電率過高** — 79.9 mAh/h，14.4 小時 Deep Doze 消耗 1,154 mAh（佔總放電 86.3%）
2. **timerfd 大量阻擋 suspend** — 532 次 abort source，佔全部 94.3%
3. **Modem EM7590 wakelock** — em7590_wake_ws 持有 48.8 秒，平均每次 12.21 秒，表示 Modem 喚醒後執行時間長
4. **Cellular OOS 時間偏高** — 13.1% 的時間無服務（1 小時 56 分），可能導致 modem 搜網功耗
5. **ipa_pm_notify 過量錯誤日誌** — 佔所有 E/F level 日誌的 65%，IPA (Internet Protocol Accelerator) 電源管理異常

### 與 BR1（08-51-45）比較

| 指標 | BR1 (08:51) | BR2 (08:54) | 差異 |
|------|-------------|-------------|------|
| Battery Level | 7% | 12% | +5% |
| System Starts | 2 | 3 | +1 重啟 |
| Deep Doze Rate | 93.0 mAh/h | 79.9 mAh/h | -14% 改善 |
| Screen On Time | 2m 11s | 12m 29s | +10m |
| WiFi Rx Data | 314.97 MB | 181.13 MB | -42% |
| Cellular OOS | 6.6% | **13.1%** | +2x |
| Deep Doze Discharge | 1,312 mAh | 1,154 mAh | -12% |

> BR2 Deep Doze 放電率較低（79.9 vs 93.0）可能與 WiFi 數據傳輸量減少（181 MB vs 315 MB）有關。但 Cellular OOS 時間倍增（13.1% vs 6.6%），表示網路環境不穩定。

---

## 2. Power Manager State Snapshot

| Parameter | Value | Note |
|-----------|-------|------|
| mWakefulness | Awake | 清醒狀態 |
| mIsPowered | true | 正在充電 |
| mPlugType | 2 (USB) | USB 充電 |
| mBatteryLevel | 12% | |
| mLastSleepReason | timeout | 螢幕逾時關閉 |
| mUseAutoSuspend | false | |

### 2.1 Active Wake Locks

快照時持有 1 個 wakelock：

```
PARTIAL_WAKE_LOCK '*job*/@androidx.work.systemjobscheduler@com.google.android.apps.messaging/
  androidx.work.impl.background.systemjob.SystemJobService' uid=1000 pid=1514 -16s887ms
```

此為 Google Messages 的 WorkManager 排程 job，持有 16 秒，可能在執行同步作業。

### 2.2 Suspend Blockers

| Suspend Blocker | Ref Count | Note |
|----------------|-----------|------|
| PowerManagerService.Booting | 0 | 已釋放 |
| PowerManagerService.WakeLocks | **1** | 持有中（Messages job） |
| PowerManagerService.Display | **1** | 持有中（螢幕開啟） |
| PowerManagerService.Broadcasts | 0 | 已釋放 |
| PowerManagerService.WirelessChargerDetector | 0 | 已釋放 |

---

## 3. Battery Statistics (14h 55m Period)

### 3.1 Overall Battery Usage

| Metric | Value |
|--------|-------|
| Battery Capacity | 12,400 mAh (estimated) |
| Learned Capacity | 13,668 mAh |
| Total Discharge | 1,337 mAh |
| Start Clock Time | 2026-02-24 18:35:17 |
| Time on Battery | 14h 55m 14s (99.8% realtime) |
| Screen On Time | **12m 29s (1.4%)**, 8 times |
| Screen Off Discharge | **1,212 mAh (90.6%)** |
| Screen On Discharge | 125 mAh (9.4%) |
| Total Partial Wakelock Time | **6m 42s** |
| Total Full Wakelock Time | 22s |
| System Starts | 3 |
| Connectivity Changes | 31 |

### 3.2 Doze Mode Statistics

| Mode | Duration | Discharge | Discharge Rate |
|------|----------|-----------|----------------|
| Deep Doze (Full Idle) | **14h 26m 26s (96.8%)** | **1,154 mAh** | **79.9 mAh/h** |
| Light Doze | 7m 17s (0.8%) | 0 mAh | — |
| Deep Doze cycles | 9x | longest 6h 0m 0s | |
| Light Doze cycles | 3x | longest 2m 26s | |

> **Deep Doze 放電率 79.9 mAh/h 仍遠超理想值（<20 mAh/h）。** Light Doze 0 mAh discharge 可能為統計誤差或 Light Doze 期間恰好未消耗。Deep Doze 消耗 1,154 mAh 佔總放電 86.3%。

### 3.3 Connectivity Power Summary

| Radio | Active Time | Power | Data |
|-------|------------|-------|------|
| Cellular kernel active | 1h 12m 25s (8.1%) | 22.7 mAh | Rx 140.43 MB / Tx 3.47 MB |
| WiFi kernel active | **7h 29m 36s (50.2%)** | 5.42 mAh | **Rx 181.13 MB / Tx 6.79 MB** |
| Bluetooth | Idle 10m / Rx 5m 12s / Tx 1s | 4.40 mAh | 0 bytes |
| GPS | — | 0.252 mAh | |

| Cellular RAT | Duration | Percentage |
|-------------|----------|------------|
| LTE | 12h 57m 22s | **86.8%** |
| OOS (Out of Service) | **1h 56m 58s** | **13.1%** |

| Cellular Signal (RSRP) | Duration | Percentage |
|------------------------|----------|------------|
| Great (> -98 dBm) | 13h 16m 37s | 89.0% |
| Very Poor (< -128 dBm) | **1h 37m 36s** | **10.9%** |

> Cellular OOS 佔 13.1%（BR1 僅 6.6%），very poor 信號佔 10.9%（BR1 僅 5.8%）。較高的 OOS 和弱信號時間意味著 modem 需要更頻繁搜網，增加功耗。WiFi 仍接收 181 MB 數據，kernel active 50.2%。

---

## 4. Kernel Suspend/Resume Analysis

> **注意**：本 bugreport 為 `user` build，kernel 日誌量極為有限。PM suspend entry 計數為 0，表示 user build 未記錄標準 suspend entry/exit log。

### 4.1 Suspend Cycle Statistics

| Event | Count | Description |
|-------|-------|-------------|
| Suspend entry | **0** | user build 未記錄（不代表無 suspend） |
| Pending Wakeup Sources abort | **294** | 被 wakeup source 阻擋 |
| Task freezing aborted | **5** | Process 無法凍結 |
| Device failed to suspend | **4** | |

### 4.2 Suspend Abort — Wakeup Source Breakdown

| Wakeup Source | Abort Count | Percentage | Description |
|--------------|-------------|------------|-------------|
| **timerfd** | **532** | **94.3%** | 系統/應用層 timer 觸發 |
| bq40z50-monitor-info | 10 | 1.8% | TI BQ40Z50 電池電量計 IC |
| battery_charger (PMIC) | 10 | 1.8% | PMIC 充電控制 |
| battery | 8 | 1.4% | 電池狀態變化 |
| NETLINK | 8 | 1.4% | 網路事件 |
| usb | 2 | 0.4% | USB 事件 |

> timerfd 佔比與 BR1 完全一致（94.3%），確認 userspace timer 是系統性的 suspend abort 主因。bq40z50-monitor-info（電池電量計 IC）在本次出現 10 次 abort，在 BR1 中未出現。

---

## 5. Kernel Wake Lock Analysis

### 5.1 Kernel Wake Lock 排行榜

| Rank | Wake Lock | Total Time | Count | Avg Time | Description |
|------|-----------|-----------|-------|----------|-------------|
| 1 | **PowerManagerService.WakeLocks** | **6m 43s** | 295 | 1.37s | 上層 partial wakelock 匯總 |
| 2 | qcom_rx_wakelock | 1m 37s | 594 | 0.16s | Qualcomm modem RX 喚醒 |
| 3 | **bq40z50-monitor-info** | **1m 1s** | 109 | 0.57s | TI BQ40Z50 電池電量計 |
| 4 | **em7590_wake_ws** | **48.8s** | 4 | **12.21s** | Sierra EM7590 LTE Modem |
| 5 | hal_bluetooth_lock | 20.1s | 18 | 1.12s | BT HAL |
| 6 | NETLINK | 15.7s | 957 | 0.02s | 網路事件通知 |
| 7 | PowerManagerService.Display | 8.5s | 8 | 1.06s | 螢幕 suspend blocker |
| 8 | PowerManager.SuspendLockout | 8.3s | 0 | — | Suspend lockout |
| 9 | PowerManagerService.Booting | 7.4s | 0 | — | 開機 suspend blocker |
| 10 | **1-000b** | **7.3s** | 108 | 0.07s | I2C device (bus 1, addr 0x0b) |

### 5.2 重要觀察

- **em7590_wake_ws**（Sierra EM7590 LTE Modem）：僅 4 次觸發但平均持有 12.21 秒，與先前 6 天報告（66 次, avg 11.6s）模式一致。Modem 每次喚醒後需要較長時間處理，可能與 firmware 的 sleep/wakeup cycle 設計有關。
- **bq40z50-monitor-info**（TI BQ40Z50 電池電量計）：109 次觸發, 持有 1 分 1 秒。此為電池 gauge IC 的 I2C 監控，頻率偏高（平均每 8 分鐘一次）。
- **1-000b**（I2C bus 1, address 0x0b）：108 次，與 bq40z50 觸發次數幾乎一致，可能是同一硬體。I2C address 0x0b 是 BQ40Z50 的標準 SMBus 地址，確認兩者為同一裝置。
- **qcom_rx_wakelock**：594 次（BR1 為 1,205 次），減少 ~50%，與 WiFi 流量降低一致。

---

## 6. Application-Level Partial Wake Lock Analysis

### 6.1 Top Partial Wake Locks

| Rank | Wake Lock | Owner | Total Time | Count |
|------|-----------|-------|-----------|-------|
| 1 | **deviceidle_maint** | system (1000) | **2m 0s** | 6 |
| 2 | *job*/AiAiPersistentDownloadJobService | Google AI (u0a114) | **58s** | 2 |
| 3 | *telephony-radio* | system (1000) | 34s | 33 |
| 4 | *job*/SystemJobService (Messages) | Messages (u0a109) | **28s** | 17 |
| 5 | **AnyMotionDetector** | system (1000) | **27s** | 3 |
| 6 | *telephony-radio* | phone (1001) | 26s | 232 |
| 7 | NotificationManagerService:post | SystemUI (u0a172) | 17s | 92 |
| 8 | *job*/PhoneskyJobService (Background) | Play Store (u0a113) | 17s | 18 |
| 9 | CollectionLib-SigCollector | **GMS (u0a116)** | 14s | 12 |
| 10 | SyncPeriodicWorker (Messages) | Messages (u0a109) | 8s | 5 |

### 6.2 Per-UID Wakelock Summary

| UID | App | Total Wakelock Time | Main Wakelocks |
|-----|-----|-------------------|----------------|
| 1000 | system | ~3m 8s | deviceidle_maint, telephony-radio, AnyMotionDetector, NetworkLocation |
| u0a114 | Google AI (AS) | ~59s | AiAiPersistentDownloadJobService |
| u0a109 | Messages | ~37s | SystemJobService, SyncPeriodicWorker |
| 1001 | phone | ~28s | telephony-radio (232x), RILJ_ACK_WL |
| u0a116 | **GMS** | **~30s** | SigCollector, Checkin, WaitDownload, GCM |
| u0a113 | Play Store | ~18s | PhoneskyJobService |

> Partial wakelock 總時間 6m 42s，佔電池時間 0.7%，屬正常範圍。deviceidle_maint（Doze 維護窗口 wakelock）穩定在 ~2 分鐘，兩份 BR 一致。

---

## 7. Alarm Manager Wakeup Analysis

### 7.1 Top Alarm Wakeup Sources

| Rank | App (UID) | Wakeups | Top Alarms |
|------|-----------|---------|------------|
| 1 | **system (1000) / android** | **31** | TIME_TICK |
| 2 | **GMS (u0a116)** | **30** | GCM_HEARTBEAT |
| 3 | **Settings (1000)** | **14** | battery.PERIODIC_JOB_UPDATE |
| 4 | networkstack (1073) | 4 | DhcpClient.wlan0.RENEW |
| 5 | Calendar (u0a60) | 4 | CalendarProvider2 |
| 6 | Bluetooth (1002) | 2 | BluetoothMetricsLogger |
| 7 | LTE BC (u0a161) | 1 | wake_up_from_boot |

### 7.2 Alarm Wakeup 分析

- **TIME_TICK**: 31 次（平均每 29 分鐘一次），系統時鐘更新。BR1 為 23 次，本次略高。
- **GMS GCM_HEARTBEAT**: 30 次（平均每 30 分鐘一次），GCM push 心跳。BR1 為 40 次，本次降低但統計期間更長。
- **Settings PERIODIC_JOB_UPDATE**: 14 次（與 BR1 相同），穩定的電池監控 job。
- 整體 alarm wakeup 頻率：86 次/14.9 小時 = 5.8 次/小時，與 BR1（6.1 次/小時）接近。

---

## 8. Device Idle (Doze) State

### 8.1 Bugreport 快照狀態

| Parameter | Value | Note |
|-----------|-------|------|
| mState | **ACTIVE** | 因正在充電 |
| mLightState | **ACTIVE** | 因正在充電 |
| mScreenOn | true | 螢幕開啟 |
| mCharging | **true** | 正在充電 |
| mDeepEnabled | true | Deep Doze 啟用 |
| mLightEnabled | true | Light Doze 啟用 |

### 8.2 Doze 參數設定

（與 BR1 完全一致，同一裝置。）

| Parameter | Value | AOSP Default | Diff |
|-----------|-------|-------------|------|
| `inactive_to` | **1m** | 30m | **縮短 30x** |
| `idle_to` | **15m** | 60m | **縮短 4x** |
| `idle_factor` | 2.0 | 2.0 | 相同 |
| `max_idle_to` | 6h | 6h | 相同 |
| `light_idle_to` | 5m | 5m | 相同 |
| `light_max_idle_to` | **30m** | 15m | **延長 2x** |
| `light_idle_factor` | 2.0 | 2.0 | 相同 |

---

## 9. Estimated Power Consumption by Component

| Component | Estimated Power (mAh) | Note |
|-----------|----------------------|------|
| Screen | 83.4 | 12m 29s（BR1 僅 13.9 for 2m 11s） |
| Mobile Radio | 19.7 | Cellular active 8.1% |
| WiFi | 5.42 | 181 MB Rx, WiFi active 50.2% |
| Bluetooth | 4.40 | Rx 5m 12s |
| Sensors | 0.83 | |
| GPS/GNSS | 0.25 | |
| Wakelock overhead | 0.011 | |
| Idle baseline | 0.038 | |
| **Computed Total** | **~114 mAh** | |
| **Actual Discharge** | **1,093–1,367 mAh** | 差距 ~10x |

### 9.1 Top Power Consuming UIDs

| UID | App | Power (mAh) | Main Source |
|-----|-----|------------|-------------|
| u0a162 | — | **79.0** | screen (9m 52s) — 可能是前台重度使用 app |
| 1073 | networkstack | 3.66 | mobile_radio (14m) |
| u0a116 | GMS | 3.08 | sensors (7h 43m), mobile_radio |
| 1051 | — | 2.34 | mobile_radio (9m) |
| u0a109 | Messages | 2.11 | screen (15s) |
| u0a169 | — | 1.56 | screen (11s) |
| 1000 | system | 0.52 | sensors (7h 53m), GNSS (33s) |

> UID u0a162 佔 screen power 的 79.0 mAh（9m 52s），為最大的螢幕功耗來源。Computed drain vs actual drain 差距 ~10 倍，仍反映 power profile 校準不足。

---

## 10. Additional Observations

### 10.1 ipa_pm_notify 過量錯誤日誌

本 bugreport 檢出 `ipa_pm_notify` tag 佔 E/F level 日誌的 **65%**。IPA (Internet Protocol Accelerator) 是 Qualcomm SoC 的硬體加速器，負責網路封包處理。`ipa_pm_notify` 錯誤表示 IPA 電源管理狀態轉換異常。

可能原因：
- IPA driver 在 suspend/resume cycle 中的狀態不一致
- WiFi 或 Cellular 流量觸發 IPA 喚醒失敗
- 與高 OOS 時間（13.1%）導致的頻繁網路狀態變化有關

### 10.2 bq40z50 電池電量計活動

bq40z50-monitor-info 在 BR2 出現為第 3 大 kernel wakelock（1m 1s, 109 次），但在 BR1 未進入 top 10。此 IC 透過 I2C/SMBus（bus 1, addr 0x0b）與 AP 通訊，提供電池電壓、溫度、充電狀態等資訊。109 次觸發（平均每 8 分鐘）的頻率偏高，可能與充電狀態監控有關。

### 10.3 Task Freezing Aborted

BR2 出現 5 次 task freezing abort（BR1 為 0），表示部分 process 在 suspend 時無法被凍結。這可能與額外的系統重啟（System starts: 3）有關。

---

## 11. Findings & Recommendations

### 11.1 Critical Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 1 | **Deep Doze 放電率過高** | 79.9 mAh/h（理想 <20） | 14.4h Deep Doze 消耗 1,154 mAh | 排查 WiFi 背景流量 + modem 搜網行為 |
| 2 | **timerfd 阻擋 suspend** | 532 次 abort（94.3%） | Suspend abort breakdown | 使用 `userdebug` build 追蹤 timerfd 來源 |

### 11.2 High Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 3 | **Cellular OOS 13.1%** | 近 2 小時無服務 | RAT breakdown | 檢查 modem 天線和 APN 設定，排查信號覆蓋 |
| 4 | **ipa_pm_notify 錯誤** | 佔 65% E/F 日誌 | Insight: Excessive Error Logs | 更新 IPA driver 或檢查 IPA power domain 配置 |
| 5 | **em7590_wake_ws 長時間持有** | avg 12.21s per wake | Kernel wakelocks | 檢查 EM7590 firmware sleep/wakeup cycle |
| 6 | **WiFi Deep Doze 背景流量** | 181 MB Rx | Connectivity stats | 識別 Doze 期間下載數據的 app |

### 11.3 Medium Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 7 | bq40z50 頻繁 I2C 喚醒 | 109 次/14h | Kernel wakelocks | 評估電池監控頻率是否可降低 |
| 8 | Power profile 不準確 | Computed vs actual 差 10x | Estimated power | 校準 WiFi + cellular power model |
| 9 | 3 次 system starts | 系統穩定性 | Battery stats | 調查額外重啟原因 |

---

## 12. Cross-Report Summary (BR1 vs BR2)

兩份 bugreport 來自**同一裝置、同一統計週期**（差異僅 3 分鐘），提供了同一場景的交叉驗證：

### 一致性觀察（高信賴度）

| 指標 | BR1 | BR2 | 結論 |
|------|-----|-----|------|
| timerfd 佔 abort 比例 | 94.3% | 94.3% | **timerfd 是系統性問題** |
| Alarm wakeup 頻率 | 6.1/h | 5.8/h | 穩定一致 |
| deviceidle_maint time | 2m 15s | 2m 0s | Doze 維護窗口行為正常 |
| Doze settings | 全部相同 | 全部相同 | 無設定變動 |
| GMS alarm pattern | 40 wakeups | 30 wakeups | GCM heartbeat 穩定 |

### 差異觀察（需進一步調查）

| 指標 | BR1 | BR2 | 可能原因 |
|------|-----|-----|---------|
| Deep Doze 放電率 | 93.0 | 79.9 | WiFi 流量差異（315 vs 181 MB） |
| WiFi Rx | 315 MB | 181 MB | BR1 期間有大量下載 |
| Cellular OOS | 6.6% | 13.1% | 網路環境波動 |
| qcom_rx_wakelock | 1,205x | 594x | 與流量正相關 |
| System starts | 2 | 3 | BR2 多一次重啟 |
| ipa_pm_notify | 未報告 | 65% E/F | 可能與 OOS 或重啟有關 |

### 結論

**Deep Doze 放電率過高是此裝置的核心問題**，在兩份 bugreport 中一致呈現（79.9–93.0 mAh/h）。主要貢獻因素依序為：

1. **WiFi 背景流量**（181–315 MB）在 Doze 期間持續傳輸
2. **timerfd 阻擋 suspend**（94.3%），系統無法有效進入深度休眠
3. **Modem 喚醒**（em7590_wake_ws + qcom_rx_wakelock）
4. **Cellular 搜網**（6.6–13.1% OOS 時間）

建議使用 `userdebug` build 重新採集 bugreport 以取得完整的 kernel suspend 日誌，進一步定位 timerfd 來源和 modem 喚醒的根因。

---

## 13. Data Sources Used

| Section | Data Source |
|---------|------------|
| Power Manager (dumpsys power) | DUMPSYS POWER section |
| Battery Stats (dumpsys batterystats) | DUMPSYS BATTERYSTATS section |
| Alarm Manager (dumpsys alarm) | DUMPSYS ALARM section |
| Device Idle (dumpsys deviceidle) | DUMPSYS DEVICEIDLE section |
| Kernel Suspend | KERNEL LOG section (limited in user build) |
| Kernel Wake Locks | CHECKIN BATTERYSTATS (kwl entries) |

**Bugreport file**: `bugreport-T70-AQ3A.250408.001-2026-02-25-08-54-53.zip` (6.4 MB)
**Build type**: `user`（kernel 日誌量有限）
