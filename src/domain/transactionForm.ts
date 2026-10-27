import { parseBuyDate } from "./buyDate";
import { calcFee, calcTax } from "./fees";
import type { TradeSide, UserSettings } from "./ledgerTypes";

/**
 * 新增／編輯交易表單（M-02）的字串處理：畫面上的欄位都是字串，存檔前才變成數字。
 * 手續費與證交稅的公式在 fees.ts，這裡只負責「什麼時候能算、算出來怎麼填回欄位」。
 */

export type TransactionFormValues = {
  side: TradeSide;
  /** DateField 的顯示格式 "2026/10/05"；空字串代表沒選 */
  tradeDate: string;
  price: string;
  shares: string;
  fee: string;
  tax: string;
  note: string;
};

export type TransactionFormField = "tradeDate" | "price" | "shares" | "fee" | "tax";
export type TransactionFormErrors = Partial<Record<TransactionFormField, string>>;

export type ParsedTransactionForm = {
  side: TradeSide;
  /** YYYY-MM-DD */
  tradeDate: string;
  price: number;
  shares: number;
  fee: number;
  /** 買入一律 0 */
  tax: number;
  /** 空白時 undefined */
  note: string | undefined;
};

export type ParseResult = { ok: true; value: ParsedTransactionForm } | { ok: false; errors: TransactionFormErrors };

/** 輸入時即時轉換：全形數字與小數點轉半形，去掉千分位逗號與空白（不動其他字，讓驗證去擋） */
export function toHalfWidthNumber(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, ".")
    .replace(/[，,\s]/g, "");
}

/** 欄位字串 → 數字；空白或不是數字回 null */
function toNumber(raw: string): number | null {
  const cleaned = toHalfWidthNumber(raw);
  if (cleaned === "" || !/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return null;
  return Number(cleaned);
}

/** 成交價 > 0 且股數為正整數時才算得出成交金額，否則 null */
export function tradeAmount(price: string, shares: string): number | null {
  const p = toNumber(price);
  const s = toNumber(shares);
  if (p === null || s === null || p <= 0 || !Number.isInteger(s) || s <= 0) return null;
  return p * s;
}

/**
 * 依規格 3.2 自動帶入的手續費與證交稅（字串，直接填回欄位）。
 * 價格或股數還不完整時回 null，畫面維持原值。
 */
export function autoCosts(
  side: TradeSide,
  price: string,
  shares: string,
  settings: UserSettings,
  taxRate: number,
): { fee: string; tax: string } | null {
  const amount = tradeAmount(price, shares);
  if (amount === null) return null;
  const fee = calcFee(amount, Number(toHalfWidthNumber(shares)), settings);
  const tax = side === "sell" ? calcTax(amount, taxRate) : 0;
  return { fee: String(fee), tax: String(tax) };
}

/**
 * 預估總金額（M-02）：買入 = 成交金額 + 手續費；賣出 = 成交金額 − 手續費 − 證交稅。
 * 用欄位上的手續費與稅（使用者可能改過）。任何一個欄位還不完整就回 null。
 */
export function estimatedTotal(values: TransactionFormValues): number | null {
  const amount = tradeAmount(values.price, values.shares);
  const fee = toNumber(values.fee);
  const tax = values.side === "sell" ? toNumber(values.tax) : 0;
  if (amount === null || fee === null || tax === null) return null;
  return values.side === "buy" ? amount + fee : amount - fee - tax;
}

/** 存檔前把整份表單轉成數字；錯誤訊息直接給畫面顯示 */
export function parseTransactionForm(values: TransactionFormValues, today: Date = new Date()): ParseResult {
  const errors: TransactionFormErrors = {};

  let tradeDate = "";
  const date = parseBuyDate(values.tradeDate, today);
  if (!date.ok) errors.tradeDate = date.error.replace("買入日期", "交易日期");
  else if (!date.iso) errors.tradeDate = "請選擇交易日期";
  else tradeDate = date.iso;

  const price = toNumber(values.price);
  if (price === null || price <= 0) errors.price = "成交價必須大於 0";

  const shares = toNumber(values.shares);
  if (shares === null || !Number.isInteger(shares) || shares <= 0) errors.shares = "股數必須是大於 0 的整數";

  const fee = toNumber(values.fee);
  if (fee === null) errors.fee = "請輸入手續費（0 以上）";

  const tax = values.side === "sell" ? toNumber(values.tax) : 0;
  if (tax === null) errors.tax = "請輸入證交稅（0 以上）";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const note = values.note.trim();
  return {
    ok: true,
    value: {
      side: values.side,
      tradeDate,
      price: price as number,
      shares: shares as number,
      fee: fee as number,
      tax: tax as number,
      note: note === "" ? undefined : note,
    },
  };
}
