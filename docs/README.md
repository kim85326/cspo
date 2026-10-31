# 文件索引

- [architecture.md](architecture.md)：架構、分工、迭代規劃。先讀這份。
- [product-spec.md](product-spec.md)：產品規格書，MVP 到 Phase 3 的完整功能藍圖與計算規則。拆 story 前先讀。
- [mvp-implementation-guide.md](mvp-implementation-guide.md)：MVP 與 Tech Day 實作指南，開發順序與任務拆解（T1–T18）與可直接貼給 AI agent 的開工 prompt。
- [glossary.md](glossary.md)：共同語言。寫 story、寫 code、回報 bug 都用這裡的詞。
- [stories/](stories/)：每張 story 一個檔，含驗收條件與對應的自動化測試。
- [po-open-questions.md](po-open-questions.md)：所有 story 裡等 PO 決定的問題，依任務整理成白話清單（最前面是最需要先決定的 5 題）。
- [test-plan.md](test-plan.md)：測試同學的手動檢查清單與 bug 回報格式。
- [research/history-and-dividend-sources.md](research/history-and-dividend-sources.md)：Phase 2 歷史收盤價與除權息資料來源試打結果與建議組合。

## Story 編號對照

2026-10-28 起，story 編號一律照 [實作指南](mvp-implementation-guide.md) 任務表；規格外的功能從 030 起往後排。之前平行開發時撞號或錯號的，改號對照如下（檔案用 `git mv` 改名，歷史還在）：

| 現在 | 原本 | 內容 | 對應 |
|---|---|---|---|
| 016 | 016 | Google 登入 | 實作指南（另一個分支，暫停中，這次沒動那個分支） |
| 017 | 025 | 年化報酬率（XIRR）與資產配置（計算） | T11 |
| 018 | 027 | 個股 vs ETF 對決 A（核心 vs 衛星） | T12 |
| 019 | 028 | 配置圓餅圖與年化報酬率（畫面） | T13（及 T11 的畫面） |
| 021 | 019 | 歷史收盤價、還原股價與除權息資料來源 | T15 |
| 025 | 029 | 資料模型預留多幣別 | T1b |
| 030 | 016 | K 線圖與買在高點還是低點（含 P2-09、買入日期的日曆選擇） | 規格外（P2-09 在規格書是「待定」） |
| 031 | 017 | AI 解讀 | 規格外 |
| 032 | 018 | 版本標示 | 規格外 |
| 033 | 026 | 功能開關遠端切換 | 規格外 |
| 034 | — | 收盤損益、除息日、定期定額扣款的本地通知 | 規格外（原生功能第一批） |
| 035 | — | 打開 app 時用指紋／臉部／螢幕鎖驗證 | 規格外（原生功能第一批） |
| 036 | — | 觸覺回饋 | 規格外（原生功能第一批） |

014（備份、還原、匯出）這次不做，所以沒有檔案。舊 commit 訊息、舊 PR 裡寫的編號是改號前的，對照上表看。
