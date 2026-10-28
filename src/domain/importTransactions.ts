import { formatIsoDate, localIsoDate, parseBuyDate } from "./buyDate";
import { applyExtraction, type ApplyExtractionResult, type ExtractionResult, type HoldingDraft } from "./holdingExtract";
import type { Ledger, Transaction } from "./ledgerTypes";
import { replaySymbol } from "./position";
import { formatStockLabel } from "./stockSearch";
import { toHalfWidthNumber } from "./transactionForm";
import type { StockInfo } from "./types";

/**
 * 截圖匯入改成產生交易（P2-06、docs/stories/015）的純邏輯：
 * 辨識結果 → 核對畫面的列（沿用 holdingExtract 的 applyExtraction）→ 檢查每一列 → 每列一筆買入交易。
 * 辨識本身在 src/data/HoldingRecognizer.ts，選圖在 hooks/useScreenshotImport。
 */

/**
 * 核對畫面的一列。欄位沿用 HoldingDraft：buyPrice 是平均成本、shares 是股數，
 * buyDate 是「建倉日期」（顯示格式 2026/10/05，預設今天；這裡是必填）。
 */
export type ImportRow = HoldingDraft;

export type ImportRowField = "stock" | "buyPrice" | "shares" | "buyDate";

export type ImportRowCheck = {
  /** 擋住匯入的問題；有任何一列有錯，匯入按鈕就不能按 */
  errors: Partial<Record<ImportRowField, string>>;
  /** 記帳本裡這檔目前已經持有的股數（> 0 才有值）：匯入會再加一筆買入，畫面要提醒 */
  heldShares: number | null;
};

export type ImportCheck = {
  /** 依列的 id 查 */
  rows: Map<number, ImportRowCheck>;
  /** 至少一列、而且每一列都沒有錯 */
  canImport: boolean;
};

/** 每筆匯入交易的備註（規格 P2-06） */
export const IMPORT_NOTE = "拍照匯入期初持股";

/** 核對畫面最多幾列：可以分好幾張截圖加進來，但總數有上限，免得畫面長到核對不完 */
export const MAX_IMPORT_ROWS = 30;

/** 新的一列：建倉日期預設今天 */
export function emptyImportRow(id: number, today: Date): ImportRow {
  return { id, query: "", selected: null, buyPrice: "", shares: "", buyDate: formatIsoDate(localIsoDate(today)) };
}

/**
 * 把一張截圖的辨識結果加進核對畫面：已經在畫面上的列保留，新的接在後面。
 * 張 → 股、同一張截圖裡重複的合併、對不到股票與看不清楚的標「請確認」，都沿用 applyExtraction。
 */
export function addExtractionToRows(
  rows: ImportRow[],
  result: ExtractionResult,
  stocks: StockInfo[],
  nextId: () => number,
  today: Date,
): ApplyExtractionResult<ImportRow> {
  return applyExtraction(rows, result, stocks, nextId, (id) => emptyImportRow(id, today), MAX_IMPORT_ROWS);
}

/**
 * 檢查每一列能不能匯入：
 * - 股票一定要從清單選定（對不到清單的不能匯入）；同一檔出現在兩列也不行（多張截圖重疊時常見，避免股數算兩次）。
 * - 平均成本 > 0、股數為正整數、建倉日期必填且不晚於今天。
 * - 記帳本裡已經持有同一檔：不擋，但回傳目前股數讓畫面提醒。
 */
export function checkImportRows(rows: ImportRow[], ledger: Ledger, today: Date): ImportCheck {
  const checks = new Map<number, ImportRowCheck>();
  const firstRowOf = new Map<string, number>();

  rows.forEach((row, index) => {
    const errors: ImportRowCheck["errors"] = {};
    let heldShares: number | null = null;

    if (!row.selected) {
      const raw = row.query.trim();
      errors.stock = raw === "" ? "請選擇股票" : `清單裡找不到「${raw}」，請從清單選擇正確的股票`;
    } else {
      const symbol = row.selected.symbol;
      const first = firstRowOf.get(symbol);
      if (first !== undefined) {
        errors.stock = `和第 ${first + 1} 檔都是${formatStockLabel(row.selected)}，請刪掉重複的那一檔`;
      } else {
        firstRowOf.set(symbol, index);
      }
      const { state } = replaySymbol(symbol, ledger.transactions, ledger.dividends);
      if (state.shares > 0) heldShares = state.shares;
    }

    const price = toNumber(row.buyPrice);
    if (row.buyPrice.trim() === "") errors.buyPrice = "請輸入平均成本";
    else if (price === null || price <= 0) errors.buyPrice = "平均成本必須大於 0";

    const shares = toNumber(row.shares);
    if (row.shares.trim() === "") errors.shares = "請輸入股數";
    else if (shares === null || !Number.isInteger(shares) || shares <= 0) errors.shares = "股數必須是大於 0 的整數";

    const date = parseBuyDate(row.buyDate ?? "", today);
    if (!date.ok) errors.buyDate = date.error.replace("買入日期", "建倉日期");
    else if (!date.iso) errors.buyDate = "請選擇建倉日期";

    checks.set(row.id, { errors, heldShares });
  });

  const canImport = rows.length > 0 && [...checks.values()].every((c) => Object.keys(c.errors).length === 0);
  return { rows: checks, canImport };
}

/** 新增交易用的欄位（id、createdAt、updatedAt 由 repository 補） */
export type ImportTransactionDraft = Omit<Transaction, "id" | "createdAt" | "updatedAt">;

/**
 * 每列一筆買入交易：價格 = 平均成本、手續費 0 且標成手動覆寫（券商的平均成本已含手續費，
 * 之後改手續費設定也不會被重算）、source = import、備註「拍照匯入期初持股」。
 * 只在 checkImportRows 通過後呼叫；任何一列不合格就丟錯。
 */
export function toImportTransactions(rows: ImportRow[], today: Date): ImportTransactionDraft[] {
  return rows.map((row) => {
    const price = toNumber(row.buyPrice);
    const shares = toNumber(row.shares);
    const date = parseBuyDate(row.buyDate ?? "", today);
    if (!row.selected || price === null || shares === null || !date.ok || !date.iso) {
      throw new Error(`第 ${row.id} 列還沒核對完成`);
    }
    return {
      symbol: row.selected.symbol,
      side: "buy",
      tradeDate: date.iso,
      price,
      shares,
      fee: 0,
      tax: 0,
      feeOverridden: true,
      source: "import",
      note: IMPORT_NOTE,
    };
  });
}

/** 欄位字串 → 數字；空白或不是數字回 null */
function toNumber(raw: string): number | null {
  const cleaned = toHalfWidthNumber(raw);
  if (cleaned === "" || !/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return null;
  return Number(cleaned);
}
