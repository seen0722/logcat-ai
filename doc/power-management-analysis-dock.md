# Power Management Analysis Report

**Bugreport**: `bugreport-T70-AQ3A.250408.001-2026-02-04-16-34-47 _dock.zip`
**Device**: Trimble T70, Android 15 (API 35), Qualcomm SoC
**Build**: `AQ3A.250408.001` (user), build 02.01.03.260131
**Analysis Date**: 2026-02-25
**Statistics Period**: 2026-02-04 16:10 ~ 2026-02-04 16:34 (**3 小時 59 分**)

---

## 1. Executive Summary

本裝置在近 4 小時的統計期間內，螢幕開啟 1 小時 24 分（35.4%），50.2% 的時間處於 Deep Doze 模式。Deep Doze 期間的放電率達 **61.5 mAh/h**（理想值應低於 20 mAh/h），超出預期 3.1 倍。

主要問題：
1. **Deep Doze 放電率偏高** — 61.5 mAh/h，2 小時 Deep Doze 消耗 123 mAh（佔螢幕關閉放電 51.7%）
2. **螢幕功耗佔絕對主導** — 螢幕消耗 828 mAh（佔總功耗 81.3%），亮度 98.5% 時間在 bright
3. **ITrmbEmpower HAL 導致 ANR** — ModuleManagerService 被 Binder call 阻塞 20 秒
4. **WiFi 背景流量偏高** — 4 小時內接收 52.17 MB，WiFi kernel active 53.6%
5. **系統重啟 3 次** — System starts: 3，可能影響統計穩定性

---

## 2. Power Manager State Snapshot

Bugreport 抓取時刻的電源管理器快照（DUMPSYS POWER）：

| Parameter | Value | Note |
|-----------|-------|------|
| mWakefulness | **Awake** | 清醒狀態 |
| mIsPowered | false | 未充電 |
| mPlugType | 0 | 未接電源 |
| mBatteryLevel | **84%** | |
| mLastSleepReason | timeout | 螢幕逾時自動關閉 |
| mUseAutoSuspend | false | 自動 suspend 未啟用 |

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

**結論**: WakeLocks 和 Display suspend blocker 持有中，因為裝置正在 Awake 狀態，屬正常行為。

---

## 3. Battery Statistics (4 小時)

### 3.1 Overall Battery Usage

| Metric | Value |
|--------|-------|
| Battery Capacity | 13,293 mAh (estimated) / 13,395 mAh (learned) |
| Total Discharge | 1,018 mAh |
| Start Clock Time | 2026-02-04 16:10:36 |
| Time on Battery | 3h 59m 3s (98.3% realtime) |
| Screen On Time | **1h 24m 43s (35.4%)**, 14 times |
| Screen Off Discharge | 238 mAh (23.4%) |
| Screen On Discharge | 780 mAh (76.6%) |
| Total Partial Wakelock Time | **4m 27s** |
| Total Full Wakelock Time | 6m 46s |
| System Starts | **3** |
| Connectivity Changes | **255** |
| Battery Time Remaining (est.) | 1d 5h 17m |

### 3.2 Doze Mode Statistics

| Mode | Duration | Discharge | Discharge Rate |
|------|----------|-----------|----------------|
| Deep Doze (Full Idle) | **1h 59m 59s (50.2%)** | **123 mAh** | **61.5 mAh/h** |
| Light Doze | 16m 51s (7.0%) | 0 mAh | 0 mAh/h |
| Deep Doze cycles | 11x | longest 29m 59s | |
| Light Doze cycles | 7x | longest 2m 26s | |

> **Deep Doze 放電率 61.5 mAh/h 超出理想值 3.1 倍。** 但本報告有 3 次系統重啟，可能導致 Doze 週期頻繁中斷重啟，增加額外功耗。最長 Deep Doze cycle 僅 29m 59s（未達到 idle_to 的第二次遞增 30m），表示 Doze 週期被頻繁打斷。

### 3.3 Connectivity Power Summary

| Radio | Active Time | Power | Data |
|-------|------------|-------|------|
| Cellular kernel active | 0ms (0%) | 9.43 mAh | Rx 0B / Tx 0B |
| WiFi kernel active | **2h 8m 10s (53.6%)** | 1.20 mAh | **Rx 52.17MB / Tx 7.12MB** |
| Bluetooth | Idle 13m / Rx 13m / Tx 6m 31s | 9.66 mAh | 0 bytes |
| GPS | — | 11.4 mAh | 19m 36s active |

| Cellular Signal (RSRP) | Duration | Percentage |
|------------------------|----------|------------|
| Great (> -98 dBm) | 43m 44s | 18.3% |
| Good (-108 to -98 dBm) | 3h 12m | **80.3%** |
| Moderate (-118 to -108 dBm) | 2m 7s | 0.9% |
| Very Poor (< -128 dBm) | 3s | 0.0% |

| WiFi Signal (RSSI) | Duration | Percentage |
|--------------------|----------|------------|
| Great (> -55 dBm) | 1h 9m | 28.9% |
| Good (-66 to -55 dBm) | 2h 47m | **70.2%** |
| Moderate (-77 to -66 dBm) | 1m 6s | 0.5% |

> WiFi kernel active 53.6% 且接收 52.17 MB，在 Deep Doze 期間 WiFi 仍有大量活動。Cellular 雖有 good/great 信號但 kernel active 為 0% 且無數據流量，所有通訊走 WiFi。Bluetooth 活動較高（Rx 13m + Tx 6m 31s = 約 20 分鐘活動），power drain 9.66 mAh 是顯著的功耗來源。GPS 活動 19m 36s，消耗 11.4 mAh。

---

## 4. Kernel Suspend/Resume Analysis

> **注意**：本 bugreport 為 `user` build，kernel 日誌量有限。

### 4.1 Suspend Cycle Statistics

| Event | Count | Description |
|-------|-------|-------------|
| Suspend entry | **13** | 嘗試進入 suspend |
| Pending Wakeup Sources abort | **23** | 被 wakeup source 阻擋 |
| Task freezing aborted | 3 | Process 無法凍結 |
| Device failed to suspend | 2 | 裝置層級 suspend 失敗 |

### 4.2 Suspend Abort — Wakeup Source Breakdown

| Wakeup Source | Abort Count | Percentage | Description |
|--------------|-------------|------------|-------------|
| **[timerfd]** | **31** | **88.6%** | 系統/應用層 timer 觸發 |
| qcom_rx_wakelock | 2 | 5.7% | Qualcomm modem RX |
| bq40z50-monitor-info | 2 | 5.7% | TI BQ40Z50 電池電量計 |

> **timerfd 佔 88.6% 的 suspend abort source**，與其他 T70 報告一致（72-94%）。本報告額外可見 qcom_rx_wakelock 和 bq40z50（user build 下難得出現的硬體 abort source）。

### 4.3 Last Active Wakeup Source

| Source | Count | Percentage | Description |
|--------|-------|------------|-------------|
| **qrtr_ws** | **2** | **100%** | QMI Router — Modem 通訊 |

### 4.4 Device Suspend Failure

2 次 device suspend failure，user build 下缺乏詳細 error code。

---

## 5. Kernel Wake Lock Analysis

### 5.1 Kernel Wake Lock 排行榜

| Rank | Wake Lock | Total Time | Count | Avg Time | Description |
|------|-----------|-----------|-------|----------|-------------|
| 1 | **PowerManagerService.WakeLocks** | **4m 27s** | 180 | 1.49s | 上層 partial wakelock 匯總 |
| 2 | **qcom_rx_wakelock** | **30.7s** | 427 | 0.07s | Qualcomm modem RX 喚醒 |
| 3 | hal_bluetooth_lock | 18.4s | 16 | 1.15s | BT HAL |
| 4 | pmo_wow_wl | 14.2s | 14 | 1.01s | WiFi Power Management Offload |
| 5 | alarmtimer | 12.0s | 6 | 2.01s | 系統鬧鐘 |
| 6 | PowerManagerService.Display | 5.0s | 22 | 0.23s | 螢幕 suspend blocker |
| 7 | PowerManager.SuspendLockout | 4.6s | 2 | 2.30s | Suspend lockout |
| 8 | NETLINK | 4.1s | 364 | 0.01s | 網路事件通知 |
| 9 | pil-a660_zap | 2.7s | 0 | — | GPU 微控制器（Adreno 660 ZAP） |
| 10 | PowerManagerService.Booting | 2.7s | 0 | — | 開機 suspend blocker |

### 5.2 關鍵觀察

- **qcom_rx_wakelock** 觸發 427 次（平均每 33 秒一次），與 WiFi 52.17 MB 數據接收對應。每小時頻率 107/h，高於 BR1（84.5/h）和 BR2（39.8/h）
- **hal_bluetooth_lock** 16 次、平均 1.15s，Bluetooth 在此報告中較活躍（Rx 13m, Tx 6m 31s）
- **pmo_wow_wl**（WiFi PMO）14 次，與 WiFi 持續活動一致
- **alarmtimer** 6 次、平均 2.01s — 與其他 T70 報告中 alarmtimer suspend failure 相關
- 本報告中未出現 **em7590_wake_ws**（EM7590 Modem），可能因 Cellular kernel active 為 0%

---

## 6. Application-Level Partial Wake Lock Analysis

### 6.1 Top Power Consuming UIDs

| UID | App | Power (mAh) | Main Source |
|-----|-----|------------|-------------|
| u0a165 | — | 365 mAh | **screen (365)** — 螢幕使用 31m 55s |
| u0a76 | — | 242 mAh | screen (241) — 螢幕使用 21m 3s |
| u0a209 | — | 200 mAh | screen (188), gnss (11.0), sensors (0.41) |
| u0a71 | — | 22.1 mAh | screen (21.8) |
| 1000 | system | 9.46 mAh | cpu (8.58), sensors (0.40), gnss (0.45) |
| 0 | root/kernel | 6.71 mAh | cpu (6.69) |
| u0a113 | — | 2.73 mAh | screen (1.95), cpu (0.78) |

### 6.2 Per-UID Wakelock Summary

| UID | App | Wakelock Time | Description |
|-----|-----|--------------|-------------|
| 1000 | system | 2m 46s | 系統核心 wakelock |
| u0a113 | — | 13s | |

> 本報告螢幕開啟時間佔 35.4%，Screen 功耗（828 mAh）佔總 computed drain 的 **81.3%**。螢幕亮度 98.5% 時間在 bright，是最大的功耗來源。Partial wakelock 總時間 4m 27s（佔電池時間 1.9%），影響有限。

---

## 7. Alarm Manager Wakeup Analysis

### 7.1 Top Alarm Wakeup Sources

| Rank | App (UID) | Wakeups | Top Alarms |
|------|-----------|---------|------------|
| 1 | **android (1000)** | **14** | TIME_TICK |
| 2 | **GMS (u0a112)** | **5** | ACTIVITY_DETECTION |
| 3 | networkstack (1073) | 2 | DhcpClient.wlan0.KICK |
| 4 | Calendar (u0a57) | 1 | CalendarProvider2 |
| 5 | LTE BC (u0a170) | 1 | wake_up_from_boot |

### 7.2 Alarm Wakeup 分析

| App | Wakeups | Interval | Per-Hour Rate | Note |
|-----|---------|----------|---------------|------|
| android TIME_TICK | 14 | ~17 min | **3.5/h** | 正常（每分鐘觸發，但 Deep Doze 會延遲） |
| GMS ACTIVITY_DETECTION | 5 | ~48 min | 1.25/h | 活動偵測，頻率正常 |
| networkstack DHCP | 2 | ~120 min | 0.5/h | WiFi DHCP 更新 |

> **Alarm wakeup 頻率相對健康**：總計 23 次/4 小時 = **5.8 次/小時**，與 BR1/BR2（5.8–6.1/h）一致，明顯低於 Phone-ANR（13.1/h）和 Keypad（246/h）。注意此報告中**未出現 Settings PERIODIC_JOB_UPDATE**，可能因為 3 次系統重啟後 job 尚未排程。

---

## 8. Device Idle (Doze) State

### 8.1 Bugreport 快照狀態

| Parameter | Value | Note |
|-----------|-------|------|
| mState | **ACTIVE** | 螢幕開啟中 |
| mLightState | **ACTIVE** | |
| mScreenOn | true | 螢幕開啟 |
| mCharging | false | 未充電 |
| mDeepEnabled | true | Deep Doze 啟用 |
| mLightEnabled | true | Light Doze 啟用 |

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

> Doze 參數與所有其他 T70 報告完全一致。

**Deep Doze 維護窗口時間線**（指數遞增）：
```
15m → 30m → 1h → 2h → 4h → 6h (上限)
```

---

## 9. Estimated Power Consumption by Component

| Component | Estimated Power (mAh) | Note |
|-----------|----------------------|------|
| **Screen** | **828** | **1h 24m 43s，bright 98.5%** |
| CPU | 29.2 | |
| GPS/GNSS | 11.4 | 19m 36s |
| Bluetooth | 9.66 | Rx 13m + Tx 6m 31s |
| Mobile Radio | 1.70 | Cellular idle |
| WiFi | 1.20 | 52.17 MB Rx |
| Sensors | 1.02 | |
| Wakelock overhead | 0.007 | |
| Idle baseline | 0.153 | |
| **Computed Total** | **~882 mAh** | |
| **Actual Discharge** | **536–1,072 mAh** | Coulomb counter range |

### 9.1 Gap Analysis

> Computed drain（882 mAh）落在 actual drain range（536–1,072 mAh）內，**power profile 估算在本報告中相對準確**。這與 Phone-ANR 報告（97.7% unaccounted）形成對比 — 差異主要因為本報告螢幕佔 81% 功耗，而螢幕的 power profile 通常較準確。Deep Doze 期間的功耗（123 mAh / 2h）仍有偏差，但被螢幕功耗的準確估算所稀釋。

---

## 10. Findings & Recommendations

### 10.1 Critical Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 1 | **Deep Doze 放電率偏高** | 61.5 mAh/h（理想 <20） | Battery Stats: 2h Deep Doze 消耗 123 mAh | 延長 Deep Doze 測試時間，排除系統重啟影響 |
| 2 | **ITrmbEmpower HAL ANR** | ModuleManagerService 被阻塞 20s | ANR trace: slow_binder_call to ITrmbEmpower | 檢查 Trimble Empower HAL 實作和服務初始化邏輯 |

### 10.2 High Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 3 | **系統重啟 3 次** | 打斷 Doze 週期，增加初始化功耗 | System starts: 3, longest Deep Doze cycle 僅 29m | 調查重啟原因（可能與 dock 連接有關） |
| 4 | **螢幕亮度過高** | 828 mAh（81.3% 總功耗） | bright 98.5% | 啟用自動亮度或降低預設亮度 |
| 5 | **WiFi 高流量** | 52.17 MB Rx, kernel active 53.6% | Connectivity stats | 識別 Deep Doze 期間的 WiFi 流量 app |

### 10.3 Medium Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 6 | **GPS 活動偏高** | 11.4 mAh, 19m 36s | Estimated power | 檢查 u0a209（24m GNSS）是否需要持續定位 |
| 7 | **Bluetooth 功耗** | 9.66 mAh, Rx+Tx 約 20m | BT stats | 評估 BT 連線需求（dock 相關?） |
| 8 | SELinux denials | 126 次 kernel denial | Kernel events | 檢查 SELinux policy |
| 9 | android.system.suspend-service 錯誤 | 30% E/F 日誌 | Tag stats | 調查 suspend service 異常行為 |

### 10.4 與其他報告的比較

| 指標 | Keypad (41m) | **Dock (4h)** | Phone-ANR (6d) |
|------|-------------|---------------|----------------|
| Deep Doze 放電率 | 132.2 mAh/h | **61.5 mAh/h** | 50.5 mAh/h |
| Screen On 比例 | 24.3% | **35.4%** | 0.1% |
| WiFi Rx | 13.83 MB | **52.17 MB** | 0 bytes |
| Alarm wakeup/h | 246/h | **5.8/h** | 13.1/h |
| System starts | 0 | **3** | 0 |

> **Deep Doze 放電率呈現遞減趨勢**：Keypad 132.2 → Dock 61.5 → Phone-ANR 50.5 mAh/h。統計時間越長，初始化 overhead 被攤平，放電率趨於穩定。本報告的 61.5 mAh/h 介於短期（Keypad）和長期（Phone-ANR）之間，符合預期。

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

**Bugreport file**: `bugreport-T70-AQ3A.250408.001-2026-02-04-16-34-47 _dock.zip` (5.8 MB)
**Build type**: `user`（kernel 日誌量有限，suspend 統計數據不如 userdebug build 完整）
**特殊背景**: 此 bugreport 與 dock（底座）連接相關，可能解釋較高的 BT/GPS 活動和系統重啟。
