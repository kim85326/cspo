import { adjustCloses } from "./adjustedPrice";
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
  period: number,
): BuyPosition {
  const from = shiftMonths(buyDate, -period);
  // 買入當天（或之後第一個交易日）那根也交給 adjustCloses：買在除息當天時，前一天以前都要折算
  const firstOnOrAfter = candles.findIndex((c) => c.date >= buyDate);
  const upTo = firstOnOrAfter === -1 ? candles : candles.slice(0, firstOnOrAfter + 1);
  const window = adjustCloses(
    upTo.filter((c) => c.date >= from),
    actions,
  ).filter((c) => c.date < buyDate);

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

/**
 * 一句話結論，例如「你買在近 1 年的高檔，買入價高於 85% 的交易日」。
 * 只陳述事實：P2-09 規定不得出現「建議」「應該」「買進」「賣出」（單元測試會掃）。
 */
export function buyPositionSentence(position: BuyPosition, period: number): string {
  if (position.kind === "insufficient") return "資料不足，無法判斷";
  const span = position.listedMonths ? "上市以來" : `近 ${periodLabel(period)}`;
  return `你買在${span}的${LEVEL_LABEL[position.level]}，買入價高於 ${position.percent}% 的交易日`;
}

/** 上市未滿所選期間時的註明，其他情況回 null */
export function listingNote(position: BuyPosition, period: number): string | null {
  if (position.kind !== "ok" || !position.listedMonths) return null;
  return `上市未滿 ${periodLabel(period)}，以上市以來 ${position.listedMonths} 個月計算`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;
}
