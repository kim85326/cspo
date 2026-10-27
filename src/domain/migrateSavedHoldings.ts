/**
 * 舊版持股（SavedHolding，Story 004）→ 交易紀錄（Transaction）。純函式，不碰儲存。
 * 規則見 docs/stories/008 與 product-spec 1.5「資料搬移」。
 */
import { formatIsoDate, localIsoDate, parseBuyDate } from "./buyDate";
import { calcFee, DEFAULT_USER_SETTINGS } from "./fees";
import type { Ledger, Transaction, UserSettings } from "./ledgerTypes";
import { validateHoldingInput } from "./pnl";
import type { SavedHolding } from "./types";

/** 搬過來的交易備註（product-spec 1.5） */
export const MIGRATED_NOTE = "由舊版資料轉入";

/** 空的記帳本：沒存過、或資料壞掉讀不回來時用 */
export function emptyLedger(): Ledger {
  return {
    schemaVersion: 1,
    transactions: [],
    dividends: [],
    holdingSettings: [],
    settings: { ...DEFAULT_USER_SETTINGS },
  };
}

export type ConvertOptions = {
  /** 現在時間：決定「今天」（沒有日期時的暫用日期）與 createdAt */
  now: Date;
  /** 算手續費用；預設 DEFAULT_USER_SETTINGS */
  settings?: UserSettings;
  /** 產生交易 id；預設用時間 + 亂數 */
  newId?: () => string;
};

/** 買入日期的狀況：有日期、沒填、填了但認不出來（格式錯、沒有這天、晚於今天） */
export type DateStatus = "ok" | "missing" | "invalid";

export type ConvertResult =
  | { ok: true; transaction: Transaction; dateStatus: DateStatus }
  | { ok: false; reason: string };

/**
 * 一筆舊持股 → 一筆買入交易。代號、買入價、股數不合法就失敗（說明原因）；
 * 日期有問題不算失敗：改用今天並標 tradeDateUnknown，錢的數字照樣算得對。
 * 手續費依 3.2 用預設設定計算；舊版本來不算手續費，所以轉入後持有成本會多出這筆手續費。
 */
export function savedHoldingToTransaction(
  item: SavedHolding,
  options: ConvertOptions,
  createdAt: string,
): ConvertResult {
  const { now, settings = DEFAULT_USER_SETTINGS, newId = defaultId } = options;
  const validation = validateHoldingInput({ ...item, buyDate: "" }, now);
  if (!validation.ok) return { ok: false, reason: Object.values(validation.errors).join("；") };
  const { symbol, buyPrice: price, shares } = validation.holding;

  const rawDate = item.buyDate ?? "";
  const parsed = parseBuyDate(rawDate, now);
  const dateStatus: DateStatus = parsed.ok && parsed.iso ? "ok" : rawDate.trim() === "" ? "missing" : "invalid";
  const tradeDate = parsed.ok && parsed.iso ? parsed.iso : localIsoDate(now);

  const transaction: Transaction = {
    id: newId(),
    symbol,
    side: "buy",
    tradeDate,
    price,
    shares,
    fee: calcFee(price * shares, shares, settings),
    tax: 0,
    feeOverridden: false,
    source: "manual",
    createdAt,
    updatedAt: createdAt,
  };
  if (dateStatus !== "ok") transaction.tradeDateUnknown = true;
  return { ok: true, transaction, dateStatus };
}

/** 被略過的舊持股與原因 */
export type SkippedHolding = { item: SavedHolding; reason: string };

export type MigrationResult = { transactions: Transaction[]; skipped: SkippedHolding[] };

/**
 * 舊持股陣列 → 買入交易。每筆合法的轉成一筆，不合法的略過、不讓整批失敗。
 * 備註寫「由舊版資料轉入」；日期是暫用的，備註會說明原因，使用者之後看得懂為什麼是這天。
 * createdAt 依原本順序每筆加 1 毫秒，同一天的交易重播順序跟舊版一樣。
 */
export function migrateSavedHoldings(items: readonly SavedHolding[], options: ConvertOptions): MigrationResult {
  const transactions: Transaction[] = [];
  const skipped: SkippedHolding[] = [];
  items.forEach((item, index) => {
    const createdAt = new Date(options.now.getTime() + index).toISOString();
    const result = savedHoldingToTransaction(item, options, createdAt);
    if (!result.ok) {
      skipped.push({ item, reason: result.reason });
      return;
    }
    transactions.push({ ...result.transaction, note: migratedNote(item, result.dateStatus) });
  });
  return { transactions, skipped };
}

function migratedNote(item: SavedHolding, status: DateStatus): string {
  if (status === "missing") return `${MIGRATED_NOTE}（舊資料沒有買入日期，暫用轉入當天）`;
  if (status === "invalid") return `${MIGRATED_NOTE}（原買入日期「${item.buyDate}」無法辨識，暫用轉入當天）`;
  return MIGRATED_NOTE;
}

/**
 * 過渡期給 CalculateScreen 用（T6 換掉首頁後移除）：記帳本裡的買入交易 → 畫面欄位要的 SavedHolding。
 * 日期不明的交易不帶日期回去，免得欄位冒出使用者沒填過的日期、K 線圖標錯買入點。
 */
export function savedHoldingsFromLedger(ledger: Ledger): SavedHolding[] {
  return ledger.transactions
    .filter((t) => t.side === "buy")
    .map((t) => ({
      symbol: t.symbol,
      buyPrice: String(t.price),
      shares: String(t.shares),
      ...(t.tradeDateUnknown ? {} : { buyDate: formatIsoDate(t.tradeDate) }),
    }));
}

/**
 * 過渡期給 CalculateScreen 用：用畫面上的持股整份取代記帳本的交易，股利與設定不動。
 * 跟原本一模一樣的那幾筆沿用舊交易（保留 id、建立時間、手續費與「由舊版資料轉入」備註），
 * 其餘新建。不合法的筆數略過（畫面只會在驗證通過後才存）。
 * 目前記帳本只有買入；T4 加入賣出與股利後，交易要改由交易畫面維護，不能再走這裡整份覆寫。
 */
export function replaceSavedHoldings(
  ledger: Ledger,
  items: readonly SavedHolding[],
  options: ConvertOptions,
): Ledger {
  const unused = [...ledger.transactions];
  const transactions: Transaction[] = [];
  items.forEach((item, index) => {
    const createdAt = new Date(options.now.getTime() + index).toISOString();
    const result = savedHoldingToTransaction(item, { settings: ledger.settings, ...options }, createdAt);
    if (!result.ok) return;
    const match = unused.findIndex((t) => sameHolding(t, result.transaction));
    if (match >= 0) {
      transactions.push(unused[match]);
      unused.splice(match, 1);
    } else {
      transactions.push(result.transaction);
    }
  });
  return { ...ledger, transactions };
}

/** 同一筆持股：代號、價、量相同，日期相同（兩邊都不知道日期也算相同） */
function sameHolding(a: Transaction, b: Transaction): boolean {
  if (a.side !== "buy" || a.symbol !== b.symbol || a.price !== b.price || a.shares !== b.shares) return false;
  if (a.tradeDateUnknown || b.tradeDateUnknown) return !!a.tradeDateUnknown && !!b.tradeDateUnknown;
  return a.tradeDate === b.tradeDate;
}

let idSeq = 0;

function defaultId(): string {
  idSeq += 1;
  return `tx-${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
