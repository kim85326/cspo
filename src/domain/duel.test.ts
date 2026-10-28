import { buildDuel, duelConclusion, formatAnnualized, type Duel, type DuelSide } from "./duel";
import { buildHoldingViews } from "./holdings";
import { makeTx } from "./ledgerTestData";
import { emptyLedger } from "./migrateSavedHoldings";
import type { GroupSummary } from "./portfolio";
import type { AnnualizedReturn } from "./xirr";

const TODAY = "2026-10-27";

function summary(fields: Partial<GroupSummary>): GroupSummary {
  return {
    invested: 100_000,
    marketValue: 100_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    cashDividends: 0,
    totalReturn: 0,
    returnRate: 0,
    holdingCount: 1,
    missingPriceCount: 0,
    ...fields,
  };
}

function side(returnRate: number | null, annualized: AnnualizedReturn, fields: Partial<GroupSummary> = {}): DuelSide {
  return { hasRecords: true, summary: summary({ returnRate, ...fields }), annualized };
}

const rate = (r: number): AnnualizedReturn => ({ kind: "rate", rate: r });
const UNDER_ONE_YEAR: AnnualizedReturn = { kind: "underOneYear" };
const UNAVAILABLE: AnnualizedReturn = { kind: "unavailable" };
const EMPTY: DuelSide = { hasRecords: false, summary: summary({ invested: 0, returnRate: null }), annualized: UNAVAILABLE };

/** 規格 P2-05 的例子：個股年化 6.2%、ETF 年化 9.8% */
const specExample: Duel = { satellite: side(0.08, rate(0.062)), core: side(0.15, rate(0.098)) };

describe("duelConclusion（P2-05 A 一句話結論）", () => {
  test("ETF 領先：照規格的例子「你的個股年化 6.2%，ETF 年化 9.8%，個股落後 3.6%」", () => {
    const result = duelConclusion(specExample, true);
    expect(result).toMatchObject({ kind: "compared", metric: "annualized", leader: "core", note: null });
    expect(result.text).toBe("你的個股年化 6.2%，ETF 年化 9.8%，個股落後 3.6%。");
  });

  test("個股領先", () => {
    const result = duelConclusion({ satellite: side(0.3, rate(0.12)), core: side(0.1, rate(0.081)) }, true);
    expect(result).toMatchObject({ kind: "compared", leader: "satellite" });
    expect(result.text).toBe("你的個股年化 12.0%，ETF 年化 8.1%，個股領先 3.9%。");
  });

  test("持平：顯示到小數點後一位相同就說差不多", () => {
    const result = duelConclusion({ satellite: side(0.1, rate(0.0621)), core: side(0.1, rate(0.0624)) }, true);
    expect(result).toMatchObject({ kind: "compared", leader: "tie" });
    expect(result.text).toBe("你的個股年化 6.2%，ETF 年化 6.2%，兩邊差不多。");
  });

  test("虧錢的一邊顯示負號，差距是兩個顯示數字相減", () => {
    const result = duelConclusion({ satellite: side(-0.05, rate(-0.031)), core: side(0.1, rate(0.054)) }, true);
    expect(result.text).toBe("你的個股年化 -3.1%，ETF 年化 5.4%，個股落後 8.5%。");
  });

  test("差距用四捨五入後的數字算，新手自己相減也對得起來", () => {
    // 0.06249 → 6.2%、0.09751 → 9.8%，差 3.6%（不是 3.502 → 3.5%）
    const result = duelConclusion({ satellite: side(0, rate(0.06249)), core: side(0, rate(0.09751)) }, true);
    expect(result.text).toBe("你的個股年化 6.2%，ETF 年化 9.8%，個股落後 3.6%。");
  });

  test("任一邊持有未滿一年：改比簡單報酬率，並說明原因", () => {
    const result = duelConclusion({ satellite: side(0.1388, UNDER_ONE_YEAR), core: side(0.1, rate(0.09)) }, true);
    expect(result).toMatchObject({ kind: "compared", metric: "simple", leader: "satellite", reason: "underOneYear" });
    expect(result.text).toBe("你的個股報酬率 13.9%，ETF 報酬率 10.0%，個股領先 3.9%。");
    if (result.kind !== "compared") throw new Error("應該要有結論");
    expect(result.note).toContain("持有還不到一年");
    expect(result.note).toContain("沒有把持有時間長短算進去");
  });

  test("年化報酬率算不出來（XIRR 無解）：改比簡單報酬率", () => {
    const result = duelConclusion({ satellite: side(0.05, UNAVAILABLE), core: side(0.08, rate(0.07)) }, true);
    expect(result).toMatchObject({ metric: "simple", leader: "core", reason: "annualizedUnavailable" });
    if (result.kind !== "compared") throw new Error("應該要有結論");
    expect(result.note).toContain("算不出來");
  });

  test("年化報酬率被鎖住（Free 版）：只比簡單報酬率，不洩漏年化數字", () => {
    const result = duelConclusion(specExample, false);
    expect(result).toMatchObject({ metric: "simple", leader: "core", reason: "annualizedHidden" });
    expect(result.text).toBe("你的個股報酬率 8.0%，ETF 報酬率 15.0%，個股落後 7.0%。");
    expect(result.text).not.toContain("6.2%");
  });

  test("只有個股：不下結論，說明還沒有 ETF", () => {
    const result = duelConclusion({ satellite: side(0.1, rate(0.1)), core: EMPTY }, true);
    expect(result).toMatchObject({ kind: "oneSide", missing: "core" });
    expect(result.text).toContain("還沒有 ETF");
    expect(result.text).not.toMatch(/領先|落後|差不多/);
  });

  test("只有 ETF：不下結論，說明還沒有個股", () => {
    const result = duelConclusion({ satellite: EMPTY, core: side(0.1, rate(0.1)) }, true);
    expect(result).toMatchObject({ kind: "oneSide", missing: "satellite" });
    expect(result.text).toContain("還沒有個股");
  });

  test("兩邊都沒有紀錄", () => {
    expect(duelConclusion({ satellite: EMPTY, core: EMPTY }, true).kind).toBe("noRecords");
  });

  test("有持股缺價格：不比較（少算市值會看起來像虧錢）", () => {
    const result = duelConclusion(
      { satellite: side(null, UNAVAILABLE, { missingPriceCount: 1, totalReturn: null }), core: side(0.1, rate(0.1)) },
      true,
    );
    expect(result.kind).toBe("missingPrice");
    expect(result.text).toContain("拿不到現價");
  });

  test("報酬率算不出來（例如只有股利、沒有投入）：資料不足，不比較", () => {
    const result = duelConclusion({ satellite: side(null, UNAVAILABLE, { invested: 0 }), core: side(0.1, rate(0.1)) }, true);
    expect(result.kind).toBe("notEnoughData");
  });

  test("所有結論都不含建議字眼（P2-05 AC）", () => {
    const duels: [Duel, boolean][] = [
      [specExample, true],
      [specExample, false],
      [{ satellite: side(0.3, rate(0.12)), core: side(0.1, rate(0.081)) }, true],
      [{ satellite: side(0.1, rate(0.0621)), core: side(0.1, rate(0.0624)) }, true],
      [{ satellite: side(0.1, UNDER_ONE_YEAR), core: side(0.1, rate(0.09)) }, true],
      [{ satellite: side(0.1, UNAVAILABLE), core: side(0.1, rate(0.09)) }, true],
      [{ satellite: side(0.1, rate(0.1)), core: EMPTY }, true],
      [{ satellite: EMPTY, core: side(0.1, rate(0.1)) }, true],
      [{ satellite: EMPTY, core: EMPTY }, true],
      [{ satellite: side(null, UNAVAILABLE, { missingPriceCount: 1 }), core: side(0.1, rate(0.1)) }, true],
      [{ satellite: side(null, UNAVAILABLE), core: side(0.1, rate(0.1)) }, true],
    ];
    for (const [duel, visible] of duels) {
      const result = duelConclusion(duel, visible);
      const words = `${result.text}${result.kind === "compared" ? (result.note ?? "") : ""}`;
      for (const banned of ["建議", "應該", "買進", "賣出", "加碼", "停損"]) {
        expect(words).not.toContain(banned);
      }
    }
  });
});

describe("buildDuel", () => {
  test("依核心／衛星分組，兩邊各有加總與年化報酬率", () => {
    // 個股 2330：兩年前 100,000 → 今天 121,000；ETF 0050：一年前 100,000 → 今天 110,000（手續費都設 0 方便手算）
    const ledger = {
      ...emptyLedger(),
      transactions: [
        makeTx({ symbol: "2330", side: "buy", tradeDate: "2024-10-27", price: 100, shares: 1000, fee: 0 }),
        makeTx({ symbol: "0050", side: "buy", tradeDate: "2025-10-27", price: 100, shares: 1000, fee: 0 }),
      ],
    };
    const prices: Record<string, number> = { "2330": 121, "0050": 110 };
    const views = buildHoldingViews(ledger, (s) => ({ price: prices[s], name: s }), TODAY);
    const duel = buildDuel(ledger, views, TODAY);

    expect(duel.core.hasRecords).toBe(true);
    expect(duel.satellite.hasRecords).toBe(true);
    expect(duel.core.summary.invested).toBe(100_000);
    expect(duel.satellite.summary.invested).toBe(100_000);
    // 年化：期末價值要扣預估賣出費用，所以略低於 10%
    expect(duel.core.annualized.kind).toBe("rate");
    expect(duel.satellite.annualized.kind).toBe("rate");
    const result = duelConclusion(duel, true);
    expect(result).toMatchObject({ kind: "compared", metric: "annualized" });
  });

  test("只有 ETF：衛星沒有紀錄", () => {
    const ledger = {
      ...emptyLedger(),
      transactions: [makeTx({ symbol: "0050", side: "buy", tradeDate: "2026-04-10", price: 100, shares: 1000 })],
    };
    const views = buildHoldingViews(ledger, () => ({ price: 110, name: "元大台灣50" }), TODAY);
    const duel = buildDuel(ledger, views, TODAY);
    expect(duel.core.hasRecords).toBe(true);
    expect(duel.satellite.hasRecords).toBe(false);
    expect(duel.core.annualized).toEqual(UNDER_ONE_YEAR);
  });
});

describe("formatAnnualized", () => {
  test("數字、持有未滿一年、—", () => {
    expect(formatAnnualized(rate(0.1))).toBe("+10.00%");
    expect(formatAnnualized(UNDER_ONE_YEAR)).toBe("持有未滿一年");
    expect(formatAnnualized(UNAVAILABLE)).toBe("—");
  });
});
