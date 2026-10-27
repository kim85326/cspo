import { parseTwsePrice } from "./twseParse";

/**
 * 證交所 TWT49U（除權除息計算結果表）一列：
 * [資料日期 "114年07月22日", 代號, 名稱, 除權息前收盤價, 除權息參考價, 權值+息值, 權/息, …]
 * 權/息 是「息」「權」「權息」。範例見 src/data/__fixtures__/twseTwt49u202507.json。
 */
export type TwseExRightRow = {
  symbol: string;
  exDate: string;
  closeBefore: number;
  referencePrice: number;
  /** 權值+息值：只除息時就是每股現金股利 */
  value: number;
  /** 有除權（配股）時 true，要再查 TWT49UDetail 才拆得出現金與配股 */
  hasStockDividend: boolean;
};

const COL = { date: 0, symbol: 1, closeBefore: 3, reference: 4, value: 5, kind: 6 } as const;

/** 回應 → 列。純函式；stat 不是 OK 或格式不對回空陣列，欄位壞掉的列略過 */
export function parseTwseExRights(body: unknown): TwseExRightRow[] {
  const response = (body ?? {}) as { stat?: unknown; data?: unknown };
  if (response.stat !== "OK" || !Array.isArray(response.data)) return [];

  const rows: TwseExRightRow[] = [];
  for (const row of response.data) {
    if (!Array.isArray(row)) continue;
    const exDate = parseRocChineseDate(row[COL.date]);
    const symbol = typeof row[COL.symbol] === "string" ? row[COL.symbol].trim() : "";
    const closeBefore = parseTwsePrice(row[COL.closeBefore]);
    const referencePrice = parseTwsePrice(row[COL.reference]);
    const value = parseAmount(row[COL.value]);
    const kind = typeof row[COL.kind] === "string" ? row[COL.kind] : "";
    if (!exDate || !symbol || closeBefore === null || referencePrice === null || value === null) continue;
    rows.push({ symbol, exDate, closeBefore, referencePrice, value, hasStockDividend: kind.includes("權") });
  }
  return rows;
}

/**
 * TWT49UDetail（單次除權息明細）→ 每股現金、每千股配股。
 * data[0][2] 是 "1.2 元／股"，data[0][4] 是 "10 股"（A. 按普通股股東持股比例每千股無償配股）。
 * 格式不對回 null。範例見 src/data/__fixtures__/twseTwt49uDetail2884.json。
 */
export function parseTwseExRightDetail(
  body: unknown,
): { cashPerShare: number; stockPerThousand: number } | null {
  const row = ((body ?? {}) as { data?: unknown[] }).data?.[0];
  if (!Array.isArray(row)) return null;
  const cashPerShare = parseAmount(String(row[2] ?? "").replace(/元.*$/, ""));
  const stockPerThousand = parseAmount(String(row[4] ?? "").replace(/股.*$/, ""));
  if (cashPerShare === null || stockPerThousand === null) return null;
  return { cashPerShare, stockPerThousand };
}

/** 民國年 "114年07月22日" → "2025-07-22"。格式不對回 undefined。 */
export function parseRocChineseDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^(\d{2,3})年(\d{2})月(\d{2})日$/.exec(raw.trim());
  if (!match) return undefined;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}

/** 金額字串（可為 0、可帶千分位與空白）→ number；不是數字回 null */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}
