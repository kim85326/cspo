# Story 019：歷史收盤價、還原股價與除權息資料來源

**身為** 之後要做對決 B、資產走勢、股利自動帶入、定期定額的工程師
**我想要** 一組拿得到「任一檔、任一段期間」日 K 與除權息的資料來源，失敗會自動換來源，抓過的不再抓
**以便** 那些畫面只管算與畫，不用各自處理 FinMind 額度、證交所擋 IP、分割與還原價

> 編號 019：016 已被 K 線圖與 Google 登入撞號，017（AI 洞察）、018（版本標示）也已使用。
> 這張只做 `src/data` 與 `src/domain`，**沒有畫面**。研究與試打結果見 [docs/research/history-and-dividend-sources.md](../research/history-and-dividend-sources.md)。

## 驗收條件

自動化測試一律用假來源或注入的假 `fetch`，不打真的網路（`src/data/index.ts` 在 Jest 裡自動切假來源）。

```gherkin
Scenario: 一檔一年的日 K 只打一個請求
  Given FinMind 正常
  When 要 2330 從 2025-10 到 2026-10 共 13 個月的日 K
  Then 只打 FinMind 一次（TaiwanStockPrice，start_date 2025-10-01、end_date 2026-10-31）
  And 上市、上櫃、ETF 都拿得到

Scenario: 抓過的月份不再抓
  Given 2330 的 2025-10 到 2026-09 已經抓過（存在手機裡）
  When app 重開後再要 2025-10 到 2026-10
  Then 只補抓 2026-10
  And 本月的資料 30 分鐘內不重抓，過完的月份永遠不重抓

Scenario: FinMind 拿不到時自動改用官方來源
  Given FinMind 超過每小時 300 次、週日維護、或斷線
  When 要 6488（上櫃）近 2 個月的日 K
  Then 改問櫃買中心，一個月一個請求
  And 上市股票改問證交所

Scenario: 都拿不到，但手機裡有舊資料
  Given FinMind 與官方都失敗
  And 要的月份之前都抓過
  Then 先用舊資料，不報錯
  But 有任何一個月從沒抓過，就丟 PriceLoadError（畫面之後顯示「載入失敗」）

Scenario: 除權息與分割
  When 要 2884 玉山金 2025 年的除權息
  Then 拿到 2025-07-22 現金 1.2 元、每千股配 10 股、發放日 2025-08-27
  When 要 0050 的分割
  Then 拿到 2025-06-18 一拆四（ratio 4）

Scenario: 金額待公告
  Given 00406A 已公告 2026-11-03 除息，但金額還沒公告（FinMind 給 0）
  Then cashPerShare 是 null，不是 0

Scenario: 還原收盤價
  Given 0050 2025-10-27 到 2026-10-27 的收盤價與期間內兩次除息
  Then 還原後一年報酬率 70.47%（與 Yahoo Finance adjclose 相同；不還原是 67.08%）
  And 2025-06-18 之前的價格除以 4，前後接得起來

Scenario: 交易日
  Given 2026-10-23（五）與 10-26（一）休市
  Then 10-24 的下一個交易日是 10-27
  And 10-27 的前一個交易日是 10-22
  And 晚於最後一筆資料的日期回 null（今天還沒收盤，定期定額先不產生）
```

## 對應的自動化測試

| 情境 | 單元測試 |
|---|---|
| 一檔一年只打一個請求 | `src/data/finmindSource.test.ts` |
| 抓過的月份不再抓、本月 30 分鐘 | `src/data/historyCache.test.ts` |
| FinMind 失敗改用官方 | `src/data/fallbackSource.test.ts`、`src/data/officialSources.test.ts` |
| 都拿不到但有舊資料 | `src/data/historyCache.test.ts` |
| 除權息與分割（FinMind） | `src/data/finmindParse.test.ts`、`src/data/finmindSource.test.ts` |
| 除權息（官方備援） | `src/data/twseExRightParse.test.ts`、`src/data/tpexExRightParse.test.ts`、`src/data/officialSources.test.ts` |
| 上櫃日 K（官方備援） | `src/data/tpexDayParse.test.ts` |
| 金額待公告 | `src/data/finmindParse.test.ts` |
| 還原收盤價 | `src/domain/adjustedPrice.test.ts`、`src/data/adjustedHistory.test.ts` |
| 交易日 | `src/domain/tradingDays.test.ts` |

`src/data/__fixtures__/` 裡的 `finmind*.json`、`tpexTradingStock6488.json`、`tpexExDailyQ.json`、`twseTwt49u*.json` 都是 2026-10-27 的真實回應（裁短）。

## 給之後的畫面用

```ts
import { candleSource, corporateActionSource } from "@/data";
import { loadAdjustedCloses } from "@/data/adjustedHistory";
import { tradingDayBefore, tradingDayOnOrAfter } from "@/domain/tradingDays";
import { monthsBetween } from "@/domain/candles";

// 資產走勢（P2-07）、定期定額成交價（P2-02）：未還原收盤價
const candles = await candleSource.getDailyCandles("0050", monthsBetween("2024-01-01", today));

// 股利自動帶入（P2-03）：to 給未來的日期，就拿得到已公告、還沒除息的
const actions = await corporateActionSource.getActions("2330", firstTradeDate, "2027-12-31");

// 對決 B（P2-05）：0050 的還原收盤價
const adjusted = await loadAdjustedCloses("0050", firstTradeDate, today, {
  candles: candleSource,
  actions: corporateActionSource,
});
```

## 實作備忘

- **沿用 Story 016 的 `CandleSource`**，沒有另做一套價格介面。FinMind 的 TaiwanStockPrice 本來就有開高低收，所以 `candleSource` 換成新的組合後，**K 線圖也跟著改用 FinMind，上櫃股票也有 K 線了**。
- 組合（`src/data/index.ts`）：

  ```
  candleSource          = 本機快取( 依序試[ FinMind, 官方(上市→證交所 STOCK_DAY / 上櫃→櫃買 tradingStock) ] )
  corporateActionSource = 本機快取( 依序試[ FinMind, 官方(證交所 TWT49U / 櫃買 exDailyQ) ] )
  ```

- 證交所與櫃買中心的「一個月一個請求」抽成 `monthlyCandleSource.ts`，`twseCandleSource` 與新的 `tpexCandleSource` 共用（行為與 Story 016 相同）。
- 官方來源要知道上市或上櫃：用 `marketSource` 的股票清單查；查不到就先問證交所、沒資料再問櫃買中心。
- 本機快取（`historyCache.ts`）：AsyncStorage key `cspo.candles.v1.<代號>`（依月份存）、`cspo.actions.v1.<代號>`（12 小時）。同一檔同時進來的請求排隊。JSON 壞掉當成沒快取。
- 還原價算法、交易日判斷都在 `src/domain`，是純函式。除權息參考價 =（前收 − 現金）÷（1 + 每千股配股 ÷ 1000），官方來源有給前收與參考價時直接用。
- 網頁版：FinMind 與證交所 `www.twse.com.tw/rwd/...` 有開 CORS，直接打；櫃買中心沒有，新增同源代理 `src/app/tpex-day+api.ts`、`src/app/tpex-ex+api.ts`。APK 不經過代理。
- 沒有放任何 key：FinMind 不帶 token。

## 已知限制與後續

- **官方備援沒有發放日、沒有分割、沒有預告**：FinMind 掛掉而且手機裡沒快取時，股利只會有除息日與金額；0050 這種跨分割的還原價會不對。FinMind 一恢復就會補齊（快取 12 小時後重抓）。
- **K 線圖的錯誤文字**：Story 016 的「查不到這檔股票的 K 線資料（目前只支援上市股票）」現在上櫃也查得到了，括號那句該拿掉。屬於畫面，這張沒動。
- **持股在分割日要跟著乘 ratio**：資產走勢重建市值時，股數與價格要在同一個基準。規格書還沒寫這條，需要 PO 補（建議由計算引擎自動產生一筆調整紀錄）。
- **授權**：FinMind 聲明「教育、非商業用途」；證交所／櫃買網站條款禁止未經同意的自動下載。Tech Day 沒問題，P2-08 收費前要處理（見研究文件）。
- 這張沒有畫面，所以沒有 Maestro 流程，也沒有手機手動驗收項目。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [x] 2026-10-27 對真實 FinMind、證交所、櫃買中心跑過一次（暫時的 live 測試，未提交）：3 個請求拿齊 2330、0050、6488 各 13 個月，重複要不再打網路；FinMind 關掉時改走官方也拿得到
