import type { Ledger } from "./ledgerTypes";
import { summarize, type PortfolioSummary } from "./portfolio";
import { computePosition, type Position } from "./position";
import { securityTypeOf } from "./security";
import type { Quote } from "./types";

/** 首頁總覽（M-05）要的全部數字 */
export type Overview = {
  /** 記帳本出現過的每一檔（含已出清），代號排序 */
  positions: Position[];
  summary: PortfolioSummary;
  /** 持有中的持股，市值大的在前；沒有價格的排最後 */
  holdings: Position[];
};

/** 記帳本裡出現過的代號（交易或股利），不重複、依代號排序 */
export function ledgerSymbols(ledger: Ledger): string[] {
  const symbols = new Set<string>();
  for (const t of ledger.transactions) symbols.add(t.symbol);
  for (const d of ledger.dividends) symbols.add(d.symbol);
  return [...symbols].sort();
}

/**
 * 記帳本 + 現價 → 每檔持股與整體／核心／衛星加總（M-05）。
 * prices 沒有的代號視為缺少價格：市值、未實現、總報酬為 null，不當成 0。
 * 證券類型依代號判斷（00 開頭是 ETF，見 Story 007），核心／衛星依 holdingSettings。
 */
export function buildOverview(
  ledger: Ledger,
  prices: Readonly<Record<string, number>>,
  today: string,
): Overview {
  const positions = ledgerSymbols(ledger).map((symbol) =>
    computePosition(symbol, ledger.transactions, ledger.dividends, {
      type: securityTypeOf(symbol),
      price: prices[symbol] ?? null,
      settings: ledger.settings,
      today,
    }),
  );
  const holdings = positions
    .filter((p) => p.shares > 0)
    .sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));
  return { positions, summary: summarize(positions, ledger.holdingSettings), holdings };
}

/**
 * 首頁顯示的價格資料日期：取最舊的那一個，免得有一檔沒更新到卻看起來是最新的。
 * 日期格式是證交所的 "2026/10/22"（補零），直接比字串。沒有任何日期（例如假價）回傳 null。
 */
export function oldestPriceDate(quotes: readonly Pick<Quote, "asOf">[]): string | null {
  const dates = quotes.map((q) => q.asOf).filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (b < a ? b : a));
}
