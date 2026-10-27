import type { Holding, PnlDirection, PnlResult } from "./types";

/**
 * 盈虧計算。第一迭代不含手續費與交易稅（見 docs/glossary.md）。
 * 金額保留兩位小數，避免浮點誤差影響顯示。
 */
export function calculatePnl(holding: Holding, currentPrice: number): PnlResult {
  const cost = round2(holding.buyPrice * holding.shares);
  const marketValue = round2(currentPrice * holding.shares);
  const pnl = round2(marketValue - cost);
  const returnRate = cost === 0 ? 0 : pnl / cost;
  return { cost, marketValue, pnl, returnRate };
}

/** 台股習慣：漲紅、跌綠、平盤灰 */
export function pnlDirection(pnl: number): PnlDirection {
  if (pnl > 0) return "up";
  if (pnl < 0) return "down";
  return "flat";
}

/** 顯示用：+20,000 / -20,000 / 0 */
export function formatSignedAmount(amount: number): string {
  const rounded = Math.round(amount);
  const body = Math.abs(rounded).toLocaleString("en-US");
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `-${body}`;
  return "0";
}

/** 顯示用：+4.00% / -4.00% / 0.00% */
export function formatReturnRate(rate: number): string {
  const pct = (rate * 100).toFixed(2);
  if (rate > 0) return `+${pct}%`;
  return `${pct}%`;
}

export type HoldingInput = {
  symbol: string;
  buyPrice: string;
  shares: string;
};

export type ValidationResult =
  | { ok: true; holding: Holding }
  | { ok: false; errors: Partial<Record<keyof HoldingInput, string>> };

/** 表單字串 → Holding。錯誤訊息直接給畫面顯示。 */
export function validateHoldingInput(input: HoldingInput): ValidationResult {
  const errors: Partial<Record<keyof HoldingInput, string>> = {};

  const symbol = input.symbol.trim();
  if (!/^\d{4,6}$/.test(symbol)) {
    errors.symbol = "請輸入 4 到 6 位數字的股票代號";
  }

  const buyPrice = Number(input.buyPrice);
  if (input.buyPrice.trim() === "" || !Number.isFinite(buyPrice) || buyPrice <= 0) {
    errors.buyPrice = "買入價必須大於 0";
  }

  const shares = Number(input.shares);
  if (input.shares.trim() === "" || !Number.isInteger(shares) || shares <= 0) {
    errors.shares = "數量必須是大於 0 的整數（股）";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, holding: { symbol, buyPrice, shares } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
