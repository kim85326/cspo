# Story 001：輸入一筆持股，看到盈虧

**身為** 買過股票的人
**我想要** 輸入代號、買入價、數量
**以便** 馬上知道這筆賺了還是虧了

## 驗收條件

現價以 [docs/glossary.md](../glossary.md) 的假價表為準。股票欄位的輸入方式見 [Story 002](002-stock-picker.md)。

```gherkin
Scenario: 賺錢
  Given 我輸入代號 2330、買入價 500、數量 1000
  And 2330 的現價是 520
  When 我按下「計算」
  Then 我看到「賺了」
  And 盈虧顯示 +20,000，顏色為紅色
  And 報酬率顯示 +4.00%

Scenario: 虧錢
  Given 我輸入代號 2330、買入價 540、數量 500
  And 2330 的現價是 520
  When 我按下「計算」
  Then 我看到「虧了」
  And 盈虧顯示 -10,000，顏色為綠色

Scenario: 不賺不賠
  Given 我輸入代號 2330、買入價 520、數量 1000
  When 我按下「計算」
  Then 盈虧顯示 0，顏色為灰色

Scenario: 代號不存在
  Given 我輸入代號 9999、買入價 100、數量 1
  When 我按下「計算」
  Then 我看到「找不到這檔股票」

Scenario: 欄位空白
  Given 三個欄位都空白
  When 我按下「計算」
  Then 每個欄位下方各出現一行錯誤提示（股票欄：請輸入代號或公司名稱，或從清單選擇）
  And 沒有顯示盈虧
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 賺錢 | `src/domain/pnl.test.ts` | `src/screens/CalculateScreen.test.tsx` | `e2e/001-profit.yaml` |
| 虧錢 | 同上 | 同上 | `e2e/001-loss.yaml` |
| 不賺不賠 | 同上 | — | — |
| 代號不存在 | — | 同上 | — |
| 欄位空白 | 同上 | 同上 | — |

## 狀態

- [ ] AC 經 PO 確認
- [ ] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過
