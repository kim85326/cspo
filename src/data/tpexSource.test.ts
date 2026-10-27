import FIXTURE from "./__fixtures__/tpexMainboardQuotes.json";
import { PriceLoadError } from "./PriceSource";
import { TPEX_MAINBOARD_QUOTES_URL } from "./tpexEndpoint";
import { createTpexSource } from "./tpexSource";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function setup(responses: (() => Promise<Response>)[]) {
  const fetchFn = jest.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("沒有預先準備的回應");
    return next();
  }) as unknown as jest.MockedFunction<typeof fetch>;
  const source = createTpexSource({ fetchFn, url: TPEX_MAINBOARD_QUOTES_URL });
  return { source, fetchFn };
}

describe("createTpexSource（櫃買中心真實回應 fixture）", () => {
  test("getQuote 回上櫃收盤價與資料日期", async () => {
    const { source, fetchFn } = setup([async () => jsonResponse(FIXTURE)]);
    await expect(source.getQuote("5347")).resolves.toEqual({
      symbol: "5347",
      name: "世界",
      price: 161,
      asOf: "2026/10/22",
    });
    expect(fetchFn).toHaveBeenCalledWith(TPEX_MAINBOARD_QUOTES_URL, expect.anything());
  });

  test("getAll 每檔都標上 TPEx 與個股／ETF", async () => {
    const { source } = setup([async () => jsonResponse(FIXTURE)]);
    const list = await source.getAll();
    expect(list.every((s) => s.market === "TPEx")).toBe(true);
    expect(list.find((s) => s.symbol === "5347")?.type).toBe("stock");
    expect(list.find((s) => s.symbol === "006201")?.type).toBe("etf");
    expect(list.find((s) => s.symbol === "00679B")?.type).toBe("etf");
  });

  test("當天沒成交的上櫃股查不到現價 → null", async () => {
    const { source } = setup([async () => jsonResponse(FIXTURE)]);
    await expect(source.getQuote("2073")).resolves.toBeNull();
  });

  test("HTTP 錯誤 → PriceLoadError，訊息寫明是櫃買中心", async () => {
    const { source } = setup([async () => jsonResponse("bad gateway", 502)]);
    const error = await source.getAll().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PriceLoadError);
    expect((error as Error).message).toMatch(/櫃買中心回應 HTTP 502/);
  });
});
