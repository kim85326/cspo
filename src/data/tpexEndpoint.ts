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

/**
 * 櫃買中心「個股日成交資訊」：一檔一個月的日 K。免金鑰，沒有 CORS。
 * 參數 code 是代號、date 是那個月任一天（YYYY/MM/DD，西元）。只有上櫃；上市代號回空資料，不會報錯。
 * FinMind 拿不到時才用（見 tpexCandleSource.ts）。
 */
export const TPEX_TRADING_STOCK_URL = "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock";

/** 網頁版走的同源代理（src/app/tpex-day+api.ts） */
export const TPEX_DAY_WEB_PROXY_PATH = "/tpex-day";

/** 這個平台抓某檔某月日 K 的網址；month 是 "2026-10" */
export function tpexDayRequestUrl(symbol: string, month: string): string {
  const query = `code=${encodeURIComponent(symbol)}&date=${month.replace("-", "/")}/01&response=json`;
  const base = Platform.OS === "web" ? TPEX_DAY_WEB_PROXY_PATH : TPEX_TRADING_STOCK_URL;
  return `${base}?${query}`;
}

/**
 * 櫃買中心「除權除息計算結果表」：日期區間內全市場的除權息（含前收、參考價、現金股利、每仟股配股）。
 * 免金鑰，沒有 CORS。一年約 1,300 筆、1 秒。沒有發放日。
 */
export const TPEX_EX_DAILY_URL = "https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ";

/** 網頁版走的同源代理（src/app/tpex-ex+api.ts） */
export const TPEX_EX_WEB_PROXY_PATH = "/tpex-ex";

/** start、end 是 ISO 日期 */
export function tpexExRightRequestUrl(start: string, end: string): string {
  const query = `startDate=${start.replace(/-/g, "/")}&endDate=${end.replace(/-/g, "/")}&response=json`;
  const base = Platform.OS === "web" ? TPEX_EX_WEB_PROXY_PATH : TPEX_EX_DAILY_URL;
  return `${base}?${query}`;
}
