import { DEFAULT_USER_SETTINGS } from "./fees";
import {
  currentHoldingBuys,
  hasPlaceholderDate,
  activeHoldings,
  buildHoldingViews,
  closedHoldings,
  formatAmount,
  formatPrice,
  formatRate,
  formatSignedAmountOrDash,
  sortHoldings,
  symbolHistory,
  unrealizedRate,
  type QuoteLookup,
} from "./holdings";
import type { Ledger } from "./ledgerTypes";
import { makeDividend, makeTx, spec37, spec37Ledger } from "./ledgerTestData";

const TODAY = "2026-10-27";
const prices: Record<string, number> = { "2330": spec37.price, "0050": 180, "2317": 150 };
const quoteOf: QuoteLookup = (symbol) =>
  prices[symbol] === undefined ? undefined : { price: prices[symbol], name: `名稱${symbol}` };

/** 3.7 的 2330，再加一檔 ETF、一檔賠錢個股、一檔已出清、一檔沒有價格的 */
function mixedLedger(): Ledger {
  const base = spec37Ledger();
  return {
    ...base,
    transactions: [
      ...base.transactions,
      makeTx({ symbol: "0050", side: "buy", price: 160, shares: 2000, fee: 456 }),
      makeTx({ symbol: "2317", side: "buy", price: 200, shares: 1000, fee: 285 }),
      makeTx({ symbol: "2454", side: "buy", price: 1100, shares: 100, fee: 156 }),
      makeTx({ symbol: "2454", side: "sell", tradeDate: "2026-08-15", price: 1250, shares: 100, fee: 178, tax: 375 }),
      makeTx({ symbol: "9999", side: "buy", price: 10, shares: 1000, fee: 20 }),
    ],
  };
}

describe("buildHoldingViews（對應 docs/stories/010）", () => {
  test("M-04 AC1：3.7 範例完成後 2330 的每個數字", () => {
    const [h] = buildHoldingViews(spec37Ledger(), quoteOf, TODAY);
    const p = h.position;
    expect(p.shares).toBe(1500);
    expect(formatPrice(p.averageCost)).toBe("550.78");
    expect(formatAmount(p.marketValue)).toBe("930,000");
    expect(formatSignedAmountOrDash(p.unrealizedPnl)).toBe("+99,710");
    expect(formatSignedAmountOrDash(p.realizedPnl)).toBe("+48,170");
    expect(formatAmount(p.cashDividends)).toBe("5,000");
    expect(formatSignedAmountOrDash(p.totalReturn)).toBe("+152,880");
    expect(formatRate(p.returnRate)).toBe("+13.88%");
    expect(p.holdingDays).toBe(295);
  });

  test("M-06：ETF 預設核心、個股預設衛星；有設定就照設定", () => {
    const ledger = { ...mixedLedger(), holdingSettings: [{ symbol: "2317", bucket: "core" as const }] };
    const views = buildHoldingViews(ledger, quoteOf, TODAY);
    const bySymbol = Object.fromEntries(views.map((v) => [v.symbol, v]));
    expect(bySymbol["0050"].bucket).toBe("core");
    expect(bySymbol["0050"].bucketOverridden).toBe(false);
    expect(bySymbol["2330"].bucket).toBe("satellite");
    expect(bySymbol["2317"].bucket).toBe("core");
    expect(bySymbol["2317"].bucketOverridden).toBe(true);
  });

  test("查不到行情：名稱用代號，市值與總報酬是 null（畫面顯示 —）", () => {
    const view = buildHoldingViews(mixedLedger(), quoteOf, TODAY).find((v) => v.symbol === "9999")!;
    expect(view.name).toBe("9999");
    expect(view.position.marketValue).toBeNull();
    expect(formatAmount(view.position.marketValue)).toBe("—");
    expect(formatRate(view.position.returnRate)).toBe("—");
  });

  test("M-04 AC2：全部賣光的在已出清，不在持有中", () => {
    const views = buildHoldingViews(mixedLedger(), quoteOf, TODAY);
    expect(activeHoldings(views).map((v) => v.symbol)).not.toContain("2454");
    expect(closedHoldings(views).map((v) => v.symbol)).toEqual(["2454"]);
  });

  test("只有股利、沒有交易的代號不算已出清", () => {
    const ledger = { ...spec37Ledger(), dividends: [makeDividend({ symbol: "0056", type: "cash", cashAmount: 100 })] };
    const views = buildHoldingViews(ledger, quoteOf, TODAY);
    expect(closedHoldings(views)).toEqual([]);
  });
});

describe("sortHoldings", () => {
  const active = activeHoldings(buildHoldingViews(mixedLedger(), quoteOf, TODAY));

  test("預設依市值由大到小，沒有價格的排最後", () => {
    expect(sortHoldings(active, "marketValue").map((v) => v.symbol)).toEqual(["2330", "0050", "2317", "9999"]);
  });

  test("依報酬率", () => {
    expect(sortHoldings(active, "returnRate").map((v) => v.symbol)).toEqual(["2330", "0050", "2317", "9999"]);
  });

  test("依總報酬：賠錢的在後面", () => {
    const sorted = sortHoldings(active, "totalReturn");
    expect(sorted.map((v) => v.symbol)).toEqual(["2330", "0050", "2317", "9999"]);
    expect(sorted[2].position.totalReturn).toBeLessThan(0);
  });
});

describe("unrealizedRate", () => {
  test("未實現損益 ÷ 持有成本", () => {
    const [h] = buildHoldingViews(spec37Ledger(), quoteOf, TODAY);
    expect(unrealizedRate(h.position)).toBeCloseTo(99709.75 / 826175.25, 10);
  });
});

describe("symbolHistory", () => {
  test("只列這檔，依日期新到舊（交易與股利混在一起）", () => {
    const ids = symbolHistory(mixedLedger(), "2330").map((e) =>
      e.kind === "trade" ? e.transaction.id : e.dividend.id,
    );
    expect(ids).toEqual(["step4", "step3", "step2", "step1"]);
  });

  test("同一天後建的在前", () => {
    const a = makeTx({ id: "a", side: "buy", price: 1, shares: 1000, tradeDate: "2026-05-01" });
    const b = makeTx({ id: "b", side: "buy", price: 1, shares: 1000, tradeDate: "2026-05-01" });
    const ledger: Ledger = {
      schemaVersion: 1,
      transactions: [a, b],
      dividends: [],
      holdingSettings: [],
      settings: DEFAULT_USER_SETTINGS,
    };
    expect(symbolHistory(ledger, "2330").map((e) => e.kind === "trade" && e.transaction.id)).toEqual(["b", "a"]);
  });
});

describe("currentHoldingBuys（P2-09 每筆買入各自判斷）", () => {
  test("只算這一段持有的買入，舊到新；出清前的那段不算", () => {
    const ledger: Ledger = {
      ...spec37Ledger(),
      transactions: [
        makeTx({ id: "a", side: "buy", tradeDate: "2025-03-01", price: 400, shares: 1000 }),
        makeTx({ id: "b", side: "sell", tradeDate: "2025-06-01", price: 450, shares: 1000 }),
        makeTx({ id: "c", side: "buy", tradeDate: "2026-01-05", price: 600, shares: 1000 }),
        makeTx({ id: "d", side: "sell", tradeDate: "2026-02-01", price: 610, shares: 500 }),
        makeTx({ id: "e", side: "buy", tradeDate: "2026-03-05", price: 550, shares: 500 }),
      ],
      dividends: [],
    };
    const history = symbolHistory(ledger, "2330");
    expect(currentHoldingBuys(history, "2026-01-05").map((t) => t.id)).toEqual(["c", "e"]);
    expect(currentHoldingBuys(history, null)).toEqual([]);
  });

  test("拍照匯入或日期待補：買入日不是真的那天", () => {
    expect(hasPlaceholderDate(makeTx({ side: "buy", price: 1, shares: 1, source: "import" }))).toBe(true);
    expect(hasPlaceholderDate(makeTx({ side: "buy", price: 1, shares: 1, tradeDateUnknown: true }))).toBe(true);
    expect(hasPlaceholderDate(makeTx({ side: "buy", price: 1, shares: 1 }))).toBe(false);
  });
});

describe("格式", () => {
  test("金額、股價、百分比", () => {
    expect(formatSignedAmountOrDash(-1200.4)).toBe("-1,200");
    expect(formatSignedAmountOrDash(0.4)).toBe("0");
    expect(formatSignedAmountOrDash(null)).toBe("—");
    expect(formatPrice(620)).toBe("620.00");
    expect(formatRate(-0.021)).toBe("-2.10%");
    expect(formatRate(-0.00001)).toBe("0.00%");
  });
});
