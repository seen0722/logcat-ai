# Power Management Analysis Report

**Bugreport**: `bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip`
**Device**: Trimble T70, Android 15 (API 35), Qualcomm SoC
**Build**: `AQ3A.250408.001` (user), build 02.01.01.260119
**Analysis Date**: 2026-02-25
**Statistics Period**: 2026-01-27 14:52 ~ 2026-01-27 15:33 (**41 分鐘**)

---

## 1. Executive Summary

本裝置在 41 分鐘的統計期間內，螢幕開啟 10 分 6 秒（24.3%），58% 的時間處於 Deep Doze 模式。儘管統計週期極短，Deep Doze 期間的放電率達 **132.2 mAh/h**（理想值應低於 20 mAh/h），超出預期 6.6 倍。

主要問題：
1. **Deep Doze 放電率極高** — 132.2 mAh/h，24 分鐘 Deep Doze 消耗 53 mAh（佔總放電 38.7%）
2. **IGnss HAL 導致 ANR** — system_server 的 `android.fg` 執行緒被 IGnss Binder call 阻塞 15 秒（×2）
3. **timerfd 阻擋 suspend** — 69 次 abort source（佔 100% 的 abort source breakdown）
4. **WiFi 背景流量** — 41 分鐘內接收 13.83 MB，WiFi kernel active 68.9%

> **重要提示**：本報告統計週期僅 41 分鐘，屬於系統啟動初期。短週期數據波動較大，Deep Doze 放電率可能被初始化活動（GMS 更新、dexopt）放大。建議與長期報告交叉比對。

---

## 2. Power Manager State Snapshot

Bugreport 抓取時刻的電源管理器快照（DUMPSYS POWER）：

| Parameter | Value | Note |
|-----------|-------|------|
| mWakefulness | **Awake** | 清醒狀態 |
| mIsPowered | false | 未充電 |
| mPlugType | 0 | 未接電源 |
| mBatteryLevel | **100%** | 電池滿電 |
| mLastSleepReason | timeout | 螢幕逾時自動關閉 |
| mUseAutoSuspend | false | 自動 suspend 未啟用 |
| mDeviceIdleMode | — | 未報告（Awake 狀態） |

### 2.1 Active Wake Locks

快照時無任何 active wake lock。

### 2.2 Suspend Blockers

| Suspend Blocker | Ref Count | Note |
|----------------|-----------|------|
| PowerManagerService.Booting | 0 | 已釋放 |
| PowerManagerService.WakeLocks | **1** | 持有中 |
| PowerManagerService.Display | **1** | 持有中（螢幕開啟） |
| PowerManagerService.Broadcasts | 0 | 已釋放 |
| PowerManagerService.WirelessChargerDetector | 0 | 已釋放 |

**結論**: WakeLocks 和 Display suspend blocker 持有中，因為裝置正在 Awake 狀態（螢幕開啟中），屬正常行為。

---

## 3. Battery Statistics (41 分鐘)

### 3.1 Overall Battery Usage

| Metric | Value |
|--------|-------|
| Battery Capacity | 13,679 mAh |
| Total Discharge | 137 mAh |
| Start Clock Time | 2026-01-27 14:52:29 |
| Time on Battery | 41m 29s (100.0% realtime) |
| Screen On Time | **10m 6s (24.3%)**, 3 times |
| Screen Off Discharge | 84 mAh (61.3%) |
| Screen On Discharge | 53 mAh (38.7%) |
| Total Partial Wakelock Time | 1m 2s |
| Total Full Wakelock Time | 8s |
| Connectivity Changes | 7 |

### 3.2 Doze Mode Statistics

| Mode | Duration | Discharge | Discharge Rate |
|------|----------|-----------|----------------|
| Deep Doze (Full Idle) | **24m 3s (58.0%)** | **53 mAh** | **132.2 mAh/h** |
| Light Doze | 4m 47s (11.5%) | 0 mAh | 0 mAh/h |
| Deep Doze cycles | 3x | longest 15m 0s | |
| Light Doze cycles | 2x | longest 2m 26s | |

> **Deep Doze 放電率 132.2 mAh/h 是本報告最關鍵的異常指標。** 但需注意：統計僅 24 分鐘的 Deep Doze 時間，短期數據易受系統啟動初期活動（GMS 初始化、WiFi 連線）影響。此數值可能隨時間延長而趨向平穩（參考 Phone-ANR 報告 6 天平均為 50.5 mAh/h）。

### 3.3 Connectivity Power Summary

| Radio | Active Time | Power | Data |
|-------|------------|-------|------|
| Cellular kernel active | 0ms (0%) | 0.012 mAh | Rx 0B / Tx 0B |
| WiFi kernel active | **28m 35s (68.9%)** | 1.08 mAh | **Rx 13.83MB / Tx 2.54MB** |
| Bluetooth | Idle 36s / Rx 2m 23s / Tx 15s | 1.02 mAh | 0 bytes |
| GPS | — | 0.691 mAh | |

| Cellular Signal (RSRP) | Duration | Percentage |
|------------------------|----------|------------|
| Moderate (-118 to -108 dBm) | 41m 29s | **100%** |

| WiFi Signal (RSSI) | Duration | Percentage |
|--------------------|----------|------------|
| Great (> -55 dBm) | 41m 23s | **99.7%** |
| Good (-66 to -55 dBm) | 6s | 0.3% |

> WiFi kernel active 68.9% 且接收 13.83 MB，在僅 41 分鐘內活動量相當高。Cellular 完全沒有 data activity（僅有 sleep 和 RSRP 報告），所有數據流量都走 WiFi。Cellular 信號 100% 在 moderate 範圍，可能未安裝 SIM 卡或未註冊網路。

---

## 4. Kernel Suspend/Resume Analysis

> **注意**：本 bugreport 為 `user` build，kernel 日誌量有限，suspend 統計數據不如 userdebug build 完整。

### 4.1 Suspend Cycle Statistics

| Event | Count | Description |
|-------|-------|-------------|
| Suspend entry | **21** | 嘗試進入 suspend |
| Pending Wakeup Sources abort | **35** | 被 wakeup source 阻擋 |
| Task freezing aborted | 1 | Process 無法凍結 |
| Device failed to suspend | **6** | 裝置層級 suspend 失敗 |

### 4.2 Suspend Abort — Wakeup Source Breakdown

| Wakeup Source | Abort Count | Percentage | Description |
|--------------|-------------|------------|-------------|
| **[timerfd]** | **69** | **100%** | 系統/應用層 timer 觸發 |

> **timerfd 是唯一被記錄到的 suspend abort source**，佔 100%。這與其他 T70 報告一致（72-94%），但 user build 下其他硬體 abort source 可能未被記錄。

### 4.3 Last Active Wakeup Source

| Source | Count | Percentage | Description |
|--------|-------|------------|-------------|
| **qrtr_ws** | **2** | **100%** | QMI Router — Modem 通訊 |

> qrtr_ws（QMI Router）是僅有的硬體喚醒源記錄，表示 Modem 與 AP 之間有通訊活動。

### 4.4 Device Suspend Failure

6 次 device suspend failure，user build 下缺乏 error code 詳細資訊，但根據其他報告經驗，最可能為 `alarmtimer.0.auto` (EBUSY -16)。

---

## 5. Kernel Wake Lock Analysis

### 5.1 Kernel Wake Lock 排行榜

| Rank | Wake Lock | Total Time | Count | Avg Time | Description |
|------|-----------|-----------|-------|----------|-------------|
| 1 | **PowerManagerService.WakeLocks** | **1m 2s** | 39 | 1.61s | 上層 partial wakelock 匯總 |
| 2 | hal_bluetooth_lock | 4.6s | 2 | 2.31s | BT HAL |
| 3 | pmo_wow_wl | 3.0s | 3 | 1.01s | WiFi Power Management Offload |
| 4 | qcom_rx_wakelock | 1.6s | 30 | 0.05s | Qualcomm modem RX 喚醒 |
| 5 | PowerManagerService.Display | 0.8s | 6 | 0.13s | 螢幕 suspend blocker |
| 6 | PowerManager.SuspendLockout | 0.6s | 3 | 0.21s | Suspend lockout |
| 7 | NETLINK | 0.6s | 62 | 0.01s | 網路事件通知 |
| 8 | event0 | 0.3s | 7 | 0.04s | 輸入裝置事件 |
| 9 | PowerManagerService.Broadcasts | 0.2s | 6 | 0.04s | Broadcast suspend blocker |
| 10 | smp2p-sleepstate | 0.2s | 1 | 0.20s | SoC inter-processor sleep state |

### 5.2 關鍵觀察

- **PMS.WakeLocks**（1m 2s）佔絕大部分 kernel wakelock 時間，與 partial wakelock 總時間一致
- **pmo_wow_wl**（WiFi PMO Wake-on-Wireless）出現 3 次，每次約 1 秒，為 WiFi 活動喚醒 indicator
- **qcom_rx_wakelock** 觸發 30 次但單次時間極短（0.05s），與 WiFi 13.83 MB 數據接收對應
- **hal_bluetooth_lock** 僅 2 次但平均 2.31 秒，BT 在掃描模式（10m BT scan）
- 本報告中未出現 **em7590_wake_ws**（EM7590 Modem），可能因為 Cellular 未連線（0% kernel active）

---

## 6. Application-Level Partial Wake Lock Analysis

### 6.1 Top Partial Wake Locks

基於 Estimated Power 的 UID wakelock 時間推算：

| Rank | Wake Lock / UID | Total Time | Description |
|------|----------------|-----------|-------------|
| 1 | system (UID 0) wakelock | **25s** | 系統核心 |
| 2 | system (UID 1000) wakelock | 56s | system_server |
| 3 | GMS (u0a115) wakelock | 3.9s | Google Mobile Services |
| 4 | SystemUI (u0a167) wakelock | 1.6s | SystemUI |

### 6.2 Per-UID Wakelock Summary

| UID | App | Estimated Power | Main Sources |
|-----|-----|----------------|--------------|
| 0 | root/kernel | 26.5 mAh | cpu (26.5) |
| 1082 | — | 4.08 mAh | cpu |
| u0a117 | — | 2.46 mAh | cpu (1.52), wifi (0.94) |
| 1000 | system | 1.85 mAh | cpu (1.08), gnss (0.69), sensors (0.05) |
| u0a115 | GMS | 0.24 mAh | cpu (0.13), sensors (0.09), wifi (0.02) |

> Partial wakelock 總時間僅 1m 2s（佔電池時間 2.5%），影響相對較小。UID 0（root/kernel）消耗最高（26.5 mAh），主要來自 CPU 使用 — 可能與系統啟動後的背景初始化有關。

---

## 7. Alarm Manager Wakeup Analysis

### 7.1 Top Alarm Wakeup Sources

| Rank | App (UID) | Wakeups | Top Alarms |
|------|-----------|---------|------------|
| 1 | **android (1000)** | **90** | TIME_TICK |
| 2 | **GMS (u0a115)** | **33** | GCM ACTION_CHECK_QUEUE |
| 3 | **Settings (1000)** | **22** | battery.PERIODIC_JOB_UPDATE |
| 4 | SystemUI (u0a167) | 12 | DELAYED_KEYGUARD |
| 5 | Calendar (u0a60) | 5 | CalendarProvider2 |
| 6 | Bluetooth (1002) | 3 | BluetoothMetricsLogger |
| 7 | Calendar (u0a150) | 2 | MIDNIGHT widget |
| 8 | networkstack (1073) | 1 | DhcpClient.wlan0.RENEW |
| 9 | Messages (u0a113) | 1 | intent.action.VIEW |
| 10 | LTE BC (u0a170) | 1 | wake_up_from_boot |

### 7.2 Alarm Wakeup 分析

| App | Wakeups | Interval | Per-Hour Rate | Note |
|-----|---------|----------|---------------|------|
| android TIME_TICK | 90 | ~27 秒 | **130/h** | 異常高頻 — 可能為系統啟動初期行為 |
| GMS ACTION_CHECK_QUEUE | 33 | ~75 秒 | **47.7/h** | GCM 佇列檢查 |
| Settings PERIODIC_JOB_UPDATE | 22 | ~113 秒 | **31.8/h** | 電池週期性 job |

> **alarm wakeup 頻率異常高**：總計 170 次/41 分鐘 = **246 次/小時**，遠高於其他報告（5.8–13.1/h）。TIME_TICK 90 次/41 分鐘的頻率是不正常的（正常應每分鐘一次），高度懷疑是系統啟動初期的集中觸發行為。GMS 和 Settings 的頻率也遠高於正常值。

---

## 8. Device Idle (Doze) State

### 8.1 Bugreport 快照狀態

| Parameter | Value | Note |
|-----------|-------|------|
| mState | **IDLE** | Deep Doze 中 |
| mLightState | **OVERRIDE** | Light Doze 被覆寫 |
| mScreenOn | false | 螢幕關閉 |
| mCharging | false | 未充電 |
| mDeepEnabled | true | Deep Doze 啟用 |
| mLightEnabled | true | Light Doze 啟用 |

> 快照時刻裝置正在 Deep Idle（IDLE）模式，Light Doze 狀態為 OVERRIDE（被 Deep Doze 覆蓋），這是正常的 — 當 Deep Doze 啟動後 Light Doze 會被覆寫。

### 8.2 Doze 參數設定（vs AOSP 預設）

| Parameter | Value | AOSP Default | Diff |
|-----------|-------|-------------|------|
| `inactive_to` | **1m** | 30m | **縮短 30x** |
| `idle_to` | **15m** | 60m | **縮短 4x** |
| `idle_factor` | 2.0 | 2.0 | 相同 |
| `max_idle_to` | 6h | 6h | 相同 |
| `light_idle_to` | 5m | 5m | 相同 |
| `light_max_idle_to` | **30m** | 15m | **延長 2x** |
| `light_idle_factor` | 2.0 | 2.0 | 相同 |

> Doze 參數與其他 T70 報告一致：`inactive_to` 和 `idle_to` 大幅縮短以加速進入 Deep Doze（工業/企業場景優化）。`light_max_idle_to` 加倍延長 Light Doze 間隔。

**Deep Doze 維護窗口時間線**（指數遞增）：
```
15m → 30m → 1h → 2h → 4h → 6h (上限)
```

---

## 9. Estimated Power Consumption by Component

| Component | Estimated Power (mAh) | Note |
|-----------|----------------------|------|
| Screen | 67.6 | 10m 6s，佔總功耗 49.3% |
| CPU | 34.1 | |
| WiFi | 1.08 | 13.83 MB Rx |
| Bluetooth | 1.02 | Scan 10m, Rx 2m 23s |
| GPS/GNSS | 0.691 | 1m 30s |
| Sensors | 0.150 | |
| Wakelock overhead | 0.002 | |
| Idle baseline | 0.019 | |
| **Computed Total** | **~105 mAh** | |
| **Actual Discharge** | **0–137 mAh** | |

### 9.1 Top Power Consuming UIDs

| UID | App | Power (mAh) | Main Source |
|-----|-----|------------|-------------|
| 0 | root/kernel | 26.5 | cpu |
| 1082 | — | 4.08 | cpu |
| u0a117 | — | 2.46 | cpu (1.52), wifi (0.94) |
| 1000 | system | 1.85 | cpu (1.08), gnss (0.69) |
| u0a115 | GMS | 0.24 | cpu, sensors (30m), wifi |

> Computed drain（~105 mAh）與 actual drain（0–137 mAh）差距不大（Coulomb counter 精度在短週期下有限，顯示 0–137 mAh range）。**螢幕佔了 49.3% 的功耗**，因為螢幕開啟佔 24.3% 的時間。在 41 分鐘短週期下，power profile 估算相對合理。

---

## 10. Findings & Recommendations

### 10.1 Critical Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 1 | **Deep Doze 放電率極高** | 132.2 mAh/h（理想 <20） | Battery Stats: 24m Deep Doze 消耗 53 mAh | 延長測試時間至 6+ 小時以取得穩態放電率；與長期報告交叉比對 |
| 2 | **IGnss HAL Binder 阻塞** | 導致 system_server ANR ×2 | ANR traces: android.fg 被 IGnss 阻塞 15s | 檢查 GNSS HAL 實作和 firmware 版本 |

### 10.2 High Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 3 | **Alarm wakeup 頻率異常高** | 246 次/小時（正常 5-13/h） | TIME_TICK 90x, GMS 33x, Settings 22x | 確認是否為首次開機初始化行為，長期觀測是否回歸正常 |
| 4 | **WiFi 高活動** | kernel active 68.9%, Rx 13.83 MB | Connectivity stats | 監控 WiFi 流量來源，可能為 GMS 初始化下載 |
| 5 | **timerfd 阻擋 suspend** | 69 次 abort（100%） | Kernel suspend abort logs | 使用 userdebug build 追蹤 timerfd 來源 |

### 10.3 Medium Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 6 | SELinux denials | 286 次 kernel denial | Kernel events | 檢查 SELinux policy 配置 |
| 7 | crash_dump64 過量錯誤 | 71% 的 E/F 日誌 | Tag stats | 調查 native crash dump 行為 |
| 8 | Suspend/resume error | 3 次 | Kernel events | 結合 userdebug build 進一步分析 |

### 10.4 短週期數據注意事項

本報告統計週期僅 41 分鐘，以下數據解讀需特別注意：

| 指標 | 本報告值 | 預期長期趨勢 | 原因 |
|------|---------|------------|------|
| Deep Doze 放電率 | 132.2 mAh/h | 下降至 50-90 mAh/h | 系統初始化 overhead 會隨時間攤平 |
| Alarm wakeup 頻率 | 246/h | 下降至 5-13/h | 首次開機集中觸發 |
| WiFi data | 13.83 MB/41m | 逐步降低 | GMS 初始下載完成後趨穩 |

---

## 11. Data Sources Used

本報告所有數據均來自同一份 bugreport 檔案：

| Section | Data Source |
|---------|------------|
| Power Manager (dumpsys power) | DUMPSYS POWER section |
| Battery Stats (dumpsys batterystats) | DUMPSYS BATTERYSTATS section |
| Alarm Manager (dumpsys alarm) | DUMPSYS ALARM section |
| Device Idle (dumpsys deviceidle) | DUMPSYS DEVICEIDLE section |
| Kernel Suspend | KERNEL LOG section (limited in user build) |
| Kernel Wake Locks | CHECKIN BATTERYSTATS (kwl entries) |

**Bugreport file**: `bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip` (5.7 MB)
**Build type**: `user`（kernel 日誌量有限，suspend 統計數據不如 userdebug build 完整）
