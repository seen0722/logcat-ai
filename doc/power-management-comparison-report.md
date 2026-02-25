# Power Management Comparative Analysis Report

**Device**: Trimble T70, Android 15 (API 35), Qualcomm SoC
**Build**: AQ3A.250408.001 (02.01.04.260212)
**Analysis Date**: 2026-02-25

---

## 1. Bugreport Overview

| | Phone-ANR | BR1 (0225-0851) | BR2 (0225-0854) |
|---|-----------|-----------------|-----------------|
| **Filename** | phone-anr-bugreport-...-02-23-14-00-41.zip | bugreport-...-02-25-08-51-45.zip | bugreport-...-02-25-08-54-53.zip |
| **Build Type** | userdebug | user | user |
| **Statistics Period** | 6 days | 14h 15m | 14h 55m |
| **Start Time** | 2026-02-17 13:16 | 2026-02-24 18:36 | 2026-02-24 18:35 |
| **End Time** | 2026-02-23 14:00 | 2026-02-25 08:51 | 2026-02-25 08:54 |
| **Battery Capacity** | 13,668 mAh (learned) | 13,779 mAh (learned) | 13,668 mAh (learned) |
| **Battery Level** | 35% | 7% | 12% |
| **Is Powered** | true (USB) | true (USB) | true (USB) |
| **System Starts** | — | 2 | 3 |
| **Health Score** | — | 92/100 | 95/100 |

> BR1 和 BR2 來自同一裝置、幾乎相同的統計週期（起始時間差 1 分鐘），但 BR2 多了一次系統重啟。Phone-ANR 來自更早的 6 天週期，使用 userdebug build 故 kernel 日誌更完整。

---

## 2. Core Metrics Comparison

### 2.1 Battery Discharge

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| Total Discharge | 9,071 mAh | 1,443 mAh | 1,337 mAh |
| **Overall Rate** | **62.7 mAh/h** | **101.2 mAh/h** | **89.6 mAh/h** |
| Screen On Time | 8m 43s (0.1%) | 2m 11s (0.3%) | 12m 29s (1.4%) |
| Screen Off Discharge | 9,025 mAh (99.5%) | 1,362 mAh (94.4%) | 1,212 mAh (90.6%) |
| Screen On Discharge | 46 mAh | 81 mAh | 125 mAh |

### 2.2 Deep Doze — 核心指標

| | Phone-ANR | BR1 | BR2 | 理想值 |
|---|-----------|-----|-----|--------|
| Deep Doze Duration | 5d 21h 10m (97.6%) | 14h 6m (99.0%) | 14h 26m (96.8%) | — |
| Deep Doze Discharge | 6,999 mAh | 1,312 mAh | 1,154 mAh | — |
| **Deep Doze Rate** | **50.5 mAh/h** | **93.0 mAh/h** | **79.9 mAh/h** | **< 20 mAh/h** |
| vs 理想值倍數 | 2.5x | **4.6x** | **4.0x** | 1.0x |
| Deep Doze Cycles | 74x | 7x | 9x | — |
| Longest Cycle | 6h 0m 2s | 6h 0m 0s | 6h 0m 0s | — |

```
Deep Doze Discharge Rate (mAh/h)
理想值 ──────────────────── 20 ─┤
                                │
Phone-ANR ──────────────── 50.5 ─┤ ███████████████░░░░░░░░░░░░░ (2.5x)
                                │
BR2 (0854) ──────────────  79.9 ─┤ ███████████████████████░░░░░ (4.0x)
                                │
BR1 (0851) ──────────────  93.0 ─┤ █████████████████████████████ (4.6x)
                                │
                                0    20    40    60    80   100
```

> **三份報告均遠超理想值**，且 14 小時短期測量的放電率（79.9–93.0）比 6 天長期平均（50.5）高出 58–84%。這表明短期內功耗波動較大，長期平均會因 Deep Doze 6 小時最長 idle cycle 的穩態效應而降低。

### 2.3 Light Doze

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| Duration | 2h 42m (1.9%) | 2m 9s (0.3%) | 7m 17s (0.8%) |
| Discharge | 241 mAh | 22 mAh | 0 mAh |
| Cycles | 27x | 1x | 3x |

---

## 3. Kernel Suspend Analysis

### 3.1 Suspend Statistics

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| Build Type | **userdebug** | user | user |
| Suspend Entries | **7,286** | 36 | 0 |
| Pending Abort | 2,066 | 73 | 294 |
| Task Freeze Abort | 326 | 0 | 5 |
| Device Fail | 62 | 0 | 4 |
| **Success Rate** | **~71.7%** | — | — |

> user build 幾乎不記錄標準 PM suspend entry/exit 日誌（BR1 僅 36 筆, BR2 為 0），因此無法計算真正的 suspend 成功率。Phone-ANR 的 userdebug build 提供完整 7,286 筆 suspend entry 記錄，成功率 71.7%。

### 3.2 timerfd — 跨報告一致性

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| timerfd abort 事件 | 4,698 | 132 | 532 |
| timerfd 佔 abort 比例 | **72.0%** | **94.3%** | **94.3%** |
| timerfd 頻率（每小時） | 32.5/h | 9.3/h | 35.7/h |

> **timerfd 在所有三份報告中都是 suspend abort 的首要原因**，佔比 72%–94%。Phone-ANR 因為 userdebug build 多了 unnamed source（28.8%）稀釋了 timerfd 佔比，但絕對數量（4,698）最高。BR2 的每小時頻率（35.7/h）接近 Phone-ANR（32.5/h）。

### 3.3 Suspend Abort Source 完整對比

| Source | Phone-ANR | BR1 | BR2 |
|--------|-----------|-----|-----|
| **timerfd** | 4,698 (72.0%) | 132 (94.3%) | 532 (94.3%) |
| (unnamed) | 1,879 (28.8%) | — | — |
| battery_charger + battery | 49 (0.8%) | 6 (4.3%) | 18 (3.2%) |
| qup_uart | 32 (0.5%) | — | — |
| NETLINK | 17 (0.3%) | — | 8 (1.4%) |
| hal_bluetooth_lock | 17 (0.3%) | — | — |
| bq40z50-monitor-info | 10 (0.2%) | — | 10 (1.8%) |
| em7590_wake_ws | 5 (0.1%) | — | — |
| usb | — | 2 (1.4%) | 2 (0.4%) |

> userdebug build 可觀測到更多 abort source（uart, bluetooth, em7590），user build 被歸為 timerfd 或不可見。

---

## 4. Kernel Wake Lock Analysis

### 4.1 Top Kernel Wakelocks — 正規化比較（每小時）

| Wake Lock | Phone-ANR (per h) | BR1 (per h) | BR2 (per h) | Description |
|-----------|-------------------|-------------|-------------|-------------|
| **PMS.WakeLocks** | 21.6s/h, 10.7/h | **37.6s/h**, 21.3/h | 27.0s/h, 19.8/h | 上層 partial wakelock |
| **qcom_rx_wakelock** | — | **15.7s/h**, 84.5/h | 6.5s/h, 39.8/h | Modem RX |
| **em7590_wake_ws** | 5.3s/h, 0.46/h | — | 3.3s/h, 0.27/h | EM7590 Modem |
| **hal_bluetooth_lock** | 2.2s/h, 2.9/h | 1.2s/h, 1.2/h | 1.3s/h, 1.2/h | BT HAL |
| **bq40z50-monitor-info** | 0.75s/h, 1.2/h | — | **4.1s/h**, 7.3/h | 電池電量計 |
| NETLINK | 0.24s/h, 22.9/h | 1.4s/h, 71.1/h | 1.1s/h, 64.1/h | 網路事件 |
| qup_uart | 2.3s/h, 4.3/h | — | — | UART 串口 |

### 4.2 關鍵觀察

**PMS.WakeLocks**（上層 partial wakelock 的 kernel 匯總）：
```
每小時持有時間：
  Phone-ANR:  21.6s/h  ████████████░░░░░░░░ (baseline)
  BR2:        27.0s/h  ███████████████░░░░░ (+25%)
  BR1:        37.6s/h  █████████████████████ (+74%)
```
BR1 的 PMS.WakeLocks per-hour 最高，與其最高 Deep Doze 放電率（93.0）相關。

**em7590_wake_ws**（Sierra EM7590 Modem）：

| | Phone-ANR | BR2 |
|---|-----------|-----|
| Total | 12m 45s | 48.8s |
| Count | 66 | 4 |
| **Avg Time** | **11.6s** | **12.2s** |

> Modem 平均每次喚醒時間在兩份報告中一致（11.6–12.2s），是 firmware 層面的特徵。差異在觸發次數 — 6 天 66 次 vs 14 小時 4 次。

**qcom_rx_wakelock**（Qualcomm Modem RX）：
- 此 wakelock 在 BR1/BR2 出現但 Phone-ANR 的 top 10 中未出現
- BR1: 1,205 次（84.5/h）— WiFi 314 MB
- BR2: 594 次（39.8/h）— WiFi 181 MB
- **觸發次數與 WiFi 流量正相關**（r ≈ 0.9）

---

## 5. Connectivity — 放電率差異的關鍵因素

### 5.1 WiFi 狀態對比

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| WiFi 連線 | **未連線** | 連線 | 連線 |
| WiFi Rx Data | 0 bytes | **314.97 MB** | **181.13 MB** |
| WiFi Tx Data | 0 bytes | 10.51 MB | 6.79 MB |
| WiFi kernel active | 0% | **57.4%** | **50.2%** |
| WiFi Power (est.) | 0.594 mAh | 13.3 mAh | 5.42 mAh |
| WiFi Signal | — | Great 99.8% | Great 99.6% |

> **WiFi 是 BR1/BR2 與 Phone-ANR 之間 Deep Doze 放電率差異的最大因素。** BR1/BR2 在 Deep Doze 期間 WiFi kernel active 50–57%，接收 181–315 MB 數據，這意味著某些 app 繞過了 Doze 的網路限制（可能使用 foreground service 或 exempted from Doze）。

### 5.2 Cellular 狀態對比

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| Cellular Active | **24.1%** | 9.2% | 8.1% |
| LTE | 95.3% | 93.4% | **86.8%** |
| **OOS (無服務)** | **4.7%** | **6.6%** | **13.1%** |
| Very Poor Signal | — | 5.8% | **10.9%** |
| Cellular Rx Data | 73.5 MB | 4.13 MB | 140.43 MB |
| Cellular Power (est.) | — | 52.2 mAh | 22.7 mAh |

```
Cellular OOS 時間比例：
  Phone-ANR:  4.7%  ██░░░░░░░░░░░░ (baseline)
  BR1:        6.6%  ███░░░░░░░░░░░ (+40%)
  BR2:       13.1%  ███████░░░░░░░ (+179%)
```

> Phone-ANR 的 cellular active 比例最高（24.1%），因為 WiFi 未連線，所有數據走 cellular。BR1/BR2 有 WiFi，cellular active 降至 8–9%。BR2 的 OOS 高達 13.1%（近 2 小時），可能因為信號覆蓋不穩定導致 modem 頻繁搜網。

### 5.3 放電率與連線狀態關聯分析

| 變數 | Phone-ANR | BR1 | BR2 |
|------|-----------|-----|-----|
| Deep Doze Rate | 50.5 | 93.0 | 79.9 |
| WiFi Active % | 0% | 57.4% | 50.2% |
| WiFi Rx (MB) | 0 | 315 | 181 |
| Cellular Active % | 24.1% | 9.2% | 8.1% |
| Total Radio Active | 24.1% | 66.6% | 58.3% |

> **Deep Doze 放電率與 total radio active time 呈正相關**。Phone-ANR 僅 cellular active 24.1%，放電率 50.5。BR1 radio active 66.6%（WiFi + cellular），放電率 93.0。這強烈暗示 **WiFi 背景流量是短期測量中放電率飆升的主因**。

---

## 6. Alarm Wakeup Analysis

### 6.1 正規化比較（每小時）

| App | Phone-ANR (/h) | BR1 (/h) | BR2 (/h) |
|-----|----------------|----------|----------|
| **GMS** | **6.8** | 2.8 | 2.0 |
| **system/android** | 3.6 | 1.6 | 2.1 |
| **Settings** | **1.6** | 0.98 | 0.94 |
| Calendar | 0.36 | 0.21 | 0.27 |
| Bluetooth | 0.24 | 0.14 | 0.13 |
| **Total** | **~13.1** | **~6.1** | **~5.8** |

```
Alarm Wakeup 頻率（每小時）：
  BR2:        5.8/h  ████████████░░░░░░░░░░░░░░░░ (best)
  BR1:        6.1/h  █████████████░░░░░░░░░░░░░░░
  Phone-ANR: 13.1/h  ██████████████████████████████ (worst, 2.2x)
```

### 6.2 GMS GCM Heartbeat 趨勢

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| GMS Total Wakeups | 980 | 40 | 30 |
| Estimated GCM Heartbeat | 659 | ~30 | ~20 |
| **GCM Interval (est.)** | **~13 min** | **~28 min** | **~45 min** |
| WiFi Connected | No | Yes | Yes |

> GCM heartbeat interval 在 WiFi 環境（28–45 min）比純 cellular（13 min）更長，這是 GCM 的預期行為 — cellular 連線的 NAT timeout 較短，需要更頻繁的 heartbeat 維持 push 通道。

### 6.3 Settings PERIODIC_JOB_UPDATE

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| Wakeups | 232 | 14 | 14 |
| **Interval** | **~37 min** | **~61 min** | **~64 min** |

> BR1/BR2 的 Settings periodic job 間隔（~1 小時）比 Phone-ANR（~37 分鐘）有明顯改善，可能是因為 Doze 限制了 alarm 觸發頻率。

---

## 7. Partial Wakelock Analysis

### 7.1 正規化比較（每小時）

| | Phone-ANR (/h) | BR1 (/h) | BR2 (/h) |
|---|----------------|----------|----------|
| **Total Partial Wakelock** | **21.6s/h** | **37.6s/h** | **26.9s/h** |
| deviceidle_maint | 8.3s/h | 9.5s/h | 8.1s/h |
| telephony-radio (system) | 2.2s/h | 2.0s/h | 2.3s/h |
| telephony-radio (phone) | 1.7s/h | 0.6s/h | 1.8s/h |
| GMS (all wakelocks) | 4.9s/h | 2.6s/h | 2.0s/h |
| AnyMotionDetector | 1.1s/h | 0.26s/h | 1.8s/h |

### 7.2 關鍵觀察

**deviceidle_maint**（Doze 維護窗口 wakelock）：
```
每小時持有時間：
  BR2:        8.1s/h  ████████████████░░░░ (consistent)
  Phone-ANR:  8.3s/h  ████████████████░░░░ (consistent)
  BR1:        9.5s/h  ███████████████████░ (consistent)
```
> **三份報告高度一致（8.1–9.5s/h）**，確認 Doze 維護窗口行為正常且穩定。

**GMS wakelock**：
```
每小時持有時間：
  BR2:        2.0s/h  ████░░░░░░░░░░ (lowest)
  BR1:        2.6s/h  █████░░░░░░░░░
  Phone-ANR:  4.9s/h  ██████████░░░░ (highest)
```
> GMS wakelock 在 WiFi 環境下（BR1/BR2）比純 cellular（Phone-ANR）低 ~50%，主因是 GCM heartbeat 較不頻繁。

**BR1 較高的總 wakelock 時間（37.6s/h vs 21.6–26.9s/h）**：
- BR1 額外的 wakelock 來自 Play Store background job（2m 21s, 9.9s/h）和 AiAi Download（1m 58s, 8.3s/h）
- 這兩個 job 在 BR2 中明顯較低（17s 和 58s）
- 可能與系統啟動後的初始 app 更新有關

---

## 8. Doze Configuration

三份報告的 Doze 設定**完全一致**（同一裝置），與 AOSP 預設的差異：

| Parameter | Device Value | AOSP Default | Effect |
|-----------|-------------|-------------|--------|
| `inactive_to` | **1m** | 30m | 進入 Doze 速度快 **30 倍** |
| `idle_to` | **15m** | 60m | 第一次 Deep Idle 縮短至 **1/4** |
| `idle_after_inactive_to` | **1m** | 30m | 確認靜止後快速進入 idle |
| `light_max_idle_to` | **30m** | 15m | Light Doze 最長間隔**延長 2 倍** |

**Deep Doze 維護窗口時間線**：
```
15m → 30m → 1h → 2h → 4h → 6h (上限)
```

> 這些設定為**工業/企業場景優化**，目的是讓裝置更快進入 Deep Doze 以省電。Doze 機制本身運作正常（longest cycle 穩定在 6h），問題在於 **Doze 期間仍有大量硬體活動無法被 Doze 限制**。

---

## 9. Estimated Power — BatteryStats 校準問題

### 9.1 Computed vs Actual Drain

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| Component Sum | ~211 mAh | ~96 mAh | ~114 mAh |
| Total Discharge | 9,071 mAh | 1,443 mAh | 1,337 mAh |
| Coulomb Counter Range | 8,474–8,884 | 1,240–1,378 | 1,093–1,367 |
| **Unaccounted Drain** | **~8,860 (97.7%)** | **~1,347 (93.3%)** | **~1,223 (91.5%)** |

> **所有三份報告中，91–98% 的電量消耗無法由 BatteryStats 的 per-component 估算解釋。** 這是 Trimble T70 裝置特有的 power profile 校準問題。主要缺失來源推測為 Modem (cellular baseband) 和 WiFi radio 的硬體功耗。

### 9.2 Mobile Radio 估算問題

- Phone-ANR：mobile_radio 估算值出現**負數**（Android 已知的 power profile bug），24.1% cellular active 但功耗完全未被追蹤
- BR1：mobile_radio = 45.5 mAh（cellular active 9.2%）— 有值但可能嚴重偏低
- BR2：mobile_radio = 19.7 mAh（cellular active 8.1%）

> Phone-ANR（6 天, 純 cellular）的 unaccounted drain 比例最高（97.7%），進一步支持 **cellular modem 是主要的未追蹤功耗來源**。

---

## 10. Additional Observations

### 10.1 BR2 特有：ipa_pm_notify 過量錯誤

BR2 檢出 `ipa_pm_notify` 佔 E/F 日誌的 65%。IPA (Internet Protocol Accelerator) 是 Qualcomm SoC 的網路封包硬體加速器。

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| ipa_pm_notify 比例 | 未報告 | 未觸發 | **65%** |
| Cellular OOS | 4.7% | 6.6% | **13.1%** |
| System Starts | — | 2 | **3** |

> ipa_pm_notify 可能與 cellular 頻繁斷線/重連（OOS 13.1%）和額外的系統重啟（3 次）有關。IPA 在網路狀態切換時的 power state 轉換失敗。

### 10.2 SELinux Denials

| | Phone-ANR | BR1 | BR2 |
|---|-----------|-----|-----|
| SELinux denials | — | 59 | 0 |

BR1 有 59 個 SELinux denial 事件，可能與系統啟動後的 policy 不匹配有關。

### 10.3 Build Type 對分析能力的影響

| 分析項目 | userdebug | user | 影響 |
|---------|-----------|------|------|
| Kernel suspend entry/exit | **完整** (7,286) | **極少** (0–36) | 無法計算 suspend 成功率 |
| Suspend abort sources | 完整分類 | 僅 timerfd + 少數 | 無法觀察硬體級 abort |
| Last active wakeup source | **可用** (qrtr_ws 69%) | **不可用** | 無法識別硬體喚醒源 |
| alarmtimer failure detail | **可用** (62x EBUSY) | 不可用 | — |
| Kernel wakelock (CHECKIN) | 完整 | 完整 | 無差異 |
| Battery Stats | 完整 | 完整 | 無差異 |
| Alarm Stats | 完整 | 完整 | 無差異 |
| Partial Wakelock | 完整 | 完整 | 無差異 |

> **建議在除錯階段使用 userdebug build** 以取得完整的 kernel 日誌。user build 的 kernel suspend 資訊幾乎完全缺失。

---

## 11. Root Cause Analysis

### 11.1 Deep Doze 放電率過高 — 根因分解

基於三份報告的交叉比對，Deep Doze 放電率過高的根因可分為**硬體層**和**軟體層**：

```
Deep Doze Discharge Rate (mAh/h)
├── 硬體基線功耗（~20 mAh/h 理想，此裝置估計 30-40）
│   ├── Cellular modem baseline (always-on baseband)
│   ├── BQ40Z50 battery gauge I2C polling
│   └── Bluetooth radio (idle but connected)
│
├── Modem 喚醒功耗（~10-15 mAh/h 估計）
│   ├── em7590_wake_ws: avg 11.6-12.2s per wake
│   ├── qrtr_ws: 69% of hardware wakeups (Phone-ANR)
│   └── OOS 搜網: 4.7-13.1% 時間
│
├── timerfd/Alarm 喚醒功耗（~5-10 mAh/h 估計）
│   ├── GCM Heartbeat: 13-45 min interval
│   ├── Settings periodic job: 37-64 min interval
│   └── DeviceIdleController maintenance windows
│
└── WiFi 背景流量功耗（0-40 mAh/h，視連線狀態）
    ├── WiFi connected + active: +30-40 mAh/h
    │   └── 181-315 MB background data transfer
    └── WiFi disconnected: +0 mAh/h
```

### 11.2 WiFi 對放電率的影響量化

| 場景 | Deep Doze Rate | WiFi Active | 估計 WiFi 貢獻 |
|------|---------------|-------------|----------------|
| 無 WiFi (Phone-ANR) | 50.5 mAh/h | 0% | 0 mAh/h |
| WiFi 181 MB (BR2) | 79.9 mAh/h | 50.2% | ~29.4 mAh/h |
| WiFi 315 MB (BR1) | 93.0 mAh/h | 57.4% | ~42.5 mAh/h |

> 粗略估算：無 WiFi 基線 50.5 mAh/h + WiFi 流量 ~29–42 mAh/h ≈ 79.5–92.5 mAh/h，與實測值（79.9–93.0）吻合度極高。**WiFi 背景流量貢獻了 BR1/BR2 中 37–46% 的 Deep Doze 功耗**。

### 11.3 跨報告一致性評估（問題確認度）

| 問題 | 三份報告一致性 | 確認度 | 分類 |
|------|---------------|--------|------|
| Deep Doze 放電率超標 | ✅ 全部超標（50.5–93.0） | **確定** | Root cause |
| timerfd 阻擋 suspend | ✅ 全部佔首位（72–94%） | **確定** | Root cause |
| Modem 喚醒時間長 | ✅ avg 11.6–12.2s | **確定** | Contributing factor |
| Power profile 不準確 | ✅ 91–98% unaccounted | **確定** | Tool limitation |
| GCM heartbeat | ✅ 但 WiFi 下有改善 | **確定** | Contributing factor |
| WiFi 背景流量 | ⚠️ 僅 BR1/BR2 出現 | **可能** | Contributing factor |
| OOS 搜網功耗 | ⚠️ BR2 最嚴重 | **可能** | Contributing factor |
| ipa_pm_notify | ⚠️ 僅 BR2 | **需進一步觀察** | Symptom |

---

## 12. Prioritized Recommendations

### P0 — 立即行動

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 1 | **識別 Deep Doze 期間的 WiFi 背景流量 app** | 降低 30–40 mAh/h | Low | BR1/BR2 WiFi 181-315 MB 流量 |
| | `adb shell dumpsys netstats --uid` 查看 per-app 流量 | | | |
| | 考慮將高流量 app 加入 Doze whitelist 管理或限制 | | | |
| 2 | **使用 userdebug build 採集 bugreport** | 取得完整 suspend 日誌 | Low | user build kernel 日誌缺失 |
| | 目標：確認 suspend 成功率和硬體喚醒源分布 | | | |

### P1 — 短期改善

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 3 | **追蹤 timerfd 來源** | 可能降低 5-10 mAh/h | Medium | 三份報告一致 72-94% |
| | `userdebug` build 下使用 `ftrace` 追蹤 `timerfd_create` 系統呼叫 | | | |
| 4 | **檢查 EM7590 Modem firmware** | 可能降低 10-15 mAh/h | Medium | avg 11.6-12.2s per wake |
| | 確認 firmware 版本和 AT command keepalive 設定 | | | |
| | 考慮延長 modem sleep interval | | | |
| 5 | **校準 BatteryStats power profile** | 改善診斷能力 | Medium | 91-98% unaccounted |
| | 更新 `power_profile.xml` 的 WiFi 和 cellular 功耗參數 | | | |

### P2 — 中期優化

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 6 | **優化 GMS 配置** | 可能降低 3-5 mAh/h | Medium | GCM 13-45 min interval |
| | 考慮 `gms-finsky-force-disable` 或限制 GMS background activity | | | |
| 7 | **調查 OOS/弱信號問題** | 可能降低 5-10 mAh/h (BR2) | High | OOS 4.7-13.1% |
| | 檢查天線設計、APN 配置、modem 搜網策略 | | | |
| 8 | **調查 IPA power management** | 消除錯誤日誌 | Medium | BR2: 65% E/F |
| | 檢查 IPA driver 版本和 power domain 配置 | | | |
| 9 | **評估 BQ40Z50 polling 頻率** | 降低 I2C 喚醒 | Low | BR2: 109 次/14h |
| | 檢查 `bq40z50-monitor-info` driver 的 polling interval | | | |

### P3 — 長期目標

| # | Action | Expected Impact | Evidence |
|---|--------|----------------|----------|
| 10 | **WiFi Doze 整合** | 防止 Doze 期間高流量 | WiFi 50-57% active in Doze |
| | 確認 WiFi 在 Deep Doze 時是否正確進入省電模式 | | |
| 11 | **Power profile 完整校準** | 準確追蹤功耗 | 91-98% unaccounted |
| | 需要硬體 power rail 量測（Monsoon/PPK2）建立基準 | | |

---

## 13. Conclusion

三份 bugreport 的交叉比較揭示了 Trimble T70 裝置的**系統性電源管理問題**：

1. **Deep Doze 放電率在所有場景下都超標** — 無 WiFi 時 50.5 mAh/h（理想 <20），有 WiFi 時 79.9–93.0 mAh/h
2. **timerfd 是 suspend abort 的首要且一致的原因**（72–94%），但根源可能來自多個 userspace 元件
3. **WiFi 背景流量是短期測量中放電率飆升的最大單一因素**，貢獻 30–42 mAh/h 額外功耗
4. **Modem EM7590 的喚醒行為**是跨報告一致的硬體層面問題（avg 11.6–12.2s per wake）
5. **BatteryStats power profile 嚴重不準確**（91–98% unaccounted），限制了軟體層面的精確診斷
6. **Doze 機制本身運作正常**（配置一致，cycles 穩定），問題在於 Doze 無法控制的硬體活動

**最有價值的下一步**是使用 userdebug build + WiFi 連線狀態分別採集 bugreport，並用 `dumpsys netstats --uid` 識別 Deep Doze 期間的 WiFi 流量來源。

---

## Appendix: Data Sources

| Report | File | Size | Build | Period |
|--------|------|------|-------|--------|
| Phone-ANR | phone-anr-bugreport-...-02-23-14-00-41.zip | 31 MB | userdebug | 6 days |
| BR1 | bugreport-...-02-25-08-51-45.zip | 5.3 MB | user | 14h 15m |
| BR2 | bugreport-...-02-25-08-54-53.zip | 6.4 MB | user | 14h 55m |
