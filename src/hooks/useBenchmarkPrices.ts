import { useCallback, useEffect, useState } from "react";
import { candleSource, corporateActionSource } from "@/data";
import { loadAdjustedCloses } from "@/data/adjustedHistory";
import type { CandleSource } from "@/data/CandleSource";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import type { AdjustedClose } from "@/domain/adjustedPrice";
import { historyMonths, type DailyClose } from "@/domain/assetHistory";
import type { BenchmarkSymbol } from "@/domain/benchmark";
import { shiftMonths } from "@/domain/candles";

export type BenchmarkPrices = {
  adjCloses: AdjustedClose[];
  /** 期初持股的收盤價（代號 → 由舊到新） */
  openingCloses: Record<string, DailyClose[]>;
};

export type BenchmarkPricesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; prices: BenchmarkPrices }
  | { status: "error"; error: unknown };

export type BenchmarkPriceSources = { candles: CandleSource; actions: CorporateActionSource };

const DEFAULT_SOURCES: BenchmarkPriceSources = { candles: candleSource, actions: corporateActionSource };

/**
 * 對決 B（Story 022）要的價格：
 * - 基準的還原收盤價，從最早的期初往前一個月到今天（多抓一個月，期初剛好是假日也找得到前一個交易日）。
 * - 期初持股的收盤價（期間不是「全部」才有），用來算期初市值。
 * 一個抓完再抓下一個，不同時打（FinMind 不帶 token 每個 IP 每小時 300 次；candleSource 有本機快取）。
 * 任何一個抓不到就整個算失敗，畫面請使用者重試。start 為 null（還沒有交易）時不抓。
 */
export function useBenchmarkPrices(
  benchmark: BenchmarkSymbol,
  start: string | null,
  openingSymbols: readonly string[],
  today: string,
  sources: BenchmarkPriceSources = DEFAULT_SOURCES,
): BenchmarkPricesState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const symbolsKey = [...openingSymbols].sort().join(",");
  const key = `${benchmark}|${start ?? ""}|${symbolsKey}|${today}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; state: BenchmarkPricesState } | null>(null);

  useEffect(() => {
    if (start === null) return;
    let alive = true;
    const symbols = symbolsKey === "" ? [] : symbolsKey.split(",");
    (async () => {
      const adjCloses = await loadAdjustedCloses(benchmark, shiftMonths(start, -1), today, sources);
      const openingCloses: Record<string, DailyClose[]> = {};
      for (const symbol of symbols) {
        const candles = await sources.candles.getDailyCandles(symbol, historyMonths(start, start));
        openingCloses[symbol] = candles.map((c) => ({ date: c.date, close: c.close }));
      }
      if (alive) setSettled({ key, state: { status: "ready", prices: { adjCloses, openingCloses } } });
    })().catch((error: unknown) => {
      if (alive) setSettled({ key, state: { status: "error", error } });
    });
    return () => {
      alive = false;
    };
  }, [key, benchmark, start, symbolsKey, today, sources]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: BenchmarkPricesState =
    start === null ? { status: "idle" } : settled?.key === key ? settled.state : { status: "loading" };
  return { ...state, retry };
}
