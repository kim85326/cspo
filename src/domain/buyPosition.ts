import { adjustCloses } from "./adjustedPrice";
import { formatIsoDate } from "./buyDate";
import { periodLabel, shiftMonths } from "./candles";
import type { Candle, CorporateAction } from "./types";

/**
 * P2-09「買在高點還是低點」：買入價在買入日之前那段期間，算高還是低。純函式。
 *
 * - 只用買入日**之前**的收盤價（買的當下看得到的資料），不含買入當天、也不含之後。
 * - 用還原收盤價：除息後股價下跳，不還原的話除息前的日子都會變「比買入價貴」。
 *   還原的基準是買入日，只折算比較區間到買入日之間的除權息與分割。
 * - 百分位 = 區間內「收盤價 < 買入價」的交易日數 ÷ 區間內交易日總數。
 *   ≥ 80% 高檔、≤ 20% 低檔、中間是中段。用整數比，避免 0.8 這種小數誤差。
 */

/** 比較區間的固定選項（月數）：3 個月、6 個月、1 年（預設）、3 年；另外可以自訂起始日 */
export const COMPARE_PERIODS = [3, 6, 12, 36] as const;
export const DEFAULT_COMPARE_PERIOD = 12;
/** 比較區間最長 3 年：自訂起始日最早只能選到買入日前 36 個月 */
export const MAX_COMPARE_MONTHS = 36;

/** 比較區間：買入日前 N 個月，或使用者自訂的起始日（ISO；結束日固定是買入日） */
export type CompareRange = number | { start: string };

/** 區間內交易日少於這個數就不下結論（P2-09 邊界情況） */
export const MIN_TRADING_DAYS = 20;
/** 資料第一天比區間起點晚超過這麼多天，就當作「上市未滿」：連假最長約 9 天，多抓一點 */
const LISTING_GAP_DAYS = 14;

export type BuyLevel = "high" | "middle" | "low";

export type BuyPosition =
  | {
      kind: "ok";
      level: BuyLevel;
      /** 0–100，四捨五入到整數，給畫面顯示 */
      percent: number;
      /** 收盤價低於買入價的交易日數 */
      below: number;
      /** 區間內交易日總數 */
      days: number;
      /** 實際用到的第一天與最後一天 */
      from: string;
      to: string;
      /** 上市時間短於所選期間：以上市以來幾個月計算 */
      listedMonths?: number;
    }
  | { kind: "insufficient"; days: number };

export const LEVEL_LABEL: Record<BuyLevel, string> = { high: "高檔", middle: "中段", low: "低檔" };

/** 百分位分級：剛好 80% 算高檔、剛好 20% 算低檔 */
export function levelOf(below: number, days: number): BuyLevel {
  if (below * 5 >= days * 4) return "high";
  if (below * 5 <= days) return "low";
  return "middle";
}

/**
 * 算買入點百分位。
 * - candles：至少涵蓋「買入日前 period 個月」到買入日（之後的會被略過），由舊到新。
 * - actions：同一段期間的除權息與分割；拿不到就給空陣列（等於用未還原價格）。
 */
export function buyPosition(
  candles: Candle[],
  actions: CorporateAction[],
  buyDate: string,
  buyPrice: number,
  range: CompareRange,
): BuyPosition {
  const from = compareStart(buyDate, range);
  const window = comparisonWindow(candles, actions, buyDate, from);

  if (window.length < MIN_TRADING_DAYS) return { kind: "insufficient", days: window.length };

  const below = window.filter((c) => c.adjClose < buyPrice).length;
  const first = window[0].date;
  const last = window[window.length - 1].date;
  const listedLate = daysBetween(from, first) > LISTING_GAP_DAYS;
  return {
    kind: "ok",
    level: levelOf(below, window.length),
    percent: Math.round((below / window.length) * 100),
    below,
    days: window.length,
    from: first,
    to: last,
    ...(listedLate ? { listedMonths: Math.max(1, Math.round(daysBetween(first, buyDate) / 30.4)) } : {}),
  };
}

/** 比較區間的第一天（含）：買入日前 N 個月，或自訂起始日 */
export function compareStart(buyDate: string, range: CompareRange): string {
  return typeof range === "number" ? shiftMonths(buyDate, -range) : range.start;
}

/** 自訂起始日最早可以選哪一天：買入日前 3 年 */
export function earliestCustomStart(buyDate: string): string {
  return shiftMonths(buyDate, -MAX_COMPARE_MONTHS);
}

/** 自訂起始日檢查：早於買入日前 3 年、或不在買入日之前都不行。沒問題回 null */
export function validateCustomStart(start: string, buyDate: string): string | null {
  if (start < earliestCustomStart(buyDate)) {
    return `最早只能選到 ${formatIsoDate(earliestCustomStart(buyDate))}（買入日前 3 年）`;
  }
  if (start >= buyDate) return "起始日要在買入日之前";
  return null;
}

/**
 * 比較區間內、買入日之前的每一天，價格換成還原價（以買入日為基準），由舊到新。
 * 百分位與區間圖都用這一段，兩邊看到的數字才一致。
 */
export function comparisonWindow(
  candles: Candle[],
  actions: CorporateAction[],
  buyDate: string,
  from: string,
): (Candle & { adjClose: number })[] {
  // 買入當天（或之後第一個交易日）那根也交給 adjustCloses：買在除息當天時，前一天以前都要折算
  const firstOnOrAfter = candles.findIndex((c) => c.date >= buyDate);
  const upTo = (firstOnOrAfter === -1 ? candles : candles.slice(0, firstOnOrAfter + 1)).filter((c) => c.date >= from);
  const adjusted = adjustCloses(upTo, actions);
  return upTo
    .map((c, i) => ({ ...c, adjClose: adjusted[i].adjClose }))
    .filter((c) => c.date < buyDate);
}

/**
 * 區間圖要畫的 K 棒：比較區間每一天換成還原價（開高低收同一個比例），最後接上買入那天
 * （或之後第一個交易日，還原基準就是它，不用折算），買入點才標得上去。
 */
export function comparisonChartCandles(
  candles: Candle[],
  actions: CorporateAction[],
  buyDate: string,
  from: string,
): Candle[] {
  const window = comparisonWindow(candles, actions, buyDate, from).map(({ adjClose, ...c }) => {
    const f = c.close > 0 ? adjClose / c.close : 1;
    return { date: c.date, open: c.open * f, high: c.high * f, low: c.low * f, close: adjClose };
  });
  const buyDay = candles.find((c) => c.date >= buyDate);
  return buyDay ? [...window, buyDay] : window;
}

/**
 * 區間圖上的高檔／低檔色帶邊界（還原價）。跟 levelOf 的判斷完全對得上：
 * - 買入價 > highAbove → 高檔（區間裡至少 80% 的交易日收盤比它低）
 * - 買入價 ≤ lowUpTo → 低檔（區間裡最多 20% 的交易日收盤比它低）
 * 用整數算名次，不用小數百分位，邊界才不會差一天。
 */
export function bandEdges(closes: number[]): { highAbove: number; lowUpTo: number } | null {
  const n = closes.length;
  if (n === 0) return null;
  const sorted = [...closes].sort((a, b) => a - b);
  // 高檔要「收盤 < 買入價」的天數 ≥ ceil(4n/5)；低檔要 ≤ floor(n/5)
  const k = Math.floor((4 * n + 4) / 5);
  const j = Math.floor(n / 5);
  return { highAbove: sorted[k - 1], lowUpTo: sorted[j] };
}

/** 區間的白話名稱：「近 1 年」或「2025/01/02 以來」 */
export function rangeLabel(range: CompareRange): string {
  return typeof range === "number" ? `近 ${periodLabel(range)}` : `${formatIsoDate(range.start)} 以來`;
}

/**
 * 一句話結論，例如「你買在近 1 年的高檔，買入價高於 85% 的交易日」。
 * 只陳述事實：P2-09 規定不得出現「建議」「應該」「買進」「賣出」（單元測試會掃）。
 */
export function buyPositionSentence(position: BuyPosition, range: CompareRange): string {
  if (position.kind === "insufficient") return "資料不足，無法判斷";
  // 自訂起始日是數字開頭，跟「在」中間空一格
  const span = position.listedMonths ? "上市以來" : typeof range === "number" ? rangeLabel(range) : ` ${rangeLabel(range)}`;
  return `你買在${span}的${LEVEL_LABEL[position.level]}，買入價高於 ${position.percent}% 的交易日`;
}

/** 上市未滿所選期間時的註明，其他情況回 null */
export function listingNote(position: BuyPosition, range: CompareRange): string | null {
  if (position.kind !== "ok" || !position.listedMonths) return null;
  const head = typeof range === "number" ? `上市未滿 ${periodLabel(range)}` : "上市日晚於所選起始日";
  return `${head}，以上市以來 ${position.listedMonths} 個月計算`;
}

/** 拍照匯入的期初持股、或日期待補的交易：買入日不是真的那天 */
export const IMPORTED_DATE_NOTE = "買入日為匯入日期，結果僅供參考";

function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;
}
