# Power Management Comparison Report

**Analysis Date**: 2026-02-27
**Device**: Trimble T70, Android 15 (API 35), Qualcomm QCS6490, userdebug build

---

## 1. Bugreport Overview

| | Report A (live-0227) | Report B (0227-pm) |
|---|---|---|
| **Filename** | `bugreport-live-20260227-060841.zip` | `bugreport-T70-AQ3A.250408.001-2026-02-27-13-29-41.zip` |
| **Build Type** | userdebug | userdebug |
| **Start Time** | 2026-02-26 22:51:09 | 2026-02-26 22:51:09 |
| **End Time** | 2026-02-27 06:08 | 2026-02-27 ~12:05 |
| **Statistics Period** | **7h 17m** | **13h 14m** |
| **Battery Capacity** | 13,507 mAh (learned: 13,623) | 13,507 mAh (learned: 13,623) |
| **Battery Level** | 90% | 84% |
| **Total Discharge** | 663 mAh | 1,139 mAh |
| **Charging State** | AC (plug type 1) | AC (plug type 1) |

> **⚠️ 重要背景**：兩份報告來自**同一充電週期**（相同 Start Time），Report B 是 Report A 的延伸（多 ~6 小時）。Report A 涵蓋深夜（22:51–06:08），Report B 涵蓋深夜+上午（22:51–12:05）。因此可計算 **Delta Period**（06:08–12:05，約 5h 57m）的獨立表現。

---

## 2. Core Metrics Comparison

### 2.1 Discharge Rate

| Metric | Report A (7h 17m) | Report B (13h 14m) | Delta Period (~6h) |
|--------|-------------------|--------------------|--------------------|
| Total Discharge | 663 mAh | 1,139 mAh | 476 mAh |
| Overall Rate | 91.0 mAh/h | 86.0 mAh/h | 79.9 mAh/h |
| **Deep Doze Discharge** | **607 mAh** | **1,077 mAh** | **470 mAh** |
| **Deep Doze Rate** | **86.7 mAh/h** | **83.9 mAh/h** | **80.6 mAh/h** |
| Deep Doze Duration | 7h 0m 12s | 12h 50m 36s | ~5h 50m |
| Deep Doze Cycles | 8 | 14 | 6 |
| Screen On Time | 5m 52s (1.3%) | 6m 3s (0.8%) | ~11s |

### 2.2 Deep Doze Discharge Rate

```
Deep Doze Discharge Rate (mAh/h)
Ideal       ────── 20.0 ─┤ ██░░░░░░░░░░░░░░░░░░ (1.0x)
Delta (6h)  ────── 80.6 ─┤ ████████████████░░░░ (4.0x)  ← 上午時段
Report B    ────── 83.9 ─┤ ████████████████▓░░░ (4.2x)  ← 累計 13h
Report A    ────── 86.7 ─┤ █████████████████░░░ (4.3x)  ← 深夜 7h
```

> **Deep Doze 放電率在上午時段（80.6 mAh/h）略低於深夜時段（86.7 mAh/h）**，差距約 7%。兩個時段均遠超理想值，但趨勢顯示上午放電率有小幅改善。可能原因：(1) 深夜時段 GMS FusionEngineFlush 大量觸發（64 次），上午停止；(2) Suspend abort rate 在上午下降。
>
> 兩份報告均屬 **Critical** 等級（> 80 mAh/h），確認 Deep Doze 高放電是**穩定的系統性問題**，非偶發。

---

## 3. Kernel Suspend Analysis

### 3.1 Suspend Statistics

| Metric | Report A | Report B | Delta Period |
|--------|----------|----------|--------------|
| Suspend Attempts | 603 | 949 | 346 |
| Successful | 557 | 885 | 328 |
| Abort (fail) | 46 | 64 | 18 |
| — Task Freeze | 36 | 48 | 12 |
| — Device Fail | 10 | 16 | 6 |
| **Success Rate** | **92.4%** | **93.3%** | **94.8%** |
| Attempts/Hour | 82.8 | 71.7 | 58.1 |
| Aborts/Hour | 6.3 | 4.8 | **3.0** |

```
Suspend Success Rate (%)
Report A  ────── 92.4% ─┤ ██████████████████▒░ (深夜)
Report B  ────── 93.3% ─┤ ██████████████████▓░ (累計)
Delta     ────── 94.8% ─┤ ███████████████████░ (上午)
```

> **上午時段 suspend 表現明顯改善**：
> - Success rate：92.4% → 94.8%（+2.4pp）
> - Abort rate：6.3/h → 3.0/h（**降低 52%**）
> - Suspend 頻率：82.8/h → 58.1/h（降低 30%，平均每 62 秒嘗試一次 vs 每 43 秒）
>
> 上午時段 suspend 週期較長、中斷較少，與 Deep Doze 放電率略降一致。

### 3.2 Abort Source 一致性

| Source | Report A Observations | Report B Observations | 趨勢 |
|--------|----------------------|----------------------|------|
| **timerfd** | 274 (**98.9%**) | 274 (**97.9%**) | **穩定** — confirmed |
| eventpoll | 2 | 1 | 低 |
| qrtr_ws | 1 | 2 | 低 |
| alarmtimer.0.auto | — | 2 | 新增 |
| wcn6750 | — | 1 | 新增 |

> **timerfd 觀測次數在兩份報告中完全相同（274 次）**，表示這些 observations 都來自 kernel log buffer 中相同的早期記錄。上午新增的 abort 主要在 alarmtimer 和 wcn6750。timerfd 佔比在所有報告中一致保持 > 97%，信心等級：**confirmed**。

### 3.3 Last Failed Device

| Field | Report A | Report B |
|-------|----------|----------|
| Device | alarmtimer.0.auto | alarmtimer.0.auto |
| Step | **freeze** | **suspend** |
| Errno | -16 (EBUSY) | -16 (EBUSY) |

> 兩份報告的 last_failed_dev 一致（`alarmtimer.0.auto`, EBUSY），但失敗步驟不同：Report A 為 `freeze`，Report B 為 `suspend`。表示 alarm timer 在兩個 suspend 階段都會造成問題。

---

## 4. Kernel Wake Lock Analysis

### 4.1 Normalized Per-Hour Comparison

| Wake Lock | Report A (time/h, count/h) | Report B (time/h, count/h) | Description |
|-----------|---------------------------|---------------------------|-------------|
| a600000.ssusb | 3.09 min/h, 0.14/h | 1.70 min/h, 0.15/h | USB SSUSB 控制器 |
| PMS.WakeLocks | 0.49 min/h, 29.5/h | 0.48 min/h, 21.1/h | Partial wakelock 匯總 |
| bq40z50-monitor-info | 0.46 min/h, **45.3/h** | 0.31 min/h, **30.7/h** | 電池電量計 |
| NETLINK | 5.9s/h, **158.7/h** | 6.3s/h, **157.1/h** | 網路事件 |
| hal_bluetooth_lock | 4.3s/h, 3.4/h | 3.4s/h, 2.7/h | BT HAL |
| [timerfd] | 3.1s/h, 20.9/h | 2.4s/h, 15.6/h | Userspace timer |
| qcom_rx_wakelock | 1.2s/h, 17.7/h | 1.2s/h, 16.2/h | Modem RX |

**關鍵觀察**：
- **NETLINK 頻率一致**（~158/h），與 WiFi kernel active 高比例相呼應 — **confirmed**
- **bq40z50 頻率下降**（45.3 → 30.7/h），上午時段電池電量計輪詢較少
- **[timerfd] 頻率下降**（20.9 → 15.6/h），與 suspend abort 率降低一致
- **qcom_rx_wakelock 穩定**（~1.2s/h, ~17/h），modem 喚醒行為一致 — **confirmed**

---

## 5. Connectivity

### 5.1 WiFi State Comparison

| Metric | Report A | Report B | Delta Period |
|--------|----------|----------|--------------|
| **WiFi Kernel Active** | **3h 32m (48.7%)** | **6h 7m (46.3%)** | ~2h 35m (~43%) |
| WiFi Rx Time | ~10s | 25.6s | ~16s |
| WiFi Tx Time | ~5s | 0.8s | — |
| WiFi Battery Drain | 1.05 mAh | 1.84 mAh | 0.79 mAh |
| WiFi Data Rx | 44.22 MB | 45.17 MB | 0.95 MB |
| WiFi Signal | great 99%+ | great 100% | — |

> **WiFi kernel active 持續高佔比（43–49%）但實際 Rx/Tx 極低**，此模式跨時段穩定一致 — **confirmed**。Delta period WiFi active 約 43%，略低但仍然異常。WiFi 實際數據傳輸在上午幾乎為 0（僅 0.95 MB），但 kernel active time 仍大量累積。

### 5.2 Cellular State Comparison

| Metric | Report A | Report B |
|--------|----------|----------|
| Kernel Active | 0% | 0% |
| Rx Time | 16m 1s (3.7%) | 28m 59s (3.6%) |
| Battery Drain | **48.6 mAh** | **90.0 mAh** |
| Data Transfer | 0 B | 0 B |
| Signal great | 79.1% | 87.5% |
| Signal good | 20.9% | 12.5% |
| OOS | 0% | 0% |

> **Cellular drain per hour**：48.6/7.28 = **6.68 mAh/h**（A）vs 90.0/13.24 = **6.80 mAh/h**（B）— **高度一致**，confirmed。Modem 待機功耗約 6.7 mAh/h，是 Deep Doze 放電的重要貢獻者（佔 Deep Doze rate ~8%）。
>
> Signal 品質在上午改善（great 87.5% vs 79.1%），無 OOS — 兩份報告均確認信號良好。

### 5.3 Correlation Analysis

| Factor | Report A Rate | Report B Rate | Delta Rate | Correlation |
|--------|--------------|--------------|------------|-------------|
| Deep Doze discharge | 86.7 mAh/h | 83.9 mAh/h | 80.6 mAh/h | baseline |
| Cellular drain | 6.68 mAh/h | 6.80 mAh/h | ~6.9 mAh/h | 穩定，佔 ~8% |
| WiFi kernel active | 48.7% | 46.3% | ~43% | 略降，與放電率正相關 |
| Suspend abort rate | 6.3/h | 4.8/h | 3.0/h | **降低 52%，與放電率負相關** |

---

## 6. Alarm Wakeup Analysis

### 6.1 Per-Hour Comparison

| Alarm Source | Report A (/h) | Report B (/h) | 趨勢 |
|-------------|--------------|--------------|------|
| **GMS FusionEngineFlush** | **8.8** | **0** | **⚠️ 完全消失** |
| TIME_TICK | 6.0 | 4.83 | 降低 |
| PERIODIC_JOB_UPDATE | 1.4 | 1.28 | 穩定 |
| GCM HEARTBEAT | — | 0.53 | 新增 |
| CalendarProvider2 | 0.3 | 0.23 | 穩定 |
| **Total** | **16.9** | **7.25** | **降低 57%** |

> **⚠️ 重大變化：GMS FusionEngineFlush 完全消失**
>
> Report A 中最大的 alarm source（64 次，8.8/h）在 Report B 中完全不存在。由於兩份報告共享同一 Stats 起始點，FusionEngineFlush 的消失表示：
> 1. 某個 app 在 06:08 之後取消了位置請求，導致 sensor fusion 停止
> 2. 或 GMS 模組更新/重啟清除了 alarm 統計
>
> 這也解釋了 alarm wakeup 總頻率從 16.9/h 降至 7.25/h（**降低 57%**），以及上午 suspend abort rate 下降。
>
> **GCM HEARTBEAT（0.53/h）** 出現在 Report B，表示 Google Cloud Messaging 心跳在較長統計週期下變得可見。

---

## 7. Partial Wakelock Analysis

### 7.1 Per-Hour Comparison

| UID | App | Report A (time/h) | Report B (time/h) |
|-----|-----|-------------------|-------------------|
| 0 | root/kernel | 3.84 min/h | 2.48 min/h |
| 1000 | system | 0.41 min/h | 0.42 min/h |
| u0a119 | GMS | 3.1s/h | 1.9s/h |

> Partial wakelock 行為穩定，system UID 一致（~0.42 min/h）— **confirmed**。root UID 在上午降低（可能與 USB activity 減少有關）。整體 partial wakelock 佔比 < 1%，不是主要功耗來源。

---

## 8. Doze Configuration

兩份報告 Doze 設定完全一致：

| Parameter | Value | AOSP Default | Diff |
|-----------|-------|-------------|------|
| inactive_to | 1m | 30m | **縮短 30x** |
| idle_to | 1h | 1h | 相同 |
| idle_factor | **1.0** | 2.0 | **無指數退避** |
| max_idle_to | **1h** | 6h | **縮短 6x** |
| light_idle_to | 5m | 5m | 相同 |
| light_max_idle_to | **30m** | 15m | 放寬 2x |

> 設定跨報告一致 — **confirmed**。所有偏離 AOSP 的設定均為刻意客製。

---

## 9. Estimated Power

### 9.1 Computed vs Actual Drain

| Metric | Report A | Report B |
|--------|----------|----------|
| Computed Drain | 663 mAh | 1,139 mAh |
| Actual Drain | 545–681 mAh (mid: 613) | 817–1,090 mAh (mid: 953.5) |
| Overestimate | 50 mAh (8.2%) | 185.5 mAh (19.5%) |

> Report A 的 power model 校準較佳（8.2%），Report B 的 overestimate 增加到 19.5%。隨著統計時間延長，累計誤差增大，但仍在 50% 以內。

### 9.2 Per-Hour Component Comparison

| Component | Report A (mAh/h) | Report B (mAh/h) | 一致性 |
|-----------|------------------|------------------|--------|
| Cellular | 6.68 | 6.80 | **穩定** |
| Screen | 2.99 | 1.69 | 上午無螢幕使用 |
| CPU | 1.88 | 1.59 | 略降 |
| Bluetooth | 0.40 | 0.37 | 穩定 |
| WiFi | 0.14 | 0.14 | **穩定**（但與 kernel active 不符） |

---

## 10. Additional Observations

### 10.1 FusionEngineFlush 消失

Report A 中 GMS FusionEngineFlush 觸發 64 次（8.8/h），但 Report B 完全未出現。這是跨報告最顯著的差異。可能原因：
- 某個 app（或 GMS 自身的 sensor fusion）在深夜時段活躍，上午停止
- UID u0a119 (GMS) 的 sensors 持有時間：Report A 3h 45m → Report B 3h 45m（未增加），佐證上午期間 sensor fusion 已停止

### 10.2 USB Wakelock 行為

| Metric | Report A | Report B |
|--------|----------|----------|
| a600000.ssusb 時間 | 22m 28s | 22m 29s |
| a600000.ssusb 次數 | 1 | 2 |

Report B 多了一次 USB wakelock（可能是 bugreport 收集觸發），但總時間幾乎未增加（+1s），表示 USB wakelock 主要發生在早期（Report A 涵蓋的時段內）。

### 10.3 ipa_pm_notify

Report B insights 中出現 `ipa_pm_notify` 佔 Error/Fatal log 56%。此為 Qualcomm IPA (Internet Protocol Accelerator) power management 通知，可能與 WiFi kernel active 異常相關。

---

## 11. Root Cause Analysis

### 11.1 Deep Doze 高放電率分解

```
Deep Doze 放電率 ~83 mAh/h
├── [P0] Cellular modem baseline ─── ~6.8 mAh/h (8%)  ← confirmed, 穩定
├── [P0] WiFi subsystem 喚醒 ────── ~?? mAh/h         ← kernel active 46%, 實際功耗未知
├── [P0] SoC baseline drain ─────── ~70+ mAh/h        ← 最大貢獻者, 需硬體量測
│   ├── 頻繁 suspend/resume ────── 每 50-60s 一次
│   ├── timerfd abort ──────────── 佔 ~98% observations
│   └── Maintenance window ─────── 每 1h（idle_factor=1）
├── [P1] FusionEngineFlush ──────── 深夜活躍, 上午停止  ← likely 造成深夜略高放電
├── [P2] Bluetooth ──────────────── ~0.37 mAh/h (0.4%)
└── [P2] Sensors ────────────────── ~0.05 mAh/h (<0.1%)
```

### 11.2 Cross-Report Consistency Matrix

| 現象 | Report A | Report B | Delta | 信心 |
|------|----------|----------|-------|------|
| Deep Doze rate > 80 mAh/h | 86.7 | 83.9 | 80.6 | **confirmed** |
| WiFi kernel active > 40% | 48.7% | 46.3% | ~43% | **confirmed** |
| timerfd > 97% abort obs | 98.9% | 97.9% | — | **confirmed** |
| Cellular drain ~6.8 mAh/h | 6.68 | 6.80 | ~6.9 | **confirmed** |
| NETLINK ~158/h | 158.7 | 157.1 | — | **confirmed** |
| Suspend rate 70-83/h | 82.8 | 71.7 | 58.1 | **confirmed** (趨勢下降) |
| alarmtimer EBUSY | freeze | suspend | — | **confirmed** |
| FusionEngineFlush 活躍 | 8.8/h | 0/h | 0/h | **intermittent** |
| a600000.ssusb > 20m | 22m 28s | 22m 29s | — | **confirmed** (僅早期) |

---

## 12. Prioritized Recommendations

### P0 — Critical

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 1 | **量測 SoC suspend baseline drain** | 定量確認 suspend 深度 | 中（需 Monsoon/PPK2） | 兩份報告 ~70+ mAh/h 無法歸因到任何 component |
| 2 | **排查 WiFi kernel active 異常** | 若能降至 < 10% 可減少 WiFi 喚醒對 suspend 的影響 | 高（需追蹤 WiFi wakelock 持有者） | 跨報告穩定 43-49%, Rx/Tx 僅數十秒 |

### P1 — High Priority

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 3 | **評估 idle_factor=2** | 延長 Deep Doze 間隔，減少 maintenance 頻率 | 低（設定變更） | 14 cycles / 13h vs AOSP ~5 cycles |
| 4 | **調查 timerfd 來源** | 降低 suspend abort rate | 中 | 跨報告穩定 > 97% |
| 5 | **修復 IGnss HAL 阻塞** | 消除 system_server ANR | 中（HAL 修改） | 跨報告一致 |

### P2 — Medium Priority

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 6 | **調查 GMS FusionEngineFlush 觸發條件** | 消除間歇性高頻 alarm wakeup | 中 | Report A 8.8/h, Report B 消失 |
| 7 | **評估 cellular modem 省電模式** | 潛在降低 6.8 mAh/h modem drain | 中 | 跨報告穩定 ~6.8 mAh/h |
| 8 | **排查 ipa_pm_notify 異常** | 可能與 WiFi active 相關 | 低 | 56% of E/F logs |

### P3 — Low Priority

| # | Action | Expected Impact | Effort | Evidence |
|---|--------|----------------|--------|----------|
| 9 | **在 user build 驗證 USB wakelock** | 排除 userdebug 影響 | 低 | a600000.ssusb 22m，可能為 ADB 相關 |
| 10 | **校準 WiFi power profile** | 改善功耗估算準確性 | 低 | WiFi 46% active 但估算僅 1.84 mAh |

---

## 13. Conclusion

### 關鍵發現

1. **Deep Doze 高放電率是穩定的系統性問題**：跨 7h 和 13h 兩份報告，放電率穩定在 80–87 mAh/h（理想值的 4x+），非偶發異常。

2. **WiFi kernel active 異常穩定存在**：43–49% 的 WiFi kernel active time（實際 Rx/Tx < 30s）在兩份報告中一致出現，是需要優先排查的 P0 問題。

3. **上午時段表現略優於深夜**：Deep Doze rate 降低 7%（86.7→80.6 mAh/h），suspend abort rate 降低 52%，alarm wakeup 降低 57%。主要差異為 GMS FusionEngineFlush 在上午停止觸發。

4. **timerfd 為穩定的 suspend abort 主因**：佔 > 97% abort source observations，跨所有報告一致，信心等級 confirmed。

5. **~70+ mAh/h 無法歸因到具體 component**：Power model 能解釋的 component 功耗（cellular 6.8, CPU 1.6, screen 1.7, BT 0.4, WiFi 0.14）合計遠低於實際放電率，表明 SoC baseline suspend drain 是主要功耗來源。

6. **Doze 設定（idle_factor=1）導致每小時固定 maintenance window**：跨報告一致確認 14 cycles / 13h 的固定模式。恢復 idle_factor=2 可延長後期 Doze 間隔，但在解決底層功耗問題前效果有限。

### 建議下一步

1. 使用外接功耗儀（Monsoon Power Monitor 或 Nordic PPK2）量測 SoC 在 suspend 狀態的實際 baseline drain
2. 使用 `dumpsys wifi` 和 `wakelock_tracker` 追蹤 WiFi kernel active 的持有者
3. 在 user build 上重複測試，排除 userdebug 相關因素（ADB, USB wakelock）
4. 嘗試 `idle_factor=2` + `max_idle_to=6h` 設定變更，觀察對放電率的影響
