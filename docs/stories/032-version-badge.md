# Story 032：看得出手機上跑的是哪一版

**身為** 測試同學（以及看 bug 回報的工程同學、PO）
**我想要** 在 app 裡一眼看出自己跑的是哪個 APK、有沒有收到 OTA 更新、還是 Expo Go／網頁版
**以便** 回報 bug 時附上正確的版本，工程同學不用猜

## 驗收條件

版本號規則見 [docs/architecture.md](../architecture.md) 第 7 節「版本號規則」。下面的「build 4」「10/27 16:05」只是舉例。

```gherkin
Scenario: 裝 APK、還沒收到 OTA
  Given 我裝的是下載頁上的 build 4
  When 我打開 app，捲到最底部
  Then 免責聲明下面有一行小字「v1.0.0 · build 4」

Scenario: 裝 APK、收到 OTA 更新
  Given 我裝的是 build 4，工程同學在 10/27 16:05 發了 OTA「修正比較卡排序」
  When 我把 app 滑掉重開兩次，捲到最底部
  Then 那一行變成「v1.0.0 · build 4 · OTA 10/27 16:05」
  And 點一下展開後看得到 OTA 說明「修正比較卡排序」

Scenario: OTA 沒有說明
  Given 這個 OTA 不是用 npm run ota 發的，bundle 裡沒有說明
  When 我點開版本資訊
  Then OTA 說明顯示「更新」加 update ID 前 8 碼

Scenario: Expo Go
  Given 我用 Expo Go 掃工程同學的 QR code
  When 我捲到最底部
  Then 那一行是「開發版（Expo Go） · v1.0.0」，不會出現 build 或 OTA

Scenario: 網頁版
  Given 我打開工程同學給的 tunnel 網址
  When 我捲到最底部
  Then 那一行是「開發版（網頁版） · v1.0.0」

Scenario: 看完整資訊
  Given 我在任何一種執行方式
  When 我點那一行小字
  Then 展開執行環境、平台、App 版本、程式來源；APK 另外有 build（含 versionCode）、Runtime version、Channel、Update ID；OTA 另外有時間與說明
  And 再點一次就收起來

Scenario: 複製版本資訊
  Given 我點開了版本資訊
  When 我按「複製版本資訊」
  Then 第一行摘要加上每個欄位都進了剪貼簿，畫面提示「已複製，可以貼進 bug 回報」

Scenario: 複製失敗
  Given 瀏覽器不讓網頁寫剪貼簿
  When 我按「複製版本資訊」
  Then 提示「複製失敗，請長按上面的文字選取」，詳細資訊的文字可以長按選取

Scenario: 舊規則打的 APK
  Given 一個 versionCode 是 1 的 APK（build 1～3 都是 1）跑到這段程式
  When 我捲到最底部
  Then build 顯示「build 1～3」，不會誤標成「build 1」
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| APK 內建 | `src/domain/versionInfo.test.ts` | — | — |
| APK + OTA（含時間、說明） | 同上 | `src/ui/VersionBadge.test.tsx` | — |
| OTA 沒有說明 → update ID 前 8 碼 | 同上 | — | — |
| Expo Go | 同上 | — | — |
| 網頁版（dev、正式） | 同上 | `VersionBadge.test.tsx`（複製失敗那條） | — |
| 看完整資訊、收合 | — | `VersionBadge.test.tsx`、`src/screens/CalculateScreen.test.tsx` | — |
| 複製成功／失敗 | `versionInfo.test.ts`（複製的文字） | `VersionBadge.test.tsx` | — |
| 舊規則的 APK、拿不到版本 | `versionInfo.test.ts` | — | — |

真的 APK 與 OTA 只能手動驗：打 build 4 後裝起來看「build 4」，再 `npm run ota` 一次看 OTA 時間與說明。

## 決策紀錄

1. **build N 用 Android versionCode**：`eas.json` preview profile 開 `autoIncrement`（versionCode 存在 EAS，`appVersionSource: remote`），`npm run release` 直接拿 versionCode 當下載頁的 N。這樣手機與下載頁的名稱來自同一個數字，不會各算各的。
   - 沒選「打包時注入 `EAS_BUILD_ID`／自訂 `EXPO_PUBLIC_*`」：EAS 的內建變數不會進 JS bundle，`eas.json` 的 `env` 是寫死的、沒辦法每次 +1；寫進 `app.json` 的 `extra` 又會讓 fingerprint 在本機與雲端不同，`npm run ota` 永遠比對失敗。而且 build ID 只有 GitHub Release 說明裡對得到 N，手機上看不出是第幾版。
   - 一次性設定：EAS 上的 versionCode 目前是 1，下次打包前執行 `npx eas-cli build:version:set -p android` 設成 3。忘了的話 `npm run release` 會擋下來。
2. **加了 `expo-application`**：versionCode 只有原生端拿得到。`expo-constants` 的文件寫明 `versionCode` 已棄用、改用 `Application.nativeBuildVersion`，而 `Constants.expoConfig` 在 OTA 時是發佈當下的 `app.json`，不是安裝檔。
3. **也加了 `expo-clipboard`**：既然已經要重打 APK，多一個原生模組不增加成本，「複製版本資訊」按鈕能直接用。兩個模組都內建在 Expo Go。網頁版用瀏覽器剪貼簿，被擋時退回長按選取文字。
4. **OTA 說明寫進 bundle**：EAS Update 的 manifest 沒有 `--message` 的內容，所以 `scripts/ota-update.mjs` 發佈時把說明放進 `EXPO_PUBLIC_OTA_MESSAGE`，打包當下就換成字串。
5. **APK 的版本名稱以安裝檔為準**：`version` 不算進 fingerprint，改了 `app.json` 的 version 再發 OTA，`expoConfig.version` 會變但安裝檔沒變；畫面顯示安裝檔的值才對得上下載頁。
6. **不做功能開關**：純顯示資訊，不影響計算，直接給所有人看。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] 一次性設定 EAS versionCode = 3、打 build 4
- [ ] 測試同學手機驗收通過（APK、APK + OTA、Expo Go、網頁版）
