import tradingStock6488 from "./__fixtures__/tpexTradingStock6488.json";
import { parseTpexDayCandles } from "./tpexDayParse";

describe("parseTpexDayCandles", () => {
  test("真實回應：民國日期轉 ISO、千分位價格轉數字", () => {
    expect(parseTpexDayCandles(tradingStock6488)[0]).toEqual({
      date: "2026-10-01",
      open: 1055,
      high: 1135,
      low: 1045,
      close: 1085,
    });
  });

  test("上市代號（櫃買中心回空 data）、格式不對：空陣列", () => {
    expect(parseTpexDayCandles({ tables: [{ data: [] }] })).toEqual([]);
    expect(parseTpexDayCandles(null)).toEqual([]);
    expect(parseTpexDayCandles({ tables: "x" })).toEqual([]);
  });

  test("沒成交（----）的列略過", () => {
    const body = { tables: [{ data: [["115/10/02", "0", "0", "----", "----", "----", "----", "0", "0"]] }] };
    expect(parseTpexDayCandles(body)).toEqual([]);
  });
});
