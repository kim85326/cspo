# Story 020：Free／Pro 鎖定畫面（只做畫面，不串金流）

**身為** 免費版使用者
**我想要** 看得到 Pro 有哪些功能、鎖住的功能長什麼樣子
**以便** 知道升級後能得到什麼

> 對應 product-spec **P2-08**、實作指南 **T14**、Tech Day 範圍與優先順序第 4 項。
> **只做畫面，不串金流**：按「升級 Pro」只顯示「Pro 方案即將推出」，不進入任何付款流程。
> 由 `src/config/features.ts` 的 `proPlan` 開關控制，**預設關閉**（APK 一律關閉）。開法：`.env.local` 加 `EXPO_PUBLIC_FEATURE_PRO_PLAN=1`；APK 用 `node scripts/feature-flags.mjs set proPlan on` 遠端打開（Story 033）。

## 驗收條件

Pro 功能（實作指南 T14；Free／Pro 欄文字對照 product-spec P2-08 方案表）：

| 功能 | Free | Pro |
|---|---|---|
| 年化報酬率 | — | ✓ |
| 個股 vs ETF 對決（完整） | 只有核心 vs 衛星 | ✓ 完整 |
| 股利自動帶入 | — | ✓ |
| 定期定額自動記帳 | 1 條規則 | 不限 |
| 資產走勢與配置 | 近 1 個月 | 全部期間 |

```gherkin
Scenario: 功能開關關閉時看不到 Pro
  Given proPlan 開關是關的（APK 的狀態）
  When 我打開設定頁
  Then 只看得到免責聲明，沒有「方案」區塊，也沒有 Demo 開關
  And 直接打開 /pro 會被導回首頁

Scenario: 預設是 Free
  Given proPlan 開關是開的，我沒動過 Demo 開關
  When 我打開設定頁
  Then 「方案」區塊顯示「目前方案：Free」與「查看 Pro 方案」

Scenario: 看 Pro 方案介紹
  When 我點「查看 Pro 方案」
  Then 我看到 Free／Pro 方案比較表，列出上表每一項
  And 「功能預覽」每項都有說明、灰色示意圖與「🔒 Pro」標籤

Scenario: 按升級不會付款
  Given 我是 Free
  When 我在介紹頁按「升級 Pro」
  Then 顯示「Pro 方案即將推出」，說明目前不會收取任何費用
  And 沒有進入任何付款畫面

Scenario: 被鎖住的功能顯示預覽而不是隱藏
  Given 某個 Pro 功能畫面用 ProGate 包住，我是 Free
  Then 原本的內容不顯示，改顯示功能名稱、說明、示意圖與「升級 Pro」按鈕
  When 我按「升級 Pro」
  Then 進到 Pro 方案介紹頁

Scenario: Demo 開關解鎖全部
  When 我打開設定頁底部的「Demo：解鎖所有 Pro 功能」
  Then 「目前方案」變成「Pro（Demo 解鎖）」
  And 介紹頁每一項都顯示「Pro 已解鎖」，沒有「升級 Pro」按鈕
  And 用 ProGate 包住的內容直接顯示

Scenario: 重開 app 仍維持
  Given 我打開了 Demo 開關
  When 我完全關掉 app 再重新打開
  Then 仍然是 Pro

Scenario: 關掉 Demo 開關
  Given Demo 開關是開的
  When 我把它關掉
  Then 回到 Free，所有 Pro 功能重新鎖住
```

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 功能開關關閉時看不到 Pro | — | `src/screens/SettingsScreen.test.tsx`、`src/screens/ProScreen.test.tsx` | — |
| 預設是 Free | `src/domain/plan.test.ts`（`isPro`） | `src/screens/SettingsScreen.test.tsx` | — |
| 看 Pro 方案介紹 | `src/domain/plan.test.ts`（`PRO_FEATURES`） | `src/screens/ProScreen.test.tsx` | —（手動，見 test-plan P1、P2） |
| 按升級不會付款 | — | `src/screens/ProScreen.test.tsx` | —（手動，見 test-plan P3） |
| 被鎖住的功能顯示預覽 | — | `src/ui/ProLockedCard.test.tsx` | — |
| Demo 開關解鎖全部 | `src/domain/plan.test.ts` | `src/screens/SettingsScreen.test.tsx`、`src/screens/ProScreen.test.tsx`、`src/ui/ProLockedCard.test.tsx` | —（手動，見 test-plan P4） |
| 重開 app 仍維持 | — | `src/screens/SettingsScreen.test.tsx` | — |
| 關掉 Demo 開關 | — | `src/screens/SettingsScreen.test.tsx` | — |

Maestro 沒寫：Pro 畫面預設關閉，Expo Go 要另外設環境變數才看得到，等功能開關打開時再補。

## 決策紀錄

- **是不是 Pro 只問一個函式**：`src/domain/plan.ts` 的 `isPro(entitlement)`。目前 entitlement 只有 Demo 開關；之後串金流在 `Entitlement` 加訂閱狀態、改 `isPro` 這一處即可。畫面透過 `useProStatus()`（`src/hooks/useProStatus.tsx`，Provider 放在根 layout）拿結果，設定頁切開關後其他畫面立刻跟著變。沒包 Provider 時一律當 Free。
- **Demo 開關存手機**：AsyncStorage key `cspo.proDemoUnlocked.v1`，`"1"` 為開。讀失敗當作關（維持鎖住，不會意外解鎖）。
- **Pro 功能目前都還沒做**（T7、T11、T16、T17、T18），所以這次的鎖定畫面集中在 Pro 介紹頁的「功能預覽」，並提供 `ProGate` 元件。之後做這些功能時用 `<ProGate feature="annualizedReturn">…</ProGate>` 包住，Free 就會看到鎖定卡片。
- **預覽是灰色示意圖**，不放假數字，避免使用者以為那是自己的結果。
- **Pro 入口放在設定頁**：首頁還沒有分頁導覽，`CalculateScreen` 一行都沒動。
- **比較表不列**「註冊與雲端同步」（雲端同步不在 Tech Day 範圍）、「拍照匯入每月 3 次」（P2-08 說次數限制這次不做，截圖匯入也還在功能開關後面）、「成交回報 email 自動匯入」（Phase 3）。第一列用「記帳、盈虧計算等基本功能」代表「MVP 全部功能」。這點請 PO 確認。
- 介紹頁最下面寫「之後如果不再是 Pro，已經記錄的資料都會保留，只是 Pro 功能會鎖住」，對應 P2-08「絕不因為降級而刪除使用者資料」。
- 文案避開「建議」「應該」「買進」「賣出」（`plan.test.ts` 有檢查）。

## 狀態

- [ ] AC 經 PO 確認
- [x] 實作完成、自動化測試綠燈（功能開關預設關閉）
- [ ] 測試同學手機驗收通過
