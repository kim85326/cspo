# AI 解讀後端

「賺了嗎」的「AI 解讀」（Story 017）用的本機後端。Anthropic API key 只放在這台電腦的 `backend/.env`。

```bash
cp backend/.env.example backend/.env   # 填 ANTHROPIC_API_KEY、INSIGHT_ACCESS_TOKEN
npm run backend                         # 在專案根目錄執行；port 8787，只給自己電腦／同 Wi-Fi
npm run backend:tunnel                  # 後端 + ngrok 固定網址，讓別人從外面連進來
curl http://localhost:8787/health
npm run backend:test                    # 型別檢查 + 測試
```

- `src/server.ts`：只開 /health 與 /insight；存取碼、頻率、每日上限、同時處理數、大小上限、CORS、tunnel 後的來源 IP
- `src/tunnel.ts`、`src/ngrok.ts`：npm run backend:tunnel（檢查 ngrok、只聽 127.0.0.1、拿公開網址、從外面打 /health）
- `src/claudeInsight.ts`：prompt、structured outputs、重試
- `src/contentFilter.ts`：禁用字眼檢查與刪句、免責聲明
- `src/insightRequest.ts`：請求格式（和 app 的 `src/domain/insightInput.ts` 一起改）

設定、給別人連進來的完整步驟（ngrok、APK 的 EAS 變數、CORS、確認與關閉）、防濫用、費用與花費上限：見 [docs/architecture.md](../docs/architecture.md) 第 7 節「AI 解讀後端」。
