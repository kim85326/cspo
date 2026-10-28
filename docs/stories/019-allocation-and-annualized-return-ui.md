# Story 019：配置圓餅圖與年化報酬率（畫面）

> 對應實作指南 **T13**（配置圓餅圖），以及 **T11 的畫面**（年化報酬率）。
> 原本因為 019 被「歷史資料來源」用掉而暫用 028，2026-10-28 統一改回指南的 019（歷史資料來源改為 021，見 [docs/README.md](../README.md)「Story 編號對照」）。
> 規格：[product-spec.md](../product-spec.md) **P2-07 配置圖**、**P2-04**、**P2-08**（年化報酬率是 Pro 功能）。
> 計算在 [Story 017](017-xirr-and-allocation.md) 已經做好（`src/domain/allocation.ts`、`src/domain/xirr.ts`），這張只做畫面，沒有重寫計算。

**身為** 同時買 ETF 和個股的長期投資人
**我想要** 在首頁看到錢怎麼分在核心／衛星、個股／ETF 與每檔持股，也看到整體、核心、衛星與每檔的年化報酬率
**以便** 知道錢集中在哪裡，以及持有時間不同的部位誰賺得快

## 驗收條件

```gherkin
Scenario: 首頁的配置圓餅圖（P2-07）
  Given 2330 市值 600,000、0050 市值 300,000、2317 市值 100,000
  When 我打開首頁
  Then 「資產配置」卡片預設顯示核心／衛星：核心 30.00%、衛星 70.00%
  And 卡片下方寫「依目前市值計算，合計 1,000,000 元」
  When 我切到「個股／ETF」
  Then 個股 70.00%、ETF 30.00%
  When 我切到「每檔持股」
  Then 依市值由大到小：台積電 2330 60.00%、元大台灣50 0050 30.00%、鴻海 2317 10.00%

Scenario: 比例加總剛好 100%
  Given 三檔市值一樣
  Then 顯示 33.34%、33.33%、33.33%，加總 100.00%（toDisplayPercents）
  And 圓餅圖首尾相接、不留縫

Scenario: 只有一種類型
  Given 我只有 0050
  Then 圓餅圖是一整圈單一色塊，不出錯
  And 圖例寫核心 100.00%、衛星 0.00%

Scenario: 改了核心／衛星（M-06）
  Given 我把 2317 改成核心
  Then 核心 40.00%、衛星 60.00%

Scenario: 持股太多
  Given 我持有 7 檔以上
  When 我切到「每檔持股」
  Then 市值前 5 檔各自一塊，其餘合成一塊「其他」

Scenario: 缺少價格
  Given 有 1 檔持股拿不到價格
  Then 那一檔不算進配置，卡片寫「有 1 檔持股缺少價格，沒有算進配置」
  Given 全部持股都拿不到價格
  Then 卡片寫「持股都還沒有價格，暫時畫不出配置」

Scenario: 首頁的年化報酬率（P2-04）
  Given 0050 是 2025-10-27（一年前）投入 100,000，今天值 110,000
  And 2330 是 2026-04-10（200 天前）才買
  When 我打開首頁
  Then 「年化報酬率」卡片：核心 +10.00%、衛星「持有未滿一年」
  And 下面說明「衛星：第一筆投入到今天不到 365 天，年化會把短期漲跌放大，先不顯示」
  And 好幾組是同一個原因時合併成一行，例如「整體、核心、衛星：…」

Scenario: 算不出來時說明原因
  Given 某一組沒有持股
  Then 顯示 —，原因「沒有持股」
  Given 某一組有持股缺少價格
  Then 顯示 —，原因「缺少價格，暫時算不出來」
  Given 現金流算不出 XIRR（無解）
  Then 顯示 —，原因「這些買賣紀錄算不出年化報酬率」，App 不會崩潰

Scenario: 單一持股頁的年化報酬率
  When 我打開持股 200 天的 2330
  Then 摘要下面有「年化報酬率：持有未滿一年」與原因
  When 我打開一年前買、今天賺 10% 的 0050
  Then 顯示 +10.00%（紅色，台股漲紅）

Scenario: 價格載入中
  Then 年化報酬率顯示「價格更新中…」，配置圖先不畫，不會閃出「缺少價格」

Scenario: 年化報酬率是 Pro 功能（P2-08）
  Given Pro 方案開關（proPlan）打開，我是 Free
  Then 年化報酬率的位置顯示 Story 020 的鎖定卡片與「升級 Pro」，不顯示數字
  Given 我打開「Demo：解鎖所有 Pro 功能」
  Then 顯示數字
  Given Pro 方案開關關閉（APK 目前的狀態）
  Then 沒有 Free／Pro 之分，直接顯示年化報酬率
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 |
|---|---|---|
| 配置圓餅圖、切換三種分法、改核心／衛星 | — | `src/ui/AllocationCard.test.tsx` |
| 比例加總 100%、不留縫 | `src/domain/allocation.test.ts`（Story 017）、`src/domain/allocationChart.test.ts` | — |
| 只有一種類型 | `src/domain/allocationChart.test.ts` | `src/ui/AllocationCard.test.tsx` |
| 持股太多合成「其他」 | `src/domain/allocationChart.test.ts` | — |
| 缺少價格、載入中 | — | `src/ui/AllocationCard.test.tsx`、`src/ui/AnnualizedReturnCard.test.tsx` |
| 年化報酬率文字與原因 | `src/domain/annualizedReturnText.test.ts` | `src/ui/AnnualizedReturnCard.test.tsx` |
| 單一持股的年化報酬率 | — | `src/ui/AnnualizedReturnCard.test.tsx` |
| Pro 鎖定 | — | `src/ui/AnnualizedReturnCard.test.tsx` |

## 決策紀錄

- **畫面做成獨立元件**：`src/ui/AllocationCard.tsx`、`src/ui/AnnualizedReturnCard.tsx`。首頁與單一持股頁只加幾行引用，因為同時有好幾個 session 在改首頁和 `theme.ts`。圖表色也放在元件裡，沒有放進 `theme.ts`。
- **圖表沒有加套件**，用已經裝好的 `react-native-svg` 畫甜甜圈圖，Expo Go 與網頁版都能用，可以走 OTA。弧的計算在 `src/domain/allocationChart.ts`，有單元測試。
- **配置圖放在首頁**，就在核心／衛星兩張卡下面、「新增交易」上面。實作指南寫「點開可看每檔持股占比」，這裡改成同一張卡片用分段切換（核心／衛星、個股／ETF、每檔持股），不用另開畫面。
- **配色**：核心＝ETF 用深藍、衛星＝個股用金色，兩種分法顏色一致；避開紅綠，免得被看成賺賠。每檔持股最多 6 塊，第 7 檔以後合成「其他」（灰色）。圖例一定附文字與百分比，不靠顏色傳達；圖本身對螢幕閱讀器隱藏，改念圖例。
- **配置圖不鎖 Pro**：P2-08 的「資產走勢與配置：Free 近 1 個月」限制的是期間，配置圖只看今天，所以 Free 也能看。
- **年化報酬率放在獨立的卡片**：實作指南寫「首頁總覽加一欄」，但總覽三張卡正在被 UI 升級改版，所以放在核心／衛星卡下面的一張卡片，列整體、核心、衛星三列。單一持股頁也是摘要卡下面的一張小卡。等首頁改版合併後，可以再搬進總覽卡。
- **算不出來時寫原因**：P2-04 只規定「未滿一年」與「—」。「—」再細分成沒有持股、缺少價格、XIRR 無解三種原因（`src/domain/annualizedReturnText.ts`），只用來顯示說明，數字照 `xirr.ts`。首頁三組常常是同一個原因，合併成一行。
- **Pro 方案開關關閉時直接顯示年化報酬率**：開關關閉時 `/pro` 會導回首頁，鎖定卡片的「升級 Pro」按了沒作用，所以只在開關打開時才用 `ProGate` 包住。這點請 PO 確認。

## 待 PO 確認

1. Pro 方案開關關閉（APK 目前的狀態）時，年化報酬率要直接顯示，還是先藏起來？
2. 配置圖放在 Free（理由見上），可以嗎？
3. 年化報酬率是首頁上的一張獨立卡片，不是放在總覽三張卡裡的一欄，可以嗎？
4. 「每檔持股」超過 6 檔時合成「其他」，可以嗎？
5. 「—」的三種原因文字是否 OK。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過
