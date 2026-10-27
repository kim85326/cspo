import type { SecurityType, TradeSide, UserSettings } from "./ledgerTypes";

/** 規格 4 章 UserSettings 的預設值 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  feeRate: 0.001425,
  feeDiscount: 1,
  minFeeBoardLot: 20,
  minFeeOddLot: 1,
};

/** 1 張 = 1000 股；股數 ≥ 1000 用整股最低手續費 */
export const BOARD_LOT_SHARES = 1000;

/**
 * 金額無條件捨去到整數元。
 * 先加 1e-9 再 floor：浮點乘法可能把 57 算成 56.99999999999999，直接 floor 會少 1 元。
 * 1e-9 遠小於 1 分錢，不會把真的 56.99 進位。
 */
export function floorMoney(x: number): number {
  return Math.floor(x + 1e-9);
}

/** 預設證交稅率：個股 0.003、ETF 0.001（規格 3.2） */
export function defaultTaxRate(type: SecurityType): number {
  return type === "etf" ? 0.001 : 0.003;
}

/** 手續費 = max(floor(成交金額 × 手續費率 × 折扣), 最低手續費) */
export function calcFee(amount: number, shares: number, settings: UserSettings): number {
  const minFee = shares >= BOARD_LOT_SHARES ? settings.minFeeBoardLot : settings.minFeeOddLot;
  return Math.max(floorMoney(amount * settings.feeRate * settings.feeDiscount), minFee);
}

/** 證交稅 = floor(成交金額 × 證交稅率)，只有賣出才收 */
export function calcTax(amount: number, taxRate: number): number {
  return floorMoney(amount * taxRate);
}

export type TradeEstimate = {
  /** 成交金額 = 成交價 × 股數 */
  amount: number;
  fee: number;
  /** 買入為 0 */
  tax: number;
  /** 預估總金額：買入 = 金額 + 手續費；賣出 = 金額 − 手續費 − 證交稅 */
  total: number;
};

/** 新增交易表單即時顯示用（M-02） */
export function estimateTrade(
  side: TradeSide,
  price: number,
  shares: number,
  settings: UserSettings,
  taxRate: number,
): TradeEstimate {
  const amount = price * shares;
  const fee = calcFee(amount, shares, settings);
  if (side === "buy") return { amount, fee, tax: 0, total: amount + fee };
  const tax = calcTax(amount, taxRate);
  return { amount, fee, tax, total: amount - fee - tax };
}
