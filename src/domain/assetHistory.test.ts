import {
  assetIndexAtX,
  buildAssetHistory,
  closeOnOrBefore,
  firstTradeDate,
  formatAxisAmount,
  historyMonths,
  layoutAssetChart,
  rangeStart,
  symbolsInRange,
  type DailyClose,
} from "./assetHistory";
import { makeDividend, makeTx, spec37 } from "./ledgerTestData";
import { buildOverview } from "./overview";

const closes = (rows: [string, number][]): DailyClose[] => rows.map(([date, close]) => ({ date, close }));

describe("資產走勢 buildAssetHistory（P2-07，對應 docs/stories/023）", () => {
  test("每天的市值 = 持股 × 當天收盤價；累計投入 = 買入金額 + 手續費", () => {
    const ledger = {
      transactions: [makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-03-02", price: 100, shares: 1000, fee: 142 })],
      dividends: [],
    };
    const points = buildAssetHistory(
      ledger,
      { "2330": closes([["2026-03-02", 100], ["2026-03-03", 110], ["2026-03-04", 95]]) },
      { from: "2026-03-02", to: "2026-03-04" },
    );
    expect(points).toEqual([
      { date: "2026-03-02", marketValue: 100_000, invested: 100_142 },
      { date: "2026-03-03", marketValue: 110_000, invested: 100_142 },
      { date: "2026-03-04", marketValue: 95_000, invested: 100_142 },
    ]);
  });

  test("中間有賣出：賣出後市值只算剩下的股數，累計投入不會減少", () => {
    // 3.7 範例：1/5 買 1000、2/5 買 1000、3/5 賣 500
    const ledger = { transactions: [spec37.step1, spec37.step2, spec37.step3], dividends: [] };
    const points = buildAssetHistory(
      ledger,
      {
        "2330": closes([
          ["2026-01-05", 600],
          ["2026-02-05", 500],
          ["2026-03-04", 640],
          ["2026-03-05", 650],
        ]),
      },
      { from: "2026-01-05", to: "2026-03-05" },
    );
    // 手算：1/5 1000 股 × 600；2/5 2000 股 × 500；3/4 2000 × 640；3/5 賣完剩 1500 × 650
    // 累計投入：600,855 → 600,855 + 500,712 = 1,101,567，賣出後不變
    expect(points.map((p) => p.marketValue)).toEqual([600_000, 1_000_000, 1_280_000, 975_000]);
    expect(points.map((p) => p.invested)).toEqual([600_855, 1_101_567, 1_101_567, 1_101_567]);
  });

  test("週末下單：從下一個交易日開始算；某檔某天沒成交，用之前最近一天的收盤價", () => {
    const ledger = {
      transactions: [
        makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-03-02", price: 50, shares: 1000, fee: 71 }),
        // 3/7 是星期六
        makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-03-07", price: 1000, shares: 10, fee: 14 }),
      ],
      dividends: [],
    };
    const points = buildAssetHistory(
      ledger,
      {
        "0050": closes([["2026-03-06", 51], ["2026-03-09", 52], ["2026-03-10", 53]]),
        // 2330 3/10 停牌，沒有那天的收盤價
        "2330": closes([["2026-03-06", 990], ["2026-03-09", 1010]]),
      },
      { from: "2026-03-06", to: "2026-03-10" },
    );
    expect(points).toEqual([
      // 3/6 只有 0050
      { date: "2026-03-06", marketValue: 51_000, invested: 50_071 },
      // 3/9（星期一）才出現 2330
      { date: "2026-03-09", marketValue: 52_000 + 10_100, invested: 50_071 + 10_014 },
      // 3/10 2330 沿用 3/9 的 1010
      { date: "2026-03-10", marketValue: 53_000 + 10_100, invested: 50_071 + 10_014 },
    ]);
  });

  test("期間第一天沒有收盤價（假日）：用期間開始前最近一天的收盤價", () => {
    const ledger = {
      transactions: [makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-01-02", price: 50, shares: 1000 })],
      dividends: [],
    };
    const points = buildAssetHistory(
      ledger,
      { "0050": closes([["2026-02-27", 60], ["2026-03-02", 61]]) },
      // 3/1 是星期日；期間內只有 3/2 一個交易日，但給了今天的現價就多一點
      { from: "2026-03-01", to: "2026-03-03", latestPrices: { "0050": 62 } },
    );
    expect(points).toEqual([
      { date: "2026-03-02", marketValue: 61_000, invested: 50_000 },
      { date: "2026-03-03", marketValue: 62_000, invested: 50_000 },
    ]);
  });

  test("股票股利從除權息日起增加持股", () => {
    const ledger = {
      transactions: [makeTx({ symbol: "2884", side: "buy", tradeDate: "2026-07-01", price: 30, shares: 1000 })],
      dividends: [makeDividend({ symbol: "2884", type: "stock", exDate: "2026-07-03", stockShares: 100 })],
    };
    const points = buildAssetHistory(
      ledger,
      { "2884": closes([["2026-07-02", 30], ["2026-07-03", 29]]) },
      { from: "2026-07-01", to: "2026-07-03" },
    );
    expect(points.map((p) => p.marketValue)).toEqual([30_000, 1100 * 29]);
  });

  test("有持股卻找不到任何收盤價的那幾天跳過，不畫少算的數字", () => {
    const ledger = {
      transactions: [
        makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-03-02", price: 50, shares: 1000 }),
        makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-03-02", price: 1000, shares: 10 }),
      ],
      dividends: [],
    };
    const points = buildAssetHistory(
      ledger,
      { "0050": closes([["2026-03-02", 50], ["2026-03-03", 51]]), "2330": closes([["2026-03-03", 1000]]) },
      { from: "2026-03-02", to: "2026-03-03" },
    );
    expect(points.map((p) => p.date)).toEqual(["2026-03-03"]);
  });

  test("已出清的期間：市值 0、累計投入照算", () => {
    const ledger = {
      transactions: [
        makeTx({ symbol: "2454", side: "buy", tradeDate: "2026-03-02", price: 1000, shares: 100, fee: 142 }),
        makeTx({ symbol: "2454", side: "sell", tradeDate: "2026-03-03", price: 1100, shares: 100, fee: 156, tax: 330 }),
      ],
      dividends: [],
    };
    const points = buildAssetHistory(
      ledger,
      { "2454": closes([["2026-03-02", 1000], ["2026-03-03", 1100], ["2026-03-04", 1200]]) },
      { from: "2026-03-02", to: "2026-03-04" },
    );
    expect(points.map((p) => [p.marketValue, p.invested])).toEqual([
      [100_000, 100_142],
      [0, 100_142],
      [0, 100_142],
    ]);
  });

  test("規格 AC：走勢最後一天的值等於首頁總市值", () => {
    const ledger = {
      schemaVersion: 1 as const,
      transactions: [
        spec37.step1,
        spec37.step2,
        spec37.step3,
        makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-02-10", price: 60, shares: 2000, fee: 171 }),
      ],
      dividends: [spec37.step4],
      holdingSettings: [],
      settings: { feeRate: 0.001425, feeDiscount: 1, minFeeBoardLot: 20, minFeeOddLot: 1 },
    };
    const today = "2026-10-28";
    const quotes: Record<string, { price: number; name: string }> = {
      "2330": { price: spec37.price, name: "台積電" },
      "0050": { price: 65.5, name: "元大台灣50" },
    };
    const home = buildOverview(ledger, (s) => quotes[s], today).summary.overall;

    const points = buildAssetHistory(
      ledger,
      { "2330": closes([["2026-10-27", 610]]), "0050": closes([["2026-10-27", 64]]) },
      { from: "2026-09-28", to: today, latestPrices: { "2330": 620, "0050": 65.5 } },
    );
    const last = points[points.length - 1];
    expect(last.date).toBe(today);
    expect(last.marketValue).toBe(home.marketValue);
    expect(last.invested).toBe(home.invested);
  });

  test("最後一天現價缺一檔：那檔用最近的收盤價", () => {
    const ledger = {
      transactions: [makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-03-02", price: 50, shares: 1000 })],
      dividends: [],
    };
    const points = buildAssetHistory(
      ledger,
      { "0050": closes([["2026-03-02", 50]]) },
      { from: "2026-03-02", to: "2026-03-02", latestPrices: {} },
    );
    expect(points).toEqual([{ date: "2026-03-02", marketValue: 50_000, invested: 50_000 }]);
  });

  test("沒有交易：沒有任何點", () => {
    expect(buildAssetHistory({ transactions: [], dividends: [] }, {}, { from: "2026-03-01", to: "2026-03-31" })).toEqual(
      [],
    );
  });
});

describe("期間與要抓的資料", () => {
  const ledger = {
    transactions: [
      makeTx({ symbol: "2454", side: "buy", tradeDate: "2025-03-02", price: 1000, shares: 100 }),
      makeTx({ symbol: "2454", side: "sell", tradeDate: "2025-06-02", price: 1100, shares: 100 }),
      makeTx({ symbol: "0050", side: "buy", tradeDate: "2025-05-02", price: 50, shares: 1000 }),
      makeTx({ symbol: "2330", side: "buy", tradeDate: "2026-10-20", price: 1000, shares: 10 }),
    ],
    dividends: [],
  };

  test("firstTradeDate：最早的交易日", () => {
    expect(firstTradeDate(ledger)).toBe("2025-03-02");
    expect(firstTradeDate({ transactions: [] })).toBeNull();
  });

  test("rangeStart：近 1 個月、近 1 年、全部，不早於第一筆交易", () => {
    expect(rangeStart("1m", "2026-10-28", ledger)).toBe("2026-09-28");
    expect(rangeStart("1y", "2026-10-28", ledger)).toBe("2025-10-28");
    expect(rangeStart("all", "2026-10-28", ledger)).toBe("2025-03-02");
    const recent = { transactions: [makeTx({ side: "buy", tradeDate: "2026-10-20", price: 1, shares: 1 })] };
    expect(rangeStart("1y", "2026-10-28", recent)).toBe("2026-10-20");
    expect(rangeStart("1m", "2026-10-28", { transactions: [] })).toBeNull();
  });

  test("symbolsInRange：期間開始前就出清的不抓", () => {
    expect(symbolsInRange(ledger, "2025-10-28", "2026-10-28")).toEqual(["0050", "2330"]);
    expect(symbolsInRange(ledger, "2025-03-01", "2026-10-28")).toEqual(["0050", "2330", "2454"]);
    // 還沒買的也不抓
    expect(symbolsInRange(ledger, "2025-03-01", "2025-04-30")).toEqual(["2454"]);
  });

  test("historyMonths：多抓期間前一個月", () => {
    expect(historyMonths("2026-09-28", "2026-10-28")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  test("closeOnOrBefore：當天或之前最近的收盤價", () => {
    const list = closes([["2026-03-02", 10], ["2026-03-04", 12]]);
    expect(closeOnOrBefore(list, "2026-03-01")).toBeNull();
    expect(closeOnOrBefore(list, "2026-03-03")).toBe(10);
    expect(closeOnOrBefore(list, "2026-03-04")).toBe(12);
    expect(closeOnOrBefore(undefined, "2026-03-04")).toBeNull();
  });
});

describe("走勢圖座標 layoutAssetChart", () => {
  const points = [
    { date: "2026-03-02", marketValue: 100, invested: 100 },
    { date: "2026-03-03", marketValue: 200, invested: 100 },
  ];
  const layout = layoutAssetChart(points, { width: 256, height: 136, axisWidth: 56, paddingTop: 12, paddingBottom: 24 });

  test("每天一格，點在格子中間；範圍包住兩條線、上下留 6%", () => {
    expect(layout.slot).toBe(100);
    expect(layout.xs).toEqual([50, 150]);
    // 範圍 100～200，上下各加 6 → 94～206；繪圖高 100
    expect(layout.valueToY(206)).toBeCloseTo(12);
    expect(layout.valueToY(94)).toBeCloseTo(112);
    expect(layout.marketValuePath).toBe("M 50 106.6 L 150 17.4");
    expect(layout.ticks.map((t) => t.value)).toEqual([200, 150, 100]);
    expect(layout.dateLabels.map((d) => d.date)).toEqual(["2026-03-02", "2026-03-03"]);
  });

  test("assetIndexAtX：點到哪一格，超出夾到頭尾", () => {
    expect(assetIndexAtX(layout, 120)).toBe(1);
    expect(assetIndexAtX(layout, -5)).toBe(0);
    expect(assetIndexAtX(layout, 999)).toBe(1);
    expect(assetIndexAtX({ slot: 0, xs: [] }, 10)).toBeNull();
  });

  test("formatAxisAmount：萬、億", () => {
    expect(formatAxisAmount(9_999)).toBe("9,999");
    expect(formatAxisAmount(1_234_567)).toBe("123萬");
    expect(formatAxisAmount(56_000)).toBe("5.6萬");
    expect(formatAxisAmount(250_000_000)).toBe("2.5億");
  });
});
