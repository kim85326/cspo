import { currentFxRate, fxRateOf, symbolCurrency, toTwd } from "./currency";
import { calcFee, calcTax, DEFAULT_USER_SETTINGS, defaultTaxRate } from "./fees";
import type { Dividend, SecurityType, Transaction, UserSettings } from "./ledgerTypes";

/**
 * 一檔證券由交易與股利算出來的狀態（規格 3.3–3.6）。
 * 金額保留完整精度，只在顯示時四捨五入。null 代表「沒有值」，畫面顯示 —，不要當成 0。
 * 金額一律是台幣（規格 3.8）：每筆紀錄依自己的 fxRate 換算，市值依今天的匯率換算。參考價是該證券幣別的原始價格。
 */
export type Position = {
  symbol: string;
  type: SecurityType;
  /** 持有股數 */
  shares: number;
  /** 持有成本：目前持股對應的成本，含買入手續費 */
  costBasis: number;
  /** 平均成本 = 持有成本 ÷ 持有股數；沒有持股時 null */
  averageCost: number | null;
  /** 累計投入：所有買入的成交金額 + 手續費（含已出清的那幾段） */
  invested: number;
  /** 已實現損益 */
  realizedPnl: number;
  /** 已領現金股利 */
  cashDividends: number;
  /** 參考價；沒有價格時 null */
  price: number | null;
  /** 市值 = 參考價 × 持有股數 */
  marketValue: number | null;
  /** 以參考價賣出全部持股的預估手續費 + 證交稅 */
  estimatedSellCosts: number | null;
  /** 未實現損益 = 市值 − 預估賣出費用 − 持有成本 */
  unrealizedPnl: number | null;
  /** 總報酬 = 已實現 + 未實現 + 現金股利 */
  totalReturn: number | null;
  /** 簡單報酬率 = 總報酬 ÷ 累計投入（0.1388 代表 13.88%） */
  returnRate: number | null;
  /** 這一段持有的第一筆買入日；沒有持股時 null */
  holdingSince: string | null;
  /** 持有天數 = 今天 − holdingSince（日曆天） */
  holdingDays: number | null;
};

export type PositionOptions = {
  /** 證券類型（Story 007 合併後由 StockInfo 帶入） */
  type: SecurityType;
  /** 證交稅率，用來估未實現損益的賣出費用；預設依類型 */
  taxRate?: number;
  /** 參考價（該證券的幣別）；沒有就算不出市值與未實現損益 */
  price?: number | null;
  /**
   * 今天的匯率（1 單位外幣 = 多少台幣），換算市值用 [多幣別預留]。
   * 台幣證券固定為 1、忽略這個值；外幣證券沒給就當成沒有價格。
   */
  fxRate?: number | null;
  /** 用來估賣出手續費；已存交易的手續費不會用這個重算 */
  settings?: UserSettings;
  /** 今天 YYYY-MM-DD，算持有天數用 */
  today: string;
};

/** 重播過程中遇到的資料錯誤 */
export type ReplayProblem =
  | { kind: "oversell"; transaction: Transaction; held: number }
  | { kind: "stockDividendWithoutShares"; dividend: Dividend };

/** 重播到最後的狀態（不含價格相關的數字）。金額都已換成台幣 */
export type ReplayState = {
  shares: number;
  costBasis: number;
  invested: number;
  realizedPnl: number;
  cashDividends: number;
  holdingSince: string | null;
};

export type ReplayResult = { state: ReplayState; problem: ReplayProblem | null };

type ReplayEvent =
  | { kind: "trade"; date: string; transaction: Transaction }
  | { kind: "stockDividend"; date: string; dividend: Dividend };

/**
 * 依日期重播一檔證券的所有紀錄（規格 3.3）。遇到第一個錯誤就停下來回報。
 * 排序：日期由舊到新；同一天股票股利在所有交易之前，交易之間依 createdAt。
 */
export function replaySymbol(
  symbol: string,
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
): ReplayResult {
  const received = dividends.filter((d) => d.symbol === symbol && d.status === "received");
  const events: ReplayEvent[] = [
    ...received
      .filter((d) => d.type === "stock")
      .map((d): ReplayEvent => ({ kind: "stockDividend", date: d.exDate, dividend: d })),
    ...transactions
      .filter((t) => t.symbol === symbol)
      .map((t): ReplayEvent => ({ kind: "trade", date: t.tradeDate, transaction: t })),
  ];
  events.sort(compareEvents);

  const state: ReplayState = {
    shares: 0,
    costBasis: 0,
    invested: 0,
    realizedPnl: 0,
    cashDividends: received
      .filter((d) => d.type === "cash")
      .reduce((sum, d) => sum + toTwd(d.cashAmount ?? 0, fxRateOf(d)), 0),
    holdingSince: null,
  };

  for (const event of events) {
    if (event.kind === "stockDividend") {
      if (state.shares === 0) {
        return { state, problem: { kind: "stockDividendWithoutShares", dividend: event.dividend } };
      }
      // 配股：股數增加、持有成本不變，所以平均成本下降
      state.shares += event.dividend.stockShares ?? 0;
      continue;
    }

    const t = event.transaction;
    const amount = t.price * t.shares;
    // 外幣交易用這筆自己的匯率換成台幣（規格 3.8）；台幣 fxRate = 1，算式跟以前一樣
    const fxRate = fxRateOf(t);
    if (t.side === "buy") {
      // 持股歸零後再買，是新的一段持有
      if (state.shares === 0) state.holdingSince = t.tradeDate;
      state.shares += t.shares;
      state.costBasis += toTwd(amount + t.fee, fxRate);
      state.invested += toTwd(amount + t.fee, fxRate);
      continue;
    }

    if (t.shares > state.shares) {
      return { state, problem: { kind: "oversell", transaction: t, held: state.shares } };
    }
    const net = toTwd(amount - t.fee - t.tax, fxRate);
    // 等於「平均成本 × 賣出股數」，但少一次除法誤差；賣光時整個成本歸零，不留浮點殘值
    const soldCost =
      t.shares === state.shares ? state.costBasis : (state.costBasis * t.shares) / state.shares;
    state.realizedPnl += net - soldCost;
    state.shares -= t.shares;
    state.costBasis -= soldCost;
    if (state.shares === 0) {
      state.costBasis = 0;
      state.holdingSince = null;
    }
  }

  return { state, problem: null };
}

/** 重播資料本身有錯時丟出（正常流程不會發生：每次變更都先經過 validateLedgerChange） */
export class LedgerReplayError extends Error {
  constructor(readonly problem: ReplayProblem) {
    super(`${problem.kind}: ${"transaction" in problem ? problem.transaction.id : problem.dividend.id}`);
    this.name = "LedgerReplayError";
  }
}

/** 一檔證券的持股、成本、損益與報酬（規格 3.3–3.6） */
export function computePosition(
  symbol: string,
  transactions: readonly Transaction[],
  dividends: readonly Dividend[],
  options: PositionOptions,
): Position {
  const { state, problem } = replaySymbol(symbol, transactions, dividends);
  if (problem) throw new LedgerReplayError(problem);

  const price = options.price ?? null;
  const fxRate = currentFxRate(symbolCurrency(symbol, transactions, dividends), options.fxRate);
  const base = {
    symbol,
    type: options.type,
    shares: state.shares,
    costBasis: state.costBasis,
    averageCost: state.shares > 0 ? state.costBasis / state.shares : null,
    invested: state.invested,
    realizedPnl: state.realizedPnl,
    cashDividends: state.cashDividends,
    price,
    holdingSince: state.holdingSince,
    holdingDays: state.holdingSince ? daysBetween(state.holdingSince, options.today) : null,
  };

  // 已出清：沒有持股，市值與未實現都是真的 0，總報酬不需要價格
  if (state.shares === 0) {
    const totalReturn = state.realizedPnl + state.cashDividends;
    return {
      ...base,
      marketValue: 0,
      estimatedSellCosts: 0,
      unrealizedPnl: 0,
      totalReturn,
      returnRate: simpleReturnRate(totalReturn, state.invested),
    };
  }

  if (price === null || fxRate === null) {
    return {
      ...base,
      marketValue: null,
      estimatedSellCosts: null,
      unrealizedPnl: null,
      totalReturn: null,
      returnRate: null,
    };
  }

  const settings = options.settings ?? DEFAULT_USER_SETTINGS;
  const taxRate = options.taxRate ?? defaultTaxRate(options.type);
  // 手續費、證交稅用原幣別的成交金額算，再換成台幣（美股的費用規則等 8.2 再定）
  const nativeValue = price * state.shares;
  const marketValue = toTwd(nativeValue, fxRate);
  const estimatedSellCosts = toTwd(
    calcFee(nativeValue, state.shares, settings) + calcTax(nativeValue, taxRate),
    fxRate,
  );
  const unrealizedPnl = marketValue - estimatedSellCosts - state.costBasis;
  const totalReturn = state.realizedPnl + unrealizedPnl + state.cashDividends;
  return {
    ...base,
    marketValue,
    estimatedSellCosts,
    unrealizedPnl,
    totalReturn,
    returnRate: simpleReturnRate(totalReturn, state.invested),
  };
}

/** 簡單報酬率 = 總報酬 ÷ 累計投入；累計投入為 0 或總報酬未知時 null（畫面顯示 —） */
export function simpleReturnRate(totalReturn: number | null, invested: number): number | null {
  if (totalReturn === null || invested === 0) return null;
  return totalReturn / invested;
}

function compareEvents(a: ReplayEvent, b: ReplayEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === "stockDividend" ? -1 : 1;
  if (a.kind === "trade" && b.kind === "trade") {
    const x = a.transaction.createdAt;
    const y = b.transaction.createdAt;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 兩個 YYYY-MM-DD 之間差幾個日曆天 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}
