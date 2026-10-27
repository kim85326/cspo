# Story 016：K 線圖與買入點

**身為** 想知道自己買在高點還是低點的人
**我想要** 算完盈虧後看到這檔股票的日 K 線，並在圖上看到我哪天、用什麼價格買的
**以便** 一眼看出買進後的走勢，以及現在離成本還有多遠

> 編號 016：006–015 已保留給 MVP 實作指南的 T1–T10（見 [mvp-implementation-guide.md](../mvp-implementation-guide.md)）。

## 驗收條件

K 線來自證交所「個股日成交資訊」（只有上市股票）。自動化測試用固定的假 K 線。

```gherkin
Scenario: 算完單檔就看到 K 線圖
  Given 我輸入 2330、買入價 500、數量 1000，沒填買入日期
  When 我按下「計算」
  Then 盈虧結果卡下方出現「日 K 線」卡片，顯示近 3 個月的日 K
  And 圖上有一條金色虛線標出成本 500，圖例寫「- - 成本 500」
  And 圖例提示「填『買入日期』就會在圖上標出買入點」

Scenario: 填了買入日期，圖上標出買入點
  Given 我另外填了買入日期 2026/10/05
  When 我按下「計算」
  Then 2026/10/05 那根 K 棒下方出現深藍色 ▲ 與「買入」字樣
  And 圖例寫「▲ 買入 2026/10/05」

Scenario: 買入日是假日
  Given 買入日期填 2026/10/03（星期六）
  When 我按下「計算」
  Then ▲ 標在下一個交易日 2026/10/05
  And 圖例寫「▲ 買入 2026/10/03（非交易日，標在 2026/10/05）」

Scenario: 買入日很久以前
  Given 買入日期早於今天 6 個月以上
  When 我按下「計算」
  Then 圖表顯示近 6 個月，不標 ▲
  And 圖例寫「買入日 yyyy/mm/dd 早於圖表範圍（最多顯示近 6 個月）」

Scenario: 買入日期用日曆選
  When 我點「買入日期」
  Then 跳出系統日曆（Android 對話框、iOS 內嵌日曆、網頁版瀏覽器的日期選擇器），最晚只能選到今天
  When 我選了 2026/10/05
  Then 日曆收起，欄位顯示 2026/10/05，旁邊有「清除」

Scenario: 舊版手打的買入日期格式不對
  Given 從舊版帶回來的買入日期是 2026105、或 2026/02/30、或明天
  When 我按下「計算」
  Then 買入日期欄位下方顯示對應的錯誤，不顯示結果

Scenario: K 線載入失敗
  Given 斷網或證交所沒回應
  When 我按下「計算」
  Then 盈虧結果照樣顯示
  And K 線卡片顯示「K 線載入失敗，請檢查網路後重試」與「重試」按鈕，按了會再抓一次

Scenario: 查不到 K 線
  Given 我算的是上櫃股票（目前清單裡還沒有），或這幾個月都沒交易
  Then K 線卡片顯示「查不到這檔股票的 K 線資料（目前只支援上市股票）」

Scenario: 多檔比較
  Given 我加到兩檔以上
  When 我按下「計算」
  Then 只顯示比較結果，不顯示 K 線圖

Scenario: 買入日期會被記住
  Given 我填了買入日期並按下「計算」
  When 我完全關掉 app 再打開
  Then 買入日期欄位帶回原本的值
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 算完單檔就看到 K 線圖 | `src/domain/candles.test.ts`（範圍、座標、成本線） | `src/screens/CalculateScreen.test.tsx` | — |
| 填了買入日期 | `src/domain/candles.test.ts`（`locateBuyDate`、`buyPoint`） | 同上 | — |
| 買入日是假日 | 同上 | 同上 | — |
| 買入日很久以前 | `src/domain/candles.test.ts`（`chartMonths`） | 同上 | — |
| 買入日期格式不對 | `src/domain/buyDate.test.ts`、`src/domain/pnl.test.ts` | 同上 | — |
| K 線載入失敗 | `src/data/twseCandleSource.test.ts` | 同上 | —（手動，見 test-plan K3） |
| 查不到 K 線 | `src/data/twseDayParse.test.ts`、`src/data/twseCandleSource.test.ts` | 同上 | — |
| 多檔比較 | — | 同上 | — |
| 買入日期會被記住 | `src/data/asyncStorageHoldingStore.test.ts` | 同上 | — |

## 實作備忘

- 資料來源：`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=YYYYMMDD&stockNo=代號&response=json`，一次回一檔一個月。網頁版走同源代理 `/twse-day`（`src/app/twse-day+api.ts`），因為證交所沒開 CORS。
- 證交所會擋太頻繁的請求：月份**依序**抓、不並行；過去的月份抓過就一直用快取，本月 5 分鐘內不重抓（`src/data/twseCandleSource.ts`）。最多 6 個月 = 6 個請求。
- 範圍：預設近 3 個月；買入日期更早就延伸到買入那個月，最多 6 個月（`src/domain/candles.ts` 的 `chartMonths`）。
- 座標都在 domain 的 `layoutCandleChart` 算好，`src/ui/CandleChart.tsx` 只負責用 `react-native-svg` 照著畫。沒用現成的 K 線套件：常見的都依賴 reanimated／gesture-handler，而 Android 打包已把它們排除（APK 瘦身）。
- 顏色：紅 K 漲、綠 K 跌（台股慣例），成本線金色虛線，買入點深藍 ▲ 加「買入」字樣，不靠顏色單獨傳達。
- 買入日期存成使用者輸入的原始字串（`SavedHolding.buyDate`，選填，舊資料沒有也讀得回來）。MVP T3 把舊資料轉成交易時，可以拿它當 `tradeDate`，不用一律填搬移當天。
- 上櫃股票要等 MVP T2 接櫃買中心，K 線來源再一起補。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過
