# Story 026：功能開關可以遠端切換

**身為** Tech Day 現場的 PO／工程同學（Elaine）
**我想要** 不重打 APK、不發 OTA，改一個設定檔就打開或關掉某個功能
**以便** 現場臨時決定要不要展示「AI 解讀」「Pro 方案」「從截圖匯入」，出問題也能馬上關掉

> 編號說明：016～020 已被其他 story 使用，跟實作指南的任務編號對不上；021～024 保留給實作指南的 T15～T18，025 已用，所以這張是 026。
> 開關只控制**畫面看不看得到**，不是保護：repo 是公開的，任何人都讀得到這份設定，也能自己改 app。AI 解讀另外有存取碼與後端的限制（Story 017）。

## 怎麼操作（Elaine）

```bash
npm run flags -- list                  # 看遠端目前的值
npm run flags -- set aiInsight on      # 打開
npm run flags -- set aiInsight off     # 關掉
npm run flags -- set proPlan on --dry-run   # 只印出會寫什麼，不動遠端
```

- 認得的名稱：`screenshotImport`、`aiInsight`、`proPlan`。
- 用已經登入的 `gh`（`gh auth status`）寫到 GitHub `kim85326/cspo` 的 **`feature-flags` 分支**的 `feature-flags.json`。第一次 `set` 會自動建立這個分支：它是獨立分支（沒有父 commit），裡面只有這一個檔，**不碰 iteration-1**。
- **生效時間**：app 從 `raw.githubusercontent.com` 讀，那邊的 CDN 快取**最多 5 分鐘**。改完等幾分鐘，請同學把 app 切到背景再切回來（或滑掉重開），就會套用。
- 已經裝好的 APK 都適用：這個改動沒有加原生套件，發一次 OTA 到 build 5 以後的 APK 就有遠端開關能力；之後切開關不用再發 OTA。

## 驗收條件

```gherkin
Scenario: 遠端打開功能
  Given 我裝的 APK 沒有打開 aiInsight
  And Elaine 執行 npm run flags -- set aiInsight on，已經過了 5 分鐘
  When 我把 app 切到背景再切回來
  Then 算完盈虧後看得到「AI 解讀」按鈕，不用重裝、不用等 OTA

Scenario: 遠端關掉功能
  Given aiInsight 原本是開的
  When Elaine 執行 npm run flags -- set aiInsight off，等快取過期後我回到 app
  Then 「AI 解讀」按鈕消失

Scenario: 沒網路時用上次的設定
  Given 上次開 app 時抓到 proPlan 是開的
  When 我在沒有網路的地方重開 app
  Then 設定頁仍然有「方案」區塊

Scenario: 第一次開、又沒網路
  Given 手機從沒抓到過遠端設定
  When 我沒網路打開 app
  Then 所有開關都用打包時的預設（APK 一律關閉），app 照常可用

Scenario: 遠端設定壞掉
  Given feature-flags.json 不是 JSON、整份不是物件、或伺服器回 404
  When app 去抓
  Then 當作這次沒抓到，用上次存的值；沒存過就用打包預設
  And 不會當掉、不會卡在載入畫面

Scenario: 只接受認得的開關
  Given feature-flags.json 是 {"aiInsight": "true", "proPlan": true, "hack": true}
  Then 只有 proPlan 生效；"true" 這種字串、不認得的名稱都忽略

Scenario: 網路很慢也不卡畫面
  Given 遠端 5 秒都沒回應
  Then 畫面一開始就用預設／上次存的值，5 秒後放棄這次請求

Scenario: 工程師本機測試蓋過遠端
  Given 我在 .env.local 設 EXPO_PUBLIC_FEATURE_AI_INSIGHT=0，遠端是 on
  When 我用 dev server 跑 app
  Then aiInsight 是關的（.env.local 明確設的 1 或 0 蓋過遠端；沒設就聽遠端）
```

## 優先順序

| 順序 | 來源 | 說明 |
|---|---|---|
| 1 | 開發時 `.env.local` 的 `EXPO_PUBLIC_FEATURE_*`（`1` 或 `0`） | 只在 `__DEV__`；APK／OTA 不適用 |
| 2 | 這次抓到的遠端設定 | 整份取代上次存的；遠端沒寫到的開關回到打包預設 |
| 3 | 上次抓到、存在手機的遠端設定 | AsyncStorage `cspo.featureFlags.v1` |
| 4 | 打包時的 `EXPO_PUBLIC_FEATURE_*` | EAS 沒設，APK 一律關閉 |

## 對應的自動化測試

| 情境 | 單元測試 | 畫面／hook 測試 |
|---|---|---|
| 只接受認得的名稱與 boolean、優先順序 | `src/config/features.test.ts` | — |
| 404、不是 JSON、網路錯、逾時、存取手機 | `src/data/remoteFeatureFlags.test.ts`（假的 fetch） | — |
| 先用預設不卡畫面、抓到後重新 render、沒抓到用存的、回到前景再抓 | — | `src/hooks/useFeatures.test.tsx` |
| 各畫面跟著開關顯示／隱藏 | — | `CalculateScreen.test.tsx`、`SettingsScreen.test.tsx`、`ProScreen.test.tsx`（`StaticFeatureFlags`） |
| `npm run flags` 的名稱清單和 app 一致 | `src/config/features.test.ts` | — |

## 決策紀錄

1. **設定放在 GitHub 的專用分支，從 raw.githubusercontent.com 讀**：不用新的服務或帳號，改設定用已經登入的 `gh` 就好，每次切換都有 commit 紀錄。分支只放一個 JSON，跟程式碼完全分開，不會動到 iteration-1。
   - 沒選 GitHub contents API（`api.github.com`）：沒有 CDN 快取、改了馬上生效，但未登入每個 IP 每小時只有 60 次；Tech Day 大家連同一個 Wi-Fi、共用一個對外 IP，很快就會被擋。raw 的代價是最多 5 分鐘延遲，現場可以接受。
   - 沒在網址加 `?t=時間` 來繞過 CDN 快取：raw 是否依 query 分開快取沒有官方保證，而且就算有效，每次都打到 GitHub 原站也比較容易被限流。
   - 沒選 Firebase Remote Config 等服務：要加原生套件（就得重打 APK）或新帳號，不符合這次「用 OTA 送到已裝好的 build 5」。
2. **啟動時與回到前景時各抓一次**，不定時輪詢：省流量，也夠用（現場切完請同學切一下 app）。同一時間只會有一個請求。
3. **不等網路**：畫面一開始就用打包預設，讀完手機裡存的值、抓到遠端後再重新 render。開關只會把功能「藏起來／露出來」，短暫用舊值不會算錯錢。
4. **遠端整份取代存的值**：遠端是唯一來源；遠端拿掉某個開關，就回到打包預設，而不是殘留上次的值。
5. **開發時 `.env.local` 蓋過遠端**：工程師測自己的功能不會被現場的遠端設定影響；只看 `__DEV__`，APK／OTA 的 bundle 裡就算有 `EXPO_PUBLIC_*`（`npm run ota` 也會擋 `=1`）也不會蓋過遠端。
6. **畫面改用 `useFeatures()`**（Context），不再 render 時讀可變物件，遠端更新時用到的畫面才會重新 render。測試用 `StaticFeatureFlags` 指定開關。
7. **沒加原生套件**：只用 `fetch`、`AbortController`、React Native 內建的 `AppState` 與已經有的 AsyncStorage，可以用 OTA 送出。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈（遠端用假的 fetch，沒有改真的遠端設定、沒有建立遠端分支）
- [ ] Elaine 確認後發 OTA，第一次 `npm run flags -- set` 建立 `feature-flags` 分支
- [ ] 手機實測：切開關後 5 分鐘內、切回前景就看到變化
