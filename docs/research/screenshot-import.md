# 研究：「從截圖匯入」在真實情境能不能用

> 對象：Story 005（[docs/stories/005-import-from-screenshot.md](../stories/005-import-from-screenshot.md)）合併後的程式（`c9699fb`）。
> 日期：2026-10-27。Expo SDK 58（`expo ~58.0.19`、`expo-router ~58.0.26`、`expo-image-picker ~58.0.10`）、`@anthropic-ai/sdk ^1.3.0`、模型 `claude-opus-5-5`。
> 依據：本機 `node_modules` 原始碼、Expo 官方文件（連結附在各節）、`claude-api` skill 的定價表、本機 dev server 實測。

## 結論先講

| 情境 | 能不能用 | 一句話原因 |
|---|---|---|
| (a) 網頁版 dev server | **能**（要有 `.env` 的 key） | 同源打 `/recognize`；網頁選圖的 mimeType 是真的 |
| (b) Expo Go 掃 tunnel QR code | **網路通，但相簿截圖很可能被 API 拒收** | 網址組得對；但手機送出的 base64 一律是 JPEG，mimeType 卻寫原檔的 `image/png`（見 §1.4） |
| (c) 安裝的 APK | **一定失敗** | 正式版沒有 `hostUri`，也沒設 `origin`，`fetch("/recognize")` 是沒有主機的相對網址 |

APK 使用者按「從截圖匯入」→ 選圖 → 一定看到：

> **連不上辨識服務，請確認手機與電腦在同一個 dev server 後重試**

按「重試辨識」也一樣，因為 APK 根本不知道要打哪台伺服器。

推薦的上線做法：把現有的 API route 原封不動部署到 **EAS Hosting**（免費方案每月 10 萬次請求），在 `app.json` 的 `expo-router` plugin 設 `origin`，然後重打 APK。API key 用 EAS 的 secret 環境變數。Claude 費用每張截圖約 **US$0.03～0.06**，Tech Day 期間估計 **US$5～15**。上線前要先修 §1.4 的 mimeType bug、加大小限制與共享 token，並在 Anthropic Console 設花費上限。

---

## 1. 現況實際可用範圍

### 1.1 網址怎麼決定

`src/data/recognizeEndpoint.ts`：

```ts
if (Platform.OS === "web" || !hostUri) return RECOGNIZE_PATH;   // "/recognize"
...
return `${scheme}://${host}${RECOGNIZE_PATH}`;                   // exp.direct 用 https，其餘 http
```

接著 `claudeHoldingRecognizer.ts` 用全域 `fetch` 打這個網址。有一個關鍵細節：原生端的全域 `fetch` 被 `@expo/metro-runtime` 包過一層（`node_modules/@expo/metro-runtime/src/location/install.native.ts`）：

```ts
function getOrigin() {
  if (process.env.NODE_ENV !== 'production') {
    const bundleOrigin = getBundleOrigin();   // 開發時：bundle 從哪台 dev server 來
    if (bundleOrigin) return bundleOrigin;
  }
  // 正式版：只看設定
  return extra?.router?.origin ?? extra?.router?.generatedOrigin;
}
...
// `window.location` is unset when the bundle wasn't served over HTTP and the app configures no
// origin. A relative URL is then passed through, so the request fails on its own terms
```

相對網址 `/recognize` 只有在 `window.location.origin` 有值時才會被補成完整網址。

### 1.2 (a) 網頁版 dev server：能用

- `Platform.OS === "web"` → `/recognize`，同源，走 Expo CLI 的 API route middleware。
- 本機實測（`CI=1 npx expo start --port 8097`，沒有 key）：
  - 送 `01-lots-cost.png`（base64 214 KB）→ `503`「伺服器沒有設定 ANTHROPIC_API_KEY…」，0.3 秒。
  - 送 9 MB 的 body → 一樣 `503`。**dev server 不限制 body 大小**，程式也沒檢查（見 §3）。
- 有 key 時這條路徑就是 Story 005 實作與測試過的路徑。網頁版的 `expo-image-picker` 直接讀檔案，mimeType 與內容一致，不受 §1.4 的 bug 影響。

### 1.3 (b) Expo Go 掃 tunnel QR code：網路通

- `npx expo start --tunnel` 用 ngrok（`@expo/cli/build/src/start/server/AsyncNgrok.js`，`domain: 'exp.direct'`），manifest 裡的 `hostUri` 是 `xxx-anonymous-8081.exp.direct`。
- `recognizeUrl` 把它組成 `https://xxx-anonymous-8081.exp.direct/recognize`（單元測試有涵蓋）。API route 跟 bundle 由同一個 Metro server 提供，所以 tunnel 也打得到。
- 就算 `recognizeUrl` 回相對路徑，開發模式下 metro-runtime 也會用 bundle origin 補完，所以 (b) 的網址是雙保險。
- 但是**從相簿選的截圖很可能被 Claude API 拒收**，原因見 §1.4。拍照（JPEG）不受影響。

### 1.4 Bug：手機上傳的圖片內容是 JPEG，mimeType 卻寫 PNG

`useScreenshotImport.ts` 用 `quality: 0.6` 和 `base64: true` 選圖，再送 `asset.mimeType ?? "image/jpeg"`。但 `expo-image-picker` 原生端：

- Android `MediaHandler.kt`：`quality < 1` 時用 `CompressionImageExporter`。它的 base64 是 `bitmap.compress(Bitmap.CompressFormat.JPEG, …)`，**一律 JPEG**，但 `mimeType = getType(contentResolver, sourceUri)`，也就是原檔的 `image/png`。
- iOS `ImageUtils.swift`：`readJpegBase64From`，註解寫明 *base64 output is always JPEG*。mimeType 一樣是原檔類型。

手機截圖幾乎都是 PNG，所以 server 會送 `media_type: "image/png"` 加上 JPEG 的資料給 Claude。依 API 對 media type 的檢查，這預期會回 400 → `toServerError` 轉成 HTTP 502 → 手機顯示「辨識服務錯誤（400）：400 {…英文 JSON…}」。

- **影響範圍**：(b) 和修好網址後的 (c)。網頁版 (a) 不受影響，所以網頁上測過也看不出來。
- **確定程度**：圖片內容是 JPEG、mimeType 是 PNG，這兩點是讀原始碼確認的。API 是否真的拒收沒有實測（這台電腦沒有 key）。可以用 `node docs/research/screenshot-samples/recognize-samples.mjs --mislabel` 一次驗證。
- **修法**（不在本次範圍）：server 端看 base64 開頭的魔術位元組判斷真實格式（`/9j/` = JPEG、`iVBOR` = PNG、`R0lG` = GIF、`UklG` = WebP），不信任客戶端的 mimeType。改 `src/server/recognizeHoldings.ts` 一個地方就能同時修好 (b) 和 (c)。

### 1.5 (c) 安裝的 APK：一定失敗

推理鏈：

1. `eas.json` 的 `preview` profile 是 release APK（`distribution: internal`、`buildType: apk`，沒有 `developmentClient`），`NODE_ENV === "production"`。
2. `Constants.expoConfig.hostUri` 只有 dev server 送的 manifest 才有（`ManifestMiddleware.js` 在組 manifest 時塞進去）。APK 內嵌的 app config 沒有這個欄位，所以是 `undefined` → `recognizeUrl()` 回 `"/recognize"`。
3. `app.json` 的 `expo-router` plugin 沒有 `origin`。`generatedOrigin` 只有在打包時設 `EXPO_UNSTABLE_DEPLOY_SERVER=1` 才會寫入（`@expo/cli/build/src/export/embed/exportServer.js`），目前沒設。→ `window.location` 沒有被 polyfill。
4. `fetch("/recognize")` 原封不動交給 React Native 的 fetch。沒有主機的網址在 Android 會直接丟出 `TypeError: Network request failed`。
5. `claudeHoldingRecognizer.ts` 的 `catch {}` 把它轉成 `NETWORK_ERROR_MESSAGE`。

使用者看到的畫面：「辨識中…」一閃 → 錯誤區塊顯示「**連不上辨識服務，請確認手機與電腦在同一個 dev server 後重試**」與「重試辨識」，原本填的內容保留。這段文字對 APK 使用者沒有意義：他們沒有 dev server。

另外，就算補上 `origin`，§1.4 的 mimeType bug 仍然會讓相簿截圖失敗，兩者要一起修。

### 1.6 其他順帶發現（非阻擋）

- **沒有逾時**：`claudeHoldingRecognizer` 的 `fetch` 沒有 `AbortController`。server 端 SDK 預設逾時 10 分鐘、重試 2 次。網路卡住時「辨識中…」可能轉很久，test-plan S6 寫「超過 30 秒請回報」，但 app 自己不會停。建議客戶端 60 秒逾時，server 端 `new Anthropic({ timeout: 45_000, maxRetries: 1 })`。
- **錯誤訊息寫死開發情境**：`NETWORK_ERROR_MESSAGE`、`MISSING_API_KEY_MESSAGE`、「ANTHROPIC_API_KEY 無效，請檢查 .env」都假設使用者是工程師。上線版要換成使用者看得懂的字。
- **main 已接證交所真實清單**：`applyExtraction` 用 `stocks` 對股票，清單還在載入時每一檔都會標「請確認」（screenshot-ocr 交接筆記已提過，這裡不重複）。

---

## 2. 讓 APK 也能用：做法比較

不管選哪個做法，APK 都要**重打一次**：`origin` 是寫進 app config 的，目前沒有設定 EAS Update，無法 OTA 改。

| 做法 | 設定工作量 | 費用 | API key 安全性 | Expo Go 相容 | 備註 |
|---|---|---|---|---|---|
| **A. EAS Hosting 部署現有 API route**（推薦） | 低：程式不用改架構；`app.json` 加 `origin`、export + deploy、設 secret | 免費方案每月 100,000 次請求、1 GB 儲存（[pricing](https://expo.dev/pricing)）；Free 不會產生超額費用 | key 是 EAS 的 `secret` 環境變數，只在 server 端 | 可以（Expo Go 開發時照樣打 dev server，或改打正式網址） | 跑在 Cloudflare Workers（V8 isolate，不是完整 Node）。`@anthropic-ai/sdk` 是用 fetch 的，可以在 Workers 上跑，但要部署後實測一次 |
| B. 自己寫 Cloudflare Worker / Vercel Function | 中：把 `recognize+api.ts` 與 `recognizeHoldings.ts` 搬成另一個專案，多一套部署與 env 設定 | 兩者免費額度都足夠 Tech Day | 同 A | 可以 | 跟 A 一樣是 serverless，只是多維護一個 repo，對這個專案沒有額外好處 |
| C. `EXPO_UNSTABLE_DEPLOY_SERVER=1`（打包時自動部署） | 低，但不透明 | 同 A | 同 A | — | 文件標示為實驗性，會在 `eas build` 時順便 `eas deploy` 並寫入 `generatedOrigin`；可能和其他 session 正在調整的 `eas.json` 與打包速度工作衝突。不建議 Tech Day 前使用 |
| D. 裝置端 OCR（ML Kit / Apple Vision，例如 `@zhanziyang/expo-text-extractor`） | **高**：只回傳一行行文字，要自己寫各家券商版面的表格解析（對齊欄位、張/股、成本價 vs 現價），非常脆弱 | 免費 | 不需要 key，最安全 | **不行**：有原生程式碼，要 dev build；Expo Go 跑不了 | Android 中文模型要從 Google Play 服務下載。會讓 APK 變大，和正在進行的 APK 瘦身工作衝突。中文辨識字元本身可以，但「讀懂表格」的品質遠不如 Claude vision |

### A 的具體步驟（依 Expo SDK 58 文件）

依據：[API routes](https://docs.expo.dev/router/web/api-routes/)、[EAS Hosting get started](https://docs.expo.dev/eas/hosting/get-started/)、[EAS environment variables](https://docs.expo.dev/eas/environment-variables/)。

1. `app.json` 已經有 `web.output: "server"`（Story 005 加的）。
2. 第一次部署取得網址：
   ```bash
   npx expo export --platform web
   npx eas-cli@latest deploy            # 首次會問 preview 子網域，例如 zhuan-le-ma
   ```
   正式網址格式是 `https://<subdomain>.expo.app/`，preview 是 `https://<subdomain>--<id>.expo.app/`。
3. 設 key（secret 只存在 EAS server，網站和 CLI 都讀不到）：
   ```bash
   npx eas-cli@latest env:create --name ANTHROPIC_API_KEY --value sk-ant-... --environment production --visibility secret
   ```
   （CLI 參數名稱以 `eas env:create --help` 為準；文件也有出現 `env:set` 的寫法。）
4. 用該環境部署到正式網址：
   ```bash
   npx expo export --platform web
   npx eas-cli@latest deploy --prod --environment production
   ```
5. `app.json` 的 `plugins` 把 `"expo-router"` 改成：
   ```json
   ["expo-router", { "origin": "https://<subdomain>.expo.app" }]
   ```
   文件原話：設定之後 *relative fetch requests `fetch('/my-endpoint')` will automatically point to the server origin*。`recognizeEndpoint.ts` 在正式版本來就回 `/recognize`，不用改。
6. 重打 APK（`eas build --profile preview`），更新 GitHub Release 與下載頁。
7. 驗證：`node docs/research/screenshot-samples/recognize-samples.mjs --url https://<subdomain>.expo.app/recognize`。

注意：**不要**把 key 放進 `.env` 再 export，指望它被帶上去。文件寫的是 server 端環境變數用 `eas deploy --environment` 注入；本機 `.env` 會不會被 inline 進 server bundle，文件沒寫清楚。用 EAS secret 最確定。

---

## 3. API key 安全與濫用

### 現況

`recognize+api.ts` 與 `recognizeHoldings.ts`：

| 檢查 | 有沒有 |
|---|---|
| 驗證呼叫者（token、簽章） | 沒有 |
| 圖片大小限制 | **沒有**（實測 9 MB body 照收；Claude 單張圖上限約 5 MB，超過會回 400 並顯示成英文錯誤） |
| 請求頻率限制 | 沒有 |
| mimeType 白名單 | 有（jpeg/png/gif/webp），但信任客戶端宣告（§1.4） |
| 輸出上限 | `max_tokens: 4096`，單次費用有上限 |

部署到公開網址後，任何人都能用 curl 打 `/recognize`。GitHub repo 是公開的，網址一旦寫進 `app.json` 也就公開了。

### 最壞情況費用

單次請求最多約 6,000 input tokens（圖片 ≤ 4,784 + prompt 約 1,000）加上 4,096 output tokens，約 US$0.024 + US$0.082 ≈ **US$0.11**。有人寫個迴圈打 1 萬次就是 US$1,100。

### 最簡單可行的防護（依優先順序）

1. **Anthropic Console 設花費上限**（零程式碼，最重要）：為 Tech Day 開一個專用 workspace 與 API key，設每月 spend limit（例如 US$30）。被打爆最多就是這個數字，超過後 API 回錯誤，app 顯示「辨識服務錯誤」。活動結束後刪掉這把 key。
2. **大小檢查**：在 `recognize+api.ts` 拒絕 `imageBase64.length > 7_000_000`（約 5 MB 原圖），回 413「圖片太大」。順便在 server 用魔術位元組判斷格式（同時修 §1.4）。
3. **共享 token**：app 送 `X-Recognize-Token` header，server 比對 `process.env.RECOGNIZE_TOKEN`。token 用 `EXPO_PUBLIC_RECOGNIZE_TOKEN` 在 EAS Build 時注入（**不要** commit 進公開 repo）。它會被打包進 APK，拆包就看得到，所以只擋得住掃網址的機器人，擋不住有心人。搭配第 1 點的上限就夠 Tech Day 用。
4. **頻率限制**：EAS Hosting 文件沒有提供 KV 或內建 rate limit。Workers 的記憶體不跨 isolate 共享，用記憶體計數只能「盡力而為」（例如以 `cf-connecting-ip` 每分鐘 10 次）。可以做，但不要把它當成主要防線。

---

## 4. 費用估算

依 `claude-api` skill 的定價（2026-10-06 快取）：**Claude Opus 5.5 輸入 US$4 / 百萬 tokens，輸出 US$20 / 百萬 tokens**。Opus 5.5 屬高解析度 vision 等級：長邊上限 2576 px、每張圖最多約 4,784 tokens，圖片 tokens ≈ 寬 × 高 / 750。

| 項目 | 估算 |
|---|---|
| 圖片：1080×2340（本研究的樣本、常見 Android） | 1080×2340/750 ≈ **3,370 tokens** |
| 圖片：1179×2556（iPhone）／1440×3200（高解析 Android，縮到長邊 2576） | ≈ 4,000～4,100 tokens |
| system prompt（539 字，其中 381 個中文與全形字）＋ structured outputs 的 schema 說明 ＋ 使用者文字 | ≈ 800～1,300 tokens |
| **輸入合計** | **≈ 4,200～5,400 tokens → US$0.017～0.022** |
| 輸出：JSON 每檔約 60～80 tokens，3～7 檔 + warnings | ≈ 250～600 tokens |
| 輸出：adaptive thinking（Opus 5.5 不能關，`effort: "medium"`） | 估 300～1,500 tokens（沒實測，變異最大） |
| **輸出合計** | **≈ 550～2,100 tokens → US$0.011～0.042** |
| **每張截圖** | **≈ US$0.03～0.06** |

Tech Day 總花費（假設 30～50 位測試同學、每人 3～5 次，含重試）：100～250 次 → **US$3～15**。就算 1,000 次也只有 US$30～60。比較大的風險是 §3 的濫用，不是正常使用。

實際數字要用真 key 打一輪 `recognize-samples.mjs`，看回應的 `usage`（需要在 server 印出 `message.usage`，目前沒印）。

省錢選項（**需要使用者決定，這裡不擅自改**）：把 `RECOGNIZE_MODEL` 換成 `claude-haiku-5-5`（US$0.10 / US$0.50），每張約 US$0.001，便宜約 40 倍。但密集中文表格的辨識品質沒驗證過，要先用 4 張樣本比較再決定。

---

## 5. 辨識品質

### 模擬截圖

放在 [`screenshot-samples/`](screenshot-samples/)，全部用 HTML 畫出來、以 headless Chrome 截成 1080×2340 PNG（原始 HTML 在 `screenshot-samples/src/`）。帳號、姓名都是虛構的。每張的理想輸出寫在 [`expected.json`](screenshot-samples/expected.json)。

| 檔案 | 考點 |
|---|---|
| `01-lots-cost.png` | 表頭「庫存(張)」→ lots；欄名「成本價」；上方帳戶總覽（虛構帳號、總市值）不能當持股 |
| `02-shares-avg.png` | 卡片版面；「股數」「均價」；零股 150 股；「合計」「總成本」不能當持股 |
| `03-mixed-en-six.png` | 深色主題；中英混排（TSMC 台積電、Qty、Avg Cost）；代號帶 `.TW`；台積電一般＋零股各一列；去重後 6 檔 > 上限 5 |
| `04-cropped-unknown.png` | 台積電成本價被模糊；不在清單的「不存在公司 9999」；最後一列（聯發科）被裁掉一半 |
| `01-lots-cost.q60.jpg` | 跟 01 同一張，存成 JPEG q60，用 `--mislabel` 標成 `image/png` 送出，重現 §1.4 |

### 實測結果

**無法實測**：這台電腦的 worktree、主 checkout 和 shell 環境都沒有 `ANTHROPIC_API_KEY`。只實測了「沒有 key」的路徑：每張樣本 `POST /recognize` 都回 503 與正確的中文提示。

有 key 時跑：

```bash
cp .env.example .env    # 填 ANTHROPIC_API_KEY
npx expo start
node docs/research/screenshot-samples/recognize-samples.mjs
node docs/research/screenshot-samples/recognize-samples.mjs --mislabel
```

再拿輸出和 `expected.json` 比對。

### prompt 審查（`SYSTEM_PROMPT` + `OUTPUT_SCHEMA`）

做得好的地方：

- 規則 1 明確排除合計列、帳戶總覽，對應 01、02 的陷阱。
- 規則 2 指定「每股成本」，不是總成本或現價。
- 規則 4 要求去掉 `.TW`，domain 的 `matchExtractedToStocks` 也會再去一次，雙保險。
- 規則 5、6 鼓勵看不清楚就留 null + low，符合 AC「看不清楚的數字」。
- JSON schema 限定欄位，**模型不會把帳號、總資產帶回來**，對隱私有幫助。
- domain 端先合併同一檔、再套 5 檔上限（`applyExtraction`），所以 03 會得到「台積電 1200 股、均價 520」加上「截圖有 6 檔，只匯入前 5 檔」，符合 AC。

風險與建議（依影響排序）：

1. **單位沒標時預設「股」**（規則 3）：有些券商的表頭只寫「庫存」或「數量」，實際單位是張（例如顯示 `2`）。這會被當成 2 股，損益差 1000 倍，而且 confidence 還是 high，不會出現「請確認」。建議加一條：「沒標單位時，用市值或總成本交叉檢查：數量 × 現價 ≈ 市值就是股，數量 × 1000 × 現價 ≈ 市值就是張；檢查不了就 confidence 設 low。」
2. **「成本」欄可能是總成本**：有的 app 的「成本」是總額（例如 1,025,000）。規則 2 有寫，但建議同樣要求交叉檢查「成本 ÷ 數量」。
3. **融資、融券分頁**：01 的分頁列有「融資」。融資成本的算法不同，目前沒有規則。Tech Day 可以先不處理，在 test-plan 註明「請用現股分頁截圖」。
4. **被通知或彈窗蓋住的列**：規則 5 有涵蓋，04 會驗證到。

---

## 6. 隱私

- **截圖含什麼**：券商持股畫面通常帶證券帳號、姓名、總市值、未實現損益（見 `01-lots-cost.png` 的虛構版本）。整張圖會原樣送到 server，再送到 Anthropic。
- **Story 005 的 AC 有沒有涵蓋**：**沒有**。AC 只寫「API key 只放在電腦的 `.env`」與「結果一定要人工核對」，沒有任何情境提醒使用者「截圖會傳給第三方 AI」或「先裁掉帳號資訊」。test-plan S4 還請測試同學「把對錯的欄位記在 Issue，附截圖」，等於鼓勵把真實持股截圖貼到**公開 repo** 的 Issue。這一點應該優先改。
- **程式現況**：server 不存圖、不記 log（只有 `console.error` 未知錯誤，SDK 的錯誤物件不含 request body）；回傳 schema 只有持股欄位。上線到 EAS Hosting 後，dashboard 會記錄 requests 與 logs，但不含 body。
- **建議**：
  1. `ImportSourceSheet` 底部選單加一行提示：「截圖會傳給 AI（Anthropic Claude）辨識，不會儲存。建議先把帳號、姓名、總資產裁掉。」並在 Story 005 補一條 AC。
  2. test-plan S4 改成「Issue 只寫哪個欄位錯，不要附真實截圖；需要截圖就先打碼」。
  3. 不建議用 `allowsEditing: true` 讓使用者裁切：iOS 的系統裁切框是正方形，持股長截圖會被裁壞。用文字提醒就夠了。
  4. server 端自動裁切（例如只保留表格區）技術上做得到，但要多一次模型呼叫或影像處理，Tech Day 不划算。

---

## 建議的下一步（依優先順序）

| # | 做什麼 | 改哪些檔案 | 誰決定／阻擋 |
|---|---|---|---|
| 1 | 修 mimeType bug：server 用 base64 魔術位元組判斷格式；同時加大小上限（> 7 MB base64 回 413） | `src/server/recognizeHoldings.ts`、`src/app/recognize+api.ts`、對應 test | 不阻擋，可以馬上做 |
| 2 | 在 Anthropic Console 開 Tech Day 專用 workspace + key，設花費上限 | （無程式碼） | **使用者**：上限金額 |
| 3 | 部署 EAS Hosting、設 `ANTHROPIC_API_KEY` secret、取得正式網址 | （無程式碼；`eas deploy`） | **使用者**：要不要部署、子網域名稱 |
| 4 | `app.json` 的 `expo-router` plugin 加 `origin` | `app.json` | 等 APK 瘦身與打包速度兩個 session 改完 `app.json` 再動，避免衝突 |
| 5 | 共享 token：app 送 header、server 比對 env | `src/data/claudeHoldingRecognizer.ts`、`src/app/recognize+api.ts`、EAS env（`EXPO_PUBLIC_RECOGNIZE_TOKEN`、`RECOGNIZE_TOKEN`） | 不阻擋 |
| 6 | 上線版錯誤訊息與逾時：網路錯誤不再提 dev server；客戶端 60 秒逾時；SDK `timeout`／`maxRetries` 調低 | `src/data/claudeHoldingRecognizer.ts`、`src/server/recognizeHoldings.ts` | 不阻擋 |
| 7 | 隱私提示與 AC、test-plan S4 不附真實截圖 | `src/ui/ImportSourceSheet.tsx`、`docs/stories/005-import-from-screenshot.md`、`docs/test-plan.md` | **PO** 確認 AC 文字 |
| 8 | prompt 加單位與總成本的交叉檢查 | `src/server/recognizeHoldings.ts`（`SYSTEM_PROMPT`） | 有 key 後先跑樣本再改 |
| 9 | 重打 APK、更新 Release 與下載頁；用樣本腳本打正式網址驗證 | `eas build`；`docs/index.html`（若網址改變） | 依賴 1～5 |
| 10 | （選擇性）比較 Haiku 5.5 與 Opus 5.5 的辨識品質與費用 | `src/server/recognizeHoldings.ts`（`RECOGNIZE_MODEL`） | **使用者**：要不要為省錢換模型 |

## 參考來源

- Expo Router API routes：<https://docs.expo.dev/router/web/api-routes/>
- EAS Hosting 介紹（Cloudflare Workers）：<https://docs.expo.dev/eas/hosting/introduction/>
- EAS Hosting 開始使用：<https://docs.expo.dev/eas/hosting/get-started/>
- EAS Hosting worker runtime：<https://docs.expo.dev/eas/hosting/reference/worker-runtime/>
- EAS 環境變數（`eas deploy --environment`、secret 可見度）：<https://docs.expo.dev/eas/environment-variables/>
- Expo 價目（EAS Hosting 免費 100,000 次請求／月）：<https://expo.dev/pricing>
- 裝置端 OCR 參考套件：<https://www.jsdelivr.com/package/npm/@zhanziyang/expo-text-extractor>、ML Kit Chinese：<https://developers.google.com/ml-kit/vision/text-recognition/v2/ios>
- 本機原始碼：`@expo/metro-runtime/src/location/install.native.ts`、`expo/node_modules/@expo/cli/build/src/export/embed/exportServer.js`、`expo-image-picker/android/.../MediaHandler.kt` 與 `exporters/CompressionImageExporter.kt`、`expo-image-picker/ios/ImageUtils.swift`
