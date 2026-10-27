import type { Candle, CorporateAction, DividendEvent } from "./types";

/** 一天的收盤價與還原收盤價 */
export type AdjustedClose = {
  date: string;
  close: number;
  /** 還原收盤價：把之後的除權息、分割都折算回來，最後一天等於 close */
  adjClose: number;
};

/**
 * 還原收盤價（往回調整，P2-05 B「如果改買 0050」用）。純函式。
 *
 * 從最新一天往回走，每遇到一次除權息或分割，之前的每一天都乘上一個因子：
 * - 除權息：參考價 ÷ 除權息前收盤價（官方來源直接給這兩個數字；FinMind 沒給就用現金、配股自己算，見 dividendFactor）
 * - 分割：1 ÷ ratio（0050 一拆四，分割前的價格都除以 4）
 *
 * 實測：2330、0050 用證交所收盤價 + 除權除息計算結果表算出的一年報酬率，
 * 跟 Yahoo Finance 的 adjclose 到小數第 2 位相同（docs/research/history-and-dividend-sources.md §2.3）。
 *
 * - candles 要依日期由舊到新。
 * - 金額待公告（cashPerShare 為 null）的除息、日期不在 K 棒範圍內的事件，略過。
 */
export function adjustCloses(candles: Candle[], actions: CorporateAction[]): AdjustedClose[] {
  const factors = actions
    .map((action) => ({ date: dateOf(action), factor: factorFor(action, candles) }))
    .filter((f): f is { date: string; factor: number } => f.factor !== null);

  return candles.map(({ date, close }) => {
    let adjClose = close;
    for (const f of factors) if (date < f.date) adjClose *= f.factor;
    return { date, close, adjClose };
  });
}

/**
 * 一次除權息的調整因子 = 除權息參考價 ÷ 除權息前收盤價。
 * 參考價 =（前收 − 每股現金）÷（1 + 每千股配股 ÷ 1000），跟證交所算法相同：
 * 玉山金 2025-07-22 前收 34.20、現金 1.2、每千股配 10 股 → 32.67。
 * 金額待公告或前收不合理時回 null。
 */
export function dividendFactor(event: DividendEvent, closeBefore: number): number | null {
  if (event.closeBefore !== undefined && event.referencePrice !== undefined && event.closeBefore > 0) {
    return event.referencePrice / event.closeBefore;
  }
  if (event.cashPerShare === null || closeBefore <= 0) return null;
  const reference = (closeBefore - event.cashPerShare) / (1 + event.stockPerThousand / 1000);
  return reference > 0 ? reference / closeBefore : null;
}

function factorFor(action: CorporateAction, candles: Candle[]): number | null {
  const date = dateOf(action);
  // 事件在最新一根之後（還沒發生），或在第一根之前／當天（前面沒有要調的日子）
  if (candles.length === 0 || date > candles[candles.length - 1].date || date <= candles[0].date) {
    return null;
  }
  if (action.kind === "split") return action.ratio > 0 ? 1 / action.ratio : null;
  const before = lastCloseBefore(candles, date);
  return before === null ? null : dividendFactor(action, before);
}

function lastCloseBefore(candles: Candle[], date: string): number | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].date < date) return candles[i].close;
  }
  return null;
}

function dateOf(action: CorporateAction): string {
  return action.kind === "split" ? action.date : action.exDate;
}
