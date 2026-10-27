import type { Bucket, HoldingSetting, SecurityType } from "./ledgerTypes";
import { bucketOf } from "./portfolio";
import type { Position } from "./position";

/** 配置圖的一塊：市值與占比（0.25 代表 25%） */
export type AllocationSlice<K extends string> = { key: K; marketValue: number; ratio: number };

export type HoldingSlice = AllocationSlice<string> & { type: SecurityType; bucket: Bucket };

/** 資產配置（P2-07 配置圖） */
export type Allocation = {
  /** 計入配置的總市值 = 各塊市值加總 */
  totalMarketValue: number;
  /** 核心／衛星，固定兩塊、依此順序；總市值為 0 時是空陣列 */
  byBucket: AllocationSlice<Bucket>[];
  /** 個股／ETF，固定兩塊、依此順序；總市值為 0 時是空陣列 */
  byType: AllocationSlice<SecurityType>[];
  /** 每檔持股，市值大的在前；總市值為 0 時是空陣列 */
  byHolding: HoldingSlice[];
  /** 持有中但沒有價格、所以沒有計入配置的檔數，畫面提示「有 N 檔持股缺少價格」 */
  missingPriceCount: number;
};

/**
 * 依目前市值算資產配置（P2-07）。
 * 只計入持有中（股數 > 0）且有價格的持股；已出清的不出現在圖上。
 * 分組規則和 summarize 一樣：使用者設定優先，否則 ETF → 核心、個股 → 衛星（M-06）。
 */
export function computeAllocation(
  positions: readonly Position[],
  holdingSettings: readonly HoldingSetting[],
): Allocation {
  const holdings: Omit<HoldingSlice, "ratio">[] = [];
  let missingPriceCount = 0;
  for (const p of positions) {
    if (p.shares === 0) continue;
    if (p.marketValue === null) {
      missingPriceCount += 1;
      continue;
    }
    holdings.push({ key: p.symbol, type: p.type, bucket: bucketOf(p, holdingSettings), marketValue: p.marketValue });
  }

  const totalMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  if (totalMarketValue === 0) {
    return { totalMarketValue, byBucket: [], byType: [], byHolding: [], missingPriceCount };
  }

  const slice = <K extends string>(key: K, marketValue: number): AllocationSlice<K> => ({
    key,
    marketValue,
    ratio: marketValue / totalMarketValue,
  });
  const sumWhere = (match: (h: (typeof holdings)[number]) => boolean) =>
    holdings.filter(match).reduce((sum, h) => sum + h.marketValue, 0);

  return {
    totalMarketValue,
    byBucket: (["core", "satellite"] as const).map((b) => slice(b, sumWhere((h) => h.bucket === b))),
    byType: (["stock", "etf"] as const).map((t) => slice(t, sumWhere((h) => h.type === t))),
    byHolding: holdings
      .map((h) => ({ ...h, ratio: h.marketValue / totalMarketValue }))
      .sort((a, b) => b.marketValue - a.marketValue || (a.key < b.key ? -1 : 1)),
    missingPriceCount,
  };
}

/**
 * 把一組加總為 1 的占比換成顯示用的百分比（小數點後 2 位），並保證顯示出來的加總剛好是 100.00。
 * 各自四捨五入可能變成 99.99% 或 100.01%（例如三等分顯示 33.33% × 3），
 * 這裡用最大餘數法：先全部無條件捨去，差的 0.01 依捨去掉的部分由大到小補上。
 * 回傳的數字是百分比，例如 33.34 代表 33.34%；順序和輸入一致。
 */
export function toDisplayPercents(ratios: readonly number[]): number[] {
  if (ratios.length === 0) return [];
  // 以「0.01%」為單位的整數運算；1e-9 避免 0.29 × 10000 = 2899.9999… 少算一格
  const units = ratios.map((r) => r * 10_000);
  const floors = units.map((u) => Math.floor(u + 1e-9));
  let remaining = 10_000 - floors.reduce((sum, f) => sum + f, 0);
  const order = units
    .map((u, i) => ({ i, remainder: u - floors[i] }))
    // 餘數差不到 1e-6 當成一樣（浮點誤差），依原本順序
    .sort((a, b) => (Math.abs(b.remainder - a.remainder) > 1e-6 ? b.remainder - a.remainder : a.i - b.i));
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors.map((f) => f / 100);
}
