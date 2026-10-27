import type { Candle } from "@/domain/types";

/**
 * 日 K 來源介面。
 * - months："2026-08" 這種格式，由舊到新；回傳的 K 棒依日期由舊到新。
 * - 找不到代號、或那幾個月都沒交易：回空陣列。
 * - 拿不到資料（斷網、證交所沒回應）丟 PriceLoadError。
 */
export interface CandleSource {
  getDailyCandles(symbol: string, months: string[]): Promise<Candle[]>;
}
