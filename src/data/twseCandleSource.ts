import type { Candle } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import { PriceLoadError } from "./PriceSource";
import { twseDayRequestUrl } from "./twseEndpoint";
import { parseTwseDayCandles } from "./twseDayParse";

/** 這個月還在交易，資料會變；5 分鐘內不重抓 */
export const CURRENT_MONTH_TTL_MS = 5 * 60 * 1000;

type Options = {
  fetchFn?: typeof fetch;
  now?: () => number;
  /** 測試用：決定哪個月算「本月」（"2026-10"） */
  currentMonth?: () => string;
  urlFor?: (symbol: string, month: string) => string;
};

type Entry = { candles: Candle[]; fetchedAt: number };

/**
 * 證交所日 K 來源。
 * - 一個月一個請求，依序抓（不並行），避免被證交所擋。
 * - 過去的月份資料不會再變，抓過就一直用快取；本月 5 分鐘內不重抓。
 * - 任一個月抓失敗：丟 PriceLoadError（已抓到的月份留在快取，下次重試只補缺的）。
 */
export function createTwseCandleSource(options: Options = {}): CandleSource {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const currentMonth = options.currentMonth ?? (() => isoMonth(new Date()));
  const urlFor = options.urlFor ?? twseDayRequestUrl;
  const cache = new Map<string, Entry>();

  async function fetchMonth(symbol: string, month: string): Promise<Candle[]> {
    const key = `${symbol}:${month}`;
    const cached = cache.get(key);
    const fresh =
      cached && (month < currentMonth() || now() - cached.fetchedAt < CURRENT_MONTH_TTL_MS);
    if (cached && fresh) return cached.candles;

    let body: unknown;
    try {
      const response = await fetchFn(urlFor(symbol, month), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new PriceLoadError(`證交所回應 HTTP ${response.status}`);
      body = await response.json();
    } catch (error) {
      if (error instanceof PriceLoadError) throw error;
      throw new PriceLoadError("K 線載入失敗", { cause: error });
    }
    const candles = parseTwseDayCandles(body);
    cache.set(key, { candles, fetchedAt: now() });
    return candles;
  }

  return {
    async getDailyCandles(symbol, months) {
      const all: Candle[] = [];
      for (const month of months) {
        all.push(...(await fetchMonth(symbol, month)));
      }
      return all;
    },
  };
}

function isoMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** 全 app 共用（src/data/index.ts 決定要不要用它） */
export const twseCandleSource = createTwseCandleSource();
