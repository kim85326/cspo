import { useCallback, useEffect, useState } from "react";
import { candleSource } from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import { historyMonths, symbolsInRange, type DailyClose } from "@/domain/assetHistory";
import type { Ledger } from "@/domain/ledgerTypes";

/** 期間內每一檔的每日收盤價（代號 → 由舊到新） */
export type ClosesBySymbol = Record<string, DailyClose[]>;

export type AssetClosesState =
  | { status: "idle" }
  | { status: "loading"; done: number; total: number }
  | { status: "ready"; closes: ClosesBySymbol }
  | { status: "error"; error: unknown };

/**
 * 抓資產走勢要的每日收盤價（Story 023）。
 * - 只抓期間內有持股或有交易的代號（symbolsInRange），月份從期間前一個月到今天（historyMonths）。
 * - **一檔抓完再抓下一檔**，不同時打：FinMind 不帶 token 每個 IP 每小時 300 次，Tech Day 現場大家共用 Wi-Fi。
 *   candleSource 有本機快取（Story 019），抓過的月份不再打網路，換期間或重試只補缺的。
 * - 任何一檔抓不到就整個算失敗：少一檔的市值會讓走勢看起來像大跌，不如請使用者重試。
 * - from 為 null（還沒有交易）時不抓，停在 idle。
 */
export function useAssetHistoryCloses(
  ledger: Pick<Ledger, "transactions" | "dividends"> | null,
  from: string | null,
  to: string,
  source: CandleSource = candleSource,
): AssetClosesState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const symbols = ledger && from ? symbolsInRange(ledger, from, to) : [];
  const symbolsKey = symbols.join(",");
  const key = `${symbolsKey}|${from ?? ""}|${to}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; state: AssetClosesState } | null>(null);

  useEffect(() => {
    if (from === null) return;
    let alive = true;
    const list = symbolsKey === "" ? [] : symbolsKey.split(",");
    const months = historyMonths(from, to);
    (async () => {
      const closes: ClosesBySymbol = {};
      for (const [i, symbol] of list.entries()) {
        const candles = await source.getDailyCandles(symbol, months);
        closes[symbol] = candles.map((c) => ({ date: c.date, close: c.close }));
        if (alive && i < list.length - 1) {
          setSettled({ key, state: { status: "loading", done: i + 1, total: list.length } });
        }
      }
      if (alive) setSettled({ key, state: { status: "ready", closes } });
    })().catch((error: unknown) => {
      if (alive) setSettled({ key, state: { status: "error", error } });
    });
    return () => {
      alive = false;
    };
  }, [key, symbolsKey, from, to, source]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: AssetClosesState =
    from === null
    ? { status: "idle" }
    : settled?.key === key
      ? settled.state
      : { status: "loading", done: 0, total: symbols.length };
  return { ...state, retry };
}
