import { linePath, monthsBetween, shiftMonths } from "./candles";
import { symbolCurrency, toTwd, twdOnlyFxRate, type FxRateLookup } from "./currency";
import type { Dividend, Ledger, Transaction } from "./ledgerTypes";
import { LedgerReplayError, replaySymbol } from "./position";

/**
 * 資產走勢（product-spec P2-07 走勢圖、docs/stories/023-asset-history.md）：
 * 依交易紀錄與每日收盤價，逐日重建「總市值」與「累計投入」兩條線。純函式，不碰網路與畫面。
 *
 * 每一天的算法跟首頁一樣都來自 replaySymbol（T1 的重播）：
 * - 持股：當天（含）以前的交易，加上當天（含）以前除權息的股票股利。
 * - 市值 = 持股 × 當天收盤價；那檔當天沒成交（停牌、資料缺一天）用之前最近一天的收盤價。
 * - 累計投入 = 當天以前所有買入的成交金額 + 手續費（規格 1.5；賣出不會減少）。
 * - 金額都是台幣（規格 3.8）：投入用每筆自己的 fxRate，外幣市值用當天的匯率（fxRateOn）。
 */

/** 期間：近 1 個月、近 1 年、全部 */
export type AssetRange = "1m" | "1y" | "all";

export const ASSET_RANGES: readonly { value: AssetRange; label: string }[] = [
  { value: "1m", label: "近 1 個月" },
  { value: "1y", label: "近 1 年" },
  { value: "all", label: "全部" },
];

/** Free 只能看近 1 個月，其他期間是 Pro（product-spec P2-08：資產走勢與配置 Free 近 1 個月、Pro 全部） */
export const FREE_ASSET_RANGES: readonly AssetRange[] = ["1m"];

/** 一檔某一天的收盤價。依日期由舊到新 */
export type DailyClose = { date: string; close: number };

/** 走勢圖上的一天 */
export type AssetHistoryPoint = {
  date: string;
  /** 總市值：當天持股 × 收盤價，加總所有證券 */
  marketValue: number;
  /** 累計投入：當天以前所有買入的成交金額 + 手續費 */
  invested: number;
};

/** 記帳本裡最早的交易日；沒有交易回 null */
export function firstTradeDate(ledger: Pick<Ledger, "transactions">): string | null {
  let first: string | null = null;
  for (const t of ledger.transactions) if (first === null || t.tradeDate < first) first = t.tradeDate;
  return first;
}

/**
 * 期間的第一天（含）。近 1 個月 = 一個月前的同一天；全部 = 第一筆交易那天。
 * 不會早於第一筆交易：之前什麼都沒有，畫出來只是一段 0。沒有交易回 null。
 */
export function rangeStart(range: AssetRange, today: string, ledger: Pick<Ledger, "transactions">): string | null {
  const first = firstTradeDate(ledger);
  if (first === null) return null;
  const start = range === "1m" ? shiftMonths(today, -1) : range === "1y" ? shiftMonths(today, -12) : first;
  return start > first ? start : first;
}

/**
 * 期間內要抓收盤價的代號：期間第一天就有持股、或期間內有交易的。
 * 期間開始前就已出清的不抓，省資料源的次數。依代號排序。
 */
export function symbolsInRange(ledger: Pick<Ledger, "transactions" | "dividends">, from: string, to: string): string[] {
  const symbols = new Set<string>();
  for (const t of ledger.transactions) {
    if (t.tradeDate > to || symbols.has(t.symbol)) continue;
    if (t.tradeDate >= from) {
      symbols.add(t.symbol);
      continue;
    }
    const { state } = replaySymbol(t.symbol, before(ledger.transactions, from), before(ledger.dividends, from));
    if (state.shares > 0) symbols.add(t.symbol);
  }
  return [...symbols].sort();
}

/**
 * 要跟資料源要哪幾個月：期間第一天的前一個月到最後一天。
 * 多抓前一個月，是為了第一天剛好是假日或那檔停牌時，還找得到之前最近的收盤價。
 */
export function historyMonths(from: string, to: string): string[] {
  return monthsBetween(shiftMonths(from, -1), to);
}

export type AssetHistoryOptions = {
  /** 期間第一天、最後一天（含），通常最後一天是今天 */
  from: string;
  to: string;
  /**
   * 首頁用的現價（代號 → 價格）。有給就把最後一個點（日期 = to）改用這組價格，
   * 讓走勢最後一天的值等於首頁總市值（P2-07 AC）。沒有的代號用最近的收盤價。
   */
  latestPrices?: Readonly<Record<string, number>>;
  /** 外幣持股每天的匯率 [多幣別預留]。沒給只認得台幣；外幣那天查不到匯率，跟查不到收盤價一樣跳過 */
  fxRateOn?: FxRateLookup;
};

/**
 * 逐日重建總市值與累計投入。
 * - 日期取 closes 裡所有出現過、落在期間內的交易日（任何一檔有收盤價那天就算一天）。
 * - 某天有持股、卻找不到那檔當天或之前的任何收盤價：那天跳過，不畫一個少算的數字。
 * - 有給 latestPrices 時，最後一天固定是 to（今天）：週末或盤中，就在最後一個交易日後面加一點。
 */
export function buildAssetHistory(
  ledger: Pick<Ledger, "transactions" | "dividends">,
  closes: Readonly<Record<string, readonly DailyClose[]>>,
  options: AssetHistoryOptions,
): AssetHistoryPoint[] {
  const { from, to, latestPrices } = options;
  const fxRateOn = options.fxRateOn ?? twdOnlyFxRate;
  const symbols = [...new Set(ledger.transactions.map((t) => t.symbol))];

  const dateSet = new Set<string>();
  for (const list of Object.values(closes)) {
    for (const c of list) if (c.date >= from && c.date <= to) dateSet.add(c.date);
  }
  if (latestPrices) dateSet.add(to);
  const dates = [...dateSet].sort();

  const points: AssetHistoryPoint[] = [];
  for (const date of dates) {
    const useLatest = latestPrices !== undefined && date === to;
    let marketValue = 0;
    let invested = 0;
    let complete = true;
    for (const symbol of symbols) {
      const { state, problem } = replaySymbol(
        symbol,
        onOrBefore(ledger.transactions, date),
        onOrBefore(ledger.dividends, date),
      );
      if (problem) throw new LedgerReplayError(problem);
      invested += state.invested;
      if (state.shares === 0) continue;
      const price = (useLatest ? latestPrices[symbol] : undefined) ?? closeOnOrBefore(closes[symbol], date);
      const fxRate = fxRateOn(symbolCurrency(symbol, ledger.transactions), date);
      if (price === null || fxRate === null) {
        complete = false;
        break;
      }
      marketValue += toTwd(state.shares * price, fxRate);
    }
    if (complete && invested > 0) points.push({ date, marketValue, invested });
  }
  return points;
}

/** 某天（含）以前最近的收盤價；沒有回 null */
export function closeOnOrBefore(list: readonly DailyClose[] | undefined, date: string): number | null {
  if (!list) return null;
  let found: number | null = null;
  for (const c of list) {
    if (c.date > date) break;
    found = c.close;
  }
  return found;
}

function onOrBefore<T extends Transaction | Dividend>(items: readonly T[], date: string): T[] {
  return items.filter((item) => dateOf(item) <= date);
}

function before<T extends Transaction | Dividend>(items: readonly T[], date: string): T[] {
  return items.filter((item) => dateOf(item) < date);
}

function dateOf(item: Transaction | Dividend): string {
  return "tradeDate" in item ? item.tradeDate : item.exDate;
}

// ─── 畫圖用的座標 ──────────────────────────────────────────────

export type AssetChartLayoutOptions = {
  width: number;
  height: number;
  /** 右邊留給金額刻度的寬度 */
  axisWidth?: number;
  paddingTop?: number;
  /** 下方留給日期 */
  paddingBottom?: number;
};

export type AssetChartLayout = {
  /** 每一天的 x（點在自己那一格的正中間） */
  xs: number[];
  valueToY: (value: number) => number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  /** 每一天分到的寬度：點圖時換算是哪一天 */
  slot: number;
  marketValuePath: string;
  investedPath: string;
  /** 金額刻度（最高、中間、最低） */
  ticks: { value: number; y: number }[];
  /** 底部日期標籤（第一天、中間、最後一天） */
  dateLabels: { x: number; date: string }[];
};

/** 把走勢換算成畫面座標。座標範圍同時包住市值與累計投入，上下各留 6% 空白 */
export function layoutAssetChart(points: readonly AssetHistoryPoint[], options: AssetChartLayoutOptions): AssetChartLayout {
  const axisWidth = options.axisWidth ?? 56;
  const paddingTop = options.paddingTop ?? 12;
  const paddingBottom = options.paddingBottom ?? 24;
  const plotRight = Math.max(0, options.width - axisWidth);
  const plotHeight = Math.max(1, options.height - paddingTop - paddingBottom);

  const values = points.flatMap((p) => [p.marketValue, p.invested]);
  const highest = values.length > 0 ? Math.max(...values) : 1;
  const lowest = values.length > 0 ? Math.min(...values) : 0;
  const pad = highest > lowest ? (highest - lowest) * 0.06 : Math.max(1, highest * 0.05);
  const max = highest + pad;
  const min = lowest - pad;
  const valueToY = (value: number) => paddingTop + ((max - value) / (max - min)) * plotHeight;

  const slot = points.length > 0 ? plotRight / points.length : 0;
  const xs = points.map((_, i) => slot * (i + 0.5));

  const labelIndexes =
    points.length === 0 ? [] : [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return {
    xs,
    valueToY,
    plotRight,
    plotTop: paddingTop,
    plotBottom: paddingTop + plotHeight,
    slot,
    marketValuePath: linePath(points.map((p, i) => ({ x: xs[i], y: valueToY(p.marketValue) }))),
    investedPath: linePath(points.map((p, i) => ({ x: xs[i], y: valueToY(p.invested) }))),
    ticks: [highest, (highest + lowest) / 2, lowest].map((value) => ({ value, y: valueToY(value) })),
    dateLabels: labelIndexes.map((i) => ({ x: xs[i], date: points[i].date })),
  };
}

/** 點在圖上 x 的位置 → 第幾天（超出範圍夾到頭尾）。沒有資料回 null */
export function assetIndexAtX(layout: Pick<AssetChartLayout, "slot" | "xs">, x: number): number | null {
  if (layout.xs.length === 0 || layout.slot <= 0) return null;
  return Math.min(layout.xs.length - 1, Math.max(0, Math.floor(x / layout.slot)));
}

/** 刻度用的短金額：1,234,567 → "123.5萬"；一萬以下照寫 */
export function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${trim(value / 1e8)}億`;
  if (abs >= 1e4) return `${trim(value / 1e4)}萬`;
  return Math.round(value).toLocaleString("en-US");
}

function trim(n: number): string {
  const abs = Math.abs(n);
  return n.toFixed(abs >= 100 ? 0 : 1).replace(/\.0$/, "");
}
