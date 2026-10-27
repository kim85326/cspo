import FIXTURE from "./__fixtures__/tpexMainboardQuotes.json";
import { parseTpexRows } from "./tpexParse";

// FIXTURE：2026-10-27 實際打 tpex_mainboard_quotes 拿到的回應（資料日 1151022），只留 9 列。
describe("parseTpexRows（櫃買中心真實回應）", () => {
  const quotes = parseTpexRows(FIXTURE);

  test("轉出代號、名稱、收盤價與資料日期", () => {
    expect(quotes.find((q) => q.symbol === "5347")).toEqual({
      symbol: "5347",
      name: "世界",
      price: 161,
      asOf: "2026/10/22",
    });
    expect(quotes.find((q) => q.symbol === "8069")?.price).toBe(153.5);
  });

  test("上櫃 ETF（含帶字母的債券 ETF）都有", () => {
    expect(quotes.find((q) => q.symbol === "006201")).toMatchObject({ name: "元大富櫃50", price: 42.15 });
    expect(quotes.find((q) => q.symbol === "00679B")).toMatchObject({ name: "元大美債20年", price: 26.01 });
  });

  test("當天沒成交（收盤價 ----）的列丟掉", () => {
    expect(quotes.find((q) => q.symbol === "2073")).toBeUndefined();
    expect(quotes.find((q) => q.symbol === "020001")).toBeUndefined();
    expect(quotes).toHaveLength(7);
  });
});

describe("parseTpexRows（格式異常）", () => {
  test("不是陣列 → 空陣列", () => {
    expect(parseTpexRows(null)).toEqual([]);
    expect(parseTpexRows({ error: "x" })).toEqual([]);
  });

  test("代號或名稱空白、壞列、重複代號都略過", () => {
    expect(
      parseTpexRows([
        null,
        "壞掉",
        { SecuritiesCompanyCode: "", CompanyName: "沒代號", Close: "10" },
        { SecuritiesCompanyCode: "1234", CompanyName: " ", Close: "10" },
        { SecuritiesCompanyCode: " 5347 ", CompanyName: " 世界 ", Close: "161.00" },
        { SecuritiesCompanyCode: "5347", CompanyName: "世界", Close: "999" },
      ]),
    ).toEqual([{ symbol: "5347", name: "世界", price: 161 }]);
  });
});
