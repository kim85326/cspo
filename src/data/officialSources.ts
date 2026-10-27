import { localIsoDate } from "@/domain/buyDate";
import type { DividendEvent, Market } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import type { CorporateActionSource } from "./CorporateActionSource";
import { PriceLoadError } from "./PriceSource";
import { tpexExRightRequestUrl } from "./tpexEndpoint";
import { parseTpexExRights } from "./tpexExRightParse";
import { twseExRightDetailRequestUrl, twseExRightRequestUrl } from "./twseEndpoint";
import { parseTwseExRightDetail, parseTwseExRights } from "./twseExRightParse";

/**
 * 查某檔是上市還是上櫃。查不到（或股票清單載入失敗）回 undefined，
 * 官方來源就兩個市場都問（先證交所、沒資料再櫃買中心）。
 */
export type MarketOf = (symbol: string) => Promise<Market | undefined>;

async function safeMarketOf(marketOf: MarketOf, symbol: string): Promise<Market | undefined> {
  try {
    return await marketOf(symbol);
  } catch {
    return undefined;
  }
}

/**
 * 官方日 K：上市走證交所、上櫃走櫃買中心（都是一個月一個請求）。FinMind 拿不到時的備援。
 */
export function createOfficialCandleSource(deps: {
  twse: CandleSource;
  tpex: CandleSource;
  marketOf: MarketOf;
}): CandleSource {
  return {
    async getDailyCandles(symbol, months) {
      const market = await safeMarketOf(deps.marketOf, symbol);
      if (market === "TWSE") return deps.twse.getDailyCandles(symbol, months);
      if (market === "TPEx") return deps.tpex.getDailyCandles(symbol, months);
      const listed = await deps.twse.getDailyCandles(symbol, months);
      return listed.length > 0 ? listed : deps.tpex.getDailyCandles(symbol, months);
    },
  };
}

/** 今年的除權息表還會增加，6 小時內不重抓；往年的抓過就不再抓 */
export const CURRENT_YEAR_TTL_MS = 6 * 60 * 60 * 1000;

type ActionOptions = {
  marketOf: MarketOf;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** 本地時區的今天（ISO），決定「今年」與查詢的結束日 */
  today?: () => string;
  twseUrlFor?: (start: string, end: string) => string;
  twseDetailUrlFor?: (symbol: string, exDate: string) => string;
  tpexUrlFor?: (start: string, end: string) => string;
};

type YearEntry = { events: DividendEvent[]; fetchedAt: number };

/**
 * 官方除權息：證交所 TWT49U、櫃買中心 exDailyQ。FinMind 拿不到時的備援。
 * - 以「市場 × 年」為單位一次抓全市場（一年一個請求），記在記憶體，再依代號篩。
 * - 證交所有除權（配股）的那幾次，現金與配股混在一起，要再打 TWT49UDetail 拆開（一次一個請求，很少見）。
 * - 限制：沒有發放日（payDate 是 null）、沒有分割、只有已經除權息的事件（沒有預告）。
 */
export function createOfficialActionSource(options: ActionOptions): CorporateActionSource {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const today = options.today ?? (() => localIsoDate(new Date()));
  const twseUrlFor = options.twseUrlFor ?? twseExRightRequestUrl;
  const twseDetailUrlFor = options.twseDetailUrlFor ?? twseExRightDetailRequestUrl;
  const tpexUrlFor = options.tpexUrlFor ?? tpexExRightRequestUrl;
  const years = new Map<string, YearEntry>();
  const details = new Map<string, { cashPerShare: number; stockPerThousand: number }>();

  async function getJson(url: string, sourceName: string): Promise<unknown> {
    try {
      const response = await fetchFn(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new PriceLoadError(`${sourceName}回應 HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof PriceLoadError) throw error;
      throw new PriceLoadError("除權息資料載入失敗", { cause: error });
    }
  }

  async function twseDetail(symbol: string, exDate: string) {
    const key = `${symbol}:${exDate}`;
    const cached = details.get(key);
    if (cached) return cached;
    const detail = parseTwseExRightDetail(await getJson(twseDetailUrlFor(symbol, exDate), "證交所"));
    if (!detail) throw new PriceLoadError(`證交所除權息明細格式不對：${symbol} ${exDate}`);
    details.set(key, detail);
    return detail;
  }

  async function yearEvents(market: Market, year: number): Promise<DividendEvent[]> {
    const thisYear = Number(today().slice(0, 4));
    if (year > thisYear) return [];
    const key = `${market}:${year}`;
    const cached = years.get(key);
    if (cached && (year < thisYear || now() - cached.fetchedAt < CURRENT_YEAR_TTL_MS)) return cached.events;

    const start = `${year}-01-01`;
    const end = year < thisYear ? `${year}-12-31` : today();
    let events: DividendEvent[];
    if (market === "TPEx") {
      events = parseTpexExRights(await getJson(tpexUrlFor(start, end), "櫃買中心"));
    } else {
      events = parseTwseExRights(await getJson(twseUrlFor(start, end), "證交所")).map((row) => ({
        kind: "dividend",
        symbol: row.symbol,
        exDate: row.exDate,
        // 只除息：權值+息值就是現金股利；有配股的等用到時再查明細（見 getActions）
        cashPerShare: row.hasStockDividend ? null : row.value,
        stockPerThousand: 0,
        payDate: null,
        closeBefore: row.closeBefore,
        referencePrice: row.referencePrice,
      }));
    }
    years.set(key, { events, fetchedAt: now() });
    return events;
  }

  async function marketEvents(market: Market, symbol: string, from: string, to: string) {
    const found: DividendEvent[] = [];
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
      for (const event of await yearEvents(market, year)) {
        if (event.symbol === symbol && event.exDate >= from && event.exDate <= to) found.push(event);
      }
    }
    return found;
  }

  return {
    async getActions(symbol, from, to) {
      const market = await safeMarketOf(options.marketOf, symbol);
      let events: DividendEvent[];
      if (market) {
        events = await marketEvents(market, symbol, from, to);
      } else {
        events = await marketEvents("TWSE", symbol, from, to);
        if (events.length === 0) events = await marketEvents("TPEx", symbol, from, to);
      }

      const resolved: DividendEvent[] = [];
      for (const event of events) {
        // 證交所的除權（配股）事件：查明細拆出現金與配股（同一個 app 生命週期內只查一次）
        if (event.cashPerShare === null) {
          resolved.push({ ...event, ...(await twseDetail(symbol, event.exDate)) });
        } else {
          resolved.push(event);
        }
      }
      return resolved.sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));
    },
  };
}
