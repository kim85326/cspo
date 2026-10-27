# Story 017：AI 解讀

**身為** 算完盈虧、但看不太懂一堆數字的人
**我想要** 按一個按鈕，讓 AI 用白話說明我這組持股目前的表現
**以便** 不用自己比對每一檔的成本、現價與報酬率，就知道整體賺賠從哪裡來

## 驗收條件

現價以 [docs/glossary.md](../glossary.md) 的假價表為準。解讀由 AI 模型產生，**只描述數字，不給任何投資建議**（見下方「法規限制」）。
手機 app 本身不接 AI 服務：持股摘要送到工程同學電腦上的「AI 解讀後端」（`backend/`），由後端用電腦上的 API key 呼叫 Claude。
其他人（不同網路、APK、Expo Go、網頁版）透過 `npm run backend:tunnel` 開的 ngrok 固定網址連進來。

```gherkin
Scenario: 開關關閉時畫面完全不變
  Given AI 解讀的功能開關是關閉的（預設）
  When 我算完一檔或多檔的盈虧
  Then 結果卡下方沒有「AI 解讀」按鈕，其他畫面與之前一樣

Scenario: 算完才看得到按鈕
  Given AI 解讀的功能開關是打開的
  When 我還沒按「計算」
  Then 看不到「AI 解讀」按鈕
  When 我輸入 2330、買入價 500、數量 1000 並按「計算」
  Then 結果卡下方出現「AI 解讀」按鈕

Scenario: 單檔解讀
  Given 我算出台積電 +20,000（+4.00%）
  When 我按「AI 解讀」
  Then 按鈕變成「AI 解讀中…」且不能連按
  And 完成後出現解讀卡：一句話總結、2～4 點觀察、一句風險提醒
  And 解讀卡最下面有「僅為數據解讀，不構成投資建議」

Scenario: 多檔解讀
  Given 我比較了台積電與鴻海兩檔
  When 我按「AI 解讀」
  Then 送出的資料包含兩檔與合計，解讀卡描述整組持股的表現

Scenario: 只送數字，不送個人資料
  When 我按「AI 解讀」
  Then 送出去的只有股票代號、名稱、股數、平均成本、成本、現價、盈虧、報酬率與合計

Scenario: 不給投資建議
  Given AI 的回覆含有「建議」「應該」「買進」「賣出」「加碼」「減碼」「停損」「目標價」等字眼
  When 後端檢查回覆
  Then 後端自動請 AI 重寫一次
  And 重寫後還有，就拿掉含那些字眼的句子，解讀卡顯示「部分內容不符合『只描述數據』的規則，已移除。」

Scenario: 從外面連進來
  Given 工程同學的電腦執行了 npm run backend:tunnel
  And 我的手機用行動網路（跟那台電腦不同網路），裝的是設好網址的 APK
  When 我算完盈虧並按「AI 解讀」
  Then 看到解讀卡

Scenario: 後端沒開或連不到
  Given 電腦上的 npm run backend:tunnel 已經關掉，或手機連不到那台電腦
  When 我按「AI 解讀」
  Then 顯示「連不上 AI 解讀服務：提供服務的電腦可能還沒開（npm run backend:tunnel），請稍後再試」
  And 按鈕變成「重試 AI 解讀」，盈虧結果還在

Scenario: 後端沒設定 API key
  Given backend/.env 沒有 ANTHROPIC_API_KEY
  When 我按「AI 解讀」
  Then 顯示「AI 解讀後端沒有設定 ANTHROPIC_API_KEY…」，可以重試

Scenario: 太頻繁
  Given 我一分鐘內按了超過後端允許的次數
  When 我再按一次
  Then 顯示「使用太頻繁，請 N 秒後再試」，可以重試

Scenario: 今天的次數用完
  Given 所有人今天合計已經用完後端的每日上限
  When 任何人再按「AI 解讀」
  Then 顯示「今天的 AI 解讀次數已達上限，明天再試」

Scenario: 重新計算
  Given 已經顯示解讀卡
  When 我改了數字再按「計算」
  Then 舊的解讀卡消失，要再按一次「AI 解讀」
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | 後端測試（`npm run backend:test`） |
|---|---|---|---|
| 開關關閉時畫面完全不變 | — | `src/screens/CalculateScreen.test.tsx` | — |
| 算完才看得到按鈕 | — | 同上 | — |
| 單檔解讀（解讀中、解讀卡、免責聲明） | — | 同上 | `backend/src/server.test.ts` |
| 多檔解讀 | `src/domain/insightInput.test.ts` | 同上 | — |
| 只送數字，不送個人資料 | `insightInput.test.ts` | 同上 | `backend/src/insightRequest.test.ts`（多送的欄位丟掉） |
| 不給投資建議（重試、刪句、標記） | — | — | `backend/src/claudeInsight.test.ts`、`contentFilter.test.ts`、`server.test.ts` |
| 後端沒開或連不到 | `src/data/backendInsightProvider.test.ts` | 同上 | — |
| 後端沒設定 API key（503） | 同上 | — | `server.test.ts` |
| 太頻繁（429，含同時處理數） | 同上 | 同上 | `server.test.ts`、`rateLimit.test.ts` |
| 今天的次數用完（429） | — | — | `server.test.ts`、`rateLimit.test.ts` |
| 從外面連進來 | — | — | `server.test.ts`（只開兩條路、tunnel 後的來源 IP）、`ngrok.test.ts`；`npm run backend:tunnel` 用假的 ngrok 手動驗過，真 ngrok 見 test-plan I9 |
| 存取碼錯誤（401）、資料太大（413）、格式錯（400） | 同上 | — | `server.test.ts` |
| 網頁版 CORS | — | — | `server.test.ts` |
| 重新計算 | — | `CalculateScreen.test.tsx` | — |

自動化測試都不打真的 Claude：app 端用 `fakeInsightProvider`（固定回一份解讀），後端用假的 Claude client。真的解讀只在手動驗收時跑，見 [docs/test-plan.md](../test-plan.md) 的 I1～I8。

## 功能開關

由 `src/config/features.ts` 的 `aiInsight` 控制，**預設關閉**，APK 與測試同學的 Expo Go 都看不到「AI 解讀」按鈕。

工程同學要在自己的 dev server 打開：專案根目錄的 `.env.local`（已被 git 忽略）加

```
EXPO_PUBLIC_FEATURE_AI_INSIGHT=1
EXPO_PUBLIC_INSIGHT_ACCESS_TOKEN=<和 backend/.env 的 INSIGHT_ACCESS_TOKEN 相同>
# ngrok 的固定網址（npm run backend:tunnel 會印出）；同一台電腦的網頁版、同一個 Wi-Fi 的 Expo Go 可以不設
# EXPO_PUBLIC_INSIGHT_API_URL=https://xxxx.ngrok-free.app
```

再開 `npm run backend`（自己電腦／同 Wi-Fi）或 `npm run backend:tunnel`（給別人連），重開 `npx expo start` 後 reload。APK 要在 EAS 的 preview 環境設同樣的變數並發 OTA，步驟見 architecture.md 第 7 節。只想看畫面、不想開後端：`EXPO_PUBLIC_USE_FAKE_INSIGHT=1`（固定內容的假解讀）。
後端的設定、手機怎麼連、費用見 [docs/architecture.md](../architecture.md) 第 7 節「AI 解讀後端」。

`npm run ota` 會擋下 `.env.local` 裡開著的 `EXPO_PUBLIC_*=1`，所以不會不小心把開關發給所有人。

## 法規限制

依 [product-spec.md](../product-spec.md) 1.4「不給出買進／賣出建議（投顧法規風險）」與 P2-05 的 AC：

1. **prompt 明確禁止**：不提出操作方向、不預測股價、不評論公司前景，並列出禁用字眼（`backend/src/claudeInsight.ts` 的 `SYSTEM_PROMPT`）。
2. **回傳前檢查**：`backend/src/contentFilter.ts` 的 `BANNED_TERMS`：建議、應該、買進、賣出、加碼、減碼、停損、停利、目標價、進場、出場、逢低、逢高（含幾個簡體寫法）。命中就請 AI 重寫一次；再命中就刪掉含禁用字眼的句子，整段被刪光時用數字組一句中性描述補上，並把 `filtered` 設成 true。
3. **固定免責聲明**：每次回應都附「僅為數據解讀，不構成投資建議」，畫面放在解讀卡最下面。這句本身含「建議」，所以在檢查之後才加上。
4. 字眼檢查擋不住「換句話說」的建議（例如「可以考慮多買一些」）。prompt 是第一道防線，字眼檢查是最後一道保險；上架前要由 PO 抽查真實回覆。

## 決策紀錄

| # | 決策 | 理由 |
|---|---|---|
| 1 | 後端獨立放在 `backend/`，不用 Expo Router API route | 截圖匯入的 `/recognize` 要開 `npx expo start` 才有；獨立後端可以單獨開、單獨透過 tunnel 對外，APK 也能連（研究見 `docs/research/screenshot-import.md` §1.5） |
| 1a | 對外公開用 ngrok 免費 dev domain，`npm run backend:tunnel` 一個指令啟動後端＋ngrok | 使用者偏好 ngrok；免費帳號的 dev domain 固定不變，APK 打包時寫死的網址可以一直用。比較過 Cloudflare 具名 tunnel（要網域）、quick tunnel＋公開設定檔（快取 5～10 分鐘空窗）、換網址就發 OTA（每次都要發），都列在 architecture.md 第 7 節當備案 |
| 1b | tunnel 模式下後端只聽 127.0.0.1，來源 IP 取 `X-Forwarded-For` 最後一個，且只信任本機轉進來的連線 | ngrok 會把真實 IP 接在最後；只聽本機讓區網的人無法繞過 ngrok 或偽造 header 躲過頻率限制 |
| 2 | Node 內建 `http`，Node 24 直接跑 `.ts`（type stripping），`.env` 用 `--env-file-if-exists` | 執行期只依賴 `@anthropic-ai/sdk` 一個套件；不用 Express、dotenv、tsx |
| 3 | 模型 `claude-opus-5-5`、`effort: "low"`、structured outputs（JSON schema） | 依 `claude-api` skill 的預設模型；白話摘要不需要深度推理，low effort 省 token；schema 保證回 `summary`／`observations`／`riskNote` 三個欄位。另開 server-side fallback，安全分類器誤判時自動換模型 |
| 4 | 存取碼用 `Authorization: Bearer`，後端沒設就 503（fail closed） | 避免忘了設就整個裸奔。這個碼會被打包進 app，**不是秘密**，只擋路人 |
| 5 | 頻率限制以 IP 計、每分鐘 5 次；另有整台每天 100 次、同時 3 個 | 對外公開後存取碼等於公開（APK 在 GitHub Releases），真正限制花費的是每日上限與 Anthropic Console 的每月花費上限 |
| 6 | 送出格式 `InsightInput` 帶 `version: 1` 與 `feesIncluded` | 之後的記帳本（product-spec 第 3、4 章）可以用同一格式：平均成本、持有成本、未實現損益直接帶入並設 `feesIncluded: true`，後端與 prompt 不用改 |
| 7 | 沒設 `EXPO_PUBLIC_INSIGHT_API_URL` 時，網頁版用 `http://<網頁主機>:8787`、Expo Go 區網用 dev server 的 IP | 同一台電腦、同一個 Wi-Fi 開發免設定；Expo tunnel 與 APK 猜不到，畫面提示要設網址 |
| 7a | app 每個請求都帶 `ngrok-skip-browser-warning: 1` | ngrok 免費方案對瀏覽器請求會先回提示頁；手機 app 不受影響，但網頁版會 |
| 8 | 解讀不存檔、不快取；重新計算就要重按 | 每次都是當下數字；避免舊解讀配新數字 |
| 9 | Claude 的英文錯誤原文只寫後端 log，不回給 app | 研究報告 §3 的建議：使用者只看中文訊息 |

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈
- [x] 用真的 API key 實測一次（2026-10-27，兩檔，200、約 5 秒、輸入 1,235／輸出 254 tokens ≈ US$0.010，沒有禁用字眼）
- [ ] 用真的 ngrok 從外部網路驗證（開發時電腦上沒有安裝 ngrok；`npm run backend:tunnel` 只用假的 ngrok 驗過流程）
- [ ] 測試同學手機驗收通過
