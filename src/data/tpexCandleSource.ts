import type { CandleSource } from "./CandleSource";
import { createMonthlyCandleSource, type MonthlyCandleSourceOptions } from "./monthlyCandleSource";
import { tpexDayRequestUrl } from "./tpexEndpoint";
import { parseTpexDayCandles } from "./tpexDayParse";

/**
 * 櫃買中心日 K 來源（只有上櫃）：tradingStock 一次一檔一個月。
 * FinMind 拿不到時的備援；抓法與快取規則跟證交所相同（monthlyCandleSource.ts）。
 */
export function createTpexCandleSource(options: MonthlyCandleSourceOptions = {}): CandleSource {
  return createMonthlyCandleSource(
    { sourceName: "櫃買中心", urlFor: tpexDayRequestUrl, parse: parseTpexDayCandles },
    options,
  );
}

/** 全 app 共用（src/data/index.ts 決定要不要用它） */
export const tpexCandleSource = createTpexCandleSource();
