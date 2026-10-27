import { PriceLoadError } from "./PriceSource";
import { CURRENT_MONTH_TTL_MS, createTwseCandleSource } from "./twseCandleSource";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function monthBody(rocMonth: string, close: string) {
  return {
    stat: "OK",
    data: [[`${rocMonth}/01`, "1", "1", close, close, close, close, "0", "1", ""]],
  };
}

const BODIES: Record<string, unknown> = {
  "2026-09": monthBody("115/09", "100.00"),
  "2026-10": monthBody("115/10", "110.00"),
};

function setup() {
  let clock = 1_000_000;
  // 只有 2330 有資料；其他代號照證交所的樣子回「沒有符合條件的資料」
  const fetchFn = jest.fn(async (url: string) => {
    const month = /month=(\d{4}-\d{2})/.exec(url)?.[1] ?? "";
    const body = url.startsWith("test://2330?") ? BODIES[month] : undefined;
    return jsonResponse(body ?? { stat: "很抱歉，沒有符合條件的資料!" });
  });
  const source = createTwseCandleSource({
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => clock,
    currentMonth: () => "2026-10",
    urlFor: (symbol, month) => `test://${symbol}?month=${month}`,
  });
  return { source, fetchFn, advance: (ms: number) => (clock += ms) };
}

describe("createTwseCandleSource", () => {
  test("一個月一個請求、依序抓，結果依月份接起來", async () => {
    const { source, fetchFn } = setup();
    const candles = await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    expect(candles.map((c) => c.date)).toEqual(["2026-09-01", "2026-10-01"]);
    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      "test://2330?month=2026-09",
      "test://2330?month=2026-10",
    ]);
  });

  test("過去的月份抓過就不再抓；本月 5 分鐘後重抓", async () => {
    const { source, fetchFn, advance } = setup();
    await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    advance(CURRENT_MONTH_TTL_MS);
    await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls[2][0]).toBe("test://2330?month=2026-10");
  });

  test("沒資料的月份（例如上櫃股票）回空陣列，不算錯誤", async () => {
    const { source } = setup();
    await expect(source.getDailyCandles("6488", ["2026-10"])).resolves.toEqual([]);
  });

  test("斷網或 HTTP 錯誤：丟 PriceLoadError；已抓到的月份留在快取", async () => {
    const { source, fetchFn } = setup();
    await source.getDailyCandles("2330", ["2026-09"]);
    fetchFn.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(source.getDailyCandles("2330", ["2026-09", "2026-10"])).rejects.toBeInstanceOf(
      PriceLoadError,
    );
    fetchFn.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(source.getDailyCandles("2330", ["2026-10"])).rejects.toBeInstanceOf(PriceLoadError);
    // 9 月只抓過一次（第一次），之後都走快取
    expect(fetchFn.mock.calls.filter((c) => String(c[0]).includes("2026-09"))).toHaveLength(1);
  });
});
