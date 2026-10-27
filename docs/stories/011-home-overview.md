# Story 011：首頁總覽

**身為** 用這個 app 記帳的測試同學
**我想要** 一打開 app 就看到整體、ETF、個股各賺了多少
**以便** 不用一檔一檔點，也知道自己到底是賺還是賠，ETF 和個股哪邊表現比較好

> 對應 product-spec **M-05**、實作指南 **T6**。名詞見 [glossary.md](../glossary.md)。
> 數字全部來自 T1 的計算引擎（Story 006）與 T3 的記帳本（Story 008）；首頁不自己算錢。

## 驗收條件

```gherkin
Scenario: 沒有任何交易
  Given 記帳本裡沒有任何交易與股利
  When 我打開 app
  Then 首頁顯示「還沒有任何交易」與「新增第一筆交易」按鈕
  And 不會出現一排 0
  When 我按「新增第一筆交易」
  Then 進到新增交易畫面（/transaction/new，Story 009）

Scenario: 整體數字（規格 3.7 範例）
  Given 記帳本是規格 3.7 的 2330 範例，現價 620
  When 我打開 app
  Then 「整體」顯示「賺了」、總報酬 +152,880、報酬率 +13.88%
  And 累計投入 1,101,567、目前市值 930,000、已實現 +48,170、未實現 +99,710、已領股利 5,000

Scenario: 核心與衛星並排
  Given 我有 2330（個股）和 0050（ETF）
  When 我打開 app
  Then 「核心（ETF）」和「衛星（個股）」並排顯示，各自有總報酬、報酬率與五個金額
  And 兩邊的各項金額加起來等於「整體」
  And 某一邊沒有紀錄時顯示「還沒有 ETF 紀錄」或「還沒有個股紀錄」

Scenario: 改核心／衛星後立刻更新
  Given 2330 原本在衛星
  When 我把 2330 改成核心（在單一持股頁，Story 010）
  Then 回到首頁，2330 的數字已經從衛星移到核心，整體不變

Scenario: 顯示價格日期
  When 現價載入完成
  Then 首頁上方顯示「價格：2026/10/22 收盤價」
  And 各檔的收盤日期不一樣時，顯示最舊的那一天

Scenario: 有一檔拿不到現價
  Given 斷網或證交所沒回應，2330 拿不到現價
  Then 首頁提示「有 1 檔拿不到現價，市值與總報酬先不計算」，可以按「重新載入」或下拉重新整理
  And 整體的總報酬、報酬率、目前市值、未實現顯示 —，不顯示少算的數字
  And 已實現、已領股利、累計投入照常顯示；價格齊全的那一組照常計算

Scenario: 首頁的持股與入口
  Then 首頁列出市值最大的 5 檔持股，每檔有核心／衛星標籤、股數、市值、總報酬與報酬率
  When 我點某一檔
  Then 進到那一檔的單一持股頁（/holdings/2330，Story 010）
  When 我點「看全部持股」
  Then 進到持股列表（/holdings，Story 010）
  When 我點「新增交易」
  Then 進到新增交易畫面

Scenario: 舊的試算畫面還找得到
  When 我點首頁底部的「快速試算」
  Then 進到原本的試算畫面（/calculate），可以照舊輸入代號、買入價、數量算盈虧、多檔比較、看 K 線、AI 解讀
  And 在快速試算按「計算」或「清除已儲存的資料」，不會改到記帳本

Scenario: 舊版使用者升級
  Given 舊版 App 存了 2317 和 2330
  When 我升級後第一次開 app
  Then 首頁總覽就看得到這兩檔
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 沒有任何交易 | `src/domain/overview.test.ts`（空記帳本） | `src/screens/HomeScreen.test.tsx` | `e2e/011-empty-home.yaml` |
| 整體數字（3.7 範例） | `src/domain/overview.test.ts` | `src/screens/HomeScreen.test.tsx` | — |
| 核心與衛星並排、加總等於整體 | `src/domain/overview.test.ts` | `src/screens/HomeScreen.test.tsx` | — |
| 改核心／衛星後立刻更新 | `src/domain/overview.test.ts` | `src/screens/HomeScreen.test.tsx`（直接呼叫 `setBucket`；切換畫面在 Story 010） | — |
| 顯示價格日期 | `src/domain/overview.test.ts`（`oldestPriceDate`） | `src/screens/HomeScreen.test.tsx` | — |
| 有一檔拿不到現價 | `src/domain/overview.test.ts` | `src/screens/HomeScreen.test.tsx` | — |
| 首頁的持股與入口 | `src/domain/overview.test.ts`（排序） | `src/screens/HomeScreen.test.tsx` | — |
| 舊的試算畫面還找得到 | `src/data/quickCalcHoldingStore.test.ts` | `src/screens/CalculateScreen.test.tsx`（原有測試全部沿用） | `e2e/001-*.yaml`、`002-*.yaml`、`003-*.yaml`（先按「快速試算」） |
| 舊版使用者升級 | — | `src/screens/HomeScreen.migration.test.tsx`、`CalculateScreen.migration.test.tsx` | — |

有交易時的 Maestro 流程要等 Story 009 的交易畫面合併後才寫得出來（要先用畫面新增交易），合併時補上。

## 決策紀錄

1. **快速試算不再寫進記帳本**（最重要）。Story 008 為了讓舊首頁照常運作，加了過渡轉接 `ledgerHoldingStore`：按「計算」會用畫面上的持股**整份取代**記帳本的交易，「清除已儲存的資料」會清掉所有交易與股利。Story 009 能記賣出與股利之後，這會在使用者打開快速試算時把他記的賣出、股利蓋掉（Story 008 決策 14 已預告）。所以：
   - 刪掉 `ledgerHoldingStore`，快速試算改存自己的 key `cspo.quickCalc.v1`（`src/data/quickCalcHoldingStore.ts`），**只讀記帳本、不寫記帳本**。
   - 第一次打開快速試算（還沒存過）用記帳本的買入交易當初始值，舊版使用者升級後照樣看到原本的持股；存過一次（包括清除）就只用自己的。
   - 不用舊的 `cspo.holdings.v1`：那是 Story 008 搬移的判斷依據，寫回去會讓搬移邏輯混亂。
   - `CalculateScreen` 的程式與測試都沒改（只改標題與註解），原本的測試全部照過。
2. **路由照三條線講好的，不照實作指南的分頁版**。實作指南寫的是 `(tabs)` 分頁導覽 + `OverviewScreen`；這次 T4、T5、T6 同時開發，先約定首頁 `src/app/index.tsx` → `src/screens/HomeScreen.tsx`、交易 `/transaction/new`、`/transaction/[id]`、持股 `/holdings`、`/holdings/[symbol]`。設定維持首頁右上角的入口。改分頁導覽留給之後（見「待 PO 確認」）。
3. **`CalculateScreen` 沒有刪，搬到 `/calculate`**，首頁底部放「快速試算」入口。實作指南寫的是刪掉 `CalculateScreen`、`ComparisonCard`、`compare.ts`、`usePersistedHoldings`；但 PO 規格寫「PO 會在發布前通知測試同學舊功能下架」，K 線、AI 解讀也只掛在這個畫面，所以先保留，要不要拿掉由 PO 決定。拿掉時連同 `quickCalcHoldingStore`、`pnl.ts` 的 `calculatePnl`、`compare.ts`、`replaceSavedHoldings` 一起刪。
4. **缺價格時市值、未實現也顯示 —**。`summarize` 的市值與未實現不含缺價格的那幾檔；直接顯示會像是少了一大塊錢。已實現、股利、累計投入跟價格無關，照常顯示。價格齊全的那一組（例如只有個股缺價）照常計算。
5. **價格日期取最舊的**：各檔收盤日期可能不同（例如上櫃沒更新到），顯示最舊的一天才不會讓人以為全部都是最新價。行情沒有日期時（假價）顯示「價格更新於 HH:MM」。
6. **首頁只列市值前 5 檔**，其他到「看全部持股」。沒有價格的排最後。持股列先在 `HomeScreen.tsx` 裡做一個簡單版（`HomeHoldingRow`），Story 010 的可重用持股列合併後換掉。
7. **證券名稱**來自行情（`Quote.name`）；拿不到現價時只顯示代號。
8. **年化報酬率與配置圓餅圖**：計算已在 Story 025 完成，但 PO 的順序表排在之後的任務，這次首頁不畫。版面上留了位置：年化報酬率加在三張卡裡，配置圖放在核心／衛星卡下方（`HomeScreen.tsx` 有註解）。
9. **不加功能開關**：新首頁直接取代舊首頁。PO 會在發布前通知測試同學。
10. **沒有新增原生套件**，可以用 OTA 送出。

## 待 PO 確認

- [ ] 快速試算（舊首頁）要保留、藏起來，還是在這版就拿掉？
- [ ] 快速試算第一次打開帶入記帳本的買入交易（決策 1），可以嗎？
- [ ] 這版先不做分頁導覽（決策 2），設定維持右上角，可以嗎？
- [ ] 缺價格時市值、未實現顯示 —（決策 4），可以嗎？
- [ ] 首頁只列 5 檔（決策 6），可以嗎？

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] T4、T5 合併後補上連過去的路由測試與有交易的 Maestro 流程
- [ ] 測試同學手機驗收通過
