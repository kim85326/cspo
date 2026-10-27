import { DEFAULT_USER_SETTINGS } from "./fees";
import { makeDividend, makeTx, spec37, spec37Ledger } from "./ledgerTestData";
import type { Ledger } from "./ledgerTypes";
import { buildOverview, ledgerSymbols, oldestPriceDate } from "./overview";
import type { GroupSummary } from "./portfolio";

const TODAY = "2026-10-27";

/** 2330（3.7 範例）+ 0050 持有中 + 2317 已出清 */
function mixedLedger(): Ledger {
  const base = spec37Ledger();
  return {
    ...base,
    transactions: [
      ...base.transactions,
      makeTx({ id: "etf1", symbol: "0050", side: "buy", tradeDate: "2026-04-01", price: 180, shares: 1000, fee: 256 }),
      makeTx({ id: "hh1", symbol: "2317", side: "buy", tradeDate: "2026-02-01", price: 200, shares: 1000, fee: 285 }),
      makeTx({
        id: "hh2",
        symbol: "2317",
        side: "sell",
        tradeDate: "2026-05-01",
        price: 210,
        shares: 1000,
        fee: 299,
        tax: 630,
      }),
    ],
    dividends: [...base.dividends, makeDividend({ symbol: "0050", type: "cash", exDate: "2026-07-18", cashAmount: 1000 })],
  };
}

const PRICES = { "2330": spec37.price, "0050": 190 };

const MONEY_FIELDS = ["invested", "marketValue", "realizedPnl", "unrealizedPnl", "cashDividends"] as const;

function expectCoreAndSatelliteAddUp(core: GroupSummary, satellite: GroupSummary, overall: GroupSummary) {
  for (const field of MONEY_FIELDS) {
    expect(core[field] + satellite[field]).toBeCloseTo(overall[field], 6);
  }
  expect((core.totalReturn ?? 0) + (satellite.totalReturn ?? 0)).toBeCloseTo(overall.totalReturn ?? NaN, 6);
  expect(core.holdingCount + satellite.holdingCount).toBe(overall.holdingCount);
}

describe("buildOverview（M-05）", () => {
  test("3.7 範例：整體數字和規格一致", () => {
    const { summary } = buildOverview(spec37Ledger(), PRICES, TODAY);
    expect(summary.overall.marketValue).toBe(930_000);
    expect(summary.overall.realizedPnl).toBeCloseTo(48_170.25, 2);
    expect(summary.overall.unrealizedPnl).toBeCloseTo(99_709.75, 2);
    expect(summary.overall.cashDividends).toBe(5_000);
    expect(summary.overall.totalReturn).toBeCloseTo(152_880, 2);
    expect(summary.overall.returnRate).toBeCloseTo(0.1388, 4);
  });

  test("核心 + 衛星的各項金額加總等於整體", () => {
    const { summary } = buildOverview(mixedLedger(), PRICES, TODAY);
    expect(summary.core.holdingCount).toBe(1);
    expect(summary.satellite.holdingCount).toBe(1);
    expectCoreAndSatelliteAddUp(summary.core, summary.satellite, summary.overall);
  });

  test("把 2330 改成核心：2330 的數字從衛星移到核心，加總仍等於整體", () => {
    const before = buildOverview(mixedLedger(), PRICES, TODAY).summary;
    const ledger = { ...mixedLedger(), holdingSettings: [{ symbol: "2330", bucket: "core" as const }] };
    const { summary } = buildOverview(ledger, PRICES, TODAY);
    expect(summary.core.holdingCount).toBe(2);
    expect(summary.satellite.holdingCount).toBe(0);
    // 衛星只剩已出清的 2317
    expect(summary.satellite.marketValue).toBe(0);
    expect(summary.core.marketValue).toBe(before.overall.marketValue);
    expect(summary.overall).toEqual(before.overall);
    expectCoreAndSatelliteAddUp(summary.core, summary.satellite, summary.overall);
  });

  test("持股列表只有持有中的，市值大的在前；已出清的不在列表但算進已實現", () => {
    const { holdings, positions, summary } = buildOverview(mixedLedger(), PRICES, TODAY);
    expect(holdings.map((p) => p.symbol)).toEqual(["2330", "0050"]);
    expect(positions.map((p) => p.symbol)).toEqual(["0050", "2317", "2330"]);
    const honhai = positions.find((p) => p.symbol === "2317");
    expect(summary.satellite.realizedPnl).toBeCloseTo(spec37Realized() + (honhai?.realizedPnl ?? NaN), 6);
  });

  test("缺少價格：那一檔排最後，總報酬是 null，不當成 0", () => {
    const { holdings, summary } = buildOverview(mixedLedger(), { "0050": 190 }, TODAY);
    expect(holdings.map((p) => p.symbol)).toEqual(["0050", "2330"]);
    expect(holdings[1].marketValue).toBeNull();
    expect(summary.overall.totalReturn).toBeNull();
    expect(summary.overall.missingPriceCount).toBe(1);
    expect(summary.core.totalReturn).not.toBeNull();
  });

  test("空記帳本：沒有任何持股，加總都是 0、報酬率 null", () => {
    const empty: Ledger = {
      schemaVersion: 1,
      transactions: [],
      dividends: [],
      holdingSettings: [],
      settings: DEFAULT_USER_SETTINGS,
    };
    const { holdings, summary } = buildOverview(empty, {}, TODAY);
    expect(holdings).toEqual([]);
    expect(summary.overall.invested).toBe(0);
    expect(summary.overall.returnRate).toBeNull();
  });
});

function spec37Realized(): number {
  return buildOverview(spec37Ledger(), PRICES, TODAY).summary.overall.realizedPnl;
}

test("ledgerSymbols：交易與股利裡的代號，不重複", () => {
  expect(ledgerSymbols(mixedLedger())).toEqual(["0050", "2317", "2330"]);
});

describe("oldestPriceDate", () => {
  test("取最舊的日期", () => {
    expect(oldestPriceDate([{ asOf: "2026/10/22" }, { asOf: "2026/10/21" }, { asOf: "2026/10/22" }])).toBe(
      "2026/10/21",
    );
  });

  test("沒有日期（假價）回傳 null，有的沒有日期就略過", () => {
    expect(oldestPriceDate([{}, {}])).toBeNull();
    expect(oldestPriceDate([{}, { asOf: "2026/10/22" }])).toBe("2026/10/22");
  });
});
