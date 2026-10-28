import { formatIsoDate, parseBuyDate } from "./buyDate";
import type { Dividend, DividendType } from "./ledgerTypes";
import { toHalfWidthNumber } from "./transactionForm";

/**
 * 新增／編輯股利表單（M-03，docs/stories/012）的字串處理：畫面上的欄位都是字串，存檔前才變成數字。
 * 現金股利填「實際入帳金額」（使用者自己扣掉匯費、二代健保補充保費）；股票股利填配發股數。
 */

export type DividendFormValues = {
  type: DividendType;
  /** DateField 的顯示格式 "2026/10/05"；空字串代表沒選 */
  exDate: string;
  /** 現金：實際入帳金額（元）；股票：配發股數 */
  amount: string;
  note: string;
};

export type DividendFormField = "exDate" | "amount";
export type DividendFormErrors = Partial<Record<DividendFormField, string>>;

export type ParsedDividendForm = {
  type: DividendType;
  /** YYYY-MM-DD */
  exDate: string;
  /** cash 才有 */
  cashAmount?: number;
  /** stock 才有 */
  stockShares?: number;
  /** 空白時 undefined */
  note: string | undefined;
};

export type ParseDividendResult = { ok: true; value: ParsedDividendForm } | { ok: false; errors: DividendFormErrors };

export const DIVIDEND_TYPE_LABEL: Record<DividendType, string> = { cash: "現金股利", stock: "股票股利" };

export function emptyDividendForm(today: string): DividendFormValues {
  return { type: "cash", exDate: formatIsoDate(today), amount: "", note: "" };
}

export function formFromDividend(d: Dividend): DividendFormValues {
  const amount = d.type === "cash" ? d.cashAmount : d.stockShares;
  return { type: d.type, exDate: formatIsoDate(d.exDate), amount: amount === undefined ? "" : String(amount), note: d.note ?? "" };
}

/** 存檔前把整份表單轉成數字；錯誤訊息直接給畫面顯示 */
export function parseDividendForm(values: DividendFormValues, today: Date = new Date()): ParseDividendResult {
  const errors: DividendFormErrors = {};

  let exDate = "";
  const date = parseBuyDate(values.exDate, today);
  if (!date.ok) errors.exDate = date.error.replace("買入日期", "除權息日");
  else if (!date.iso) errors.exDate = "請選擇除權息日";
  else exDate = date.iso;

  const cleaned = toHalfWidthNumber(values.amount);
  const amount = cleaned === "" || !/^\d*\.?\d*$/.test(cleaned) || cleaned === "." ? null : Number(cleaned);
  if (values.type === "cash") {
    if (amount === null || amount <= 0) errors.amount = "股利金額必須大於 0";
  } else if (amount === null || !Number.isInteger(amount) || amount <= 0) {
    errors.amount = "配發股數必須是大於 0 的整數";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const note = values.note.trim();
  return {
    ok: true,
    value: {
      type: values.type,
      exDate,
      ...(values.type === "cash" ? { cashAmount: amount as number } : { stockShares: amount as number }),
      note: note === "" ? undefined : note,
    },
  };
}

/**
 * 把表單結果套到一筆股利上（編輯用）：換類型時清掉另一種的數字。
 * 自動帶入的紀錄被改了金額，就標成 userModified，之後不再自動更新（P2-03）。
 */
export function applyDividendForm(original: Dividend, value: ParsedDividendForm): Dividend {
  const { cashAmount: _c, stockShares: _s, note: _n, ...rest } = original;
  const next: Dividend = {
    ...rest,
    type: value.type,
    exDate: value.exDate,
    ...(value.cashAmount !== undefined ? { cashAmount: value.cashAmount } : {}),
    ...(value.stockShares !== undefined ? { stockShares: value.stockShares } : {}),
    ...(value.note !== undefined ? { note: value.note } : {}),
  };
  if (original.source === "auto" && (next.cashAmount !== original.cashAmount || next.stockShares !== original.stockShares)) {
    next.userModified = true;
  }
  return next;
}

/** 「確認入帳」：預估的自動股利改成已入帳，之後不再自動更新 */
export function confirmDividend(d: Dividend): Dividend {
  return { ...d, status: "received", ...(d.source === "auto" ? { userModified: true } : {}) };
}
