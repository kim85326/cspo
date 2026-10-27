import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Candle, CorporateAction } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import { type CorporateActionSource, actionDate } from "./CorporateActionSource";
import { isoMonth } from "./monthlyCandleSource";
import { PriceLoadError } from "./PriceSource";

/**
 * 歷史資料的本機快取（AsyncStorage），兩個目的：
 * 1. 省 FinMind 額度：不帶 token 每個 IP 每小時 300 次，Tech Day 現場同一個 Wi-Fi 大家共用。
 * 2. 增量更新：已經收盤的日子不會再變，抓過就不再抓，之後只補新的。
 *
 * 讀寫壞掉（JSON 壞了、容量滿了）一律當成沒快取，不讓 app crash。
 */

/** 只用到 AsyncStorage 的這兩個方法；測試可以換成假的 */
export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/** 日 K 快取 key 前綴，後面接代號。格式若有不相容的改動就升 v2 */
export const CANDLE_CACHE_PREFIX = "cspo.candles.v1.";
/** 除權息快取 key 前綴，後面接代號 */
export const ACTION_CACHE_PREFIX = "cspo.actions.v1.";
/** 本月的日 K 還會增加：30 分鐘內不重抓（收盤價一天只變一次，不用像現價那樣 5 分鐘） */
export const CURRENT_MONTH_CACHE_TTL_MS = 30 * 60 * 1000;
/** 除權息會有新公告：12 小時內不重抓 */
export const ACTION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type MonthEntry = {
  candles: Candle[];
  fetchedAt: number;
  /** 抓的時候這個月已經過完 → 資料不會再變，永遠不重抓 */
  final: boolean;
};
type StoredCandles = Record<string, MonthEntry>;

type CacheOptions = {
  storage?: KeyValueStorage;
  now?: () => number;
};

/**
 * 日 K 加上本機快取。
 * - 只把「沒快取過」與「本月且超過 30 分鐘」的月份交給 inner 抓（FinMind 這些月份合成一個請求）。
 * - inner 失敗：要的月份都有舊資料就先用舊的；有月份從沒抓過才丟 PriceLoadError。
 * - 同一檔同時進來的請求排隊，避免重複打網路、互相蓋掉快取。
 */
export function createCachedCandleSource(
  inner: CandleSource,
  options: CacheOptions & { currentMonth?: () => string; ttlMs?: number } = {},
): CandleSource {
  const storage = options.storage ?? AsyncStorage;
  const now = options.now ?? (() => Date.now());
  const currentMonth = options.currentMonth ?? (() => isoMonth(new Date()));
  const ttlMs = options.ttlMs ?? CURRENT_MONTH_CACHE_TTL_MS;
  const lock = createLock();

  return {
    getDailyCandles(symbol, months) {
      return lock(symbol, async () => {
        const key = CANDLE_CACHE_PREFIX + symbol;
        const stored = (await readJson<StoredCandles>(storage, key, isStoredCandles)) ?? {};
        const missing = months.filter((m) => {
          const entry = stored[m];
          return !entry || (!entry.final && now() - entry.fetchedAt >= ttlMs);
        });

        if (missing.length > 0) {
          try {
            const fetched = await inner.getDailyCandles(symbol, missing);
            const fetchedAt = now();
            const thisMonth = currentMonth();
            for (const month of missing) {
              stored[month] = {
                candles: fetched.filter((c) => c.date.startsWith(month)),
                fetchedAt,
                final: month < thisMonth,
              };
            }
            await writeJson(storage, key, stored);
          } catch (error) {
            if (!(error instanceof PriceLoadError) || missing.some((m) => !stored[m])) throw error;
            // 都有舊資料：先用舊的
          }
        }
        return months.flatMap((m) => stored[m]?.candles ?? []);
      });
    },
  };
}

type StoredActions = {
  from: string;
  to: string;
  fetchedAt: number;
  actions: CorporateAction[];
};

/**
 * 除權息加上本機快取：12 小時內、而且快取的期間涵蓋這次要的期間，就不打網路。
 * 要重抓時，期間取「這次要的」與「快取的」聯集，一次抓齊。
 * inner 失敗：快取涵蓋這次的期間就先用舊的，否則丟 PriceLoadError。
 */
export function createCachedActionSource(
  inner: CorporateActionSource,
  options: CacheOptions & { ttlMs?: number } = {},
): CorporateActionSource {
  const storage = options.storage ?? AsyncStorage;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? ACTION_CACHE_TTL_MS;
  const lock = createLock();

  return {
    getActions(symbol, from, to) {
      return lock(symbol, async () => {
        const key = ACTION_CACHE_PREFIX + symbol;
        const stored = await readJson<StoredActions>(storage, key, isStoredActions);
        const covers = stored !== null && stored.from <= from && stored.to >= to;
        const pick = (actions: CorporateAction[]) =>
          actions.filter((a) => actionDate(a) >= from && actionDate(a) <= to);

        if (stored && covers && now() - stored.fetchedAt < ttlMs) return pick(stored.actions);

        const range = stored
          ? { from: stored.from < from ? stored.from : from, to: stored.to > to ? stored.to : to }
          : { from, to };
        try {
          const actions = await inner.getActions(symbol, range.from, range.to);
          await writeJson(storage, key, { ...range, fetchedAt: now(), actions });
          return pick(actions);
        } catch (error) {
          if (error instanceof PriceLoadError && stored && covers) return pick(stored.actions);
          throw error;
        }
      });
    },
  };
}

/** 同一個 key 的工作排隊做，前一個失敗不影響下一個 */
function createLock() {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    tails.set(key, next);
    void next.finally(() => {
      if (tails.get(key) === next) tails.delete(key);
    }).catch(() => undefined);
    return next;
  };
}

async function readJson<T>(storage: KeyValueStorage, key: string, isValid: (v: unknown) => v is T): Promise<T | null> {
  try {
    const raw = await storage.getItem(key);
    if (raw == null) return null;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeJson(storage: KeyValueStorage, key: string, value: unknown): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch {
    // 寫不進去（例如容量滿了）：這次的資料照樣回傳，下次再抓
  }
}

function isStoredCandles(value: unknown): value is StoredCandles {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      Array.isArray((entry as MonthEntry).candles) &&
      typeof (entry as MonthEntry).fetchedAt === "number" &&
      typeof (entry as MonthEntry).final === "boolean",
  );
}

function isStoredActions(value: unknown): value is StoredActions {
  if (typeof value !== "object" || value === null) return false;
  const v = value as StoredActions;
  return (
    typeof v.from === "string" &&
    typeof v.to === "string" &&
    typeof v.fetchedAt === "number" &&
    Array.isArray(v.actions)
  );
}
