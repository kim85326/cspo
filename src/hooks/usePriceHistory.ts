import { useCallback, useEffect, useState } from "react";
import { candleSource, corporateActionSource } from "@/data";
import type { CandleSource } from "@/data/CandleSource";
import type { CorporateActionSource } from "@/data/CorporateActionSource";
import { localIsoDate } from "@/domain/buyDate";
import { fetchMonths, shiftMonths } from "@/domain/candles";
import type { Candle, CorporateAction } from "@/domain/types";

export type PriceHistory = {
  /** 圖上近 N 個月（往前多一個月給均線）＋ P2-09 比較區間，依日期由舊到新、不重複 */
  candles: Candle[];
  /** 比較區間的除權息與分割；沒填買入日期是空陣列；拿不到是 null（結論改用未還原價格並註明） */
  actions: CorporateAction[] | null;
};

export type PriceHistoryState =
  | { status: "loading" }
  | { status: "ready"; data: PriceHistory }
  | { status: "error"; error: unknown };

type Sources = { candles: CandleSource; actions: CorporateActionSource };

/**
 * 抓 K 線圖與「買在高點還是低點」要用的資料。
 * 來源是 src/data 的 candleSource（Story 019：FinMind 為主，失敗退回證交所／櫃買中心，有本機快取），
 * 所以上市、上櫃、ETF 都有。symbol、buyDate、period 變了就重抓；retry 給「重試」按鈕用。
 *
 * 換期間時先留著上一次的圖（previous），新的資料到了再換，畫面不會閃成載入中。
 */
export function usePriceHistory(
  symbol: string,
  buyDate: string | undefined,
  period: number,
  sources: Sources = { candles: candleSource, actions: corporateActionSource },
): PriceHistoryState & { retry: () => void; previous: PriceHistory | null } {
  const [attempt, setAttempt] = useState(0);
  // 結果跟「哪一次請求」綁在一起：key 對不上就當作載入中，不用在 effect 裡同步 setState 回 loading。
  const key = `${symbol}|${buyDate ?? ""}|${period}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; symbol: string; state: PriceHistoryState } | null>(null);
  const { candles: candleSrc, actions: actionSrc } = sources;

  useEffect(() => {
    let active = true;
    const today = localIsoDate(new Date());
    const settle = (state: PriceHistoryState) => {
      if (active) setSettled({ key, symbol, state });
    };
    (async () => {
      const candles = dedupe(await candleSrc.getDailyCandles(symbol, fetchMonths(today, period, buyDate)));
      let actions: CorporateAction[] | null = [];
      if (buyDate && buyDate <= today) {
        actions = await actionSrc.getActions(symbol, shiftMonths(buyDate, -period), buyDate).catch(() => null);
      }
      settle({ status: "ready", data: { candles, actions } });
    })().catch((error: unknown) => settle({ status: "error", error }));
    return () => {
      active = false;
    };
  }, [key, symbol, buyDate, period, candleSrc, actionSrc]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: PriceHistoryState = settled?.key === key ? settled.state : { status: "loading" };
  const previous =
    settled && settled.key !== key && settled.symbol === symbol && settled.state.status === "ready"
      ? settled.state.data
      : null;
  return { ...state, retry, previous };
}

/** 依日期排序、去掉重複的日子（不相連的兩段月份合併回來時保險一下） */
function dedupe(candles: Candle[]): Candle[] {
  const byDate = new Map(candles.map((c) => [c.date, c]));
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * 載入失敗時給使用者看的話＋技術細節。
 * 2026-10 有同學在 iPhone 上只看到「K 線載入失敗」，查不出是斷網、FinMind 額度用完還是官方網站擋掉；
 * 現在把原因分成三類講白話（subject 是開頭的「K 線」，資產走勢圖傳「走勢圖」），並把每個來源的錯誤訊息放在「技術細節」，回報時截圖就看得出來。
 */
export function describeLoadError(
  error: unknown,
  subject = "K 線",
): { message: string; detail: string } {
  const chain = errorChain(error);
  const text = chain.map((e) => e.message).join(" ← ");
  let message = `${subject}載入失敗：FinMind、證交所、櫃買中心都沒有回應，請稍後重試`;
  if (/HTTP 402|上限|limit/i.test(text)) {
    message = `${subject}載入失敗：免費資料源這個小時的查詢次數用完了，官方備援也沒回應，請過一陣子再試`;
  } else if (/週日|維護|maintenance/i.test(text)) {
    message = `${subject}載入失敗：資料源維護中（FinMind 週日 00:00–07:00），請稍後重試`;
  } else if (
    chain.some((e) => e.name === "TypeError") ||
    /Network request failed|Failed to fetch|fetch failed|NetworkError|Load failed/i.test(text)
  ) {
    message = `${subject}載入失敗：連不上資料來源，請檢查網路後重試`;
  }
  return { message, detail: text || String(error) };
}

function errorChain(error: unknown): Error[] {
  const chain: Error[] = [];
  let current: unknown = error;
  while (current instanceof Error && chain.length < 5) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}
