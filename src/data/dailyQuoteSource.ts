import { toStockInfo } from "@/domain/security";
import type { Market, Quote, StockInfo } from "@/domain/types";
import { orderForDirectory } from "./directoryOrder";
import { PriceLoadError, type PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";

/** 收盤價一天只變一次，5 分鐘內重複查不用再打交易所 */
export const DAILY_QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;

type Snapshot = {
  quotes: Map<string, Quote>;
  list: StockInfo[];
  fetchedAt: number;
};

export type DailyQuoteSourceOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  url?: string;
};

type Config = {
  market: Market;
  /** 錯誤訊息用，例如「證交所」「櫃買中心」 */
  sourceName: string;
  /** 這個平台預設要打的網址（options.url 可蓋掉） */
  defaultUrl: () => string;
  /** 回應 → Quote[]，純函式 */
  parse: (body: unknown) => Quote[];
};

/**
 * 「一次拿齊全市場收盤價」的來源（證交所、櫃買中心共用）：同時實作 PriceSource 與 StockDirectory，共用同一份快取。
 * - 同一個 app 生命週期內，5 分鐘內只打一次；同時進來的請求共用同一個 fetch。
 * - 載入失敗：有舊快取就先用舊的，沒有就丟 PriceLoadError。下次呼叫會再試。
 * - getQuote 找不到代號（或該股今天沒成交）回 null。
 */
export function createDailyQuoteSource(
  config: Config,
  options: DailyQuoteSourceOptions = {},
): PriceSource & StockDirectory {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? DAILY_QUOTE_CACHE_TTL_MS;
  const url = options.url ?? config.defaultUrl();

  let snapshot: Snapshot | null = null;
  let inflight: Promise<Snapshot> | null = null;

  async function fetchSnapshot(): Promise<Snapshot> {
    let body: unknown;
    try {
      const response = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new PriceLoadError(`${config.sourceName}回應 HTTP ${response.status}`);
      body = await response.json();
    } catch (error) {
      if (error instanceof PriceLoadError) throw error;
      throw new PriceLoadError("行情載入失敗", { cause: error });
    }
    const quotes = config.parse(body);
    if (quotes.length === 0) throw new PriceLoadError(`${config.sourceName}回應沒有任何行情`);
    return {
      quotes: new Map(quotes.map((q) => [q.symbol, q])),
      list: orderForDirectory(quotes.map((q) => toStockInfo(q, config.market))),
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
