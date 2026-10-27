import dividend00406A from "./__fixtures__/finmindDividend00406A.json";
import dividend2884 from "./__fixtures__/finmindDividend2884.json";
import price2330 from "./__fixtures__/finmindPrice2330.json";
import split0050 from "./__fixtures__/finmindSplit0050.json";
import {
  finmindMessage,
  finmindRows,
  parseFinmindCandles,
  parseFinmindDividends,
  parseFinmindSplits,
} from "./finmindParse";

describe("finmindRows", () => {
  test("成功回應：回 data", () => {
    expect(finmindRows(price2330)).toHaveLength(price2330.data.length);
  });

  test("失敗回應（等級不夠、超過上限）：null，並拿得到訊息", () => {
    const body = { msg: "Your level is free.", status: 400 };
    expect(finmindRows(body)).toBeNull();
    expect(finmindMessage(body)).toBe("Your level is free.");
    expect(finmindRows(null)).toBeNull();
    expect(finmindMessage(null)).toBe("回應格式不對");
  });
});

describe("parseFinmindCandles", () => {
  test("真實回應：2330 2026-09-29 起的日 K，max/min 對應 high/low", () => {
    const candles = parseFinmindCandles(finmindRows(price2330)!);
    expect(candles[0]).toEqual({ date: "2026-09-29", open: 2475, high: 2495, low: 2475, close: 2475 });
    expect(candles.map((c) => c.date)).toEqual([...candles.map((c) => c.date)].sort());
  });

  test("價格不是正數、日期格式不對的列略過；結果依日期排序", () => {
    const rows = [
      { date: "2026-10-02", open: 1, max: 1, min: 1, close: 1 },
      { date: "2026-10-01", open: 2, max: 2, min: 2, close: 2 },
      { date: "2026-10-03", open: 0, max: 0, min: 0, close: 0 },
      { date: "20261004", open: 1, max: 1, min: 1, close: 1 },
    ];
    expect(parseFinmindCandles(rows).map((c) => c.date)).toEqual(["2026-10-01", "2026-10-02"]);
  });
});

describe("parseFinmindDividends", () => {
  test("玉山金 2025-07-22：現金 1.2、股票 0.10015129 元 → 每千股 10.015129 股，同一天合成一筆", () => {
    const events = parseFinmindDividends(finmindRows(dividend2884)!, "2884");
    expect(events[0]).toEqual({
      kind: "dividend",
      symbol: "2884",
      exDate: "2025-07-22",
      cashPerShare: 1.2,
      stockPerThousand: 10.015129,
      payDate: "2025-08-27",
    });
    expect(events[1]).toMatchObject({ exDate: "2026-07-01", cashPerShare: 1.4, stockPerThousand: 0 });
  });

  test("已公告除息日、金額還沒公告（全部是 0）：cashPerShare 為 null", () => {
    const events = parseFinmindDividends(finmindRows(dividend00406A)!, "00406A");
    expect(events.map((e) => [e.exDate, e.cashPerShare])).toEqual([
      ["2026-10-05", 0.138],
      ["2026-11-03", null],
    ]);
  });

  test("沒有除權息日的列（只有董事會決議）略過", () => {
    const rows = [{ CashEarningsDistribution: 5, CashExDividendTradingDate: "", StockExDividendTradingDate: "" }];
    expect(parseFinmindDividends(rows, "6488")).toEqual([]);
  });

  test("現金與配股不同天：各一筆", () => {
    const rows = [
      {
        CashEarningsDistribution: 1,
        CashExDividendTradingDate: "2026-07-01",
        StockEarningsDistribution: 0.5,
        StockExDividendTradingDate: "2026-08-01",
      },
    ];
    expect(parseFinmindDividends(rows, "X").map((e) => [e.exDate, e.cashPerShare, e.stockPerThousand])).toEqual([
      ["2026-07-01", 1, 0],
      ["2026-08-01", 0, 50],
    ]);
  });
});

describe("parseFinmindSplits", () => {
  test("0050 2025-06-18 一拆四：188.65 → 47.16 取整成 4", () => {
    expect(parseFinmindSplits(finmindRows(split0050)!, "0050")).toEqual([
      { kind: "split", symbol: "0050", date: "2025-06-18", ratio: 4 },
    ]);
  });

  test("反分割：00632R 七股併一股 → 1/7", () => {
    const rows = [{ date: "2024-12-11", before_price: 3.28, after_price: 22.96 }];
    expect(parseFinmindSplits(rows, "00632R")[0].ratio).toBeCloseTo(1 / 7, 10);
  });

  test("面額變更 10 元 → 4 元：2.5", () => {
    const rows = [{ date: "2022-09-05", before_price: 90.6, after_price: 36.24 }];
    expect(parseFinmindSplits(rows, "6548")[0].ratio).toBe(2.5);
  });
});
