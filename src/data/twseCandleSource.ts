import type { CandleSource } from "./CandleSource";
import { createMonthlyCandleSource, type MonthlyCandleSourceOptions } from "./monthlyCandleSource";
import { twseDayRequestUrl } from "./twseEndpoint";
import { parseTwseDayCandles } from "./twseDayParse";

export { CURRENT_MONTH_TTL_MS } from "./monthlyCandleSource";

/**
 * 證交所日 K 來源（只有上市）：STOCK_DAY 一次一檔一個月。
 * 抓法與快取規則見 monthlyCandleSource.ts（櫃買中心 tpexCandleSource 共用同一套）。
 */
export function createTwseCandleSource(options: MonthlyCandleSourceOptions = {}): CandleSource {
  return createMonthlyCandleSource(
    { sourceName: "證交所", urlFor: twseDayRequestUrl, parse: parseTwseDayCandles },
    options,
  );
}

/** 全 app 共用（src/data/index.ts 決定要不要用它） */
export const twseCandleSource = createTwseCandleSource();
