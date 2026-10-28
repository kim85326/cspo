# Story 025：資料模型預留多幣別

> **對應實作指南 T1b。** 原本因為 025 被年化報酬率與資產配置暫用而先用 029，2026-10-28 統一改回指南的 025（年化報酬率改為 [017](017-xirr-and-allocation.md)）。

**身為** 之後會同時記台股與美股的使用者
**我想要** 記帳本現在就能存每筆紀錄的幣別與匯率
**以便** 之後支援美股時不用搬移資料，計算引擎也不用重寫

規則來自 [product-spec.md](../product-spec.md) 3.8、第 4 章與 8.2 B（計算），實作指南 T1b。**只改型別與計算引擎，不做美股功能，畫面不變。** 名詞見 [glossary.md](../glossary.md)。

## 驗收條件

```gherkin
Scenario: 3.8 驗收：3.7 範例全部寫明台幣
  Given product-spec 3.7 的每一筆交易與股利都加上 currency = TWD、fxRate = 1
  When 計算 2330 的持股，參考價 620
  Then 已實現 48,170.25、未實現 99,709.75、總報酬 152,880、累計投入 1,101,567，報酬率 13.88%
  And 每個數字都跟沒有這兩個欄位時完全相等

Scenario: 舊資料沒有多幣別欄位
  Given 手機裡的記帳本是這個版本之前存的（沒有 market、currency、fxRate）
  When App 讀取記帳本
  Then 照原樣讀回，schemaVersion 仍是 1，不做搬移
  And 計算時一律視為台股、TWD、匯率 1，首頁、持股、配置、對決 A／B、年化報酬率、資產走勢的結果都不變

Scenario: 同一檔只能一種幣別
  Given 2330 已有一筆沒填幣別（視為 TWD）的買入
  When 新增一筆 2330、currency = USD 的交易
  Then 拒絕，訊息「同一檔證券的交易與股利只能使用一種幣別」

Scenario: 匯率要合理
  When 交易或股利的 fxRate 是 0 或負數
  Then 拒絕，訊息「匯率必須大於 0」
  When 台幣紀錄的 fxRate 不是 1
  Then 拒絕，訊息「台幣的匯率固定為 1」

Scenario: 外幣換算（為美股預留，8.2 AC 的計算部分）
  Given 以 30 元匯率買 10 股 AAPL @ 200 美元，手續費 0
  When 今天匯率 32、股價 200
  Then 持有成本 60,000 台幣、市值 64,000 台幣、未實現 +4,000
  When 外幣持股沒有今天的匯率
  Then 市值、未實現、總報酬都是「沒有值」（跟缺價格一樣），不用 1 硬算
```

## 資料格式與搬移

記帳本（`cspo.ledger.v1`）多了幾個**選填**欄位，`schemaVersion` 維持 1，**舊資料不需要搬移**（做法同 Story 012 的 `dismissedAutoDividends`、Story 024 的 `dcaRules`）。規格第 4 章明寫這些欄位「之後支援美股時不必搬移資料」，所以不需要照 Story 008 升版本。

| 型別 | 新欄位 | 沒填時 |
|---|---|---|
| `Transaction` | `market?: "TWSE" \| "TPEx" \| "US"`、`currency?: "TWD" \| "USD"`、`fxRate?: number` | 台股、TWD、1 |
| `Dividend` | 同上，加 `withholdingTax?: number`（預扣稅額，以 `currency` 計） | 台股、TWD、1、沒有預扣稅 |
| `HoldingSetting` | `market?` | 台股 |

- `shares`、`stockShares` 的說明改成「型別上可為小數」；台股的輸入驗證仍限制整數（`validateTransaction`、`validateDividend`、表單都沒改）。
- `parseLedger`：多幣別欄位的值認不得（例如 `currency: "JPY"`、`fxRate: -3`）時，只拿掉那個欄位，讓它回到預設值，不丟整筆紀錄。
- 編輯交易、股利時畫面是把表單結果疊在原本的紀錄上（`{ ...original, ...fields }`），所以多幣別欄位會保留。
- 注意：如果之後 OTA 退回這個版本之前的 bundle，舊版只是不認得這些欄位、照存照讀。Tech Day 期間沒有任何紀錄會寫入這些欄位，退版沒有影響。

## 計算規則

集中在 `src/domain/currency.ts`：

| 函式 | 做什麼 |
|---|---|
| `currencyOf(record)`、`fxRateOf(record)` | 沒填視為 TWD、1；台幣的匯率固定為 1 |
| `toTwd(amount, fxRate)` | 外幣金額 × 這筆自己的匯率。`fxRate = 1` 時原樣回傳，台幣金額不會多一次浮點乘法 |
| `symbolCurrency(symbol, transactions, dividends)` | 一檔證券的幣別（取它的第一筆紀錄） |
| `currentFxRate(currency, provided)` | 今天的匯率：台幣固定 1，外幣用呼叫端給的值，沒給回 null |
| `FxRateLookup`、`twdOnlyFxRate` | 「某天某幣別的匯率」查詢；預設只認得台幣 |

各計算確認過的結果：

| 計算 | 做法 |
|---|---|
| `replaySymbol`／`computePosition` | 買入：持有成本、累計投入加 `(成交金額 + 手續費) × fxRate`；賣出淨額 `(成交金額 − 手續費 − 證交稅) × fxRate`，賣出成本照平均成本比例（已經是台幣）；現金股利 `cashAmount × fxRate`。市值 = 參考價 × 股數 × 今天的匯率（新選項 `fxRate`）；預估賣出費用用原幣別算再換台幣。`Position` 的金額全部是台幣，`price` 是原幣別 |
| `summarize`、配置圖、對決 A | 只加總 `Position` 的金額，已經都是台幣，不用改 |
| XIRR（`positionCashFlows`） | 每筆現金流 × 自己的 `fxRate`；期末用 `Position` 的台幣市值 |
| 對決 B（`benchmarkFlows`、`actualValue`、`openingValue`） | 現金流與股利 × 自己的 `fxRate`；期初市值用期初那天的匯率（`BenchmarkDuelInput.fxRateOn`，選填） |
| 資產走勢（`buildAssetHistory`） | 投入來自 `replaySymbol`（已換台幣）；市值用當天的匯率（`AssetHistoryOptions.fxRateOn`，選填）；外幣那天查不到匯率就跳過那天，跟查不到收盤價一樣 |
| 股利自動帶入、定期定額 | 只會產生台股紀錄，不帶這些欄位（= TWD）。沒改 |
| 驗證 | 同一檔的交易與股利只能一種幣別；有填的 `fxRate` 要大於 0、台幣只能是 1；有填的 `withholdingTax` 不可小於 0 |

不同幣別加總：每一筆在進入加總之前就已經用自己的匯率換成台幣，所以加總就是台幣相加（規格 3.8「所有報酬以台幣計算」）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `src/domain/ledgerTypes.ts` | `Currency`、`LedgerMarket`；`Transaction`、`Dividend`、`HoldingSetting` 的選填欄位 |
| `src/domain/currency.ts` | 上表的輔助函式 |
| `src/domain/position.ts` | 重播與市值換算；`PositionOptions.fxRate` |
| `src/domain/xirr.ts`、`benchmark.ts`、`assetHistory.ts` | 現金流與市值換算；`fxRateOn` 選填參數 |
| `src/domain/ledgerValidation.ts` | 幣別一致、匯率檢查 |
| `src/data/asyncStorageLedgerStore.ts` | `parseLedger` 拿掉認不得的多幣別欄位 |

沒有動 `src/screens`、`src/ui`、`package.json`、`app.json`，可以走 OTA。

## 對應的自動化測試

| AC | 測試 |
|---|---|
| 3.7 加上 TWD／1 結果不變 | `src/domain/currency.test.ts`「3.8 驗收」 |
| 舊資料讀進來視為 TWD | `src/data/asyncStorageLedgerStore.test.ts`「多幣別欄位」；`currency.test.ts`「沒有混合幣別時，各個計算的結果跟修改前完全相同」（持股、summarize、配置、對決 A、XIRR、資產走勢、對決 B 逐欄位相等） |
| 認不得的值只拿掉欄位 | `asyncStorageLedgerStore.test.ts`「認不得的值只拿掉那個欄位」 |
| 同一檔一種幣別、匯率檢查 | `currency.test.ts`「驗證」 |
| 外幣換算 | `currency.test.ts`「外幣（為美股預留）」 |
| 原本 967 個測試 | 全部沒改、全部通過 |

## 決策紀錄

1. **不升 `schemaVersion`、不寫搬移。** 規格第 4 章與實作指南都寫明不要改版本；欄位全是選填，沒填 = 台股、TWD、1。
2. **`cashAmount` 是稅後實際入帳金額**（第 4 章的定義），報酬只算它；`withholdingTax` 只記錄、不從報酬再扣一次。
3. **台幣的匯率固定為 1**：計算時忽略台幣紀錄上的 `fxRate`，驗證時拒絕不是 1 的值。
4. **外幣沒有今天的匯率就當成沒有價格**（市值等回 null），不用 1 硬算，避免少算幾十倍。
5. **預估賣出費用用原幣別算再換台幣**，手續費、稅的規則仍是台股的；美股的費用規則（無證交稅、手續費預設 0）等 8.2 實作時依 `market` 決定。
6. **`Position` 沒有加幣別欄位**，避免牽動畫面與既有測試；美股畫面需要「美元金額」時再加。
7. **證券主檔的 `Market`（`types.ts`）不加 `US`**：那是選擇器與報價來源用的，加了會牽動畫面。記帳本另用 `LedgerMarket = Market | "US"`，美股功能做的時候再合併。

## 需要 PO 確認

1. **`cashAmount` 是稅後金額**：規格第 4 章寫「實際入帳金額」、8.2 B 寫「記錄稅前股利與預扣稅」。目前存稅後（cashAmount）+ 預扣稅（withholdingTax），稅前 = 兩者相加。這樣可以嗎？
2. **同一檔混用幣別直接拒絕**：例如 TSM（美股 ADR）和 2330 是不同代號所以沒問題；但若有人把同一檔的交易記成不同幣別，目前一律擋下。可以嗎？
3. **外幣沒有今天的匯率時**，市值顯示「—」（跟缺價格一樣）。之後是否改成「用最近一次的匯率並標示日期」？
4. **8.2 B 的「股價損益／匯率損益」拆分、拆股調整**需要平均買入匯率與原幣別成本，這次沒有算（只預留資料）。美股功能時再加，可以嗎？
5. **持股設定的主鍵**目前仍是 `symbol`，`market` 只是預留；規格說美股時改成 `market + symbol`，到時候要不要搬移再決定。

## 狀態

已完成，待 PO 確認上面幾點。
