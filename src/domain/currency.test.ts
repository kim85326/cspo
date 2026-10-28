import { buildAssetHistory } from "./assetHistory";
import { benchmarkFlows, buildBenchmarkDuel, openingValue } from "./benchmark";
import {
  currencyOf,
  currentFxRate,
  fxRateOf,
  symbolCurrency,
  toTwd,
  twdOnlyFxRate,
} from "./currency";
import { buildDuel } from "./duel";
import { computeAllocation } from "./allocation";
import { DEFAULT_USER_SETTINGS } from "./fees";
import { buildHoldingViews } from "./holdings";
import { makeDividend, makeTx, spec37, spec37Ledger } from "./ledgerTestData";
import type { Dividend, Ledger, Transaction, UserSettings } from "./ledgerTypes";
import { validateLedger, validateLedgerChange } from "./ledgerValidation";
import { summarize } from "./portfolio";
import { computePosition } from "./position";
import { portfolioAnnualizedReturns, positionCashFlows } from "./xirr";

/** 多幣別預留（product-spec 3.8、第 4 章；docs/stories/025，對應實作指南 T1b） */

const TODAY = "2026-10-27";
const stock = { type: "stock" as const, today: TODAY };

/** 3.7 範例的每一筆都明確寫上 currency = TWD、fxRate = 1 */
function withTwd<T extends Transaction | Dividend>(record: T): T {
  return { ...record, market: "TWSE", currency: "TWD", fxRate: 1 };
}

function explicitTwdLedger(): Ledger {
  const ledger = spec37Ledger();
  return {
    ...ledger,
    transactions: ledger.transactions.map(withTwd),
    dividends: ledger.dividends.map(withTwd),
    holdingSettings: [{ symbol: "2330", market: "TWSE", bucket: "core" }],
  };
}

function legacyLedger(): Ledger {
  return { ...spec37Ledger(), holdingSettings: [{ symbol: "2330", bucket: "core" }] };
}

describe("輔助函式", () => {
  test("沒填 currency、fxRate 視為 TWD、1", () => {
    expect(currencyOf({})).toBe("TWD");
    expect(fxRateOf({})).toBe(1);
    expect(currencyOf({ currency: "USD" })).toBe("USD");
    expect(fxRateOf({ currency: "USD", fxRate: 30.5 })).toBe(30.5);
  });

  test("台幣的匯率固定為 1，就算資料上寫了別的值", () => {
    expect(fxRateOf({ currency: "TWD", fxRate: 30 })).toBe(1);
    expect(fxRateOf({ fxRate: 30 })).toBe(1);
  });

  test("toTwd：fxRate 1 原樣回傳，外幣乘以匯率", () => {
    expect(toTwd(0.1 + 0.2)).toBe(0.1 + 0.2);
    expect(toTwd(200, 30)).toBe(6000);
  });

  test("symbolCurrency：取該檔的紀錄，沒有紀錄視為 TWD", () => {
    const usd = makeTx({ symbol: "AAPL", side: "buy", price: 200, shares: 1, currency: "USD", fxRate: 30 });
    expect(symbolCurrency("AAPL", [usd])).toBe("USD");
    expect(symbolCurrency("2330", [usd])).toBe("TWD");
    expect(symbolCurrency("AAPL", [], [makeDividend({ symbol: "AAPL", type: "cash", currency: "USD" })])).toBe("USD");
  });

  test("今天的匯率：台幣固定 1，外幣沒給就是 null", () => {
    expect(currentFxRate("TWD")).toBe(1);
    expect(currentFxRate("TWD", 32)).toBe(1);
    expect(currentFxRate("USD")).toBeNull();
    expect(currentFxRate("USD", 32)).toBe(32);
    expect(twdOnlyFxRate("USD", TODAY)).toBeNull();
  });
});

describe("3.8 驗收：3.7 範例全部加上 currency = TWD、fxRate = 1，結果完全不變", () => {
  const { step1, step2, step3, step4, price } = spec37;
  const twd = [step1, step2, step3].map(withTwd);
  const twdDividends = [withTwd(step4)];

  test("computePosition 的每個數字都跟 3.7 一樣", () => {
    const p = computePosition("2330", twd, twdDividends, { ...stock, price });
    expect(p.realizedPnl).toBeCloseTo(48_170.25, 6);
    expect(p.costBasis).toBeCloseTo(826_175.25, 6);
    expect(p.averageCost).toBeCloseTo(550.7835, 10);
    expect(p.marketValue).toBe(930_000);
    expect(p.estimatedSellCosts).toBe(1325 + 2790);
    expect(p.unrealizedPnl).toBeCloseTo(99_709.75, 6);
    expect(p.totalReturn).toBeCloseTo(152_880, 6);
    expect(p.invested).toBe(1_101_567);
  });

  test("跟沒有多幣別欄位的舊資料算出來一模一樣（逐欄位相等，不是近似）", () => {
    const legacy = computePosition("2330", [step1, step2, step3], [step4], { ...stock, price });
    expect(computePosition("2330", twd, twdDividends, { ...stock, price })).toEqual(legacy);
    // 台幣證券傳了今天的匯率也不影響
    expect(computePosition("2330", twd, twdDividends, { ...stock, price, fxRate: 32 })).toEqual(legacy);
  });

  test("沒有價格時一樣回 null", () => {
    const p = computePosition("2330", twd, twdDividends, stock);
    expect(p.marketValue).toBeNull();
    expect(p.totalReturn).toBeNull();
  });
});

describe("沒有混合幣別時，各個計算的結果跟修改前完全相同", () => {
  const quoteOf = () => ({ price: spec37.price, name: "台積電" });

  test("持股明細、總覽（summarize）、配置、對決 A、XIRR", () => {
    const legacy = legacyLedger();
    const explicit = explicitTwdLedger();
    const legacyViews = buildHoldingViews(legacy, quoteOf, TODAY);
    const explicitViews = buildHoldingViews(explicit, quoteOf, TODAY);
    const positions = (views: typeof legacyViews) => views.map((v) => v.position);

    expect(explicitViews).toEqual(legacyViews);
    expect(summarize(positions(explicitViews), explicit.holdingSettings)).toEqual(
      summarize(positions(legacyViews), legacy.holdingSettings),
    );
    expect(computeAllocation(positions(explicitViews), explicit.holdingSettings)).toEqual(
      computeAllocation(positions(legacyViews), legacy.holdingSettings),
    );
    expect(buildDuel(explicit, explicitViews, TODAY)).toEqual(buildDuel(legacy, legacyViews, TODAY));
    expect(
      portfolioAnnualizedReturns(positions(explicitViews), explicit.transactions, explicit.dividends, explicit.holdingSettings, TODAY),
    ).toEqual(
      portfolioAnnualizedReturns(positions(legacyViews), legacy.transactions, legacy.dividends, legacy.holdingSettings, TODAY),
    );
  });

  test("資產走勢", () => {
    const closes = {
      "2330": [
        { date: "2026-03-05", close: 640 },
        { date: "2026-06-15", close: 600 },
        { date: "2026-10-27", close: 620 },
      ],
    };
    const options = { from: "2026-03-01", to: TODAY, latestPrices: { "2330": 620 } };
    const legacy = buildAssetHistory(legacyLedger(), closes, options);
    expect(legacy.length).toBeGreaterThan(0);
    expect(buildAssetHistory(explicitTwdLedger(), closes, options)).toEqual(legacy);
  });

  test("對決 B：現金流、期初市值、整個比較結果", () => {
    const legacy = legacyLedger();
    const explicit = explicitTwdLedger();
    expect(benchmarkFlows(explicit.transactions, "2026-01-01", TODAY)).toEqual(
      benchmarkFlows(legacy.transactions, "2026-01-01", TODAY),
    );
    const input = (ledger: Ledger) => ({
      benchmark: "0050" as const,
      transactions: ledger.transactions,
      dividends: ledger.dividends,
      marketValue: 930_000,
      start: "2026-02-01",
      today: TODAY,
      adjCloses: [
        { date: "2026-01-02", close: 100, adjClose: 100 },
        { date: "2026-02-02", close: 105, adjClose: 105 },
        { date: "2026-03-05", close: 110, adjClose: 110 },
        { date: "2026-10-27", close: 120, adjClose: 120 },
      ],
      openingCloses: { "2330": [{ date: "2026-01-30", close: 610 }] },
    });
    const result = buildBenchmarkDuel(input(explicit));
    expect(result.kind).toBe("ok");
    expect(result).toEqual(buildBenchmarkDuel(input(legacy)));
  });
});

describe("外幣（為美股預留，8.2 AC 的計算部分）", () => {
  // 美股沒有證交稅、手續費預設 0：測試用全部為 0 的費用設定，只看匯率換算
  const noFees: UserSettings = { ...DEFAULT_USER_SETTINGS, feeRate: 0, minFeeBoardLot: 0, minFeeOddLot: 0 };
  const usd = { type: "stock" as const, today: TODAY, taxRate: 0, settings: noFees };
  const aaplBuy = makeTx({
    symbol: "AAPL",
    side: "buy",
    tradeDate: "2026-03-02",
    price: 200,
    shares: 10,
    market: "US",
    currency: "USD",
    fxRate: 30,
  });

  test("以 30 元匯率買 10 股 @ 200 美元：持有成本 60,000 台幣，市值用今天的匯率 32 → 64,000", () => {
    const p = computePosition("AAPL", [aaplBuy], [], { ...usd, price: 200, fxRate: 32 });
    expect(p.costBasis).toBe(60_000);
    expect(p.invested).toBe(60_000);
    expect(p.marketValue).toBe(64_000);
    expect(p.unrealizedPnl).toBe(4_000);
  });

  test("外幣證券沒有今天的匯率：跟沒有價格一樣回 null，不用 1 硬算", () => {
    const p = computePosition("AAPL", [aaplBuy], [], { ...usd, price: 200 });
    expect(p.marketValue).toBeNull();
    expect(p.unrealizedPnl).toBeNull();
    expect(p.totalReturn).toBeNull();
  });

  test("賣出與股利用各自那一筆的匯率，不用今天的匯率回頭換算", () => {
    const sell = makeTx({
      symbol: "AAPL",
      side: "sell",
      tradeDate: "2026-06-01",
      price: 220,
      shares: 10,
      currency: "USD",
      fxRate: 31,
    });
    // 稅前 100 美元、預扣 30%：cashAmount 是實際入帳的 70 美元，報酬只算這 70
    const dividend = makeDividend({
      symbol: "AAPL",
      type: "cash",
      exDate: "2026-05-01",
      cashAmount: 70,
      withholdingTax: 30,
      currency: "USD",
      fxRate: 30,
    });
    const p = computePosition("AAPL", [aaplBuy, sell], [dividend], { ...usd, fxRate: 40 });
    expect(p.realizedPnl).toBe(220 * 10 * 31 - 60_000);
    expect(p.cashDividends).toBe(2_100);
    expect(p.totalReturn).toBe(220 * 10 * 31 - 60_000 + 2_100);
    expect(positionCashFlows(p, [aaplBuy, sell], [dividend], TODAY)).toEqual([
      { date: "2026-03-02", amount: -60_000 },
      { date: "2026-06-01", amount: 68_200 },
      { date: "2026-05-01", amount: 2_100 },
    ]);
  });

  test("台股與外幣持股加總時都已換成台幣（summarize 直接相加）", () => {
    const tw = computePosition("2330", [spec37.step1], [], { ...stock, price: 600 });
    const us = computePosition("AAPL", [aaplBuy], [], { ...usd, price: 200, fxRate: 32 });
    const { overall } = summarize([tw, us], []);
    expect(overall.invested).toBe(600_855 + 60_000);
    expect(overall.marketValue).toBe(600_000 + 64_000);
  });

  test("資產走勢、對決 B 的期初市值：外幣用當天匯率，查不到匯率就跳過／不算", () => {
    const ledger: Pick<Ledger, "transactions" | "dividends"> = { transactions: [aaplBuy], dividends: [] };
    const closes = { AAPL: [{ date: "2026-03-02", close: 200 }, { date: "2026-03-03", close: 210 }] };
    const options = { from: "2026-03-01", to: "2026-03-03" };
    expect(buildAssetHistory(ledger, closes, options)).toEqual([]);
    expect(buildAssetHistory(ledger, closes, { ...options, fxRateOn: () => 30 })).toEqual([
      { date: "2026-03-02", marketValue: 60_000, invested: 60_000 },
      { date: "2026-03-03", marketValue: 63_000, invested: 60_000 },
    ]);
    expect(openingValue({ AAPL: 10 }, closes, "2026-03-03", { transactions: [aaplBuy], rateOn: twdOnlyFxRate })).toBeNull();
    expect(openingValue({ AAPL: 10 }, closes, "2026-03-03", { transactions: [aaplBuy], rateOn: () => 31 })).toBe(
      65_100,
    );
  });
});

describe("驗證：同一檔只能一種幣別、匯率要合理", () => {
  const base = (): Ledger => ({ ...spec37Ledger(), transactions: [spec37.step1] });

  test("台股紀錄寫明 TWD 可以通過", () => {
    const result = validateLedgerChange(base(), { kind: "addTransaction", transaction: withTwd(spec37.step2) }, TODAY);
    expect(result.ok).toBe(true);
  });

  test("同一檔混用 TWD 與 USD 會被拒絕", () => {
    const usd = { ...spec37.step2, currency: "USD" as const, fxRate: 30 };
    const result = validateLedgerChange(base(), { kind: "addTransaction", transaction: usd }, TODAY);
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid", field: "currency", message: "同一檔證券的交易與股利只能使用一種幣別" },
    });
    expect(validateLedger({ ...base(), transactions: [spec37.step1, usd] })?.code).toBe("invalid");
  });

  test("匯率必須大於 0；台幣的匯率只能是 1", () => {
    const zero = validateLedgerChange(
      base(),
      { kind: "addTransaction", transaction: { ...spec37.step2, symbol: "AAPL", currency: "USD", fxRate: 0 } },
      TODAY,
    );
    expect(!zero.ok && zero.error).toMatchObject({ field: "fxRate", message: "匯率必須大於 0" });
    const twd = validateLedgerChange(base(), { kind: "addTransaction", transaction: { ...spec37.step2, fxRate: 30 } }, TODAY);
    expect(!twd.ok && twd.error).toMatchObject({ field: "fxRate", message: "台幣的匯率固定為 1" });
  });

  test("預扣稅額不可小於 0", () => {
    const d = makeDividend({ symbol: "2330", type: "cash", cashAmount: 100, withholdingTax: -1 });
    const result = validateLedgerChange(base(), { kind: "addDividend", dividend: d }, TODAY);
    expect(!result.ok && result.error).toMatchObject({ field: "withholdingTax" });
  });
});
