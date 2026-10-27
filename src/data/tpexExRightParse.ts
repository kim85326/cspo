import type { DividendEvent } from "@/domain/types";
import { parseRocSlashDate } from "./twseDayParse";
import { parseAmount } from "./twseExRightParse";
import { parseTwsePrice } from "./twseParse";

/**
 * 櫃買中心 exDailyQ（除權除息計算結果）：{ tables: [{ data: [[…], …] }] }，每列欄位：
 * 0 除權息日期 "114/12/31"、1 代號、3 除權息前收盤價、4 除權息參考價、13 現金股利、14 每仟股無償配股、…
 * 比證交所好用：現金與配股分開給。沒有發放日。範例見 src/data/__fixtures__/tpexExDailyQ.json。
 */
const COL = { date: 0, symbol: 1, closeBefore: 3, reference: 4, cash: 13, stock: 14 } as const;

/** 回應 → DividendEvent[]（全市場）。純函式；格式不對回空陣列，欄位壞掉的列略過 */
export function parseTpexExRights(body: unknown): DividendEvent[] {
  const rows = ((body ?? {}) as { tables?: { data?: unknown }[] }).tables?.[0]?.data;
  if (!Array.isArray(rows)) return [];

  const events: DividendEvent[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const exDate = parseRocSlashDate(row[COL.date]);
    const symbol = typeof row[COL.symbol] === "string" ? row[COL.symbol].trim() : "";
    const closeBefore = parseTwsePrice(row[COL.closeBefore]);
    const referencePrice = parseTwsePrice(row[COL.reference]);
    const cash = parseAmount(row[COL.cash]);
    const stock = parseAmount(row[COL.stock]);
    if (!exDate || !symbol || closeBefore === null || referencePrice === null || cash === null || stock === null) {
      continue;
    }
    events.push({
      kind: "dividend",
      symbol,
      exDate,
      cashPerShare: cash,
      stockPerThousand: stock,
      payDate: null,
      closeBefore,
      referencePrice,
    });
  }
  return events;
}
