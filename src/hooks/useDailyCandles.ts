import { useCallback, useEffect, useState } from "react";
import { candleSource } from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import { localIsoDate } from "@/domain/buyDate";
import { chartMonths } from "@/domain/candles";
import type { Candle } from "@/domain/types";

export type DailyCandlesState =
  | { status: "loading" }
  | { status: "ready"; candles: Candle[] }
  | { status: "error" };

/**
 * 抓某檔股票的日 K：近 3 個月，買入日期更早就延伸（最多 6 個月，見 domain/candles.ts）。
 * symbol 或 buyDate 變了就重抓；retry 給「重試」按鈕用。
 */
export function useDailyCandles(
  symbol: string,
  buyDate: string | undefined,
  source: CandleSource = candleSource,
): DailyCandlesState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  // 結果跟「哪一次請求」綁在一起：key 對不上（換了股票、日期或按了重試）就當作載入中，
  // 不用在 effect 裡同步 setState 回 loading。
  const key = `${symbol}|${buyDate ?? ""}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; state: DailyCandlesState } | null>(null);

  useEffect(() => {
    let active = true;
    const months = chartMonths(localIsoDate(new Date()), buyDate);
    source
      .getDailyCandles(symbol, months)
      .then((candles) => {
        if (active) setSettled({ key, state: { status: "ready", candles } });
      })
      .catch(() => {
        if (active) setSettled({ key, state: { status: "error" } });
      });
    return () => {
      active = false;
    };
  }, [key, symbol, buyDate, source]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: DailyCandlesState =
    settled?.key === key ? settled.state : { status: "loading" };
  return { ...state, retry };
}
