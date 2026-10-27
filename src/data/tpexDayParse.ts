import type { Candle } from "@/domain/types";
import { parseRocSlashDate } from "./twseDayParse";
import { parseTwsePrice } from "./twseParse";

/**
 * 櫃買中心 `afterTrading/tradingStock`（個股日成交資訊，一次一個月）的回應：
 * { tables: [{ data: [["115/10/01", 成交仟股, 成交仟元, 開盤, 最高, 最低, 收盤, 漲跌, 筆數], …] }] }
 * 價格是帶千分位的字串（"1,055.00"），沒成交是 "----"。
 * 上市股票（例如 2330）不會報錯，data 是空陣列。範例見 src/data/__fixtures__/tpexTradingStock6488.json。
 */
type TpexDayResponse = { tables?: { data?: unknown }[] };

const COL = { date: 0, open: 3, high: 4, low: 5, close: 6 } as const;

/** 回應 → Candle[]（依日期由舊到新）。純函式；格式不對或沒資料回空陣列，沒成交的列略過。 */
export function parseTpexDayCandles(body: unknown): Candle[] {
  const rows = ((body ?? {}) as TpexDayResponse).tables?.[0]?.data;
  if (!Array.isArray(rows)) return [];

  const candles: Candle[] = [];
  for (const row of rows) {
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
