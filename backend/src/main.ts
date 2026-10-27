import { loadConfig } from "./config.ts";
import { createInsightServer } from "./server.ts";

/** 進入點：npm start（或根目錄的 npm run backend）。設定見 backend/.env.example。 */
const config = loadConfig(process.env);
const server = createInsightServer(config);

server.listen(config.port, config.host, () => {
  console.log(`[insight] AI 解讀後端已啟動：http://localhost:${config.port}`);
  console.log(`[insight] 健康檢查：curl http://localhost:${config.port}/health`);
  if (config.apiKey === "") console.warn("[insight] 警告：沒有設定 ANTHROPIC_API_KEY，/insight 會回 503");
  if (config.accessToken === "") {
    console.warn("[insight] 警告：沒有設定 INSIGHT_ACCESS_TOKEN，/insight 會回 503");
  }
  console.log(`[insight] 網頁版允許的來源：${config.allowedOrigins.join(", ")}`);
});
