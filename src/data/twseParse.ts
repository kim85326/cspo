import type { Quote } from "@/domain/types";

/**
 * 證交所 OpenAPI `exchangeReport/STOCK_DAY_ALL` 一列的樣子（只列我們用到的欄位，全部是字串）。
 * 實際回應還有 TradeVolume、OpeningPrice、Change 等欄位，這裡不管。
 */
export type TwseRow = {
  /** 交易日，民國年：1151022 = 2026/10/22 */
  Date?: string;
  /** 代號：2330、0050、00878、00625K */
  Code?: string;
  Name?: string;
  /** 收盤價字串。沒成交或停牌時是空字串或 "--"；理論上可能帶千分位逗號 */
  ClosingPrice?: string;
};

/**
 * 把收盤價字串轉成數字。空字串、"--"、不是數字 → null。
 * 會先拿掉千分位逗號與前後空白。
 */
export function parseTwsePrice(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "--") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 民國年日期 "1151022" → "2026/10/22"。格式不對回 undefined。 */
export function formatTwseDate(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  const match = /^(\d{2,3})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!match) return undefined;
  const year = Number(match[1]) + 1911;
  return `${year}/${match[2]}/${match[3]}`;
}

/**
 * 把證交所回應轉成 Quote[]。純函式，不碰網路。
 * - 回應不是陣列 → 空陣列。
 * - 代號或名稱空白、收盤價解析不出來（"--"、空字串）的列會被丟掉，
 *   所以停牌／無成交的股票不會出現在清單裡，也查不到現價。
 * - 同一代號出現多次只留第一筆。
 */
export function parseTwseRows(rows: unknown): Quote[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const quotes: Quote[] = [];
  for (const row of rows as TwseRow[]) {
    if (!row || typeof row !== "object") continue;
    const symbol = typeof row.Code === "string" ? row.Code.trim() : "";
    const name = typeof row.Name === "string" ? row.Name.trim() : "";
    const price = parseTwsePrice(row.ClosingPrice);
    if (symbol === "" || name === "" || price === null || seen.has(symbol)) continue;
    seen.add(symbol);
    const asOf = formatTwseDate(row.Date);
    quotes.push(asOf ? { symbol, name, price, asOf } : { symbol, name, price });
  }
  return quotes;
}
