# MVP 與 Tech Day 實作指南

> 給接手實作的工程師（或工程師使用的 AI agent）。
> 規格的「做什麼」在 [product-spec.md](product-spec.md)；這份講「怎麼在這個 repo 裡一步步做出來」。
> 範圍：**Tech Day 範圍**，即 product-spec 開頭「Tech Day 範圍與優先順序」表，包含 MVP 主流程與 Phase 2 到股利自動帶入。

---

## 0. 直接貼給 AI agent 的開工 prompt

如果你用 Claude Code 或其他 AI agent 開發，把下面整段貼給它，再告訴它「從任務 T1 開始」：

```text
你要在這個 repo（Expo SDK 58 + TypeScript 的台股盈虧 App）實作 Tech Day 範圍的功能。

開工前依序讀完：
1. AGENTS.md（Expo 版本規則：寫任何 Expo API 前要先查 SDK 58 對應文件）
2. docs/context-for-ai.md（專案背景、目錄結構、踩過的坑）
3. docs/product-spec.md 開頭的「Tech Day 範圍與優先順序」與第 0～7 章（第 3 章是計算規則）
4. docs/mvp-implementation-guide.md（本次的任務拆解與順序）
5. docs/glossary.md、docs/stories/ 裡的 001～005（story 的寫法範本）

工作方式：
- 一次只做一個任務，照指南第 2 節「開發順序」由上往下做。每個任務一個分支、一個 PR。
- 每個任務開工前，先在 docs/stories/ 新增對應的 story 檔，把 product-spec 的 AC 改寫成 Gherkin，
  並附「對應的自動化測試」表，格式照抄 003 或 005。
- 計算邏輯只能放在 src/domain/，必須有單元測試；product-spec 3.7 的數字全部要變成測試。
- 對外資料只能透過 src/data/ 的介面，測試一律用假來源。
- 每個任務結束前 npm run check 必須全綠，並逐條核對該任務的「完成條件」。
- 規格沒寫清楚的地方，選最不會讓使用者算錯錢的做法，記在 story 檔的「決策紀錄」段落，不要停下來問。
- 不要做範圍外的功能：雲端同步、真的收費、備份還原（T9）、手續費設定、Phase 3。
```

---

## 1. 現況與目標

| | 現在（iteration-1） | MVP 完成後 |
|---|---|---|
| 資料單位 | 一筆「代號 + 買入價 + 數量」（`SavedHolding`） | 一筆一筆的**交易**（買、賣）與**股利** |
| 持股 | 使用者輸入 | 由交易**重算**出來 |
| 首頁 | `CalculateScreen`：輸入 → 按計算 → 看結果 | 總覽：整體、核心（ETF）、衛星（個股）三組數字 |
| 費用 | 不算手續費與稅 | 手續費、證交稅都算，可手動覆寫 |
| 股票清單 | 證交所上市 | 上市 + 上櫃，並標示個股／ETF（已完成） |
| 儲存 | AsyncStorage `cspo.holdings.v1` | 新的 ledger 結構，舊資料自動搬移 |

**保留不動的部分**：`StockPicker`、`theme.ts`、設計系統、證交所來源、截圖辨識的 server 端（`src/server/`、`recognize+api.ts`）。

---

## 2. 開發順序

每個任務 = 一張 story = 一個 PR。**由上往下做；時間不夠時，從表格最下面開始砍。**
Story 016 已由 Google 登入使用，Phase 2 任務從 017 開始編號。

| 順序 | 任務 | Story | 內容 | 對應規格 | 相依 |
|---|---|---|---|---|---|
| 1 | T1 ✅ | 006 | 計算引擎（純 domain，無畫面）**已完成** | 第 3 章 | — |
| 1 | T2 ✅ | 007 | 證券類型與上櫃股票 **已完成** | M-01 | — |
| 1 | T3 ✅ | 008 | 新儲存層與舊資料搬移 **已完成** | M-07 | T1 |
| 1 | T4 | 009 | 新增／編輯／刪除交易畫面 | M-01、M-02 | T1–T3 |
| 1 | T5 | 010 | 持股明細、單一持股頁、核心／衛星切換 | M-04、M-06 | T4 |
| 1 | T6 | 011 | 首頁總覽，取代 CalculateScreen | M-05 | T5 |
| 1 | T8 | 013 | 免責聲明（**只做 M-10**，手續費設定不做） | M-10 | T6 |
| 2 | T10 | 015 | 截圖匯入改成產生交易 | P2-06 | T4、T6 |
| 3 | T11 | 017 | 年化報酬率（XIRR） | P2-04 | T1 |
| 3 | T12 | 018 | 個股 vs ETF 對決 A：核心 vs 衛星 | P2-05 A | T6、T11 |
| 3 | T13 | 019 | 配置圓餅圖 | P2-07 配置圖 | T6 |
| 4 | T14 | 020 | Free／Pro 鎖定畫面（只做畫面） | P2-08 | T12 |
| 5 | T15 | 021 | 歷史價格、還原股價、除權息資料來源 | 第 5 章 | — |
| 6 | T16 | 022 | 個股 vs ETF 對決 B：如果改買 0050 | P2-05 B | T12、T15 |
| 7 | T17 | 023 | 資產走勢圖 | P2-07 走勢圖 | T6、T15 |
| 8 | T7 | 012 | 股利：手動記錄 + 自動帶入 | M-03、P2-03 | T5、T15 |
| 9 | T18 | 024 | 定期定額自動記帳 | P2-02 | T4、T15 |
| — | — | 016 | Google 登入（已開發，維持功能開關） | P2-01a | — |
| ✕ | T9 | 014 | 備份、還原、匯出 CSV | M-08 | **這次不做** |

**可以並行的部分**
- T1 和 T2 互不相依。
- **T15 不依賴任何任務，建議盡早開一條線先試打 API。** 順序 6～9 全部依賴它，它卡住就全部做不了。

---

## 3. 各任務細節

### T1｜計算引擎（Story 006）✅ 已完成

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

### T2｜證券類型與上櫃股票（Story 007）✅ 已完成

**目標**：每檔股票知道自己是個股還是 ETF，股票清單涵蓋上市與上櫃。

- `StockInfo` 加上 `type: "stock" | "etf"` 與 `market`。
- ETF 判斷規則：**代號以 `00` 開頭即為 ETF**（PO 已確認接受）。
- 上市與上櫃合併成同一個來源，任一邊失敗另一邊仍可用。

**完成條件**
- [x] 搜尋得到上櫃股票，選擇器上顯示「個股」或「ETF」標籤
- [x] `0050`、`00878` 為 ETF，`2330` 為個股
- [x] 上櫃來源失敗時，上市股票仍可搜尋與取價

---

### T3｜新儲存層與舊資料搬移（Story 008）✅ 已完成

**目標**：用一份 `Ledger` 存全部資料，並把舊版持股搬過來。

**新增**
- `src/data/LedgerStore.ts` 介面：`load(): Promise<Ledger>`、`save(ledger): Promise<void>`、`clear()`。
- `asyncStorageLedgerStore.ts`（key：`cspo.ledger.v1`）、`memoryLedgerStore.ts`（測試用）。
- `Ledger` 結構：`{ schemaVersion: 1, transactions, dividends, holdingSettings, settings }`。
- `src/domain/migrateSavedHoldings.ts`：純函式，`SavedHolding[]` → `Transaction[]`。

**搬移規則**（product-spec 1.5）
- 啟動時：若 `cspo.ledger.v1` 不存在、而 `cspo.holdings.v1` 存在，就執行搬移。
- 每筆合法的舊持股轉成一筆買入交易：日期用舊資料的買入日期，沒填或認不出來才用搬移當天（PO 已確認，見 Story 008 決策 1）、手續費依 3.2 計算、`note` 為「由舊版資料轉入」。
- 無法通過驗證的舊資料略過，不要讓整個搬移失敗。
- **先寫入新資料並讀回確認成功，才刪除舊 key。**

**完成條件**
- [x] 舊版存了 2 檔持股的使用者，升級後看到 2 筆買入交易
- [x] 搬移中途失敗（模擬 `setItem` 丟錯）時，舊資料仍在
- [x] 資料損壞時 `load()` 回傳空 ledger，不讓 App 崩潰

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

### T7｜股利：手動記錄 + 自動帶入（Story 012）

**目標**：M-03 與 P2-03。兩者共用同一個 `Dividend` 資料結構，所以一起做。**依賴 T15 的除權息資料。**

**手動記錄（M-03）**
- 路由：`src/app/dividend/new.tsx`、`src/app/dividend/[id].tsx`；入口在單一持股頁。
- 現金股利填實際入帳金額；股票股利填配發股數。
- 刪除股票股利前用 `validateLedgerChange` 檢查。

**自動帶入（P2-03）**
- 計算邏輯放 `src/domain/autoDividends.ts`（純函式）：輸入交易紀錄與除權息事件，輸出應建立的股利紀錄。
- 參與股數 = 除權息日**前一個交易日**收盤時的持股。
- 新建立的紀錄 `status = "estimated"`、`source = "auto"`；過了發放日改為 `received`。
- `estimated` 不計入總報酬，只在畫面顯示「預估即將入帳」。
- 使用者改過金額後，該筆不再自動更新。同證券、同除權息日已有手動紀錄時，不自動新增。
- App 開啟時執行一次。

**完成條件**
- [ ] product-spec M-03 的 2 條 AC、P2-03 的 3 條 AC 都有單元測試
- [ ] `estimated` 股利不影響總報酬（單元測試）

---

### T8｜免責聲明（Story 013）

**目標**：只做 M-10。**M-09 手續費設定這次不做**，手續費一律使用 product-spec 3.2 的預設值，個別交易仍可手動覆寫。

- 首次開啟顯示一次免責聲明（記在 ledger 或另一個 AsyncStorage key）。
- 「設定」分頁常駐免責聲明。這個分頁也是 Google 登入入口與 Pro Demo 開關（T14）的位置。

**完成條件**
- [ ] 第一次開啟 App 看到免責聲明，關掉後重開不再出現
- [ ] 設定分頁隨時看得到免責聲明

---

### T9｜備份、還原、匯出 CSV（Story 014）

> ✕ **Tech Day 不做。** 保留在這裡供之後參考。

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

### T11｜年化報酬率 XIRR（Story 017）

**目標**：P2-04。純計算，放 `src/domain/xirr.ts`。

- 現金流定義照 product-spec P2-04；`estimated` 股利不算。
- 牛頓法，不收斂改二分法，仍無解回傳 `null`（畫面顯示 `—`）。
- 第一筆現金流距今未滿 365 天，回傳「未滿一年」狀態，不回傳數字。
- 計算範圍：單一持股、核心、衛星、整體。
- 畫面：持股明細與首頁總覽各加一欄「年化報酬率」。

**完成條件**
- [ ] 一年前投入 100,000、今天價值 110,000 → 10.00%
- [ ] 持有 200 天顯示「持有未滿一年」
- [ ] 無解時顯示 `—`，不讓 App 崩潰

---

### T12｜個股 vs ETF 對決 A（Story 018）

**目標**：P2-05 的 A 部分：我的核心 vs 我的衛星。

- 路由：`src/app/(tabs)/versus.tsx`，分頁名稱「對決」。
- 並排顯示核心與衛星的總報酬、簡單報酬率、年化報酬率（T11）。
- 一句話結論，例如「你的個股年化 6.2%，ETF 年化 9.8%，個股落後 3.6%」。結論文字產生器放 `src/domain/`，單元測試。
- 任一邊沒有持股時，顯示「還沒有 ETF（或個股）紀錄」，不顯示結論。
- 結論只陳述事實，不得出現「建議」、「應該」、「買進」、「賣出」。

**完成條件**
- [ ] 結論文字的單元測試涵蓋：個股領先、ETF 領先、持平、一邊沒資料、未滿一年
- [ ] 結論文字不含禁用字眼（單元測試掃描）

---

### T13｜配置圓餅圖（Story 019）

**目標**：P2-07 的配置圖。

- 首頁總覽加一張圓餅圖：核心 vs 衛星的市值比例；點開可看每檔持股占比。
- 圖表套件**先確認支援 Expo Go 與網頁版**，用 `npx expo install` 安裝。若找不到合適的套件，用 `react-native-svg` 自己畫。
- 比例計算放 `src/domain/`；沒有價格的持股不計入，並提示。

**完成條件**
- [ ] 比例加總為 100%（單元測試）
- [ ] 只有一種類型時，圓餅圖顯示單一色塊，不出錯

---

### T14｜Free／Pro 鎖定畫面（Story 020）

**目標**：P2-08，**只做畫面，不串金流**。

- 需要 Pro 的功能：對決 B（T16）、資產走勢（T17）、股利自動帶入（T7）、年化報酬率（T11）、定期定額（T18）。
- 被鎖住時顯示功能預覽與「升級 Pro」按鈕，按下顯示「Pro 方案即將推出」，不進入任何付款流程。
- 設定分頁底部加「Demo：解鎖所有 Pro 功能」開關，開啟後全部解鎖，方便展示。
- 是否為 Pro 由一個函式 `isPro()` 決定，所有功能都透過它判斷，之後串金流只要改這一處。

**完成條件**
- [ ] 預設狀態下，上述功能顯示鎖定畫面
- [ ] 打開 Demo 開關後全部解鎖，重開 App 仍維持

---

### T15｜歷史價格與除權息資料來源（Story 021）

**目標**：讓 T16、T17、T7 自動帶入、T18 有資料可用。**這是關鍵路徑，建議盡早開一條線先做。**

**新增介面**（`src/data/`）
| 介面 | 方法 | 用途 |
|---|---|---|
| `HistoricalPriceSource` | `getDailyCloses(symbol, from, to)` → `{ date, close, adjClose }[]` | 對決 B、走勢圖、定期定額 |
| `DividendEventSource` | `getEvents(symbol, from, to)` → 除權息日、發放日、每股現金股利、每股股票股利 | 股利自動帶入 |

**實作注意**
- 候選來源：FinMind API（同時提供歷史價、還原股價、股利）。**動手前先實際打 API**，確認欄位、免費額度、呼叫次數限制與授權條款，把真實回應存成測試 fixture。
- 若需要 API token，比照截圖辨識的做法放在 server 端（`src/app/*+api.ts`），不要打包進 App。
- 結果要快取在本機（AsyncStorage），同一段歷史資料不重複抓。
- 同樣要提供假來源給測試使用。
- 若資料來源無法使用（額度不足、授權不允許），**立刻回報 PO**，因為順序 6～9 都要重新評估。

**完成條件**
- [ ] 可取得 0050 近 3 年的還原收盤價
- [ ] 可取得 0056 近 3 年的除權息事件
- [ ] 斷網時使用快取，沒有快取則顯示錯誤，不讓 App 崩潰

---

### T16｜個股 vs ETF 對決 B：如果改買 0050（Story 022）

**目標**：P2-05 的 B 部分。

- 模擬邏輯放 `src/domain/benchmark.ts`，規則照 product-spec P2-05 B（同日、同金額、用還原收盤價、可為小數單位、忽略交易成本）。
- 在「對決」分頁 A 部分下方顯示：「若改買 0050，現在價值 X 元，比你實際多（或少）Y 元」，並註明「模擬忽略交易成本」。
- 基準可選 0050（預設）、006208。期間篩選：全部、今年、近 1 年、近 3 年。
- 某一天沒有基準價格（例如非交易日）時，用前一個交易日的價格。

**完成條件**
- [ ] 某日投入 100,000，該日 0050 還原價 100、今天 120 → 模擬價值 120,000
- [ ] 有賣出的情境、有非交易日的情境，都有單元測試

---

### T17｜資產走勢圖（Story 023）

**目標**：P2-07 的走勢圖。

- 依交易紀錄與歷史收盤價，逐日重建「總市值」與「累計投入」兩條線，邏輯放 `src/domain/`。
- 範圍：近 1 個月、近 1 年、全部。
- 圖表套件沿用 T13 的選擇。

**完成條件**
- [ ] 走勢最後一天的值等於首頁總市值
- [ ] 中間有賣出、有非交易日時計算正確（單元測試）

---

### T18｜定期定額自動記帳（Story 024）

**目標**：P2-02。

- 規則的新增、編輯、停用畫面：`src/app/dca/` 下。規則存在 ledger。
- 產生邏輯放 `src/domain/dca.ts`，照 product-spec P2-02：非交易日順延、股數公式、補產生、去重、刪除後不補回。
- App 開啟時執行一次；收盤價還沒有時先跳過。
- 產生的交易 `source = "dca"`，列表上顯示「定期定額」標記。

**完成條件**
- [ ] product-spec P2-02 的 4 條 AC 都有單元測試
- [ ] 範例：每期 5,000 元、0050 成交價 180 → 27 股、手續費 6

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

- 不要做 Tech Day 範圍外的功能，就算很順手：雲端同步、真的收費、備份還原、手續費設定、Phase 3。
- 不要在 `src/app/` 放邏輯或測試檔（expo-router 會把它當成頁面打包）。
- 不要在畫面裡寫死色碼與間距，一律用 `src/ui/theme.ts`。
- 不要憑記憶寫 Expo API，先查 SDK 58 文件（AGENTS.md 的規定）。
- 不要讓測試打真的證交所或歷史資料 API，一律用假來源。
- 不要給任何買賣建議的文字。

---

## 6. 遇到問題時

| 狀況 | 做法 |
|---|---|
| 規格沒寫到 | 選最不會讓使用者算錯錢的做法，記在 story 的決策紀錄 |
| 規格與現有程式衝突 | 以 product-spec 為準，在 PR 說明中列出 |
| 規格本身看起來算錯 | 停下來，在 PR 或 Issue 標記 PO 確認，不要自行改公式 |
| Expo 模組在 Expo Go 不能跑 | 記錄在 story，和 PO 討論是否改做法或改用 development build |
