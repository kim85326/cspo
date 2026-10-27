import type { Quote, StockInfo } from "@/domain/types";
import { PriceLoadError, type PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";
import { STOCKS } from "./stocks";
import { twseRequestUrl } from "./twseEndpoint";
import { parseTwseRows } from "./twseParse";

/** 收盤價一天只變一次，5 分鐘內重複查不用再打證交所 */
export const TWSE_CACHE_TTL_MS = 5 * 60 * 1000;

/** 選擇器空白時的「熱門股票」順序：沿用第一迭代那 40 檔的順序，台積電第一 */
const HOT_SYMBOLS: readonly string[] = STOCKS.map((s) => s.symbol);

type Snapshot = {
  quotes: Map<string, Quote>;
  list: StockInfo[];
  fetchedAt: number;
};

type Options = {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  url?: string;
};

/**
 * 把全市場清單排成選擇器要的順序：熱門 40 檔在前（照 stocks.ts 的順序），其餘依代號排序。
 */
export function orderForDirectory(quotes: Iterable<Quote>): StockInfo[] {
  const bySymbol = new Map<string, StockInfo>();
  for (const q of quotes) bySymbol.set(q.symbol, { symbol: q.symbol, name: q.name });

  const hot: StockInfo[] = [];
  for (const symbol of HOT_SYMBOLS) {
    const stock = bySymbol.get(symbol);
    if (stock) {
      hot.push(stock);
      bySymbol.delete(symbol);
    }
  }
  const rest = [...bySymbol.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return [...hot, ...rest];
}

/**
 * 證交所來源：同時實作 PriceSource 與 StockDirectory，共用同一份快取。
 * - 同一個 app 生命週期內，5 分鐘內只打一次證交所；同時進來的請求共用同一個 fetch。
 * - 載入失敗：有舊快取就先用舊的，沒有就丟 PriceLoadError。下次呼叫會再試。
 * - getQuote 找不到代號（或該股今天沒成交）回 null。
 */
export function createTwseSource(options: Options = {}): PriceSource & StockDirectory {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? TWSE_CACHE_TTL_MS;
  const url = options.url ?? twseRequestUrl();

  let snapshot: Snapshot | null = null;
  let inflight: Promise<Snapshot> | null = null;

  async function fetchSnapshot(): Promise<Snapshot> {
    let body: unknown;
    try {
      const response = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new PriceLoadError(`證交所回應 HTTP ${response.status}`);
      body = await response.json();
    } catch (error) {
      if (error instanceof PriceLoadError) throw error;
      throw new PriceLoadError("行情載入失敗", { cause: error });
    }
    const quotes = parseTwseRows(body);
    if (quotes.length === 0) throw new PriceLoadError("證交所回應沒有任何行情");
    return {
      quotes: new Map(quotes.map((q) => [q.symbol, q])),
      list: orderForDirectory(quotes),
      fetchedAt: now(),
    };
  }

  async function load(): Promise<Snapshot> {
    if (snapshot && now() - snapshot.fetchedAt < ttlMs) return snapshot;
    if (!inflight) {
      inflight = fetchSnapshot()
        .then((next) => {
          snapshot = next;
          return next;
        })
        .finally(() => {
          inflight = null;
        });
    }
    try {
      return await inflight;
    } catch (error) {
      // 更新失敗但手上有舊資料：先用舊的，別讓畫面整個掛掉
      if (snapshot) return snapshot;
      throw error;
    }
  }

  return {
    async getQuote(symbol) {
      const { quotes } = await load();
      return quotes.get(symbol) ?? null;
    },
    async getAll() {
      const { list } = await load();
      return list;
    },
  };
}

/** 全 app 共用的證交所來源（src/data/index.ts 決定要不要用它） */
export const twseSource = createTwseSource();
