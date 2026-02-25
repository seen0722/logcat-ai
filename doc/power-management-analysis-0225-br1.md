# Power Management Analysis Report

**Bugreport**: `bugreport-T70-AQ3A.250408.001-2026-02-25-08-51-45.zip`
**Device**: Trimble T70, Android 15 (API 35), Qualcomm SoC
**Build**: `AQ3A.250408.001` (user), build 02.01.04.260212
**Analysis Date**: 2026-02-25
**Statistics Period**: 2026-02-24 18:36 ~ 2026-02-25 08:51 (**14 小時 15 分**)

---

## 1. Executive Summary

本裝置在 14 小時 15 分的統計期間內，螢幕僅開啟 2 分 11 秒（0.3%），99.0% 的時間處於 Deep Doze 模式。然而 Deep Doze 期間的放電率達 **93.0 mAh/h**（理想值應低於 20 mAh/h），超出預期 4.6 倍，是先前 6 天報告（50.5 mAh/h）的 1.8 倍。

主要問題：
1. **Deep Doze 放電率極高** — 93.0 mAh/h，14 小時 Deep Doze 消耗 1,312 mAh（佔總放電 90.9%）
2. **timerfd 頻繁阻擋 suspend** — 132 次 suspend abort source，佔全部 abort 的 94.3%
3. **qcom_rx_wakelock 頻繁喚醒** — 1,205 次觸發，持有 3 分 44 秒，表示 Qualcomm modem RX 路徑活躍
4. **WiFi 高流量活動** — 連線期間接收 314.97 MB 數據，WiFi kernel active 8 小時 10 分（57.4%）

> **與先前報告比較**：本次 14 小時的 Deep Doze 放電率（93.0 mAh/h）遠高於先前 6 天報告的 50.5 mAh/h。可能原因包含：較短的統計期間使短期異常影響放大、WiFi 連線傳輸大量數據（314 MB vs 0 bytes）、系統啟動初期的 overhead 等。

---

## 2. Power Manager State Snapshot

Bugreport 抓取時刻的電源管理器快照（DUMPSYS POWER）：

| Parameter | Value | Note |
|-----------|-------|------|
| mWakefulness | Awake | 清醒狀態 |
| mIsPowered | true | 正在充電 |
| mPlugType | 2 (USB) | USB 充電 |
| mBatteryLevel | 7% | 電池殘量極低 |
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

**結論**: WakeLocks 和 Display suspend blocker 持有中，因為裝置正在 Awake 狀態（螢幕開啟中），屬正常行為。

---

## 3. Battery Statistics (14h 15m Period)

### 3.1 Overall Battery Usage

| Metric | Value |
|--------|-------|
| Battery Capacity | 12,400 mAh (estimated) |
| Learned Capacity | 13,779 mAh |
| Total Discharge | 1,443 mAh |
| Start Clock Time | 2026-02-24 18:36:39 |
| Time on Battery | 14h 15m 18s (99.8% realtime) |
| Screen On Time | **2m 11s (0.3%)**, 5 times |
| Screen Off Discharge | **1,362 mAh (94.4%)** |
| Screen On Discharge | 81 mAh (5.6%) |
| Total Partial Wakelock Time | **8m 55s** |
| Total Full Wakelock Time | 5s |
| System Starts | 2 |
| Connectivity Changes | 16 |

### 3.2 Doze Mode Statistics

| Mode | Duration | Discharge | Discharge Rate |
|------|----------|-----------|----------------|
| Deep Doze (Full Idle) | **14h 6m 35s (99.0%)** | **1,312 mAh** | **93.0 mAh/h** |
| Light Doze | 2m 9s (0.3%) | 22 mAh | 611 mAh/h |
| Deep Doze cycles | 7x | longest 6h 0m 0s | |
| Light Doze cycles | 1x | 2m 9s | |

> **Deep Doze 放電率 93.0 mAh/h 是本報告最關鍵的異常指標。** 以 12,400 mAh 電池容量計算，持續此放電率下 6 天可耗盡 13,392 mAh。理想的 Deep Doze 放電率應低於 20 mAh/h。

### 3.3 Connectivity Power Summary

| Radio | Active Time | Power | Data |
|-------|------------|-------|------|
| Cellular kernel active | 1h 18m 40s (9.2%) | 52.2 mAh | Rx 4.13MB / Tx 772KB |
| WiFi kernel active | **8h 10m 44s (57.4%)** | 13.3 mAh | **Rx 314.97MB / Tx 10.51MB** |
| Bluetooth | Idle 10m / Rx 4m 36s | — | 0 bytes |
| GPS | — | 0.017 mAh | |

| Cellular RAT | Duration | Percentage |
|-------------|----------|------------|
| LTE | 13h 18m 35s | **93.4%** |
| OOS (Out of Service) | 56m 21s | **6.6%** |

| Cellular Signal (RSRP) | Duration | Percentage |
|------------------------|----------|------------|
| Great (> -98 dBm) | 13h 25m 36s | 94.2% |
| Very Poor (< -128 dBm) | 49m 16s | 5.8% |

> WiFi kernel active 佔 57.4% 且接收 314.97 MB 數據，顯示 Deep Doze 期間仍有大量背景下載活動。WiFi 信號 great (> -55 dBm) 佔 99.8%。Cellular 有 6.6% OOS 時間和 5.8% very poor 信號。

---

## 4. Kernel Suspend/Resume Analysis

> **注意**：本 bugreport 為 `user` build，kernel 日誌量有限，suspend 統計數據不如 `userdebug` build 完整。

### 4.1 Suspend Cycle Statistics

| Event | Count | Description |
|-------|-------|-------------|
| Suspend entry | **36** | 嘗試進入 suspend（user build 記錄較少） |
| Pending Wakeup Sources abort | **73** | 被 wakeup source 阻擋 |
| Task freezing aborted | 0 | |
| Device failed to suspend | 0 | |

### 4.2 Suspend Abort — Wakeup Source Breakdown

| Wakeup Source | Abort Count | Percentage | Description |
|--------------|-------------|------------|-------------|
| **timerfd** | **132** | **94.3%** | 系統/應用層 timer 觸發 |
| battery_charger (PMIC) | 4 | 2.9% | PMIC 電池充電事件 |
| battery | 2 | 1.4% | 電池狀態變化 |
| usb | 2 | 1.4% | USB 事件 |

> **timerfd 佔 94.3% 的 suspend abort source**，與先前報告（72%）一致，表示 userspace timer 仍是阻擋 suspend 的主因。結合 Alarm Stats 分析，GMS (40 wakeups) 和 Settings (14 wakeups) 是上層來源。

---

## 5. Kernel Wake Lock Analysis

### 5.1 Kernel Wake Lock 排行榜

| Rank | Wake Lock | Total Time | Count | Avg Time | Description |
|------|-----------|-----------|-------|----------|-------------|
| 1 | **PowerManagerService.WakeLocks** | **8m 56s** | 304 | 1.76s | 上層 partial wakelock 匯總 |
| 2 | **qcom_rx_wakelock** | **3m 44s** | 1,205 | 0.19s | Qualcomm modem RX 喚醒 |
| 3 | NETLINK | 20.4s | 1,013 | 0.02s | 網路事件通知 |
| 4 | hal_bluetooth_lock | 17.8s | 17 | 1.05s | BT HAL |
| 5 | spkr-prot | 3.1s | 1 | 3.10s | 揚聲器保護 IC |
| 6 | PowerManagerService.Display | 1.8s | 5 | 0.36s | 螢幕 suspend blocker |
| 7 | PowerManager.SuspendLockout | 1.7s | 1 | 1.72s | Suspend lockout |
| 8 | PowerManagerService.Booting | 1.0s | 0 | — | 開機 suspend blocker |
| 9 | pil-a660_zap | 1.0s | 0 | — | GPU 微控制器 |
| 10 | battery | 0.3s | 11 | 0.03s | 電池驅動 |

> **qcom_rx_wakelock** 觸發 1,205 次（平均每 42 秒一次），表示 Qualcomm modem 的 RX 路徑頻繁喚醒系統接收數據。這與 WiFi 高流量（314 MB）和 Cellular 活動有關。

---

## 6. Application-Level Partial Wake Lock Analysis

### 6.1 Top Partial Wake Locks

| Rank | Wake Lock | Owner | Total Time | Count |
|------|-----------|-------|-----------|-------|
| 1 | *job*/PhoneskyJobService (Background) | Play Store (u0a113) | **2m 21s** | 21 |
| 2 | **deviceidle_maint** | system (1000) | **2m 15s** | 6 |
| 3 | *job*/AiAiPersistentDownloadJobService | Google AI (u0a114) | **1m 58s** | 2 |
| 4 | *telephony-radio* | system (1000) | 28s | 39 |
| 5 | NotificationManagerService:post | SystemUI (u0a170) | 17s | 96 |
| 6 | *job*/PhoneskyJobService (Main) | Play Store (u0a113) | 13s | 9 |
| 7 | CollectionLib-SigCollector | **GMS (u0a116)** | 11s | 13 |
| 8 | *telephony-radio* | phone (1001) | 8s | 163 |
| 9 | WaitDownloadCompleteOperation | **GMS (u0a116)** | 7s | 1 |
| 10 | Doze:KeyguardIndication | SystemUI (u0a170) | 5s | 11 |

### 6.2 Per-UID Wakelock Summary

| UID | App | Total Wakelock Time | Main Wakelocks |
|-----|-----|-------------------|----------------|
| u0a113 | Play Store (Vending) | ~2m 35s | PhoneskyJobService (Background + Main) |
| 1000 | system | ~3m 8s | deviceidle_maint, telephony-radio, AnyMotionDetector |
| u0a114 | Google AI (AS) | ~1m 59s | AiAiPersistentDownloadJobService |
| u0a116 | **GMS** | **~37s** | SigCollector, WaitDownload, Checkin, GCM |
| 1001 | phone | ~10s | telephony-radio, RILJ_ACK_WL |
| u0a170 | SystemUI | ~23s | Notifications, KeyguardIndication |

> 本次 14 小時的 partial wakelock 總時間 8m 55s，僅佔電池時間 1.0%，相比先前報告的 51m 56s（6 天）偏低。GMS 總 wakelock 時間僅 37s（先前 ~12m），表示 GMS 在此週期中活動較少。

---

## 7. Alarm Manager Wakeup Analysis

### 7.1 Top Alarm Wakeup Sources

| Rank | App (UID) | Wakeups | Top Alarms |
|------|-----------|---------|------------|
| 1 | **GMS (u0a116)** | **40** | GCM_HEARTBEAT (major), GMS scheduler |
| 2 | **system (1000) / android** | **23** | TIME_TICK |
| 3 | **Settings (1000)** | **14** | battery.PERIODIC_JOB_UPDATE |
| 4 | networkstack (1073) | 4 | DhcpClient.wlan0.RENEW |
| 5 | Calendar (u0a63) | 3 | CalendarProvider2 |
| 6 | Bluetooth (1002) | 2 | BluetoothMetricsLogger |
| 7 | LTE BC (u0a162) | 1 | wake_up_from_boot |

### 7.2 Alarm Wakeup 分析

- **GMS GCM_HEARTBEAT**: 佔 GMS 40 次 wakeup 的多數（估算平均每 21 分鐘一次），用於維持 GCM push 連線。頻率偏高但在 WiFi 環境下可接受。
- **TIME_TICK**: 23 次（平均每 37 分鐘一次），為系統時鐘更新，屬正常行為。
- **Settings PERIODIC_JOB_UPDATE**: 14 次（平均每 61 分鐘一次），較先前報告（每 37 分鐘）改善。
- 整體 alarm wakeup 頻率（87 次/14 小時 = 6.1 次/小時）與先前報告（1,900 次/144 小時 = 13.2 次/小時）相比有所降低。

---

## 8. Device Idle (Doze) State

### 8.1 Bugreport 快照狀態

| Parameter | Value | Note |
|-----------|-------|------|
| mState | **ACTIVE** | 因正在充電 |
| mLightState | **ACTIVE** | 因正在充電 |
| mScreenOn | true | 螢幕開啟 |
| mCharging | **true** | 正在充電 — Doze 不啟動 |
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

> Doze 參數與先前報告一致：`inactive_to` 和 `idle_to` 大幅縮短以加速進入 Deep Doze（工業/企業場景優化）。`light_max_idle_to` 加倍延長 Light Doze 間隔。

**Deep Doze 維護窗口時間線**（指數遞增）：
```
15m → 30m → 1h → 2h → 4h → 6h (上限)
```

---

## 9. Estimated Power Consumption by Component

| Component | Estimated Power (mAh) | Note |
|-----------|----------------------|------|
| Mobile Radio | 45.5 | Cellular kernel active 9.2% |
| CPU | 18.4 | |
| Screen | 13.9 | 僅 2m 11s |
| WiFi | 13.3 | **314 MB Rx**, WiFi active 57.4% |
| Bluetooth | 4.10 | Rx 4m 36s |
| Sensors | 0.83 | GMS location sensors |
| Wakelock overhead | 0.018 | |
| Idle baseline | 0.024 | |
| **Computed Total** | **~96 mAh** | 僅計入以上追蹤組件 |
| **Actual Discharge** | **1,240–1,378 mAh** | 差距 ~14x |

### 9.1 Top Power Consuming UIDs

| UID | App | Power (mAh) | Main Source |
|-----|-----|------------|-------------|
| 1073 | networkstack | 11.8 | mobile_radio (20m 31s) |
| 1051 | — | 9.75 | mobile_radio (16m 59s) |
| u0a116 | GMS | 7.20 | sensors (7h 50m), wifi (4.71) |
| 1082 | — | 5.27 | cpu |
| u0a113 | Play Store | 4.60 | cpu, wifi |
| 1000 | system | 3.82 | cpu, sensors (7h 17m) |
| u0a101 | — | 3.41 | wifi |

> Computed drain (96 mAh) 與 actual drain (1,240–1,378 mAh) 差距 ~14 倍，表示大部分功耗來自**未被 BatteryStats 追蹤的硬體**。WiFi radio 在 Deep Doze 期間接收 314 MB 數據，是重要的功耗來源，但 BatteryStats 對 WiFi power 的估算（13.3 mAh）明顯偏低。

---

## 10. Findings & Recommendations

### 10.1 Critical Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 1 | **Deep Doze 放電率極高** | 93.0 mAh/h（理想 <20） | Battery Stats: 14h Deep Doze 消耗 1,312 mAh | 進一步調查 WiFi 背景流量來源和 modem 喚醒原因 |
| 2 | **timerfd 阻擋 suspend** | 132 次 abort（94.3%） | Kernel suspend abort logs | 追蹤高頻 timerfd 的 userspace 來源 |
| 3 | **BatteryStats power profile 不準確** | Computed vs actual 差異 14x | Estimated power section | 校準 WiFi 和 cellular power profile |

### 10.2 High Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 4 | **WiFi Deep Doze 期間高活動** | 314 MB Rx, kernel active 57.4% | Connectivity stats | 檢查哪些 app 在 Doze 期間下載數據（可能繞過 Doze 網路限制） |
| 5 | **qcom_rx_wakelock 頻繁** | 1,205 次, 3m 44s | Kernel wakelocks | 與 WiFi 314 MB 下載相關，降低背景下載頻率 |
| 6 | **Cellular OOS 6.6%** | 56 分鐘無服務 | RAT breakdown | 可能導致 modem 頻繁搜網消耗額外功率 |

### 10.3 Medium Priority Issues

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 7 | GMS sensor collection | 7h 50m sensor activity | Estimated power (u0a116) | 評估是否需要持續 location sensing |
| 8 | Play Store background job | 2m 21s wakelock | Partial wakelocks | 檢查 Phonesky 背景更新頻率 |
| 9 | SELinux denials | 59 次 kernel denial 事件 | Kernel events | 檢查 SELinux 策略配置 |

### 10.4 與先前報告的差異分析

| 指標 | 先前報告 (6 天) | 本次報告 (14h) | 變化 |
|------|---------------|---------------|------|
| Deep Doze 放電率 | 50.5 mAh/h | **93.0 mAh/h** | +84% |
| GMS alarm wakeups | 980 (163/day) | 40 (67/day) | -59% |
| Settings wakeups | 232 (38/day) | 14 (23/day) | -39% |
| Partial wakelock time | 51m 56s | 8m 55s | 等比縮減 |
| WiFi data received | 0 bytes | **314.97 MB** | 顯著增加 |
| WiFi kernel active | 0% | **57.4%** | 從離線到高活動 |

> 本次 Deep Doze 放電率較高的主因可能是 **WiFi 大量背景數據傳輸**（314 MB），導致即使在 Doze 期間 WiFi radio 仍維持高活動。先前報告 WiFi 未連線，故此因素不存在。

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

**Bugreport file**: `bugreport-T70-AQ3A.250408.001-2026-02-25-08-51-45.zip` (5.3 MB)
**Build type**: `user`（kernel 日誌量有限，suspend 統計數據不如 userdebug build 完整）
