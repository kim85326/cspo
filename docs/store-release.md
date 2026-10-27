# 上架研究：把「賺了嗎」送進 App Store 與 Google Play

> 研究日期：2026-10-27。專案 Expo SDK 58（`expo ~58.0.19`）、eas-cli 26.0.0、`expo-updates` 已裝。
> 來源是 Expo 官方文件（docs.expo.dev）、Apple App Store Review Guidelines、Google Play Console 說明中心，查閱日期都是今天。
> 費用、天數、審核規則都會變，動手前再對一次原文（文末有連結）。

## 結論先講

1. **技術上離上架很近。** 現在的 `eas.json` 已有 `production` profile（AAB、自動遞增版號、`production` channel），EAS Build 會幫忙產簽章，`eas submit` 會幫忙上傳。真正要補的程式設定只有三樣：`ios.bundleIdentifier`、`ios.config.usesNonExemptEncryption: false`、在 app 內放隱私權政策連結。
2. **卡關的是帳號與商店流程，不是程式。**
   - Apple：Apple Developer Program 99 美元／年，個人即可。審核通常 1～2 天。
   - Google：Google Play Console 25 美元一次。**2023-11-13 以後建立的個人帳號，正式上架前要先跑封閉測試：至少 12 位測試者連續 14 天**，再申請 production 權限（Google 審 7 天內）。這是整個時程裡最長的一段，要最早開始。
3. **截圖匯入（Story 005）上架版先關掉，或先部署 server。** 辨識功能靠 dev server 上的 API route 與 `ANTHROPIC_API_KEY`，商店版沒有 dev server。功能開關 `EXPO_PUBLIC_FEATURE_SCREENSHOT_IMPORT` 預設關閉，第一版維持關閉最省事；要開就得把 API route 部署到 EAS Hosting 並設 `origin`（見第 6 節）。
4. **兩個商店都要隱私權政策網址，兩個商店都有「資料安全」問卷。** 這個 app 持股存在手機、行情打證交所、不蒐集個資，問卷很好填，但要有一個公開網址放政策文字，建議直接放在現有的 GitHub Pages（`docs/`）。
5. **行銷素材要準備：** App Store 要 6.9 吋 iPhone 截圖至少 2 張（`supportsTablet: true` 的話 iPad 13 吋也要 2 張）；Google Play 要 512×512 圖示、1024×500 feature graphic、截圖至少 4 張、短描述 80 字、完整描述 4000 字內。

| 項目 | iOS（App Store） | Android（Google Play） |
|---|---|---|
| 開發者帳號 | 99 美元／年，個人可 | 25 美元一次，個人可 |
| 打包 | `eas build -p ios --profile production` → `.ipa` | `eas build -p android --profile production` → `.aab` |
| 上傳 | `eas submit -p ios` → TestFlight | `eas submit -p android` → 內部測試軌道 |
| 上架前測試 | TestFlight（內部測試者不用審；外部測試者要 Beta App Review） | **封閉測試 12 人 × 14 天**（新個人帳號必做） |
| 審核 | App Review，通常 24～48 小時 | 第一次 production 審核 7 天內，之後通常幾小時到幾天 |
| 必填表單 | App Privacy（資料蒐集宣告）、出口合規、隱私權政策網址 | Data safety、Financial features、內容分級、目標對象、隱私權政策網址 |
| 預估最短時程 | 帳號核准後約 1 週 | **帳號核准後約 4 週**（14 天測試＋審核＋前置） |

---

## 1. 現況盤點：已經有什麼、還缺什麼

### 已經就位

| 項目 | 現況 | 出處 |
|---|---|---|
| EAS 專案 | `projectId` 已設，帳號 `elaine0326`（Owner） | `app.json` → `extra.eas.projectId` |
| Android 套件名 | `com.elaine0326.cspo` | `app.json` → `android.package` |
| Android 簽章 | preview APK 打過，EAS 已產 keystore 並保管 | EAS credentials |
| production profile | `autoIncrement: true`、`channel: "production"`，預設產 `.aab` | `eas.json` |
| 版號來源 | `appVersionSource: "remote"`，EAS 管 versionCode／buildNumber | `eas.json` |
| 圖示 | `icon.png` 1024×1024；Android adaptive icon 三張齊全 | `assets/` |
| OTA | `expo-updates` 已裝，`runtimeVersion.policy: "fingerprint"` | `app.json` |
| 權限文案 | 相簿、相機的用途說明已寫在 `expo-image-picker` plugin | `app.json` |

### 還缺的（程式端）

| 項目 | 要做什麼 | 為什麼 |
|---|---|---|
| `ios.bundleIdentifier` | `app.json` 加 `"ios": { "bundleIdentifier": "com.elaine0326.cspo" }` | 沒有這個 iOS 連 build 都跑不了 |
| 出口合規 | `app.json` 加 `"ios": { "config": { "usesNonExemptEncryption": false } }` | app 只用 HTTPS，屬豁免；設了之後每次上傳 TestFlight 不會再被問 |
| 隱私權政策 | 寫一頁放到 GitHub Pages（例如 `docs/privacy.html`），app 內「關於」或設定頁放連結 | Apple 5.1.1(i) 要求「App Store Connect 欄位與 app 內都要有連結」；Google 也要網址 |
| 免責聲明 | app 內加一行「行情為前一交易日收盤價，僅供參考，非投資建議」 | 降低 Apple 把它當成金融服務 app 審的機率（見第 5 節） |
| 截圖匯入 | 第一版確認功能開關關閉；或部署 API route（第 6 節） | 商店版連不到 dev server |
| 歡迎畫面 | `app.json` 沒設 `expo-splash-screen` plugin，`splash-icon.png` 沒被用到 | 現在是預設白底；不擋上架，但看起來像沒做完 |
| 版本號 | 上架第一版 `expo.version` 維持 `1.0.0`；之後每次送審改這個，build number 交給 autoIncrement | Apple 與 Google 都不接受重複的 build number |

### 還缺的（帳號與商店端）

- Apple Developer Program：用 Apple ID 報名，個人要做身分驗證，通常 1～2 個工作天核准。付款後才能建 App Store Connect 的 app 紀錄。
- Google Play Console：註冊 25 美元，要身分驗證（證件）。核准後建 app、填 store listing、填各種宣告。
- 一個公開網址放隱私權政策（GitHub Pages 已經有了）。
- 至少 12 位願意裝 Play 封閉測試版並維持 14 天不退出的人（可以就是現在用 APK 的測試同學，再多找幾位）。

---

## 2. iOS：從零到 App Store

### 2.1 帳號與 App Store Connect

1. [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) 用 Apple ID 報名，個人 99 美元／年。Apple ID 要開雙重驗證。
2. 核准後到 [App Store Connect](https://appstoreconnect.apple.com/) → Apps → 「+」新增 app：平台 iOS、名稱「賺了嗎」、主要語言「繁體中文」、Bundle ID（第一次 `eas build` 時 EAS 可以自動幫你在 Developer Portal 註冊 `com.elaine0326.cspo`，或自己先在 Certificates, Identifiers & Profiles 建）、SKU 隨便填一個不重複的字串（例如 `cspo`）。
3. 建好後 App Information 頁的「Apple ID」那串數字就是 `ascAppId`，寫進 `eas.json`。

### 2.2 專案設定

`app.json`：

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.elaine0326.cspo",
  "config": { "usesNonExemptEncryption": false }
}
```

`eas.json` 的 submit 區塊：

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "<App Store Connect 的 Apple ID 數字>"
    }
  }
}
```

`supportsTablet: true` 代表 App Store 會要求 iPad 截圖，而且審核員可能在 iPad 上測。第一版若不想顧 iPad 排版，把它改成 `false`，只上 iPhone。

### 2.3 打包與上傳

```bash
npx eas-cli build -p ios --profile production
```

第一次會要你登入 Apple 帳號，EAS 自動建 distribution certificate 與 provisioning profile，並保管在 EAS 上。iOS 打包在 EAS 免費方案上一樣有每月額度，排隊時間比 Android 長。

```bash
npx eas-cli submit -p ios --latest
```

或打包時直接加 `--auto-submit`，打完自動送。上傳後 10～15 分鐘出現在 TestFlight。

### 2.4 TestFlight 測試

- **內部測試者**（App Store Connect 的 Users and Access 裡的人，最多 100 位）：不用審，上傳完馬上能裝。
- **外部測試者**（用 email 或公開連結邀，最多 10,000 位）：第一個 build 要過 Beta App Review（通常 1 天），之後同一版的新 build 不用再審。
- 測試者裝 TestFlight app，收到邀請就能裝。這是 iOS 版給測試同學用的管道，取代 Expo Go。

### 2.5 送審

在 App Store Connect 的 app 頁面：

1. **App Information**：名稱、副標題、類別（建議 Finance）、隱私權政策網址。
2. **Pricing and Availability**：免費、選台灣（或全球）。
3. **App Privacy**：資料蒐集宣告（見第 4 節）。
4. **版本頁（1.0 Prepare for Submission）**：截圖、描述、關鍵字、支援網址、選 build、聯絡資訊、審核備註。
5. **App Review Information**：沒有登入所以不用 demo 帳號；備註裡說明「行情來自台灣證券交易所公開資料，持股只存在裝置上，不連券商、不交易」。這段話能省掉審核員的疑問。
6. Submit for Review。通常 24～48 小時內有結果；被退回可以在 Resolution Center 回覆或申訴。
7. 審核通過後可以選「手動發布」或「自動發布」。

---

## 3. Android：從零到 Google Play

### 3.1 帳號與 Play Console

1. [play.google.com/console/signup](https://play.google.com/console/signup) 註冊個人開發者帳號，25 美元一次，要證件驗證。
2. 核准後「Create app」：名稱「賺了嗎」、預設語言「中文（繁體）」、App、免費。
3. 建好先填 **Dashboard 上的「Set up your app」清單**：隱私權政策網址、App access（無登入）、廣告（無）、內容分級問卷、目標對象（18 歲以上最單純）、新聞 app（否）、Data safety（第 4 節）、Financial features（第 4 節）、政府 app（否）。這些沒填完，任何軌道都不能發布。
4. Store listing：短描述（80 字）、完整描述（4000 字）、512×512 圖示、1024×500 feature graphic、手機截圖至少 4 張。

### 3.2 Google Service Account（給 `eas submit` 用）

EAS Submit 要用一把 Google Service Account 的 JSON key 代替你上傳。照 Expo 的 [Google Service Account 指南](https://github.com/expo/fyi/blob/main/creating-google-service-account.md) 做：到 Google Cloud Console 建 service account、下載 JSON key、回 Play Console 的 Users and permissions 邀請這個 service account 的 email 並給 app 的 Release 權限。然後：

```bash
npx eas-cli credentials -p android
```

選 `production` → Google Service Account → 上傳 JSON，EAS 幫你保管，之後 `eas submit` 不用再帶檔案。JSON 不要 commit（`.gitignore` 已擋 `*.key`，但 `.json` 沒擋，放在專案外最保險）。

### 3.3 打包與上傳

```bash
npx eas-cli build -p android --profile production
```

production profile 沒設 `buildType`，預設產 `.aab`（Play 只收 AAB，不收 APK）。EAS 會沿用 preview 已經產的 keystore 當 upload key；Play 會啟用 Play App Signing，用 Google 自己的 key 重簽。

**第一次上傳建議手動**：到 Play Console 的 Testing → Closed testing 建一個軌道，把 `.aab`（從 EAS 的 build 頁面下載）拖上去。這一步會把 upload key 的指紋登記進 Play App Signing，之後 `eas submit` 就能自動上傳：

```bash
npx eas-cli submit -p android --latest
```

`eas.json` 可以指定軌道，封閉測試期間用：

```json
"submit": {
  "production": {
    "android": { "track": "internal", "releaseStatus": "draft" }
  }
}
```

`internal`（內部測試，最多 100 人、不用審、立即生效）適合先給同學；封閉測試軌道的名字是你在 Console 建的，`track` 填 `alpha` 對應 Console 的預設封閉測試軌道。

### 3.4 封閉測試 12 人 × 14 天（新個人帳號必做）

Google 的規定（[Play Console 說明：App testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)）：

- 適用 **2023-11-13 之後建立的個人帳號**；組織帳號不用。
- 要有 **至少 12 位測試者，連續 14 天保持加入**。有人中途退出再加入，14 天重算。
- 測試者要「真的用」，Google 2026 年起會看互動。
- 14 天滿之後在 Dashboard 按「Apply for production」，回答問卷（招募難易、測試者回饋、目標受眾、第一年預估安裝量、根據回饋改了什麼）。Google 通常 7 天內回覆，也可能要求繼續測。

實務建議：

- 測試者用 Google 帳號 email 名單加入（Console 可建 email list），或建 Google Group。
- 現在的 APK 測試同學就是現成的 12 人，再多邀幾位當緩衝，掉到 11 人就重算。
- 封閉測試版與現在的 GitHub Release APK 可以並行，但同一支手機不能同時裝兩種簽章不同的版本。EAS 用同一把 keystore 簽 preview APK 與 production AAB，但 Play 會用 Play App Signing 的 key 重簽，所以**從 Play 裝的版本與從 GitHub 裝的 APK 簽章不同**，要先解除安裝一個才能裝另一個。
- 測試期間 OTA 一樣能用（第 7 節），不用一直重打。

### 3.5 正式發布

Production 權限核准後，Production → Create new release → 選已經在測試軌道的 build 或重新上傳 → 填 release notes → Review release → Start rollout。可以分階段發布（先 20%）。第一次 production 審核可能數天，之後的更新通常幾小時到幾天。

---

## 4. 兩個商店都要填的隱私與合規表單

這個 app 的資料流（填表前先確認）：

| 資料 | 去哪裡 | 怎麼宣告 |
|---|---|---|
| 持股（代號、股數、成本） | 只存在手機的 AsyncStorage | 不離開裝置，**不算蒐集** |
| 行情查詢 | 手機直接打 `openapi.twse.com.tw`（HTTPS） | 沒有帶個資，不算蒐集 |
| 持股截圖（Story 005） | 開啟時 POST 到辨識 server，再轉給 Anthropic API | **算蒐集「照片」**，用途「app 功能」；若 server 不存檔、辨識完即丟，可勾「臨時處理」。第一版關閉的話不用宣告 |
| 分析、廣告、崩潰回報 | 沒有 | 無 |

### Apple：App Privacy

App Store Connect → App Privacy。第一版（截圖匯入關閉）選 **「Data Not Collected」**。若開啟截圖匯入，宣告 Photos or Videos → 用途 App Functionality → 不與身分連結 → 不用於追蹤，並在隱私權政策寫明「圖片僅用於辨識、不儲存、會傳給 Anthropic 處理」。Apple 5.1.2(i) 明文要求「與第三方 AI 分享個人資料前要清楚揭露並取得同意」，所以辨識前的畫面要有一句說明（product-spec 第 486 行已經規劃了）。

### Apple：Privacy manifest

Expo SDK 的套件自帶 `PrivacyInfo.xcprivacy`（AsyncStorage 用的 UserDefaults 等），EAS Build 會合併。若上傳後收到 Apple 的「Missing API declaration」email，照 email 列的 API 類別補到 `app.json` → `ios.privacyManifests`（[Expo 說明](https://docs.expo.dev/guides/apple-privacy/)）。

### Apple：出口合規

`usesNonExemptEncryption: false` 設了就自動回答「只用標準 HTTPS」，不用每次在 TestFlight 手動點。

### Google：Data safety

Policy → App content → Data safety。第一版：不蒐集、不分享任何資料；資料傳輸有加密（HTTPS）；因為不蒐集，「可要求刪除」選不適用。開啟截圖匯入時，照上表宣告「Photos」。

### Google：Financial features declaration

**所有 app 都要填**，不只金融 app。這個 app 選「不提供任何金融功能」（它不放貸、不交易、不管錢）。

### Google：其他宣告

- 內容分級問卷：沒有暴力、賭博等，會拿到「3+」或「Everyone」。
- 目標對象：18 歲以上，避開兒童政策。
- 廣告：無。
- App access：所有功能無需登入。

### 隱私權政策要寫什麼

Apple 5.1.1(i) 的三個要求：（1）蒐集什麼資料、怎麼蒐集、用途；（2）第三方拿到資料時提供同等保護；（3）資料保留與刪除方式、使用者如何撤回同意。對這個 app，一頁就夠：

- 持股資料只存在使用者裝置，開發者不會取得；刪除 app 即刪除。
- 行情查詢直接向台灣證券交易所取得，不經開發者伺服器。
- 截圖匯入（若有）：圖片僅用於辨識持股，傳送給開發者伺服器與 Anthropic 處理後即丟棄，不儲存、不用於其他用途。
- 不使用廣告、分析、追蹤工具。
- 聯絡方式（email）。

放在 `docs/privacy.html`，網址就是 `https://kim85326.github.io/cspo/privacy.html`。app 內的「關於」頁用 `expo-linking` 的 `openURL` 連過去。

---

## 5. 審核風險：Apple 會不會把它當金融 app

Apple 審核指南裡有兩條可能碰到：

- **3.2.1(viii)**：「用於金融交易、投資或資金管理的 app 應由提供該服務的金融機構提交，並具備必要執照」。
- **5.1.1(ix)**：「高度管制領域（如銀行、金融服務）或需要敏感個資的 app 應由提供服務的法人提交，而非個人開發者」。

「賺了嗎」不交易、不連券商、不碰資金，只是使用者自己輸入持股後用公開收盤價算盈虧，本質是計算機。這類 portfolio tracker 由個人上架的很多，一般會過。降低風險的做法：

1. 審核備註與 app 描述都講清楚：「僅供個人記錄與試算，不提供交易、不連接券商帳戶、非投資建議」。
2. app 內顯示免責聲明（行情為前一交易日收盤價、非投資建議）。
3. 類別選 Finance 沒問題，但副標題與描述避免「投資」「理財服務」這類會觸發 3.2.1 的字眼，用「持股損益計算」「自己算賺了多少」。
4. **5.2.2** 要求使用第三方資料要有授權。證交所 OpenAPI 是政府開放資料（政府資料開放授權條款），可自由使用；描述或關於頁註明「資料來源：臺灣證券交易所」即可。

Google 這邊，Financial features 選「無」後，一般的 Financial Services 政策不會套用。

另外 Apple **2.1(a)** 要求送審版本是最終版、沒有佔位文字；**4.2** 要求不能只是網頁包殼。這個 app 是原生 UI，沒問題。但如果截圖匯入功能開關打開又沒有 server，審核員點了會看到連線錯誤，會被 2.1 退回。所以第一版把它關掉，或確定 server 在線。

---

## 6. 截圖匯入功能要上架，server 怎麼辦

現況：`src/app/recognize+api.ts` 是 Expo Router 的 API route，只在 `npx expo start` 的 dev server 上跑；手機用 `expoConfig.hostUri` 組網址，商店版沒有 hostUri，連不到。功能開關預設關，所以商店版使用者看不到這個入口。

要在商店版開放，Expo 的做法（[API routes 文件](https://docs.expo.dev/router/reference/api-routes/)）：

1. 把 server 部署到 EAS Hosting：`npx expo export -p web` 然後 `npx eas-cli deploy`，第一次會建一個 `*.expo.app` 網址。`ANTHROPIC_API_KEY` 用 `eas env:create --environment production` 設在 EAS 的環境變數，不進 bundle。
2. `app.json` 的 expo-router plugin 設 `origin`：
   ```json
   ["expo-router", { "origin": "https://<你的>.expo.app" }]
   ```
   並改 `src/data/recognizeEndpoint.ts`，production 時走 `origin` 而不是 `hostUri`。
3. 重打 production build（改了 `app.json`，fingerprint 會變）。
4. 要考慮的事：API key 是你的，每次辨識都是你付錢；公開的 endpoint 沒有驗證任何人都能打，至少要加簡單的 rate limit 或 app 端 token。這是上架版開放此功能前要做的決定，不是純技術問題。

第一版建議：**關閉截圖匯入上架**，先把核心的「輸入持股算盈虧」送出去。等 server 與費用問題有答案再用 OTA 打開（功能開關是 `EXPO_PUBLIC_` 變數，改了要重新 `eas update`，不用重打）。

---

## 7. 上架後怎麼更新

跟現在給測試同學的兩條路一樣，只是 channel 換成 `production`：

| 改了什麼 | 做法 |
|---|---|
| 只有 JS／畫面／文案／圖片 | `npx eas-cli update --channel production --environment production -m "改了什麼"`，使用者重開 app 兩次就是新版，**不用送審** |
| 原生（套件、`app.json`、SDK 升級） | 改 `expo.version`（例如 1.0.1）→ `eas build --profile production` → `eas submit` → 兩個商店各自審一次 |

- Apple 與 Google 都允許 OTA 更新 JS，前提是「不改變 app 的核心用途」。加一個小功能、修 bug 都在範圍內。
- 現在的 `npm run ota` 腳本寫死 `preview` channel 與「最新的 preview APK」，上架後要加一個 production 版本（或加參數），fingerprint 比對要改成比對最新的 production build。
- `npm run release` 是給 GitHub Release APK 用的，上架後測試同學可以改走 TestFlight／Play 內部測試軌道，這條就可以退役。
- 版本策略：`expo.version` 只在送審時手動改；`versionCode`／`buildNumber` 由 EAS `autoIncrement` 管，不用碰。

---

## 8. 建議順序與時程

從「今天決定要上架」算起，Android 的 14 天測試是關鍵路徑，所以先開 Google 的流程：

| 週 | 做什麼 |
|---|---|
| 第 1 週 | 註冊 Google Play Console 與 Apple Developer（兩邊各 1～3 天核准）。寫隱私權政策放上 GitHub Pages。`app.json` 補 `bundleIdentifier`、出口合規、免責聲明、關於頁連結。準備商店文案與截圖。 |
| 第 2 週 | Play Console 建 app、填完所有宣告與 store listing。`eas build -p android --profile production`，手動上傳第一個 AAB 到封閉測試軌道，邀 12+ 位測試者。**14 天計時開始。** 同時 `eas build -p ios --profile production` → `eas submit` → TestFlight 內部測試。 |
| 第 3 週 | iOS 填完 App Store Connect 的表單與截圖，送審。被退回就改、回覆、重送。Android 測試中，有 bug 用 OTA 修。 |
| 第 4 週 | iOS 通常已上架。Android 14 天滿，Apply for production，等 Google 回覆（最多 7 天）。 |
| 第 5 週 | Android production rollout。 |

如果 Google 帳號是 2023-11 以前建的，或用公司的組織帳號，Android 可以省掉 14 天，跟 iOS 同步在第 3～4 週上架。

### 上架前檢查清單

- [ ] `app.json`：`ios.bundleIdentifier`、`ios.config.usesNonExemptEncryption: false`
- [ ] `eas.json`：`submit.production.ios.ascAppId`；Android service account 已上傳到 EAS
- [ ] `.env.local` 沒有開著 `EXPO_PUBLIC_*=1`（假價、截圖匯入）
- [ ] 隱私權政策網址可以打開；app 內有連結
- [ ] app 內有免責聲明與「資料來源：臺灣證券交易所」
- [ ] 歡迎畫面（splash）設好，不是預設白底
- [ ] `npm run check` 全綠
- [ ] 在真機上用 production build（不是 Expo Go）跑過 test-plan.md 的手動清單
- [ ] 商店素材：iPhone 6.9 吋截圖 ≥ 2 張（1320×2868）、Play 截圖 ≥ 4 張、512×512 圖示、1024×500 feature graphic、描述文案
- [ ] App Store Connect：App Privacy 填完、審核備註寫了「不交易、不連券商、持股只存裝置」
- [ ] Play Console：Data safety、Financial features、內容分級、目標對象、App access 都填完

---

## 參考來源

Expo（SDK 58 文件，2026-10 查閱）：

- [EAS Submit 介紹](https://docs.expo.dev/submit/introduction/)、[送 App Store](https://docs.expo.dev/submit/ios/)、[送 Google Play](https://docs.expo.dev/submit/android/)
- [建立正式版 build](https://docs.expo.dev/build/setup/)、[eas.json 參考](https://docs.expo.dev/eas/json/)、[版號管理](https://docs.expo.dev/build-reference/app-versions/)
- [商店素材規格](https://docs.expo.dev/guides/store-assets/)、[iOS 隱私清單](https://docs.expo.dev/guides/apple-privacy/)
- [API routes 部署](https://docs.expo.dev/router/reference/api-routes/)、[EAS Update 入門](https://docs.expo.dev/eas-update/getting-started/)
- [app.json 欄位參考（v58）](https://docs.expo.dev/versions/v58.0.0/config/app/)

Apple：

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)：2.1 完整性、3.2.1(viii) 金融 app、4.2 最低功能、5.1.1 隱私權政策、5.1.2(i) 第三方 AI 揭露、5.2.2 第三方內容授權
- [Apple Developer Program 報名](https://developer.apple.com/programs/enroll/)

Google：

- [App testing requirements（12 人 14 天）](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Data safety 表單](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Financial features 宣告](https://support.google.com/googleplay/android-developer/answer/13849271)
