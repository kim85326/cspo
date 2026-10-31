# Story 036：觸覺回饋

**身為** 用手機記帳的人
**我想要** 存檔、刪除、切換時手機輕輕震一下
**以便** 不用盯著畫面也知道動作有沒有成功

> **規格外的功能**（原生功能第一批）。由功能開關 `haptics` 控制，預設關閉（Story 033）。
> 加了原生套件 `expo-haptics`，**一定要重打 APK（build 6）**。網頁版什麼都不做。

## 做了什麼

統一包在 `src/ui/haptics.ts`，畫面用 `useHaptics()`，不直接 import `expo-haptics`。

| 時機 | 回饋 | 在哪裡 |
|---|---|---|
| 存檔成功 | 成功（notification success） | 新增／編輯交易、記錄／編輯／確認股利、新增／編輯定期定額、從截圖匯入 |
| 刪除確認 | 警告（notification warning） | 交易、股利、定期定額按「確定刪除」成功後 |
| 切換分頁 | 選取（selection） | 底部分頁列（含「新增」） |
| 下拉重新整理 | 輕微撞擊（impact light） | 首頁總覽 |
| 開關切換 | 選取（selection） | 設定頁所有開關、定期定額的啟用／暫停 |

- 功能開關關閉、網頁版：每個方法都是空函式。
- 手機本身關了觸控回饋（Android 設定、iOS 低電量模式）就不會震；震動失敗一律忽略，不影響存檔、刪除。
- Android 的 `VIBRATE` 權限由 `expo-haptics` 自動加上，不用跳權限詢問。

## 驗收條件

```gherkin
Scenario: 預設不震
  Given 遠端沒有打開 haptics
  Then 所有動作都不震

Scenario: 存檔成功
  Given haptics 已打開
  When 我新增一筆交易並存檔成功
  Then 手機輕震一下
  And 存檔失敗（例如賣超）時不震

Scenario: 其他時機
  Then 刪除確認、切換分頁、首頁下拉重新整理、切換開關時都會輕震

Scenario: 網頁版
  Then 什麼都不做，也不會出錯
```

## 對應的自動化測試

| 情境 | 測試 |
|---|---|
| 開關關閉不震、五種時機各自的回饋類型、網頁版不震、震動失敗不丟錯 | `src/ui/haptics.test.tsx`（mock `expo-haptics`） |

震的強度與手感只能在真機確認。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] build 6 真機實測
