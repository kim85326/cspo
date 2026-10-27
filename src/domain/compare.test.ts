import { compareHoldings } from "./compare";

const tsmc = { symbol: "2330", name: "台積電", price: 520 };
const honhai = { symbol: "2317", name: "鴻海", price: 180 };
const mtk = { symbol: "2454", name: "聯發科", price: 1200 };

describe("compareHoldings（對應 docs/stories/003）", () => {
  test("兩檔一賺一虧：賺的排第一，合計為兩者相加", () => {
    const r = compareHoldings([
      { holding: { symbol: "2317", buyPrice: 200, shares: 1000 }, quote: honhai },
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: tsmc },
    ]);

    expect(r.rows.map((row) => row.quote.symbol)).toEqual(["2330", "2317"]);
    expect(r.rows[0].rank).toBe(1);
    expect(r.rows[0].result.pnl).toBe(20_000);
    expect(r.rows[0].result.returnRate).toBeCloseTo(0.04);
    expect(r.rows[1].rank).toBe(2);
    expect(r.rows[1].result.pnl).toBe(-20_000);
    expect(r.rows[1].result.returnRate).toBeCloseTo(-0.1);

    expect(r.total.cost).toBe(700_000);
    expect(r.total.marketValue).toBe(700_000);
    expect(r.total.pnl).toBe(0);
    expect(r.total.returnRate).toBe(0);
  });

  test("用報酬率排名，不是盈虧金額：小額高報酬排在大額低報酬前面", () => {
    const r = compareHoldings([
      // 台積電：成本 500,000，賺 20,000，報酬率 4%
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: tsmc },
      // 鴻海：成本 15,000，賺 3,000，報酬率 20%
      { holding: { symbol: "2317", buyPrice: 150, shares: 100 }, quote: honhai },
    ]);

    expect(r.rows[0].quote.symbol).toBe("2317");
    expect(r.rows[0].result.pnl).toBe(3_000);
    expect(r.rows[1].quote.symbol).toBe("2330");
    expect(r.rows[1].result.pnl).toBe(20_000);
  });

  test("合計報酬率是總盈虧 ÷ 總成本，不是各檔平均", () => {
    const r = compareHoldings([
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: tsmc }, // +4%
      { holding: { symbol: "2317", buyPrice: 150, shares: 100 }, quote: honhai }, // +20%
    ]);
    // (20,000 + 3,000) ÷ (500,000 + 15,000) ≈ 4.47%，而非 (4% + 20%) ÷ 2 = 12%
    expect(r.total.pnl).toBe(23_000);
    expect(r.total.returnRate).toBeCloseTo(23_000 / 515_000);
  });

  test("報酬率相同時，盈虧金額大的排前面", () => {
    const r = compareHoldings([
      { holding: { symbol: "2317", buyPrice: 150, shares: 100 }, quote: honhai }, // +20%, +3,000
      { holding: { symbol: "2454", buyPrice: 1000, shares: 100 }, quote: mtk }, // +20%, +20,000
    ]);
    expect(r.rows.map((row) => row.quote.symbol)).toEqual(["2454", "2317"]);
  });

  test("報酬率與金額都相同時，照輸入順序", () => {
    const r = compareHoldings([
      { holding: { symbol: "2317", buyPrice: 180, shares: 100 }, quote: honhai },
      { holding: { symbol: "2330", buyPrice: 520, shares: 100 }, quote: tsmc },
    ]);
    expect(r.rows.map((row) => row.quote.symbol)).toEqual(["2317", "2330"]);
  });

  test("三檔全部排名正確且排名連續", () => {
    const r = compareHoldings([
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: tsmc }, // +4%
      { holding: { symbol: "2317", buyPrice: 200, shares: 1000 }, quote: honhai }, // -10%
      { holding: { symbol: "2454", buyPrice: 1000, shares: 10 }, quote: mtk }, // +20%
    ]);
    expect(r.rows.map((row) => [row.rank, row.quote.symbol])).toEqual([
      [1, "2454"],
      [2, "2330"],
      [3, "2317"],
    ]);
  });

  test("只有一檔也能比：那一檔就是第一名，合計等於它自己", () => {
    const r = compareHoldings([
      { holding: { symbol: "2330", buyPrice: 500, shares: 1000 }, quote: tsmc },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].rank).toBe(1);
    expect(r.total).toEqual(r.rows[0].result);
  });

  test("空清單：沒有列，合計全為 0", () => {
    const r = compareHoldings([]);
    expect(r.rows).toEqual([]);
    expect(r.total).toEqual({ cost: 0, marketValue: 0, pnl: 0, returnRate: 0 });
  });
});
