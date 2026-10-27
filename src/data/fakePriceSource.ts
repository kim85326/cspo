import type { PriceSource } from "./PriceSource";
import { STOCKS } from "./stocks";

/**
 * 固定假價：demo 與自動化測試用，結果可重現。
 * 第二迭代接證交所資料時，用同一個介面換掉即可。
 */
export const fakePriceSource: PriceSource = {
  async getQuote(symbol) {
    return STOCKS.find((s) => s.symbol === symbol) ?? null;
  },
};
