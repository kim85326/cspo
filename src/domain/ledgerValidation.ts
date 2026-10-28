import { CURRENCIES, currencyOf } from "./currency";
import type { Dividend, Ledger, Transaction } from "./ledgerTypes";
import { replaySymbol, type ReplayProblem } from "./position";

/** 對記帳本的一次變更（新增、修改、刪除一筆交易或股利） */
export type LedgerChange =
  | { kind: "addTransaction"; transaction: Transaction }
  | { kind: "updateTransaction"; transaction: Transaction }
  | { kind: "deleteTransaction"; id: string }
  | { kind: "addDividend"; dividend: Dividend }
  | { kind: "updateDividend"; dividend: Dividend }
  | { kind: "deleteDividend"; id: string };

/** 變更被拒絕的原因。message 直接給畫面顯示 */
export type LedgerError =
  | {
      code: "oversell";
      message: string;
      symbol: string;
      /** 是哪一筆賣出不夠賣 */
      transactionId: string;
      /** 那筆賣出當下的持有股數 */
      held: number;
    }
  | { code: "stockDividendWithoutShares"; message: string; symbol: string; dividendId: string }
  | { code: "invalid"; message: string; field: string }
  | { code: "notFound"; message: string; id: string };

export type LedgerChangeResult = { ok: true; ledger: Ledger } | { ok: false; error: LedgerError };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 套用變更後，從頭重播受影響的證券（規格 3.3）。
 * 任何一筆賣出超過當時持股、或股票股利在除權息日沒有持股，就拒絕並說明是哪一筆。
 * 通過時回傳變更後的新 ledger（不修改傳入的 ledger）。
 * @param today 今天 YYYY-MM-DD，交易日期不可晚於今天
 */
export function validateLedgerChange(
  ledger: Ledger,
  change: LedgerChange,
  today: string,
): LedgerChangeResult {
  const fieldError = validateChangeFields(change, today);
  if (fieldError) return { ok: false, error: fieldError };

  const applied = applyChange(ledger, change);
  if (!applied.ok) return applied;

  for (const symbol of applied.symbols) {
    const currencyError = validateSymbolCurrency(symbol, applied.ledger);
    if (currencyError) return { ok: false, error: currencyError };
    const { problem } = replaySymbol(symbol, applied.ledger.transactions, applied.ledger.dividends);
    if (problem) return { ok: false, error: describeProblem(problem, changedId(change)) };
  }
  return { ok: true, ledger: applied.ledger };
}

/** 檢查整份記帳本（讀檔、還原備份時用）；沒問題回 null */
export function validateLedger(ledger: Ledger): LedgerError | null {
  const symbols = new Set([
    ...ledger.transactions.map((t) => t.symbol),
    ...ledger.dividends.map((d) => d.symbol),
  ]);
  for (const symbol of symbols) {
    const currencyError = validateSymbolCurrency(symbol, ledger);
    if (currencyError) return currencyError;
    const { problem } = replaySymbol(symbol, ledger.transactions, ledger.dividends);
    if (problem) return describeProblem(problem, null);
  }
  return null;
}

/**
 * 同一檔證券的交易與股利只能有一種幣別（規格 3.8，Story 025）：持有成本、平均成本都是同一個幣別的股數相加，
 * 混用會讓「平均成本」失去意義。沒填幣別視為 TWD。
 */
function validateSymbolCurrency(symbol: string, ledger: Pick<Ledger, "transactions" | "dividends">): LedgerError | null {
  const currencies = new Set([
    ...ledger.transactions.filter((t) => t.symbol === symbol).map(currencyOf),
    ...ledger.dividends.filter((d) => d.symbol === symbol).map(currencyOf),
  ]);
  return currencies.size > 1 ? invalid("currency", "同一檔證券的交易與股利只能使用一種幣別") : null;
}

/** 選填的多幣別欄位：有填就要是認得的幣別、大於 0 的匯率（Story 025） */
function validateMultiCurrency(record: Pick<Transaction | Dividend, "currency" | "fxRate">): LedgerError | null {
  if (record.currency !== undefined && !CURRENCIES.includes(record.currency)) {
    return invalid("currency", "不支援的幣別");
  }
  if (record.fxRate !== undefined && (!Number.isFinite(record.fxRate) || record.fxRate <= 0)) {
    return invalid("fxRate", "匯率必須大於 0");
  }
  if (currencyOf(record) === "TWD" && record.fxRate !== undefined && record.fxRate !== 1) {
    return invalid("fxRate", "台幣的匯率固定為 1");
  }
  return null;
}

/** 單筆交易的欄位檢查（M-02 驗證規則） */
export function validateTransaction(t: Transaction, today: string): LedgerError | null {
  if (!DATE_PATTERN.test(t.tradeDate)) return invalid("tradeDate", "請選擇交易日期");
  if (t.tradeDate > today) return invalid("tradeDate", "交易日期不可晚於今天");
  if (!Number.isFinite(t.price) || t.price <= 0) return invalid("price", "成交價必須大於 0");
  if (!Number.isInteger(t.shares) || t.shares <= 0) return invalid("shares", "股數必須是大於 0 的整數");
  if (!Number.isFinite(t.fee) || t.fee < 0) return invalid("fee", "手續費不可小於 0");
  if (!Number.isFinite(t.tax) || t.tax < 0) return invalid("tax", "證交稅不可小於 0");
  if (t.side === "buy" && t.tax !== 0) return invalid("tax", "買入沒有證交稅");
  return validateMultiCurrency(t);
}

/** 單筆股利的欄位檢查（M-03） */
export function validateDividend(d: Dividend): LedgerError | null {
  if (!DATE_PATTERN.test(d.exDate)) return invalid("exDate", "請選擇除權息日");
  if (d.type === "cash") {
    const amount = d.cashAmount ?? NaN;
    if (!Number.isFinite(amount) || amount <= 0) return invalid("cashAmount", "股利金額必須大於 0");
  } else {
    const shares = d.stockShares ?? NaN;
    if (!Number.isInteger(shares) || shares <= 0) {
      return invalid("stockShares", "配發股數必須是大於 0 的整數");
    }
  }
  if (d.withholdingTax !== undefined && (!Number.isFinite(d.withholdingTax) || d.withholdingTax < 0)) {
    return invalid("withholdingTax", "預扣稅額不可小於 0");
  }
  return validateMultiCurrency(d);
}

function validateChangeFields(change: LedgerChange, today: string): LedgerError | null {
  switch (change.kind) {
    case "addTransaction":
    case "updateTransaction":
      return validateTransaction(change.transaction, today);
    case "addDividend":
    case "updateDividend":
      return validateDividend(change.dividend);
    default:
      return null;
  }
}

type Applied = { ok: true; ledger: Ledger; symbols: string[] } | { ok: false; error: LedgerError };

/** 套用變更，並列出要重播的證券（修改時代號可能換了，新舊都要重播） */
function applyChange(ledger: Ledger, change: LedgerChange): Applied {
  const { transactions, dividends } = ledger;
  switch (change.kind) {
    case "addTransaction": {
      const t = change.transaction;
      return { ok: true, ledger: { ...ledger, transactions: [...transactions, t] }, symbols: [t.symbol] };
    }
    case "updateTransaction": {
      const t = change.transaction;
      const old = transactions.find((x) => x.id === t.id);
      if (!old) return notFound(t.id);
      return {
        ok: true,
        ledger: { ...ledger, transactions: transactions.map((x) => (x.id === t.id ? t : x)) },
        symbols: unique([old.symbol, t.symbol]),
      };
    }
    case "deleteTransaction": {
      const old = transactions.find((x) => x.id === change.id);
      if (!old) return notFound(change.id);
      return {
        ok: true,
        ledger: { ...ledger, transactions: transactions.filter((x) => x.id !== change.id) },
        symbols: [old.symbol],
      };
    }
    case "addDividend": {
      const d = change.dividend;
      return { ok: true, ledger: { ...ledger, dividends: [...dividends, d] }, symbols: [d.symbol] };
    }
    case "updateDividend": {
      const d = change.dividend;
      const old = dividends.find((x) => x.id === d.id);
      if (!old) return notFound(d.id);
      return {
        ok: true,
        ledger: { ...ledger, dividends: dividends.map((x) => (x.id === d.id ? d : x)) },
        symbols: unique([old.symbol, d.symbol]),
      };
    }
    case "deleteDividend": {
      const old = dividends.find((x) => x.id === change.id);
      if (!old) return notFound(change.id);
      return {
        ok: true,
        ledger: { ...ledger, dividends: dividends.filter((x) => x.id !== change.id) },
        symbols: [old.symbol],
      };
    }
  }
}

/** 被新增或修改的那一筆；刪除時沒有 */
function changedId(change: LedgerChange): string | null {
  if (change.kind === "addTransaction" || change.kind === "updateTransaction") return change.transaction.id;
  if (change.kind === "addDividend" || change.kind === "updateDividend") return change.dividend.id;
  return null;
}

/**
 * 錯誤訊息：出問題的是正在輸入的這一筆，就直接說原因（規格 3.7 錯誤範例）；
 * 是別的紀錄被連帶影響，就說出是哪一筆。
 */
function describeProblem(problem: ReplayProblem, changedId: string | null): LedgerError {
  if (problem.kind === "oversell") {
    const t = problem.transaction;
    const held = `${formatShares(problem.held)} 股`;
    const message =
      t.id === changedId
        ? `賣出股數超過持有股數（${held}）`
        : `${t.tradeDate} 賣出 ${formatShares(t.shares)} 股的那筆交易會超過當時持有股數（${held}），請先修改或刪除那筆賣出`;
    return { code: "oversell", message, symbol: t.symbol, transactionId: t.id, held: problem.held };
  }
  const d = problem.dividend;
  const message =
    d.id === changedId
      ? "除權息日當時沒有持股，請確認日期"
      : `${d.exDate} 的股票股利會變成除權息日當時沒有持股，請先修改或刪除那筆股利`;
  return { code: "stockDividendWithoutShares", message, symbol: d.symbol, dividendId: d.id };
}

function formatShares(n: number): string {
  return n.toLocaleString("en-US");
}

function invalid(field: string, message: string): LedgerError {
  return { code: "invalid", field, message };
}

function notFound(id: string): Applied {
  return { ok: false, error: { code: "notFound", id, message: "找不到這筆紀錄，可能已經被刪除" } };
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}
