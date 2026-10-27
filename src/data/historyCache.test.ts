import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Candle, CorporateAction } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import type { CorporateActionSource } from "./CorporateActionSource";
import {
  ACTION_CACHE_PREFIX,
  ACTION_CACHE_TTL_MS,
  CANDLE_CACHE_PREFIX,
  CURRENT_MONTH_CACHE_TTL_MS,
  createCachedActionSource,
  createCachedCandleSource,
} from "./historyCache";
import { PriceLoadError } from "./PriceSource";

function candle(date: string, close: number): Candle {
  return { date, open: close, high: close, low: close, close };
}

/** 每個月給一根 K 棒，收盤價 = 這是第幾次被抓（看得出有沒有重抓） */
function countingInner() {
  let calls = 0;
  const inner = {
    getDailyCandles: jest.fn(async (_symbol: string, months: string[]) => {
      calls += 1;
      return months.map((m) => candle(`${m}-15`, calls));
    }),
  } satisfies CandleSource;
  return inner;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("createCachedCandleSource", () => {
  function setup(inner: CandleSource) {
    let clock = 1_000_000;
    const source = createCachedCandleSource(inner, { now: () => clock, currentMonth: () => "2026-10" });
    return { source, advance: (ms: number) => (clock += ms) };
  }

  test("第一次全部交給 inner；之後過去的月份不再抓，只補新的月份", async () => {
    const inner = countingInner();
    const { source } = setup(inner);
    await source.getDailyCandles("2330", ["2026-08", "2026-09"]);
    await source.getDailyCandles("2330", ["2026-08", "2026-09", "2026-10"]);
    expect(inner.getDailyCandles.mock.calls.map((c) => c[1])).toEqual([["2026-08", "2026-09"], ["2026-10"]]);
  });

  test("本月 30 分鐘內用快取，之後重抓；過去的月份永遠不重抓", async () => {
    const inner = countingInner();
    const { source, advance } = setup(inner);
    await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    advance(CURRENT_MONTH_CACHE_TTL_MS - 1);
    await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    expect(inner.getDailyCandles).toHaveBeenCalledTimes(1);

    advance(1);
    const result = await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    expect(inner.getDailyCandles.mock.calls[1][1]).toEqual(["2026-10"]);
    expect(result.map((c) => c.close)).toEqual([1, 2]);
  });

  test("存在 AsyncStorage：app 重開（新的 source）也不用再抓", async () => {
    const inner = countingInner();
    await setup(inner).source.getDailyCandles("2330", ["2026-09"]);
    await setup(inner).source.getDailyCandles("2330", ["2026-09"]);
    expect(inner.getDailyCandles).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(`${CANDLE_CACHE_PREFIX}2330`)).not.toBeNull();
  });

  test("沒資料的月份（例如上市前）也記下來，不會一直重抓", async () => {
    const inner = { getDailyCandles: jest.fn(async () => [] as Candle[]) };
    const { source } = setup(inner);
    await source.getDailyCandles("2330", ["2020-01"]);
    await expect(source.getDailyCandles("2330", ["2020-01"])).resolves.toEqual([]);
    expect(inner.getDailyCandles).toHaveBeenCalledTimes(1);
  });

  test("inner 失敗：要的月份都有舊資料就用舊的；有月份從沒抓過就丟 PriceLoadError", async () => {
    const inner = countingInner();
    const { source, advance } = setup(inner);
    await source.getDailyCandles("2330", ["2026-10"]);
    advance(CURRENT_MONTH_CACHE_TTL_MS);
    inner.getDailyCandles.mockRejectedValueOnce(new PriceLoadError());
    await expect(source.getDailyCandles("2330", ["2026-10"])).resolves.toEqual([candle("2026-10-15", 1)]);

    inner.getDailyCandles.mockRejectedValueOnce(new PriceLoadError());
    await expect(source.getDailyCandles("2330", ["2026-09", "2026-10"])).rejects.toBeInstanceOf(PriceLoadError);
  });

  test("同一檔同時進來：排隊，第二個直接用第一個抓到的", async () => {
    const inner = countingInner();
    const { source } = setup(inner);
    await Promise.all([
      source.getDailyCandles("2330", ["2026-09"]),
      source.getDailyCandles("2330", ["2026-09"]),
    ]);
    expect(inner.getDailyCandles).toHaveBeenCalledTimes(1);
  });

  test("快取 JSON 壞掉：當成沒快取，重抓", async () => {
    await AsyncStorage.setItem(`${CANDLE_CACHE_PREFIX}2330`, "{not json");
    const inner = countingInner();
    await expect(setup(inner).source.getDailyCandles("2330", ["2026-09"])).resolves.toHaveLength(1);
    expect(inner.getDailyCandles).toHaveBeenCalledTimes(1);
  });
});

describe("createCachedActionSource", () => {
  const DIVIDEND: CorporateAction = {
    kind: "dividend",
    symbol: "0050",
    exDate: "2026-01-22",
    cashPerShare: 1,
    stockPerThousand: 0,
    payDate: "2026-02-11",
  };
  const SPLIT: CorporateAction = { kind: "split", symbol: "0050", date: "2025-06-18", ratio: 4 };

  function setup() {
    let clock = 1_000_000;
    const inner = { getActions: jest.fn(async () => [SPLIT, DIVIDEND]) } satisfies CorporateActionSource;
    const source = createCachedActionSource(inner, { now: () => clock });
    return { source, inner, advance: (ms: number) => (clock += ms) };
  }

  test("12 小時內、期間涵蓋：不打網路，照期間篩", async () => {
    const { source, inner } = setup();
    await source.getActions("0050", "2025-01-01", "2026-10-27");
    await expect(source.getActions("0050", "2026-01-01", "2026-10-27")).resolves.toEqual([DIVIDEND]);
    expect(inner.getActions).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(`${ACTION_CACHE_PREFIX}0050`)).not.toBeNull();
  });

  test("期間超出快取：用聯集一次重抓", async () => {
    const { source, inner } = setup();
    await source.getActions("0050", "2026-01-01", "2026-10-27");
    await source.getActions("0050", "2025-01-01", "2026-06-30");
    expect(inner.getActions.mock.calls[1]).toEqual(["0050", "2025-01-01", "2026-10-27"]);
  });

  test("超過 12 小時重抓；失敗時快取涵蓋就用舊的，否則丟 PriceLoadError", async () => {
    const { source, inner, advance } = setup();
    await source.getActions("0050", "2025-01-01", "2026-10-27");
    advance(ACTION_CACHE_TTL_MS);
    inner.getActions.mockRejectedValueOnce(new PriceLoadError());
    await expect(source.getActions("0050", "2025-01-01", "2026-10-27")).resolves.toEqual([SPLIT, DIVIDEND]);
    expect(inner.getActions).toHaveBeenCalledTimes(2);

    inner.getActions.mockRejectedValueOnce(new PriceLoadError());
    await expect(source.getActions("0050", "2024-01-01", "2026-10-27")).rejects.toBeInstanceOf(PriceLoadError);
  });
});
