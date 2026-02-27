# Power Management Analysis Report

**Bugreport**: `bugreport-T70-AQ3A.250408.001-2026-02-27-13-29-41.zip`
**Device**: Trimble T70, Android 15 (API 35), Qualcomm QCS6490
**Build**: `Trimble/T70/thorpe:15/AQ3A.250408.001/02.01.04.260212:userdebug/release-keys` (userdebug)
**Analysis Date**: 2026-02-27
**Statistics Period**: 2026-02-26 22:51:09 ~ 2026-02-27 ~12:05 (**13h 14m 31s**)

---

## 1. Executive Summary

- **Deep Doze 放電率 83.9 mAh/h**，達理想值 (<20 mAh/h) 的 **4.2 倍**，屬 Critical 等級。主因為 WiFi kernel active 佔 46.3% 及 modem baseband 消耗
- **Suspend abort 以 timerfd 為主**，64 次實際 abort 事件中（成功率 93.3%），kernel log 觀測到 timerfd 佔 97.9% 的 source observations
- **WiFi kernel active 時間異常**：46.3%（6h 7m），遠超合理範圍，但實際 Rx/Tx 時間極低（~26s），疑有應用程式在 Deep Doze 期間持續喚醒 WiFi
- **ANR**：system_server 因 IGnss (GNSS HAL) slow binder call 導致 android.fg 線程阻塞 15 秒

---

## 2. Power Manager State Snapshot

### 2.1 Main State Table

| Parameter | Value | Note |
|-----------|-------|------|
| mWakefulness | **Dozing** | 設備處於 Doze 狀態 |
| mIsPowered | true | 正在充電 |
| mPlugType | 1 (AC) | AC 充電器 |
| mBatteryLevel | **84%** | |
| mLastSleepReason | timeout | Screen timeout 進入休眠 |
| mUseAutoSuspend | true | |
| mDeviceIdleMode | undefined | |

### 2.2 Active Wake Locks

| Type | Tag | UID | PID | Duration |
|------|-----|-----|-----|----------|
| DOZE_WAKE_LOCK | dream:doze | 1000 (system) | 1471 | 24s 906ms |

> 快照時僅有一個 `DOZE_WAKE_LOCK`，這是 Doze 模式下的正常行為（DreamManagerService 維持 Doze 顯示）。

### 2.3 Suspend Blockers

| Name | Ref Count |
|------|-----------|
| PowerManagerService.Booting | 0 |
| PowerManagerService.WakeLocks | 0 |
| PowerManagerService.Display | 0 |
| PowerManagerService.Broadcasts | 0 |
| PowerManagerService.WirelessChargerDetector | 0 |

> 所有 suspend blocker 的 ref count = 0，系統可正常進入 suspend，snapshot 狀態健康。

---

## 3. Battery Statistics

### 3.1 Overall Battery Usage

| Parameter | Value |
|-----------|-------|
| Battery Capacity | 13,507 mAh (learned: 13,623 mAh) |
| Total Discharge | **1,139 mAh** |
| Time on Battery | 13h 14m 31s |
| Screen On Time | 6m 3s (0.8%), 4 次 |
| Screen Off Discharge | 1,083 mAh |
| Screen On Discharge | 56 mAh |
| Total Partial Wakelock | 6m 20s |
| Uptime on Battery | 45m 15s (5.7%) |
| Connectivity Changes | 16 |

### 3.2 Doze Mode Statistics

| Mode | Duration | Discharge | Rate | Cycles | Longest |
|------|----------|-----------|------|--------|---------|
| **Deep Doze** | **12h 50m 36s** (97.0%) | **1,077 mAh** | **83.9 mAh/h** | 14 | 1h 0m 1s |
| Light Doze | 7m 16s (0.9%) | 0 mAh | 0 mAh/h | 3 | 2m 25s |
| Full Idling | 12h 56m 7s (97.7%) | — | — | 3 | — |

> **⚠️ Deep Doze 放電率 83.9 mAh/h 遠超理想值 20 mAh/h（4.2 倍）**。13 小時內消耗 1,077 mAh，佔總放電量的 94.6%。14 個 Deep Doze 週期（最長 1 小時，與 max_idle_to=1h 設定一致）。idle_factor=1 導致無指數退避，每小時固定進入 maintenance window。

### 3.3 Connectivity Power Summary

| Radio | Active Time | Power | Data |
|-------|------------|-------|------|
| **Cellular** | Kernel active 0ms (0.0%), Rx 28m 59s (3.6%) | **90.0 mAh** | 0B / 0B |
| **WiFi** | **Kernel active 6h 7m (46.3%)**, Rx 25.6s, Tx 0.8s | 1.84 mAh | Rx 45.17MB / Tx 968.92KB |
| **Bluetooth** | Rx 8m 7s, Tx 8.6s, Scan 6m 2s | 4.92 mAh | 0B / 0B |
| **GPS** | poor signal 12.8s | 0.290 mAh | — |

**Cellular RAT/Signal**：
- 信號強度：good (-108~-98 dBm) 12.5%、**great (>-98 dBm) 87.5%**
- **無 Out-of-Service (OOS) 時間** — 信號覆蓋良好
- 無 cellular data 傳輸，但 Rx time 佔 3.6%（modem baseband 持續掃描）

**WiFi 信號**：
- great (>-55 dBm)：100.0%，信號優良
- WiFi 始終連接（sta 100%，supplicant completed 100%）

> **⚠️ WiFi kernel active 46.3% 是嚴重異常**。WiFi Rx/Tx 實際僅 26 秒，但 kernel 報告 6h 7m 43s 的 active 時間。這表明有應用或服務在 Deep Doze 期間頻繁喚醒 WiFi subsystem，但並未進行大量數據傳輸。Cellular 耗電 90 mAh 為最大單一元件（modem baseband 持續運作）。

---

## 4. Kernel Suspend/Resume Analysis

**資料來源**：`merged`（suspend_stats section 計數器 + kernel log abort/wakeup source details）

### 4.1 Suspend Cycle Statistics

| Event | Count | Description |
|-------|-------|-------------|
| Total Suspend Attempts | **949** | 總 suspend 嘗試次數（成功+失敗） |
| Suspend Success | **885** | 成功進入 suspend |
| **Suspend Abort (fail)** | **64** | 失敗（下方細分） |
| — Task Freeze Abort | 48 | failed_freeze：任務凍結失敗 |
| — Device Suspend Failure | 16 | failed_suspend：驅動程式 suspend callback 失敗 |
| **Suspend Success Rate** | **93.3%** | |

> Suspend 頻率：949 次 / 13.24 小時 = **71.7 次/小時**（平均每 50 秒嘗試一次 suspend）。成功率 93.3% 尚可，但 64 次 abort 中有 48 次為 task freeze 失敗（75%），值得關注。

### 4.2 Suspend Abort Source Breakdown

**Actual abort events: 64**（from `/sys/power/suspend_stats` fail counter）

以下為 kernel log 中的 wakeup source observations（一次 abort 可能記錄多個 source）：

| Wakeup Source | Log Observations | % of Observations | Description |
|---------------|------------------|--------------------|-------------|
| **timerfd** | 274 | **97.9%** | Userspace timer（AlarmManager, timerfd_create） |
| qrtr_ws | 2 | 0.7% | QMI Router — Modem 通訊 |
| alarmtimer.0.auto | 2 | 0.7% | Kernel alarm timer |
| 17a10040.qcom,wcn6750 | 1 | 0.4% | Qualcomm WCN6750 WiFi/BT combo chip |
| eventpoll | 1 | 0.4% | Kernel epoll 事件 |
| **Total observations** | **280** | | |

> ⚠️ **Log observations (280) ≠ actual abort events (64)**：kernel 在每次 suspend 嘗試中可能檢查多個 pending wakeup source 並各自記錄，因此 observations 數量可遠大於實際 abort 次數。timerfd 以 97.9% 佔比主導 abort observations，與歷史數據一致（72–99%）。

### 4.3 Last Active Wakeup Sources

| Source | Count | Description |
|--------|-------|-------------|
| qrtr_ws | 4 | QMI Router — Modem 通訊喚醒 |
| 17a10040.qcom,wcn6750 | 2 | Qualcomm WCN6750 WiFi/BT chip |
| eventpoll | 2 | Kernel epoll 事件 |

### 4.4 Last Failed Device

| Field | Value |
|-------|-------|
| last_failed_dev | **alarmtimer.0.auto** |
| last_failed_step | **suspend** |
| last_failed_errno | **-16 (EBUSY)** |

> `alarmtimer.0.auto` 在 suspend phase 回報 EBUSY，表示有未到期的 kernel alarm timer 阻止設備 suspend。這與 16 次 device suspend failure 相關。

---

## 5. Kernel Wake Lock Analysis

### 5.1 Top 10 Kernel Wake Locks

| Rank | Wake Lock | Total Time | Count | Avg Time | Description |
|------|-----------|-----------|-------|----------|-------------|
| 1 | **a600000.ssusb** | **22m 29s** | 2 | 11m 14s | Qualcomm Super Speed USB 控制器 |
| 2 | PowerManagerService.WakeLocks | 6m 21s | 279 | 1.37s | 上層 partial wakelock 匯總 |
| 3 | bq40z50-monitor-info | 4m 6s | 407 | 0.61s | TI BQ40Z50 電池電量計 IC |
| 4 | dumpstate_wakelock | 1m 45s | 1 | 1m 45s | Bugreport 擷取時的 wakelock |
| 5 | NETLINK | 1m 24s | 2,080 | 0.04s | 網路子系統事件通知 |
| 6 | hal_bluetooth_lock | 45.1s | 36 | 1.25s | Bluetooth HAL |
| 7 | [timerfd] | 32.3s | 206 | 0.16s | Userspace timer fd |
| 8 | qcom_rx_wakelock | 15.3s | 215 | 0.07s | Qualcomm modem RX 喚醒 |
| 9 | alarmtimer | 12.1s | 6 | 2.02s | Kernel alarm timer |
| 10 | 4-0028 | 10.1s | 5 | 2.02s | I2C device (bus 4, addr 0x28) |

**關鍵觀察**：
- **a600000.ssusb**（22m 29s）為最大 wakelock。僅 2 次觸發，平均 11+ 分鐘。此為 Qualcomm SSUSB 控制器，可能與 USB debugging (userdebug build) 或 dock 連接相關
- **bq40z50-monitor-info**（4m 6s, 407 次）：電池電量計定期輪詢，頻率 ~30.7 次/小時，每次 ~0.6 秒
- **NETLINK**（1m 24s, 2,080 次）：網路事件極頻繁（~157 次/小時），但每次僅 40ms
- **dumpstate_wakelock** 是 bugreport 擷取時產生的，不影響正常功耗

---

## 6. Application-Level Partial Wake Lock Analysis

> ℹ️ 本節資料來自 BatteryStats UID 功耗分解，完整 partial wakelock 名稱需透過 parser API 取得。

### 6.1 Per-UID Wakelock Summary

| UID | App | Total Wakelock Time | Power (mAh) |
|-----|-----|---------------------|-------------|
| 0 | root (kernel) | 32m 52s | 0.0548 |
| 1000 | android (system) | 5m 37s | 0.00937 |
| u0a119 | com.google.android.gms | 25.6s | 0.000710 |
| u0a165 | com.android.systemui | 8.3s | 0.000229 |
| u0a120 | (GMS related) | 1.1s | 0.0000307 |
| 2000 | shell | 5ms | 0.00000014 |

> 整體 partial wakelock 時間 6m 20s，佔電池使用時間 0.8%，屬正常範圍。root (UID 0) 的 32m 52s 為 kernel-level wakelock 持有時間（與 PowerManagerService.WakeLocks 6m 21s 對應）。

---

## 7. Alarm Manager Wakeup Analysis

### 7.1 Top Alarm Apps

| Rank | App (UID) | Wakeups | Rate (/h) | Top Alarm |
|------|-----------|---------|-----------|-----------|
| 1 | android (1000) | 64 | 4.83 | TIME_TICK |
| 2 | com.android.settings (1000) | 17 | 1.28 | PERIODIC_JOB_UPDATE |
| 3 | com.google.android.gms (u0a119) | 7 | 0.53 | HEARTBEAT_ALARM |
| 4 | com.android.providers.calendar (u0a69) | 3 | 0.23 | CalendarProvider2 |
| 5 | com.android.bluetooth (1002) | 2 | 0.15 | BluetoothMetricsLogger |
| 6 | com.google.android.networkstack (1073) | 1 | 0.08 | DhcpClient RENEW |
| 7 | com.android.systemui (u0a165) | 1 | 0.08 | DELAYED_KEYGUARD |
| 8 | com.qti.ltebc (u0a176) | 1 | 0.08 | wake_up_from_boot |
| **Total** | | **96** | **7.25** | |

### 7.2 Frequency Analysis

| Alarm | Count | Interval | Expected | Status |
|-------|-------|----------|----------|--------|
| TIME_TICK | 64 | ~12.4 min | ~60 min (Doze) | 偏高 |
| PERIODIC_JOB_UPDATE | 17 | ~46.7 min | ~60 min | 正常 |
| GCM HEARTBEAT | 7 | ~113 min | 15–45 min (WiFi) | 偏低（Doze 抑制） |
| CalendarProvider2 | 3 | ~264 min | — | 正常 |

> **TIME_TICK 64 次（4.83/h）**：在 14 個 Deep Doze maintenance window 中，平均每次 window 觸發 ~4.6 個 TIME_TICK。考慮到 maintenance window 期間系統會 catch up deferred alarms，此數值可接受。
>
> **GCM HEARTBEAT 僅 7 次**：在 WiFi 連線下 Google Cloud Messaging 心跳通常為 15–45 分鐘。13 小時只有 7 次（~113 分鐘間隔），可能是 Doze 模式有效抑制了非必要的心跳喚醒。

---

## 8. Device Idle (Doze) State

### 8.1 Snapshot State

| Parameter | Value |
|-----------|-------|
| mState (Deep) | ACTIVE |
| mLightState | ACTIVE |
| mScreenOn | false |
| mCharging | true |
| mDeepEnabled | true |
| mLightEnabled | true |

> 快照時設備正在充電，Doze 狀態為 ACTIVE（充電時退出 Doze 是正常行為）。

### 8.2 Doze Parameters vs AOSP

| Parameter | Value | AOSP Default | Diff |
|-----------|-------|-------------|------|
| inactive_to | **60,000ms (1m)** | 1,800,000ms (30m) | **縮短 30x** |
| idle_to | 3,600,000ms (1h) | 3,600,000ms (1h) | 相同 |
| idle_factor | **1.0** | 2.0 | **無指數退避** |
| max_idle_to | **3,600,000ms (1h)** | 21,600,000ms (6h) | **縮短 6x** |
| light_idle_to | 300,000ms (5m) | 300,000ms (5m) | 相同 |
| light_max_idle_to | **1,800,000ms (30m)** | 900,000ms (15m) | 放寬 2x |
| light_idle_factor | 2.0 | 2.0 | 相同 |

### 8.3 Maintenance Window Timeline

由於 `idle_factor=1`，Deep Doze maintenance window 間隔固定為 `idle_to=1h`，無指數增長：

```
T70:     1h → 1h → 1h → 1h → 1h → ... (固定 1h)
AOSP:    1h → 2h → 4h → 6h (上限)
```

> T70 的設定導致 maintenance window 頻率高於 AOSP（每小時 vs 最長每 6 小時），增加了 suspend/resume 週期和相關功耗。但 inactive_to=1m 使設備更快進入 Doze。

---

## 9. Estimated Power Consumption

### 9.1 Per-Component Power

| Component | Estimated Power (mAh) | Note |
|-----------|----------------------|------|
| **Cellular (mobile_radio)** | **90.0** | Modem baseband（Rx 28m 59s） |
| Screen | 22.4 | 僅 6m 3s screen on |
| CPU | 21.1 | |
| Bluetooth | 4.92 | Rx 8m 7s, Scan 6m 2s |
| WiFi | 1.84 | Kernel active 6h 7m 但估算僅 1.84 mAh |
| Sensors | 0.699 | |
| GNSS | 0.290 | 46s 使用 |
| Wakelock | 0.0653 | 39m 12s |
| Idle | 0.0754 | 13h 14m background |

### 9.2 Top Power UIDs

| Rank | UID | App | Power (mAh) | Main Components |
|------|-----|-----|-------------|-----------------|
| 1 | 0 | root/kernel | 10.2 | CPU 10.1, wakelock 0.05 |
| 2 | 1000 | android/system | 7.53 | CPU 6.96, sensors 0.27, GNSS 0.29 |
| 3 | u0a119 | GMS | 0.938 | CPU 0.65, sensors 0.14, WiFi 0.15 |
| 4 | 2000 | shell | 0.826 | CPU 0.83 |
| 5 | 1001 | phone | 0.423 | sensors 0.29 (13h 14m!) |

### 9.3 Gap Analysis

| Metric | Value |
|--------|-------|
| Battery Capacity | 13,623 mAh |
| Computed Drain (power model) | 1,139 mAh |
| Actual Drain (coulomb counter) | **817–1,090 mAh**（midpoint: **953.5 mAh**） |
| Overestimate | 185.5 mAh |
| Overestimate % | **19.5%** |

> Computed drain (1,139 mAh) 高於 actual drain midpoint (953.5 mAh) 約 19.5%，在可接受範圍內（< 50%）。
>
> **WiFi 功耗估算異常**：WiFi kernel active 達 6h 7m（46.3%），但 BatteryStats 僅估算 1.84 mAh。這暗示 WiFi power profile 可能未正確反映 kernel active 狀態下的實際功耗。實際 WiFi 對 Deep Doze 放電的貢獻可能遠高於 1.84 mAh。

---

## 10. Findings & Recommendations

### 10.1 Critical Issues (P0)

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 1 | **Deep Doze 放電率 83.9 mAh/h** | 13 小時消耗 1,077 mAh（電池容量 8%），理想值的 4.2 倍 | Battery Stats: Deep Doze discharge 1,077 mAh / 12.84h | 找出 Deep Doze 期間的隱藏功耗來源，重點排查 WiFi 和 cellular modem |
| 2 | **WiFi kernel active 46.3%** | 6h 7m WiFi subsystem 活躍但幾乎無數據傳輸 (Rx 25.6s) | Connectivity stats: WiFi kernel active 6h 7m vs Rx+Tx ~26s | 排查 Deep Doze 期間是否有應用繞過網路限制。檢查 WiFi wakelock 持有者，考慮強制 WiFi scan throttling |

### 10.2 High Priority (P1)

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 3 | **Cellular modem 消耗 90 mAh** | 佔 computed drain 7.9%，無 data 傳輸但 Rx 28m 59s | Power estimate: mobile_radio 90.0 mAh | 評估 modem power profile 校準。若設備不需要 cellular data，考慮關閉 mobile data |
| 4 | **timerfd 主導 suspend abort** | 97.9% of abort source observations | Suspend stats: 280 observations 中 274 為 timerfd | 審查 AlarmManager 排程策略，評估是否可合併 timer 或延長間隔 |
| 5 | **IGnss HAL Binder 阻塞 15s** | system_server android.fg 線程 ANR | ANR trace: slow_binder_call to IGnss | 調查 GNSS HAL 實作，確認是否有 blocking I/O 或 firmware 回應延遲 |

### 10.3 Medium Priority (P2)

| # | Issue | Impact | Evidence | Recommendation |
|---|-------|--------|----------|----------------|
| 6 | **idle_factor=1 無指數退避** | 每小時固定 maintenance window，增加 suspend/resume 功耗 | Doze settings: idle_factor=1, 14 cycles in 12.8h | 評估將 idle_factor 恢復為 2.0，讓 Doze 週期指數增長 |
| 7 | **a600000.ssusb wakelock 22m** | USB controller 持有 wakelock 平均 11 分鐘 | Kernel wakelocks: 2 次, avg 11m 14s | 確認是否與 ADB (userdebug) 或 dock 相關。在正式 user build 上驗證 |
| 8 | **ipa_pm_notify 異常 log** | 佔 Error/Fatal log 56% | Insights: 56% of E/F logs | 調查 IPA (Internet Protocol Accelerator) power management 通知異常 |

---

## 11. Data Sources Used

| Section | Data Source |
|---------|------------|
| Power Manager State | DUMPSYS POWER |
| Battery Statistics | DUMPSYS BATTERYSTATS (Statistics since last charge) |
| Suspend Statistics | DUMPSYS SUSPEND_CONTROL_INTERNAL + KERNEL LOG (merged) |
| Kernel Wake Locks | CHECKIN BATTERYSTATS (kwl lines) |
| Alarm Wakeups | DUMPSYS ALARM (Alarm Stats) |
| Doze State & Settings | DUMPSYS DEVICEIDLE |
| Estimated Power | DUMPSYS BATTERYSTATS (Estimated power use) |
| Connectivity | DUMPSYS BATTERYSTATS (Connectivity Power Summary) |
| ANR | FS/data/anr/ trace files |

**Bugreport**: `bugreport-T70-AQ3A.250408.001-2026-02-27-13-29-41.zip` (12.0 MB)
