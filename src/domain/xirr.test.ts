import { makeDividend, makeTx } from "./ledgerTestData";
import { computePosition } from "./position";
import {
  portfolioAnnualizedReturns,
  positionAnnualizedReturn,
  positionCashFlows,
  xirr,
  type CashFlow,
} from "./xirr";

const TODAY = "2026-10-27";

describe("xirr（P2-04，對應 docs/stories/020）", () => {
  test("規格 AC：一年前投入 100,000、今天價值 110,000 → 10.00%", () => {
    // 手算：2025-10-27 → 2026-10-27 是 365 天（剛好 1 年），110,000 ÷ 100,000 − 1 = 0.1
    const rate = xirr([
      { date: "2025-10-27", amount: -100_000 },
      { date: "2026-10-27", amount: 110_000 },
    ]);
    expect(rate).toBeCloseTo(0.1, 10);
  });

  test("兩年：賺 21% 年化是 10%，賠 19% 年化是 −10%", () => {
    // 手算：2024-10-27 → 2026-10-27 是 730 天（2 年）。√1.21 − 1 = 0.1；√0.81 − 1 = −0.1
    expect(
      xirr([
        { date: "2024-10-27", amount: -100_000 },
        { date: "2026-10-27", amount: 121_000 },
      ]),
    ).toBeCloseTo(0.1, 10);
    expect(
      xirr([
        { date: "2024-10-27", amount: -100_000 },
        { date: "2026-10-27", amount: 81_000 },
      ]),
    ).toBeCloseTo(-0.1, 10);
  });

  // 驗算來源：Microsoft 支援文件「XIRR 函數」的範例，Excel 結果 0.373362535（37.34%）。
  // 另用 Python 獨立寫的二分法（一年 365 天）算出 0.3733625335，一致。
  const excelExample: CashFlow[] = [
    { date: "2008-01-01", amount: -10_000 },
    { date: "2008-03-01", amount: 2750 },
    { date: "2008-10-30", amount: 4250 },
    { date: "2009-02-15", amount: 3250 },
    { date: "2009-04-01", amount: 2750 },
  ];

  test("多筆現金流：Excel 文件範例 → 0.373362535", () => {
    expect(xirr(excelExample)).toBeCloseTo(0.373362535, 8);
  });

  test("現金流不需要先排序", () => {
    expect(xirr([...excelExample].reverse())).toBeCloseTo(0.373362535, 8);
  });

  test("牛頓法跳到 −100% 以下時改用二分法", () => {
    // 從 10% 起算，牛頓法第一步就跳到約 −121,000（< −100%），只能靠二分法。
    // 手算：一年後只剩 1 元，1 ÷ 100,000 − 1 = −0.99999
    const rate = xirr([
      { date: "2025-10-27", amount: -100_000 },
      { date: "2026-10-27", amount: 1 },
    ]);
    expect(rate).toBeCloseTo(-0.99999, 8);
  });

  test("牛頓法和二分法都找不到解 → null（畫面顯示 —）", () => {
    // 手算：以 x = 1 / (1 + r) 表示，NPV = 100 − 300x + 250x²；
    // 判別式 300² − 4 × 250 × 100 = −10,000 < 0，任何利率 NPV 都大於 0，沒有解
    expect(
      xirr([
        { date: "2024-10-27", amount: 100 },
        { date: "2025-10-27", amount: -300 },
        { date: "2026-10-27", amount: 250 },
      ]),
    ).toBeNull();
  });

  test("全部在同一天 → null", () => {
    expect(
      xirr([
        { date: TODAY, amount: -100_000 },
        { date: TODAY, amount: 99_734 },
      ]),
    ).toBeNull();
  });

  test("只有投入沒有拿回（或反過來）→ null", () => {
    expect(xirr([{ date: "2025-01-02", amount: -100 }, { date: TODAY, amount: -50 }])).toBeNull();
    expect(xirr([{ date: "2025-01-02", amount: 100 }])).toBeNull();
    expect(xirr([])).toBeNull();
  });
});

// 3.7 範例的四筆紀錄，日期往前移到兩年多前，才會超過一年
const tsmcTxs = [
  makeTx({ side: "buy", tradeDate: "2024-01-05", price: 600, shares: 1000, fee: 855 }),
  makeTx({ side: "buy", tradeDate: "2024-07-05", price: 500, shares: 1000, fee: 712 }),
  makeTx({ side: "sell", tradeDate: "2025-03-05", price: 650, shares: 500, fee: 463, tax: 975 }),
];
const tsmcDividends = [makeDividend({ type: "cash", exDate: "2025-07-15", payDate: "2025-08-15", cashAmount: 5000 })];
const tsmc = computePosition("2330", tsmcTxs, tsmcDividends, { type: "stock", today: TODAY, price: 620 });

// 0050 一年前買 1000 股 @ 100（手續費手動改成 0），今天 110
const etfTxs = [makeTx({ symbol: "0050", side: "buy", tradeDate: "2025-10-27", price: 100, shares: 1000, fee: 0 })];
const etf = computePosition("0050", etfTxs, [], { type: "etf", today: TODAY, price: 110 });

const allTxs = [...tsmcTxs, ...etfTxs];

describe("positionCashFlows", () => {
  test("買入、賣出、現金股利（用發放日）與期末價值", () => {
    // 期末：市值 620 × 1500 = 930,000；預估手續費 floor(1,325.25) = 1,325、證交稅 2,790 → 925,885
    expect(positionCashFlows(tsmc, allTxs, tsmcDividends, TODAY)).toEqual([
      { date: "2024-01-05", amount: -600_855 },
      { date: "2024-07-05", amount: -500_712 },
      { date: "2025-03-05", amount: 323_562 },
      { date: "2025-08-15", amount: 5000 },
      { date: TODAY, amount: 925_885 },
    ]);
  });

  test("沒有發放日的現金股利用除息日；股票股利與預估股利不是現金流", () => {
    const dividends = [
      makeDividend({ type: "cash", exDate: "2025-07-15", cashAmount: 5000 }),
      makeDividend({ type: "stock", exDate: "2025-07-15", stockShares: 50 }),
      makeDividend({ type: "cash", exDate: "2026-07-15", cashAmount: 3000, status: "estimated" }),
    ];
    const flows = positionCashFlows(tsmc, allTxs, dividends, TODAY);
    expect(flows).toContainEqual({ date: "2025-07-15", amount: 5000 });
    expect(flows?.filter((f) => f.date.startsWith("2026-07"))).toEqual([]);
  });

  test("已出清：沒有期末那一筆", () => {
    const txs = [
      makeTx({ symbol: "2317", side: "buy", tradeDate: "2024-10-27", price: 100, shares: 1000, fee: 0 }),
      makeTx({ symbol: "2317", side: "sell", tradeDate: "2025-10-27", price: 110, shares: 1000, fee: 0, tax: 0 }),
    ];
    const closed = computePosition("2317", txs, [], { type: "stock", today: TODAY, price: null });
    expect(positionCashFlows(closed, txs, [], TODAY)).toEqual([
      { date: "2024-10-27", amount: -100_000 },
      { date: "2025-10-27", amount: 110_000 },
    ]);
  });

  test("持有中但沒有價格 → null", () => {
    const noPrice = computePosition("2330", tsmcTxs, [], { type: "stock", today: TODAY, price: null });
    expect(positionCashFlows(noPrice, tsmcTxs, [], TODAY)).toBeNull();
  });
});

describe("positionAnnualizedReturn", () => {
  test("3.7 範例的紀錄放在兩年多前 → 6.26%", () => {
    // 驗算來源：Python 獨立寫的二分法（一年 365 天，和 Excel XIRR 相同慣例）算出 0.06259215700870435。
    // 要用試算表複核，可貼上：
    // =XIRR({-600855;-500712;323562;5000;925885},{DATE(2024,1,5);DATE(2024,7,5);DATE(2025,3,5);DATE(2025,8,15);DATE(2026,10,27)})
    const result = positionAnnualizedReturn(tsmc, allTxs, tsmcDividends, TODAY);
    expect(result.kind).toBe("rate");
    if (result.kind === "rate") expect(result.rate).toBeCloseTo(0.062592157, 8);
  });

  test("持有 200 天 → 持有未滿一年（規格 AC）", () => {
    // 2026-04-10 → 2026-10-27 是 200 天
    const txs = [makeTx({ side: "buy", tradeDate: "2026-04-10", price: 500, shares: 1000, fee: 712 })];
    const p = computePosition("2330", txs, [], { type: "stock", today: TODAY, price: 600 });
    expect(positionAnnualizedReturn(p, txs, [], TODAY)).toEqual({ kind: "underOneYear" });
  });

  test("滿 364 天仍是未滿一年，滿 365 天開始顯示", () => {
    const at = (tradeDate: string) => {
      const txs = [makeTx({ symbol: "0050", side: "buy", tradeDate, price: 100, shares: 1000, fee: 0 })];
      const p = computePosition("0050", txs, [], { type: "etf", today: TODAY, price: 110 });
      return positionAnnualizedReturn(p, txs, [], TODAY);
    };
    expect(at("2025-10-28")).toEqual({ kind: "underOneYear" });
    expect(at("2025-10-27").kind).toBe("rate");
  });

  test("今天才買：全部在同一天 → 持有未滿一年", () => {
    const txs = [makeTx({ side: "buy", tradeDate: TODAY, price: 600, shares: 1000, fee: 855 })];
    const p = computePosition("2330", txs, [], { type: "stock", today: TODAY, price: 600 });
    expect(positionAnnualizedReturn(p, txs, [], TODAY)).toEqual({ kind: "underOneYear" });
  });

  test("已出清的持股照算：一年賺 10% → 10.00%", () => {
    // 手算：2024-10-27 投入 100,000，2025-10-27 賣出拿回 110,000（費用設 0），剛好一年 → 10%
    const txs = [
      makeTx({ symbol: "2317", side: "buy", tradeDate: "2024-10-27", price: 100, shares: 1000, fee: 0 }),
      makeTx({ symbol: "2317", side: "sell", tradeDate: "2025-10-27", price: 110, shares: 1000, fee: 0, tax: 0 }),
    ];
    const closed = computePosition("2317", txs, [], { type: "stock", today: TODAY, price: null });
    const result = positionAnnualizedReturn(closed, txs, [], TODAY);
    expect(result.kind).toBe("rate");
    if (result.kind === "rate") expect(result.rate).toBeCloseTo(0.1, 10);
  });

  test("持有中但沒有價格 → —", () => {
    const noPrice = computePosition("2330", tsmcTxs, [], { type: "stock", today: TODAY, price: null });
    expect(positionAnnualizedReturn(noPrice, tsmcTxs, [], TODAY)).toEqual({ kind: "unavailable" });
  });
});

describe("portfolioAnnualizedReturns（整體、核心、衛星）", () => {
  test("核心、衛星各自算，整體把兩組的現金流合在一起算", () => {
    const result = portfolioAnnualizedReturns([tsmc, etf], allTxs, tsmcDividends, [], TODAY);
    // 核心＝0050。手算：期末市值 110,000，預估手續費 floor(156.75) = 156、證交稅 floor(110) = 110，
    // 拿回 109,734；剛好一年 → 109,734 ÷ 100,000 − 1 = 0.09734
    expect(result.core).toEqual({ kind: "rate", rate: expect.closeTo(0.09734, 10) });
    // 衛星＝2330，和上面單一持股的 6.26% 相同
    expect(result.satellite).toEqual({ kind: "rate", rate: expect.closeTo(0.062592157, 8) });
    // 驗算來源：Python 獨立二分法算出 0.06388785108010564。試算表複核：
    // =XIRR({-600855;-500712;323562;5000;-100000;925885;109734},{DATE(2024,1,5);DATE(2024,7,5);DATE(2025,3,5);DATE(2025,8,15);DATE(2025,10,27);DATE(2026,10,27);DATE(2026,10,27)})
    expect(result.overall).toEqual({ kind: "rate", rate: expect.closeTo(0.063887851, 8) });
  });

  test("使用者把 2330 改成核心：衛星沒有持股 → —", () => {
    const result = portfolioAnnualizedReturns([tsmc, etf], allTxs, tsmcDividends, [{ symbol: "2330", bucket: "core" }], TODAY);
    expect(result.satellite).toEqual({ kind: "unavailable" });
    expect(result.core).toEqual({ kind: "rate", rate: expect.closeTo(0.063887851, 8) });
  });

  test("某一組有持股缺價格：那一組和整體都是 —，另一組照算", () => {
    const etfNoPrice = computePosition("0050", etfTxs, [], { type: "etf", today: TODAY, price: null });
    const result = portfolioAnnualizedReturns([tsmc, etfNoPrice], allTxs, tsmcDividends, [], TODAY);
    expect(result.core).toEqual({ kind: "unavailable" });
    expect(result.overall).toEqual({ kind: "unavailable" });
    expect(result.satellite.kind).toBe("rate");
  });

  test("整體的第一筆超過一年，但核心這組未滿一年", () => {
    const newEtfTxs = [makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-04-10", price: 100, shares: 1000, fee: 0 })];
    const newEtf = computePosition("0050", newEtfTxs, [], { type: "etf", today: TODAY, price: 110 });
    const result = portfolioAnnualizedReturns([tsmc, newEtf], [...tsmcTxs, ...newEtfTxs], tsmcDividends, [], TODAY);
    expect(result.core).toEqual({ kind: "underOneYear" });
    expect(result.overall.kind).toBe("rate");
  });

  test("沒有任何持股 → 三組都是 —", () => {
    expect(portfolioAnnualizedReturns([], [], [], [], TODAY)).toEqual({
      overall: { kind: "unavailable" },
      core: { kind: "unavailable" },
      satellite: { kind: "unavailable" },
    });
  });
});
