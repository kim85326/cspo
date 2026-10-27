import type { PriceSource } from "./PriceSource";
import { STOCKS } from "./stocks";

/** 固定假價：demo 與自動化測試用，結果可重現。上市上櫃都在 stocks.ts。 */
export const fakePriceSource: PriceSource = {
  async getQuote(symbol) {
    const stock = STOCKS.find((s) => s.symbol === symbol);
    return stock ? { symbol: stock.symbol, name: stock.name, price: stock.price } : null;
  },
};
