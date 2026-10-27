import { activeHoldings, buildHoldingViews, sortHoldings, type HoldingView, type QuoteLookup } from "./holdings";
import type { Ledger } from "./ledgerTypes";
import { summarize, type PortfolioSummary } from "./portfolio";
import type { Quote } from "./types";

/** 首頁總覽（M-05）要的全部數字 */
export type Overview = {
  /** 記帳本出現過的每一檔（含已出清），代號排序 */
  views: HoldingView[];
  summary: PortfolioSummary;
  /** 持有中的持股，市值大的在前；沒有價格的排最後 */
  holdings: HoldingView[];
};

/**
 * 記帳本 + 現價 → 每檔持股與整體／核心／衛星加總（M-05）。
 * 每檔的算法和持股明細共用 buildHoldingViews（Story 010）：quoteOf 沒有的代號視為缺少價格，
 * 市值、未實現、總報酬為 null，不當成 0。核心／衛星依 holdingSettings。
 */
export function buildOverview(ledger: Ledger, quoteOf: QuoteLookup, today: string): Overview {
  const views = buildHoldingViews(ledger, quoteOf, today);
  return {
    views,
    summary: summarize(
      views.map((v) => v.position),
      ledger.holdingSettings,
    ),
    holdings: sortHoldings(activeHoldings(views), "marketValue"),
  };
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
