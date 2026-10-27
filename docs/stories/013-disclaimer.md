# Story 013：免責聲明

**身為** 第一次打開 app 的使用者
**我想要** 先知道這個 app 算出來的數字只是參考
**以便** 不會把結果當成投資建議，對帳以券商資料為準

> 對應 product-spec **M-10**、實作指南 **T8**（只做 M-10，M-09 手續費設定這次不做）。
> 編號 013：實作指南把 006–015 保留給 T1–T10，T8 就是 013。

## 驗收條件

免責聲明全文（product-spec M-10 原文）：「本 App 僅供記帳與計算參考，不構成任何投資建議。計算結果可能與券商對帳單有些微差異，請以券商資料為準。」

```gherkin
Scenario: 第一次開啟要先同意
  Given 我第一次打開 app（手機裡沒有同意紀錄）
  Then 畫面上跳出「使用前請先閱讀」與免責聲明全文
  When 我按下「我已了解並同意」
  Then 免責聲明關掉，我看到首頁

Scenario: 一定要按同意才會關
  Given 免責聲明正在顯示
  When 我點背景或按 Android 返回鍵
  Then 免責聲明仍然顯示

Scenario: 同意過就不再出現
  Given 我已經按過「我已了解並同意」
  When 我完全關掉 app 再重新打開
  Then 不會再跳出免責聲明

Scenario: 設定頁隨時看得到
  When 我點首頁右上角的「設定」
  Then 設定頁的「免責聲明」區塊顯示全文

Scenario: 手機裡的紀錄壞掉
  Given 手機裡的同意紀錄不是合法的值
  When 我打開 app
  Then 當作沒同意過，再跳一次免責聲明，app 不會當掉
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 第一次開啟要先同意 | — | `src/ui/DisclaimerGate.test.tsx` | `e2e/013-disclaimer.yaml`（需先清掉專案資料） |
| 一定要按同意才會關 | — | — | —（手動，見 test-plan D2） |
| 同意過就不再出現 | — | `src/ui/DisclaimerGate.test.tsx` | `e2e/013-disclaimer.yaml` |
| 設定頁隨時看得到 | — | `src/screens/SettingsScreen.test.tsx` | `e2e/013-disclaimer.yaml` |
| 手機裡的紀錄壞掉 | — | `src/ui/DisclaimerGate.test.tsx` | — |

## 決策紀錄

- **出現時機**：首次開啟用 Modal 蓋在所有畫面上（放在根 layout 的 `DisclaimerGate`），一定要按「我已了解並同意」。點背景、Android 返回鍵都不會關。規格只寫「首次開啟顯示」，要求明確同意是最不會有爭議的做法。
- **讀完紀錄前不顯示**：避免已同意的人每次開 app 都閃一下。
- **儲存**：AsyncStorage key `cspo.disclaimerAccepted.v1`，值 `"1"`。不放在 ledger 裡，因為 ledger（T1）還沒接上畫面；之後備份還原（M-08）也不需要帶這個值。讀失敗或值不對當作沒同意。
- **設定頁入口**：首頁還沒改成分頁導覽（T3 之後暫不做），所以先在首頁 header 右上角放「設定」，進 `/settings`。之後改成分頁時，換成「設定」分頁即可，`SettingsScreen` 不用改。
- **不加功能開關**：免責聲明是 MVP 必要項目、做完就該給測試同學看到，所以直接上線（含 APK 的 OTA）。這點請 PO 確認。
- 首頁底部原本那行「資料僅供參考，不構成投資建議。」保留，沒有動 `CalculateScreen`。
- 文字只有一份：`src/ui/DisclaimerGate.tsx` 的 `DISCLAIMER_TEXT`，首次開啟與設定頁共用。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過
