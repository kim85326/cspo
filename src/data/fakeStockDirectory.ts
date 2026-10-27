import type { StockDirectory } from "./StockDirectory";
import { STOCKS } from "./stocks";

/** 固定清單：demo 與自動化測試用 */
export const fakeStockDirectory: StockDirectory = {
  async getAll() {
    return STOCKS.map(({ symbol, name, type, market }) => ({ symbol, name, type, market }));
  },
};
