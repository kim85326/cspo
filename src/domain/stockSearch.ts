import type { StockInfo } from "./types";

/** 全形數字與空白正規化，讓「２３３０」「 台積電 」也能找到 */
export function normalizeQuery(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * 依使用者輸入找候選股票。
 * - 空字串：回前 limit 檔（當作熱門清單讓人直接選）
 * - 代號（數字，尾端可帶一個英文字母，例如 00631L）：代號開頭符合
 * - 其他：名稱包含
 * 排序：完全相同 > 開頭相同 > 包含。
 */
export function searchStocks(query: string, stocks: StockInfo[], limit = 8): StockInfo[] {
  const q = normalizeQuery(query);
  if (q === "") return stocks.slice(0, limit);

  // 數字開頭、最多尾端一個英文字母（00631l）就當代號查；q 已轉小寫
  const isSymbolQuery = /^\d+[a-z]?$/.test(q);
  const scored: { stock: StockInfo; score: number }[] = [];

  for (const stock of stocks) {
    const symbol = stock.symbol.toLowerCase();
    const name = stock.name.toLowerCase();
    let score = 0;
    if (isSymbolQuery) {
      if (symbol === q) score = 3;
      else if (symbol.startsWith(q)) score = 2;
    } else {
      if (name === q) score = 3;
      else if (name.startsWith(q)) score = 2;
      else if (name.includes(q)) score = 1;
    }
    if (score > 0) scored.push({ stock, score });
  }

  scored.sort((a, b) => b.score - a.score || a.stock.symbol.localeCompare(b.stock.symbol));
  return scored.slice(0, limit).map((s) => s.stock);
}

/**
 * 把使用者輸入解析成唯一一檔股票。
 * 代號或名稱完全相同 → 命中；否則候選剛好一檔也算命中；其他情況回 null，請使用者從清單選。
 */
export function resolveStock(query: string, stocks: StockInfo[]): StockInfo | null {
  const q = normalizeQuery(query);
  if (q === "") return null;

  const exact = stocks.find(
    (s) => s.symbol.toLowerCase() === q || s.name.toLowerCase() === q,
  );
  if (exact) return exact;

  const candidates = searchStocks(query, stocks, 2);
  return candidates.length === 1 ? candidates[0] : null;
}

/** 顯示用：台積電（2330） */
export function formatStockLabel(stock: StockInfo): string {
  return `${stock.name}（${stock.symbol}）`;
}
