# 研究：「從截圖匯入」在真實情境能不能用

> 對象：Story 005（[docs/stories/005-import-from-screenshot.md](../stories/005-import-from-screenshot.md)）合併後的程式（`c9699fb`）。
> 日期：2026-10-27。Expo SDK 58（`expo ~58.0.19`、`expo-router ~58.0.26`、`expo-image-picker ~58.0.10`）、`@anthropic-ai/sdk ^1.3.0`、模型 `claude-opus-5-5`。
> 依據：本機 `node_modules` 原始碼、Expo 官方文件（連結附在各節）、`claude-api` skill 的定價表、本機 dev server 實測。

## 結論先講

> **2026-10-27 更新：已實作，採用的做法和下面推薦的不同。**
>
> - **辨識改走本機後端 `backend/` 的 `POST /recognize`**（和 AI 解讀 Story 017 同一台），不部署 EAS Hosting。理由：Elaine 的硬性條件是 **API key 只能留在她的電腦上**；EAS Hosting 要把 key 放進 EAS 的 secret，等於放到 Expo 的伺服器上。本機後端已經有存取碼、每 IP 頻率、每日上限、同時處理數、CORS 與 ngrok 固定網址，直接沿用（§3 的四層防護都有：存取碼、依 `X-Forwarded-For` 最後一個值的頻率限制、5 MB 上限＋看檔頭、Console 花費上限）。
> - dev server 的 `src/app/recognize+api.ts` 與 `src/server/recognizeHoldings.ts` **已刪除**，網頁版也改打後端：辨識邏輯只留一份（`backend/src/claudeRecognize.ts`），key 也只剩 `backend/.env` 一個地方。
> - **§1.4 的 mimeType bug 已修**：後端看檔頭判斷格式（`backend/src/recognizeRequest.ts`），不信任 app 的 mimeType；app 端 `src/domain/imageMimeType.ts` 依序用檔案內容 → 副檔名 → picker 的值猜一個當提示，猜不到就不送。
> - 真 key 實測 2 次（本機後端，port 8797）：`01-lots-cost.q60.jpg` **標成 `image/png` 送出**（重現手機的情況）→ 200，後端認成 `image/jpeg`，3 檔與 `expected.json` 完全一致，10 秒，4,602／563 tokens ≈ **US$0.030**；`03-mixed-en-six.png` → 200，7 列全對，並提示台積電重複，8 秒，4,602／752 tokens ≈ **US$0.033**。符合 §4 的估計。
> - 開關仍是 `screenshotImport`、預設關閉，用 `node scripts/feature-flags.mjs set screenshotImport on` 遠端打開；Tech Day 現場要先開 `npm run backend:tunnel`。完整步驟見 [architecture.md](../architecture.md) 第 7 節。
>
> 以下是實作前的研究原文，保留當紀錄。

| 情境 | 能不能用 | 一句話原因 |
|---|---|---|
| (a) 網頁版 dev server | **能**（要有 `.env` 的 key） | 同源打 `/recognize`；網頁選圖的 mimeType 是真的 |
| (b) Expo Go 掃 tunnel QR code | **網路通，但相簿截圖很可能被 API 拒收** | 網址組得對；但手機送出的 base64 一律是 JPEG，mimeType 卻寫原檔的 `image/png`（見 §1.4） |
| (c) 安裝的 APK | **一定失敗** | 正式版沒有 `hostUri`，也沒設 `origin`，`fetch("/recognize")` 是沒有主機的相對網址 |

APK 使用者按「從截圖匯入」→ 選圖 → 一定看到：

> **連不上辨識服務，請確認手機與電腦在同一個 dev server 後重試**

按「重試辨識」也一樣，因為 APK 根本不知道要打哪台伺服器。

**推薦的上線做法（§2）：** 把現有的 API route 原封不動部署到 **EAS Hosting**，當作託管代理（免費方案每月 10 萬次請求）。Anthropic API key 只放在 EAS 的 `secret` 環境變數，APK 裡沒有 key。在 `app.json` 的 `expo-router` plugin 設 `origin` 指向部署網址，然後重打 APK。

**防濫用最小設計（§3）：** 四層防護：
1. 打包時注入的 app 存取 token。
2. 依 `X-Real-IP` 的頻率限制。
3. 圖片大小上限並檢查真實格式。
4. Anthropic Console 的 Tech Day 專用 key 與每月花費上限。

真正的硬上限是第 4 層。

**費用（§4）：** 每張截圖約 **US$0.03～0.06**，Tech Day 期間估計 **US$3～15**。

**上線前一定要修 §1.4 的 mimeType bug**，否則代理部署好了，相簿截圖還是會失敗。完整的實作與手動設定清單在 §7。

---

## 0. 硬性條件與排除的方案

使用者的條件：**app 要讓其他 Android 手機下載 APK 直接用，不能讓使用者自己填 API key，key 也不能外洩。**

| 排除的方案 | 為什麼不行 |
|---|---|
| 使用者在 app 裡自己填 Anthropic API key | 違反條件。測試同學大多沒有 Anthropic 帳號與付費設定；key 存在手機上也可能外流，而且沒辦法集中撤銷或控管花費 |
| 把 key 打包進 APK（`EXPO_PUBLIC_ANTHROPIC_API_KEY` 或寫在程式裡） | `EXPO_PUBLIC_` 變數會被 inline 進 JS bundle，任何人解開 APK 就拿到**完整權限的 key**。repo 又是公開的，風險更高。key 一外洩，就只能撤銷並重打 APK |
| 手機直接呼叫 Claude API | 同上，手機端一定要帶 key |
| 裝置端 OCR（不需要 key） | 符合「不外洩 key」，但需要 dev build、會讓 APK 變大，而且要自己寫各家券商的表格解析，Tech Day 前做不完（§2 表格 D） |

所以唯一可行的架構是「**手機 → 自己的託管代理（持有 key）→ Claude**」。這正好就是現有 `src/app/recognize+api.ts` 的設計，只差把它部署到公開網址並加上防護。

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
- **修法**（2026-10-27 已照這個做，搬到 `backend/src/recognizeRequest.ts`）：server 端看 base64 開頭的魔術位元組判斷真實格式（`/9j/` = JPEG、`iVBOR` = PNG、`R0lG` = GIF、`UklG` = WebP），不信任客戶端的 mimeType。改 `src/server/recognizeHoldings.ts` 一個地方就能同時修好 (b) 和 (c)。

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

## 2. 讓 APK 也能用（最優先）：託管代理方案

**推薦：EAS Hosting。** 理由：

- 現有的 `recognize+api.ts` 就是 Expo Router API route，EAS Hosting 是 Expo 官方為它設計的託管服務，**不用搬程式碼**。
- key 存在 EAS 的 `secret` 環境變數。依文件，這種變數 *Not readable outside of the EAS servers, including on the website and in EAS CLI*。
- 每個請求都會帶 `X-Real-IP` 與 `eas-ip-country` header（[responses and headers](https://docs.expo.dev/eas/hosting/reference/responses-and-headers/)），可以拿來做頻率限制與地區限制。
- 免費方案 10 萬次請求／月，遠超過 Tech Day 用量，而且 Free 方案不會產生超額費用。
- 和 APK 用同一個 Expo 帳號與 EAS 專案（`app.json` 已有 `projectId`），不用多開平台帳號。

**主要限制：** EAS Hosting 沒有文件化的 KV、Durable Objects 或 rate limit binding，頻率限制只能放在 isolate 的記憶體裡，屬於近似值（§3）。Cloudflare Workers 原生的 Rate Limiting binding 也一樣是 *approximate and apply separately in each Cloudflare location*（[Cloudflare 文件](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)），要嚴格的全域限制得用 Durable Objects。為了「比較準的 rate limit」改用 Cloudflare 不划算，因為花費的硬上限本來就交給 Anthropic Console。

不管選哪個做法，APK 都要**重打一次**：`origin` 是寫進 app config 的，目前沒有設定 EAS Update，無法 OTA 改。

| 做法 | 設定工作量 | 費用 | API key 安全性 | Expo Go 相容 | 備註 |
|---|---|---|---|---|---|
| **A. EAS Hosting 部署現有 API route**（推薦） | 低：程式不用改架構；`app.json` 加 `origin`、export + deploy、設 secret | 免費方案每月 100,000 次請求、1 GB 儲存（[pricing](https://expo.dev/pricing)）；Free 不會產生超額費用 | key 是 EAS 的 `secret` 環境變數，只在 server 端 | 可以（Expo Go 開發時照樣打 dev server，或改打正式網址） | 跑在 Cloudflare Workers（V8 isolate，不是完整 Node）。`@anthropic-ai/sdk` 是用 fetch 的，可以在 Workers 上跑，但要部署後實測一次 |
| B. 自己寫 Cloudflare Worker / Vercel Function | 中：把 `recognize+api.ts` 與 `recognizeHoldings.ts` 搬成另一個專案，多一套部署與 env 設定 | 兩者免費額度都足夠 Tech Day | 同 A | 可以 | 跟 A 一樣是 serverless，但要多維護一個 repo。Cloudflare 有原生 Rate Limiting binding，可是一樣是各地區近似計數；Vercel 要另接 KV 才能限流。對 Tech Day 規模沒有明顯好處 |
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
7. 驗證：`node docs/research/screenshot-samples/recognize-samples.mjs --url https://<subdomain>.expo.app/recognize --token <存取 token>`。完整清單見 §7。

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

### 最小可行設計

先講一個前提：**APK 裡放的任何東西，有心人拆包都拿得到**。所以 app 端的存取碼只是「擋掉隨手亂打的人」，真正的保護靠 server 端限制，最後由 Anthropic 的花費上限兜底。設計目標是：key 永遠不出 server；就算存取碼外流，最大損失也是一個事先設好的金額。

`POST /recognize` 依序檢查（都在 `src/app/recognize+api.ts`，在呼叫 Claude 之前）：

| 順序 | 檢查 | 失敗回應 | 擋住什麼 |
|---|---|---|---|
| 1 | **存取 token**：`x-recognize-token` header 要等於 `process.env.RECOGNIZE_TOKEN`。server 沒設 `RECOGNIZE_TOKEN` 時一律拒絕（fail closed），避免忘了設就整個裸奔 | 401「app 版本過舊或未授權，請重新下載」 | 掃描網址的機器人、從公開 repo 看到網址就來打的人 |
| 2 | **頻率限制**：以 `X-Real-IP` 為 key，例如每 IP 每分鐘 5 次、每小時 30 次；另設全站每分鐘 60 次 | 429「辨識太頻繁，請稍後再試」 | 單一來源的迴圈；全站上限限制同時湧入 |
| 3 | **大小上限**：`imageBase64.length` ≤ 5,000,000（原圖約 3.7 MB；手機截圖壓縮後通常只有 100～500 KB） | 413「圖片太大，請裁切後再試」 | 大檔浪費頻寬、撞到 Claude 的單圖上限而回傳英文錯誤 |
| 4 | **真實格式**：看 base64 開頭判斷 JPEG／PNG／GIF／WebP，用判斷結果當 `media_type`，不信任客戶端的 `mimeType`；都不是就拒絕 | 400「不支援的圖片格式」 | 非圖片的垃圾資料；同時修好 §1.4 |
| 5 | （選擇性）**地區**：`eas-ip-country` 不是 `TW` 就拒絕 | 403 | 境外的大量濫用。缺點：用 VPN 或出國的測試同學會被擋，預設不開 |

**最後一層（硬上限）：Anthropic Console。** 開一個 Tech Day 專用的 workspace，在裡面建 API key，並設定每月花費上限（建議 US$30，約 500～1,000 次辨識）。到上限後 API 會回錯誤，app 顯示「辨識服務錯誤」。活動結束就刪掉這把 key。

#### 存取碼還是簽章？

| 方案 | 安全性 | 成本 | 結論 |
|---|---|---|---|
| **打包時注入的固定 token**（`EXPO_PUBLIC_RECOGNIZE_TOKEN`，值放在 EAS env，不進 repo） | 拆 APK 可取得；換 token 要重打 APK 並重新部署 | 最低，使用者零操作 | **採用** |
| HMAC 簽章（時間戳 + body 雜湊） | 簽章用的 secret 一樣在 APK 裡，拆包就能自己簽，只多了防重放 | 要在 RN 端做 HMAC，`expo-crypto` 沒有 HMAC，得加套件或自己寫 | 不划算 |
| Play Integrity／App Attest（裝置證明） | 最強 | Play Integrity 要求 app 由 Google Play 安裝；從 GitHub 側載的 APK 會被判為未認可的版本，**這個專案用不了** | 排除 |
| 每人一組存取碼（使用者輸入一次，存在手機） | 可以個別撤銷、個別限流 | 使用者要多輸入一次；server 要存碼表 | 備案：真的被濫用時再加 |

#### 頻率限制怎麼做

EAS Hosting 沒有提供 KV 或 rate limit binding（§2），所以用模組層級的 `Map` 在 isolate 記憶體計數：

- 同一個 isolate 處理的請求會共用計數。isolate 被回收或請求分散到不同 isolate／機房時，計數會重來，所以是**近似值**。
- Tech Day 的流量小，請求多半落在少數 isolate，近似值已經足以擋住單一來源的迴圈。
- 擋不住分散式的攻擊，這種情況交給 Console 的花費上限。
- 邏輯寫成純函式（`src/server/rateLimit.ts`：輸入 key 與時間，回傳是否放行），用 Jest 測，不依賴平台。

#### 不需要改的地方

- `max_tokens: 4096` 已經限制單次輸出，最壞每次約 US$0.11。
- 錯誤回應只回中文訊息，不帶 SDK 的原始錯誤細節。**例外**：`toServerError` 的 `辨識服務錯誤（status）：${error.message}` 會把英文的 API 錯誤原文回給手機。上線版建議只留狀態碼，原文記在 server log。

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

## 7. 實作步驟清單

照順序做。A 是程式（可以交給下一個 session），B 是使用者要親自在網站或 CLI 完成的設定，C 是驗收，D 是活動結束後的收尾。

### A. 要改的檔案

| # | 檔案 | 改什麼 | 備註 |
|---|---|---|---|
| A1 | `src/server/recognizeHoldings.ts` | 新增 `detectImageMediaType(base64)`：依開頭判斷格式（`/9j/` JPEG、`iVBOR` PNG、`R0lG` GIF、`UklG` WebP），用它當 `media_type`；加 `MAX_IMAGE_BASE64_LENGTH = 5_000_000`；`new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 })`；`toServerError` 不再把英文原文回給手機，改用 `console.error` 記錄；`MISSING_API_KEY_MESSAGE` 等訊息改成不提 `.env` | 同時修 §1.4 |
| A2 | `src/server/rateLimit.ts`（新） | 純函式的滑動視窗計數：`createRateLimiter({ limit, windowMs })` → `check(key, now)`；每 IP 每分鐘 5 次、每小時 30 次，全站每分鐘 60 次 | 模組層級 `Map`，近似值（§3） |
| A3 | `src/app/recognize+api.ts` | 依 §3 的順序：token（401，`RECOGNIZE_TOKEN` 沒設就拒絕）→ rate limit（429，key 用 `X-Real-IP`，沒有就退回 `X-Forwarded-For` 第一段）→ 大小（413）→ 格式（400）→ 呼叫 Claude | 地區限制先不做，留註解 |
| A4 | `src/data/claudeHoldingRecognizer.ts` | 加 header `x-recognize-token: process.env.EXPO_PUBLIC_RECOGNIZE_TOKEN`；`AbortController` 60 秒逾時；`NETWORK_ERROR_MESSAGE` 改成「連不上辨識服務，請確認網路後重試」 | `EXPO_PUBLIC_` 必須直接用 `process.env.EXPO_PUBLIC_…` 寫法才會被 inline |
| A5 | `src/data/recognizeEndpoint.ts` | 程式不用改；更新註解，說明正式版靠 `app.json` 的 `origin` | |
| A6 | `app.json` | `"expo-router"` 改成 `["expo-router", { "origin": "https://<subdomain>.expo.app" }]` | 要等 B4 拿到網址，並等 APK 瘦身與打包速度兩個 session 改完 `app.json` |
| A7 | `eas.json` | `build.preview` 加 `"environment": "preview"`，明確指定打 APK 時讀哪個 EAS 環境的變數 | 同上，等其他 session 改完 |
| A8 | `.env.example` | 加 `RECOGNIZE_TOKEN=` 與 `EXPO_PUBLIC_RECOGNIZE_TOKEN=`（本機開發時兩個填同一個值） | 本機 dev server 也會檢查 token |
| A9 | 測試 | `recognizeHoldings.test.ts`（格式判斷、大小）、`rateLimit.test.ts`（新）、`claudeHoldingRecognizer.test.ts`（header、逾時）、API route 的 401／413／429 | 跑 `npx expo lint`、`npx tsc --noEmit`、`npm test` |
| A10 | `src/ui/ImportSourceSheet.tsx` | 加隱私提示一行（§6） | |
| A11 | 文件 | Story 005 補「APK 匯入」「未授權」「太頻繁」「圖片太大」「隱私提示」的 AC；`docs/test-plan.md` S4 改成不附真實截圖、S7 改成 APK 版的錯誤；`docs/architecture.md` 第 7、8 節補部署架構 | AC 要 PO 確認 |
| A12 | `src/server/recognizeHoldings.ts`（`SYSTEM_PROMPT`） | 加單位與總成本的交叉檢查（§5） | 有 key 後先跑樣本再改 |

### B. 使用者要手動做的設定

| # | 在哪裡 | 做什麼 |
|---|---|---|
| B1 | 終端機 | 產生存取 token：`openssl rand -hex 24`，記下來（下面 B5、B6 用同一個值，**不要** commit） |
| B2 | Anthropic Console（console.anthropic.com） | 建立 workspace（例如 `cspo-techday`），在 workspace 的 limits 設定每月花費上限（建議 US$30）；在這個 workspace 裡建一把 API key。介面名稱以 Console 實際畫面為準 |
| B3 | 終端機 | `npx eas-cli@latest login`，確認 `npx eas-cli@latest whoami` 是擁有 `projectId c2ff273c-…` 的帳號 |
| B4 | 終端機 | 第一次部署取得網址：`npx expo export --platform web` → `npx eas-cli@latest deploy`，依提示選子網域（例如 `zhuan-le-ma`），正式網址是 `https://<subdomain>.expo.app` |
| B5 | expo.dev 專案的 Environment variables 頁面，或 CLI | **production** 環境建兩個 `secret` 變數：`ANTHROPIC_API_KEY`（B2 的 key）、`RECOGNIZE_TOKEN`（B1 的值）。CLI 例：`npx eas-cli@latest env:create --name ANTHROPIC_API_KEY --value <key> --environment production --visibility secret`（參數以 `env:create --help` 為準） |
| B6 | 同上 | **preview** 環境（打 APK 用）建 `EXPO_PUBLIC_RECOGNIZE_TOKEN`（B1 的值）。可見度選 `sensitive`：文件規定給客戶端的變數 *must be plain text or sensitive, not secret* |
| B7 | 終端機 | A1～A3 合併後，正式部署：`npx expo export --platform web` → `npx eas-cli@latest deploy --prod --environment production` |
| B8 | 終端機 | A4、A6、A7 合併後重打 APK：`npx eas-cli@latest build --profile preview --platform android` |
| B9 | GitHub | 把新 APK 傳到 Releases，確認下載頁 <https://kim85326.github.io/cspo/> 連到新版 |

### C. 驗收

| # | 怎麼做 | 預期 |
|---|---|---|
| C1 | `curl -X POST https://<subdomain>.expo.app/recognize -H 'Content-Type: application/json' -d '{}'`（不帶 token） | 401 |
| C2 | 帶錯的 token | 401 |
| C3 | 帶對的 token，跑 `recognize-samples.mjs --url … --token …` | 4 張樣本與 `expected.json` 大致一致；記錄每張的 `usage` 與秒數 |
| C4 | `--mislabel`（JPEG 標成 PNG） | 修好 A1 後應該正常辨識 |
| C5 | 同一台電腦一分鐘內打 6 次 | 第 6 次 429 |
| C6 | 9 MB 的 body | 413 |
| C7 | 用 Android 手機裝新 APK，跑 test-plan S1～S8 | 相簿截圖、拍照都能匯入；關掉網路時顯示新的錯誤訊息 |
| C8 | Anthropic Console 的 usage 頁 | 花費與 C3、C7 的次數相符 |

### D. 活動結束後

1. 在 Anthropic Console 刪除 Tech Day 專用 key（或停用 workspace）。之後打 `/recognize` 會得到「辨識服務錯誤」，不會再花錢。
2. 若不再需要，到 expo.dev 刪除部署，或換掉 `RECOGNIZE_TOKEN`，讓舊 APK 失效。
3. 要長期提供這個功能的話，改用每人一組存取碼（§3 備案）並重新評估模型與費用。

### 需要使用者決定的事

- Tech Day 的每月花費上限要設多少（建議 US$30）。
- EAS Hosting 的子網域名稱。
- 要不要開地區限制（只允許台灣 IP）。
- 要不要為了省錢換成 Haiku 5.5（§4）。

## 參考來源

- Expo Router API routes：<https://docs.expo.dev/router/web/api-routes/>
- EAS Hosting 介紹（Cloudflare Workers）：<https://docs.expo.dev/eas/hosting/introduction/>
- EAS Hosting 開始使用：<https://docs.expo.dev/eas/hosting/get-started/>
- EAS Hosting worker runtime：<https://docs.expo.dev/eas/hosting/reference/worker-runtime/>
- EAS 環境變數（`eas deploy --environment`、secret 可見度）：<https://docs.expo.dev/eas/environment-variables/>
- Expo 價目（EAS Hosting 免費 100,000 次請求／月）：<https://expo.dev/pricing>
- 裝置端 OCR 參考套件：<https://www.jsdelivr.com/package/npm/@zhanziyang/expo-text-extractor>、ML Kit Chinese：<https://developers.google.com/ml-kit/vision/text-recognition/v2/ios>
- EAS Hosting 請求 header（`X-Real-IP`、`eas-ip-country`）：<https://docs.expo.dev/eas/hosting/reference/responses-and-headers/>
- Cloudflare Workers Rate Limiting binding：<https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- 本機原始碼：`@expo/metro-runtime/src/location/install.native.ts`、`expo/node_modules/@expo/cli/build/src/export/embed/exportServer.js`、`expo-image-picker/android/.../MediaHandler.kt` 與 `exporters/CompressionImageExporter.kt`、`expo-image-picker/ios/ImageUtils.swift`
