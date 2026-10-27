import type { Candle, PnlDirection } from "./types";

/** 沒填買入日期（或買入日期很近）時，K 線圖顯示近幾個月 */
export const DEFAULT_CHART_MONTHS = 3;
/** 買入日期較早時往前延伸，最多幾個月。證交所日 K 一個月一個請求，太多會被擋 */
export const MAX_CHART_MONTHS = 6;

/**
 * K 線圖要抓哪幾個月（"2026-08"，由舊到新）。
 * 預設近 DEFAULT_CHART_MONTHS 個月；買入日期更早就延伸到買入那個月，但不超過 MAX_CHART_MONTHS。
 */
export function chartMonths(todayIso: string, buyDate?: string): string[] {
  const todayIndex = monthIndex(todayIso);
  let start = todayIndex - (DEFAULT_CHART_MONTHS - 1);
  if (buyDate) {
    const buyIndex = monthIndex(buyDate);
    if (buyIndex < start) start = Math.max(buyIndex, todayIndex - (MAX_CHART_MONTHS - 1));
  }
  const months: string[] = [];
  for (let i = start; i <= todayIndex; i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
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
  /** 價格刻度（最高、中間、最低） */
  ticks: { price: number; y: number }[];
  /** 底部日期標籤（第一天、中間、最後一天） */
  dateLabels: { x: number; date: string }[];
  costY: number | null;
  buy: BuyDateLocation | null;
  /** 買入點要畫在哪（K 棒最低點下方由畫面決定位移） */
  buyPoint: { x: number; lowY: number; candle: Candle } | null;
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
  if (costPrice !== undefined) prices.push(costPrice);
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
  const buyPoint =
    buy?.kind === "in"
      ? { x: shapes[buy.index].x, lowY: shapes[buy.index].wickBottom, candle: candles[buy.index] }
      : null;

  return {
    shapes,
    priceToY,
    plotRight,
    ticks,
    dateLabels,
    costY: costPrice !== undefined ? priceToY(costPrice) : null,
    buy,
    buyPoint,
  };
}

/** "2026-10" → 2026*12 + 9 */
function monthIndex(iso: string): number {
  const [year, month] = iso.split("-").map(Number);
  return year * 12 + (month - 1);
}
