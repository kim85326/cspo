import { calculatePnl } from "./pnl";
import type { Holding, Quote } from "./types";

/**
 * 「AI 解讀」要送給後端的資料（Story 031）。格式由 backend/src/insightRequest.ts 驗證，兩邊要一起改。
 *
 * 只有股票代號、名稱、股數、成本、現價、盈虧、報酬率與合計，**不含任何個人資料**
 * （沒有帳號、裝置、交易日期、券商、備註）。這是純函式，不碰畫面也不碰網路。
 */
export type InsightHolding = {
  symbol: string;
  name: string;
  shares: number;
  /** 每股平均成本 */
  avgCost: number;
  /** 持有成本（元） */
  cost: number;
  /** 現價 */
  price: number;
  /** 未實現盈虧（元） */
  pnl: number;
  /** 報酬率，0.05 代表 5% */
  returnRate: number;
};

export type InsightInput = {
  version: 1;
  /** 現價的資料日期（例如 "2026/10/22"）；沒有就省略 */
  priceDate?: string;
  /** 成本與盈虧是否已含手續費與交易稅 */
  feesIncluded: boolean;
  holdings: InsightHolding[];
  total: { cost: number; marketValue: number; pnl: number; returnRate: number };
};

/**
 * 一檔部位：計算畫面與之後的記帳本都轉成這個樣子再交給 buildInsightInput。
 * - 計算畫面：avgCost = 買入價，cost／pnl 不給，由這裡用 calculatePnl 算（不含費用）。
 * - 記帳本（product-spec 第 3、4 章）：avgCost = 移動加權平均成本、shares = 持有股數，
 *   cost = 持有成本、pnl = 未實現損益（都已含手續費與預估賣出費用），直接帶進來，並設 feesIncluded。
 */
export type InsightPosition = {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  price: number;
  cost?: number;
  pnl?: number;
};

export function buildInsightInput(
  positions: InsightPosition[],
  options: { priceDate?: string; feesIncluded?: boolean } = {},
): InsightInput {
  const holdings = positions.map((p): InsightHolding => {
    const computed = calculatePnl({ symbol: p.symbol, buyPrice: p.avgCost, shares: p.shares }, p.price);
    const cost = p.cost ?? computed.cost;
    const pnl = p.pnl ?? computed.pnl;
    return {
      symbol: p.symbol,
      name: p.name,
      shares: p.shares,
      avgCost: p.avgCost,
      cost,
      price: p.price,
      pnl,
      returnRate: cost === 0 ? 0 : pnl / cost,
    };
  });

  const cost = round2(holdings.reduce((sum, h) => sum + h.cost, 0));
  const pnl = round2(holdings.reduce((sum, h) => sum + h.pnl, 0));
  const input: InsightInput = {
    version: 1,
    feesIncluded: options.feesIncluded ?? false,
    holdings,
    total: { cost, marketValue: round2(cost + pnl), pnl, returnRate: cost === 0 ? 0 : pnl / cost },
  };
  if (options.priceDate) input.priceDate = options.priceDate;
  return input;
}

/** 計算畫面的結果（一檔或多檔的 持股 + 現價）→ InsightInput。資料日期取第一檔有日期的。 */
export function insightInputFromQuotes(rows: { holding: Holding; quote: Quote }[]): InsightInput {
  return buildInsightInput(
    rows.map(({ holding, quote }) => ({
      symbol: holding.symbol,
      name: quote.name,
      shares: holding.shares,
      avgCost: holding.buyPrice,
      price: quote.price,
    })),
    { priceDate: rows.find((r) => r.quote.asOf)?.quote.asOf },
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
