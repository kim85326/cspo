# Story 035：打開 app 時用指紋／臉部／螢幕鎖驗證

**身為** 把投資紀錄記在手機裡的人
**我想要** 打開「賺了嗎」時要先用指紋或臉部解鎖
**以便** 手機借給別人、或放在桌上時，別人看不到我的持股與損益

> **規格外的功能**（原生功能第一批）。由功能開關 `biometricLock` 控制，預設關閉（Story 033）。
> 加了原生套件 `expo-local-authentication`，**一定要重打 APK（build 6）**。網頁版不顯示這個開關。

## 做了什麼

- 設定頁「安全」區塊：「打開 app 時要驗證」，預設關閉。
  - 打開前先檢查手機有沒有設定螢幕鎖（PIN、圖形、密碼）或指紋、臉部；**什麼都沒有就不讓打開**，說明要先到系統設定加上螢幕鎖。
  - 有的話先驗證一次（確認是本人），成功才打開。關掉不用驗證。
  - 剛打開開關不會立刻把畫面鎖住，下次啟動才生效。
- **什麼時候要驗證**：app 啟動時；切到背景**滿 1 分鐘**再回來時。鎖定時整個畫面蓋上深藍的「賺了嗎已上鎖」，自動跳出系統的驗證框。
- **驗證失敗**：留在鎖定畫面，顯示原因（取消、失敗、嘗試太多次被系統暫時鎖住），按「解鎖」重試。
- **沒有登錄生物辨識**：系統驗證框可以改輸入裝置密碼（`disableDeviceFallback: false`），只設了 PIN 的手機也能用。
- **開了之後才把螢幕鎖拿掉**：說明「這支手機目前沒有設定指紋、臉部或螢幕鎖，無法驗證」，提供「繼續使用」。不把人鎖在自己的資料外面；要保護就請先設定螢幕鎖。
- app 啟動、讀完手機裡的設定前先蓋一層深藍畫面，避免記帳資料閃一下。

## 驗收條件

```gherkin
Scenario: 預設不驗證
  Given 遠端打開了 biometricLock，我沒動過設定
  When 我打開 app
  Then 直接看到首頁

Scenario: 打開開關
  Given 手機有登錄指紋
  When 我在設定頁打開「打開 app 時要驗證」
  Then 跳出指紋驗證，成功後開關變成開的

Scenario: 手機沒有螢幕鎖
  Given 手機沒有設定任何螢幕鎖
  When 我打開開關
  Then 開關維持關閉，說明要先到系統設定加上螢幕鎖

Scenario: 啟動時驗證
  Given 開關是開的
  When 我把 app 滑掉再打開
  Then 先看到「賺了嗎已上鎖」並跳出指紋驗證，成功後才看到首頁

Scenario: 驗證失敗或取消
  When 我按了取消（或指紋不對）
  Then 留在鎖定畫面顯示原因，按「解鎖」可以再試
  And 系統驗證框裡可以改輸入手機的 PIN／圖形

Scenario: 短暫離開不用重新驗證
  Given 我已經解鎖
  When 我切到別的 app 不到 1 分鐘就回來
  Then 不用再驗證
  When 我離開滿 1 分鐘再回來
  Then 要再驗證一次

Scenario: 遠端關掉功能
  When Elaine 把 biometricLock 關掉
  Then 不再要求驗證，設定頁也沒有這個開關（手機裡存的開關值保留，再打開功能時恢復）

Scenario: 網頁版
  Then 沒有這個開關，也不會出現鎖定畫面
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 |
|---|---|---|
| 滿 1 分鐘才重新上鎖、錯誤碼歸類與說明、沒有螢幕鎖不能開 | `src/domain/appLock.test.ts` | — |
| 啟動時鎖住並自動驗證、失敗重試、被系統鎖住、螢幕鎖被拿掉、背景 59 秒 / 60 秒、剛打開開關不立刻鎖、功能開關關閉 | — | `src/ui/AppLockGate.test.tsx`（驗證函式由 props 注入） |
| 設定頁：預設關閉、先驗證才打開、沒有螢幕鎖、只有 PIN、取消、關掉不用驗證 | — | `src/screens/SettingsScreen.device.test.tsx`（mock `@/native/biometrics`） |

系統的指紋／臉部驗證框、改輸入 PIN、嘗試太多次被鎖住，都只能在真機上確認。

## 決策紀錄

1. **用 `expo-local-authentication`、允許裝置密碼**：沒登錄指紋的手機也能保護；指紋一直失敗時也不會被鎖在外面。Android 的生物辨識等級用預設的 `weak`（含相機臉部解鎖），對「不讓旁人偷看」夠用。
2. **重新上鎖的時間 1 分鐘**：切去券商 app 看一下、回來對帳時不用每次驗證。
3. **只在切到「背景」時計時**，不算「inactive」：iOS 跳出 Face ID 框時 app 會變 inactive；Android 改輸入裝置密碼會開另一個畫面，驗證途中的狀態變化一律不算。
4. **螢幕鎖被拿掉時讓人進去**：app 本身沒有自己的密碼，這時候硬鎖只會讓使用者失去自己的資料。

## 檔案

- 判斷與文字：`src/domain/appLock.ts`
- `expo-local-authentication` 包裝：`src/native/biometrics.ts`（網頁版 `biometrics.web.ts`）
- 鎖定畫面：`src/ui/AppLockGate.tsx`（在根 layout）；開關：`src/screens/SettingsScreen.tsx`；存在手機：`src/data/devicePrefs.ts`

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] build 6 真機實測
