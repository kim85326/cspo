import type { StockInfo } from "@/domain/types";
import { STOCKS } from "./stocks";

/** 選擇器空白時的「熱門股票」順序：照 stocks.ts 的順序，台積電第一 */
const HOT_SYMBOLS: readonly string[] = STOCKS.map((s) => s.symbol);

/**
 * 把證券清單排成選擇器要的順序：熱門清單在前（照 stocks.ts 的順序），其餘依代號排序，上市上櫃混排。
 * 同一代號出現多次只留第一筆（合併來源把上市排前面，所以重複時以上市為準）。
 */
export function orderForDirectory(stocks: Iterable<StockInfo>): StockInfo[] {
  const bySymbol = new Map<string, StockInfo>();
  for (const s of stocks) if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, s);

  const hot: StockInfo[] = [];
  for (const symbol of HOT_SYMBOLS) {
    const stock = bySymbol.get(symbol);
    if (stock) {
      hot.push(stock);
      bySymbol.delete(symbol);
    }
  }
  const rest = [...bySymbol.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return [...hot, ...rest];
}
