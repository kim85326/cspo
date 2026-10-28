import type { Currency, Dividend, LedgerMarket, Transaction } from "./ledgerTypes";

/**
 * 多幣別（product-spec 3.8，docs/stories/025）。Tech Day 期間全部是台股、台幣，
 * 這裡的規則算出來的結果跟以前完全一樣；之後支援美股（8.2）時計算引擎不用重寫。
 *
 * - 所有報酬以台幣計算。外幣金額一律乘以「該筆紀錄自己的」fxRate，不用今天的匯率回頭換算。
 * - 市值 = 參考價 × 持有股數 × 今天的匯率；台幣固定為 1。
 * - 缺少 market／currency／fxRate 的舊資料，視為台股、TWD、1。
 */

export const DEFAULT_CURRENCY: Currency = "TWD";

export const CURRENCIES: readonly Currency[] = ["TWD", "USD"];

export const LEDGER_MARKETS: readonly LedgerMarket[] = ["TWSE", "TPEx", "US"];

type MultiCurrencyFields = Pick<Transaction | Dividend, "currency" | "fxRate">;

/** 這筆紀錄的幣別；沒填視為 TWD */
export function currencyOf(record: Pick<MultiCurrencyFields, "currency">): Currency {
  return record.currency ?? DEFAULT_CURRENCY;
}

/** 這筆紀錄成交（入帳）當下的匯率；沒填視為 1，台幣固定為 1 */
export function fxRateOf(record: MultiCurrencyFields): number {
  return currencyOf(record) === DEFAULT_CURRENCY ? 1 : (record.fxRate ?? 1);
}

/** 把一筆紀錄幣別的金額換成台幣。fxRate = 1 時原樣回傳，台幣金額不會多一次浮點乘法 */
export function toTwd(amount: number, fxRate = 1): number {
  return fxRate === 1 ? amount : amount * fxRate;
}

/**
 * 一檔證券的幣別：取第一筆交易或股利的幣別，都沒有視為 TWD。
 * 同一檔只會有一種幣別（validateLedgerChange 擋掉混用）。
 */
export function symbolCurrency(
  symbol: string,
  transactions: readonly Pick<Transaction, "symbol" | "currency">[],
  dividends: readonly Pick<Dividend, "symbol" | "currency">[] = [],
): Currency {
  const record = transactions.find((t) => t.symbol === symbol) ?? dividends.find((d) => d.symbol === symbol);
  return record ? currencyOf(record) : DEFAULT_CURRENCY;
}

/**
 * 某天 1 單位外幣等於多少台幣。台幣固定為 1；外幣要由呼叫端提供（之後的匯率資料來源），
 * 拿不到回 null，呼叫端當成「沒有價格」處理，不要用 1 硬算。
 */
export type FxRateLookup = (currency: Currency, date: string) => number | null;

/** 預設的匯率查詢：只認得台幣 */
export const twdOnlyFxRate: FxRateLookup = (currency) => (currency === DEFAULT_CURRENCY ? 1 : null);

/** 今天的匯率：台幣固定為 1，外幣用呼叫端給的值，沒給回 null */
export function currentFxRate(currency: Currency, provided?: number | null): number | null {
  if (currency === DEFAULT_CURRENCY) return 1;
  return provided ?? null;
}
