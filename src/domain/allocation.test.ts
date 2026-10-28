import { computeAllocation, toDisplayPercents } from "./allocation";
import { makeTx } from "./ledgerTestData";
import type { SecurityType } from "./ledgerTypes";
import { computePosition } from "./position";

const TODAY = "2026-10-27";

function holding(symbol: string, type: SecurityType, shares: number, price: number | null) {
  const txs = [makeTx({ symbol, side: "buy", tradeDate: "2026-01-05", price: 100, shares, fee: 0 })];
  return computePosition(symbol, txs, [], { type, today: TODAY, price });
}

// 手算：2330 市值 1000 × 600 = 600,000；0050 2000 × 150 = 300,000；2317 1000 × 100 = 100,000；
// 總市值 1,000,000，各占 60%、30%、10%
const tsmc = holding("2330", "stock", 1000, 600);
const etf = holding("0050", "etf", 2000, 150);
const honhai = holding("2317", "stock", 1000, 100);

function ratios<K extends string>(slices: { key: K; ratio: number }[]): Record<string, number> {
  return Object.fromEntries(slices.map((s) => [s.key, s.ratio]));
}

describe("computeAllocation（P2-07 配置圖，對應 docs/stories/017）", () => {
  test("核心／衛星、個股／ETF、每檔持股的市值占比", () => {
    const a = computeAllocation([honhai, tsmc, etf], []);
    expect(a.totalMarketValue).toBe(1_000_000);
    // 預設 ETF → 核心、個股 → 衛星：核心 300,000（30%），衛星 700,000（70%）
    expect(a.byBucket).toEqual([
      { key: "core", marketValue: 300_000, ratio: 0.3 },
      { key: "satellite", marketValue: 700_000, ratio: 0.7 },
    ]);
    expect(a.byType).toEqual([
      { key: "stock", marketValue: 700_000, ratio: 0.7 },
      { key: "etf", marketValue: 300_000, ratio: 0.3 },
    ]);
    // 每檔依市值由大到小
    expect(a.byHolding.map((h) => [h.key, h.ratio, h.bucket, h.type])).toEqual([
      ["2330", 0.6, "satellite", "stock"],
      ["0050", 0.3, "core", "etf"],
      ["2317", 0.1, "satellite", "stock"],
    ]);
    expect(a.missingPriceCount).toBe(0);
  });

  test("規格 AC：配置比例加總為 100%", () => {
    const a = computeAllocation([honhai, tsmc, etf], []);
    const sum = (xs: { ratio: number }[]) => xs.reduce((s, x) => s + x.ratio, 0);
    expect(sum(a.byBucket)).toBeCloseTo(1, 12);
    expect(sum(a.byType)).toBeCloseTo(1, 12);
    expect(sum(a.byHolding)).toBeCloseTo(1, 12);
  });

  test("使用者把 2317 改成核心：核心／衛星改變，個股／ETF 不變（M-06）", () => {
    const a = computeAllocation([honhai, tsmc, etf], [{ symbol: "2317", bucket: "core" }]);
    // 手算：核心 300,000 + 100,000 = 400,000（40%），衛星 600,000（60%）
    expect(ratios(a.byBucket)).toEqual({ core: 0.4, satellite: 0.6 });
    expect(ratios(a.byType)).toEqual({ stock: 0.7, etf: 0.3 });
  });

  test("已出清的持股不出現在配置圖", () => {
    const txs = [
      makeTx({ symbol: "2454", side: "buy", tradeDate: "2026-01-05", price: 1000, shares: 1000, fee: 0 }),
      makeTx({ symbol: "2454", side: "sell", tradeDate: "2026-03-05", price: 1100, shares: 1000, fee: 0, tax: 0 }),
    ];
    const closed = computePosition("2454", txs, [], { type: "stock", today: TODAY, price: 1200 });
    const a = computeAllocation([tsmc, closed], []);
    expect(a.byHolding.map((h) => h.key)).toEqual(["2330"]);
    expect(a.totalMarketValue).toBe(600_000);
  });

  test("持有中但缺價格：不計入配置，回報檔數", () => {
    const a = computeAllocation([tsmc, etf, holding("2317", "stock", 1000, null)], []);
    // 手算：只剩 2330 600,000 與 0050 300,000，總市值 900,000 → 2/3 與 1/3
    expect(a.totalMarketValue).toBe(900_000);
    expect(ratios(a.byHolding)).toEqual({ "2330": 600_000 / 900_000, "0050": 300_000 / 900_000 });
    expect(a.missingPriceCount).toBe(1);
  });

  test("只有個股：核心這一塊是 0%，仍然列出", () => {
    const a = computeAllocation([tsmc], []);
    expect(a.byBucket).toEqual([
      { key: "core", marketValue: 0, ratio: 0 },
      { key: "satellite", marketValue: 600_000, ratio: 1 },
    ]);
  });

  test("沒有可計入的持股：全部是空的，不會除以 0", () => {
    expect(computeAllocation([], [])).toEqual({
      totalMarketValue: 0,
      byBucket: [],
      byType: [],
      byHolding: [],
      missingPriceCount: 0,
    });
    expect(computeAllocation([holding("2330", "stock", 1000, null)], []).missingPriceCount).toBe(1);
  });
});

describe("toDisplayPercents（顯示到小數點後 2 位，加總剛好 100.00%）", () => {
  test("三等分：各自四捨五入會是 33.33% × 3 = 99.99%，補到第一塊", () => {
    // 手算：1/3 = 33.3333…%，全部捨去是 33.33 × 3 = 99.99，差 0.01 給餘數最大（同分取第一個）的那塊
    expect(toDisplayPercents([1 / 3, 1 / 3, 1 / 3])).toEqual([33.34, 33.33, 33.33]);
  });

  test("可以整除的不變；浮點誤差不會少一格", () => {
    expect(toDisplayPercents([0.6, 0.3, 0.1])).toEqual([60, 30, 10]);
    // 0.29 × 10000 在浮點數是 2899.9999999999995
    expect(toDisplayPercents([0.29, 0.71])).toEqual([29, 71]);
  });

  test("差額給捨去最多的那塊", () => {
    // 手算：2/3 = 66.6666…%、1/6 = 16.6666…%、1/6 = 16.6666…%；捨去後 66.66 + 16.66 + 16.66 = 99.98，
    // 差 0.02：三塊餘數相同（0.0066…），依序補給前兩塊
    const shown = toDisplayPercents([2 / 3, 1 / 6, 1 / 6]);
    expect(shown).toEqual([66.67, 16.67, 16.66]);
    expect(shown.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 10);
  });

  test("空陣列", () => {
    expect(toDisplayPercents([])).toEqual([]);
  });
});
