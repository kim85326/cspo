# 專案上下文交接（給 AI agent 或新加入的人）

最後更新：2026-10-27。這份文件的目的是讓一個沒有任何背景的 AI agent 或新同事，讀完就能接手這個專案繼續做。細節請再讀 `docs/` 下的其他檔案。

---

## 1. 這是什麼

- **活動**：公司 Tech Day 的小組作業，老師出題「做一個投資 app」。
- **小組定義的核心問題**：「你買的股票賺了還是虧了？」
- **輸入**：股票（代號或公司名稱）+ 買入價 + 數量（股）
- **輸出**：盈虧金額、報酬率、賺了／虧了
- **平台**：iOS 與 Android 雙平台，一份程式碼。
- **節奏**：2～3 個迭代。目前第一迭代的骨架已完成並 commit。

## 2. 團隊

| 角色 | 人數 | 背景 | 負責 |
|---|---|---|---|
| 工程 | 1（Elaine） | 會 Vue / Nuxt / Node / .NET，第一次寫手機 app，大量靠 AI 協作 | 實作、自動化測試、發版 |
| PO | 3 | 非工程 | 決定做什麼、寫 story 與驗收條件 |
| 測試 | 數位 | 非工程，手動測試 | 手機驗收、回報 bug |

協作方式：PO 用 Given / When / Then 寫驗收條件在 `docs/stories/`，工程把每條 AC 翻成單元測試、畫面測試與 Maestro 流程，測試同學用 Expo Go 在手機驗收。共同語言在 `docs/glossary.md`。

## 3. 技術棧與理由

| 項目 | 選擇 | 理由 |
|---|---|---|
| 框架 | Expo SDK 58（React Native 0.88）+ TypeScript | 一份程式碼出雙平台；Expo Go 讓測試同學免簽章就能在手機上跑 |
| 導覽 | expo-router（檔案即路由） | 跟 Nuxt pages 同概念，工程好上手 |
| 狀態 | React useState（第一迭代）；第二迭代預計 Zustand + AsyncStorage | 第一迭代不需要持久化 |
| 單元／畫面測試 | Jest（jest-expo）+ React Native Testing Library 14 | Expo 官方組合 |
| 手機端 E2E | Maestro（YAML） | 非工程背景也看得懂，幾乎是 AC 直譯 |
| CI | GitHub Actions：typecheck + lint + test | |
| 套件管理 | npm | Expo 文件預設 |
| 設計系統 | ui-ux-pro-max skill 產生，存在 `design-system/stock-pnl/MASTER.md` | Minimalism & Swiss、深藍主色、金色 CTA、IBM Plex Sans |
| 打包 | EAS Build（`eas.json` 的 preview profile 出 Android APK） | 不需要本機 Xcode / Android Studio |

為什麼不用 Vue + Capacitor：包成 app 要自己簽章才能裝到測試同學手機，iOS 還要先有 Apple 開發者帳號；Expo Go 省掉這段。

## 4. 專案結構

```
cspo/
├── src/
│   ├── app/            路由（expo-router）。只放轉出，不放邏輯與測試
│   │   ├── _layout.tsx 載入 IBM Plex Sans 字型、Stack 導覽、ProStatusProvider、首次開啟的免責聲明（DisclaimerGate）、首頁右上「設定」
│   │   ├── index.tsx   → screens/CalculateScreen
│   │   ├── settings.tsx → screens/SettingsScreen（免責聲明；Pro 區塊與 Demo 開關由 features.proPlan 控制）
│   │   ├── pro.tsx     → screens/ProScreen（Pro 方案介紹，features.proPlan 關閉時導回首頁）
│   │   ├── twse+api.ts 網頁版同源代理 GET /twse → 證交所（沒開 CORS）
│   │   ├── tpex+api.ts 網頁版同源代理 GET /tpex → 櫃買中心（沒開 CORS）
│   │   └── recognize+api.ts 截圖辨識 API route（Story 005）
│   ├── screens/        畫面本體與畫面測試
│   │   ├── CalculateScreen.tsx
│   │   ├── SettingsScreen.tsx  設定頁（Story 013、020）
│   │   ├── ProScreen.tsx       Pro 方案介紹頁（Story 020）
│   │   └── *.test.tsx
│   ├── config/features.ts 功能開關：screenshotImport、proPlan（預設關閉，EXPO_PUBLIC_FEATURE_*=1 打開）
│   ├── hooks/          useProStatus（Pro 狀態 Provider）、useDisclaimerConsent、usePersistedHoldings、useLedger（畫面讀寫記帳本，Story 008）等
│   ├── domain/         純 TypeScript，不碰 UI 與網路，單元測試主戰場
│   │   ├── types.ts        Holding、Quote、PnlResult、StockInfo（含 type 個股／ETF、market 上市／上櫃）、SecurityType、Market
│   │   ├── security.ts     securityTypeOf（代號 00 開頭 = ETF）、SECURITY_TYPE_LABEL、toStockInfo
│   │   ├── pnl.ts          calculatePnl、formatSignedAmount、formatReturnRate、validateHoldingInput
│   │   ├── stockSearch.ts  searchStocks（最多 MAX_SEARCH_RESULTS = 20 筆）、resolveStock、normalizeQuery、formatStockLabel
│   │   ├── compare.ts      compareHoldings（多檔依報酬率排名 + 合計）、MAX_COMPARE_HOLDINGS = 5
│   │   ├── ledgerTypes.ts  記帳本型別：Transaction、Dividend、HoldingSetting、UserSettings、Ledger、SecurityType、Bucket（Story 006）
│   │   ├── fees.ts         floorMoney、calcFee、calcTax、defaultTaxRate、estimateTrade、DEFAULT_USER_SETTINGS
│   │   ├── position.ts     computePosition（依日期重播 → 持股、平均成本、已實現、未實現、股利、總報酬、持有天數）、replaySymbol
│   │   ├── portfolio.ts    summarize（整體、核心、衛星三組加總）、bucketOf、defaultBucket
│   │   ├── xirr.ts         xirr（牛頓法，不收斂改二分法）、positionCashFlows、positionAnnualizedReturn、portfolioAnnualizedReturns（P2-04，Story 025）
│   │   ├── allocation.ts   computeAllocation（核心／衛星、個股／ETF、每檔市值占比）、toDisplayPercents（P2-07 配置圖，Story 025）
│   │   ├── migrateSavedHoldings.ts 舊版持股 → 買入交易（migrateSavedHoldings）、emptyLedger、首頁過渡轉接用的 savedHoldingsFromLedger／replaceSavedHoldings（Story 008）
│   │   ├── ledgerValidation.ts validateLedgerChange（新增／修改／刪除後重播，賣超就拒絕並說是哪一筆）、validateLedger、欄位檢查
│   │   ├── plan.ts         PRO_FEATURES（Pro 功能清單）、isPro（是不是 Pro 只問它，Story 020）
│   │   ├── ledgerTestData.ts   測試共用資料（product-spec 3.7 範例、makeTx、makeDividend），只給 *.test.ts 用
│   │   ├── versionInfo.ts  describeVersion：版本原始值 → 底部那行小字與詳細資訊（Story 018）
│   │   └── *.test.ts
│   ├── data/           對外資料來源
│   │   ├── PriceSource.ts      介面：getQuote(symbol) → Quote | null
│   │   ├── StockDirectory.ts   介面：getAll() → StockInfo[]
│   │   ├── stocks.ts           固定 40 檔上市 + 5 檔上櫃股票／ETF 與假現價（測試用；也是熱門清單順序）
│   │   ├── fakePriceSource.ts / fakeStockDirectory.ts
│   │   ├── twseEndpoint.ts     手機直接打證交所；網頁版走 /twse 代理（src/app/twse+api.ts），因為證交所沒開 CORS
│   │   ├── twseParse.ts        證交所回應 → Quote[]（純函式）
│   │   ├── twseSource.ts       證交所（上市）來源，createDailyQuoteSource 的薄包裝
│   │   ├── tpexEndpoint.ts     櫃買中心 tpex_mainboard_quotes；網頁版走 /tpex 代理（src/app/tpex+api.ts）
│   │   ├── tpexParse.ts        櫃買中心回應 → Quote[]（欄位 SecuritiesCompanyCode、CompanyName、Close、Date）
│   │   ├── tpexSource.ts       櫃買中心（上櫃）來源，createDailyQuoteSource 的薄包裝
│   │   ├── dailyQuoteSource.ts 上市上櫃共用：一次拿全市場收盤價、5 分鐘快取、失敗沿用舊快取、PriceSource + StockDirectory
│   │   ├── directoryOrder.ts   orderForDirectory：熱門清單在前、其餘依代號、重複代號留第一筆
│   │   ├── marketSource.ts     把上市 + 上櫃合成一個來源；一邊失敗另一邊照用，兩邊都失敗才丟 PriceLoadError
│   │   ├── LedgerStore.ts      介面：記帳本整份 load／save／clear（Story 008）
│   │   ├── asyncStorageLedgerStore.ts  AsyncStorage `cspo.ledger.v1`；第一次讀寫時自動把舊版 `cspo.holdings.v1` 搬過來（migrateLegacyHoldings），壞掉回空記帳本並備份原文
│   │   ├── memoryLedgerStore.ts        測試用記憶體版
│   │   ├── ledgerRepository.ts         畫面讀寫記帳本的入口：訂閱、新增／修改／刪除交易與股利（先驗證再存）、setBucket、updateSettings；createMemoryLedgerRepository 給測試與畫面開發
│   │   ├── ledgerHoldingStore.ts       過渡轉接：讓 CalculateScreen 用 HoldingStore 介面讀寫記帳本，T6 後刪除
│   │   ├── asyncStorageHoldingStore.ts 舊版 `cspo.holdings.v1`，現在只用來讀舊資料搬移
│   │   ├── appPrefs.ts         本機是非設定：免責聲明已同意、Pro Demo 開關（AsyncStorage）
│   │   ├── __fixtures__/       真實 API 回應（裁剪過），測試用：tpexMainboardQuotes.json
│   │   ├── appVersionSource.ts 讀 expo-application／expo-constants／expo-updates 的版本原始值（Story 018）
│   │   └── index.ts            Jest 或 EXPO_PUBLIC_USE_FAKE_PRICES=1 用假來源，否則 marketSource（證交所 + 櫃買中心）
│   └── ui/             可重用元件與設計 token
│       ├── theme.ts        colors / space / radius / fonts / fontSize / touchTarget / pnlColors
│       ├── StockPicker.tsx 股票選擇器（打代號、打名稱、從清單選；每列有「個股／ETF」標籤，最多 20 筆）
│       ├── LabeledInput.tsx
│       ├── HoldingForm.tsx 一檔的輸入區塊（StockPicker + 買入價 + 數量 + 移除鈕）
│       ├── PnlCard.tsx     單檔結果卡
│       ├── ComparisonCard.tsx 多檔比較結果（排名、表現最好／最差、合計）
│       └── VersionBadge.tsx 畫面最底部的版本資訊，點開看詳細、可複製（Story 018）
│       ├── DisclaimerGate.tsx 首次開啟的免責聲明 Modal；DISCLAIMER_TEXT（M-10 原文）
│       ├── SettingsHeaderButton.tsx 首頁右上「設定」
│       └── ProLockedCard.tsx  ProLockedCard（鎖定的 Pro 功能預覽）、ProGate（Pro 才顯示內容）、ProBadge
├── e2e/                Maestro 流程（001-profit、001-loss、002-pick-by-name、003-compare-two）
├── docs/
│   ├── architecture.md 架構、分工、迭代規劃（最完整的設計文件）
│   ├── glossary.md     共同語言與顯示慣例
│   ├── stories/        001 單筆盈虧、002 股票選擇器、003 多檔比較、004 存持股、005 截圖匯入、006 計算引擎、007 證券類型與上櫃、013 免責聲明、016 K 線圖、017 AI 解讀、018 版本資訊、019 歷史資料來源、020 Free／Pro 鎖定畫面、025 年化報酬率與資產配置（Gherkin AC + 對應測試表 + 決策紀錄）
│   ├── test-plan.md    手動測試清單、bug 回報格式
│   └── context-for-ai.md 本檔
├── design-system/stock-pnl/MASTER.md
├── eas.json
└── .github/workflows/ci.yml
```

## 5. 關鍵設計規則

1. **算錢的邏輯全部放在 `src/domain/`**，不依賴 UI 或網路，所有金額情境用單元測試跑完。
2. **畫面不寫死色碼與間距**，一律從 `src/ui/theme.ts` 拿。
3. **台股慣例漲紅跌綠**（跟美股相反），且不靠顏色單獨傳達：另有「賺了／虧了」文字與 ▲▼ 符號。
4. **自動化測試用固定假價**（`src/data/stocks.ts`），結果可重現；app 跑起來接證交所（上市）+ 櫃買中心（上櫃）收盤價。測試一律不打真的 API，要真實回應就存成 `src/data/__fixtures__/` 的 fixture。`src/data/index.ts` 依 `JEST_WORKER_ID` / `EXPO_PUBLIC_USE_FAKE_PRICES` 切換，切法見 `docs/architecture.md` 第 7 節。
5. **測試檔不能放在 `src/app/`**，expo-router 會把那裡的每個檔案當成一頁打包。
6. 畫面裡所有可互動元件都有中文 `accessibilityLabel`，Maestro 與螢幕閱讀器都靠它找元件。

## 6. 目前狀態（2026-10-27）

### 已完成
- Story 001：輸入一筆持股 → 盈虧。五個情境全部有測試。
- Story 002：股票選擇器。打代號、打完整名稱、打部分名稱後從清單點選、空白時列熱門股票、多檔符合提示從清單選、✕ 清除、全形數字。
- 設計系統套用完成。
- 45 個測試（domain 36 + 畫面 9）、TypeScript、ESLint 全綠。
- 網頁版在 375px 寬實測過；iPhone 透過 Expo Go tunnel 載入成功。
- 第一個 commit 在 `iteration-1` 分支。

### 進行中 / 待辦
- **Android APK**：`eas.json` 已備好，`eas build -p android --profile preview` 第一次執行會在 Expo 帳號建專案並產生簽章金鑰（Elaine 正在跑或準備跑）。
- **第二迭代候選**（由 PO 決定優先順序）：
  - ~~接證交所真實資料~~：已完成（`src/data/twseSource.ts`）。回應欄位 `Date`（民國年 1151022）、`Code`、`Name`、`ClosingPrice`（字串，無成交時是空字串），約 1,380 列；無成交的列會被濾掉。`Quote.asOf` 帶資料日期，結果卡顯示「收盤價 2026/10/22」；斷網顯示「行情載入失敗，請檢查網路後重試」，再按「計算」會重試。
  - ~~上櫃股票與個股／ETF 標籤~~（Story 007 已完成：櫃買中心 `tpex_mainboard_quotes`，欄位 `Date`、`SecuritiesCompanyCode`、`CompanyName`、`Close`（無成交是 `----`），約 1,000 列；代號 00 開頭 = ETF）
  - ~~多檔一起比~~（Story 003 已完成：最多 5 檔、依報酬率排名、合計）
  - ~~持股存手機~~（Story 004 已完成：AsyncStorage，存幾檔帶回幾檔，一鍵清除）
  - ~~新儲存層與舊資料搬移~~（Story 008 已完成：記帳本存 `cspo.ledger.v1`，舊版持股第一次開 App 自動轉成買入交易；首頁經過渡轉接照常使用。舊資料有買入日期就用那天，沒有才用搬移當天，PO 已確認）
  - ~~從券商截圖匯入持股~~（Story 005：expo-image-picker + Expo Router API route `/recognize` + Claude vision；API key 放 `.env`，見 architecture.md 第 7 節）
  - ~~K 線圖與買入點~~（Story 016：證交所 STOCK_DAY 日 K，近 3～6 個月；`react-native-svg` 自繪；選填「買入日期」標 ▲；網頁版走 `/twse-day` 代理）
  - 免責聲明（Story 013：首次開啟要按同意，設定頁常駐；首頁右上新增「設定」入口）
  - Free／Pro 鎖定畫面（Story 020：只做畫面，不串金流；`features.proPlan` 預設關閉；Demo 開關在設定頁底部）
  - 手續費 0.1425%（最低 20 元）與交易稅 0.3%
  - 年化報酬率（XIRR）與資產配置的計算（Story 025，`src/domain/xirr.ts`、`allocation.ts`）已完成，畫面（首頁年化報酬率、配置圓餅圖）還沒接
- **第三迭代候選**：報酬率圖、到價提醒、商店截圖與隱私權政策。

### Code review 留下的 Minor（未處理，不影響正確性）
- `resolveStock` 在候選剛好一檔時自動命中，對代號類查詢可能靜默猜錯（例如打「12」只剩 1216）。建議代號只接受完全相同。
- `CalculateScreen.validateOne` 用假代號 `"0000"` 借用整組驗證函式，應改成 domain 提供逐欄驗證。
- 測試命名是中文情境描述，不符公司 convention 的 `it('{expect} when {scenario}')`。Tech Day 專案可自訂，但要決定。

## 7. 怎麼跑

```bash
cd cspo
npm install
npm start -- --tunnel     # 開 dev server；tunnel 模式不需要同一個 Wi-Fi
npm test                  # Jest
npm run typecheck
npm run lint
npm run check             # 以上三個一起
npm run e2e               # Maestro（需先裝 maestro 並開模擬器）
eas build -p android --profile preview   # 雲端打 APK
```

測試同學：手機裝 Expo Go，掃終端機的 QR code。

## 8. 環境與帳號（Elaine 的 Mac）

- macOS 15.7，Apple Silicon。已裝：Node 24（pnpm 管理）、npm、Bun、Homebrew、Watchman、CocoaPods、OpenJDK 17、Android Studio（尚未跑第一次設定精靈，SDK 未下載）、eas-cli 26（用 pnpm 全域裝）。
- **Xcode 未安裝**，iOS 模擬器不能用；用真機 + Expo Go。
- `~/.zshrc` 還沒加 JAVA_HOME / ANDROID_HOME（安全檢查擋住自動寫入，需手動貼）：
  ```
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
  ```
- **公司 Wi-Fi 有裝置隔離**：手機連不到電腦的 Metro（區網 IP），一律用 `--tunnel`。Mac 防火牆是關的，不是防火牆問題。
- Expo CLI 已登入（個人免費帳號）。
- Apple Developer 與 Google Play Console 帳號都還沒辦，打算用個人名義；這次活動只需要 Expo 帳號。上架是之後的事。
- 公司的 twsp-dev plugin 有 commit 前強制 code-review 的 hook，Elaine 已手動清掉；plugin 更新後會回來。

## 9. 踩過的坑（別再踩）

- Expo SDK 58 的 API 跟舊版差很多，專案裡的 `AGENTS.md` 要求先查對應版本文件再寫 code。
- React Native Testing Library 14 的 `render` 與 `fireEvent` 都是非同步，要 `await`。
- 畫面用了 `useSafeAreaInsets`，測試要包 `SafeAreaProvider` 並給 `initialMetrics`。
- 網頁版 blur 先於 click 觸發，StockPicker 用 150ms 延遲收清單來避開。
- npm 全域安裝的 bin 不在 PATH（node 是 pnpm 管的），全域工具改用 `pnpm add -g`。
- `create-expo-app` 需要空資料夾，`docs/` 要先搬開再搬回。

## 10. 上架前要注意（之後的事）

- 兩家商店都要寫明「僅供參考，非投資建議」（app 內已有這行）。
- 不做真實下單：Apple 要求交易類 app 由持牌金融機構提交，個人名義會被退。
- Google Play 個人帳號正式上架前要 12 位測試者連續 14 天的封閉測試。
- Apple 年費 99 美元，Google 一次性 25 美元。
