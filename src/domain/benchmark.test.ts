import { adjustCloses, type AdjustedClose } from "./adjustedPrice";
import {
  actualValue,
  benchmarkConclusion,
  benchmarkFlows,
  benchmarkStart,
  buildBenchmarkDuel,
  openingValue,
  sharesBefore,
  simulateBenchmark,
  type BenchmarkComparison,
} from "./benchmark";
import { makeDividend, makeTx } from "./ledgerTestData";
import type { Candle } from "./types";

const TODAY = "2026-10-28";

/** 還原價直接給（不經過 adjustCloses），方便手算 */
function adj(...rows: [string, number][]): AdjustedClose[] {
  return rows.map(([date, adjClose]) => ({ date, close: adjClose, adjClose }));
}

function candle(date: string, close: number): Candle {
  return { date, open: close, high: close, low: close, close };
}

function ok(result: ReturnType<typeof simulateBenchmark>) {
  if (result.kind !== "ok") throw new Error(`應該要能模擬，結果是 ${result.kind}`);
  return result;
}

describe("simulateBenchmark（P2-05 B 同日、同金額、還原收盤價）", () => {
  test("AC：某日投入 100,000，該日 0050 還原價 100、今天 120 → 模擬價值 120,000", () => {
    // 手算：100,000 ÷ 100 = 1,000 單位；1,000 × 120 = 120,000
    const result = ok(simulateBenchmark([{ date: "2026-03-02", amount: 100_000 }], adj(["2026-03-02", 100], ["2026-10-28", 120])));
    expect(result.units).toBeCloseTo(1000, 10);
    expect(result.value).toBeCloseTo(120_000, 6);
    expect(result.asOf).toBe("2026-10-28");
    expect(result.oversold).toBe(false);
  });

  test("可以買小數單位：投入 1,000，還原價 300 → 3.333… 單位", () => {
    // 手算：1,000 ÷ 300 = 3.3333 單位；× 360 = 1,200
    const result = ok(simulateBenchmark([{ date: "2026-03-02", amount: 1000 }], adj(["2026-03-02", 300], ["2026-10-28", 360])));
    expect(result.units).toBeCloseTo(10 / 3, 10);
    expect(result.value).toBeCloseTo(1200, 6);
  });

  test("非交易日：週六的買入用前一個交易日（週五）的價格", () => {
    // 2026-03-07 是週六。手算：100,000 ÷ 100（週五 3/6）= 1,000 單位，不是 ÷ 110（週一 3/9）
    const prices = adj(["2026-03-06", 100], ["2026-03-09", 110], ["2026-10-28", 120]);
    const result = ok(simulateBenchmark([{ date: "2026-03-07", amount: 100_000 }], prices));
    expect(result.units).toBeCloseTo(1000, 10);
    expect(result.value).toBeCloseTo(120_000, 6);
  });

  test("有賣出：同一天賣出等值的基準單位", () => {
    // 手算：3/2 投入 100,000 ÷ 100 = 1,000 單位；6/1 賣出淨額 25,000 ÷ 125 = 200 單位，剩 800；
    // 今天 800 × 120 = 96,000
    const prices = adj(["2026-03-02", 100], ["2026-06-01", 125], ["2026-10-28", 120]);
    const flows = [
      { date: "2026-03-02", amount: 100_000 },
      { date: "2026-06-01", amount: -25_000 },
    ];
    const result = ok(simulateBenchmark(flows, prices));
    expect(result.units).toBeCloseTo(800, 10);
    expect(result.value).toBeCloseTo(96_000, 6);
    expect(result.oversold).toBe(false);
  });

  test("賣出金額超過模擬部位的價值：只能賣到 0，標記 oversold", () => {
    // 手算：10,000 ÷ 100 = 100 單位，價格跌到 50 時只值 5,000；要賣 20,000 → 全部賣掉，剩 0
    const prices = adj(["2026-03-02", 100], ["2026-06-01", 50], ["2026-10-28", 120]);
    const flows = [
      { date: "2026-03-02", amount: 10_000 },
      { date: "2026-06-01", amount: -20_000 },
    ];
    const result = ok(simulateBenchmark(flows, prices));
    expect(result.units).toBe(0);
    expect(result.value).toBe(0);
    expect(result.oversold).toBe(true);
  });

  test("0050 一拆四：分割前買的單位，分割後照樣算對（還原價把分割折算回來）", () => {
    // 0050 2025-06-18 一拆四（docs/research/history-and-dividend-sources.md §2.4）。
    // 手算：6/17 收盤 200，還原價 = 200 ÷ 4 = 50；投入 100,000 → 2,000 單位；6/19 收 55 → 110,000。
    // 等於真實世界：100,000 ÷ 200 = 500 股，拆成 2,000 股 × 55 = 110,000。
    const prices = adjustCloses(
      [candle("2025-06-17", 200), candle("2025-06-18", 50), candle("2025-06-19", 55)],
      [{ kind: "split", symbol: "0050", date: "2025-06-18", ratio: 4 }],
    );
    const result = ok(simulateBenchmark([{ date: "2025-06-17", amount: 100_000 }], prices));
    expect(result.units).toBeCloseTo(2000, 8);
    expect(result.value).toBeCloseTo(110_000, 6);
  });

  test("含息：基準自己的股利由還原價算進去", () => {
    // 手算：7/20 收 100，7/21 除息 1 元，參考價 99 → 因子 0.99，7/20 還原價 99。
    // 投入 99,000 ÷ 99 = 1,000 單位，7/22 收 101 → 101,000。
    // 對照真實世界：99,000 ÷ 100 = 990 股；領股利 990 元，以 99 再投入 = 10 股；1,000 股 × 101 = 101,000。
    const prices = adjustCloses(
      [candle("2026-07-20", 100), candle("2026-07-21", 99), candle("2026-07-22", 101)],
      [{ kind: "dividend", symbol: "0050", exDate: "2026-07-21", cashPerShare: 1, stockPerThousand: 0, payDate: null }],
    );
    const result = ok(simulateBenchmark([{ date: "2026-07-20", amount: 99_000 }], prices));
    expect(result.units).toBeCloseTo(1000, 8);
    expect(result.value).toBeCloseTo(101_000, 6);
  });

  test("日期太早：比基準最早的價格還早的紀錄，模擬不了", () => {
    const result = simulateBenchmark([{ date: "2012-01-02", amount: 10_000 }], adj(["2012-07-17", 20], ["2026-10-28", 30]));
    expect(result).toEqual({ kind: "tooEarly", flowDate: "2012-01-02", firstPriceDate: "2012-07-17" });
  });

  test("拿到空的價格：有現金流就是模擬不了，沒有現金流就是 0", () => {
    expect(simulateBenchmark([{ date: "2026-03-02", amount: 1 }], [])).toEqual({
      kind: "tooEarly",
      flowDate: "2026-03-02",
      firstPriceDate: null,
    });
    expect(ok(simulateBenchmark([], [])).value).toBe(0);
  });
});

describe("benchmarkFlows", () => {
  test("買入 = 成交金額 + 手續費；賣出 = −(成交金額 − 手續費 − 證交稅)；依日期排序、只取期間內", () => {
    // product-spec 3.7：600 × 1,000 + 855 = 600,855；650 × 500 − 463 − 975 = 323,562
    const txs = [
      makeTx({ side: "sell", tradeDate: "2026-03-05", price: 650, shares: 500, fee: 463, tax: 975 }),
      makeTx({ side: "buy", tradeDate: "2026-01-05", price: 600, shares: 1000, fee: 855 }),
      makeTx({ side: "buy", tradeDate: "2025-12-31", price: 1, shares: 1, fee: 0 }),
    ];
    expect(benchmarkFlows(txs, "2026-01-01", TODAY)).toEqual([
      { date: "2026-01-05", amount: 600_855 },
      { date: "2026-03-05", amount: -323_562 },
    ]);
  });
});

describe("benchmarkStart（期間篩選）", () => {
  const txs = [{ tradeDate: "2023-05-10" }, { tradeDate: "2026-02-01" }];

  test("全部：第一筆交易那天", () => {
    expect(benchmarkStart("all", TODAY, txs)).toBe("2023-05-10");
  });

  test("今年：1 月 1 日", () => {
    expect(benchmarkStart("ytd", TODAY, txs)).toBe("2026-01-01");
  });

  test("近 1 年、近 3 年：往前推同一天", () => {
    expect(benchmarkStart("1y", TODAY, txs)).toBe("2025-10-28");
    // 3 年前是 2023-10-28，比第一筆交易晚，照用
    expect(benchmarkStart("3y", TODAY, txs)).toBe("2023-10-28");
  });

  test("期間開始時還沒有交易：從第一筆交易開始", () => {
    expect(benchmarkStart("3y", TODAY, [{ tradeDate: "2026-02-01" }])).toBe("2026-02-01");
  });

  test("沒有交易回 null", () => {
    expect(benchmarkStart("all", TODAY, [])).toBeNull();
  });
});

describe("期初市值（非「全部」時當成一筆期初投入）", () => {
  test("只算期初當天之前的交易，當天的交易算在期間內", () => {
    const txs = [
      makeTx({ symbol: "2330", side: "buy", tradeDate: "2025-12-01", price: 500, shares: 100 }),
      makeTx({ symbol: "2317", side: "buy", tradeDate: "2025-06-01", price: 100, shares: 1000 }),
      makeTx({ symbol: "2317", side: "sell", tradeDate: "2025-09-01", price: 120, shares: 1000 }),
      makeTx({ symbol: "2454", side: "buy", tradeDate: "2026-01-01", price: 1000, shares: 10 }),
    ];
    expect(sharesBefore(txs, [], "2026-01-01")).toEqual({ "2330": 100 });
  });

  test("用期初當天或之前最近的收盤價：1/1 休市就用 12/31", () => {
    // 手算：100 股 × 12/31 收盤 1,500 = 150,000
    const closes = { "2330": [{ date: "2025-12-30", close: 1480 }, { date: "2025-12-31", close: 1500 }, { date: "2026-01-02", close: 1600 }] };
    expect(openingValue({ "2330": 100 }, closes, "2026-01-01")).toBe(150_000);
  });

  test("有一檔找不到價格回 null", () => {
    expect(openingValue({ "2330": 100 }, {}, "2026-01-01")).toBeNull();
  });
});

describe("actualValue", () => {
  test("目前市值 + 期間內領到的現金股利（用發放日，沒有用除息日）", () => {
    const dividends = [
      makeDividend({ type: "cash", exDate: "2025-12-20", payDate: "2026-01-10", cashAmount: 300 }),
      makeDividend({ type: "cash", exDate: "2025-12-01", cashAmount: 999 }), // 期間前，不算
      makeDividend({ type: "cash", exDate: "2026-06-15", cashAmount: 5000 }),
      makeDividend({ type: "stock", exDate: "2026-07-01", stockShares: 10 }), // 股票股利已在市值裡
    ];
    // 手算：100,000 + 300 + 5,000 = 105,300
    expect(actualValue(100_000, dividends, "2026-01-01", TODAY)).toBe(105_300);
  });
});

describe("benchmarkConclusion（白話結論）", () => {
  const base: BenchmarkComparison = {
    benchmark: "0050",
    benchmarkValue: 120_000,
    actualValue: 115_000,
    difference: 5_000,
    invested: 100_000,
    oversold: false,
  };

  test("改買基準比較多", () => {
    expect(benchmarkConclusion(base)).toBe("若改買 0050，現在價值 120,000 元，比你實際多 5,000 元。");
  });

  test("改買基準比較少", () => {
    const text = benchmarkConclusion({ ...base, benchmark: "006208", benchmarkValue: 90_000, difference: -25_000 });
    expect(text).toBe("若改買 006208，現在價值 90,000 元，比你實際少 25,000 元。");
  });

  test("一樣多", () => {
    expect(benchmarkConclusion({ ...base, difference: 0 })).toBe("若改買 0050，現在價值 120,000 元，和你實際差不多。");
  });

  test("AC：結論不含「建議」、「應該」、「買進」、「賣出」", () => {
    for (const difference of [5000, -5000, 0]) {
      expect(benchmarkConclusion({ ...base, difference })).not.toMatch(/建議|應該|買進|賣出/);
    }
  });
});

describe("buildBenchmarkDuel（串起來）", () => {
  const prices = adj(["2025-12-31", 100], ["2026-03-02", 100], ["2026-06-01", 125], ["2026-10-28", 120]);

  test("全部期間：買 100,000、賣 25,000，實際市值 90,000 + 股利 1,000 → 0050 多 5,000", () => {
    const transactions = [
      makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-03-02", price: 500, shares: 200 }),
      makeTx({ symbol: "2330", side: "sell", tradeDate: "2026-06-01", price: 625, shares: 40 }),
    ];
    const dividends = [makeDividend({ symbol: "2330", type: "cash", exDate: "2026-06-15", cashAmount: 1000 })];
    const result = buildBenchmarkDuel({
      benchmark: "0050",
      transactions,
      dividends,
      marketValue: 90_000,
      start: "2026-03-02",
      today: TODAY,
      adjCloses: prices,
      openingCloses: {},
    });
    // 手算：0050 1,000 單位 − 200 單位 = 800 × 120 = 96,000；實際 90,000 + 1,000 = 91,000；差 5,000
    expect(result).toEqual({
      kind: "ok",
      comparison: {
        benchmark: "0050",
        benchmarkValue: 96_000,
        actualValue: 91_000,
        difference: 5_000,
        invested: 100_000,
        oversold: false,
      },
      text: "若改買 0050，現在價值 96,000 元，比你實際多 5,000 元。",
    });
  });

  test("今年：期初市值當成 1/1 的一筆投入，去年的交易不再算", () => {
    const transactions = [makeTx({ symbol: "2330", side: "buy", tradeDate: "2025-06-02", price: 400, shares: 100 })];
    const result = buildBenchmarkDuel({
      benchmark: "0050",
      transactions,
      dividends: [],
      marketValue: 66_000,
      start: "2026-01-01",
      today: TODAY,
      adjCloses: prices,
      openingCloses: { "2330": [{ date: "2025-12-31", close: 600 }] },
    });
    // 手算：期初 100 股 × 600 = 60,000，1/1 休市用 12/31 的 0050 還原價 100 → 600 單位 × 120 = 72,000；
    // 實際 66,000，0050 多 6,000
    if (result.kind !== "ok") throw new Error("應該要能比較");
    expect(result.comparison).toMatchObject({ benchmarkValue: 72_000, actualValue: 66_000, difference: 6_000, invested: 60_000 });
  });

  test("有持股拿不到現價、或期初拿不到價格：先不比較", () => {
    const transactions = [makeTx({ symbol: "2330", side: "buy", tradeDate: "2025-06-02", price: 400, shares: 100 })];
    const input = {
      benchmark: "0050" as const,
      transactions,
      dividends: [],
      start: "2026-01-01",
      today: TODAY,
      adjCloses: prices,
    };
    expect(buildBenchmarkDuel({ ...input, marketValue: null, openingCloses: { "2330": [{ date: "2025-12-31", close: 600 }] } }).kind).toBe(
      "missingPrice",
    );
    expect(buildBenchmarkDuel({ ...input, marketValue: 66_000, openingCloses: {} }).kind).toBe("missingPrice");
  });

  test("期間內沒有持股也沒有交易（例如去年就出清了，看今年）：不比較", () => {
    const transactions = [
      makeTx({ symbol: "2454", side: "buy", tradeDate: "2025-03-02", price: 1000, shares: 10 }),
      makeTx({ symbol: "2454", side: "sell", tradeDate: "2025-08-15", price: 1200, shares: 10 }),
    ];
    const result = buildBenchmarkDuel({
      benchmark: "0050",
      transactions,
      dividends: [],
      marketValue: 0,
      start: "2026-01-01",
      today: TODAY,
      adjCloses: prices,
      openingCloses: {},
    });
    expect(result.kind).toBe("noFlows");
  });

  test("日期太早：用白話說明，不出錯", () => {
    const transactions = [makeTx({ symbol: "2330", side: "buy", tradeDate: "2012-01-02", price: 80, shares: 1000 })];
    const result = buildBenchmarkDuel({
      benchmark: "006208",
      transactions,
      dividends: [],
      marketValue: 1_000_000,
      start: "2012-01-02",
      today: TODAY,
      adjCloses: adj(["2012-07-17", 20], ["2026-10-28", 150]),
      openingCloses: {},
    });
    expect(result.kind).toBe("tooEarly");
    expect(result.text).toBe("006208 只有 2012-07-17 以後的價格，2012-01-02 那筆紀錄比它還早，模擬不了。可以換一個期間或基準再看看。");
    expect(result.text).not.toMatch(/建議|應該|買進|賣出/);
  });
});
