import { Platform } from "react-native";

/**
 * 證交所 OpenAPI：全市場每日收盤行情，一次拿齊代號、名稱、收盤價。免金鑰。
 * 交易日 15:00 後更新，假日回最近一個交易日。
 */
export const TWSE_STOCK_DAY_ALL_URL =
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";

/**
 * 網頁版走的同源代理路徑（src/app/twse+api.ts）。
 * 證交所沒有開 CORS，瀏覽器不能直接打；手機 app 沒有這個限制，直接打證交所。
 */
export const TWSE_WEB_PROXY_PATH = "/twse";

/** 這個平台該打哪個網址 */
export function twseRequestUrl(): string {
  return Platform.OS === "web" ? TWSE_WEB_PROXY_PATH : TWSE_STOCK_DAY_ALL_URL;
}

/**
 * 證交所「個股日成交資訊」：一檔股票一個月的日 K（開高低收）。免金鑰。
 * 參數 date 是那個月任一天（YYYYMMDD），stockNo 是代號。只有上市股票；上櫃要另接櫃買中心。
 * 證交所會擋太頻繁的請求，所以一次只抓一個月、依序抓，並快取（見 twseCandleSource.ts）。
 */
export const TWSE_STOCK_DAY_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";

/** 網頁版走的同源代理（src/app/twse-day+api.ts），理由同上 */
export const TWSE_DAY_WEB_PROXY_PATH = "/twse-day";

/** 這個平台抓某檔某月日 K 的網址；month 是 "2026-10" */
export function twseDayRequestUrl(symbol: string, month: string): string {
  const query = `date=${month.replace("-", "")}01&stockNo=${encodeURIComponent(symbol)}&response=json`;
  const base = Platform.OS === "web" ? TWSE_DAY_WEB_PROXY_PATH : TWSE_STOCK_DAY_URL;
  return `${base}?${query}`;
}

/**
 * 證交所「除權除息計算結果表」TWT49U：日期區間內全市場的除權息（含前收、參考價、權值+息值）。
 * 一年約 1,500 筆、260 KB。沒有發放日；現金與配股合在「權值+息值」，要拆開得查 TWT49UDetail。
 * 這兩支（www.twse.com.tw/rwd/...）實測有 Access-Control-Allow-Origin: *，網頁版直接打，不另做代理。
 */
export const TWSE_EX_RIGHT_URL = "https://www.twse.com.tw/rwd/zh/exRight/TWT49U";
export const TWSE_EX_RIGHT_DETAIL_URL = "https://www.twse.com.tw/rwd/zh/exRight/TWT49UDetail";

/** start、end 是 ISO 日期 */
export function twseExRightRequestUrl(start: string, end: string): string {
  return `${TWSE_EX_RIGHT_URL}?startDate=${start.replace(/-/g, "")}&endDate=${end.replace(/-/g, "")}&response=json`;
}

/** 某檔某次除權息的明細（現金每股幾元、每千股配幾股）；exDate 是 ISO */
export function twseExRightDetailRequestUrl(symbol: string, exDate: string): string {
  return `${TWSE_EX_RIGHT_DETAIL_URL}?STK_NO=${encodeURIComponent(symbol)}&T1=${exDate.replace(/-/g, "")}&response=json`;
}
