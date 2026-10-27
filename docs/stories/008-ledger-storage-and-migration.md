# Story 008：新儲存層與舊資料搬移

**身為** 已經在舊版 App 存了持股的測試同學
**我想要** 升級到新版後，原本存的持股自動變成交易紀錄，什麼都不用重打
**以便** 之後記賣出、股利、看持股明細時，直接從原本的資料接著記，不會因為換版本而少了資料或算錯錢

這張 story 只做**儲存層與搬移**，沒有新畫面：交易輸入畫面是 Story 009（T4），首頁總覽是 Story 011（T6）。
現在的 `CalculateScreen` 透過過渡轉接讀寫新記帳本，用起來跟以前一樣。
對應規格：[product-spec.md](../product-spec.md) 的 M-07、1.5「資料搬移」與第 4 章資料模型；實作指南 [T3](../mvp-implementation-guide.md)。名詞見 [glossary.md](../glossary.md)。

## 驗收條件

```gherkin
Scenario: 舊版存了 2 檔，升級後看到 2 筆買入交易
  Given 舊版 App 存了 2330（600 元、1000 股、買入日期 2026/01/05）和 2317（100.5 元、2000 股、沒填日期）
  When 我升級後第一次開 App
  Then 記帳本有 2 筆買入交易，備註以「由舊版資料轉入」開頭
  And 2330 那筆的交易日期是 2026-01-05、手續費 855 元（規格 3.2）
  And 首頁照樣帶回這 2 檔，按「計算」看得到結果
  And 舊資料（cspo.holdings.v1）刪掉了

Scenario: 舊資料沒填買入日期
  Given 舊版存的一筆持股沒有買入日期
  When 搬移
  Then 交易日期用搬移當天，並標成「日期不明」
  And 備註是「由舊版資料轉入（舊資料沒有買入日期，暫用轉入當天）」
  And 首頁的「買入日期」欄位維持空白，K 線圖不標買入點

Scenario: 舊資料的買入日期認不出來
  Given 舊版存的買入日期是「去年十月」、「2026/02/30」或晚於今天
  When 搬移
  Then 這筆照樣搬，交易日期用搬移當天，標成「日期不明」
  And 備註留下原本打的字：「由舊版資料轉入（原買入日期「去年十月」無法辨識，暫用轉入當天）」

Scenario: 手打的各種日期寫法都認得
  Given 舊版存的買入日期是 2026-01-05、2026.1.5 或全形「２０２６／０１／０５」
  When 搬移
  Then 交易日期都是 2026-01-05

Scenario: 有幾筆舊資料不合法
  Given 舊資料裡有一筆買入價是「abc」，另一筆格式整個不對
  When 搬移
  Then 其餘合法的照搬，不合法的略過，整個搬移不會失敗
  And 舊資料原文另存一份備份（cspo.holdings.v1.backup），不會跟著刪掉

Scenario: 搬移中途失敗，舊資料不會不見
  Given 寫入新記帳本時出錯（例如手機空間不足）
  When 我開 App
  Then 舊資料原封不動，也不會留下寫一半的新記帳本
  And 這次開 App 看到的是空的；下一次讀取或下次開 App 會再搬一次
  And 搬移成功之前不會寫入新記帳本，免得舊資料被當成搬過了

Scenario: 寫進去讀回來不一致
  When 新記帳本寫入後讀回來跟寫進去的不一樣
  Then 當作搬移失敗，舊資料還在

Scenario: 搬過就不再搬
  Given 已經搬過一次，但刪除舊資料時失敗、舊資料還在
  When 我再開 App
  Then 不會再搬一次，交易不會變兩倍

Scenario: 資料損壞時不讓 App 崩潰
  Given 記帳本的內容壞掉（不是 JSON、版本不認得、沒有交易陣列、或重播時賣超）
  When 讀取記帳本
  Then 回傳空的記帳本，App 照常開
  And 壞掉的原文另存一份（cspo.ledger.v1.corrupt），之後救得回來

Scenario: 搬過來的交易交給計算引擎
  Given 舊版存了 2330 600 元 1000 股（2026/01/05）與 500 元 1000 股（2026/02/05）
  When 搬移後用計算引擎算 2330
  Then 持有 2000 股、持有成本 1,101,567、平均成本 550.7835（規格 3.7 步驟 1、2）

Scenario: 關閉重開 App 資料還在（M-07）
  Given 我在首頁輸入持股並按「計算」
  When 關掉 App 再打開
  Then 持股帶回欄位，記帳本裡的交易、股利與設定都還在
```

## 給畫面用的介面（T4、T5、T6 從這裡接）

畫面讀寫記帳本一律走 `LedgerRepository`（`src/data/ledgerRepository.ts`）或 `useLedger` hook（`src/hooks/useLedger.ts`），不要直接碰 `LedgerStore` 或 AsyncStorage。

```ts
const { ledger, loaded, repository } = useLedger();          // 預設用 src/data 的 ledgerRepository
const result = await repository.addTransaction(draft);        // draft 不含 id、createdAt、updatedAt
if (!result.ok) showError(result.error.message);              // 賣超、欄位錯、存檔失敗都有中文訊息
```

| 方法 | 說明 |
|---|---|
| `getSnapshot()` / `load()` / `subscribe()` / `reload()` | 讀、等讀完、訂閱變更、重新從手機讀 |
| `addTransaction` / `updateTransaction` / `deleteTransaction` | 先經過 `validateLedgerChange`（從頭重播），存檔成功才更新並通知 |
| `addDividend` / `updateDividend` / `deleteDividend` | 同上 |
| `setBucket(symbol, bucket \| null)` | 核心／衛星手動切換，`null` 改回依類型預設（M-06） |
| `updateSettings(partial)` | 手續費設定；不回頭改已存交易 |
| `replaceLedger(ledger)` | 整份取代，`validateLedger` 不過就拒絕 |

- 寫入結果是 `LedgerWriteResult`：成功帶新的整份記帳本；失敗的 `error.code` 是 `oversell`、`stockDividendWithoutShares`、`invalid`、`notFound`（沿用 Story 006 的 `LedgerError`）或 `saveFailed`。
- 寫入依呼叫順序排隊，同時按兩次不會互相覆蓋。
- 測試與畫面開發用 `createMemoryLedgerRepository(initialLedger?, { now, newId })`，資料不進手機；`ledgerTestData.ts` 的 `spec37Ledger()` 可當初始資料。
- 畫面測試若用預設的 `ledgerRepository`，`AsyncStorage.clear()` 之後要 `await ledgerRepository.reload()`，否則記憶體裡還是上一個測試的資料。

## 對應的自動化測試

| 情境 | 單元測試 | 畫面測試 | Maestro |
|---|---|---|---|
| 舊版存了 2 檔 → 2 筆買入 | `src/domain/migrateSavedHoldings.test.ts`、`src/data/asyncStorageLedgerStore.test.ts` | `src/screens/CalculateScreen.migration.test.tsx` | — |
| 沒填買入日期 | `migrateSavedHoldings.test.ts`（含轉接不帶日期回欄位） | — | — |
| 買入日期認不出來 | `migrateSavedHoldings.test.ts` | — | — |
| 各種日期寫法 | 同上 | — | — |
| 有幾筆不合法 | 同上、`asyncStorageLedgerStore.test.ts`（備份） | — | — |
| 搬移中途失敗（`setItem` 丟錯） | `asyncStorageLedgerStore.test.ts` | — | — |
| 讀回來不一致 | 同上 | — | — |
| 搬過就不再搬 | 同上 | — | — |
| 資料損壞 | 同上 | — | — |
| 交給計算引擎 | `migrateSavedHoldings.test.ts`、`asyncStorageLedgerStore.test.ts` | — | — |
| 畫面用介面（新增／修改／刪除、賣超拒絕、存檔失敗、依序寫入、訂閱） | `src/data/ledgerRepository.test.ts`、`src/hooks/useLedger.test.ts` | — | — |
| 關閉重開資料還在 | `asyncStorageLedgerStore.test.ts`、`src/data/ledgerHoldingStore.test.ts` | `src/screens/CalculateScreen.test.tsx`（Story 004 情境沿用，現在底下是新記帳本） | `e2e/001-*.yaml`（沿用） |

搬移只在升級的那一次發生，Maestro 做不出「舊版存資料 → 升級」的情境，改由測試同學手機驗收：先裝舊版 APK 存 2 檔，再 OTA 升級，確認 2 檔都在。

## 決策紀錄

規格沒寫到、或需要選做法的地方。原則：選最不會讓使用者算錯錢、也最不會讓資料不見的做法。

1. **【PO 已確認，27-10-2026】舊資料有合法的買入日期時，交易日期用那個日期，不用搬移當天。** 規格 1.5 寫「日期為搬移當天」，但寫規格時舊版還沒有「買入日期」欄位（Story 016 才加）。使用者填過的日期是真的買入日，改成搬移當天會讓持有天數、年化報酬率（XIRR）、K 線圖買入點都錯，所以只有沒填或認不出來時才用搬移當天。PO 已確認採用買入日期，product-spec 1.5 已同步修改。
2. **買入日期沒填或認不出來，照樣搬，日期用搬移當天，並標 `tradeDateUnknown`。** 認不出來包含：格式不對、沒有這一天（2026/02/30）、晚於今天。日期只影響持有天數與年化報酬率，不影響成本與損益，不值得為了日期丟掉整筆持股。備註寫明原因，認不出來的會留下原本打的字，使用者之後看得懂、可以自己改（T4 交易編輯畫面）。
3. **`Transaction` 加了選填欄位 `tradeDateUnknown`**（規格第 4 章沒有）。用途：首頁轉接不把暫用日期帶回「買入日期」欄位（免得 K 線圖在今天標一個使用者沒填過的買入點）；之後 T5／T11 可以提示「這筆日期是暫用的，持有天數與年化報酬率不準」。
4. **日期接受的寫法沿用首頁「買入日期」欄位的解析**（`parseBuyDate`：`2026/10/05`、`2026-10-05`、`2026.10.5`、全形數字）。舊版存的是使用者打的原始字串，舊版畫面接受的寫法這裡都要認得。
5. **手續費依規格 3.2 用預設設定重算。** 舊版本來不算手續費，所以搬過來之後持有成本會多出買入手續費、盈虧會比舊版少一點（例如 2330 600 元 1000 股多 855 元）。這是規格要的，PO 發布前通知測試同學時建議一起說明。
6. **代號、買入價、股數的驗證沿用首頁的 `validateHoldingInput`**（代號去空白轉大寫、價格 > 0、股數為正整數）。不合法的略過，不讓整批失敗。
7. **「搬過了沒」的記號就是新記帳本（`cspo.ledger.v1`）在不在。** 不另外存旗標：新記帳本在就不搬，所以刪舊 key 失敗也不會重複搬。
8. **先寫新記帳本、讀回來比對一字不差，才刪舊 key**（實作指南）。寫入或比對失敗時，把可能寫一半的新 key 刪掉並當作失敗：留著它會被當成「搬過了」，舊資料就再也搬不過來。
9. **搬移還沒成功時，記帳本拒絕寫入**（`save`、`clear` 丟錯；首頁吞掉這個錯，只是這次輸入沒存）。理由同上：一旦先寫了新記帳本，舊資料就被當成搬過了。讀取不受影響，回空記帳本。同一次開 App 的下一次讀寫會重試搬移。
10. **有筆數被略過時，舊資料原文另存 `cspo.holdings.v1.backup`**，不跟著舊 key 刪掉。規格說轉換成功後刪除舊資料；被略過的那幾筆沒有轉換成功，留一份原文才不會真的不見。全部搬成功時不留備份。
11. **舊資料整份讀不懂（不是 JSON、不是陣列）時不動它，也不建新記帳本**，下次開 App 會再試。舊 key 一直留在手機上。
12. **記帳本壞掉時回空記帳本，原文另存 `cspo.ledger.v1.corrupt`**（只留第一次壞掉的那份，不覆蓋）。「重播時賣超」也算壞掉：照用會讓計算引擎丟錯（Story 006 決策 12）。個別欄位型別不對的交易、股利、持股設定略過；手續費設定缺的欄位用預設值。
13. **搬移在第一次讀寫記帳本時自動執行**，不另外在 `_layout.tsx` 加啟動流程。首頁一開就會讀記帳本，效果等於「升級後第一次開啟時」。
14. **過渡轉接 `ledgerHoldingStore`**：`CalculateScreen` 還是讀寫 `SavedHolding`，轉接把記帳本的買入交易轉成欄位字串、把畫面上的持股整份取代記帳本的交易（沒改的那幾筆沿用原本的交易，保留 id、建立時間與「由舊版資料轉入」備註；股利與設定不動）。「清除已儲存的資料」清掉交易與股利，手續費與持股設定留著。**T4 加入賣出與股利後，這個整份取代會把交易畫面記的賣出蓋掉**，所以 T4 要嘛同時把首頁改成唯讀，要嘛 T6 一起換掉首頁並刪除轉接。
15. 舊的 `asyncStorageHoldingStore.ts`（`cspo.holdings.v1`）保留，只用來讀舊資料（`parseSavedHoldings`）；app 不再寫入舊 key。
16. **畫面一律透過 `LedgerRepository` 寫入**，記憶體裡只有一份記帳本，所有用 `useLedger` 的畫面同步更新（`useSyncExternalStore`）。存檔失敗時記憶體不變，免得畫面顯示的跟手機裡的不一樣。過渡轉接也走同一個 repository。
17. 交易 id 用「時間 + 流水號 + 亂數」，不加 uuid 套件。只在這台手機上用，不會撞號；P2-01b 雲端同步時再換成 uuid。

## 狀態

- [ ] AC 經 PO 確認（決策 1 已確認：使用買入日期）
- [x] 實作完成、自動化測試綠燈
- [ ] 測試同學手機驗收通過（裝舊版存 2 檔 → OTA 升級 → 2 檔都在）
