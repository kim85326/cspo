import { useCallback, useEffect, useState } from "react";
import { candleSource, corporateActionSource } from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import { monthsBetween } from "@/domain/candles";
import type { PriceHistory, PriceHistoryState } from "./usePriceHistory";

type Sources = { candles: CandleSource; actions: CorporateActionSource };

/**
 * 「買在高點還是低點」單筆畫面（P2-09）要的資料：比較區間起始日到買入日（含買入那個月）的日 K，
 * 加上同一段的除權息與分割（拿不到是 null，結論改用未還原價格並註明）。
 * 跟 usePriceHistory 一樣：換區間時先留著上一次的資料（previous），畫面不閃。
 */
export function useBuyPointHistory(
  symbol: string,
  from: string,
  buyDate: string,
  sources: Sources = { candles: candleSource, actions: corporateActionSource },
): PriceHistoryState & { retry: () => void; previous: PriceHistory | null } {
  const [attempt, setAttempt] = useState(0);
  const key = `${symbol}|${from}|${buyDate}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; state: PriceHistoryState } | null>(null);
  const { candles: candleSrc, actions: actionSrc } = sources;

  useEffect(() => {
    let active = true;
    const settle = (state: PriceHistoryState) => {
      if (active) setSettled({ key, state });
    };
    (async () => {
      const candles = await candleSrc.getDailyCandles(symbol, monthsBetween(from, buyDate));
      const sorted = [...new Map(candles.map((c) => [c.date, c])).values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
      );
      const actions = await actionSrc.getActions(symbol, from, buyDate).catch(() => null);
      settle({ status: "ready", data: { candles: sorted, actions } });
    })().catch((error: unknown) => settle({ status: "error", error }));
    return () => {
      active = false;
    };
  }, [key, symbol, from, buyDate, candleSrc, actionSrc]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: PriceHistoryState = settled?.key === key ? settled.state : { status: "loading" };
  const previous = settled && settled.key !== key && settled.state.status === "ready" ? settled.state.data : null;
  return { ...state, retry, previous };
}
