# MVP 實作指南

> 給接手實作的工程師（或工程師使用的 AI agent）。
> 規格的「做什麼」在 [product-spec.md](product-spec.md)；這份講「怎麼在這個 repo 裡一步步做出來」。
> 範圍：**只有 MVP**（product-spec 第 6 章 M-01～M-10）。Phase 2 之後另外再出指南。

---

## 0. 直接貼給 AI agent 的開工 prompt

如果你用 Claude Code 或其他 AI agent 開發，把下面整段貼給它，再告訴它「從任務 T1 開始」：

```text
你要在這個 repo（Expo SDK 58 + TypeScript 的台股盈虧 App）實作 MVP。

開工前依序讀完：
1. AGENTS.md（Expo 版本規則：寫任何 Expo API 前要先查 SDK 58 對應文件）
2. docs/context-for-ai.md（專案背景、目錄結構、踩過的坑）
3. docs/product-spec.md 第 0～6 章（產品規格，第 3 章是計算規則）
4. docs/mvp-implementation-guide.md（本次的任務拆解與順序）
5. docs/glossary.md、docs/stories/ 裡的 001～005（story 的寫法範本）

工作方式：
- 一次只做一個任務（T1、T2…），照指南的順序。每個任務一個分支、一個 PR。
- 每個任務開工前，先在 docs/stories/ 新增對應的 story 檔，把 product-spec 的 AC 改寫成 Gherkin，
  並附「對應的自動化測試」表，格式照抄 003 或 005。
- 計算邏輯只能放在 src/domain/，必須有單元測試；product-spec 3.7 的數字全部要變成測試。
- 對外資料只能透過 src/data/ 的介面，測試一律用假來源。
- 每個任務結束前 npm run check 必須全綠，並逐條核對該任務的「完成條件」。
- 規格沒寫清楚的地方，選最不會讓使用者算錯錢的做法，記在 story 檔的「決策紀錄」段落，不要停下來問。
- 不要實作 Phase 2 以後的功能（雲端、定期定額、股利自動帶入、XIRR、大盤比較、付費）。
```

---

## 1. 現況與目標

| | 現在（iteration-1） | MVP 完成後 |
|---|---|---|
| 資料單位 | 一筆「代號 + 買入價 + 數量」（`SavedHolding`） | 一筆一筆的**交易**（買、賣）與**股利** |
| 持股 | 使用者輸入 | 由交易**重算**出來 |
| 首頁 | `CalculateScreen`：輸入 → 按計算 → 看結果 | 總覽：整體、核心（ETF）、衛星（個股）三組數字 |
| 費用 | 不算手續費與稅 | 手續費、證交稅都算，可手動覆寫 |
| 股票清單 | 證交所上市 | 上市 + 上櫃，並標示個股／ETF |
| 儲存 | AsyncStorage `cspo.holdings.v1` | 新的 ledger 結構，舊資料自動搬移 |

**保留不動的部分**：`StockPicker`、`theme.ts`、設計系統、證交所來源、截圖辨識的 server 端（`src/server/`、`recognize+api.ts`）。

---

## 2. 任務順序總覽

每個任務 = 一張 story = 一個 PR。順序有相依性，請照順序做。

| 任務 | Story | 內容 | 對應規格 | 相依 |
|---|---|---|---|---|
| T1 | 006 | 計算引擎（純 domain，無畫面） | 第 3 章 | — |
| T2 | 007 | 證券類型與上櫃股票 | M-01、第 5 章 | — |
| T3 | 008 | 新儲存層與舊資料搬移 | M-07 | T1 |
| T4 | 009 | 新增／編輯／刪除交易畫面 | M-01、M-02 | T1–T3 |
| T5 | 010 | 持股明細、單一持股頁、核心／衛星切換 | M-04、M-06 | T4 |
| T6 | 011 | 首頁總覽，取代 CalculateScreen | M-05 | T5 |
| T7 | 012 | 股利紀錄 | M-03 | T5 |
| T8 | 013 | 設定與免責聲明 | M-09、M-10 | T4 |
| T9 | 014 | 備份、還原、匯出 CSV | M-08 | T3 |
| T10 | 015 | 截圖匯入改成產生交易 | （沿用 Story 005） | T4 |

T1 和 T2 互不相依，可以並行。

---

## 3. 各任務細節

### T1｜計算引擎（Story 006）

**目標**：把 product-spec 第 3 章全部寫成純函式，不碰 UI、不碰儲存。

**新增檔案**
| 檔案 | 內容 |
|---|---|
| `src/domain/ledgerTypes.ts` | `Transaction`、`Dividend`、`HoldingSetting`、`UserSettings`、`Ledger`、`SecurityType`、`Bucket` 型別（欄位照 product-spec 第 4 章） |
| `src/domain/fees.ts` | `calcFee(amount, shares, settings)`、`calcTax(amount, taxRate)`、`defaultTaxRate(type)` |
| `src/domain/position.ts` | `computePosition(symbol, transactions, dividends, price?)`：依日期重播，回傳持股、平均成本、已實現、未實現、股利、總報酬、持有天數 |
| `src/domain/portfolio.ts` | `summarize(positions, settings)`：整體、核心、衛星三組加總 |
| `src/domain/ledgerValidation.ts` | `validateLedgerChange(ledger, change)`：新增／修改／刪除後重播，任何一筆賣出超過當時持股就回傳錯誤與是哪一筆 |
| 以上各檔的 `*.test.ts` | |

**實作注意**
- **浮點數取整陷阱**：JS 的小數乘法可能算出 `854.9999999` 這類結果（例如 `0.1 * 3 = 0.30000000000000004` 的反方向），直接 `Math.floor` 會少 1 元。手續費與稅統一用一個 `floorMoney(x) = Math.floor(x + 1e-9)` 輔助函式取整，並為它寫一個邊界測試（例如 `floorMoney(854.9999999999) === 855`）。
- 內部保留完整精度，只在顯示時四捨五入（沿用 `pnl.ts` 的 `formatSignedAmount`、`formatReturnRate`）。
- 重播順序：`tradeDate` 由舊到新，同一天依 `createdAt`。股票股利在除權息日當天、所有交易之前套用。
- 持股歸零後再買，平均成本重新開始，持有天數也從新的第一筆買入算。
- 沒有價格時，市值、未實現、總報酬回傳 `null`，不要回傳 0。
- 先不要刪除 `pnl.ts`、`compare.ts`，T6 換掉首頁時再移除。

**完成條件**
- [ ] product-spec 3.7 整張表的每一步，都有對應的斷言（已實現 48,170.25、未實現 99,709.75、總報酬 152,880、報酬率 13.88%）
- [ ] 零股手續費 6 元、最低手續費 20 元、折扣 0.28 → 239 元，各有測試
- [ ] 股票股利：1000 股、成本 100,000，配 100 股 → 平均成本 90.909…
- [ ] 賣出超過持股、刪除買入導致後面賣出不足，都會被 `validateLedgerChange` 拒絕
- [ ] `npm run check` 全綠

---

### T2｜證券類型與上櫃股票（Story 007）

**目標**：股票清單涵蓋上櫃，且每檔知道自己是個股還是 ETF。

**修改**
- `StockInfo` 加上 `type: "stock" | "etf"` 與 `market: "TWSE" | "TPEx"`。
- ETF 判斷規則：**代號以 `00` 開頭即為 ETF**。這是簡化規則，寫進 story 的決策紀錄。
- `stocks.ts` 假資料補上 `type`、`market`，並加入至少 2 檔上櫃股票與 1 檔上櫃 ETF，讓測試涵蓋得到。
- 新增 `tpexParse.ts`、`tpexSource.ts`（比照 `twseParse.ts`、`twseSource.ts`），以及網頁版代理 `src/app/tpex+api.ts`（比照 `twse+api.ts`，櫃買中心同樣可能沒開 CORS）。
- 新增一個合併來源，把上市與上櫃合成同一個 `PriceSource` + `StockDirectory`，熱門排序沿用現有規則。

**實作注意**
- 櫃買中心 OpenAPI 的端點與欄位名稱，**動手前先實際打一次 API 確認**，不要憑記憶寫。把一份真實回應存成測試 fixture。
- 上市或上櫃其中一邊失敗時，另一邊仍要能用；兩邊都失敗才丟 `PriceLoadError`。

**完成條件**
- [x] 搜尋得到上櫃股票，選擇器上顯示「個股」或「ETF」標籤
- [x] `0050`、`00878` 為 ETF，`2330` 為個股
- [x] 上櫃來源失敗時，上市股票仍可搜尋與取價

---

### T3｜新儲存層與舊資料搬移（Story 008）

**目標**：用一份 `Ledger` 存全部資料，並把舊版持股搬過來。

**新增**
- `src/data/LedgerStore.ts` 介面：`load(): Promise<Ledger>`、`save(ledger): Promise<void>`、`clear()`。
- `asyncStorageLedgerStore.ts`（key：`cspo.ledger.v1`）、`memoryLedgerStore.ts`（測試用）。
- `Ledger` 結構：`{ schemaVersion: 1, transactions, dividends, holdingSettings, settings }`。
- `src/domain/migrateSavedHoldings.ts`：純函式，`SavedHolding[]` → `Transaction[]`。

**搬移規則**（product-spec 1.5）
- 啟動時：若 `cspo.ledger.v1` 不存在、而 `cspo.holdings.v1` 存在，就執行搬移。
- 每筆合法的舊持股轉成一筆買入交易：日期為搬移當天、手續費依 3.2 計算、`note` 為「由舊版資料轉入」。
- 無法通過驗證的舊資料略過，不要讓整個搬移失敗。
- **先寫入新資料並讀回確認成功，才刪除舊 key。**

**完成條件**
- [ ] 舊版存了 2 檔持股的使用者，升級後看到 2 筆買入交易
- [ ] 搬移中途失敗（模擬 `setItem` 丟錯）時，舊資料仍在
- [ ] 資料損壞時 `load()` 回傳空 ledger，不讓 App 崩潰

---

### T4｜交易輸入畫面（Story 009）

**目標**：完成 M-01 與 M-02 的全部 AC。

**路由（expo-router）**
| 路由 | 畫面 |
|---|---|
| `src/app/transaction/new.tsx` | 新增交易，可帶 `?symbol=2330` |
| `src/app/transaction/[id].tsx` | 編輯交易 |

畫面本體放 `src/screens/TransactionFormScreen.tsx`，`src/app/` 只做轉出（沿用現有規則）。

**實作注意**
- 證券欄位沿用 `StockPicker`。
- 價格或股數變動時即時重算手續費與稅；使用者手動改過後設 `feeOverridden = true`，之後不再自動覆蓋，並顯示「重新計算」。
- 「儲存並繼續新增」：保留證券欄位，清空其他欄位。
- 儲存前呼叫 T1 的 `validateLedgerChange`，錯誤訊息要說出是哪一筆交易有問題。
- 刪除需二次確認。
- 數字欄位沿用現有全形數字轉換。

**完成條件**
- [ ] product-spec M-02 的 5 條 AC 全部有畫面測試
- [ ] 新增一個 Maestro 流程：買兩筆、賣一筆，檢查持股數字

---

### T5｜持股明細與核心／衛星（Story 010）

**目標**：M-04 與 M-06。

**路由**
| 路由 | 畫面 |
|---|---|
| `src/app/(tabs)/holdings.tsx` | 持股列表，含「持有中／已出清」切換 |
| `src/app/holding/[symbol].tsx` | 單一持股：數字摘要 + 該證券的交易與股利紀錄 + 核心／衛星切換 |

**實作注意**
- 排序：市值（預設）、報酬率、總報酬。
- 沒有價格的持股，相關欄位顯示 `—`。
- 漲紅跌綠，並沿用 ▲▼ 與「賺了／虧了」文字，不能只靠顏色。
- 核心／衛星預設依 T2 的 `type` 決定，使用者切換後存進 `holdingSettings`。

**完成條件**
- [ ] product-spec M-04、M-06 的 AC 全部有測試
- [ ] 3.7 範例輸入後，畫面顯示的數字與 product-spec M-04 第一條 AC 完全一致

---

### T6｜首頁總覽（Story 011）

**目標**：M-05，並把首頁從 `CalculateScreen` 換成總覽。

**路由調整**
- 改用分頁導覽：`src/app/(tabs)/_layout.tsx`，分頁為「總覽」、「持股」、「設定」。expo-router 分頁的寫法**先查 SDK 58 文件**。
- `src/app/(tabs)/index.tsx` → `src/screens/OverviewScreen.tsx`。
- 總覽右下或頂端提供「新增交易」入口。

**移除**
- `CalculateScreen`、`ComparisonCard`、`compare.ts`、`usePersistedHoldings` 及其測試。
- 舊的 Maestro 流程（001、003）改寫成新流程或刪除，`e2e/README.md` 同步更新。
- Story 003、004 的狀態段落註明「已由 Story 010、011 取代」。

**完成條件**
- [ ] 核心 + 衛星 = 整體（各項金額），有單元測試
- [ ] 沒有任何交易時顯示空狀態與「新增第一筆交易」
- [ ] 顯示價格資料日期（沿用 `Quote.asOf`）

---

### T7｜股利紀錄（Story 012）

**目標**：M-03。

- 路由：`src/app/dividend/new.tsx`、`src/app/dividend/[id].tsx`；入口在單一持股頁。
- 現金股利填實際入帳金額；股票股利填配發股數。
- 刪除股票股利前用 `validateLedgerChange` 檢查。

**完成條件**
- [ ] product-spec M-03 的 2 條 AC 有測試

---

### T8｜設定與免責聲明（Story 013）

**目標**：M-09、M-10。

- `src/app/(tabs)/settings.tsx`：手續費折扣、整股最低手續費、零股最低手續費。
- 修改設定只影響之後新增的交易（舊交易的 `fee` 是存下來的數字，本來就不會變）。
- 免責聲明：首次開啟顯示一次（記在 ledger 或另一個 AsyncStorage key），設定頁常駐。

**完成條件**
- [ ] 折扣改 0.28 後新增買入 1000 股 @ 600，手續費 239
- [ ] 改設定後舊交易的手續費不變

---

### T9｜備份、還原、匯出 CSV（Story 014）

**目標**：M-08。

- 需要的 Expo 模組（檔案寫入、分享、選檔）一律用 `npx expo install` 安裝，並**先查 SDK 58 文件**確認目前的 API 名稱。
- 新增原生模組後，Expo Go 可能不支援，要確認測試同學仍能用 Expo Go 驗收。若不行，在 story 記下來並和 PO 討論。
- 備份 JSON 就是 `Ledger` 本身加上 `exportedAt`。
- 還原：驗證 `schemaVersion` 與結構，顯示筆數，二次確認後整份取代。
- CSV：UTF-8 with BOM，欄位見 product-spec M-08。CSV 產生器放 `src/domain/`，可單元測試。

**完成條件**
- [ ] 備份 → 清空 → 還原，所有數字一致（單元測試以 ledger 物件比對）
- [ ] 格式錯誤的檔案不會覆蓋現有資料
- [ ] CSV 用 Excel 開啟，中文正常顯示（手動驗收，寫進 test-plan）

---

### T10｜截圖匯入改成產生交易（Story 015）

**目標**：讓 Story 005 的截圖匯入接上新的資料模型。

- 辨識與核對流程（`holdingExtract.ts`、`useScreenshotImport`、`ImportSourceSheet`）保留。
- 核對完成後，不再填入舊的輸入表單，改成每檔建立一筆買入交易：價格 = 辨識出的成本、`fee = 0`、`feeOverridden = true`、`source = "import"`、`note` 為「截圖匯入期初持股」、日期預設今天，可在核對畫面修改。
- 核對畫面上任何必填欄位為空時，不能匯入。
- 入口放在總覽的空狀態與「新增交易」選單中。

**完成條件**
- [ ] Story 005 的情境改寫後全部通過
- [ ] 匯入前取消，不寫入任何資料

---

## 4. 每個任務的完成定義（Definition of Done）

- [ ] `docs/stories/` 有該任務的 story 檔，含 Gherkin AC、對應測試表、決策紀錄
- [ ] 所有 AC 都有自動化測試；計算相關的一定是單元測試
- [ ] `npm run check`（typecheck + lint + test）全綠
- [ ] 主要流程有 Maestro YAML
- [ ] `docs/glossary.md` 已更新該任務引入或改變的名詞（product-spec 1.5 列了要改的詞）
- [ ] `docs/context-for-ai.md` 第 4 節（專案結構）與第 6 節（目前狀態）已同步
- [ ] 網頁版在 375px 寬沒有水平捲動
- [ ] 可互動元件都有中文 `accessibilityLabel`

---

## 5. 不要做的事

- 不要做 Phase 2 以後的功能，就算很順手。
- 不要在 `src/app/` 放邏輯或測試檔（expo-router 會把它當成頁面打包）。
- 不要在畫面裡寫死色碼與間距，一律用 `src/ui/theme.ts`。
- 不要憑記憶寫 Expo API，先查 SDK 58 文件（AGENTS.md 的規定）。
- 不要讓測試打真的證交所或櫃買中心，一律用假來源。
- 不要給任何買賣建議的文字。

---

## 6. 遇到問題時

| 狀況 | 做法 |
|---|---|
| 規格沒寫到 | 選最不會讓使用者算錯錢的做法，記在 story 的決策紀錄 |
| 規格與現有程式衝突 | 以 product-spec 為準，在 PR 說明中列出 |
| 規格本身看起來算錯 | 停下來，在 PR 或 Issue 標記 PO 確認，不要自行改公式 |
| Expo 模組在 Expo Go 不能跑 | 記錄在 story，和 PO 討論是否改做法或改用 development build |
