import type { Candle, DividendEvent, SplitEvent } from "@/domain/types";

/**
 * FinMind v4 回應：{ msg, status, data }。成功時 status 是 200、data 是陣列；
 * 失敗時（超過次數上限、參數錯誤）status 不是 200，或整個格式不同。
 * 這個檔都是純函式，不碰網路；範例回應見 src/data/__fixtures__/finmind*.json。
 */
type FinmindBody = { status?: unknown; msg?: unknown; data?: unknown };

/** 成功回應的 data；失敗回 null，呼叫端據此丟 PriceLoadError */
export function finmindRows(body: unknown): Record<string, unknown>[] | null {
  const response = (body ?? {}) as FinmindBody;
  if (response.status !== 200 || !Array.isArray(response.data)) return null;
  return response.data.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
  );
}

/** 失敗回應的訊息（給錯誤訊息用） */
export function finmindMessage(body: unknown): string {
  const msg = (body as FinmindBody | null)?.msg;
  return typeof msg === "string" && msg !== "" ? msg : "回應格式不對";
}

/**
 * TaiwanStockPrice → Candle[]（依日期由舊到新）。
 * 欄位：date、open、max、min、close（都是 number）。價格不是正數的列略過。
 */
export function parseFinmindCandles(rows: Record<string, unknown>[]): Candle[] {
  const candles: Candle[] = [];
  for (const row of rows) {
    const date = isoDate(row.date);
    const open = positive(row.open);
    const high = positive(row.max);
    const low = positive(row.min);
    const close = positive(row.close);
    if (!date || open === null || high === null || low === null || close === null) continue;
    candles.push({ date, open, high, low, close });
  }
  return candles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * TaiwanStockDividend → DividendEvent[]（依除權息日由舊到新）。
 *
 * 每一列是一次股利決議，現金與股票各有自己的除權息交易日（常常是同一天）：
 * - 現金 = CashEarningsDistribution + CashStatutorySurplus（元／股），除息日 CashExDividendTradingDate
 * - 股票 = StockEarningsDistribution + StockStatutorySurplus（元／股，面額 10 元 → × 100 = 每千股配幾股），
 *   除權日 StockExDividendTradingDate
 * - 同一個除權息日的現金與配股合成一筆；沒有除權息日的列（只有董事會決議）略過。
 * - 有除息日但現金、配股都是 0：金額還沒公告（ETF 常見，例如 00406A 2026-11-03），cashPerShare 給 null。
 */
export function parseFinmindDividends(rows: Record<string, unknown>[], symbol: string): DividendEvent[] {
  const byDate = new Map<string, DividendEvent>();
  const eventOn = (exDate: string): DividendEvent => {
    let event = byDate.get(exDate);
    if (!event) {
      event = { kind: "dividend", symbol, exDate, cashPerShare: 0, stockPerThousand: 0, payDate: null };
      byDate.set(exDate, event);
    }
    return event;
  };

  for (const row of rows) {
    const cash = amount(row.CashEarningsDistribution) + amount(row.CashStatutorySurplus);
    const stockPerThousand = round6((amount(row.StockEarningsDistribution) + amount(row.StockStatutorySurplus)) * 100);
    const cashExDate = isoDate(row.CashExDividendTradingDate);
    const stockExDate = isoDate(row.StockExDividendTradingDate);

    if (cashExDate) {
      const event = eventOn(cashExDate);
      event.cashPerShare = round8((event.cashPerShare ?? 0) + cash);
      event.payDate = isoDate(row.CashDividendPaymentDate) ?? event.payDate;
    }
    if (stockExDate) {
      const event = eventOn(stockExDate);
      event.stockPerThousand = round6(event.stockPerThousand + stockPerThousand);
    }
  }

  return [...byDate.values()]
    .map((event) =>
      event.cashPerShare === 0 && event.stockPerThousand === 0 ? { ...event, cashPerShare: null } : event,
    )
    .sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));
}

/**
 * TaiwanStockSplitPrice → SplitEvent[]（分割、反分割、面額變更都算）。
 * 比例 = 分割前價格 ÷ 分割後參考價：0050 188.65 ÷ 47.16 ≈ 4 → 4；
 * 00632R 3.28 ÷ 22.96 ≈ 1/7 → 1/7。取到小數第 2 位（反分割取倒數後再取），抹掉參考價的尾差。
 */
export function parseFinmindSplits(rows: Record<string, unknown>[], symbol: string): SplitEvent[] {
  const splits: SplitEvent[] = [];
  for (const row of rows) {
    const date = isoDate(row.date);
    const before = positive(row.before_price);
    const after = positive(row.after_price);
    if (!date || before === null || after === null) continue;
    const raw = before / after;
    const ratio = raw >= 1 ? round2(raw) : 1 / round2(1 / raw);
    if (ratio === 1) continue;
    splits.push({ kind: "split", symbol, date, ratio });
  }
  return splits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
