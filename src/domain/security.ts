import type { Market, Quote, SecurityType, StockInfo } from "./types";

/**
 * 依代號判斷個股或 ETF：代號以 `00` 開頭即為 ETF，其餘都是個股。
 * 簡化規則：ETN（02 開頭）與特別股（例如 8349A）會被當成個股，見 docs/stories/007 決策紀錄 1。
 */
export function securityTypeOf(symbol: string): SecurityType {
  return symbol.trim().startsWith("00") ? "etf" : "stock";
}

/** 畫面上的類型標籤 */
export const SECURITY_TYPE_LABEL: Record<SecurityType, string> = {
  stock: "個股",
  etf: "ETF",
};

/** 行情資料 → 證券基本資料（類型由代號判斷） */
export function toStockInfo(quote: Pick<Quote, "symbol" | "name">, market: Market): StockInfo {
  return { symbol: quote.symbol, name: quote.name, type: securityTypeOf(quote.symbol), market };
}
