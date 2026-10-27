import { createDailyQuoteSource, type DailyQuoteSourceOptions } from "./dailyQuoteSource";
import { twseRequestUrl } from "./twseEndpoint";
import { parseTwseRows } from "./twseParse";

/**
 * 證交所來源（上市）：全市場收盤價，同時實作 PriceSource 與 StockDirectory。
 * 快取與失敗處理見 createDailyQuoteSource。
 */
export function createTwseSource(options: DailyQuoteSourceOptions = {}) {
  return createDailyQuoteSource(
    { market: "TWSE", sourceName: "證交所", defaultUrl: twseRequestUrl, parse: parseTwseRows },
    options,
  );
}

/** 全 app 共用的證交所來源（src/data/index.ts 把它跟櫃買中心合併） */
export const twseSource = createTwseSource();
