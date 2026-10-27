import { PriceLoadError } from "./PriceSource";
import { createTwseSource } from "./twseSource";

const ROWS = [
  { Date: "1151022", Code: "0050", Name: "元大台灣50", ClosingPrice: "106.90" },
  { Date: "1151022", Code: "1101", Name: "台泥", ClosingPrice: "30.00" },
  { Date: "1151022", Code: "2330", Name: "台積電", ClosingPrice: "2385.00" },
  { Date: "1151022", Code: "2317", Name: "鴻海", ClosingPrice: "245.00" },
  { Date: "1151022", Code: "00625K", Name: "富邦上証+R", ClosingPrice: "" },
  { Date: "1151022", Code: "1102", Name: "亞泥", ClosingPrice: "45.00" },
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function setup(responses: (() => Promise<Response>)[], ttlMs = 5 * 60 * 1000) {
  let clock = 1_000_000;
  const fetchFn = jest.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("沒有預先準備的回應");
    return next();
  }) as unknown as jest.MockedFunction<typeof fetch>;
  const source = createTwseSource({ fetchFn, now: () => clock, ttlMs });
  return { source, fetchFn, advance: (ms: number) => (clock += ms) };
}

describe("createTwseSource", () => {
  test("getQuote 回證交所收盤價與資料日期", async () => {
    const { source } = setup([async () => jsonResponse(ROWS)]);
    await expect(source.getQuote("2330")).resolves.toEqual({
      symbol: "2330",
      name: "台積電",
      price: 2385,
      asOf: "2026/10/22",
    });
  });

  test("找不到代號、或當天沒成交 → null", async () => {
    const { source } = setup([async () => jsonResponse(ROWS)]);
    await expect(source.getQuote("9999")).resolves.toBeNull();
    await expect(source.getQuote("00625K")).resolves.toBeNull();
  });

  test("getAll 與 getQuote 共用一次 fetch，5 分鐘內不再打", async () => {
    const { source, fetchFn, advance } = setup([
      async () => jsonResponse(ROWS),
      async () => jsonResponse(ROWS),
    ]);
    const [list, quote] = await Promise.all([source.getAll(), source.getQuote("2330")]);
    expect(list.map((s) => s.symbol)).toEqual(["2330", "2317", "0050", "1101", "1102"]);
    expect(quote?.price).toBe(2385);
    expect(list[0]).toEqual({ symbol: "2330", name: "台積電", type: "stock", market: "TWSE" });
    expect(list.find((s) => s.symbol === "0050")).toMatchObject({ type: "etf", market: "TWSE" });
    await source.getQuote("2317");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    advance(5 * 60 * 1000 + 1);
    await source.getQuote("2317");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("網路失敗且沒有快取 → 丟 PriceLoadError，之後再呼叫會重試", async () => {
    const { source, fetchFn } = setup([
      async () => {
        throw new TypeError("Network request failed");
      },
      async () => jsonResponse(ROWS),
    ]);
    await expect(source.getQuote("2330")).rejects.toBeInstanceOf(PriceLoadError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await expect(source.getAll()).resolves.toHaveLength(5);
    await expect(source.getQuote("2330")).resolves.toMatchObject({ price: 2385 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("HTTP 錯誤或空回應 → PriceLoadError", async () => {
    const { source } = setup([async () => jsonResponse("gateway error", 502), async () => jsonResponse([])]);
    await expect(source.getQuote("2330")).rejects.toThrow(/HTTP 502/);
    await expect(source.getQuote("2330")).rejects.toThrow(/沒有任何行情/);
  });

  test("快取過期後更新失敗 → 先用舊資料", async () => {
    const { source, advance } = setup([
      async () => jsonResponse(ROWS),
      async () => {
        throw new TypeError("Network request failed");
      },
    ]);
    await source.getQuote("2330");
    advance(10 * 60 * 1000);
    await expect(source.getQuote("2330")).resolves.toMatchObject({ price: 2385 });
  });
});
