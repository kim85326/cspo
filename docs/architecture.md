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
│   │   ├── index.tsx         → screens/HomeScreen（首頁總覽，Story 011）
│   │   ├── calculate.tsx     → screens/CalculateScreen（快速試算）
│   │   ├── import.tsx        → screens/ImportScreen（從截圖匯入成交易，Story 015）
│   │   ├── twse+api.ts       API route：網頁版的證交所代理（GET /twse），手機不經過
│   │   └── tpex+api.ts       API route：網頁版的櫃買中心代理（GET /tpex），手機不經過
│   ├── screens/              畫面本體與畫面測試
│   │   ├── HomeScreen.tsx            首頁總覽：整體、核心、衛星三組數字與前 5 檔持股
│   │   ├── CalculateScreen.tsx       快速試算：輸入一檔或多檔持股 → 看盈虧／比較
│   │   ├── ImportScreen.tsx          從截圖匯入：選圖 → 辨識 → 核對 → 每檔一筆買入交易
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
│   │   ├── holdingExtract.test.ts
│   │   ├── importTransactions.ts 截圖匯入成交易：核對畫面的列、每列的檢查、轉成買入交易（Story 015）
│   │   └── imageMimeType.ts  截圖匯入：依檔案內容／副檔名猜 mimeType（picker 給的不可靠；後端會再看檔頭）
│   ├── data/                 對外資料來源
│   │   ├── PriceSource.ts    介面：給代號回現價
│   │   ├── StockDirectory.ts 介面：有哪些股票可以選
│   │   ├── stocks.ts         固定 40 檔（代號、名稱、假價）：測試用，也是熱門清單的順序
│   │   ├── fakePriceSource.ts / fakeStockDirectory.ts  用 stocks.ts 實作的假來源
│   │   ├── HoldingStore.ts   介面：把輸入過的持股存在手機本機
│   │   ├── asyncStorageHoldingStore.ts / memoryHoldingStore.ts  舊版 AsyncStorage 實作（現在只讀舊資料搬移）／ 測試用記憶體版
│   │   ├── LedgerStore.ts    介面：記帳本整份存在手機本機（Story 008）
│   │   ├── asyncStorageLedgerStore.ts / memoryLedgerStore.ts  AsyncStorage `cspo.ledger.v1`（含舊資料自動搬移）／ 測試用記憶體版
│   │   ├── quickCalcHoldingStore.ts  快速試算記住輸入：自己的 key，只讀記帳本、不寫記帳本
│   │   ├── HoldingRecognizer.ts  介面：給截圖回辨識結果
│   │   ├── backendHoldingRecognizer.ts / fakeHoldingRecognizer.ts  POST 到 backend/ 的 /recognize（和 AI 解讀共用網址與存取碼）／ 測試用固定結果
│   │   ├── twseEndpoint.ts   證交所網址；網頁版改走同源代理 /twse（證交所沒開 CORS）
│   │   ├── twseParse.ts      證交所回應 → Quote[]（純函式，有單元測試）
│   │   ├── twseSource.ts     證交所（上市）來源
│   │   ├── tpexEndpoint.ts / tpexParse.ts / tpexSource.ts  櫃買中心（上櫃）：網址與 /tpex 代理、回應 → Quote[]、來源
│   │   ├── dailyQuoteSource.ts  上市上櫃共用：抓全市場、5 分鐘快取，同時是 PriceSource 與 StockDirectory
│   │   ├── directoryOrder.ts 清單排序：熱門在前、其餘依代號
│   │   ├── marketSource.ts   上市 + 上櫃合成一個來源，一邊失敗另一邊照用（Story 007）
│   │   ├── __fixtures__/     真實 API 回應（裁剪過），測試用
│   │   └── index.ts          依環境決定用假來源還是真的（Jest 一律用假的；EXPO_PUBLIC_USE_FAKE_PRICES／EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1 也可切）
│   ├── config/features.ts    功能開關的名稱、打包預設、優先順序（Story 033）
│   ├── hooks/                畫面共用的 React hook（usePersistedHoldings：啟動時讀回、計算後存；useScreenshotImport：選圖／拍照 → 辨識；useFeatures：功能開關，會跟著遠端更新）
│   └── ui/                   可重用元件與設計 token（StockPicker、LabeledInput、HoldingForm、ImportSourceSheet、PnlCard、ComparisonCard、theme）
├── backend/                  本機 AI 後端（AI 解讀 /insight、截圖辨識 /recognize）；API key 只在 backend/.env（第 7 節）
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

自動化跑的是 `fakePriceSource`（固定現價），所以結果可重現：`src/data/index.ts` 看到 Jest 的 `JEST_WORKER_ID` 就自動用假來源。真實行情（證交所）只有在手機或網頁上跑 app 時才接。歷史日 K 與除權息（`candleSource`、`corporateActionSource`，Story 021）也一樣：Jest 裡是 `fakeCandleSource`、`fakeCorporateActionSource`，不打網路。

手動測試同學專注在自動化不好做的事：不同手機尺寸、輸入法、斷網、中文顯示、操作順不順手。

## 7. 發版給測試同學

- **每天至少一次**：工程執行 `npx expo start --tunnel`，測試同學用 Expo Go 掃 QR code。tunnel 模式不需要同一個 Wi-Fi（公司網路有裝置隔離，區網模式連不到）。
- **截圖匯入（Story 005）走本機後端 `backend/`**，和 AI 解讀共用同一台、同一個網址與存取碼（設定見下面「AI 解讀後端：給別人連進來」）。2026-10-27 之前它走 dev server 的 API route（`src/app/recognize+api.ts`），APK 裡沒有 dev server 所以一定失敗；那條 route 已經拿掉，網頁版也改打後端：
  1. app 把截圖（`quality: 0.6` 壓過的 base64）POST 到 `<EXPO_PUBLIC_INSIGHT_API_URL>/recognize`，帶 `Authorization: Bearer <EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN>`（`src/data/backendHoldingRecognizer.ts`）。後端用 `backend/.env` 的 key 呼叫 Claude（`claude-opus-5-5`、structured outputs，`backend/src/claudeRecognize.ts`），回模型的原始欄位，app 端 `parseExtractionResult` 正規化。
  2. **圖片格式看檔案內容決定**（`backend/src/recognizeRequest.ts`）：`expo-image-picker` 在 `quality < 1` 時給的 base64 一律是 JPEG，`mimeType` 卻是原檔的 `image/png`／`image/heic`，有時是 `undefined`（[研究 §1.4](research/screenshot-import.md)）。後端看檔頭（JPEG `FF D8 FF`、PNG、GIF、WebP）送正確的 `media_type`，不信任 app 給的值；app 端 `src/domain/imageMimeType.ts` 也依序用檔案內容 → 副檔名 → picker 的值猜一個當提示。app 宣告的格式只能是 JPEG／PNG／WebP／GIF／HEIC（或不給），其他回 415；內容真的是 HEIC（Claude 不收）回 415「請改用螢幕截圖」。
  3. 大小上限另外設：圖片解碼後 **5 MB**（`INSIGHT_RECOGNIZE_MAX_IMAGE_BYTES`，最大 10 MB），請求內容上限自動換算成 base64 長度；超過回 413「圖片太大」。`/insight` 的 16 KB 上限不變。
  4. 存取碼、每 IP 頻率、每日上限、同時處理數、CORS 都和 `/insight` 共用**同一份**（整台後端一個預算），見下面「防濫用」。
  5. 開關仍是 `screenshotImport`，**預設關閉**，用遠端開關切換（見本節「功能開關」）。不開後端想看畫面：`.env.local` 設 `EXPO_PUBLIC_USE_FAKE_RECOGNIZER=1`（Jest 一律用假的）。
  6. **Tech Day 現場打開截圖匯入**（APK build 5 以後；全部是 JS 改動，OTA 就能送到）：
     ```bash
     # 一次性：APK 要知道後端網址與存取碼（打包 OTA 時寫進 bundle）。EAS preview 還沒設過才需要；
     # 只設這兩個，不設 EXPO_PUBLIC_FEATURE_AI_INSIGHT，AI 解讀照樣維持關閉
     npx eas-cli env:set --name EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN --value <backend/.env 的 INSIGHT_ACCESS_TOKEN> --environment preview --visibility plaintext
     npx eas-cli env:set --name EXPO_PUBLIC_INSIGHT_API_URL --value https://xxxx.ngrok-free.app --environment preview --visibility plaintext
     npm run ota -- "截圖匯入改走本機後端"

     # 現場：先開後端（ngrok 固定網址），確認外面打得到 /health
     npm run backend:tunnel
     # 再打開遠端開關；最多等 5 分鐘 CDN 快取，請同學把 app 切到背景再切回來
     node scripts/feature-flags.mjs set screenshotImport on
     # 結束：先關開關，再 Ctrl+C 關掉 tunnel
     node scripts/feature-flags.mjs set screenshotImport off
     ```
     開關打開但 tunnel 沒開時，同學按下去會看到「連不上辨識服務：提供服務的電腦可能還沒開（npm run backend:tunnel）…」，其他功能照常。
- **Android APK**：`npx eas-cli build -p android --profile preview`（設定在 `eas.json`）。在 Expo 雲端打包，完成後給一個下載連結與 QR code，同學直接裝，不需要 Expo Go。免費方案一個月有數次額度，排隊時間從幾分鐘到幾十分鐘不等。第一次執行會在 Expo 帳號建專案並產生 Android 簽章金鑰，之後都沿用。
- **iOS 真機安裝**：要 Apple 開發者帳號（99 美元／年）走 TestFlight。這次先不需要，Expo Go 就夠。
- **行情來源**：app 預設接證交所 OpenAPI（上市，`https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`）與櫃買中心 OpenAPI（上櫃，`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes`），都是最近一個交易日收盤價，免金鑰，手機要能上網。要切回固定假價（demo 固定數字、Maestro 流程、斷網環境）就設環境變數再開 dev server：

  ```bash
  EXPO_PUBLIC_USE_FAKE_PRICES=1 npx expo start --tunnel
  ```

  或在專案根目錄建 `.env.local`（已被 git 忽略）寫一行 `EXPO_PUBLIC_USE_FAKE_PRICES=1`。改了變數之後要在手機上整個 reload app（不用重開 CLI）。Jest 永遠用假價，不用設。
- **網頁版的行情**：證交所與櫃買中心都沒開 CORS，瀏覽器不能直接打，所以網頁版改打同源的 `/twse`、`/tpex`（`src/app/twse+api.ts`、`src/app/tpex+api.ts`，expo-router API route，`app.json` 的 `web.output` 已設為 `server`）。`npx expo start` 的 dev server 會直接提供這條路；若要把網頁版部署出去，需要能跑 server 的主機（例如 EAS Hosting），純靜態主機上行情會載入失敗。
- **打包加速與 OTA 更新**：APK 打包時間分析、EAS Update 導入步驟與「何時要重打 APK」見 [build-speed.md](build-speed.md)。

### AI 解讀後端：給別人連進來（Story 031）

「AI 解讀」按鈕（[docs/stories/031-ai-insight.md](stories/031-ai-insight.md)）與「從截圖匯入」的辨識（[Story 005](stories/005-import-from-screenshot.md)，`POST /recognize`）背後是同一台跑在**工程同學電腦上**的小後端 `backend/`。Anthropic API key 只放在那台電腦的 `backend/.env`，app 裡沒有、git 裡也沒有。其他人的手機（不同網路、APK、Expo Go、網頁版）透過 **ngrok 的固定網址**連進來：

```
別人的手機 ──https──▶ https://xxxx.ngrok-free.app ──▶ ngrok（你的電腦）──▶ backend/（127.0.0.1:8787）──▶ Claude API
```

它和 Expo dev server 互相獨立，不開 `npx expo start` 也能單獨跑。需要 Node 24 以上（直接執行 `.ts`、用 `--env-file-if-exists` 讀 `.env`，不需要建置步驟）。

#### 一次性準備

1. **API key 與存取碼**：`cp backend/.env.example backend/.env`，填 `ANTHROPIC_API_KEY` 與 `INSIGHT_ACCESS_TOKEN`（產生：`openssl rand -hex 16`）。
2. **Anthropic Console 花費上限（一定要做）**：到 [Anthropic Console](https://console.anthropic.com/) 開一個 Tech Day 專用的 workspace，key 建在裡面，設**每月花費上限 US$10～20**。後端對外公開後，這是唯一真正的硬上限（理由見下面「防濫用」）。
3. **ngrok（自己註冊與安裝，agent 不會替你做）**：
   ```bash
   # 先到 https://dashboard.ngrok.com/signup 註冊免費帳號
   brew install ngrok
   ngrok config add-authtoken <dashboard「Your Authtoken」頁的 token>
   ```
   免費帳號會自動配一個**固定不變**的 dev domain（ngrok 文件的說法是「a stable, auto-assigned hostname」，格式是 `xxxx.ngrok-free.app` 之類）。`npm run backend:tunnel` 沒偵測到 ngrok 或 authtoken 時，也會印出這幾步。
4. **第一次啟動，拿到固定網址**：`npm run backend:tunnel`，畫面會印出「公開網址：https://xxxx.ngrok-free.app」。
5. **把網址告訴 app**（只要做一次，因為網址不會變）：
   - Expo Go／網頁版（從你的 dev server 載入）：根目錄 `.env.local` 加
     ```
     EXPO_PUBLIC_FEATURE_AI_INSIGHT=1
     EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN=<和 backend/.env 的 INSIGHT_ACCESS_TOKEN 相同>
     EXPO_PUBLIC_INSIGHT_API_URL=https://xxxx.ngrok-free.app
     ```
     然後在手機上整個 reload app。
   - APK：**2026-10-27 PO 決定 Tech Day 範圍不含 AI 解讀，APK 的開關維持關閉，現在不要做這一步。** 之後要開放時，在 EAS 的 preview 環境設同樣三個變數（`EXPO_PUBLIC_` 一律用 plaintext，反正會進 bundle）：
     ```bash
     npx eas-cli env:set --name EXPO_PUBLIC_FEATURE_AI_INSIGHT --value 1 --environment preview --visibility plaintext
     npx eas-cli env:set --name EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN --value <存取碼> --environment preview --visibility plaintext
     npx eas-cli env:set --name EXPO_PUBLIC_INSIGHT_API_URL --value https://xxxx.ngrok-free.app --environment preview --visibility plaintext
     ```
     再發一次 `npm run ota -- "開啟 AI 解讀"`（`npm run ota` 已帶 `--environment preview`；它會先比對 fingerprint，原生有變才會要求改打 APK。這個功能的改動都是 JS）。`npm run ota` 會擋下 `.env.local` 裡的 `EXPO_PUBLIC_*=1`，發之前先把 `.env.local` 那行開關註解掉，發完再打開。
   - 存取碼 `EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN` 會被打包進 app，APK 又放在公開的 GitHub Releases，所以**它不是秘密**，只擋隨手亂打網址的路人。

#### 每次要讓別人連進來

```bash
npm run backend:tunnel
```

這個指令會依序：

1. 檢查 ngrok 有沒有裝、有沒有設 authtoken；沒有就印出安裝與 `ngrok config add-authtoken` 的步驟後結束（不會替你安裝或註冊）。
2. 檢查 8787 與 ngrok 的 4040 沒被佔用（另一個 `npm run backend` 或 ngrok 還開著就停下來）。
3. 印出「即將對外公開什麼」：只有 `GET /health`、`POST /insight`、`POST /recognize` 三條路、目前的次數限制、提醒設 Console 花費上限。
4. 啟動後端，**只聽 `127.0.0.1`**（區網的人不能繞過 ngrok 直接連），並開 `INSIGHT_TRUST_PROXY=1`。`backend/.env` 沒設 key 或存取碼就停下來，不對外公開。
5. 啟動 `ngrok http 8787`，從 ngrok 本機 API（`http://127.0.0.1:4040/api/endpoints`）讀出公開網址。
6. 從公開網址打一次 `/health` 確認外面連得到，並對照 `.env.local` 的 `EXPO_PUBLIC_INSIGHT_API_URL`，不一致就印出要設的值與 `eas-cli env:set` 指令。

**確認外部連得到**：手機關掉 Wi-Fi、用行動網路，在瀏覽器開 `https://xxxx.ngrok-free.app/health`，看到 `{"ok":true,"apiKeyConfigured":true,"accessTokenConfigured":true,...}` 就代表別人連得進來。用瀏覽器直接開時可能先看到 ngrok 的免費方案提示頁，點過去就好；app 的請求有帶 `ngrok-skip-browser-warning`，不會遇到。也可以用 `curl -H "ngrok-skip-browser-warning: 1" https://xxxx.ngrok-free.app/health`。

**關掉**：在跑 `npm run backend:tunnel` 的終端機按 Ctrl+C，ngrok 與後端會一起關。關掉後別人按「AI 解讀」會看到「連不上 AI 解讀服務：提供服務的電腦可能還沒開…」，其他功能照常。電腦睡眠也等於關掉。活動結束後在 Console 刪掉這把 key。

只在自己電腦或同一個 Wi-Fi 開發時，不需要 ngrok，用 `npm run backend` 即可（聽所有網卡，port 8787）：同電腦的網頁版自動打 `http://localhost:8787`，同 Wi-Fi 的 Expo Go 自動用 dev server 的 IP 換成 8787，`EXPO_PUBLIC_INSIGHT_API_URL` 可以不設。公司 Wi-Fi 有裝置隔離（context-for-ai.md 第 8 節），在公司一律用 `npm run backend:tunnel`。

#### 網址穩定性：為什麼選 ngrok（其他做法當備案）

APK 的 `EXPO_PUBLIC_INSIGHT_API_URL` 是打包（或發 OTA）時寫死的，所以後端網址最好永遠不變。比較過的做法：

| 做法 | 一次性設定 | 網址變了多久生效 | 使用者平常要做的事 | 缺點 |
|---|---|---|---|---|
| **ngrok 免費 dev domain（採用）** | 註冊 ngrok、`brew install ngrok`、`ngrok config add-authtoken`；EAS 設一次網址並發一次 OTA | 網址不會變 | `npm run backend:tunnel`，用完 Ctrl+C | 要 ngrok 帳號；免費方案每月 20,000 個 HTTP 請求、1 GB 流量（每次解讀約 2～4 KB、每張截圖約 150～300 KB，Tech Day 幾百次也用不完）；瀏覽器要帶 `ngrok-skip-browser-warning`（app 已帶） |
| Cloudflare 具名 tunnel | Cloudflare 帳號，而且要有一個加到 Cloudflare 的網域（多半要買）；在 dashboard 建 tunnel、跑它給的安裝指令、設 published application route | 網址不會變 | 啟動 connector | 要網域，設定步驟最多 |
| Cloudflare quick tunnel ＋ 公開設定檔（例如 repo 專用分支或 `docs/` 下的 JSON，tunnel 腳本啟動後用 `gh` 更新網址，app 每次解讀前先讀） | 免新帳號；app 要多一段讀設定檔的程式 | raw.githubusercontent.com 最多 5 分鐘、GitHub Pages 最多 10 分鐘＋建置約 1 分鐘（2026-10-27 實測 `cache-control: max-age=300`／`600`，加 query string 也不會略過 CDN 快取） | 每次重開 tunnel 後等快取過期，期間 APK 連到舊網址會失敗 | quick tunnel 官方定位是測試用、沒有可用性保證；網址公開在 repo；每次重開都有空窗 |
| quick tunnel ＋ 換網址就發 OTA | 免新帳號 | 發布 2～3 分鐘＋同學把 app 滑掉重開兩次 | 每次重開 tunnel 都要 `npm run ota` | 只對 build 3 以後的 APK 有效；每次都佔一個 EAS Update；Expo Go／網頁版還要另外改 `.env.local` |

要改用 Cloudflare：後端用 `npm run backend`（或自己設 `INSIGHT_HOST=127.0.0.1`、`INSIGHT_TRUST_PROXY=1`），tunnel 指向 `http://localhost:8787`，app 一樣只要設 `EXPO_PUBLIC_INSIGHT_API_URL`。quick tunnel 指令是 `cloudflared tunnel --url http://localhost:8787`（[官方說明](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)，安裝 `brew install cloudflared`）。

#### 防濫用（對外公開後每一關都假設呼叫者不可信）

| 關卡 | 預設 | 超過時 | 設定 |
|---|---|---|---|
| 只開三條路 | `GET /health`、`POST /insight`、`POST /recognize`（加上這三條的 CORS preflight） | 其他路徑 404、方法不對 405 | — |
| 存取碼 | `Authorization: Bearer <INSIGHT_ACCESS_TOKEN>`，固定時間比對 | 401；後端沒設存取碼一律 503（fail closed） | `INSIGHT_ACCESS_TOKEN` |
| 每 IP 頻率 | 每分鐘 5 次（猜存取碼也算；`/insight`、`/recognize` 合計） | 429 + `Retry-After` | `INSIGHT_RATE_LIMIT_PER_MINUTE` |
| 全域每日上限 | 每天 100 次 Claude 呼叫（只算真的呼叫，兩條合計，重啟歸零） | 429「今天的 AI 使用次數已達上限」 | `INSIGHT_DAILY_LIMIT` |
| 同時處理數 | 3 個（兩條合計） | 429「AI 服務忙碌中」 | `INSIGHT_MAX_CONCURRENT` |
| 請求大小 | `/insight` 16 KB；最多 30 檔、欄位白名單 | 413／400 | `INSIGHT_MAX_BODY_BYTES` |
| 圖片大小與格式 | `/recognize` 圖片 5 MB；看檔頭只收 JPEG／PNG／WebP／GIF | 413／415 | `INSIGHT_RECOGNIZE_MAX_IMAGE_BYTES` |
| 輸出上限 | `max_tokens` 2048，設再大也不超過 4096 | — | `INSIGHT_MAX_TOKENS` |
| API key | 沒設 | 503「後端沒有設定 ANTHROPIC_API_KEY…」 | `ANTHROPIC_API_KEY` |
| 網頁版 CORS | 只允許 `INSIGHT_ALLOWED_ORIGINS`（預設 `http://localhost:8081`、`http://127.0.0.1:8081`；可寫 `https://*.exp.direct` 給 Expo tunnel 網頁版） | 不回 CORS header，瀏覽器擋下 | `INSIGHT_ALLOWED_ORIGINS` |

- **來源 IP**：ngrok 轉進來的連線，來源都是 127.0.0.1。`INSIGHT_TRUST_PROXY=1` 時，後端改看 `X-Forwarded-For` 的**最後一個**值（ngrok 文件：ngrok 會把真正的來源 IP 接在最後，前面的值可能是使用者自己塞的）或 Cloudflare 的 `CF-Connecting-IP`。而且只有「連線本身來自本機」才看這兩個 header，從區網直接連進來的人偽造它們沒有用。
- **存取碼等於公開**：APK 在公開的 GitHub Releases，拆包就拿得到存取碼；ngrok 網址也寫在 APK 裡。所以真正擋住花費的是每日上限與 **Console 的每月花費上限**，請一定要設。
- 後端錯誤只回中文訊息，Claude 的英文錯誤原文只寫在終端機 log；log 只印 token 用量與檔數，不印持股內容。

#### 其他設定與 app 端變數

| 變數（`backend/.env`） | 預設 | 說明 |
|---|---|---|
| `INSIGHT_PORT` / `INSIGHT_HOST` | `8787` / `0.0.0.0` | `npm run backend:tunnel` 會強制 `INSIGHT_HOST=127.0.0.1` |
| `INSIGHT_TRUST_PROXY` | `0` | `npm run backend:tunnel` 會自動設 `1` |

| 變數（app，`.env.local` 或 EAS） | 說明 |
|---|---|
| `EXPO_PUBLIC_FEATURE_AI_INSIGHT=1` | 功能開關，預設關閉；APK 改用遠端切換（見本節「功能開關」） |
| `EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN` | 和後端的 `INSIGHT_ACCESS_TOKEN` 相同（不是秘密，見上） |
| `EXPO_PUBLIC_INSIGHT_API_URL` | ngrok 固定網址。沒設時網頁版用 `http://<網頁主機>:8787`、Expo Go 區網用 dev server 的 IP；Expo tunnel 與 APK 猜不到，畫面提示要設 |
| `EXPO_PUBLIC_USE_FAKE_INSIGHT=1` | 不開後端也能看畫面（固定內容的假解讀）；Jest 一律用假的 |

`npm run backend:test` 跑後端的型別檢查與測試（node:test，不打真的 Claude）。

#### 費用

依 `claude-api` skill 的定價（2026-10-06 快取：Claude Opus 5.5 輸入 US$4、輸出 US$20／百萬 tokens）。2026-10-27 用真 key 實測一次（兩檔、`effort: "low"`）：**輸入 1,235 tokens、輸出 254 tokens（含 thinking），約 US$0.010，回應約 5 秒**。後端每次都會在終端機印 `usage input=… output=…`，可以持續核對。

| 項目 | 估算 |
|---|---|
| 每次解讀（1～5 檔） | **約 US$0.01～0.02（約新台幣 0.3～0.6 元）**；實測一次 US$0.010 |
| 命中禁用字眼要重寫一次 | 那一次約兩倍 |
| 單次最壞情況：30 檔＋兩次都用滿 `max_tokens` 2048 | 約 US$0.11 |
| 每日上限 100 次全部最壞情況 | 約 US$11／天 |
| Tech Day 正常使用（30～50 人、每人幾次，100～250 次） | 約 US$1～5 |
| 每張截圖辨識（`effort: "medium"`，2026-10-27 真 key 實測 2 次） | **約 US$0.03**：4,602 tokens 輸入（圖片占大部分）＋ 563～752 輸出，8～10 秒 |
| 截圖辨識單次最壞情況：5 MB 圖片＋`max_tokens` 4096 | 約 US$0.10；每日上限 100 次（和 AI 解讀合計）全部最壞約 US$10／天 |

**花費上限建議**：Console 專用 workspace 每月上限 US$10～20（硬上限，存取碼外流也最多損失這個數），搭配 `INSIGHT_DAILY_LIMIT`；不用時 Ctrl+C 關掉 tunnel；活動結束刪 key。想再省可把 `backend/src/claudeInsight.ts` 的 `INSIGHT_MODEL` 換成 `claude-haiku-5-5`（約便宜 40 倍），但中文品質與禁用字眼的遵守度要先用幾組真實數字比較過，且要拿掉只有 Opus／Sonnet 支援的 `fallbacks` 參數。

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

- `npm run ota` 會先自動比對 fingerprint，原生有變就拒絕發 OTA 並提示改打 APK；**注意 `package.json` 的 `scripts` 也算進 fingerprint**：新增或修改 npm script 會讓已安裝的 APK 收不到 OTA，一次性工具請用 `node scripts/xxx.mjs` 直接執行，不要加進 scripts（例：`node scripts/feature-flags.mjs`）；也會擋下 `.env.local` 裡開著的 `EXPO_PUBLIC_*=1`（假價、開發中的功能開關），避免發給所有人。
- `npm run release` 會下載 EAS 的 APK、建立 GitHub Release（標為最新）、在 `docs/index.html` 的版本清單最上面加一筆，然後 commit + push。舊版本都會留在下載頁，新版有問題可以改裝舊版。
- OTA 只對「裝了 build 3 以後」的 APK 有效，build 1、2 沒有 expo-updates，收不到更新。Story 032 加了 `expo-application`、`expo-clipboard` 兩個原生模組，合併後要先打一次 APK（build 4），之後的 OTA 只送得到 build 4 以後。
- `eas.json` 的 preview profile 已開 `EAS_GRADLE_CACHE=1`；`package-lock.json` 沒變時第二次以後的打包會比較快。

### 功能開關：不重打 APK、不發 OTA 就能切換（Story 033）

```bash
node scripts/feature-flags.mjs list                 # 看遠端目前的值
node scripts/feature-flags.mjs set aiInsight on     # 或 off；名稱：screenshotImport、aiInsight、proPlan
node scripts/feature-flags.mjs set aiInsight on --dry-run   # 只印出會寫什麼
```

- 設定檔是 GitHub `kim85326/cspo` 的 **`feature-flags` 分支**裡的 `feature-flags.json`（例如 `{"aiInsight": true}`）。`node scripts/feature-flags.mjs` 用已經登入的 `gh` 寫入；第一次 `set` 會建立這個獨立分支（只有這一個檔，不碰 iteration-1）。
- app 從 `https://raw.githubusercontent.com/kim85326/cspo/feature-flags/feature-flags.json` 讀：**啟動時**與**每次回到前景**各抓一次，抓到就存進 AsyncStorage。
- **raw.githubusercontent.com 的 CDN 快取最多 5 分鐘**：改完要等最多 5 分鐘，再請同學把 app 切到背景再切回來。
- 優先順序：開發時 `.env.local` 明確設的 `EXPO_PUBLIC_FEATURE_*`（`1`／`0`，只在 dev server）> 遠端 > 上次存的 > 打包預設（APK 一律關閉）。抓失敗、逾時（5 秒）、格式不對都當作沒抓到；只接受認得的名稱、值是 true／false。
- 開關只控制畫面看不看得到，**不是保護**：repo 是公開的，任何人都讀得到這份設定。秘密與花費要靠後端（AI 解讀的存取碼、每日上限）。
- 畫面用 `useFeatures()` 讀（`src/hooks/useFeatures.tsx`），遠端更新時會重新 render；新增開關要同時改 `src/config/features.ts` 與 `scripts/feature-flags.mjs` 的 `FEATURE_NAMES`（有測試比對）。
- 這個機制本身是純 JS，沒有加原生套件，用 OTA 就能送到 build 5 以後的 APK。

### 版本號規則（Story 032，2026-10-27 起）

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
npm run backend        # AI 解讀後端，只給自己電腦／同 Wi-Fi 用（見第 7 節「AI 解讀後端」）
npm run backend:tunnel # AI 解讀後端 + ngrok，讓別人從外面連進來
npm run backend:test   # 後端的型別檢查 + 測試
node scripts/feature-flags.mjs list  # 遠端功能開關；set <名稱> on|off 切換（見第 7 節「功能開關」）
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
