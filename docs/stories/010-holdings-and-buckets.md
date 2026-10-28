# Story 010：持股明細、單一持股頁、核心／衛星切換

**身為** 記了好幾筆交易的使用者
**我想要** 看到每一檔股票各賺賠多少、點進去看那一檔的所有交易與股利，並自己決定哪些算核心、哪些算衛星
**以便** 知道哪一檔表現好，也讓首頁的核心／衛星比較符合我自己的分法

對應規格：[product-spec.md](../product-spec.md) 的 M-04、M-06；實作指南 [T5](../mvp-implementation-guide.md)。數字全部來自 Story 006 的計算引擎（`computePosition`），名詞見 [glossary.md](../glossary.md)。
交易輸入畫面是 Story 009（T4），首頁總覽是 Story 011（T6）；這張只做持股明細與單一持股頁。

## 驗收條件

```gherkin
Scenario: 3.7 範例的 2330 數字（M-04 AC1）
  Given 我照 product-spec 3.7 記了 2330：買 1000 股 @ 600、買 1000 股 @ 500、賣 500 股 @ 650、現金股利 5,000
  And 2330 的參考價是 620
  When 我打開持股明細
  Then 2330 那一列顯示 1,500 股、平均成本 550.78、參考價 620.00、市值 930,000
  And 未實現 +99,710、已實現 +48,170、股利 5,000、總報酬 +152,880、報酬率 +13.88%
  When 我點進 2330
  Then 單一持股頁顯示同樣的數字，另有累計投入 1,101,567 與持有天數

Scenario: 全部賣光的在「已出清」（M-04 AC2）
  Given 我買了 2454 之後全部賣掉
  When 我打開持股明細
  Then 「持有中」沒有 2454
  When 我切到「已出清」
  Then 看到 2454，顯示已實現損益與股利

Scenario: 漲紅跌綠，不只靠顏色（M-04 AC3）
  Given 2330 賺錢、2317 賠錢
  Then 2330 的總報酬是紅色、有 ▲ 和「賺了」
  And 2317 的總報酬是綠色、有 ▼ 和「虧了」

Scenario: 排序
  Given 我有好幾檔持股
  Then 預設依市值由大到小
  When 我選「報酬率」或「總報酬」
  Then 依那個數字由大到小，沒有價格的排最後

Scenario: 沒有價格
  Given 行情載入失敗或查不到這檔的價格
  Then 參考價、市值、未實現、總報酬、報酬率顯示 —，並提示「行情載入失敗」
  And 已實現損益、已領股利照常顯示

Scenario: 單一持股的交易與股利紀錄
  When 我點進 2330
  Then 看到 2330 的所有交易與股利，依日期新到舊
  When 我點一筆交易
  Then 進到那筆交易的編輯畫面（Story 009）
  When 我按「新增交易」
  Then 進到新增交易畫面，證券已帶入 2330

Scenario: 新增 0050 自動歸核心（M-06 AC1）
  When 我新增一筆 0050 的買入
  Then 0050 在持股明細標「核心」

Scenario: 手動切換核心／衛星，重開 App 還在（M-06 AC2）
  Given 2330 是個股，預設是衛星
  When 我在 2330 的單一持股頁切成「核心」
  Then 畫面標「核心」，並提示「你已手動改過」
  When 我關掉 App 再打開
  Then 2330 還是核心

Scenario: 還沒有任何交易
  When 我打開持股明細
  Then 顯示「還沒有持股」與「新增交易」按鈕，而不是一排 0
```

## 給首頁（T6）用的元件

```tsx
import { useHoldings } from "@/hooks/useHoldings";
import { activeHoldings, sortHoldings } from "@/domain/holdings";
import { HoldingRow } from "@/ui/HoldingRow";

const { loaded, holdings, quotesStatus, asOf } = useHoldings();
sortHoldings(activeHoldings(holdings), "marketValue").map((h) => (
  <HoldingRow key={h.symbol} holding={h} onPress={() => router.push({ pathname: "/holdings/[symbol]", params: { symbol: h.symbol } })} />
));
```

| 名稱 | 位置 | 說明 |
|---|---|---|
| `HoldingRow` | `src/ui/HoldingRow.tsx` | props：`holding: HoldingView`、`onPress?: () => void`（沒給就不能點）、`detailed?: boolean`（預設 false 是精簡版：名稱、核心／衛星標籤、股數、均價、市值、總報酬與報酬率；true 再加參考價、持有天數、未實現、已實現、股利、累計投入）。股數 0 時改顯示已實現損益與「已出清」。`testID` 是 `holding-row-<代號>` |
| `BucketTag` | 同上 | 核心／衛星小標籤 |
| `useHoldings({ repository?, prices?, today? })` | `src/hooks/useHoldings.ts` | 記帳本 + 每檔參考價 → `holdings: HoldingView[]`（含已出清），另有 `ledger`、`loaded`、`quotesStatus`（`loading`／`ready`／`error`）、`asOf`、`repository`。記帳本一變就重算，代號清單變了才重抓行情 |
| `HoldingView` | `src/domain/holdings.ts` | `{ symbol, name, bucket, bucketOverridden, position: Position }` |
| `activeHoldings` / `closedHoldings` / `sortHoldings(views, "marketValue" \| "returnRate" \| "totalReturn")` | 同上 | 持有中、已出清、排序 |
| `formatAmount` / `formatSignedAmountOrDash` / `formatPrice` / `formatRate` / `formatShares` | 同上 | 顯示格式（規格 3.1），null 一律顯示 — |
| `Segmented` | `src/ui/Segmented.tsx` | 分段切換（無障礙角色 radiogroup／radio） |

## 路由

| 路由 | 畫面 |
|---|---|
| `src/app/holdings/index.tsx` | `src/screens/HoldingsScreen.tsx`：持股明細，「持有中／已出清」與排序 |
| `src/app/holdings/[symbol].tsx` | `src/screens/HoldingDetailScreen.tsx`：數字摘要、核心／衛星切換、股價走勢（`PriceHistoryCard`）、交易與股利紀錄 |

## 畫面開發用的示範資料

在 `.env.local` 加 `EXPO_PUBLIC_USE_DEMO_LEDGER=1`（建議同時 `EXPO_PUBLIC_USE_FAKE_PRICES=1`），dev server 的記帳本改用記憶體版 + `src/data/demoLedger.ts`：3.7 範例的 2330、ETF 0050／00878（核心）、個股 2317（衛星）、已出清的 2454、手動改成核心的 2412。只在 `__DEV__` 生效，不讀寫手機裡的資料，重新整理就回到示範資料。

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 3.7 範例的數字 | `src/domain/holdings.test.ts` | `src/screens/HoldingsScreen.test.tsx`、`src/screens/HoldingDetailScreen.test.tsx` | — |
| 已出清 | `holdings.test.ts` | `HoldingsScreen.test.tsx`、`HoldingDetailScreen.test.tsx` | — |
| 漲紅跌綠 + ▲▼ + 賺了／虧了 | — | `HoldingsScreen.test.tsx`、`HoldingDetailScreen.test.tsx` | — |
| 排序 | `holdings.test.ts` | `HoldingsScreen.test.tsx` | — |
| 沒有價格 | `holdings.test.ts` | `HoldingsScreen.test.tsx` | — |
| 交易與股利紀錄、點交易編輯、新增交易帶代號 | `holdings.test.ts`（`symbolHistory`） | `HoldingDetailScreen.test.tsx` | — |
| 新增 0050 自動歸核心 | `holdings.test.ts` | `HoldingsScreen.test.tsx`、`HoldingDetailScreen.test.tsx` | — |
| 手動切換、重開還在 | `src/data/ledgerRepository.test.ts`（`setBucket`，Story 008） | `HoldingDetailScreen.test.tsx`（同一份存檔、新的 repository 重開畫面） | — |
| 空狀態 | — | `HoldingsScreen.test.tsx` | — |

Maestro 流程還沒寫：持股明細要等 T4 的交易輸入與 T6 的首頁入口都合併後才走得到（見決策 9）。

## 決策紀錄

規格沒寫到、或需要選做法的地方。原則：選最不會讓使用者算錯錢的做法。

1. **路由用 `src/app/holdings/index.tsx` 與 `src/app/holdings/[symbol].tsx`**，不是實作指南寫的 `(tabs)/holdings.tsx` 與 `holding/[symbol].tsx`。這次 T4、T5、T6 同時開發，路由由主 session 事先分好；T6 若改成分頁導覽，把 `/holdings` 放進分頁即可，單一持股頁的網址不用變。
2. **【待 PO 確認】未實現損益的 % = 未實現損益 ÷ 持有成本。** 規格只寫「未實現損益（金額與 %）」，沒寫分母。用持有成本（現在這批股票花了多少）最符合「還沒賣的部分賺幾 %」；3.7 範例是 +12.07%。總報酬率仍照 3.5 用累計投入當分母（+13.88%）。
3. **持股明細的每一列列出 M-04 的全部欄位**（`detailed`），首頁可以用精簡版。這樣持股明細本身就滿足 M-04，不用點進去才看得到。
4. **核心／衛星只在單一持股頁切換**，列表只顯示標籤。列表上放切換鈕很容易誤觸，而切換會改到首頁的三組數字。
5. **切換時一律存使用者選的值**（`setBucket(symbol, bucket)`），就算跟預設一樣也存。使用者明確選過，之後判斷規則變了也照他的選擇；「你已手動改過」只在跟預設不同時顯示。
6. **已出清 = 曾經買過（累計投入 > 0）、目前股數 0。** 只有股利、沒有買入紀錄的代號不算（不會出現在任何分頁），這種資料只會在手動記股利記錯代號時出現。已出清分頁依總報酬（已實現 + 股利）排序，因為沒有市值。
7. **沒有價格時，總報酬、報酬率顯示 —**（沿用計算引擎的 null），不把市值當 0 算，免得看起來像虧了一大筆。排序時排最後。已出清的不需要價格。
8. **證券名稱來自行情**（`Quote.name`）；查不到行情時名稱顯示代號。
9. **持股明細目前沒有入口**：首頁是 T6 的範圍，這張不改首頁。T6 要在首頁或分頁加「持股」入口，在那之前只能直接開 `/holdings`。
10. **股價走勢（`PriceHistoryCard`）只在持有中顯示**，成本線用平均成本、買入點用這一段持有的第一筆買入日（`holdingSince`）。已出清的不顯示走勢。
    - ~~分好幾次買的時候，「買在高點還是低點」那句是拿平均成本跟第一筆買入日前的股價比~~（2026-10-28 已改，對照 P2-09「每筆買入交易各自判斷」）：只有一筆買入時，用那筆的日期與成交價；分好幾筆時，走勢卡不下單一結論、圖上逐筆標點，交易紀錄裡每筆買入下方有「買在高點還是低點？」進單筆畫面。詳見 Story 016「規格對照與待 PO 確認」。【待 PO 確認】分批買入時走勢卡要不要直接列出每筆的結果（見 Story 016 待確認 4）。
11. **股利紀錄只顯示、不能點**：股利的新增與編輯畫面在 T7（Story 012）。交易紀錄點下去進 `/transaction/[id]`（T4）。
12. **「日期待補」**：搬移過來、不知道真正交易日期的交易（Story 008 的 `tradeDateUnknown`），在紀錄裡日期下方標「日期待補」，提醒持有天數可能不準。
13. **示範資料用環境變數 `EXPO_PUBLIC_USE_DEMO_LEDGER` 切換**，只在 `__DEV__` 生效，APK／OTA 不會用到。

## 狀態

- [ ] AC 經 PO 確認（尤其決策 2、10）
- [x] 實作完成、自動化測試綠燈
- [x] 網頁版 375px 寬實際看過（示範資料，port 8085）
- [ ] Maestro 流程（等 T4、T6 合併後補）
- [ ] 測試同學手機驗收
