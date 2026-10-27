import FIXTURE from "./__fixtures__/tpexMainboardQuotes.json";
import { createMarketSource } from "./marketSource";
import { PriceLoadError } from "./PriceSource";
import { createTpexSource } from "./tpexSource";
import { createTwseSource } from "./twseSource";

const TWSE_ROWS = [
  { Date: "1151022", Code: "0050", Name: "元大台灣50", ClosingPrice: "106.90" },
  { Date: "1151022", Code: "00878", Name: "國泰永續高股息", ClosingPrice: "22.10" },
  { Date: "1151022", Code: "1101", Name: "台泥", ClosingPrice: "30.00" },
  { Date: "1151022", Code: "2330", Name: "台積電", ClosingPrice: "2385.00" },
  { Date: "1151022", Code: "2317", Name: "鴻海", ClosingPrice: "245.00" },
];

type Reply = "ok" | "fail";

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/** 用假 fetch 組出上市、上櫃與合併來源；reply 決定每次打出去是成功還是斷網 */
function setup(twse: Reply, tpex: Reply) {
  const fake = (reply: Reply, body: unknown) =>
    jest.fn(async () => {
      if (reply === "fail") throw new TypeError("Network request failed");
      return jsonResponse(body);
    }) as unknown as typeof fetch;
  return createMarketSource([
    createTwseSource({ fetchFn: fake(twse, TWSE_ROWS), url: "twse" }),
    createTpexSource({ fetchFn: fake(tpex, FIXTURE), url: "tpex" }),
  ]);
}

describe("createMarketSource（對應 docs/stories/007）", () => {
  test("清單同時有上市與上櫃，熱門排序第一檔仍是 2330", async () => {
    const list = await setup("ok", "ok").getAll();
    expect(list[0]).toEqual({ symbol: "2330", name: "台積電", type: "stock", market: "TWSE" });
    expect(list.find((s) => s.symbol === "5347")).toEqual({
      symbol: "5347",
      name: "世界",
      type: "stock",
      market: "TPEx",
    });
    expect(list.find((s) => s.symbol === "0050")?.type).toBe("etf");
    expect(list.find((s) => s.symbol === "00878")?.type).toBe("etf");
    expect(new Set(list.map((s) => s.symbol)).size).toBe(list.length);
  });

  test("上市、上櫃的現價都查得到", async () => {
    const source = setup("ok", "ok");
    await expect(source.getQuote("2330")).resolves.toMatchObject({ price: 2385 });
    await expect(source.getQuote("6488")).resolves.toMatchObject({ name: "環球晶", price: 826 });
  });

  test("兩邊都成功但查無此代號 → null（畫面顯示找不到）", async () => {
    await expect(setup("ok", "ok").getQuote("9999")).resolves.toBeNull();
  });

  test("上櫃失敗：上市股票仍可搜尋與取價", async () => {
    const source = setup("ok", "fail");
    const list = await source.getAll();
    expect(list.map((s) => s.symbol)).toContain("2330");
    expect(list.every((s) => s.market === "TWSE")).toBe(true);
    await expect(source.getQuote("2330")).resolves.toMatchObject({ price: 2385 });
  });

  test("上市失敗：上櫃股票仍可搜尋與取價", async () => {
    const source = setup("fail", "ok");
    const list = await source.getAll();
    expect(list.map((s) => s.symbol)).toContain("5347");
    await expect(source.getQuote("5347")).resolves.toMatchObject({ price: 161 });
  });

  test("一邊失敗時查不到的代號 → PriceLoadError，不說成找不到", async () => {
    await expect(setup("ok", "fail").getQuote("5347")).rejects.toBeInstanceOf(PriceLoadError);
    await expect(setup("ok", "fail").getQuote("9999")).rejects.toBeInstanceOf(PriceLoadError);
  });

  test("兩邊都失敗 → getAll 與 getQuote 都丟 PriceLoadError", async () => {
    const source = setup("fail", "fail");
    await expect(source.getAll()).rejects.toBeInstanceOf(PriceLoadError);
    await expect(source.getQuote("2330")).rejects.toBeInstanceOf(PriceLoadError);
  });

  test("不是 PriceLoadError 的錯誤（程式錯）照樣往外丟", async () => {
    const source = createMarketSource([
      { getAll: async () => [], getQuote: async () => null },
      {
        getAll: async () => {
          throw new TypeError("bug");
        },
        getQuote: async () => {
          throw new TypeError("bug");
        },
      },
    ]);
    await expect(source.getAll()).rejects.toBeInstanceOf(TypeError);
    await expect(source.getQuote("2330")).rejects.toBeInstanceOf(TypeError);
  });
});
