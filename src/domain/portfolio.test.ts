import { makeDividend, makeTx, spec37 } from "./ledgerTestData";
import { bucketOf, defaultBucket, summarize, type GroupSummary } from "./portfolio";
import { computePosition } from "./position";

const TODAY = "2026-10-27";

// 3.7 範例的 2330（個股）＋ 0050（ETF）＋ 已出清的 2317（個股）
const tsmc = computePosition("2330", [spec37.step1, spec37.step2, spec37.step3], [spec37.step4], {
  type: "stock",
  today: TODAY,
  price: spec37.price,
});
const etf = computePosition(
  "0050",
  [makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-01-10", price: 150, shares: 30, fee: 6 })],
  [makeDividend({ symbol: "0050", type: "cash", exDate: "2026-07-15", cashAmount: 45 })],
  { type: "etf", today: TODAY, price: 200 },
);
const closed = computePosition(
  "2317",
  [
    makeTx({ symbol: "2317", side: "buy", tradeDate: "2026-02-01", price: 200, shares: 1000, fee: 285 }),
    makeTx({ symbol: "2317", side: "sell", tradeDate: "2026-04-01", price: 180, shares: 1000, fee: 256, tax: 540 }),
  ],
  [],
  { type: "stock", today: TODAY, price: null },
);

const AMOUNT_KEYS = [
  "invested",
  "marketValue",
  "realizedPnl",
  "unrealizedPnl",
  "cashDividends",
  "totalReturn",
] as const satisfies readonly (keyof GroupSummary)[];

describe("defaultBucket / bucketOf（M-06）", () => {
  test("ETF 預設核心、個股預設衛星", () => {
    expect(defaultBucket("etf")).toBe("core");
    expect(defaultBucket("stock")).toBe("satellite");
    expect(bucketOf(etf, [])).toBe("core");
    expect(bucketOf(tsmc, [])).toBe("satellite");
  });

  test("使用者的設定優先", () => {
    expect(bucketOf(tsmc, [{ symbol: "2330", bucket: "core" }])).toBe("core");
    expect(bucketOf(etf, [{ symbol: "0050", bucket: "satellite" }])).toBe("satellite");
  });
});

describe("summarize（M-05，對應 docs/stories/006）", () => {
  test("只有 3.7 範例：整體數字等於 2330 本身", () => {
    const { overall, satellite, core } = summarize([tsmc], []);
    expect(overall.invested).toBe(1_101_567);
    expect(overall.marketValue).toBe(930_000);
    expect(overall.realizedPnl).toBeCloseTo(48_170.25, 6);
    expect(overall.unrealizedPnl).toBeCloseTo(99_709.75, 6);
    expect(overall.cashDividends).toBe(5000);
    expect(overall.totalReturn).toBeCloseTo(152_880, 6);
    expect(overall.returnRate).toBeCloseTo(0.1388, 4);
    expect(satellite).toEqual(overall);
    expect(core.holdingCount).toBe(0);
    expect(core.returnRate).toBeNull(); // 累計投入 0
  });

  test("核心 + 衛星的各項金額加總等於整體", () => {
    const { overall, core, satellite } = summarize([tsmc, etf, closed], []);
    for (const key of AMOUNT_KEYS) {
      expect((core[key] ?? NaN) + (satellite[key] ?? NaN)).toBeCloseTo(overall[key] ?? NaN, 6);
    }
    expect(core.holdingCount + satellite.holdingCount).toBe(overall.holdingCount);
  });

  test("0050 在核心、2330 與已出清的 2317 在衛星", () => {
    const { core, satellite, overall } = summarize([tsmc, etf, closed], []);
    // 0050：投入 4,506；市值 6,000；預估費用 8 + 6；未實現 1,480；股利 45
    expect(core.invested).toBe(4506);
    expect(core.marketValue).toBe(6000);
    expect(core.unrealizedPnl).toBe(1480);
    expect(core.totalReturn).toBe(1525);
    // 2317 已出清：已實現 180,000 − 256 − 540 − 200,285 = −21,081，市值算 0
    expect(satellite.realizedPnl).toBeCloseTo(48_170.25 - 21_081, 6);
    expect(satellite.marketValue).toBe(930_000);
    expect(satellite.holdingCount).toBe(1);
    expect(overall.holdingCount).toBe(2);
  });

  test("把 2330 從衛星改成核心，數字跟著移過去", () => {
    const { core, satellite } = summarize([tsmc, etf], [{ symbol: "2330", bucket: "core" }]);
    expect(core.holdingCount).toBe(2);
    expect(core.marketValue).toBe(936_000);
    expect(satellite.holdingCount).toBe(0);
    expect(satellite.invested).toBe(0);
  });

  test("有持股缺少價格：市值與未實現不計入那檔，總報酬與報酬率是 null，並回報檔數", () => {
    const noPrice = computePosition(
      "2330",
      [spec37.step1, spec37.step2, spec37.step3],
      [spec37.step4],
      { type: "stock", today: TODAY, price: null },
    );
    const { overall, core, satellite } = summarize([noPrice, etf], []);
    expect(overall.missingPriceCount).toBe(1);
    expect(overall.marketValue).toBe(6000);
    expect(overall.unrealizedPnl).toBe(1480);
    expect(overall.totalReturn).toBeNull();
    expect(overall.returnRate).toBeNull();
    expect(satellite.totalReturn).toBeNull();
    // 不受影響的那一組照常算
    expect(core.totalReturn).toBe(1525);
  });

  test("已出清的持股沒有價格不算「缺少價格」", () => {
    const { overall } = summarize([closed], []);
    expect(overall.missingPriceCount).toBe(0);
    expect(overall.totalReturn).toBe(-21_081);
  });

  test("沒有任何持股：全部是 0，報酬率 null", () => {
    const { overall } = summarize([], []);
    expect(overall).toEqual({
      invested: 0,
      marketValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      cashDividends: 0,
      totalReturn: 0,
      returnRate: null,
      holdingCount: 0,
      missingPriceCount: 0,
    });
  });
});
