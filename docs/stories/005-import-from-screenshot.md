# Story 005：從券商 app 的截圖匯入持股

**身為** 在券商 app 裡已經有好幾檔持股的人
**我想要** 把券商 app 的持股畫面截圖丟進來，自動填好每一檔的股票、買入價、數量
**以便** 不用一檔一檔手打

## 驗收條件

股票清單與現價以 [docs/glossary.md](../glossary.md) 的假價表為準。辨識由 AI 模型完成，**結果一定要人工核對**；辨識信心低的欄位會標「請確認」。
手機 app 本身不接 AI 服務：截圖送到工程同學電腦上的本機後端 `backend/`（和 AI 解讀同一台，`POST /recognize`），再由後端呼叫 AI。API key 只放在那台電腦的 `backend/.env`，APK 與 repo 裡都沒有。APK、Expo Go、網頁版都走同一條路（2026-10-27 起；之前走 dev server 的 API route，APK 一定失敗）。

```gherkin
Scenario: 匯入兩檔
  Given 我按下「從截圖匯入」並選「從相簿選」
  And 我選了一張有「台積電 成本 500 1,000 股」與「鴻海 成本 200 1 張」的持股截圖
  When 辨識完成
  Then 第 1 檔顯示「台積電（2330）」、買入價 500、數量 1000
  And 第 2 檔顯示「鴻海（2317）」、買入價 200、數量 1000（1 張 = 1000 股）
  And 我按下「計算並比較」就看到比較結果

Scenario: 拍照匯入
  Given 我按下「從截圖匯入」並選「拍照」
  When 我拍下券商 app 的持股畫面
  Then 流程與「匯入兩檔」相同

Scenario: 辨識中
  Given 我選好了截圖
  When 辨識還沒完成
  Then 畫面顯示「辨識中…」，「從截圖匯入」按鈕不能再按

Scenario: 已填的內容不會被蓋掉
  Given 第 1 檔我已經填了聯發科 1000 100
  When 我匯入兩檔的截圖
  Then 第 1 檔還是聯發科，台積電與鴻海接在第 2、第 3 檔

Scenario: 對不到的股票
  Given 截圖裡有一檔「不存在公司」，清單裡沒有
  When 辨識完成
  Then 那一檔的股票欄位顯示「不存在公司」，標籤旁有「請確認」
  And 我可以自己在清單裡選正確的股票

Scenario: 看不清楚的數字
  Given 截圖裡台積電的成本價被遮住
  When 辨識完成
  Then 台積電的買入價標「請確認」
  And 我改了買入價之後「請確認」消失

Scenario: 截圖超過 5 檔
  Given 截圖裡有 6 檔持股
  When 辨識完成
  Then 只匯入前 5 檔，並提示「截圖有 6 檔，只匯入前 5 檔」

Scenario: 同一檔出現兩次
  Given 截圖裡台積電出現兩次（500 × 1000 股、600 × 1000 股）
  When 辨識完成
  Then 合併成一檔：數量 2000、買入價 550（加權平均），並有提示說明已合併

Scenario: 辨識失敗
  Given 手機連不到後端（電腦沒開 npm run backend:tunnel），或後端沒有設定 API key
  When 我匯入截圖
  Then 顯示錯誤原因與「重試」按鈕
  And 我原本填的內容都還在

Scenario: 辨識不到任何持股
  Given 我選了一張不是持股畫面的圖
  When 辨識完成
  Then 提示「截圖裡辨識不到任何持股…」，欄位不變

Scenario: 相簿給的格式標示錯誤
  Given 我選了一張 PNG 截圖（或 iPhone 的 HEIC 照片），手機壓縮後上傳的其實是 JPEG
  When 辨識完成
  Then 照常辨識成功，不會出現「辨識服務錯誤（400）」

Scenario: 圖片太大或不是圖片
  Given 我選的圖片超過 5 MB，或不是 JPEG／PNG／WebP 圖片
  When 我匯入
  Then 顯示「圖片太大…」或「不支援這種圖片格式…」，原本填的內容都還在

Scenario: 沒有相簿或相機權限
  Given 我拒絕了相簿（或相機）權限
  When 我選「從相簿選」（或「拍照」）
  Then 提示去手機「設定」開啟權限，不會當掉
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 匯入兩檔（含張→股換算） | `src/domain/holdingExtract.test.ts` | `src/screens/CalculateScreen.test.tsx` | —（需要真實截圖與 API key） |
| 拍照匯入 | — | 同上 | — |
| 辨識中 | — | 同上 | — |
| 已填的內容不會被蓋掉 | `holdingExtract.test.ts`（applyExtraction） | 同上 | — |
| 對不到的股票 | 同上 | 同上 | — |
| 看不清楚的數字（請確認） | 同上 | 同上 | — |
| 超過 5 檔 | 同上 | 同上 | — |
| 同一檔出現兩次 | 同上 | — | — |
| 辨識失敗 | `src/data/backendHoldingRecognizer.test.ts`、`backend/src/server.test.ts`、`backend/src/claudeRecognize.test.ts` | 同上 | — |
| 格式標示錯誤（看檔案內容） | `src/domain/imageMimeType.test.ts`、`backend/src/recognizeRequest.test.ts` | — | — |
| 圖片太大或不是圖片 | `backend/src/recognizeRequest.test.ts`、`backend/src/server.test.ts` | — | — |
| 辨識不到任何持股 | — | 同上 | — |
| 沒有權限 | — | 同上 | — |
| 代號全形、帶逗號、只有名稱 | `holdingExtract.test.ts` | — | — |

自動化測試用 `fakeHoldingRecognizer`（固定回兩檔）與假的相簿；後端測試（`npm run backend:test`）用假的 Claude。真的辨識只在手動驗收時跑，見 [docs/test-plan.md](../test-plan.md) 的 S1～S10。

## 功能開關

由 `src/config/features.ts` 的 `screenshotImport` 控制，**預設關閉**，可以遠端切換（Story 033），不用重打 APK、不用發 OTA。

**Tech Day 現場打開**（細節見 [architecture.md](../architecture.md) 第 7 節）：

1. 一次性：EAS preview 環境要有 `EXPO_PUBLIC_INSIGHT_API_URL`（ngrok 固定網址）與 `EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN`（和 `backend/.env` 相同），然後 `npm run ota` 發一次，build 5 的 APK 才知道後端在哪。只設這兩個，AI 解讀的開關照樣關著。
2. 現場在工程同學的電腦執行 `npm run backend:tunnel`。
3. 執行 `node scripts/feature-flags.mjs set screenshotImport on`。最多等 5 分鐘，請同學把 app 切到背景再切回來，就看得到「從截圖匯入」。
4. 結束時 `node scripts/feature-flags.mjs set screenshotImport off`，再 Ctrl+C 關掉 tunnel。

工程同學要在自己的 dev server 打開：`.env.local` 加 `EXPO_PUBLIC_FEATURE_SCREENSHOT_IMPORT=1`（同電腦網頁版、同 Wi-Fi 的 Expo Go 只要另外開 `npm run backend`；不開後端想看畫面加 `EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1`），重開 `npx expo start` 後在手機上 reload。

**Story 015 起**：核對完成後改成建立買入交易，入口搬到首頁空狀態與新增交易頁的 `/import`，快速試算不再有「從截圖匯入」。上面「按下『計算並比較』」「已填的內容不會被蓋掉」「超過 5 檔」等情境改以 [Story 015](015-import-to-transactions.md) 為準；選圖、辨識、核對的其他情境不變。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過
