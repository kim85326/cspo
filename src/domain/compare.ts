import { calculatePnl } from "./pnl";
import type { Holding, PnlResult, Quote } from "./types";

/** 一檔參與比較的股票：持股 + 現價 */
export type ComparisonInput = {
  holding: Holding;
  quote: Quote;
};

/** 比較結果裡的一列：排名從 1 開始，報酬率高的排前面 */
export type ComparisonRow = {
  rank: number;
  quote: Quote;
  holding: Holding;
  result: PnlResult;
};

/** 多檔股票的比較結果 */
export type ComparisonResult = {
  /** 依報酬率由高到低排序 */
  rows: ComparisonRow[];
  /** 全部持股加總：成本、現值、盈虧、整體報酬率 */
  total: PnlResult;
};

/**
 * 多檔股票比盈虧。
 * - 用「報酬率」排名而不是盈虧金額：投入金額不同時，金額大的不一定表現好（見 docs/glossary.md）。
 * - 報酬率相同時，盈虧金額大的排前面；再相同就照輸入順序。
 * - 合計的報酬率 = 總盈虧 ÷ 總成本，不是各檔報酬率的平均。
 */
export function compareHoldings(inputs: ComparisonInput[]): ComparisonResult {
  const scored = inputs.map((input, index) => ({
    index,
    quote: input.quote,
    holding: input.holding,
    result: calculatePnl(input.holding, input.quote.price),
  }));

  scored.sort(
    (a, b) =>
      b.result.returnRate - a.result.returnRate || b.result.pnl - a.result.pnl || a.index - b.index,
  );

  const rows: ComparisonRow[] = scored.map((s, i) => ({
    rank: i + 1,
    quote: s.quote,
    holding: s.holding,
    result: s.result,
  }));

  const cost = round2(rows.reduce((sum, r) => sum + r.result.cost, 0));
  const marketValue = round2(rows.reduce((sum, r) => sum + r.result.marketValue, 0));
  const pnl = round2(marketValue - cost);
  const returnRate = cost === 0 ? 0 : pnl / cost;

  return { rows, total: { cost, marketValue, pnl, returnRate } };
}

/** 比較時一次最多幾檔；超過手機畫面就塞不下、也沒人會一次比這麼多 */
export const MAX_COMPARE_HOLDINGS = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
