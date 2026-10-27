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
