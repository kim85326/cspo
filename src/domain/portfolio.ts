import type { Bucket, HoldingSetting, SecurityType } from "./ledgerTypes";
import { simpleReturnRate, type Position } from "./position";

/** 一組持股（整體、核心或衛星）的加總（M-05） */
export type GroupSummary = {
  /** 累計投入 */
  invested: number;
  /** 目前市值；不含缺少價格的持股 */
  marketValue: number;
  realizedPnl: number;
  /** 未實現損益；不含缺少價格的持股 */
  unrealizedPnl: number;
  cashDividends: number;
  /** 總報酬；有持股缺少價格時 null（少算市值會看起來像虧錢） */
  totalReturn: number | null;
  /** 簡單報酬率 = 總報酬 ÷ 累計投入 */
  returnRate: number | null;
  /** 持有中（股數 > 0）的檔數 */
  holdingCount: number;
  /** 持有中但沒有價格的檔數，總覽提示「有 N 檔持股缺少價格」 */
  missingPriceCount: number;
};

export type PortfolioSummary = {
  overall: GroupSummary;
  core: GroupSummary;
  satellite: GroupSummary;
};

/** 預設分類：ETF → 核心，個股 → 衛星（M-06） */
export function defaultBucket(type: SecurityType): Bucket {
  return type === "etf" ? "core" : "satellite";
}

/** 使用者有設定就用設定，否則依類型 */
export function bucketOf(position: Position, holdingSettings: readonly HoldingSetting[]): Bucket {
  const setting = holdingSettings.find((s) => s.symbol === position.symbol);
  return setting?.bucket ?? defaultBucket(position.type);
}

/** 整體、核心、衛星三組加總（規格 3.5：同一套公式，只是加總範圍不同） */
export function summarize(
  positions: readonly Position[],
  holdingSettings: readonly HoldingSetting[],
): PortfolioSummary {
  const core = positions.filter((p) => bucketOf(p, holdingSettings) === "core");
  const satellite = positions.filter((p) => bucketOf(p, holdingSettings) === "satellite");
  return {
    overall: sumGroup(positions),
    core: sumGroup(core),
    satellite: sumGroup(satellite),
  };
}

function sumGroup(positions: readonly Position[]): GroupSummary {
  let invested = 0;
  let marketValue = 0;
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  let cashDividends = 0;
  let holdingCount = 0;
  let missingPriceCount = 0;

  for (const p of positions) {
    invested += p.invested;
    realizedPnl += p.realizedPnl;
    cashDividends += p.cashDividends;
    marketValue += p.marketValue ?? 0;
    unrealizedPnl += p.unrealizedPnl ?? 0;
    if (p.shares > 0) {
      holdingCount += 1;
      if (p.marketValue === null) missingPriceCount += 1;
    }
  }

  const totalReturn =
    missingPriceCount > 0 ? null : realizedPnl + unrealizedPnl + cashDividends;
  return {
    invested,
    marketValue,
    realizedPnl,
    unrealizedPnl,
    cashDividends,
    totalReturn,
    returnRate: simpleReturnRate(totalReturn, invested),
    holdingCount,
    missingPriceCount,
  };
}
