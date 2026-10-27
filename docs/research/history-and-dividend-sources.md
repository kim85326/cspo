# 研究：歷史收盤價與除權息資料從哪裡拿

> 對象：Phase 2 的 P2-02 定期定額、P2-03 股利自動帶入、P2-04 XIRR、P2-05 對決 B「如果改買 0050」、P2-07 資產走勢（[product-spec.md](../product-spec.md) 第 7 節）。
> 日期：2026-10-27（台北時間下午實打）。基底 `iteration-1` c393c57，Expo SDK 58。
> 試打腳本：[`scripts/probe-history-sources.mjs`](../../scripts/probe-history-sources.mjs)，`node scripts/probe-history-sources.mjs` 可重跑（約 2 分鐘、不需要任何 key）。本文的數字都來自這支腳本的輸出。
> 前提：發給同學的是 Android APK + OTA 更新；**APK 裡不能放任何 API key**；沒有 dev server 可以當 proxy。

## 結論先講

| 需要的資料 | 建議來源（主） | 備援 | 一句話原因 |
|---|---|---|---|
| 個股／ETF 歷史收盤價 | **FinMind `TaiwanStockPrice`** | 證交所 `STOCK_DAY`、櫃買 `tradingStock`（一次一個月） | 一檔一個請求就拿到全部年份，上市上櫃 ETF 都有，免 key、有 CORS |
| 除權息事件（除息日、現金、配股、**發放日**） | **FinMind `TaiwanStockDividend`** | 證交所 `TWT49U`、櫃買 `exDailyQ`（全市場、日期區間） | 只有 FinMind 有發放日（P2-03 從 `estimated` 轉 `received` 要用） |
| 還原收盤價（P2-05 B 的 0050／006208） | **自己算**：收盤價 × 除權息參考價／前收，再乘分割比例 | — | FinMind 的還原股價要付費；自算結果實測跟 Yahoo 的還原價一年報酬率到小數第 2 位完全相同 |
| 分割（0050 在 2025-06-18 一拆四） | FinMind `TaiwanStockSplitPrice` | 程式內寫死已知分割 | 官方除權息表不含分割，沒找到官方 API |
| 交易日曆（扣款日遇假日順延） | **不用另外抓**：基準標的（0050）有收盤價的日子就是交易日 | 證交所 `holidaySchedule` | 少一個資料源；「今天還沒收盤價」跟 spec「先不產生、下次補」的規則剛好一致 |

**APK 能不能直接打：全部都能。** CORS 只擋瀏覽器（網頁版），React Native 的 `fetch` 不受影響。網頁版要注意：FinMind、證交所 `www.twse.com.tw/rwd/...`、公開資訊觀測站新版 API 有 `Access-Control-Allow-Origin: *`；證交所 OpenAPI、櫃買中心（OpenAPI 跟 www 都是）、Yahoo **沒有**，網頁版要走同源代理（跟現在 `src/app/twse+api.ts` 一樣）。

**兩個要 PO 知道的風險：**
1. **授權。** FinMind README 寫明「所有內容均用於教育、非商業用途」；證交所、櫃買網站的使用條款禁止未經同意用自動程式下載（OpenAPI 那份走政府資料開放授權，可以商用，但**只有最新一天**，沒有歷史）。Tech Day 給同學用沒問題；**P2-08 開始收費之前**，要嘛跟 FinMind 談商用（贊助方案）、要嘛跟證交所申請資訊傳輸、要嘛自建後端每天收 OpenAPI 存成歷史。
2. **同一個 IP 的額度。** FinMind 不帶 token 是每個 IP 每小時 300 次。每支手機各自算沒問題，但 Tech Day 現場大家連同一個 Wi-Fi（共用對外 IP）時會一起分這 300 次。所以一定要做本機快取與增量更新（見最後一節），而且 FinMind 失敗時要自動退回官方來源。

---

## 1. 各來源一覽

| 來源 | 歷史收盤價 | 除權息 | 涵蓋 | 往回幾年 | Key | 頻率限制 | CORS | 授權 |
|---|---|---|---|---|---|---|---|---|
| 證交所 OpenAPI `openapi.twse.com.tw` | ✗（只有最新一天） | 預告表（未來） | 上市＋上市 ETF | — | 免 | 未公布 | **無** | 政府資料開放授權第 1 版（可商用、要標示來源） |
| 證交所網站 `www.twse.com.tw/rwd/...` | `STOCK_DAY` 一檔一個月 | `TWT49U` 全市場、日期區間 | 上市＋上市 ETF | 2010-01-04 起 | 免 | 未公布；太快會被暫時擋 IP | `*` | 網站使用條款：禁止未經同意以自動程式下載 |
| 櫃買中心 OpenAPI `tpex.org.tw/openapi` | ✗（只有最新一天） | 預告表、當日計算結果 | 上櫃＋上櫃 ETF | — | 免 | 未公布 | **無** | 政府資料開放授權 |
| 櫃買中心網站 `tpex.org.tw/www/zh-tw/...` | `tradingStock` 一檔一個月 | `exDailyQ` 全市場、日期區間 | 上櫃＋上櫃 ETF | 至少 2006 起（95/12 有，83/01 無） | 免 | 未公布 | **無** | 網站使用條款同證交所 |
| 公開資訊觀測站 `mops.twse.com.tw/mops/api` | ✗ | 股利**決議**（沒有除息日） | 上市上櫃公司；**不含 ETF** | 依查詢年 | 免 | 未公布 | `*` | 網站使用條款 |
| **FinMind** `api.finmindtrade.com/api/v4` | `TaiwanStockPrice` 一檔一次給全部 | `TaiwanStockDividend`（含發放日）、`TaiwanStockDividendResult`、`TaiwanStockSplitPrice` | 上市＋上櫃＋ETF | 2330 從 1994-09-13 起 | 免（token 選用） | 300 次/小時/IP；有 token 600 | `*` | 教育、非商業用途；週日 00:00–07:00 維護 |
| Yahoo Finance chart API | 有，含還原價 | 有（只有金額，無發放日） | `.TW`／`.TWO` | 長 | 免 | 未公布 | **無** | 非公開 API，條款不允許程式取用；**只拿來驗算** |

### 1.1 證交所（上市）

**`STOCK_DAY` 個股日成交資訊**（網站）

```
GET https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20251001&stockNo=2330&response=json
```

- 一次回一檔一個月；`date` 給該月任一天。欄位：`日期`（民國 `114/10/01`）、成交股數、成交金額、開、高、低、**收盤價**（第 7 欄，字串含千分位）、漲跌、筆數、註記。
- 最早 2010-01-04：查 2009/12 回 `{"stat":"查詢日期小於99年1月4日，請重新查詢!"}`。
- 一年 = 13 個請求。腳本每次間隔 2.5 秒、連打 26 次沒被擋；官方沒公布上限，社群經驗是太快會被暫時封 IP。
- 回應有 `access-control-allow-origin: *`。

**`TWT49U` 除權除息計算結果表**（網站）

```
GET https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=20251027&endDate=20261027&response=json
```

- **全市場、日期區間一次拿**：一年 1,496 筆、259 KB、92 ms。欄位：資料日期（`114年12月11日`）、代號、名稱、**除權息前收盤價**、**除權息參考價**、權值+息值、權/息、…
- 前收和參考價直接就是還原因子，不用另外算。
- 現金與配股混在「權值+息值」裡；要拆開得再打 `TWT49UDetail?STK_NO=2330&T1=20251211`（一事件一請求）。
- **沒有發放日**。
- 實測：第一次打 22 個月的區間 timeout 40 秒，改成一年區間正常（可能是偶發，實作時以一年為單位切）。

**`TWT48U_ALL` 除權除息預告表**（OpenAPI）：無參數、只有目前預告的 22 筆。ETF 常寫「待公告」（`CashDividend` 空字串）。可用來顯示「即將除息」，但 FinMind 也有（見 1.4）。

**`holidaySchedule`**（OpenAPI）：今年 27 筆休市日。只有今年，往年要打網站版。

### 1.2 櫃買中心（上櫃）

**`tradingStock` 個股日成交資訊**（網站）

```
GET https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=6488&date=2025/10/01&response=json
```

- 一次一檔一個月，回 `{ tables: [{ data: [["114/10/01", 成交仟股, 成交仟元, 開, 高, 低, 收, 漲跌, 筆數], …] }] }`。GET、POST 都可以。
- 舊網址 `web/stock/aftertrading/daily_trading_info/st43_result.php` 已經 302 轉走，不要用。
- **沒有 CORS header**。

**`exDailyQ` 除權除息計算結果**（網站）

```
GET https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=2025/10/27&endDate=2026/10/27&response=json
```

- 全市場一年 1,340 筆、1.3 秒。比證交所好用：**現金股利**、**每仟股無償配股**分開給，還有前收、參考價。沒有發放日。

OpenAPI 的 `tpex_exright_daily`（當天）、`tpex_exright_prepost`（預告）都沒有參數，只有最新一份，不能查歷史。

### 1.3 公開資訊觀測站

- 舊版 `mops/web/ajax_t05st09_2` 表單 POST：回「因為安全性考量，您所執行的頁面無法呈現」，**已不能用程式查**。
- 新版是 SPA，背後有 JSON API（有 CORS `*`）：

  ```
  POST https://mops.twse.com.tw/mops/api/t05st09_2
  Content-Type: application/json
  {"companyId":"2330","dataType":"2","firstYear":"113","lastYear":"115","queryType":"1"}
  ```

  2330 回 11 筆、6488 回 5 筆，內容是**董事會／股東會決議**的每股股利，**沒有除息日、沒有發放日**。0050 回 `公司代號格式錯誤`：**ETF 不在這裡**（ETF 收益分配在投信公告裡）。
- 這是網站內部 API，沒有文件、參數可能隨改版變。
- 結論：**不需要接**。它是 FinMind 股利資料的上游之一，但我們要的除息日與發放日它這支沒有。

### 1.4 FinMind

```
GET https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=2330&start_date=2025-10-27&end_date=2026-10-27
```

| dataset | 免費可用 | 用途 | 實測 |
|---|---|---|---|
| `TaiwanStockPrice` | ✅ | 收盤價（未還原），`close` 是 number | 2330、0050、6488、00679B 各 242 筆，跟官方逐日比對 **0 天不同、0 天缺** |
| `TaiwanStockDividend` | ✅ | 除息日、現金、配股、**發放日** | 見下表；**已公告除息日但金額未定時 `CashEarningsDistribution` 是 0**（例如 00406A 2026-11-03），不能當成「配 0 元」 |
| `TaiwanStockDividendResult` | ✅ | 除權息當天的前收 `before_price`／參考價 `after_price` | 跟證交所 `TWT49U` 一致 |
| `TaiwanStockSplitPrice` | ✅ | 分割 | 0050：`2025-06-18 分割 188.65→47.16` |
| `TaiwanStockTradingDate` | ✅ | 交易日 | 含未來日期 |
| `TaiwanStockPriceAdj` | ❌ | 還原股價 | HTTP 400「Your level is free」，要贊助會員 |

- 不帶 token：300 次/小時/IP；註冊並驗證信箱拿 token：600 次/小時（[FinMind README](https://github.com/FinMind/FinMind)）。**token 不能放 APK**，所以用不帶 token 的額度。
- 每週日 00:00–07:00 維護，不提供服務 → 一定要有備援或快取。
- 回應有 `access-control-allow-origin: *`，網頁版也能直接打。
- 當天收盤價下午 4 點已經有（實測 2026-10-27 16:10 拿得到當天）。

### 1.5 Yahoo Finance（只拿來驗算）

`https://query1.finance.yahoo.com/v8/finance/chart/0050.TW?range=1y&interval=1d&events=div|split` 有收盤、還原收盤、配息，上櫃用 `.TWO`。沒有 CORS、沒有文件、條款不允許程式取用，**不建議放進 app**。腳本只用它驗證「自己算的還原價」對不對。

---

## 2. 實際打一次的結果（2025-10-27 ～ 2026-10-27）

### 2.1 收盤價

| 代號 | 市場 | 筆數 | 2025-10-27 收盤 | 2026-10-27 收盤 | 官方 vs FinMind | 官方 vs Yahoo |
|---|---|---|---|---|---|---|
| 2330 台積電 | 上市 | 242 | 1,480 | 2,400 | 242 天全同 | 242 天全同 |
| 0050 元大台灣50 | 上市 ETF | 242 | 63.8 | 106.6 | 242 天全同 | 242 天全同 |
| 6488 環球晶 | 上櫃 | 242 | 539 | 814 | 242 天全同 | — |
| 00679B 元大美債20年 | 上櫃 ETF | 242 | 27.59 | 26.37 | 242 天全同 | — |

### 2.2 近年配息

| 代號 | 除息日 | 每股現金 | 發放日（FinMind） | 除息前收盤 → 參考價（官方） |
|---|---|---|---|---|
| 2330 | 2025-12-11 | 5.000011 | 2026-01-08 | 1,505 → 1,499.99 |
| 2330 | 2026-03-17 | 6.000035 | 2026-04-09 | 1,845 → 1,838.99 |
| 2330 | 2026-06-11 | 6.000035 | 2026-07-09 | 2,255 → 2,248.99 |
| 2330 | 2026-09-16 | 7.000001 | 2026-10-08 | 2,385 → 2,377.99 |
| 0050 | 2025-01-17 | 2.7（分割前） | 2025-02-20 | — |
| 0050 | 2025-07-21 | 0.36 | 2025-08-08 | — |
| 0050 | 2026-01-22 | 1.0 | 2026-02-11 | 71.85 → 70.85 |
| 0050 | 2026-07-21 | 0.6 | 2026-08-10 | 99.2 → 98.6 |
| 6488 | 2025-12-31 | 2.0 | 2026-01-30 | 413 → 411 |
| 6488 | 2026-07-16 | 5.7 | 2026-08-14 | 1,480 → 1,474.3 |
| 00679B | 2025-11-21、2026-02-26、05-22、08-21 | 各 0.28 | 各約三週後 | 例：27.51 → 27.23 |

官方（`TWT49U`／`exDailyQ`）、FinMind、Yahoo 三邊的除息日與金額都一致。

### 2.3 還原價驗算

用證交所收盤價，加上 `TWT49U` 的「參考價／前收」往回乘：

| 代號 | 自算還原一年報酬 | Yahoo adjclose 一年報酬 | 不還原 |
|---|---|---|---|
| 2330 | 64.15% | 64.15% | 62.16% |
| 0050 | 70.47% | 70.47% | 67.08% |

→ P2-05 B 需要的「0050 還原收盤價」可以自己算，不用付費資料。

---

## 3. 建議組合，以及怎麼接進 `src/data`

> **已實作：** 見 [Story 019](../stories/019-history-and-dividend-sources.md)。實作時改成沿用 Story 016 的 `CandleSource`（FinMind 本來就有開高低收），沒有另開 `HistorySource`；其餘大致照本節。

### 3.1 現況

`src/data/index.ts` 把 `twseSource`（`STOCK_DAY_ALL`）和 `tpexSource`（`tpex_mainboard_quotes`）用 `createMarketSource` 合成一個 `PriceSource & StockDirectory`。兩個都是 `createDailyQuoteSource`：一次拿全市場「最近一天」收盤價，5 分鐘記憶體快取，失敗丟 `PriceLoadError`。網址由 `twseEndpoint.ts`／`tpexEndpoint.ts` 依 `Platform.OS` 決定（網頁走 `/twse`、`/tpex` 同源代理）。

這套不動。歷史資料是**另一種形狀**（一檔、一段期間），所以另外開兩個介面，沿用同樣的寫法（純函式 parse + 可注入 `fetchFn`／`now` 的 source + 合成器）。

### 3.2 新介面

```ts
// src/data/HistorySource.ts
/** 一天的收盤價（未還原）。沒交易的日子不會出現 */
export type DailyClose = { date: string /* YYYY-MM-DD */; close: number };

export interface HistorySource {
  /** from～to（含）每個交易日的收盤價，日期遞增。代號不存在回 []；拿不到丟 PriceLoadError */
  getDailyCloses(symbol: string, from: string, to: string): Promise<DailyClose[]>;
}

// src/data/CorporateActionSource.ts
export type CorporateAction =
  | {
      kind: "dividend";
      symbol: string;
      exDate: string;
      cashPerShare: number | null;      // null = 已公告除息日、金額待公告
      stockPerThousand: number;         // 每千股配股數（FinMind 給「每股股票股利（元）」，÷ 10 × 1000 換算）
      payDate: string | null;           // 官方來源沒有，只有 FinMind 有
      closeBefore: number | null;       // 算還原價用
      reference: number | null;
    }
  | { kind: "split"; symbol: string; date: string; ratio: number /* 0050 = 4 */ };

export interface CorporateActionSource {
  getActions(symbol: string, from: string, to: string): Promise<CorporateAction[]>;
}
```

### 3.3 檔案

| 檔案 | 內容 |
|---|---|
| `finmindEndpoint.ts` | `FINMIND_DATA_URL`；有 CORS，所以網頁版也直接打，不用代理 |
| `finmindParse.ts`（+ test） | `TaiwanStockPrice` → `DailyClose[]`；`TaiwanStockDividend` ＋ `TaiwanStockDividendResult` ＋ `TaiwanStockSplitPrice` → `CorporateAction[]`；`CashEarningsDistribution === 0` 且除息日在未來 → `cashPerShare: null` |
| `finmindSource.ts`（+ test） | 同時實作兩個介面。HTTP 402／400 或 `status !== 200` → `PriceLoadError` |
| `officialHistorySource.ts`（+ test） | 依 `stockDirectory` 的 `market` 選證交所 `STOCK_DAY` 或櫃買 `tradingStock`，**一次一個月**，同一來源請求間隔 ≥ 2 秒 |
| `officialActionSource.ts`（+ test） | 證交所 `TWT49U` ＋ 櫃買 `exDailyQ`，**一年一個請求、全市場**，記憶體裡依年份快取，再依代號篩。`payDate: null` |
| `twseHistoryParse.ts`、`tpexHistoryParse.ts` | 民國日期、千分位、`--`／`----`（沿用 `twseParse.ts` 的 `parseTwsePrice`） |
| `fallbackSource.ts` | 跟 `createMarketSource` 同樣的錯誤處理：依序試，只吞 `PriceLoadError`，全部失敗才丟 |
| `cachedHistorySource.ts` | AsyncStorage 快取，見 3.5 |
| `src/app/tpex-history+api.ts`、`tpex-ex+api.ts` | **只有網頁版**需要（櫃買沒有 CORS）。APK 用不到 |
| `src/domain/adjustedPrice.ts`（+ test） | 純函式 `adjustCloses(closes, actions)`：除權息日前每天乘 `reference / closeBefore`；分割日前每天除以 `ratio`。缺 `reference` 時用 `(closeBefore − cash) / (1 + stockPerThousand/1000) / closeBefore` |
| `src/domain/tradingDays.ts`（+ test） | `nextTradingDay(date, closes)`：第一個 ≥ date 且有收盤價的日子；找不到且 date ≥ 最後一筆資料日 → `null`（spec：先不產生，下次補） |

`index.ts` 照現有模式：

```ts
const finmind = createFinmindSource();
export const historySource: HistorySource = useFakeSources
  ? fakeHistorySource
  : createCachedHistorySource(createFallbackHistorySource([finmind, officialHistorySource]));
export const corporateActionSource: CorporateActionSource = useFakeSources
  ? fakeCorporateActionSource
  : createFallbackActionSource([finmind, officialActionSource]);
```

Jest 與 Maestro 繼續用 `EXPO_PUBLIC_USE_FAKE_PRICES=1` 走假資料；假資料可以從腳本 `--out` 存下來的真實回應裁一段放 `__fixtures__`（跟 `tpexMainboardQuotes.json` 一樣）。

### 3.4 各功能用到什麼

| 功能 | 歷史收盤價 | 除權息 | 備註 |
|---|---|---|---|
| P2-02 定期定額 | 該標的、從規則開始日起 | — | 交易日用 `nextTradingDay`；成交價 = 那天的 `close`（未還原） |
| P2-03 股利自動帶入 | — | 持有中的每一檔 | 參與股數看「除息日前一個交易日」，用持股的收盤價資料判斷交易日。`payDate` 為 null（走到官方備援）時，先維持 `estimated`，待 PO 決定是否用「除息日 + N 天」推估 |
| P2-04 XIRR | 只要今天 | `received` 的股利 | 不需要歷史價 |
| P2-05 B 改買 0050 | 0050（或 006208）從第一筆交易起 | 0050 的除息＋分割 | 用 `adjustCloses` 算還原價 |
| P2-07 資產走勢 | 每一檔持股、從第一筆交易起 | 分割 | 見下方「分割」 |

**分割要特別處理：** 0050 在 2025-06-18 一拆四，`STOCK_DAY`／`TaiwanStockPrice` 給的都是**當時的原始價格**（分割前約 188）。如果同學 2024 年買了 1,000 股 0050，2025-06-18 之後券商帳上會變 4,000 股。資產走勢逐日重建時，市值 = 股數 × 收盤價，股數與價格必須在同一個基準。建議由計算引擎在分割日自動把持股乘上 `ratio`（類似 P2-03 自動帶入，產生一筆 `source = auto` 的調整紀錄），而不是改歷史價格。這需要 PO 補一條規格。

### 3.5 快取與請求量

- **已收盤的日子不會再變**，所以歷史收盤價存進 AsyncStorage（key 例如 `history:v1:0050`），之後只補「最後一筆之後」到今天。
- 除權息資料存同一處，每天最多更新一次（除息日前會有新公告）。
- 只在進入走勢圖、對決、定期定額補產生時才抓，不要一開 app 就抓全部。
- 冷啟動請求量（FinMind）：持股 N 檔 → 收盤價 N+1 次（+1 是 0050）＋ 股利 N+1 次＋分割 1 次。10 檔約 23 次，之後每天每檔 1 次。一人一 IP 遠低於 300 次/小時；Tech Day 現場 20 人同一個 Wi-Fi、各 10 檔一起冷啟動約 460 次，**會超過**，此時自動退回官方來源（收盤價要一個月一請求，會變慢但能用）。
- 官方備援冷啟動：一檔 3 年 = 36 個請求 × 2.5 秒 ≈ 90 秒，只適合「補最近一兩個月」，不適合當主來源。

### 3.6 之後要收費時

不在 Tech Day 範圍，記下來給 P2-08：
- 最乾淨的做法是自建一個小後端（例如目前截圖辨識研究建議的 EAS Hosting API route），每天收盤後打一次證交所與櫃買 OpenAPI（政府資料開放授權、可商用），自己累積歷史；歷史起點用一次性的授權資料補。
- 或跟 FinMind 談商用。
- 不論哪種，app 端只要把 `index.ts` 裡的來源換掉，介面不變。

---

## 4. 重跑方式

```bash
node scripts/probe-history-sources.mjs
```

```bash
node scripts/probe-history-sources.mjs twse tpex check --out /tmp/probe.json
```

- 來源代號：`twse`、`tpex`、`mops`、`finmind`、`yahoo`、`check`（交叉比對；要同時跑 `twse`、`finmind`、`yahoo` 才有完整結果）。
- 期間固定為「今天往回一年」。上市用 2330、0050，上櫃用 6488、00679B。
- 每個請求都帶 `Origin` header，輸出會標出有沒有 CORS。
- 有 `FINMIND_TOKEN` 環境變數時會帶上（只給開發者本機用，不要放進 app）。
