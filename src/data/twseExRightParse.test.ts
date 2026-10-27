import twt49u from "./__fixtures__/twseTwt49u202507.json";
import detail2884 from "./__fixtures__/twseTwt49uDetail2884.json";
import { parseAmount, parseRocChineseDate, parseTwseExRightDetail, parseTwseExRights } from "./twseExRightParse";

describe("parseTwseExRights", () => {
  test("真實回應：息、權、權息都讀得到，有配股的標 hasStockDividend", () => {
    expect(parseTwseExRights(twt49u)).toEqual([
      { symbol: "6541", exDate: "2025-07-18", closeBefore: 53.5, referencePrice: 52.95, value: 0.540275, hasStockDividend: true },
      { symbol: "0050", exDate: "2025-07-21", closeBefore: 51.45, referencePrice: 51.09, value: 0.36, hasStockDividend: false },
      { symbol: "2884", exDate: "2025-07-22", closeBefore: 34.2, referencePrice: 32.67, value: 1.527222, hasStockDividend: true },
    ]);
  });

  test("stat 不是 OK、格式不對：空陣列", () => {
    expect(parseTwseExRights({ stat: "很抱歉，沒有符合條件的資料!" })).toEqual([]);
    expect(parseTwseExRights(null)).toEqual([]);
  });
});

describe("parseTwseExRightDetail", () => {
  test("玉山金 2025-07-22：現金 1.2 元、每千股配 10 股", () => {
    expect(parseTwseExRightDetail(detail2884)).toEqual({ cashPerShare: 1.2, stockPerThousand: 10 });
  });

  test("格式不對：null", () => {
    expect(parseTwseExRightDetail({ data: [] })).toBeNull();
    expect(parseTwseExRightDetail({ data: [["2884", "x", "?", "", "?"]] })).toBeNull();
  });
});

describe("parseRocChineseDate / parseAmount", () => {
  test("民國年中文日期", () => {
    expect(parseRocChineseDate("114年07月22日")).toBe("2025-07-22");
    expect(parseRocChineseDate("114/07/22")).toBeUndefined();
  });

  test("金額可為 0、可帶千分位", () => {
    expect(parseAmount("0.000000")).toBe(0);
    expect(parseAmount(" 1,505.00 ")).toBe(1505);
    expect(parseAmount("--")).toBeNull();
  });
});
