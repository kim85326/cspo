import { fxRateOf, toTwd } from "./currency";
import type { Bucket, Dividend, HoldingSetting, Transaction } from "./ledgerTypes";
import { bucketOf } from "./portfolio";
import { daysBetween, type Position } from "./position";

/** 一筆現金流：投入是負的、拿回來是正的。date 是 YYYY-MM-DD */
export type CashFlow = { date: string; amount: number };

/**
 * 畫面上的年化報酬率（P2-04）。
 * - rate：0.1 代表 10.00%
 * - underOneYear：第一筆現金流距今不到 365 天，顯示「持有未滿一年」
 * - unavailable：算不出來（沒有紀錄、缺少價格、XIRR 無解），顯示 —
 */
export type AnnualizedReturn =
  | { kind: "rate"; rate: number }
  | { kind: "underOneYear" }
  | { kind: "unavailable" };

export type PortfolioAnnualizedReturns = {
  overall: AnnualizedReturn;
  core: AnnualizedReturn;
  satellite: AnnualizedReturn;
};

/** 和 Excel／Google 試算表的 XIRR 一樣，一年當 365 天 */
const DAYS_PER_YEAR = 365;
const MAX_NEWTON_STEPS = 100;
const MAX_BISECTION_STEPS = 300;
const RATE_TOLERANCE = 1e-10;
/** 利率不可 ≤ −100%（(1 + r) 會是 0 或負數） */
const MIN_RATE = -1 + 1e-9;
/** 二分法往上找範圍的上限：年化 1e9 倍以上當成無解 */
const MAX_RATE = 1e9;

/**
 * XIRR：找出讓所有現金流折現後加總為 0 的年利率。
 * 先用牛頓法；不收斂（或跳到 ≤ −100%）時改用二分法；仍無解回傳 null（畫面顯示 —）。
 * 以最早的日期為第 0 年。現金流不需要排序。
 * 沒有同時包含正負現金流、或全部在同一天時，數學上沒有定義，回傳 null。
 */
export function xirr(flows: readonly CashFlow[]): number | null {
  const nonZero = flows.filter((f) => f.amount !== 0);
  if (!nonZero.some((f) => f.amount > 0) || !nonZero.some((f) => f.amount < 0)) return null;

  const start = nonZero.reduce((min, f) => (f.date < min ? f.date : min), nonZero[0].date);
  const points = nonZero.map((f) => ({ years: daysBetween(start, f.date) / DAYS_PER_YEAR, amount: f.amount }));
  // 全部同一天：折現率不影響結果，沒有年化報酬率可言
  if (points.every((p) => p.years === 0)) return null;

  const scale = points.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  const newton = solveByNewton(points);
  if (newton !== null && Math.abs(npv(points, newton)) <= scale * 1e-9) return newton;
  return solveByBisection(points);
}

/**
 * 一檔持股的年化報酬率（P2-04）。position 來自 computePosition，期末價值用它算好的市值與預估賣出費用。
 */
export function positionAnnualizedReturn(
  position: Position,
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
  today: string,
): AnnualizedReturn {
  return annualize(positionCashFlows(position, transactions, dividends, today), today);
}

/** 整體、核心、衛星三組的年化報酬率；分組規則和 summarize 一樣（M-06） */
export function portfolioAnnualizedReturns(
  positions: readonly Position[],
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
  holdingSettings: readonly HoldingSetting[],
  today: string,
): PortfolioAnnualizedReturns {
  const group = (bucket: Bucket | null) =>
    groupAnnualizedReturn(
      positions.filter((p) => bucket === null || bucketOf(p, holdingSettings) === bucket),
      transactions,
      dividends,
      today,
    );
  return { overall: group(null), core: group("core"), satellite: group("satellite") };
}

function groupAnnualizedReturn(
  positions: readonly Position[],
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
  today: string,
): AnnualizedReturn {
  const flows: CashFlow[] = [];
  for (const p of positions) {
    const own = positionCashFlows(p, transactions, dividends, today);
    // 有一檔缺價格就整組不算：少算市值會看起來像虧錢（和 summarize 的總報酬一致）
    if (own === null) return { kind: "unavailable" };
    flows.push(...own);
  }
  return annualize(flows, today);
}

/**
 * 一檔持股的現金流（P2-04）：
 * - 買入：−(成交金額 + 手續費)，於交易日
 * - 賣出：+(成交金額 − 手續費 − 證交稅)，於交易日
 * - 已入帳的現金股利：+金額，於發放日（沒有發放日用除息日）
 * - 期末：+(市值 − 預估賣出費用)，於今天；已出清就沒有這筆
 * 持有中但沒有價格時回傳 null。
 */
export function positionCashFlows(
  position: Position,
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
  today: string,
): CashFlow[] | null {
  const flows: CashFlow[] = [];
  for (const t of transactions) {
    if (t.symbol !== position.symbol) continue;
    const amount = t.price * t.shares;
    flows.push({
      date: t.tradeDate,
      amount: toTwd(t.side === "buy" ? -(amount + t.fee) : amount - t.fee - t.tax, fxRateOf(t)),
    });
  }
  for (const d of dividends) {
    if (d.symbol !== position.symbol || d.type !== "cash" || d.status !== "received") continue;
    flows.push({ date: d.payDate ?? d.exDate, amount: toTwd(d.cashAmount ?? 0, fxRateOf(d)) });
  }

  if (position.shares > 0) {
    if (position.marketValue === null || position.estimatedSellCosts === null) return null;
    flows.push({ date: today, amount: position.marketValue - position.estimatedSellCosts });
  }
  return flows;
}

function annualize(flows: readonly CashFlow[] | null, today: string): AnnualizedReturn {
  if (flows === null || flows.length === 0) return { kind: "unavailable" };
  const first = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date);
  // 不滿一年就年化會把短期漲跌放大（例如一個月賺 5% 年化成 80%），規格要求不顯示
  if (daysBetween(first, today) < DAYS_PER_YEAR) return { kind: "underOneYear" };
  const rate = xirr(flows);
  return rate === null ? { kind: "unavailable" } : { kind: "rate", rate };
}

type Point = { years: number; amount: number };

function npv(points: readonly Point[], rate: number): number {
  return points.reduce((sum, p) => sum + p.amount * Math.pow(1 + rate, -p.years), 0);
}

function npvDerivative(points: readonly Point[], rate: number): number {
  return points.reduce((sum, p) => sum - p.years * p.amount * Math.pow(1 + rate, -p.years - 1), 0);
}

function solveByNewton(points: readonly Point[]): number | null {
  let rate = 0.1;
  for (let i = 0; i < MAX_NEWTON_STEPS; i += 1) {
    const slope = npvDerivative(points, rate);
    if (slope === 0 || !Number.isFinite(slope)) return null;
    const next = rate - npv(points, rate) / slope;
    if (!Number.isFinite(next) || next <= MIN_RATE) return null;
    if (Math.abs(next - rate) < RATE_TOLERANCE) return next;
    rate = next;
  }
  return null;
}

function solveByBisection(points: readonly Point[]): number | null {
  let low = MIN_RATE;
  let high = 1;
  const lowSign = Math.sign(npv(points, low));
  // 期間很長時 (1 + r)^−t 可能溢位成 NaN，這時無法判斷
  if (Number.isNaN(lowSign)) return null;
  // 往上擴大範圍，直到兩端的 NPV 正負相反；NPV 在 −100% 以上連續，正負相反代表中間一定有解
  while (Math.sign(npv(points, high)) === lowSign) {
    if (high >= MAX_RATE) return null;
    high *= 10;
  }
  for (let i = 0; i < MAX_BISECTION_STEPS; i += 1) {
    const mid = (low + high) / 2;
    if (Math.sign(npv(points, mid)) === lowSign) low = mid;
    else high = mid;
    if (high - low < RATE_TOLERANCE * Math.max(1, Math.abs(mid))) break;
  }
  return (low + high) / 2;
}
