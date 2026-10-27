# AI 解讀後端

「賺了嗎」的「AI 解讀」（Story 017）用的本機後端。Anthropic API key 只放在這台電腦的 `backend/.env`。

```bash
cp backend/.env.example backend/.env   # 填 ANTHROPIC_API_KEY、INSIGHT_ACCESS_TOKEN
npm run backend                         # 在專案根目錄執行；port 8787
curl http://localhost:8787/health
npm run backend:test                    # 型別檢查 + 測試
```

- `src/server.ts`：路由、存取碼、頻率與每日上限、大小上限、CORS
- `src/claudeInsight.ts`：prompt、structured outputs、重試
- `src/contentFilter.ts`：禁用字眼檢查與刪句、免責聲明
- `src/insightRequest.ts`：請求格式（和 app 的 `src/domain/insightInput.ts` 一起改）

設定、手機怎麼連（區網、Cloudflare tunnel、CORS）、費用與花費上限：見 [docs/architecture.md](../docs/architecture.md) 第 7 節「AI 解讀後端」。
