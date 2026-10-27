import { buildInsightInput, insightInputFromQuotes } from "./insightInput";

describe("insightInputFromQuotes（計算畫面 → AI 解讀的輸入）", () => {
  test("單檔：帶出成本、現價、盈虧、報酬率與資料日期", () => {
    const input = insightInputFromQuotes([
      {
        holding: { symbol: "2330", buyPrice: 500, shares: 1000 },
        quote: { symbol: "2330", name: "台積電", price: 520, asOf: "2026/10/22" },
      },
    ]);
    expect(input).toEqual({
      version: 1,
      priceDate: "2026/10/22",
      feesIncluded: false,
      holdings: [
        { symbol: "2330", name: "台積電", shares: 1000, avgCost: 500, cost: 500_000, price: 520, pnl: 20_000, returnRate: 0.04 },
      ],
      total: { cost: 500_000, marketValue: 520_000, pnl: 20_000, returnRate: 0.04 },
    });
  });

  test("多檔：合計報酬率是總盈虧 ÷ 總成本，不是平均", () => {
    const input = insightInputFromQuotes([
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: { symbol: "2330", name: "台積電", price: 520 } },
      { holding: { symbol: "2317", buyPrice: 200, shares: 100 }, quote: { symbol: "2317", name: "鴻海", price: 180 } },
    ]);
    expect(input.total).toEqual({ cost: 520_000, marketValue: 538_000, pnl: 18_000, returnRate: 18_000 / 520_000 });
    expect(input.priceDate).toBeUndefined();
  });

  test("只有白名單欄位，沒有任何個人資料", () => {
    const input = insightInputFromQuotes([
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: { symbol: "2330", name: "台積電", price: 520 } },
    ]);
    expect(Object.keys(input).sort()).toEqual(["feesIncluded", "holdings", "total", "version"]);
    expect(Object.keys(input.holdings[0]).sort()).toEqual(
      ["avgCost", "cost", "name", "pnl", "price", "returnRate", "shares", "symbol"].sort(),
    );
  });
});

describe("buildInsightInput（給之後的記帳本用）", () => {
  test("記帳本已算好含費用的持有成本與未實現損益時，照用不重算", () => {
    // product-spec 3.7 的範例：剩 1500 股、平均成本 550.7835、持有成本 826,175.25、參考價 620 → 未實現 99,709.75
    const input = buildInsightInput(
      [{ symbol: "2330", name: "台積電", shares: 1500, avgCost: 550.7835, price: 620, cost: 826_175.25, pnl: 99_709.75 }],
      { feesIncluded: true },
    );
    expect(input.feesIncluded).toBe(true);
    expect(input.holdings[0].cost).toBe(826_175.25);
    expect(input.holdings[0].pnl).toBe(99_709.75);
    expect(input.holdings[0].returnRate).toBeCloseTo(99_709.75 / 826_175.25, 10);
    expect(input.total.pnl).toBe(99_709.75);
  });

  test("成本為 0 時報酬率是 0，不會除以零", () => {
    const input = buildInsightInput([{ symbol: "2330", name: "台積電", shares: 100, avgCost: 0, price: 520, cost: 0, pnl: 52_000 }]);
    expect(input.holdings[0].returnRate).toBe(0);
    expect(input.total.returnRate).toBe(0);
  });
});
