import exDailyQ from "./__fixtures__/tpexExDailyQ.json";
import { parseTpexExRights } from "./tpexExRightParse";

describe("parseTpexExRights", () => {
  test("真實回應：環球晶 2025-12-31 除息 2 元，帶前收與參考價、沒有發放日", () => {
    expect(parseTpexExRights(exDailyQ)).toContainEqual({
      kind: "dividend",
      symbol: "6488",
      exDate: "2025-12-31",
      cashPerShare: 2,
      stockPerThousand: 0,
      payDate: null,
      closeBefore: 413,
      referencePrice: 411,
    });
  });

  test("格式不對：空陣列", () => {
    expect(parseTpexExRights(null)).toEqual([]);
    expect(parseTpexExRights({ tables: [{ data: [["114/12/31", "6488"]] }] })).toEqual([]);
  });
});
