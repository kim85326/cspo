import dividend2884 from "./__fixtures__/finmindDividend2884.json";
import price2330 from "./__fixtures__/finmindPrice2330.json";
import { createFinmindSource } from "./finmindSource";
import { PriceLoadError } from "./PriceSource";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function setup(respond: (url: URL) => Response) {
  const fetchFn = jest.fn(async (url: string) => respond(new URL(url)));
  const source = createFinmindSource({ fetchFn: fetchFn as unknown as typeof fetch });
  const urls = () => fetchFn.mock.calls.map((call) => new URL(call[0]));
  return { source, fetchFn, urls };
}

describe("createFinmindSource：日 K", () => {
  test("不管幾個月，一檔只打一個請求，start/end 是頭尾月份的第一天與最後一天", async () => {
    const { source, urls } = setup(() => jsonResponse(price2330));
    const candles = await source.getDailyCandles("2330", ["2026-09", "2026-10"]);
    expect(urls()).toHaveLength(1);
    const params = urls()[0].searchParams;
    expect(params.get("dataset")).toBe("TaiwanStockPrice");
    expect(params.get("data_id")).toBe("2330");
    expect(params.get("start_date")).toBe("2026-09-01");
    expect(params.get("end_date")).toBe("2026-10-31");
    expect(params.has("token")).toBe(false);
    expect(candles[0].date).toBe("2026-09-29");
  });

  test("不連續的月份：只留要的月份", async () => {
    const { source } = setup(() => jsonResponse(price2330));
    const candles = await source.getDailyCandles("2330", ["2026-10"]);
    expect(candles.every((c) => c.date.startsWith("2026-10"))).toBe(true);
  });

  test("沒有要任何月份：不打網路", async () => {
    const { source, fetchFn } = setup(() => jsonResponse(price2330));
    await expect(source.getDailyCandles("2330", [])).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("代號不存在：FinMind 回空 data → 空陣列", async () => {
    const { source } = setup(() => jsonResponse({ msg: "success", status: 200, data: [] }));
    await expect(source.getDailyCandles("9999", ["2026-10"])).resolves.toEqual([]);
  });

  test("超過次數上限（HTTP 402）、等級不夠（status 400）、斷網：PriceLoadError", async () => {
    const limited = setup(() => jsonResponse({ msg: "Requests reach the upper limit.", status: 402 }, 402));
    await expect(limited.source.getDailyCandles("2330", ["2026-10"])).rejects.toThrow(/402.*upper limit/);

    const level = setup(() => jsonResponse({ msg: "Your level is free.", status: 400 }));
    await expect(level.source.getDailyCandles("2330", ["2026-10"])).rejects.toBeInstanceOf(PriceLoadError);

    const offline = setup(() => {
      throw new TypeError("Network request failed");
    });
    await expect(offline.source.getDailyCandles("2330", ["2026-10"])).rejects.toBeInstanceOf(PriceLoadError);
  });
});

describe("createFinmindSource：除權息與分割", () => {
  // 玉山金沒有分割過；這裡用假的一拆二，只為了測合併與排序
  const fakeSplit = { msg: "success", status: 200, data: [{ date: "2025-06-18", before_price: 40, after_price: 20 }] };

  function respondByDataset(url: URL): Response {
    const dataset = url.searchParams.get("dataset");
    if (dataset === "TaiwanStockDividend") return jsonResponse(dividend2884);
    if (dataset === "TaiwanStockSplitPrice") return jsonResponse(fakeSplit);
    return jsonResponse({ status: 400, msg: "unexpected" });
  }

  test("打 TaiwanStockDividend（往前多抓一年）與 TaiwanStockSplitPrice，合併後依日期排序、篩期間", async () => {
    const { source, urls } = setup(respondByDataset);
    const actions = await source.getActions("2884", "2025-01-01", "2025-12-31");
    expect(urls().map((u) => [u.searchParams.get("dataset"), u.searchParams.get("start_date")])).toEqual([
      ["TaiwanStockDividend", "2024-01-01"],
      ["TaiwanStockSplitPrice", "2025-01-01"],
    ]);
    expect(actions).toEqual([
      { kind: "split", symbol: "2884", date: "2025-06-18", ratio: 2 },
      expect.objectContaining({ kind: "dividend", symbol: "2884", exDate: "2025-07-22" }),
    ]);
  });

  test("任一個請求失敗：PriceLoadError", async () => {
    const { source } = setup((url) =>
      url.searchParams.get("dataset") === "TaiwanStockSplitPrice" ? jsonResponse({}, 503) : respondByDataset(url),
    );
    await expect(source.getActions("2884", "2025-01-01", "2025-12-31")).rejects.toBeInstanceOf(PriceLoadError);
  });
});
