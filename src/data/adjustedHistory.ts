import { type AdjustedClose, adjustCloses } from "@/domain/adjustedPrice";
import { monthsBetween } from "@/domain/candles";
import type { CandleSource } from "./CandleSource";
import type { CorporateActionSource } from "./CorporateActionSource";

/**
 * 某檔 from～to（ISO，含頭尾）每個交易日的收盤價與還原收盤價（P2-05 B「如果改買 0050」用）。
 * 收盤價與除權息各問一次來源（有快取），再交給 domain 的 adjustCloses 算。
 * 任一個拿不到丟 PriceLoadError。
 */
export async function loadAdjustedCloses(
  symbol: string,
  from: string,
  to: string,
  sources: { candles: CandleSource; actions: CorporateActionSource },
): Promise<AdjustedClose[]> {
  const candles = (await sources.candles.getDailyCandles(symbol, monthsBetween(from, to))).filter(
    (c) => c.date >= from && c.date <= to,
  );
  const actions = await sources.actions.getActions(symbol, from, to);
  return adjustCloses(candles, actions);
}
