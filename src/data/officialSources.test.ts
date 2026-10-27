import type { Candle, Market } from "@/domain/types";
import exDailyQ from "./__fixtures__/tpexExDailyQ.json";
import twt49u from "./__fixtures__/twseTwt49u202507.json";
import detail2884 from "./__fixtures__/twseTwt49uDetail2884.json";
import type { CandleSource } from "./CandleSource";
import { CURRENT_YEAR_TTL_MS, createOfficialActionSource, createOfficialCandleSource } from "./officialSources";
import { PriceLoadError } from "./PriceSource";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function candleSourceWith(candles: Candle[]) {
  return { getDailyCandles: jest.fn(async () => candles) } satisfies CandleSource;
}

const CANDLE: Candle = { date: "2026-10-01", open: 1, high: 1, low: 1, close: 1 };

describe("createOfficialCandleSource", () => {
  test("上市問證交所、上櫃問櫃買中心", async () => {
    const twse = candleSourceWith([CANDLE]);
    const tpex = candleSourceWith([CANDLE]);
    const markets: Record<string, Market> = { "2330": "TWSE", "6488": "TPEx" };
    const source = createOfficialCandleSource({ twse, tpex, marketOf: async (s) => markets[s] });

    await source.getDailyCandles("2330", ["2026-10"]);
    await source.getDailyCandles("6488", ["2026-10"]);
    expect(twse.getDailyCandles.mock.calls).toEqual([["2330", ["2026-10"]]]);
    expect(tpex.getDailyCandles.mock.calls).toEqual([["6488", ["2026-10"]]]);
  });

  test("不知道市場（清單載入失敗）：先問證交所，沒資料再問櫃買中心", async () => {
    const twse = candleSourceWith([]);
    const tpex = candleSourceWith([CANDLE]);
    const source = createOfficialCandleSource({
      twse,
      tpex,
      marketOf: async () => {
        throw new PriceLoadError();
      },
    });
    await expect(source.getDailyCandles("6488", ["2026-10"])).resolves.toEqual([CANDLE]);
    expect(twse.getDailyCandles).toHaveBeenCalled();
  });
});

describe("createOfficialActionSource", () => {
  function setup(market: Market | undefined, today = "2025-10-27") {
    let clock = 1_000_000;
    const fetchFn = jest.fn(async (url: string) => {
      if (url.startsWith("twse://detail")) return jsonResponse(detail2884);
      if (url.startsWith("twse://2025")) return jsonResponse(twt49u);
      if (url.startsWith("tpex://2025")) return jsonResponse(exDailyQ);
      if (url.startsWith("twse://")) return jsonResponse({ stat: "很抱歉，沒有符合條件的資料!" });
      return jsonResponse({ tables: [{ data: [] }] });
    });
    const source = createOfficialActionSource({
      marketOf: async () => market,
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => clock,
      today: () => today,
      twseUrlFor: (start, end) => `twse://${start}~${end}`,
      twseDetailUrlFor: (symbol, exDate) => `twse://detail/${symbol}/${exDate}`,
      tpexUrlFor: (start, end) => `tpex://${start}~${end}`,
    });
    return { source, fetchFn, urls: () => fetchFn.mock.calls.map((c) => c[0]), advance: (ms: number) => (clock += ms) };
  }

  test("上市只除息：權值+息值就是現金，帶前收與參考價、沒有發放日", async () => {
    const { source, urls } = setup("TWSE");
    await expect(source.getActions("0050", "2025-01-01", "2025-12-31")).resolves.toEqual([
      {
        kind: "dividend",
        symbol: "0050",
        exDate: "2025-07-21",
        cashPerShare: 0.36,
        stockPerThousand: 0,
        payDate: null,
        closeBefore: 51.45,
        referencePrice: 51.09,
      },
    ]);
    // 今年只查到今天
    expect(urls()).toEqual(["twse://2025-01-01~2025-10-27"]);
  });

  test("上市有配股：再查一次明細，拆出現金與每千股配股", async () => {
    const { source, urls } = setup("TWSE");
    const [event] = await source.getActions("2884", "2025-07-01", "2025-07-31");
    expect(event).toMatchObject({ exDate: "2025-07-22", cashPerShare: 1.2, stockPerThousand: 10, closeBefore: 34.2 });
    expect(urls()).toContain("twse://detail/2884/2025-07-22");
  });

  test("上櫃問櫃買中心", async () => {
    const { source, urls } = setup("TPEx");
    const events = await source.getActions("6488", "2025-01-01", "2025-12-31");
    expect(events).toEqual([expect.objectContaining({ exDate: "2025-12-31", cashPerShare: 2 })]);
    expect(urls()).toEqual(["tpex://2025-01-01~2025-10-27"]);
  });

  test("一年一個請求、跨年分開抓；往年抓過不再抓，今年 6 小時後重抓", async () => {
    const { source, urls, advance } = setup("TWSE", "2026-03-01");
    await source.getActions("0050", "2025-01-01", "2026-03-01");
    expect(urls()).toEqual(["twse://2025-01-01~2025-12-31", "twse://2026-01-01~2026-03-01"]);

    await source.getActions("2330", "2025-01-01", "2026-03-01");
    expect(urls()).toHaveLength(2);

    advance(CURRENT_YEAR_TTL_MS);
    await source.getActions("0050", "2025-01-01", "2026-03-01");
    expect(urls()).toHaveLength(3);
    expect(urls()[2]).toBe("twse://2026-01-01~2026-03-01");
  });

  test("不知道市場：先問證交所，沒有再問櫃買中心", async () => {
    const { source, urls } = setup(undefined);
    const events = await source.getActions("6488", "2025-01-01", "2025-12-31");
    expect(events).toHaveLength(1);
    expect(urls()).toEqual(["twse://2025-01-01~2025-10-27", "tpex://2025-01-01~2025-10-27"]);
  });

  test("未來的年份不打網路；HTTP 錯誤丟 PriceLoadError", async () => {
    const { source, fetchFn } = setup("TWSE");
    await expect(source.getActions("0050", "2026-01-01", "2026-12-31")).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();

    fetchFn.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(source.getActions("0050", "2025-01-01", "2025-12-31")).rejects.toBeInstanceOf(PriceLoadError);
  });
});
