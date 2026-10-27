import { createDailyQuoteSource, type DailyQuoteSourceOptions } from "./dailyQuoteSource";
import { tpexRequestUrl } from "./tpexEndpoint";
import { parseTpexRows } from "./tpexParse";

/**
 * 櫃買中心來源（上櫃）：上櫃股票收盤價，同時實作 PriceSource 與 StockDirectory。
 * 快取與失敗處理見 createDailyQuoteSource。
 */
export function createTpexSource(options: DailyQuoteSourceOptions = {}) {
  return createDailyQuoteSource(
    { market: "TPEx", sourceName: "櫃買中心", defaultUrl: tpexRequestUrl, parse: parseTpexRows },
    options,
  );
}

/** 全 app 共用的櫃買中心來源（src/data/index.ts 把它跟證交所合併） */
export const tpexSource = createTpexSource();
