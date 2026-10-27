import type { Quote } from "@/domain/types";
import { formatTwseDate, parseTwsePrice } from "./twseParse";

/**
 * 櫃買中心 OpenAPI `tpex_mainboard_quotes` 一列的樣子（只列我們用到的欄位，全部是字串）。
 * 實際回應還有 Change、Open、High、Low、TradingShares 等欄位，這裡不管。
 * 真實回應範例：src/data/__fixtures__/tpexMainboardQuotes.json
 */
export type TpexRow = {
  /** 交易日，民國年：1151022 = 2026/10/22（格式同證交所） */
  Date?: string;
  /** 代號：5347、006201、00679B、8349A */
  SecuritiesCompanyCode?: string;
  CompanyName?: string;
  /** 收盤價字串。沒成交時是 "----" */
  Close?: string;
};

/**
 * 把櫃買中心回應轉成 Quote[]。純函式，不碰網路。規則同 parseTwseRows：
 * - 回應不是陣列 → 空陣列。
 * - 代號或名稱空白、收盤價解析不出來（"----"、空字串）的列丟掉，所以當天沒成交的股票查不到現價。
 * - 同一代號出現多次只留第一筆。
 */
export function parseTpexRows(rows: unknown): Quote[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const quotes: Quote[] = [];
  for (const row of rows as TpexRow[]) {
    if (!row || typeof row !== "object") continue;
    const symbol = typeof row.SecuritiesCompanyCode === "string" ? row.SecuritiesCompanyCode.trim() : "";
    const name = typeof row.CompanyName === "string" ? row.CompanyName.trim() : "";
    const price = parseTwsePrice(row.Close);
    if (symbol === "" || name === "" || price === null || seen.has(symbol)) continue;
    seen.add(symbol);
    const asOf = formatTwseDate(row.Date);
    quotes.push(asOf ? { symbol, name, price, asOf } : { symbol, name, price });
  }
  return quotes;
}
