import { Platform } from "react-native";

/**
 * 櫃買中心 OpenAPI：上櫃股票收盤行情（股票、ETF、ETN、特別股，不含權證）。免金鑰。
 * 欄位與證交所不同：代號是 SecuritiesCompanyCode、名稱是 CompanyName、收盤價是 Close。
 * 另一個 tpex_mainboard_daily_close_quotes 連權證都有（約 13,000 列、5 MB），太重不用，見 docs/stories/007 決策紀錄 2。
 */
export const TPEX_MAINBOARD_QUOTES_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";

/**
 * 網頁版走的同源代理路徑（src/app/tpex+api.ts）。
 * 櫃買中心跟證交所一樣沒有開 CORS；手機 app 直接打櫃買中心。
 */
export const TPEX_WEB_PROXY_PATH = "/tpex";

/** 這個平台該打哪個網址 */
export function tpexRequestUrl(): string {
  return Platform.OS === "web" ? TPEX_WEB_PROXY_PATH : TPEX_MAINBOARD_QUOTES_URL;
}
