import type { Bucket, Dividend, Ledger, Transaction } from "./ledgerTypes";
import { bucketOf, defaultBucket } from "./portfolio";
import { computePosition, type Position } from "./position";
import { securityTypeOf } from "./security";

/**
 * 持股明細（M-04）與核心／衛星（M-06）的畫面資料。數字一律來自 computePosition，這裡只負責組合、排序與顯示格式。
 * 見 docs/stories/010。
 */

/** 一檔證券在持股明細的一列 */
export type HoldingView = {
  symbol: string;
  /** 證券名稱；查不到行情時用代號 */
  name: string;
  /** 目前的核心／衛星（使用者設定優先，否則依類型） */
  bucket: Bucket;
  /** 是不是使用者手動改過（不是依類型的預設） */
  bucketOverridden: boolean;
  position: Position;
};

/** 每檔的行情：價格與名稱；undefined 代表還沒拿到或查不到 */
export type QuoteLookup = (symbol: string) => { price: number; name: string } | undefined;

/** 記帳本裡出現過的所有代號（交易或股利），依代號排序 */
export function ledgerSymbols(ledger: Ledger): string[] {
  const set = new Set<string>();
  for (const t of ledger.transactions) set.add(t.symbol);
  for (const d of ledger.dividends) set.add(d.symbol);
  return [...set].sort();
}

/** 記帳本 + 行情 → 每檔一列（含已出清） */
export function buildHoldingViews(ledger: Ledger, quoteOf: QuoteLookup, today: string): HoldingView[] {
  return ledgerSymbols(ledger).map((symbol) => buildHoldingView(ledger, symbol, quoteOf, today));
}

/** 單一證券的一列 */
export function buildHoldingView(
  ledger: Ledger,
  symbol: string,
  quoteOf: QuoteLookup,
  today: string,
): HoldingView {
  const type = securityTypeOf(symbol);
  const quote = quoteOf(symbol);
  const position = computePosition(symbol, ledger.transactions, ledger.dividends, {
    type,
    price: quote?.price ?? null,
    settings: ledger.settings,
    today,
  });
  const setting = ledger.holdingSettings.find((s) => s.symbol === symbol);
  return {
    symbol,
    name: quote?.name ?? symbol,
    bucket: bucketOf(position, ledger.holdingSettings),
    bucketOverridden: setting !== undefined && setting.bucket !== defaultBucket(type),
    position,
  };
}

/** 持有中（股數 > 0） */
export function activeHoldings(views: readonly HoldingView[]): HoldingView[] {
  return views.filter((v) => v.position.shares > 0);
}

/** 已出清：曾經買過、目前股數為 0 */
export function closedHoldings(views: readonly HoldingView[]): HoldingView[] {
  return views.filter((v) => v.position.shares === 0 && v.position.invested > 0);
}

export type HoldingSortKey = "marketValue" | "returnRate" | "totalReturn";

export const HOLDING_SORT_LABEL: Record<HoldingSortKey, string> = {
  marketValue: "市值",
  returnRate: "報酬率",
  totalReturn: "總報酬",
};

/** 由大到小排序；沒有價格（值是 null）的排最後，同值依代號 */
export function sortHoldings(views: readonly HoldingView[], key: HoldingSortKey): HoldingView[] {
  return [...views].sort((a, b) => {
    const x = a.position[key];
    const y = b.position[key];
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
}

/** 未實現損益率 = 未實現損益 ÷ 持有成本；沒有價格或沒有持股時 null */
export function unrealizedRate(position: Position): number | null {
  if (position.unrealizedPnl === null || position.costBasis === 0) return null;
  return position.unrealizedPnl / position.costBasis;
}

/** 單一證券的一筆紀錄（交易或股利） */
export type HistoryEntry =
  | { kind: "trade"; date: string; transaction: Transaction }
  | { kind: "dividend"; date: string; dividend: Dividend };

/** 某檔證券的所有交易與股利，依日期新到舊；同一天後建的在前 */
export function symbolHistory(ledger: Ledger, symbol: string): HistoryEntry[] {
  const entries: (HistoryEntry & { createdAt: string })[] = [
    ...ledger.transactions
      .filter((t) => t.symbol === symbol)
      .map((t) => ({ kind: "trade" as const, date: t.tradeDate, transaction: t, createdAt: t.createdAt })),
    ...ledger.dividends
      .filter((d) => d.symbol === symbol)
      .map((d) => ({ kind: "dividend" as const, date: d.exDate, dividend: d, createdAt: d.createdAt })),
  ];
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
  return entries.map(({ createdAt: _, ...entry }) => entry as HistoryEntry);
}

/**
 * 這一段持有（從 holdingSince 開始，出清過再買的不算前一段）的每筆買入，依日期舊到新。
 * 持股頁的走勢圖逐筆標買入點、決定「買在高點還是低點」要逐筆看還是只有一筆（P2-09、Story 010 決策 10）。
 * 同一天先賣光又買回時，那天的買入都算這一段（日期粒度只到天，選最不會漏標的做法）。
 */
export function currentHoldingBuys(history: HistoryEntry[], holdingSince: string | null): Transaction[] {
  if (holdingSince === null) return [];
  return history
    .flatMap((e) => (e.kind === "trade" && e.transaction.side === "buy" && e.date >= holdingSince ? [e.transaction] : []))
    .reverse();
}

/** 買入日不是真的那天：拍照匯入的期初持股、或舊資料日期待補（P2-09 結論旁要註明） */
export function hasPlaceholderDate(t: Transaction): boolean {
  return t.source === "import" || t.tradeDateUnknown === true;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  core: "核心",
  satellite: "衛星",
};

/** 沒有值時顯示的符號 */
export const DASH = "—";

/** 金額：整數元、千分位，例如 930,000；null 顯示 — */
export function formatAmount(amount: number | null): string {
  if (amount === null) return DASH;
  return Math.round(amount).toLocaleString("en-US");
}

/** 有正負號的金額：+99,710 / -1,200 / 0；null 顯示 — */
export function formatSignedAmountOrDash(amount: number | null): string {
  if (amount === null) return DASH;
  const rounded = Math.round(amount);
  const body = Math.abs(rounded).toLocaleString("en-US");
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `-${body}`;
  return "0";
}

/** 股價、平均成本：小數點後 2 位，例如 550.78；null 顯示 — */
export function formatPrice(price: number | null): string {
  if (price === null) return DASH;
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 百分比：+13.88% / -2.10% / 0.00%；null 顯示 — */
export function formatRate(rate: number | null): string {
  if (rate === null) return DASH;
  const pct = (rate * 100).toFixed(2);
  if (pct === "0.00" || pct === "-0.00") return "0.00%";
  return rate > 0 ? `+${pct}%` : `${pct}%`;
}

/** 股數：1,500 股 */
export function formatShares(shares: number): string {
  return `${shares.toLocaleString("en-US")} 股`;
}
