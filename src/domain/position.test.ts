import { calcFee, DEFAULT_USER_SETTINGS } from "./fees";
import { makeDividend, makeTx, spec37 } from "./ledgerTestData";
import { computePosition, LedgerReplayError, simpleReturnRate } from "./position";
import { formatReturnRate } from "./pnl";

const TODAY = "2026-10-27";
const stock = { type: "stock" as const, today: TODAY };

describe("computePosition：product-spec 3.7 驗收範例（對應 docs/stories/006）", () => {
  const { step1, step2, step3, step4, price } = spec37;

  test("步驟 1：買 1000 股 @ 600 → 持有 1000 股、成本 600,855", () => {
    const p = computePosition("2330", [step1], [], stock);
    expect(p.shares).toBe(1000);
    expect(p.costBasis).toBe(600_855);
    expect(p.averageCost).toBeCloseTo(600.855, 10);
  });

  test("步驟 2：再買 1000 股 @ 500 → 2000 股、成本 1,101,567、平均成本 550.7835", () => {
    const p = computePosition("2330", [step1, step2], [], stock);
    expect(p.shares).toBe(2000);
    expect(p.costBasis).toBe(1_101_567);
    expect(p.averageCost).toBeCloseTo(550.7835, 10);
    expect(p.invested).toBe(1_101_567);
  });

  test("步驟 3：賣 500 股 @ 650 → 已實現 48,170.25，剩 1500 股、成本 826,175.25，平均成本不變", () => {
    const p = computePosition("2330", [step1, step2, step3], [], stock);
    expect(p.realizedPnl).toBeCloseTo(48_170.25, 6);
    expect(p.shares).toBe(1500);
    expect(p.costBasis).toBeCloseTo(826_175.25, 6);
    expect(p.averageCost).toBeCloseTo(550.7835, 10);
    expect(p.invested).toBe(1_101_567);
  });

  test("步驟 4：領現金股利 5,000 → 已領股利 5,000，持有成本不變", () => {
    const p = computePosition("2330", [step1, step2, step3], [step4], stock);
    expect(p.cashDividends).toBe(5000);
    expect(p.costBasis).toBeCloseTo(826_175.25, 6);
  });

  test("步驟 5：參考價 620 → 市值 930,000、預估費用 1,325 + 2,790、未實現 99,709.75", () => {
    const p = computePosition("2330", [step1, step2, step3], [step4], { ...stock, price });
    expect(p.marketValue).toBe(930_000);
    expect(p.estimatedSellCosts).toBe(1325 + 2790);
    expect(p.unrealizedPnl).toBeCloseTo(99_709.75, 6);
  });

  test("彙總：總報酬 152,880、累計投入 1,101,567、簡單報酬率 13.88%", () => {
    const p = computePosition("2330", [step1, step2, step3], [step4], { ...stock, price });
    expect(p.totalReturn).toBeCloseTo(152_880, 6);
    expect(p.invested).toBe(1_101_567);
    expect(p.returnRate).toBeCloseTo(152_880 / 1_101_567, 12);
    expect(formatReturnRate(p.returnRate!)).toBe("+13.88%");
  });

  test("交易輸入順序不影響結果：依交易日期重播", () => {
    const p = computePosition("2330", [step3, step2, step1], [step4], { ...stock, price });
    expect(p.realizedPnl).toBeCloseTo(48_170.25, 6);
    expect(p.totalReturn).toBeCloseTo(152_880, 6);
  });

  test("只看指定代號的紀錄", () => {
    const other = makeTx({ symbol: "2317", side: "buy", price: 100, shares: 1000, fee: 142 });
    const otherDiv = makeDividend({ symbol: "2317", type: "cash", cashAmount: 999 });
    const p = computePosition("2330", [step1, other], [otherDiv], stock);
    expect(p.shares).toBe(1000);
    expect(p.cashDividends).toBe(0);
  });
});

describe("computePosition：股利（M-03）", () => {
  const buy = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 99.8, shares: 1000, fee: 200 });

  test("現金股利 5,000 → 總報酬 +5,000，持有成本與平均成本不變", () => {
    const before = computePosition("2330", [buy], [], { ...stock, price: 120 });
    const cash = makeDividend({ type: "cash", exDate: "2026-07-01", cashAmount: 5000 });
    const after = computePosition("2330", [buy], [cash], { ...stock, price: 120 });
    expect(after.totalReturn! - before.totalReturn!).toBeCloseTo(5000, 6);
    expect(after.costBasis).toBe(before.costBasis);
    expect(after.averageCost).toBe(before.averageCost);
  });

  test("持有 1000 股、成本 100,000，配股 100 股 → 1100 股、成本不變、平均成本 90.909…", () => {
    const stockDiv = makeDividend({ type: "stock", exDate: "2026-07-01", stockShares: 100 });
    const p = computePosition("2330", [buy], [stockDiv], stock);
    expect(p.shares).toBe(1100);
    expect(p.costBasis).toBe(100_000);
    expect(p.averageCost).toBeCloseTo(90.909090909, 8);
    expect(p.averageCost!.toFixed(2)).toBe("90.91");
  });

  test("股票股利在除權息日當天、所有交易之前套用", () => {
    const stockDiv = makeDividend({ type: "stock", exDate: "2026-07-01", stockShares: 100 });
    // 除權息日當天賣出 1100 股：股利先套用才夠賣
    const sameDaySell = makeTx({ side: "sell", tradeDate: "2026-07-01", price: 100, shares: 1100, fee: 156, tax: 330 });
    const p = computePosition("2330", [buy, sameDaySell], [stockDiv], stock);
    expect(p.shares).toBe(0);
    expect(p.realizedPnl).toBe(110_000 - 156 - 330 - 100_000);
  });

  test("同一天的交易依建立時間排序：先賣光再買，持有天數從那天算", () => {
    const sell = makeTx({ side: "sell", tradeDate: "2026-07-01", price: 110, shares: 1000, fee: 156, tax: 330 });
    const rebuy = makeTx({ side: "buy", tradeDate: "2026-07-01", price: 110, shares: 1000, fee: 156 });
    const p = computePosition("2330", [rebuy, buy, sell], [], stock);
    expect(p.shares).toBe(1000);
    expect(p.costBasis).toBe(110_156);
    expect(p.holdingSince).toBe("2026-07-01");
  });

  test("estimated 狀態的股利不計入（Phase 2 預留）", () => {
    const est = makeDividend({ type: "cash", cashAmount: 5000, status: "estimated" });
    const p = computePosition("2330", [buy], [est], stock);
    expect(p.cashDividends).toBe(0);
  });
});

describe("computePosition：賣光再買、持有天數（規格 3.3、3.6）", () => {
  const buy1 = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 100, shares: 1000, fee: 142 });
  const sellAll = makeTx({ side: "sell", tradeDate: "2026-02-02", price: 120, shares: 1000, fee: 171, tax: 360 });
  const buy2 = makeTx({ side: "buy", tradeDate: "2026-03-02", price: 200, shares: 1000, fee: 285 });

  test("賣光後持有成本歸零、平均成本與持有天數是 null，已出清的總報酬照算", () => {
    const p = computePosition("2330", [buy1, sellAll], [], stock);
    expect(p.shares).toBe(0);
    expect(p.costBasis).toBe(0);
    expect(p.averageCost).toBeNull();
    expect(p.holdingSince).toBeNull();
    expect(p.holdingDays).toBeNull();
    expect(p.realizedPnl).toBe(120_000 - 171 - 360 - 100_142);
    expect(p.marketValue).toBe(0);
    expect(p.unrealizedPnl).toBe(0);
    expect(p.totalReturn).toBe(p.realizedPnl);
  });

  test("再買：平均成本只看新的買入，持有天數從新的第一筆買入算", () => {
    const p = computePosition("2330", [buy1, sellAll, buy2], [], stock);
    expect(p.averageCost).toBeCloseTo(200.285, 10);
    expect(p.holdingSince).toBe("2026-03-02");
    expect(p.holdingDays).toBe(239); // 2026-03-02 → 2026-10-27
    expect(p.invested).toBe(100_142 + 200_285);
  });

  test("持有中再加碼，持有天數仍從這一段的第一筆算", () => {
    const add = makeTx({ side: "buy", tradeDate: "2026-05-01", price: 210, shares: 1000, fee: 299 });
    const p = computePosition("2330", [buy2, add], [], stock);
    expect(p.holdingSince).toBe("2026-03-02");
  });

  test("當天買入是 0 天", () => {
    const today = makeTx({ side: "buy", tradeDate: TODAY, price: 100, shares: 1000, fee: 142 });
    expect(computePosition("2330", [today], [], stock).holdingDays).toBe(0);
  });

  test("賣光時不留浮點殘值", () => {
    const a = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 33.33, shares: 3, fee: 1 });
    const b = makeTx({ side: "sell", tradeDate: "2026-01-03", price: 35, shares: 1, fee: 1 });
    const c = makeTx({ side: "sell", tradeDate: "2026-01-04", price: 35, shares: 2, fee: 1 });
    const p = computePosition("2330", [a, b, c], [], stock);
    expect(p.costBasis).toBe(0);
  });
});

describe("computePosition：沒有價格", () => {
  test("持有中沒有價格 → 市值、未實現、總報酬、報酬率都是 null，不是 0", () => {
    const { step1, step2, step3, step4 } = spec37;
    const p = computePosition("2330", [step1, step2, step3], [step4], { ...stock, price: null });
    expect(p.marketValue).toBeNull();
    expect(p.estimatedSellCosts).toBeNull();
    expect(p.unrealizedPnl).toBeNull();
    expect(p.totalReturn).toBeNull();
    expect(p.returnRate).toBeNull();
    // 不需要價格的數字照常算
    expect(p.realizedPnl).toBeCloseTo(48_170.25, 6);
    expect(p.cashDividends).toBe(5000);
  });

  test("完全沒有紀錄：持股 0、報酬率 null（累計投入為 0）", () => {
    const p = computePosition("2330", [], [], stock);
    expect(p.shares).toBe(0);
    expect(p.invested).toBe(0);
    expect(p.returnRate).toBeNull();
  });
});

describe("computePosition：設定與證交稅率", () => {
  const buy = makeTx({ side: "buy", price: 600, shares: 1000, fee: calcFee(600_000, 1000, DEFAULT_USER_SETTINGS) });

  test("改設定不影響舊交易（M-09）：已存的手續費 855 不重算", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 };
    const p = computePosition("2330", [buy], [], { ...stock, settings });
    expect(buy.fee).toBe(855);
    expect(p.costBasis).toBe(600_855);
  });

  test("預估賣出手續費用目前的設定：折扣 0.28 → floor(930,000 × 0.001425 × 0.28) = 371", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 };
    const p = computePosition("2330", [buy], [], { ...stock, price: 930, settings });
    expect(p.estimatedSellCosts).toBe(371 + 2790);
  });

  test("ETF 預設證交稅 0.001；也可以用參數覆寫", () => {
    const etfBuy = makeTx({ symbol: "0050", side: "buy", price: 150, shares: 30, fee: 6 });
    const etf = computePosition("0050", [etfBuy], [], { type: "etf", today: TODAY, price: 200 });
    // 市值 6,000：手續費 max(floor(8.55), 1) = 8；證交稅 floor(6) = 6
    expect(etf.estimatedSellCosts).toBe(8 + 6);
    const taxFree = computePosition("0050", [etfBuy], [], { type: "etf", today: TODAY, price: 200, taxRate: 0 });
    expect(taxFree.estimatedSellCosts).toBe(8);
  });
});

describe("computePosition：資料錯誤", () => {
  test("賣出超過持股時丟出 LedgerReplayError（正常流程會先被 validateLedgerChange 擋下）", () => {
    const buy = makeTx({ side: "buy", price: 100, shares: 1000, fee: 142 });
    const sell = makeTx({ id: "bad", side: "sell", tradeDate: "2026-02-01", price: 100, shares: 2000, fee: 285, tax: 600 });
    expect(() => computePosition("2330", [buy, sell], [], stock)).toThrow(LedgerReplayError);
  });
});

describe("simpleReturnRate", () => {
  test("累計投入為 0 或總報酬未知 → null", () => {
    expect(simpleReturnRate(100, 0)).toBeNull();
    expect(simpleReturnRate(null, 100)).toBeNull();
    expect(simpleReturnRate(50, 1000)).toBe(0.05);
  });
});
