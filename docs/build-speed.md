# 讓測試同學更快拿到新版（EAS Android 打包加速）

> 研究日期：2026-10-27。專案 Expo SDK 58（`expo ~58.0.19`）、eas-cli 26.0.0。
> 量測數據來自 `eas build:view <id> --json` 的 `metrics` 與 build log（log 每一行都帶 `phase` 與時間戳）。
> 標「實測」的是量到的數字，標「估計」的是推算，第一次照做時請記下實際時間，回來更新這份文件。

## 結論先講

1. **最有效：導入 EAS Update（OTA）。** 只改 JS／TS／圖片時不用重新打 APK，`eas update` 發佈後，測試同學重開 app 就能拿到新版。估計 2～3 分鐘，不用排隊，也不吃每月 15 次的打包額度。要先裝 `expo-updates` 並重打一次 APK，**需要使用者決定要不要導入**。
2. **原生有變才打 APK，而且要用瘦身後的設定。** APK 瘦身 session 的 commit `085a617`（只打 arm64-v8a、排除沒用到的 reanimated／worklets／gesture-handler）已實測把 build 從 **18.1 分降到 7.2 分**。
3. **再加 Gradle cache**：在 `eas.json` 的 preview profile 設 `EAS_GRADLE_CACHE=1`。Expo 官方說約可省 50%，估計 7 分可以再降到 5 分左右，但 lockfile 一變就會 miss（見第 3 節）。
4. 排隊實測只有約 5 秒，目前不是瓶頸。本機打包在這台 Mac 上還要先裝 Android SDK，Tech Day 期間不值得，留作備案。

| 情境 | 現在 | 照這份文件做之後 |
|---|---|---|
| 只改 JS／圖片，同學用 Expo Go | 存檔後幾秒（tunnel dev server） | 不變 |
| 只改 JS／圖片，同學用 APK | 重打 APK：15～18 分（實測）＋下載安裝 | `eas update` 後重開 app：**約 2～3 分**（估計） |
| 改了原生（加原生套件、改 app.json 原生欄位、升 SDK） | 15～18 分（實測） | 7.2 分（實測，瘦身後）；加 Gradle cache 約 5 分（估計） |

---

## 1. 18 分鐘花在哪（實測）

用 `npx eas-cli build:view <id> --json` 拿到 `metrics`（單位毫秒），再下載 `logFiles` 裡的 log（brotli 壓縮的 JSON lines），依 `phase` 加總時間。

| Build | Commit | 排隊（`buildQueueTime`） | 總時間（建立→完成） | `RUN_GRADLEW` | 其他階段合計 |
|---|---|---|---|---|---|
| `d6992925`（第一次） | `b67cd41` | 4.7 秒 | **18.1 分** | 1026 秒（17.1 分，95%） | 約 55 秒 |
| `99dc7738`（第二次） | `5856951` | 5.2 秒 | **14.9 分** | 826 秒（13.8 分，93%） | 約 60 秒 |
| `71d5a8c3`（瘦身後） | `085a617` | 4.6 秒 | **7.2 分** | 372 秒（6.2 分） | 約 55 秒 |

「其他階段」的內容：`npm ci` 約 20 秒、`expo-doctor` 4 秒、`prebuild` 4 秒、`EAGER_BUNDLE` 10～17 秒、上傳 APK 1～9 秒、存取 cache 3～5 秒。這些加起來不到 1 分鐘，要加速只能從 Gradle 下手。

**建置機器**：log 顯示 `AMD, 4 vCPUs, 15.62 GB RAM`，也就是 Android 預設的 `medium` resource class（[Build server infrastructure](https://docs.expo.dev/build-reference/infrastructure/)：medium 4 vCPU／16 GB，large 8 vCPU／32 GB）。

**Gradle 裡面的時間**（取自 log 的 `GRADLE_BUILD_PROFILE`，第一次 build，task 時間合計 927 秒）：

| 項目 | 時間 | 佔比 |
|---|---|---|
| C++（CMake configure／build），四種 ABI 合計 | 約 573 秒 | 62% |
| └ arm64-v8a／armeabi-v7a／x86／x86_64 | 163／105／146／160 秒 | 非 arm64 的三種合計約 411 秒 |
| Kotlin／Java 編譯（含 Gradle plugin 本身） | 約 160 秒 | 17% |
| JS bundle（`createBundleReleaseJsAndAssets`） | 35 秒 | 4% |
| 依模組看：`expo-modules-core` 220 秒、`react-native-worklets` 140 秒、`react-native-reanimated` 134 秒、`react-native-screens` 125 秒、`react-native-gesture-handler` 58 秒 | | |

**ccache 其實已經開了**：log 的環境變數有 `EAS_USE_CACHE=1`、`EAS_GRADLE_CACHE=0`。`eas env:list` 查不到這些變數，所以是 EAS 預設帶的。第一次 build 的 ccache 命中率 0%（沒有舊 cache）。第二次用前綴比對還原了 cache，命中率 47%，但 `expo-modules-core`、`reanimated` 的 CMake 時間幾乎沒變。省下的 3 分鐘有一部分可能只是誤差。結論是 ccache 效果有限，不能靠它。

## 2. 減少要編的東西

> 這一節由 **APK 瘦身 session** 負責實作，已在 commit `085a617` 完成（`app.json` 加 `expo-build-properties`，`package.json` 加 `expo.autolinking.android.exclude`）。這裡只估效果，並用它的 build 驗證。

| 做法 | 估計效果 | 實測 | 依據 |
|---|---|---|---|
| 只打 `arm64-v8a`（`expo-build-properties` 的 `android.buildArchs`，預設四種 ABI 全打） | 少掉非 arm64 的 CMake 約 411 秒，**約 7 分** | 和下一項合併實測：Gradle 從 1026 秒降到 372 秒（−11 分），總時間 18.1 → **7.2 分** | [BuildProperties](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/) |
| 排除沒用到的 `reanimated`／`worklets`／`gesture-handler` | 三者合計約 330 秒；只打 arm64 之後剩下它們 arm64 那一份，約 1.5～2 分 | 同上 | 這三個是 `expo-router` 的 optional peer（`node_modules/expo-router/package.json` 的 `peerDependenciesMeta`），但 `react-native-drawer-layout` 依賴它們，npm 會自動裝進 `node_modules`，autolinking 就會把它們編進 APK |
| 開 R8（`enableMinifyInReleaseBuilds`）／`shrinkResources` | 為了縮小 APK，會**增加**少量打包時間 | 已含在 7.2 分裡 | 同上 |
| preview 改成 debug（`gradleCommand: ":app:assembleDebug"`） | 只省 JS bundle 與 lintVital 約 1 分，但 debug APK 不內嵌 JS，要連 dev server 才能用，等於 Expo Go 的體驗。**不建議** | — | [eas.json](https://docs.expo.dev/eas/json/) 的 `gradleCommand`；[expo-updates](https://docs.expo.dev/versions/v58.0.0/sdk/updates/) 說 debug build 預設一律從 dev server 載 JS |

要注意：只打 arm64 之後，APK 不能裝在 x86 模擬器上。Apple Silicon Mac 的 Android 模擬器和實體手機都是 arm64，所以不受影響。

瘦身之後 Gradle 剩下最大的幾項（`71d5a8c3`，合計 475 秒）：`expo-modules-core` C++ 59 秒、`app` C++ 59 秒、`safe-area-context` Kotlin 51 秒、`expo-modules-core` Kotlin 40 秒、JS bundle 24 秒、`lintVitalAnalyzeRelease` 20 秒。這些都是必要模組，再砍要靠 cache。

## 3. EAS 本身的加速

### 3a. Build cache

| Cache | 現況 | 怎麼開 | 免費方案 | 依據 |
|---|---|---|---|---|
| npm／Maven 下載 cache server | 預設開 | 不用動（`EAS_BUILD_DISABLE_NPM_CACHE` 等變數是用來關的） | 文件未提限制 | [Cache dependencies](https://docs.expo.dev/build-reference/caching/) |
| ccache（C/C++ 編譯結果） | **已開**（log 有 `EAS_USE_CACHE=1`），效果有限，見第 1 節 | `env.EAS_USE_CACHE: "1"` | 文件未提限制，本專案免費方案實際有在用 | 同上 |
| **Gradle cache** | **沒開**（log 有 `EAS_GRADLE_CACHE=0`） | `eas.json` build profile 的 `env` 設 `"EAS_GRADLE_CACHE": "1"`，或設成帳號的環境變數 | 公告未提方案限制 | [Expo changelog：Gradle cache for Android builds（2026-04-30）](https://expo.dev/changelog/gradle-cache) |
| `cache.paths` 自訂路徑 | 沒用 | `eas.json` 的 `cache.key`／`cache.paths` | — | [eas.json](https://docs.expo.dev/eas/json/) |
| `node_modules` | 不會被 cache。每次都跑 `npm ci`（約 20 秒），不值得處理 | — | — | log 的 `INSTALL_DEPENDENCIES` |

**Gradle cache 的效果**（估計）：官方說「around a 50% reduction in build times」。瘦身後的 Gradle 有 372 秒，其中 Kotlin／Java 編譯和 C++ 都是可以 cache 的 task，估計可以降到 3～4 分，總時間約 **5 分**。

**限制**：cache key 是 lockfile（`package-lock.json`）的 hash。
- 只改 `app.json` 原生欄位，例如 icon、權限文字：lockfile 不變，**會命中**。
- 新增或升級原生套件：lockfile 會變，**第一次一定 miss**，要到下一次 build 才吃得到 cache。
- 驗證方法：在 build log 的 Run gradlew 階段找 `FROM-CACHE`。`71d5a8c3` 一筆都沒有，因為還沒開。

### 3b. Resource class

- Android 預設 `medium`（4 vCPU／16 GB）。`large`（8 vCPU／32 GB）**免費方案不能用**（[eas.json](https://docs.expo.dev/eas/json/)：「The `large` resource class is not available on the free plan」）。
- 依 [pricing](https://expo.dev/pricing)：
  - Starter 每月 19 美元，含 45 美元 build credit。Android medium 每次 1 美元，large 每次 2 美元。
  - 付費方案是 high priority 佇列，build timeout 是 2 小時（免費方案 45 分鐘）。
- 效果（估計）：C++ 編譯可以吃滿多核心，large 大約能讓 Gradle 快 30～45%，7.2 分大約變 5 分。但這要付費，效果也和 Gradle cache 重疊。**Tech Day 期間不建議為了這個升級方案。**

### 3c. 排隊與額度

- **排隊**：四次 build 的 `buildQueueTime` 都是 4.5～5.2 秒（priority 欄位是 `NORMAL`／`NORMAL_PLUS`）。免費方案在 [plans](https://docs.expo.dev/billing/plans/) 寫的是「low-priority builds」，尖峰時段可能排比較久。避開的方法是不要打包：原生沒變就用 EAS Update，見第 4 節。
- **額度比排隊更要緊**：依 [pricing](https://expo.dev/pricing)，免費方案每月最多 **15 次 Android build**。2026-10-27 這一天已經打了 4 次（`aeac8698`、`d6992925`、`99dc7738`、`71d5a8c3`），10 月剩 11 次。每改一次 JS 就打一次 APK，很快會用完。

## 4. 根本不用重新打包：EAS Update（OTA）

### 4a. 原理與答案

- 「EAS Update 可以讓 app 透過網路更新非原生的部分（JS、樣式、圖片）」（[EAS Update](https://docs.expo.dev/eas-update/introduction/)）。不支援的是：原生程式碼或原生套件的變更、權限的變更，以及其他需要新 binary 的變更。
- **已經裝在同學手機上的 APK 收不到 OTA。** 那幾個 APK 沒有 `expo-updates`。要先裝 `expo-updates`，重打一次 APK 讓同學裝，之後的 JS 改動才能 OTA。
- 預設行為：app 啟動時檢查更新並在背景下載，**下次啟動才套用**（`checkAutomatically` 預設 `ON_LOAD`，`fallbackToCacheTimeout` 預設 0）。官方的測試方法是「把 app 強制關閉再打開，最多兩次」（[Get started with EAS Update](https://docs.expo.dev/eas-update/getting-started/)、[Updates API（v58）](https://docs.expo.dev/versions/v58.0.0/sdk/updates/)）。
- **runtime version** 決定哪個 APK 能吃哪個更新。建議用 `"runtimeVersion": { "policy": "fingerprint" }`：原生相關的輸入一變，runtime version 就跟著變，舊 APK 自動不會收到不相容的更新（[Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)、[Fingerprint](https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/)）。
- **channel**：`eas.json` 的每個 build profile 都可以指定 `channel`，該 profile 打出來的 APK 只收那個 channel 的更新（[Using EAS Update](https://docs.expo.dev/build/updates/)）。
- **免費額度**：每月 1,000 個 MAU、100 GiB 頻寬（[pricing](https://expo.dev/pricing)）。測試同學只有幾個人，完全夠用。
- **和 Expo Go 的關係**：
  - `expo-updates` 本身有內建在 Expo Go 裡，裝了之後 `npx expo start --tunnel` 加 Expo Go 的流程照常可用。
  - 但「設了 `runtimeVersion` 的更新不能在 Expo Go 載入」（[Using EAS Update](https://docs.expo.dev/build/updates/)）。所以 Expo Go 的同學繼續看 dev server，APK 的同學收 OTA，兩條路並行。

### 4b. 哪些改動要重打 APK、哪些只要 `eas update`

| 改動 | 要做的事 | 理由 |
|---|---|---|
| `src/` 底下的 TS／TSX（畫面、domain 邏輯、樣式、文案） | `eas update` | JS bundle |
| JS 裡 `require`／`import` 的圖片、字型檔（例如 IBM Plex Sans 字重） | `eas update` | 打包在 update 的 assets 裡 |
| 只用到 JS 的 npm 套件（沒有 `android/` 原生碼的套件） | `eas update` | 不影響 fingerprint 的原生部分 |
| `EXPO_PUBLIC_*` 環境變數 | `eas update` | 在 export 時被寫死進 bundle，見 4d 的注意事項 |
| 新增、移除或升級**有原生碼**的套件，例如 Story 005 的 `expo-image-picker` | **重打 APK** | 實測：`eas fingerprint:compare --build-id 99dc7738…` 顯示 fingerprint 不同，差異在 autolinking 多了 `expo-image-picker`／`expo-image-loader` |
| `app.json` 的原生欄位：`name`、`icon`、`android.adaptiveIcon`、`android.package`、`scheme`、`plugins` 與其設定（例如 image-picker 的權限文字）、`expo-build-properties` | **重打 APK** | 會進到 prebuild 產生的原生專案 |
| 升 Expo SDK／React Native 版本 | **重打 APK** | 原生 runtime 變了 |
| `package.json` 的 `expo.autolinking` 設定 | **重打 APK** | 影響哪些原生模組被編進去 |

**不確定時用指令判斷，不用猜**：

```bash
npx eas-cli fingerprint:compare --build-id <同學手上那個 APK 的 build id> --environment preview
```

這個指令只讀不寫。顯示 fingerprint 相同就 `eas update`，不同就重打 APK，而且輸出會列出是哪個檔案造成差異。

### 4c. 導入步驟（要改的檔案與指令，這個 session 沒有執行）

1. 安裝 `expo-updates`（原生模組，裝了之後要重打 APK）：

   ```bash
   npx expo install expo-updates
   ```

2. 產生設定：

   ```bash
   npx eas-cli update:configure
   ```

   這會在 `app.json` 寫入 `updates.url` 與 `runtimeVersion`，並在 `eas.json` 的 `preview`／`production` profile 加上 `channel`（[Get started](https://docs.expo.dev/eas-update/getting-started/)）。

3. 檢查、調整 `app.json`，把 runtime version 改成 fingerprint 策略：

   ```json
   "runtimeVersion": { "policy": "fingerprint" }
   ```

4. 檢查 `eas.json` 的 preview profile，順便打開 Gradle cache（第 3 節）：

   ```json
   "preview": {
     "distribution": "internal",
     "channel": "preview",
     "env": { "EAS_GRADLE_CACHE": "1" },
     "android": { "buildType": "apk" }
   }
   ```

5. 打一次新的 APK，請同學安裝。簽章金鑰沿用 EAS 上的，可以直接覆蓋安裝，AsyncStorage 裡的持股資料會保留：

   ```bash
   npx eas-cli build -p android --profile preview
   ```

6. 之後只改 JS 時發佈更新：

   ```bash
   npx eas-cli update --channel preview --environment preview -p android -m "說明這次改了什麼"
   ```

   SDK 55 以上 `--environment` 是必填（`eas update --help`）。`-p android` 是為了不多 export iOS。

7. 通知同學：把 app 從最近使用清單滑掉再打開，第二次打開就是新版。

### 4d. 這個 app 特有的注意事項

- **截圖匯入在 APK 上本來就不能用**：`/recognize` 是 dev server 的 API route，手機用 `expoConfig.hostUri` 找到 dev server。獨立 APK 沒有 dev server，OTA 也改變不了這點。這部分要測只能用 Expo Go 加 dev server，見 `docs/architecture.md` 第 7 節。
- **`EXPO_PUBLIC_*` 會在 `eas update` 當下被寫進 bundle**：
  - 如果本機 `.env.local` 有 `EXPO_PUBLIC_USE_FAKE_PRICES=1`，發佈出去的 OTA 會變成假價。發佈前先確認 `.env.local` 的內容。
  - EAS 的 preview environment 目前沒有任何變數（`eas env:list --environment preview`）。
- `app.json` 的 `web.output` 是 `server`。用 `-p android` 發佈應該不受影響，但第一次發佈時請確認 `eas update` 有正常完成。

## 5. 本機打包

**這台 Mac 的現況**（實測）：
- Apple M3 Max，14 核、36 GB RAM，磁碟剩 610 GB。
- JDK 17 有裝（Homebrew `openjdk@17`，`java -version` 是 17.0.21），但 `/usr/libexec/java_home` 找不到它，要自己設 `JAVA_HOME`。
- `ANDROID_HOME` 指向 `~/Library/Android/sdk`，**但這個資料夾不存在**，Android SDK 還沒裝。

**要先準備的東西**（[Set up your environment：Android／本機 build](https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build&buildEnv=local)）：
- 安裝 Android Studio，用 Standard 安裝，再勾 Android SDK Platform 36、Build-Tools。
- NDK 版本跟 EAS 一致：log 顯示 EAS 用的是 `27.1.12297006`。
- 在 `~/.zshrc` 設 `JAVA_HOME`（例如 `/opt/homebrew/opt/openjdk@17`）、`ANDROID_HOME`、`PATH`。
- 第一次要下載好幾 GB，估計 30～60 分鐘。

**兩種做法**：

| | `npx eas-cli build -p android --profile preview --local` | `npx expo run:android --variant release` |
|---|---|---|
| 簽章 | 用 EAS 上的同一把金鑰，可以覆蓋安裝同學手上的 APK | 要自己處理 release 簽章（[Create a release build locally](https://docs.expo.dev/guides/local-app-production/)）。金鑰跟 EAS 不同的話，同學要先解除安裝舊版，**持股資料會不見** |
| Cache | 「Caching is not supported」，每次都在 `/tmp` 從頭建（[Run EAS Build locally](https://docs.expo.dev/build-reference/local-builds/)） | 會保留 prebuild 產生的 `android/`（已在 `.gitignore`，是 CNG 產物，不要手改），Gradle 是增量編譯 |
| 時間（估計） | M3 Max 14 核對上 EAS 的 4 vCPU，冷啟動約 4～6 分 | 第一次 4～6 分，之後只改 JS 時 1～2 分 |
| 發給同學 | `npx eas-cli upload` 產生分享連結（eas-cli 內建指令） | 同左，或直接傳 APK 檔 |
| 是否吃雲端額度 | 文件沒寫 | 不用 EAS |

**值不值得**：Tech Day 期間**不值得**當主流程。理由：
- 要先花 30～60 分鐘裝環境。
- 瘦身後雲端只要 7 分，而且不佔用工程師的電腦。
- JS 改動用 OTA 更快。

只有兩種情況才拿出來當備案：免費額度用完，或雲端排隊突然變得很久。那時用 `--local`，簽章才會一致。

另外 [build cache provider](https://docs.expo.dev/guides/cache-builds-remotely/)（`buildCacheProvider: "eas"`）只對本機 `expo run:*` 有效，`eas build` 不會用到它，所以跟這次的問題無關。

## 6. 推薦流程（Tech Day 這幾天）

**一次性準備**（要使用者同意導入 EAS Update 之後才做）：
1. 照 4c 的步驟 1～4 改 `app.json`、`eas.json`、`package.json`，commit。
2. 打一次 APK（約 7 分，實測瘦身後的數字），請同學裝上。

**之後每次改完程式**：

```text
改完 → npm run check
  │
  ├─ npx eas-cli fingerprint:compare --build-id <同學手上 APK 的 build id> --environment preview
  │
  ├─ fingerprint 相同（只改 JS／圖片）
  │     npx eas-cli update --channel preview --environment preview -p android -m "..."
  │     → 同學把 app 關掉重開兩次          約 2～3 分（估計）
  │
  └─ fingerprint 不同（原生有變）
        npx eas-cli build -p android --profile preview
        → 同學用 QR code 下載安裝          約 7 分（實測）、開 Gradle cache 後約 5 分（估計）
        → 記下新的 build id，之後的 fingerprint:compare 改用它
```

Expo Go 的同學照舊用 `npx expo start --tunnel`，存檔就更新，不受影響。

**估算總表**（從改完程式到手機拿到新版）：

| 情境 | 指令 | 時間 |
|---|---|---|
| Expo Go＋dev server | 存檔 | 幾秒 |
| APK＋只改 JS（導入 OTA 後） | `eas update` | 2～3 分（估計：export＋上傳 1～2 分，重開 app 不到 1 分） |
| APK＋原生改動（瘦身後） | `eas build` | 約 8 分（build 7.2 分實測＋排隊數秒＋下載安裝約 1 分） |
| APK＋原生改動（再加 Gradle cache，lockfile 沒變時） | `eas build` | 約 6 分（估計） |
| 對照：原本 | `eas build` | 16～19 分（實測 14.9～18.1 分＋下載安裝） |

**需要使用者決定的事**：
1. 要不要導入 EAS Update？代價是多一個原生套件、要重打一次 APK，以及團隊要記得「原生有變才打包」。
2. 要不要在 preview profile 打開 `EAS_GRADLE_CACHE=1`？沒有額外成本，建議開。
3. 不建議升級付費方案（large resource class）。如果 15 次額度真的不夠，再考慮 Starter（每月 19 美元）或本機 `--local`。

## 參考資料

- Expo 文件索引：https://docs.expo.dev/llms.txt
- Cache dependencies：https://docs.expo.dev/build-reference/caching/
- Gradle cache 公告：https://expo.dev/changelog/gradle-cache
- Build server infrastructure：https://docs.expo.dev/build-reference/infrastructure/
- Android build process：https://docs.expo.dev/build-reference/android-builds/
- eas.json 設定：https://docs.expo.dev/eas/json/
- 方案與價格：https://docs.expo.dev/billing/plans/ 、https://expo.dev/pricing
- BuildProperties（SDK 58）：https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/
- EAS Update：https://docs.expo.dev/eas-update/introduction/ 、https://docs.expo.dev/eas-update/getting-started/ 、https://docs.expo.dev/eas-update/runtime-versions/
- Using EAS Update（channel、Expo Go 限制）：https://docs.expo.dev/build/updates/
- Updates API（SDK 58）：https://docs.expo.dev/versions/v58.0.0/sdk/updates/
- Fingerprint（SDK 58）：https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/
- 本機打包：https://docs.expo.dev/build-reference/local-builds/ 、https://docs.expo.dev/guides/local-app-production/ 、https://docs.expo.dev/get-started/set-up-your-environment/
- Build cache provider：https://docs.expo.dev/guides/cache-builds-remotely/
- Expo 部落格〈Build fast no matter what〉：https://expo.dev/blog/build-fast-no-matter-what-how-expo-is-optimizing-for-speed
