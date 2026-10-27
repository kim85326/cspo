import type { Candle } from "@/domain/types";
import { parseTwsePrice } from "./twseParse";

/**
 * 證交所 `afterTrading/STOCK_DAY`（個股日成交資訊，一次一個月）的回應。
 * data 每列：日期（民國 "115/10/01"）、成交股數、成交金額、開盤價、最高價、最低價、收盤價、漲跌價差、成交筆數、註記。
 * 沒資料時 stat 不是 "OK"（例如「很抱歉，沒有符合條件的資料!」「查詢日期大於今日，請重新查詢!」）。
 */
type TwseDayResponse = {
  stat?: string;
  data?: unknown;
};

const COL = { date: 0, open: 3, high: 4, low: 5, close: 6 } as const;

/**
 * 回應 → Candle[]（依日期由舊到新）。純函式，不碰網路。
 * - stat 不是 OK、或格式不對 → 空陣列（這個月沒資料，不算錯誤）。
 * - 當天沒成交（價格是 "--"）的列略過。
 */
export function parseTwseDayCandles(body: unknown): Candle[] {
  const response = (body ?? {}) as TwseDayResponse;
  if (response.stat !== "OK" || !Array.isArray(response.data)) return [];

  const candles: Candle[] = [];
  for (const row of response.data) {
    if (!Array.isArray(row)) continue;
    const date = parseRocSlashDate(row[COL.date]);
    const open = parseTwsePrice(row[COL.open]);
    const high = parseTwsePrice(row[COL.high]);
    const low = parseTwsePrice(row[COL.low]);
    const close = parseTwsePrice(row[COL.close]);
    if (!date || open === null || high === null || low === null || close === null) continue;
    candles.push({ date, open, high, low, close });
  }
  return candles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 民國年 "115/10/01" → "2026-10-01"。格式不對回 undefined。 */
export function parseRocSlashDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^(\d{2,3})\/(\d{2})\/(\d{2})$/.exec(raw.trim());
  if (!match) return undefined;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}
