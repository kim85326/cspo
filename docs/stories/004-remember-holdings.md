# Story 004：記住上次輸入的持股

**身為** 每天都想看同一筆持股賺還是虧的人
**我想要** 關掉 app 再打開時，上次輸入的股票、買入價、數量還在
**以便** 不用每次都重新輸入

## 驗收條件

現價以 [docs/glossary.md](../glossary.md) 的假價表為準。資料只存在這支手機本機，不上傳。

```gherkin
Scenario: 關掉重開，資料還在
  Given 我輸入代號 2330、買入價 500、數量 1000 並按下「計算」
  And 我看到盈虧 +20,000
  When 我完全關掉 app 再重新打開
  Then 股票欄位顯示「台積電（2330）」
  And 買入價顯示 500、數量顯示 1000
  And 我直接按下「計算」就看到 +20,000

Scenario: 輸入有錯不會存
  Given 我只選了 2330，買入價與數量空白
  When 我按下「計算」
  Then 欄位出現錯誤提示
  And 重開 app 後三個欄位都是空的

Scenario: 一鍵清除
  Given 重開 app 後欄位已帶入上次的持股
  When 我按下結果卡下方的「清除已儲存的資料」
  Then 三個欄位立刻清空，結果卡消失
  And 重開 app 後三個欄位都是空的，也看不到「清除已儲存的資料」

Scenario: 存的代號已不在清單裡
  Given 手機裡存的代號是 9999（清單裡沒有）
  When 我打開 app
  Then 股票欄位原樣顯示 9999，買入價與數量照帶回，app 不會當掉

Scenario: 手機裡的資料壞掉
  Given 手機裡存的資料不是合法的格式
  When 我打開 app
  Then app 正常開啟，三個欄位是空的
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 關掉重開，資料還在 | `src/data/asyncStorageHoldingStore.test.ts`、`src/hooks/usePersistedHoldings.test.ts` | `src/screens/CalculateScreen.test.tsx` | —（手動，見 test-plan #12） |
| 輸入有錯不會存 | — | 同上 | — |
| 一鍵清除 | 同上 | 同上 | —（手動，見 test-plan #13） |
| 存的代號已不在清單裡 | — | 同上 | — |
| 手機裡的資料壞掉 | `src/data/asyncStorageHoldingStore.test.ts` | — | — |

## 實作備忘

- 存的是使用者輸入的原始字串（`SavedHolding`），不存算好的盈虧；重開後仍走一次正常的驗證與計算。
- 存的是「陣列」，多檔股票比較版一次會有多筆；第一迭代畫面只帶回第一筆。
- 寫入時機是「計算」成功那一刻，不是每打一個字就寫。
- 儲存 key：`cspo.holdings.v1`。格式有不相容的改動時升 v2。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過
