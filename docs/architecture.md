# 股票盈虧 App：架構與協作設計

> 核心問題：你買的股票賺了還是虧了？
> 輸入：股票代號 + 買入價 + 數量 → 輸出：盈虧數字

## 1. 團隊與節奏

| 角色 | 人數 | 負責 | 主要工作的地方 |
|---|---|---|---|
| 工程 | 1 | 實作、自動化測試、發版給測試 | `src/`、`e2e/` |
| PO | 3 | 決定做什麼、寫 story 與驗收條件、維護名詞表 | `docs/stories/`、`docs/glossary.md` |
| 測試 | 若干 | 寫手動測試清單、在手機上驗收、回報 bug | `docs/test-plan.md`、GitHub Issues |

迭代 2～3 次。每個迭代的固定流程：

1. PO 挑 story，和工程一起把驗收條件寫成 Given / When / Then（見第 5 節）。
2. 工程實作，同時把驗收條件變成單元測試與 Maestro 自動流程。
3. 工程發版，測試同學用 Expo Go 掃 QR code 在自己手機上驗。
4. Bug 開 Issue，PO 決定這個迭代修還是下個迭代修。

## 2. 技術選型（一句話版）

- **Expo（React Native）+ TypeScript**：一份程式碼同時出 iOS 與 Android。
- **Expo Go**：測試同學手機裝這個 app，掃 QR code 就能跑最新版，不用任何開發者帳號。
- **expo-router**：一個檔案一個畫面，PO 看 `src/app/` 的檔名就知道有哪些頁。
- **Zustand + AsyncStorage**（第二迭代）：持股資料存手機本機，不需要後端。
- **Jest（jest-expo）+ React Native Testing Library**：單元測試與畫面測試。
- **Maestro**：手機端自動化測試，流程用 YAML 寫，非工程背景也看得懂。
- **GitHub Actions**：每次 push 自動跑 typecheck、lint、單元測試。

為什麼不用 Vue：Vue 包成 app（Capacitor）要在 Xcode / Android Studio 自己簽章才能裝到測試同學手機上，iOS 還得先有 Apple 開發者帳號。Expo Go 把這段整個省掉，對這次的時程最划算。React 的部分有 Claude Code 協助，上手成本可控。

## 3. 專案結構

```
cspo/
├── src/
│   ├── app/                  路由（expo-router，一檔一頁；只放轉出，不放邏輯與測試）
│   │   ├── _layout.tsx       導覽外框
│   │   ├── index.tsx         → screens/CalculateScreen
│   │   ├── twse+api.ts       API route：網頁版的證交所代理（GET /twse），手機不經過
│   │   ├── tpex+api.ts       API route：網頁版的櫃買中心代理（GET /tpex），手機不經過
│   │   └── recognize+api.ts  API route：手機把截圖 POST 來，server 端呼叫 Claude（只在 dev server／部署的 server 跑）
│   ├── screens/              畫面本體與畫面測試
│   │   ├── CalculateScreen.tsx       輸入一檔或多檔持股 → 看盈虧／比較
│   │   └── CalculateScreen.test.tsx  React Native Testing Library
│   ├── domain/               純 TypeScript，不碰 UI、不碰網路 → 單元測試主戰場
│   │   ├── types.ts          Holding、Quote、PnlResult
│   │   ├── pnl.ts            盈虧計算、格式化、輸入驗證
│   │   ├── pnl.test.ts
│   │   ├── stockSearch.ts    代號／名稱搜尋與解析
│   │   ├── stockSearch.test.ts
│   │   ├── compare.ts        多檔比較：依報酬率排名 + 合計
│   │   ├── compare.test.ts
│   │   ├── holdingExtract.ts 截圖匯入：辨識結果對到股票清單、張→股、合併重複、套進欄位（applyExtraction）
│   │   └── holdingExtract.test.ts
│   ├── data/                 對外資料來源
│   │   ├── PriceSource.ts    介面：給代號回現價
│   │   ├── StockDirectory.ts 介面：有哪些股票可以選
│   │   ├── stocks.ts         固定 40 檔（代號、名稱、假價）：測試用，也是熱門清單的順序
│   │   ├── fakePriceSource.ts / fakeStockDirectory.ts  用 stocks.ts 實作的假來源
│   │   ├── HoldingStore.ts   介面：把輸入過的持股存在手機本機
│   │   ├── asyncStorageHoldingStore.ts / memoryHoldingStore.ts  AsyncStorage 實作 ／ 測試用記憶體版
│   │   ├── HoldingRecognizer.ts  介面：給截圖回辨識結果
│   │   ├── claudeHoldingRecognizer.ts / fakeHoldingRecognizer.ts  POST 到 /recognize ／ 測試用固定結果
│   │   ├── recognizeEndpoint.ts  用 expo-constants 的 hostUri 找到 dev server 的 /recognize
│   │   ├── twseEndpoint.ts   證交所網址；網頁版改走同源代理 /twse（證交所沒開 CORS）
│   │   ├── twseParse.ts      證交所回應 → Quote[]（純函式，有單元測試）
│   │   ├── twseSource.ts     證交所（上市）來源
│   │   ├── tpexEndpoint.ts / tpexParse.ts / tpexSource.ts  櫃買中心（上櫃）：網址與 /tpex 代理、回應 → Quote[]、來源
│   │   ├── dailyQuoteSource.ts  上市上櫃共用：抓全市場、5 分鐘快取，同時是 PriceSource 與 StockDirectory
│   │   ├── directoryOrder.ts 清單排序：熱門在前、其餘依代號
│   │   ├── marketSource.ts   上市 + 上櫃合成一個來源，一邊失敗另一邊照用（Story 007）
│   │   ├── __fixtures__/     真實 API 回應（裁剪過），測試用
│   │   └── index.ts          依環境決定用假來源還是真的（Jest 一律用假的；EXPO_PUBLIC_USE_FAKE_PRICES／EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1 也可切）
│   ├── server/               只在 server 端跑的程式（API route 才會載入，不進手機 bundle）
│   │   └── recognizeHoldings.ts  Claude vision + JSON schema 的 prompt 與呼叫；API key 從 process.env 讀
│   ├── hooks/                畫面共用的 React hook（usePersistedHoldings：啟動時讀回、計算後存；useScreenshotImport：選圖／拍照 → 辨識）
│   └── ui/                   可重用元件與設計 token（StockPicker、LabeledInput、HoldingForm、ImportSourceSheet、PnlCard、ComparisonCard、theme）
├── design-system/stock-pnl/  ui-ux-pro-max 產生的設計系統（MASTER.md 是色彩、字型、間距的來源）
├── e2e/                      Maestro 流程（YAML）
├── docs/
│   ├── glossary.md           共同語言
│   ├── stories/              每張 story 一個檔，含驗收條件
│   └── test-plan.md          手動測試清單
└── .github/workflows/ci.yml
```

設計原則只有一條：**算錢的邏輯全部放在 `src/domain/`，不依賴任何 UI 或網路**。這樣單元測試可以把所有金額情境跑完，手機上只需要驗畫面與流程。

## 3b. 視覺設計

設計系統由 ui-ux-pro-max skill 產生，存在 `design-system/stock-pnl/MASTER.md`：

- 風格：Minimalism & Swiss。乾淨、留白、高對比，適合金融工具。
- 色彩：信任感深藍（主色）+ 金色 CTA；背景淺灰藍、卡片白。
- 字型：IBM Plex Sans（數字與英文），中文自動回退系統字型。
- 間距：4/8 節奏，token 在 `src/ui/theme.ts`。
- 盈虧顏色保留台股慣例（漲紅跌綠），且不靠顏色單獨傳達：另有「賺了／虧了」文字與 ▲▼ 符號。

規則：畫面裡不寫死色碼與間距，一律從 `src/ui/theme.ts` 拿；要改視覺就改 token。
新頁面若需要不同規則，在 `design-system/stock-pnl/pages/<頁名>.md` 加覆寫，不改 MASTER.md。

## 4. 共同語言（docs/glossary.md 的起點）

| 名詞 | 定義 | 程式裡的名字 |
|---|---|---|
| 股票代號 | 台股四碼數字，例如 2330 | `symbol` |
| 買入價 | 每股買進價格 | `buyPrice` |
| 數量 | 股數，1 張 = 1000 股；第一版以「股」為單位 | `shares` |
| 現價 | 最近一筆成交價或收盤價 | `currentPrice` |
| 持股 | 一筆「代號 + 買入價 + 數量」的紀錄 | `Holding` |
| 盈虧 | （現價 − 買入價）× 數量 | `pnl` |
| 報酬率 | 盈虧 ÷ 買入成本 | `returnRate` |

要不要算手續費（0.1425%）與交易稅（0.3%）由 PO 決定，建議放第二迭代。

## 5. 驗收條件怎麼寫

每張 story 一個檔，PO 寫情境，工程逐條對應到測試。範例 `docs/stories/001-single-holding-pnl.md`：

```gherkin
Story 001：輸入一筆持股，看到盈虧

Scenario: 賺錢
  Given 我輸入代號 2330、買入價 500、數量 1000
  And 2330 的現價是 520
  When 我按下「計算」
  Then 我看到盈虧 +20,000，顯示為紅色

Scenario: 虧錢
  Given 我輸入代號 2330、買入價 500、數量 1000
  And 2330 的現價是 480
  When 我按下「計算」
  Then 我看到盈虧 -20,000，顯示為綠色

Scenario: 代號不存在
  Given 我輸入代號 9999
  When 我按下「計算」
  Then 我看到提示「找不到這檔股票」
```

台股習慣漲紅跌綠，跟美股相反，這種細節就是要寫進 AC 裡的東西。

## 6. 自動化測試三層

| 層 | 工具 | 驗什麼 | 誰看得懂 |
|---|---|---|---|
| 單元 | Jest | `src/domain/` 的計算：正負、零、小數、極端值 | 工程 |
| 畫面 | React Native Testing Library | 在 Node 裡渲染畫面，照 AC 輸入與按鈕，驗文字 | 工程 |
| 手機流程 | Maestro | 照 AC 操作畫面：輸入 → 按鈕 → 看到數字 | 工程、PO、測試 |
| CI | GitHub Actions | 每次 push 跑 typecheck + lint + 單元測試 | 工程 |

Maestro 流程長這樣，幾乎就是 AC 的直譯：

```yaml
appId: host.exp.Exponent
---
- launchApp
- tapOn: "新增持股"
- tapOn: "股票代號"
- inputText: "2330"
- tapOn: "買入價"
- inputText: "500"
- tapOn: "數量"
- inputText: "1000"
- tapOn: "計算"
- assertVisible: "+20,000"
```

自動化跑的是 `fakePriceSource`（固定現價），所以結果可重現：`src/data/index.ts` 看到 Jest 的 `JEST_WORKER_ID` 就自動用假來源。真實行情（證交所）只有在手機或網頁上跑 app 時才接。歷史日 K 與除權息（`candleSource`、`corporateActionSource`，Story 019）也一樣：Jest 裡是 `fakeCandleSource`、`fakeCorporateActionSource`，不打網路。

手動測試同學專注在自動化不好做的事：不同手機尺寸、輸入法、斷網、中文顯示、操作順不順手。

## 7. 發版給測試同學

- **每天至少一次**：工程執行 `npx expo start --tunnel`，測試同學用 Expo Go 掃 QR code。tunnel 模式不需要同一個 Wi-Fi（公司網路有裝置隔離，區網模式連不到）。
- **截圖匯入要先設定 API key**（Story 005）：
  1. 到 [Anthropic Console](https://console.anthropic.com/) 建一把 API key。
  2. 專案根目錄 `cp .env.example .env`，填入 `ANTHROPIC_API_KEY=sk-ant-...`。`.env` 已在 `.gitignore`，不會進 git；也不要用 `EXPO_PUBLIC_` 前綴，那種變數會被打包進手機 app。
  3. 重新執行 `npx expo start --tunnel`（Expo CLI 啟動時才讀 `.env`）。
  4. 手機上的 app 會把截圖 POST 到 dev server 的 `/recognize`（`src/app/recognize+api.ts`），由 server 端讀 `process.env.ANTHROPIC_API_KEY` 呼叫 Claude（`claude-opus-5-5`，structured outputs 強制回 JSON）。手機端用 `expo-constants` 的 `expoConfig.hostUri` 組出 dev server 網址，所以區網與 tunnel 都能用。
  5. 沒設 key 時手機會看到「伺服器沒有設定 ANTHROPIC_API_KEY…」的提示，其他功能照常。
  6. `app.json` 的 `web.output` 設成 `"server"` 才有 API route；正式部署時要有一台 server 跑它，並在 expo-router plugin 設 `origin`（見 https://docs.expo.dev/router/reference/api-routes/）。這次活動只用 dev server。
  7. 想在沒有 key 的情況下跑畫面：`EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1 npx expo start`，會用固定結果的假辨識器（Jest 一律用假的）。
- **Android APK**：`npx eas-cli build -p android --profile preview`（設定在 `eas.json`）。在 Expo 雲端打包，完成後給一個下載連結與 QR code，同學直接裝，不需要 Expo Go。免費方案一個月有數次額度，排隊時間從幾分鐘到幾十分鐘不等。第一次執行會在 Expo 帳號建專案並產生 Android 簽章金鑰，之後都沿用。
- **iOS 真機安裝**：要 Apple 開發者帳號（99 美元／年）走 TestFlight。這次先不需要，Expo Go 就夠。
- **行情來源**：app 預設接證交所 OpenAPI（上市，`https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`）與櫃買中心 OpenAPI（上櫃，`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes`），都是最近一個交易日收盤價，免金鑰，手機要能上網。要切回固定假價（demo 固定數字、Maestro 流程、斷網環境）就設環境變數再開 dev server：

  ```bash
  EXPO_PUBLIC_USE_FAKE_PRICES=1 npx expo start --tunnel
  ```

  或在專案根目錄建 `.env.local`（已被 git 忽略）寫一行 `EXPO_PUBLIC_USE_FAKE_PRICES=1`。改了變數之後要在手機上整個 reload app（不用重開 CLI）。Jest 永遠用假價，不用設。
- **網頁版的行情**：證交所與櫃買中心都沒開 CORS，瀏覽器不能直接打，所以網頁版改打同源的 `/twse`、`/tpex`（`src/app/twse+api.ts`、`src/app/tpex+api.ts`，expo-router API route，`app.json` 的 `web.output` 已設為 `server`）。`npx expo start` 的 dev server 會直接提供這條路；若要把網頁版部署出去，需要能跑 server 的主機（例如 EAS Hosting），純靜態主機上行情會載入失敗。
- **打包加速與 OTA 更新**：APK 打包時間分析、EAS Update 導入步驟與「何時要重打 APK」見 [build-speed.md](build-speed.md)。

### APK 大小

preview APK 從 **92,659,407 bytes（約 88 MB）縮到 25,116,066 bytes（約 24 MB）**（EAS build `71d5a8c3-3e2c-4afa-a375-c3029d03f6e3`）。原本的 88 MB 有 90% 是原生 `.so`（四種 ABI 各一份，共約 83 MB），JS bundle 只有 2 MB、字型 1.6 MB、圖片與其他資源約 2 MB。下表是 APK 內壓縮後的大小差：

| 設定 | 寫在哪裡 | 省下 |
| --- | --- | --- |
| 只打 `arm64-v8a`，去掉 `armeabi-v7a`、`x86`、`x86_64` | `app.json` → `expo-build-properties` 的 `android.buildArchs` | 約 61 MB |
| 不連結沒用到的 `react-native-reanimated`、`react-native-worklets`、`react-native-gesture-handler` | `package.json` → `expo.autolinking.android.exclude` | 約 3.7 MB（arm64 的 `.so`） |
| 只帶用到的 4 個 IBM Plex Sans 字重（原本 14 個連斜體全進來） | `src/app/_layout.tsx` 改從 `@expo-google-fonts/ibm-plex-sans/400Regular` 這類子路徑 import | 約 1.1 MB |
| release 開 R8 與 shrinkResources | `app.json` → `enableMinifyInReleaseBuilds`、`enableShrinkResourcesInReleaseBuilds` | 約 1 MB（dex 0.3 MB、資源 0.7 MB） |

幾點說明：

- **為什麼只打 arm64-v8a**：x86／x86_64 只有模擬器在用；armeabi-v7a 是 32 位元舊手機，近幾年的 Android 手機都是 64 位元 ARM。測試同學用的是自己的手機，所以只留 arm64。若有人裝時出現「與裝置不相容」或「應用程式未安裝」，多半是 32 位元的舊機或入門機，把 `buildArchs` 加回 `"armeabi-v7a"` 再打一次（APK 約多 13–15 MB）。
- **模擬器要用時**：Android 模擬器（x86_64 映像）裝不了這個 APK。日常開發請用 `npx expo start` 搭配 Expo Go，不受影響；真的要在模擬器裝 APK，暫時把 `buildArchs` 改成 `["arm64-v8a", "x86_64"]` 再打包，或在 Apple Silicon Mac 上用 arm64 的模擬器映像。
- **為什麼排除那三個原生套件**：它們不在 `package.json`，是 npm 依 `expo-router` → `react-native-drawer-layout` 的 peer dependency 自動裝進來的，autolinking 看到就會編進 APK。這個 app 只用 Stack，JS bundle 裡完全沒有載入它們（用 `npx expo export --platform android --source-maps` 的 source map 確認過）。`expo-modules-core` 對 worklets 是選用整合，找不到就跳過。之後如果要用 Drawer、手勢或 Reanimated 動畫，要先把對應套件從 exclude 清單拿掉並 `npx expo install` 進來，否則 release APK 會在執行時找不到原生模組。Expo Go 本來就內建這些模組，不受這個設定影響。
- **刻意沒做的**：Hermes 與新架構都是 SDK 58 預設，保留。`useLegacyPackaging`（把 `.so` 壓縮進 APK，估計可再省 8–10 MB 下載量，未實測，但安裝後佔用較多空間）與 `enableBundleCompression`（文件註明會拖慢啟動）都沒開。icon 原圖合計約 130 KB，沒有再壓縮的必要。

### 發新版的兩條路（2026-10-27 起）

先判斷這次改了什麼，細節見 [docs/build-speed.md](build-speed.md) 第 4 節：

| 改了什麼 | 指令 | 大約時間 |
|---|---|---|
| 只有 JS／畫面／文案／圖片 | `npm run ota -- "改了什麼"` | 2～3 分鐘，同學把 app 滑掉重開兩次就是新版 |
| 原生：加原生套件、改 `app.json` 的 icon／名稱／權限／plugins、升 SDK | `npx eas-cli build -p android --profile preview`，完成後 `npm run release -- <build ID> "改了什麼"` | 打包約 5～7 分鐘，發版約 1 分鐘 |

- `npm run ota` 會先自動比對 fingerprint，原生有變就拒絕發 OTA 並提示改打 APK；也會擋下 `.env.local` 裡開著的 `EXPO_PUBLIC_*=1`（假價、開發中的功能開關），避免發給所有人。
- `npm run release` 會下載 EAS 的 APK、建立 GitHub Release（標為最新）、在 `docs/index.html` 的版本清單最上面加一筆，然後 commit + push。舊版本都會留在下載頁，新版有問題可以改裝舊版。
- OTA 只對「裝了 build 3 以後」的 APK 有效，build 1、2 沒有 expo-updates，收不到更新。Story 018 加了 `expo-application`、`expo-clipboard` 兩個原生模組，合併後要先打一次 APK（build 4），之後的 OTA 只送得到 build 4 以後。
- `eas.json` 的 preview profile 已開 `EAS_GRADLE_CACHE=1`；`package-lock.json` 沒變時第二次以後的打包會比較快。

### 版本號規則（Story 018，2026-10-27 起）

app 最底部（免責聲明下面）有一行版本資訊，點開可複製，測試同學回報 bug 時貼上。各部分的來源：

| 顯示 | 意思 | 從哪裡來 |
|---|---|---|
| `v1.0.0` | app 版本 | APK：安裝檔的版本名稱（`expo-application` 的 `nativeApplicationVersion`，即打包當下 `app.json` 的 `version`）；Expo Go／網頁版：`app.json` 的 `version`（`Constants.expoConfig.version`） |
| `build 4` | 哪一個 APK，**和下載頁的名稱一樣** | Android versionCode（`expo-application` 的 `nativeBuildVersion`） |
| `OTA 10/27 16:05` | 跑的是 OTA 更新，以及它的發佈時間（手機當地時間） | `expo-updates` 的 `isEmbeddedLaunch`（false = OTA）、`createdAt` |
| 開發版（Expo Go）／開發版（網頁版） | 跑在 dev server 上 | `__DEV__`、`Constants.executionEnvironment`（`storeClient` = Expo Go）、`Platform.OS` |

點開後另外有 runtime version、channel、update ID、OTA 說明（`npm run ota -- "說明"` 的說明，發佈時寫進 bundle 的 `EXPO_PUBLIC_OTA_MESSAGE`；拿不到時顯示 update ID 前 8 碼）。文字整理在 `src/domain/versionInfo.ts`，元件是 `src/ui/VersionBadge.tsx`。

**build N = Android versionCode**：

- `eas.json` 的 preview profile 開了 `autoIncrement`，`appVersionSource` 是 `remote`：versionCode 存在 EAS 上，每打一次 APK 自動 +1，不用改 `app.json`。
- `npm run release` 直接用這個 APK 的 versionCode 當「build N」（下載頁名稱、GitHub tag `v1.0.0-buildN`）。versionCode 不大於下載頁上最大的 N 時會拒絕發版並提示怎麼修。
- build 1～3 是這個規則之前打的，versionCode 都是 1；EAS 上的 versionCode 目前也是 1。**下一次打 APK 之前要先執行一次** `npx eas-cli build:version:set -p android`，輸入 `3`，下一個 APK 才會是 build 4。只要做這一次。
- `app.json` 的 `version`（1.0.0）是給人看的版本名稱，改它是手動的事；改了要重打 APK（OTA 不會改到安裝檔的版本名稱，畫面以安裝檔為準）。
- 版本號（`version`、versionCode）與 `eas.json` 都不算進 fingerprint，所以 autoIncrement 不會讓 OTA 對不上。

**舊版會顯示什麼**：版本資訊用到 `expo-application` 與 `expo-clipboard` 兩個原生模組，fingerprint 因此改變，build 1～3 都收不到這個畫面（`npm run ota` 會因 fingerprint 不同而拒絕發），要裝 build 4 以後才看得到。若有 versionCode 1 的 APK 跑到這段 JS，會顯示「build 1～3」；拿不到 versionCode 顯示「build 未知」。

## 8. 迭代規劃建議

| 迭代 | 目標 | 可驗收的東西 |
|---|---|---|
| 1 | 單筆持股算盈虧 | 輸入三個欄位，用固定假價算出盈虧；單元測試、畫面測試與兩條 Maestro 流程（已完成） |
| 1.5 | 多檔比較、記住持股、截圖匯入 | 最多 5 檔一起算，依報酬率排名、合計（Story 003，已完成）；持股存在手機，關掉重開還在（Story 004，已完成）；從券商截圖匯入持股（Story 005，已完成） |
| 2 | 接真實行情 | 證交所資料（已完成：收盤價、全市場清單、資料日期、斷網提示） |
| 3 | 打磨與上架準備 | 手續費與稅、報酬率、到價提醒；商店截圖與隱私權政策 |

## 9. 帳號需求

| 帳號 | 何時需要 | 費用 |
|---|---|---|
| GitHub | 現在，放程式與 Issue | 免費 |
| Expo | 產 APK 或用 tunnel 時 | 免費 |
| Apple Developer | 真機 TestFlight 與 App Store 上架 | 99 美元／年 |
| Google Play Console | Play 商店上架 | 25 美元一次 |

這次活動只需要前兩個。

## 10. 常用指令

```bash
npm start            # 開 dev server，出 QR code 給 Expo Go 掃
npm test             # 單元 + 畫面測試
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run check        # 以上三個一起跑，PR 前跑這個
npm run e2e          # Maestro（需先開模擬器）
```

## 11. Bug 回報格式（GitHub Issue 範本）

```
手機：iPhone 15 / iOS 18（或 Android 機型）
版本：Expo Go 顯示的 commit 或日期
步驟：
1.
2.
預期：
實際：
截圖：
```
