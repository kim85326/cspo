import type { Candle, PnlDirection } from "./types";

/** 期間切換的選項（月數）：1 個月、3 個月、6 個月、1 年 */
export const CHART_PERIODS = [1, 3, 6, 12] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
/** 預設 1 年：對齊規格書 P2-09「比較區間預設 1 年」，圖與結論用同一個期間 */
export const DEFAULT_CHART_PERIOD: ChartPeriod = 12;
/** 均線天數（交易日）：5 日約一週、20 日約一個月 */
export const MA_SHORT = 5;
export const MA_LONG = 20;

/** "1 個月"、"3 個月"、"1 年" */
export function periodLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12} 年` : `${months} 個月`;
}

/**
 * 同一天往前（負數）或往後推 n 個月，月底夾到那個月最後一天：
 * shiftMonths("2026-03-31", -1) → "2026-02-28"。
 */
export function shiftMonths(iso: string, n: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const index = year * 12 + (month - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** 圖上顯示的範圍：近 N 個月，從 N 個月前的「隔天」到今天（today − N 個月那天不算） */
export function chartStart(todayIso: string, period: number): string {
  return shiftMonths(todayIso, -period);
}

/**
 * 要跟資料來源要哪幾個月（"2026-08"，由舊到新、不重複）：
 * 1. 圖上近 N 個月，再往前多 1 個月，讓 20 日均線一開始就有值；
 * 2. 有買入日期時，加上 P2-09 的比較區間（買入日前 N 個月到買入那個月）。
 * 兩段可能不相連（例如三年前買的），中間的月份不抓。
 */
export function fetchMonths(todayIso: string, period: number, buyDate?: string): string[] {
  const months = new Set(monthsBetween(shiftMonths(todayIso, -period - 1), todayIso));
  if (buyDate && buyDate <= todayIso) {
    for (const m of monthsBetween(shiftMonths(buyDate, -period), buyDate)) months.add(m);
  }
  return [...months].sort();
}

/**
 * 簡單移動平均（收盤價）。回傳長度跟 closes 一樣，湊不滿 window 天的位置是 null。
 */
export function movingAverage(closes: number[], window: number): (number | null)[] {
  let sum = 0;
  return closes.map((close, i) => {
    sum += close;
    if (i >= window) sum -= closes[i - window];
    return i >= window - 1 ? sum / window : null;
  });
}

/** 某一天的漲跌：跟前一個交易日的收盤比。沒有前一天回 null */
export function dayChange(close: number, previousClose: number | undefined): { change: number; percent: number } | null {
  if (previousClose === undefined || previousClose <= 0) return null;
  const change = close - previousClose;
  return { change, percent: (change / previousClose) * 100 };
}

/** from 到 to（ISO 日期，含頭尾）跨過的月份（"2026-08"，由舊到新）。from 晚於 to 回空陣列 */
export function monthsBetween(fromIso: string, toIso: string): string[] {
  const months: string[] = [];
  for (let i = monthIndex(fromIso); i <= monthIndex(toIso); i++) {
    months.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

export type BuyDateLocation =
  /** 買入日（或它之後的第一個交易日，例如週末買不到就落在週一）在圖上第 index 根 */
  | { kind: "in"; index: number }
  /** 買入日早於圖表第一天 */
  | { kind: "before" }
  /** 買入日晚於最新一根 K 棒（例如今天買、今天的行情還沒出來） */
  | { kind: "after" };

export function locateBuyDate(candles: Candle[], buyDate: string): BuyDateLocation {
  if (candles.length === 0 || buyDate < candles[0].date) return { kind: "before" };
  const index = candles.findIndex((c) => c.date >= buyDate);
  return index === -1 ? { kind: "after" } : { kind: "in", index };
}

/** 台股慣例：收盤 > 開盤為紅 K（up），< 為黑 K（down，畫綠色），相等為十字線（flat） */
export function candleDirection(candle: Candle): PnlDirection {
  if (candle.close > candle.open) return "up";
  if (candle.close < candle.open) return "down";
  return "flat";
}

/** 股價本身至少要佔價格範圍的這個比例，不然成本線改貼邊（見 layoutCandleChart） */
const MIN_DATA_SHARE = 0.4;

export type ChartLayoutOptions = {
  width: number;
  height: number;
  /** 右邊留給價格刻度的寬度 */
  axisWidth?: number;
  /** 上、下留白（下方要放買入點符號與日期） */
  paddingTop?: number;
  paddingBottom?: number;
  /** 成本價：畫一條水平線，價格範圍也會把它包進來 */
  costPrice?: number;
  buyDate?: string;
  /** 其他也要畫進來的價格（均線），價格範圍會把它們包進來；null 略過 */
  extraPrices?: (number | null)[];
};

export type CandleShape = {
  candle: Candle;
  direction: PnlDirection;
  x: number;
  bodyX: number;
  bodyWidth: number;
  bodyTop: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
};

export type ChartLayout = {
  shapes: CandleShape[];
  /** 價格 → y 座標 */
  priceToY: (price: number) => number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  /** 每根 K 棒分到的寬度：點圖時換算是哪一天（indexAtX） */
  slot: number;
  /** 收盤價折線（SVG path） */
  closePath: string;
  /** 價格刻度（最高、中間、最低） */
  ticks: { price: number; y: number }[];
  /** 底部日期標籤（第一天、中間、最後一天） */
  dateLabels: { x: number; date: string }[];
  /** 成本線的 y；成本在範圍外時貼在上緣或下緣 */
  costY: number | null;
  /** 成本離股價太遠、沒有照比例畫：在圖的上面（above）或下面（below） */
  costOffChart: "above" | "below" | null;
  buy: BuyDateLocation | null;
  /** 買入點：買入那天、買入價（成本價）的位置；沒給成本價就落在當天最低點 */
  buyPoint: { x: number; y: number; candle: Candle } | null;
};

/** 把 K 棒換算成畫面座標。純函式，畫面只負責照著畫。 */
export function layoutCandleChart(candles: Candle[], options: ChartLayoutOptions): ChartLayout {
  const { width, height, costPrice, buyDate } = options;
  const axisWidth = options.axisWidth ?? 56;
  const paddingTop = options.paddingTop ?? 12;
  const paddingBottom = options.paddingBottom ?? 40;
  const plotRight = Math.max(0, width - axisWidth);
  const plotTop = paddingTop;
  const plotHeight = Math.max(1, height - paddingTop - paddingBottom);

  const prices = candles.flatMap((c) => [c.high, c.low]);
  for (const p of options.extraPrices ?? []) if (p !== null) prices.push(p);
  // 成本離股價太遠（例如抱了好幾年、漲一倍）：把成本包進來會把走勢壓成一條細線。
  // 這時成本線貼在上緣或下緣（costOffChart 告訴畫面要加箭頭），範圍只看股價。
  let costOffChart: "above" | "below" | null = null;
  if (costPrice !== undefined && prices.length > 0) {
    const dataMin = Math.min(...prices);
    const dataMax = Math.max(...prices);
    const withCost = Math.max(dataMax, costPrice) - Math.min(dataMin, costPrice);
    if (withCost > 0 && (dataMax - dataMin) / withCost < MIN_DATA_SHARE) {
      costOffChart = costPrice > dataMax ? "above" : "below";
    } else {
      prices.push(costPrice);
    }
  } else if (costPrice !== undefined) {
    prices.push(costPrice);
  }
  let min = prices.length > 0 ? Math.min(...prices) : 0;
  let max = prices.length > 0 ? Math.max(...prices) : 1;
  const pad = max > min ? (max - min) * 0.06 : Math.max(1, max * 0.05);
  min -= pad;
  max += pad;

  const priceToY = (price: number) => plotTop + ((max - price) / (max - min)) * plotHeight;

  const slot = candles.length > 0 ? plotRight / candles.length : 0;
  const bodyWidth = Math.max(1, slot * 0.6);
  const shapes: CandleShape[] = candles.map((candle, i) => {
    const x = slot * (i + 0.5);
    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const bodyTop = Math.min(openY, closeY);
    return {
      candle,
      direction: candleDirection(candle),
      x,
      bodyX: x - bodyWidth / 2,
      bodyWidth,
      bodyTop,
      // 十字線（開盤 = 收盤）至少畫 1px，不然看不到
      bodyHeight: Math.max(1, Math.abs(closeY - openY)),
      wickTop: priceToY(candle.high),
      wickBottom: priceToY(candle.low),
    };
  });

  const highest = candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : max;
  const lowest = candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : min;
  const middle = (highest + lowest) / 2;
  const ticks = [highest, middle, lowest].map((price) => ({ price, y: priceToY(price) }));

  const labelIndexes =
    candles.length === 0 ? [] : [...new Set([0, Math.floor((candles.length - 1) / 2), candles.length - 1])];
  const dateLabels = labelIndexes.map((i) => ({ x: shapes[i].x, date: candles[i].date }));

  const buy = buyDate ? locateBuyDate(candles, buyDate) : null;
  const costY =
    costPrice === undefined
      ? null
      : costOffChart === "above"
        ? plotTop
        : costOffChart === "below"
          ? plotTop + plotHeight
          : priceToY(costPrice);
  const buyPoint =
    buy?.kind === "in"
      ? { x: shapes[buy.index].x, y: costY ?? shapes[buy.index].wickBottom, candle: candles[buy.index] }
      : null;

  return {
    shapes,
    priceToY,
    plotRight,
    plotTop,
    plotBottom: plotTop + plotHeight,
    slot,
    closePath: linePath(shapes.map((s) => ({ x: s.x, y: priceToY(s.candle.close) }))),
    ticks,
    dateLabels,
    costY,
    costOffChart,
    buy,
    buyPoint,
  };
}

/** 把一串點連成 SVG 折線；null 的地方斷開（均線前幾天沒有值） */
export function linePath(points: ({ x: number; y: number } | null)[]): string {
  let path = "";
  let penDown = false;
  for (const p of points) {
    if (p === null) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"} ${round1(p.x)} ${round1(p.y)} `;
    penDown = true;
  }
  return path.trim();
}

/** 點在圖上 x 的位置 → 第幾根 K 棒（超出範圍夾到頭尾）。沒有 K 棒回 null */
export function indexAtX(layout: Pick<ChartLayout, "slot" | "shapes">, x: number): number | null {
  if (layout.shapes.length === 0 || layout.slot <= 0) return null;
  return Math.min(layout.shapes.length - 1, Math.max(0, Math.floor(x / layout.slot)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "2026-10" → 2026*12 + 9 */
function monthIndex(iso: string): number {
  const [year, month] = iso.split("-").map(Number);
  return year * 12 + (month - 1);
}
