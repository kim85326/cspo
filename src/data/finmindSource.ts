import type { CandleSource } from "./CandleSource";
import { type CorporateActionSource, actionDate, sortActions } from "./CorporateActionSource";
import { FINMIND_DATA_URL, type FinmindDataset, finmindUrl } from "./finmindEndpoint";
import {
  finmindMessage,
  finmindRows,
  parseFinmindCandles,
  parseFinmindDividends,
  parseFinmindSplits,
} from "./finmindParse";
import { PriceLoadError } from "./PriceSource";

type Options = {
  fetchFn?: typeof fetch;
  baseUrl?: string;
};

/**
 * FinMind 來源：同時是 CandleSource（日 K）與 CorporateActionSource（除權息、分割）。
 * - 日 K：不管要幾個月，一檔只打一個請求（start_date～end_date），上市、上櫃、ETF 都有。
 * - 除權息：TaiwanStockDividend + TaiwanStockSplitPrice 兩個請求。
 * - 不快取：快取在外層（cachedCandleSource、cachedActionSource），這裡每次呼叫都打網路。
 * - HTTP 錯誤、超過次數上限（status 不是 200）、斷網：丟 PriceLoadError，外層據此退回官方來源。
 */
export function createFinmindSource(options: Options = {}): CandleSource & CorporateActionSource {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? FINMIND_DATA_URL;

  async function rows(dataset: FinmindDataset, params: { symbol: string; start: string; end?: string }) {
    let body: unknown;
    try {
      const response = await fetchFn(finmindUrl(dataset, params, baseUrl), {
        headers: { Accept: "application/json" },
      });
      // 超過次數上限時 FinMind 回 402，body 也是 JSON；先讀 body 拿訊息
      body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new PriceLoadError(`FinMind 回應 HTTP ${response.status}：${finmindMessage(body)}`);
      }
    } catch (error) {
      if (error instanceof PriceLoadError) throw error;
      throw new PriceLoadError("FinMind 載入失敗", { cause: error });
    }
    const data = finmindRows(body);
    if (data === null) throw new PriceLoadError(`FinMind：${finmindMessage(body)}`);
    return data;
  }

  return {
    async getDailyCandles(symbol, months) {
      if (months.length === 0) return [];
      const wanted = new Set(months);
      const data = await rows("TaiwanStockPrice", {
        symbol,
        start: `${months[0]}-01`,
        end: lastDayOfMonth(months[months.length - 1]),
      });
      return parseFinmindCandles(data).filter((c) => wanted.has(c.date.slice(0, 7)));
    },

    async getActions(symbol, from, to) {
      // TaiwanStockDividend 的 start_date 篩的是公告日，不是除息日；公告可能晚於除息日，往前多抓一年再自己篩
      const dividends = parseFinmindDividends(
        await rows("TaiwanStockDividend", { symbol, start: shiftYears(from, -1) }),
        symbol,
      );
      const splits = parseFinmindSplits(await rows("TaiwanStockSplitPrice", { symbol, start: from }), symbol);
      return sortActions([...dividends, ...splits]).filter((a) => {
        const date = actionDate(a);
        return date >= from && date <= to;
      });
    },
  };
}

/** "2026-02" → "2026-02-28" */
function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** "2026-03-15" 往前一年 → "2025-03-15"（只動年份，2/29 這種邊界多抓一天沒關係） */
function shiftYears(iso: string, years: number): string {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

/** 全 app 共用（src/data/index.ts 決定要不要用它） */
export const finmindSource = createFinmindSource();
