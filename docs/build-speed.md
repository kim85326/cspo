# 讓測試同學更快拿到新版（EAS Android 打包加速）

> 研究日期：2026-10-27（第一輪上午、第二輪下午）。專案 Expo SDK 58（`expo ~58.0.19`）、eas-cli 26.0.0。
> 量測數據來自 `eas build:view <id> --json` 的 `metrics` 與 build log（log 每一行都帶 `phase` 與時間戳）。
> 標「實測」的是量到的數字，標「估計」的是推算，第一次照做時請記下實際時間，回來更新這份文件。

## 結論先講（第二輪）

第一輪的建議已經實作在 `iteration-1`：
- EAS Update（OTA）：`expo-updates`、`runtimeVersion` 用 fingerprint 策略、preview channel，搭配 `npm run ota`。
- `EAS_GRADLE_CACHE=1`。
- 只打 arm64、開 R8。
- `npm run release`。

現在原生有變時，打一次 APK 實測 **9.4 分**（`8b30865d`）。這一輪的建議依效果排序：

| 名次 | 做法 | 省下的時間 | 要改的地方 |
|---|---|---|---|
| 1 | **讓更多改動走 OTA**：一個指令自動判斷要 OTA 還是打包；同學第一次重開就套用新版；原生套件集中在同一次 APK 一起加 | 每次少打一個 APK，就少 **約 9 分**，改走 OTA 約 2～3 分 | 新增 `scripts/ship.mjs`（或擴充 `ota-update.mjs`）、`src/app/_layout.tsx` 加 `useUpdates` |
| 2 | **preview 關掉 R8／shrinkResources** | 每次 build 約 **−1.5 分**（R8 實測 82～108 秒，是 Gradle 最後一段沒辦法平行的步驟），APK 約大 1 MB | `app.json` 的 `expo-build-properties` |
| 3 | **發版前檢查**：先確認 `node_modules` 和 lockfile 一致、測試通過、commit 乾淨，再送 build | 避免像 build 4 那樣白跑一趟。每次失敗會浪費一次額度，加上 10 分鐘以上的來回；lockfile 保持穩定，Gradle cache 才吃得到 | 新增 `scripts/build-apk.mjs`、`eas.json` 的 `cli.requireCommit` |

其他評估過、目前不建議的做法：
- **large resource class**：免費方案不能用。改用 Starter 每月 19 美元，估計每次省 2～3 分。
- **本機 `eas build --local`**：估計每次 4～5 分，比雲端快 4～5 分，但要先花 30～60 分鐘裝 Android SDK。15 次額度快用完時再用。
- **關掉 embedded bundle 上傳**：省約 20 秒，代價是新裝 APK 的第一次 OTA 要下載完整 bundle。

| 情境 | 第一輪之前 | 現在（`iteration-1`） | 照這一輪做之後 |
|---|---|---|---|
| 只改 JS／圖片，同學用 Expo Go | 幾秒 | 幾秒 | 不變 |
| 只改 JS／圖片，同學用 APK | 15～18 分（打 APK） | `npm run ota` 約 2～3 分，同學要重開兩次（估計） | 約 2 分，重開一次（估計） |
| 原生有變，lockfile 也變（加原生套件） | 15～18 分 | **9.4 分**（實測，Gradle cache 沒命中） | 約 8 分（關 R8，估計） |
| 原生有變，lockfile 沒變（改 icon、權限文字、plugin 設定） | 15～18 分 | Gradle cache 命中，估計 6～7 分（還沒實測） | 估計 5 分 |

---

## 1. 時間花在哪（實測）

用 `npx eas-cli build:view <id> --json` 拿到 `metrics`（單位毫秒），再下載 `logFiles` 裡的 log（brotli 壓縮的 JSON lines），依 `phase` 加總時間。

| Build | Commit | 內容 | 排隊 | 總時間 | `RUN_GRADLEW` | 其他階段 |
|---|---|---|---|---|---|---|
| `d6992925` | `b67cd41` | 四種 ABI | 4.7 秒 | 18.1 分 | 1026 秒 | 約 55 秒 |
| `99dc7738` | `5856951` | 四種 ABI | 5.2 秒 | 14.9 分 | 826 秒 | 約 60 秒 |
| `71d5a8c3` | `085a617` | 瘦身：只打 arm64、排除 reanimated 等、R8 | 4.6 秒 | 7.2 分 | 372 秒 | 約 55 秒 |
| `8b30865d`（build 3） | `3b92059` | ＋`expo-updates`、`EAS_GRADLE_CACHE=1` | 4.6 秒 | **9.4 分** | 481 秒 | 約 80 秒 |
| `7b9bd0cd`（build 4） | `d657ca9` | ＋`react-native-svg`（K 線圖） | 4.5 秒 | 0.8 分**失敗** | — | 停在 `CONFIGURE_EXPO_UPDATES`，見第 7 節 |

**build 3 比瘦身那次多了 2.2 分**，是加 `expo-updates` 的代價：
- `expo-updates` 本身的 Kotlin、KSP、C++ 編譯約 60 秒。
- `createReleaseUpdatesResources`（build 時算 fingerprint、產生 manifest）18 秒。
- 新的 `UPLOAD_EMBEDDED_BUNDLE` 階段 22 秒。
- R8 從 82 秒變 108 秒。

這筆代價是值得的，因為 OTA 每次能省掉一整個 build。

**build 3 的 Gradle 裡面**（task 時間合計 450 秒，Gradle 牆鐘 481 秒）：
- `expo-modules-core` Kotlin 58 秒。
- C++（arm64）：`screens`、`app`、`expo-modules-core`、`expo-updates` 的 configure 加 build 約 110 秒。
- `safe-area-context` Java 24 秒、JS bundle 19 秒、lintVital 16 秒。
- **`minifyReleaseWithR8` 108 秒**。它沒出現在 `GRADLE_BUILD_PROFILE` 表裡，是從 log 的 task 時間戳算出來的：07:29:41 開始，07:31:29 下一個 task 才開始。它是整個 build 最後一段單線程的瓶頸。

**建置機器**：`AMD, 4 vCPUs, 15.62 GB RAM`，也就是 Android 預設的 `medium`（[Build server infrastructure](https://docs.expo.dev/build-reference/infrastructure/)）。

第一輪的分析（四種 ABI 時 C++ 佔 Gradle 六成，非 arm64 的三種合計約 411 秒）已經靠只打 arm64 解決，細節見 git 歷史的這份文件（commit `4c4ca9f`）。

## 2. 減少要編的東西

### 2a. 已完成（APK 瘦身 session，commit `085a617`）

| 做法 | 實測效果 | 依據 |
|---|---|---|
| 只打 `arm64-v8a`（`expo-build-properties` 的 `android.buildArchs`） | 和下一項合併：18.1 → 7.2 分 | [BuildProperties（v58）](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/) |
| `package.json` 的 `expo.autolinking.android.exclude` 排除 reanimated／worklets／gesture-handler | 同上 | `docs/architecture.md` 的「APK 大小」 |

### 2b. 新建議：preview 不要開 R8 與 shrinkResources

- **省下的時間（實測推算）**：R8 在 build 3 花 108 秒，在 `71d5a8c3` 花 82 秒。關掉之後 `shrinkResources` 也會一起停掉（官方說它要和 minify 一起用），每次 build 約省 **1.5 分**。
- **代價**：依 `docs/architecture.md` 的「APK 大小」表，R8 加 shrinkResources 只讓 APK 小了約 1 MB（24 MB → 約 25 MB），對測試同學下載沒有感覺。R8 也有可能誤刪靠反射載入的類別，關掉反而少一個出錯的地方。
- **怎麼改**：在 `app.json` 的 `expo-build-properties` 拿掉 `enableMinifyInReleaseBuilds`、`enableShrinkResourcesInReleaseBuilds`，或改成 `false`（[BuildProperties（v58）](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/)）。要上架 Google Play 時再打開。
- **時機**：這是原生設定，會改變 fingerprint，改完要重打 APK。最好和下一個本來就要打的 APK（例如加 `react-native-svg` 那次）一起改，不要為它多打一次。

### 2c. 不建議

- **改打 debug APK**（`gradleCommand: ":app:assembleDebug"`）：debug APK 不內嵌 JS，要連 dev server 才能用（[Updates API（v58）](https://docs.expo.dev/versions/v58.0.0/sdk/updates/)：debug build 預設一律從 dev server 載 JS），也收不到 OTA。
- **拿掉 `expo-updates`**：每次 build 能省約 2 分，但會失去 OTA，划不來。

## 3. EAS 的 cache 與機器

### 3a. Cache 還能不能再多開

| Cache | 現況（build 3 log） | 還能做什麼 | 依據 |
|---|---|---|---|
| npm／Maven 下載 cache server | 預設開 | 沒有 | [Cache dependencies](https://docs.expo.dev/build-reference/caching/) |
| ccache（C/C++） | `EAS_USE_CACHE=1`，EAS 預設開。key 用前綴比對，所以 lockfile 變了也能還原舊 cache。build 3 命中率 47% | 已經全開，沒有其他開關 | 同上 |
| **Gradle build cache** | `EAS_GRADLE_CACHE=1` 已開，但 build 3 是「No Gradle cache found for this key」。649 個 task 裡只有 94 個 from cache，都是同一次 build 內部重用的 | 開關已經開了，要做的是**讓 lockfile 保持穩定** | [Expo changelog：Gradle cache](https://expo.dev/changelog/gradle-cache) |
| `cache.paths` 自訂路徑 | 沒用 | 沒有適合的目錄（`node_modules` 每次 `npm ci`，約 20 秒） | [eas.json](https://docs.expo.dev/eas/json/) |

**Gradle cache 的關鍵限制（實測）**：
- 它的 key 是 `android-gradle-cache-<lockfile hash>`，log 顯示是**完全比對**。ccache 會「prefix match」還原舊 cache，Gradle cache 不會。
- 所以只要 `package-lock.json` 有變，那次 build 就完全吃不到 Gradle cache。到目前為止每一次 build 的 lockfile 都不一樣：瘦身加套件、加 `expo-updates`、加 `react-native-svg`，**Gradle cache 一次都還沒真正命中過**。

**能做的事**：
- 原生套件**集中在同一次加**，lockfile 才不會每次都變（也見第 5 節）。
- 只升級 JS 套件同樣會改 lockfile。Tech Day 期間避免跑 `npm update`、`npx expo install --fix`。
- 估計效果：lockfile 沒變的那次 build，官方說約省 50%。保守估 Gradle 481 秒降到 250～300 秒，總時間約 **6～7 分**，關掉 R8 後約 5 分。這還沒實測，`react-native-svg` 之後的第二次 build 會是第一個驗證點：在 log 的 Run gradlew 找 `FROM-CACHE`。

### 3b. 比較大的 resource class

- **規格**：medium 4 vCPU／16 GB（Gradle heap 4 GB），large 8 vCPU／32 GB（heap 8 GB）（[Build server infrastructure](https://docs.expo.dev/build-reference/infrastructure/)）。
- **能不能用、要付多少**：
  - 免費方案不能用 large（[eas.json](https://docs.expo.dev/eas/json/)：「The `large` resource class is not available on the free plan」；[pricing](https://expo.dev/pricing) 的「Access to large workers」免費方案是空的）。
  - Starter 每月 **19 美元**，含 45 美元 build credit；Android large 每次 **2 美元**、medium 每次 1 美元。pricing 頁沒寫 credit 能不能扣 large。
  - 付費方案的佇列是 high priority。
  - 設定方式：`eas.json` 的 `build.preview.android.resourceClass: "large"`。
- **能快多少（估計）**：官方沒有 Android medium 和 large 的比較數據。build 3 的 Gradle 有約 60% 是 C++ 與跨模組的 Kotlin 編譯，這部分可以吃到兩倍核心；R8、JS bundle、npm ci 這些單線程階段不會變快。估計 Gradle 481 秒降到 300～340 秒，**每次約省 2.5 分**。
- **建議**：Tech Day 期間不升級。省下的時間比第 2b 節的「關 R8」多不了多少，又要付費。如果 15 次額度不夠用，才一起考慮 Starter。

### 3c. 排隊與額度

- **排隊**：六次有數據的 build，`buildQueueTime` 都在 4.5～5.2 秒，不是瓶頸。
- **額度**：[pricing](https://expo.dev/pricing) 的免費方案每月 **15 次 Android build**。2026-10-27 這一天已經送了 8 次（含失敗的 build 4，以及下午 16:21 排隊中的 `099da0af`）。pricing 頁沒說失敗的 build 算不算額度。**10 月最多只剩 7 次**，這是要多走 OTA、以及先做發版前檢查的另一個理由。

## 4. 跳過不需要的步驟

build 3 各階段實測與能不能跳過：

| 階段／task | 時間 | 能跳過嗎 | 省下 | 依據 |
|---|---|---|---|---|
| `minifyReleaseWithR8`（含 shrinkResources） | 108 秒 | **可以**，見 2b | 約 1.5 分 | [BuildProperties](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/) |
| `UPLOAD_EMBEDDED_BUNDLE` | 22 秒 | 可以：`eas.json` 的 preview `env` 設 `"EAS_UPDATE_UPLOAD_EMBEDDED_BUNDLE": "0"`。代價是剛裝 APK 的手機收第一個 OTA 時，下載完整 bundle（約 2 MB），而不是差異 patch | 約 20 秒 | [Bundle diffing](https://docs.expo.dev/eas-update/bundle-diffing/)：SDK 58 預設會上傳 |
| `lintVitalAnalyzeRelease` | 16 秒 | 官方文件沒有不寫 config plugin 就能關的開關。CNG 不能手改 `android/`，不值得為 16 秒寫 plugin | — | — |
| `RUN_EXPO_DOCTOR` | 4 秒 | 文件沒有記載跳過它的開關 | — | [Android build process](https://docs.expo.dev/build-reference/android-builds/) |
| `INSTALL_DEPENDENCIES`（`npm ci`） | 20 秒 | 不能，EAS 一定要裝依賴 | — | 同上 |
| `EAGER_BUNDLE`＋`createBundleReleaseJsAndAssets` | 17＋19 秒 | 不能，release APK 要內嵌 JS | — | — |
| 本機打包上傳（送 build 前） | 沒量 | 可以加 `.easignore`，排除 `docs/`（裡面有截圖樣本、下載頁）、`e2e/`、`design-system/`。它會取代 `.gitignore`，要先複製一份 `.gitignore` 的內容。只影響按下指令到開始排隊之間，不影響上表 | 估計幾秒 | [.easignore](https://docs.expo.dev/build-reference/easignore/) |

可以真正跳過的只有前兩項，合計約 **2 分**。

## 5. 用 OTA 取代打包

### 5a. 什麼時候可以 OTA（已實作）

規則已寫在 `docs/architecture.md` 第 7 節，`npm run ota` 也會自動擋下原生有變的情況：
- **可以 OTA**：`src/` 底下的 TS／TSX、JS 裡 `require` 的圖片與字型、只有 JS 的 npm 套件、`EXPO_PUBLIC_*`。
- **要重打 APK**：新增、移除或升級有原生碼的套件、`app.json` 的原生欄位（name、icon、權限、plugins、`expo-build-properties`）、`package.json` 的 `expo.autolinking`、升級 SDK。

依據：[EAS Update](https://docs.expo.dev/eas-update/introduction/)、[Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)、[Using EAS Update](https://docs.expo.dev/build/updates/)。

### 5b. 怎麼讓大家更常走 OTA

| 做法 | 效果 | 怎麼做 | 依據 |
|---|---|---|---|
| **一個指令自動選**：`npm run ship -- "改了什麼"` | 工程同學不用判斷要走哪一條，不會因為習慣而多打 APK。每次省約 9 分 | 新腳本：先做第 7 節的檢查，再跑 `fingerprint:compare --build-id <最新 preview APK>`。相同就 `eas update`，不同就 `eas build --wait`，完成後接 `npm run release`。可以直接重用 `scripts/ota-update.mjs` 的 fingerprint 判斷 | [Fingerprint（v58）](https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/)；EAS Workflows 的範例也是同樣做法（[Deploy to production](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/)） |
| **第一次重開就套用** | 現在預設是背景下載、下次啟動才套用，所以同學要重開兩次。改成下載完立刻 reload，同學重開一次就是新版，少一次「我怎麼還是舊版」的來回 | 在 `src/app/_layout.tsx` 用 `Updates.useUpdates()`：`isUpdatePending` 變成 true 時呼叫 `Updates.reloadAsync()`。或在 app 回到前景時做 `checkForUpdateAsync` → `fetchUpdateAsync` → `reloadAsync`。這段只能在 release APK 驗證，Expo Go 和開發模式裡這些方法會 reject | [Updates API（v58）](https://docs.expo.dev/versions/v58.0.0/sdk/updates/) |
| **畫面上看得到目前的 OTA 版本** | 同學和工程能確認拿到的是不是新版，不用猜 | 在設定頁顯示 `Updates.updateId` 或 `createdAt`（version-label 那條工作可以順便做） | 同上 |
| **原生套件集中加** | 例如這週可能用到的原生套件，排在同一次 APK 一起加，之後全部走 OTA。也能讓 lockfile 不再變，Gradle cache 開始命中（第 3a 節） | 在 `docs/context-for-ai.md` 和 MVP 實作指南加一條規則：「要加原生套件前先提出，集中到下一次 APK」 | [EAS Update](https://docs.expo.dev/eas-update/introduction/) 的「不能 OTA」清單 |
| **新同學下載的 APK 也有最新 JS**（選用） | 下載頁的 APK 只有打包當時的 JS，新同學裝完還要等一次 OTA。用 repack 把最新 JS 換進既有 APK，幾秒就好，不用重打 | `npx @expo/repack-app --platform android --source-app <apk>`，或用 EAS Workflows 的 `repack` job。要 fingerprint 相同才安全；要用 EAS 的 keystore 簽章，否則同學要先解除安裝舊版。Tech Day 期間 OTA 已經夠用，列為選用 | [Repack app](https://docs.expo.dev/build-reference/repack/) |

## 6. 本機打包（Elaine 的 Mac）

**這台 Mac 的現況（實測）**：
- Apple M3 Max，14 核、36 GB RAM。
- JDK 17 有裝（Homebrew `openjdk@17`），但 `/usr/libexec/java_home` 找不到它，要自己設 `JAVA_HOME`。
- `ANDROID_HOME` 指向的 `~/Library/Android/sdk` **不存在**，Android SDK 還沒裝，所以無法實際量測。

**要先準備的東西**（[Set up your environment](https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build&buildEnv=local)）：
- 安裝 Android Studio，勾 SDK Platform 36、Build-Tools，NDK 用 `27.1.12297006`（和 EAS 一致）。
- 設好 `JAVA_HOME`、`ANDROID_HOME`、`PATH`。
- 第一次要下載好幾 GB，估計 **30～60 分鐘**。

**時間估計**：依 build 3 的 task 分布推算。EAS medium 是 4 個 vCPU（2 個實體核心），M3 Max 有 10 個效能核心，可平行的編譯估計快 4～6 倍，單線程的 R8／bundle 約快 1.5～2 倍。

| 做法 | 第一次 | 之後每次 | 和雲端比 | 依據 |
|---|---|---|---|---|
| `npx eas-cli build -p android --profile preview --local` | 8～12 分（要下載 Gradle 與 Maven 依賴） | **約 4～5 分**。「Caching is not supported」，每次都在 `/tmp` 從頭建；只有 `~/.gradle` 的依賴下載會留著 | 每次約 −4～5 分 | [Run EAS Build locally](https://docs.expo.dev/build-reference/local-builds/) |
| `npx expo prebuild -p android` 後在 `android/` 跑 `./gradlew app:assembleRelease`（或 `npx expo run:android --variant release`） | 4～5 分 | 只改原生設定時增量編譯約 **1.5～3 分**；只改 JS 時約 1 分（但這種情況應該走 OTA） | 每次約 −6～8 分 | [Create a release build locally](https://docs.expo.dev/guides/local-app-production/)；Expo 部落格也建議用 `--variant release` 在本機測 release |

**限制**：
- **簽章**：
  - `--local` 用的是 EAS 上同一把金鑰，同學可以直接覆蓋安裝。
  - 直接跑 Gradle 時要自己設定簽章（用 `eas credentials -p android` 下載金鑰）。金鑰不一樣的話，同學要先解除安裝舊版，**AsyncStorage 的持股資料會不見**。
- **發版腳本**：`npm run release` 吃的是 EAS build ID，本機 APK 要改用 `npx eas-cli upload`（產生分享連結），或改腳本讓它能直接吃 APK 檔。
- **runtime version 一致**：本機打出來的 APK 用的也是 fingerprint 策略，OTA 照樣能送到；但第 7 節的 `node_modules` 檢查一樣要做。
- **額度**：[pricing](https://expo.dev/pricing) 和 [local builds](https://docs.expo.dev/build-reference/local-builds/) 都沒寫 `--local` 算不算 15 次額度。它不在 EAS 伺服器上跑，但這點沒有官方文件可以引用。

**建議**：還不值得當主流程，理由是：
- 要先花 30～60 分鐘裝環境。
- 打包期間會佔住 Elaine 的電腦。
- 第 5 節做好之後，一天只會打一兩次 APK。

**額度剩 3 次以下時**，改用 `--local` 當備案。

## 7. 發版前檢查（build 4 失敗的教訓）

### 7a. 發生了什麼（實測，`7b9bd0cd` 的 log）

1. vincent 加了 `react-native-svg`，`package.json` 與 `package-lock.json` 都有它。但 pull 下來之後沒跑 `npm install`，本機的 `node_modules` 裡沒有它。
2. 送 build 時，EAS CLI 在**本機**用本機的 `node_modules` 算 fingerprint（runtime version）：`44b942e7…`。
3. EAS 伺服器跑完 `npm ci` 後再算一次：`eff9fbde…`。差異只有一個：伺服器的 autolinking 多了 `react-native-svg`。
4. 兩邊不一致，build 在 `CONFIGURE_EXPO_UPDATES` 停下：「Runtime version mismatch … This would cause any updates published on the local machine to not be compatible with this build」。
5. 這個檢查是好事：如果放行，之後從同一台電腦發的 OTA 會和這個 APK 的 runtime version 對不上。

這個 worktree 也重現了同樣的狀態：pull 之後沒有 install，`npm ls --depth=0` 會以 exit code 1 結束，並列出：

```text
npm error missing: expo-build-properties@~58.0.11, required by cspo@1.0.0
npm error missing: expo-updates@~58.0.18, required by cspo@1.0.0
npm error missing: react-native-svg@15.16.0, required by cspo@1.0.0
```

所以 `npm ls` 可以當作自動檢查。同樣的問題也會讓 `npm run ota` 算錯 fingerprint：它會誤判「原生有變」而拒絕發佈，或反過來放行。

### 7b. 發版前檢查清單

每次送 `eas build` 前：

1. `git pull` 之後跑 `npm install`（或 `npm ci`）。
2. `npm ls --depth=0` 沒有 `missing`／`invalid`。
3. `npm run check` 通過（typecheck、lint、Jest），不要拿額度去發現 TypeScript 錯誤。
4. `git status` 乾淨，HEAD 已經 push。原因有兩個：
   - EAS 會上傳工作目錄的內容，未 commit 的修改也會被打進去，但 build 記錄的 `gitCommitHash` 是 HEAD，`npm run release` 會用它當 GitHub Release 的 target，兩邊會對不上。
   - 可以在 `eas.json` 設 `"cli": { "requireCommit": true }`，讓 EAS CLI 自己擋（[Android build process](https://docs.expo.dev/build-reference/android-builds/) 第 1 步）。
5. `npx eas-cli fingerprint:compare --build-id <最新 preview APK> --environment preview`：fingerprint 相同就**不要打包**，改用 `npm run ota`。
6. `.env.local` 沒有開著 `EXPO_PUBLIC_*=1`。這只影響 OTA，`ota-update.mjs` 已經會檢查。

### 7c. 要不要寫成腳本

**建議另外寫 `scripts/build-apk.mjs`（`npm run build:apk`），不要塞進 `scripts/release-apk.mjs`。** 理由：
- `release-apk.mjs` 是在 build **完成之後**才跑（它要吃 build ID），那時再檢查已經太晚，額度已經用掉了。
- 兩個腳本的職責不同：一個負責「送 build」，一個負責「把 APK 發到 GitHub 與下載頁」。

`build-apk.mjs` 的步驟（照 `ota-update.mjs` 的寫法，`execFileSync` 呼叫 CLI，失敗時印一句中文原因就結束）：

1. `npm ls --depth=0`。exit code 不是 0 就自動跑 `npm install`，再檢查一次，還是失敗就停。用 `npm ls` 而不比對 `node_modules/.package-lock.json`，是因為 npm 的隱藏 lockfile 格式沒有公開保證；`npm ls` 已經實測能抓到這次的問題。
2. `git status --porcelain` 有輸出就停；`git rev-parse HEAD` 不在 `origin` 上就提醒先 push。
3. `npm run check`。
4. fingerprint 和最新 preview APK 相同時停下，提示「原生沒變，請用 `npm run ota`」。加 `--force` 可以照樣打包。
5. `npx eas-cli build -p android --profile preview --non-interactive --wait`。完成後印出 build ID，並提示下一步 `npm run release -- <id> "…"`，也可以直接接著呼叫。

**省下的時間**：
- 本身只多 30～60 秒的本機檢查，主要是 `npm run check`。
- 換來的是避免一次失敗的 build：浪費一次額度，加上發現、修正、重新排隊的 10 分鐘以上。
- 第 4 步還會把「其實可以 OTA」的情況擋下來，每次省約 9 分。

這個腳本和第 5b 節的 `npm run ship` 可以合成同一個：ship 的打包分支就是 `build-apk.mjs`。

## 8. 推薦流程（Tech Day 剩下的時間）

```text
git pull → npm install → 改程式 → npm run check
  │
  └─ npm run ship -- "改了什麼"      （還沒寫之前：手動照第 7b 節做）
       ├─ fingerprint 相同 → eas update             約 2 分＋同學重開（目前要開兩次）
       └─ fingerprint 不同 → eas build --wait       約 8～9.5 分
                              → npm run release     約 1 分
```

**下一次本來就要打的 APK**（加 `react-native-svg` 那次）順便把這些原生設定一起改，之後就不用再為了它們多打一次：
1. 關 R8／shrinkResources（第 2b 節）。
2. `_layout.tsx` 加上「下載完就 reload」（第 5b 節）。這是 JS 改動，本來可以 OTA，但跟著新 APK 一起出最省事。
3. 考慮 `EAS_UPDATE_UPLOAD_EMBEDDED_BUNDLE=0`（第 4 節）。這是 `eas.json` 的 build 環境變數，不影響 fingerprint，可以隨時改。

**需要使用者決定的事**：
1. 要不要關 R8：APK 大約多 1 MB，換每次省約 1.5 分。
2. 要不要寫 `npm run ship`／`build-apk.mjs`，讓「原生沒變就 OTA」變成預設行為。
3. 原生套件要不要集中加：要在團隊規則（`docs/context-for-ai.md`）裡寫一條。
4. 額度不夠時，要選升級 Starter（每月 19 美元，可用 large）還是裝 Android SDK 走本機打包。

## 參考資料

- Expo 文件索引：https://docs.expo.dev/llms.txt
- Cache dependencies（ccache、npm／Maven cache）：https://docs.expo.dev/build-reference/caching/
- Gradle cache 公告：https://expo.dev/changelog/gradle-cache
- Build server infrastructure（resource class 規格）：https://docs.expo.dev/build-reference/infrastructure/
- Android build process（各步驟、`cli.requireCommit`）：https://docs.expo.dev/build-reference/android-builds/
- eas.json 設定（`resourceClass`、`env`、`channel`）：https://docs.expo.dev/eas/json/
- `.easignore`：https://docs.expo.dev/build-reference/easignore/
- 方案與價格：https://docs.expo.dev/billing/plans/ 、https://expo.dev/pricing
- BuildProperties（SDK 58）：https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/
- EAS Update：https://docs.expo.dev/eas-update/introduction/ 、https://docs.expo.dev/eas-update/getting-started/ 、https://docs.expo.dev/eas-update/runtime-versions/
- Bundle diffing（embedded bundle 上傳）：https://docs.expo.dev/eas-update/bundle-diffing/
- Using EAS Update（channel、Expo Go 限制）：https://docs.expo.dev/build/updates/
- Updates API（SDK 58，`useUpdates`、`reloadAsync`）：https://docs.expo.dev/versions/v58.0.0/sdk/updates/
- Fingerprint（SDK 58）：https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/
- EAS Workflows 範例（用 fingerprint 決定 build 或 update）：https://docs.expo.dev/eas/workflows/examples/deploy-to-production/
- Repack app：https://docs.expo.dev/build-reference/repack/
- 本機打包：https://docs.expo.dev/build-reference/local-builds/ 、https://docs.expo.dev/guides/local-app-production/ 、https://docs.expo.dev/get-started/set-up-your-environment/
- Expo 部落格〈Build fast no matter what〉：https://expo.dev/blog/build-fast-no-matter-what-how-expo-is-optimizing-for-speed
