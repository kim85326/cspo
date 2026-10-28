import {
  applyAutoDividendPlan,
  autoDividendKey,
  dismissAutoDividend,
  estimatedCashDividends,
  isEmptyPlan,
  participatingShares,
  planAutoDividends,
  type AutoDividendDraft,
} from "./autoDividends";
import { DEFAULT_USER_SETTINGS } from "./fees";
import { makeDividend, makeTx, spec37, spec37Ledger } from "./ledgerTestData";
import type { Dividend, Ledger, Transaction } from "./ledgerTypes";
import { computePosition } from "./position";
import type { DividendEvent } from "./types";

const TODAY = "2026-10-28";

function ledgerOf(transactions: Transaction[], dividends: Dividend[] = [], extra: Partial<Ledger> = {}): Ledger {
  return { schemaVersion: 1, transactions, dividends, holdingSettings: [], settings: DEFAULT_USER_SETTINGS, ...extra };
}

function cashEvent(fields: Partial<DividendEvent> & Pick<DividendEvent, "exDate" | "cashPerShare">): DividendEvent {
  return { kind: "dividend", symbol: "2330", stockPerThousand: 0, payDate: null, ...fields };
}

let idSeq = 0;
const make = (draft: AutoDividendDraft): Dividend => {
  idSeq += 1;
  return { ...draft, id: `auto-${idSeq}`, createdAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z" };
};

/** 跑一次自動帶入，回傳套用後的記帳本 */
function sync(ledger: Ledger, events: DividendEvent[], today = TODAY): Ledger {
  return applyAutoDividendPlan(ledger, planAutoDividends(ledger, events, today), make, `${today}T00:00:00.000Z`);
}

const buy1000 = makeTx({ id: "buy", side: "buy", tradeDate: "2026-06-01", price: 100, shares: 1000, fee: 142 });

describe("P2-03 AC（對應 docs/stories/012）", () => {
  test("除息日前一天持有 1000 股、每股配 3 元 → 自動產生 3,000 元預估股利", () => {
    // 手算：1000 股 × 3 元 = 3,000 元；發放日 11/20 還沒到 → estimated
    const event = cashEvent({ exDate: "2026-10-20", cashPerShare: 3, payDate: "2026-11-20" });
    const plan = planAutoDividends(ledgerOf([buy1000]), [event], TODAY);
    expect(plan).toEqual({
      add: [
        {
          symbol: "2330",
          type: "cash",
          exDate: "2026-10-20",
          payDate: "2026-11-20",
          cashAmount: 3000,
          status: "estimated",
          source: "auto",
        },
      ],
      update: [],
      remove: [],
    });
  });

  test("除息日當天才買入的股數，不計入參與股數", () => {
    // 6/1 買 1000 股、除息日 10/20 當天再買 500 股 → 參與股數 1000，股利 3,000（不是 4,500）
    const sameDay = makeTx({ side: "buy", tradeDate: "2026-10-20", price: 100, shares: 500, fee: 71 });
    const ledger = ledgerOf([buy1000, sameDay]);
    expect(participatingShares(ledger, "2330", "2026-10-20")).toBe(1000);
    const plan = planAutoDividends(ledger, [cashEvent({ exDate: "2026-10-20", cashPerShare: 3 })], TODAY);
    expect(plan.add.map((d) => d.cashAmount)).toEqual([3000]);
  });

  test("已手動輸入的股利不會被重複建立", () => {
    // product-spec 3.7 步驟 4：6/15 手動記了 5,000 元。同一天的除息事件不再自動建立
    const plan = planAutoDividends(spec37Ledger(), [cashEvent({ exDate: "2026-06-15", cashPerShare: 3.5 })], TODAY);
    expect(isEmptyPlan(plan)).toBe(true);
  });
});

describe("estimated 股利不計入總報酬", () => {
  test("3.7 範例加一筆 9,000 元 estimated → 已領股利、總報酬都不變；轉成 received 才加上去", () => {
    const options = { type: "stock" as const, price: spec37.price, today: TODAY };
    const base = spec37Ledger();
    const before = computePosition("2330", base.transactions, base.dividends, options);

    const estimated = makeDividend({ type: "cash", exDate: "2026-09-16", cashAmount: 9000, status: "estimated", source: "auto" });
    const withEstimated = computePosition("2330", base.transactions, [...base.dividends, estimated], options);
    expect(withEstimated.cashDividends).toBe(5000);
    expect(withEstimated.totalReturn).toBeCloseTo(before.totalReturn as number, 6);

    const received = { ...estimated, status: "received" as const };
    const withReceived = computePosition("2330", base.transactions, [...base.dividends, received], options);
    expect(withReceived.totalReturn).toBeCloseTo((before.totalReturn as number) + 9000, 6);
  });

  test("estimated 股票股利不增加持股", () => {
    const stock = makeDividend({ type: "stock", exDate: "2026-07-01", stockShares: 100, status: "estimated", source: "auto" });
    const p = computePosition("2330", [buy1000], [stock], { type: "stock", today: TODAY });
    expect(p.shares).toBe(1000);
  });

  test("estimatedCashDividends 只加 estimated 的現金股利", () => {
    const dividends = [
      makeDividend({ type: "cash", cashAmount: 3000, status: "estimated", source: "auto" }),
      makeDividend({ type: "cash", cashAmount: 5000, status: "received" }),
      makeDividend({ symbol: "0050", type: "cash", cashAmount: 700, status: "estimated", source: "auto" }),
    ];
    expect(estimatedCashDividends(dividends, "2330")).toBe(3000);
  });
});

describe("金額與股數的算法", () => {
  test("現金股利元以下捨去：3.7 範例 3/17 參與 1500 股 × 6.000035 元 = 9,000.0525 → 9,000 元", () => {
    // 2330 2026-03-17 除息、每股 6.000035 元（FinMind，見 fakeCorporateActionSource）；3/5 已賣 500 股，剩 1500 股
    const event = cashEvent({ exDate: "2026-03-17", cashPerShare: 6.000035, payDate: "2026-04-09" });
    const plan = planAutoDividends(spec37Ledger(), [event], TODAY);
    expect(plan.add).toEqual([expect.objectContaining({ cashAmount: 9000, status: "received", payDate: "2026-04-09" })]);
  });

  test("股票股利 = floor(參與股數 × 每千股配股 ÷ 1000)：1234 股、每股 0.1 元（每千股 10 股）→ 12 股", () => {
    // 規格公式 floor(1234 × 0.1 ÷ 10) = floor(12.34) = 12
    const buy = makeTx({ side: "buy", tradeDate: "2026-01-02", price: 30, shares: 1234, fee: 52 });
    const event: DividendEvent = { kind: "dividend", symbol: "2330", exDate: "2026-07-01", cashPerShare: 0.9, stockPerThousand: 10, payDate: "2026-08-01" };
    const plan = planAutoDividends(ledgerOf([buy]), [event], TODAY);
    expect(plan.add.map((d) => [d.type, d.cashAmount ?? d.stockShares])).toEqual([
      ["cash", 1110], // floor(1234 × 0.9) = floor(1110.6)
      ["stock", 12],
    ]);
  });

  test("連續兩年配股：第二年的參與股數含第一年配的", () => {
    // 1000 股，2025 每千股 100 股 → 100 股；2026 參與 1100 股 × 100 ÷ 1000 → 110 股；最後持股 1210
    const buy = makeTx({ side: "buy", tradeDate: "2024-12-02", price: 30, shares: 1000, fee: 42 });
    const events: DividendEvent[] = [
      { kind: "dividend", symbol: "2330", exDate: "2026-07-01", cashPerShare: null, stockPerThousand: 100, payDate: "2026-08-01" },
      { kind: "dividend", symbol: "2330", exDate: "2025-07-01", cashPerShare: null, stockPerThousand: 100, payDate: "2025-08-01" },
    ];
    const ledger = sync(ledgerOf([buy]), events);
    expect(ledger.dividends.map((d) => [d.exDate, d.stockShares])).toEqual([
      ["2025-07-01", 100],
      ["2026-07-01", 110],
    ]);
    expect(computePosition("2330", ledger.transactions, ledger.dividends, { type: "stock", today: TODAY }).shares).toBe(1210);
  });

  test("金額還沒公告（cashPerShare = null）、除權息日在未來、除息前已賣光 → 都不建立", () => {
    const sold = makeTx({ side: "sell", tradeDate: "2026-07-01", price: 110, shares: 1000, fee: 156, tax: 330 });
    const events = [
      cashEvent({ exDate: "2026-09-01", cashPerShare: null }),
      cashEvent({ exDate: "2026-11-15", cashPerShare: 2 }),
    ];
    expect(isEmptyPlan(planAutoDividends(ledgerOf([buy1000]), events, TODAY))).toBe(true);
    const afterSell = [cashEvent({ exDate: "2026-08-01", cashPerShare: 2 })];
    expect(isEmptyPlan(planAutoDividends(ledgerOf([buy1000, sold]), afterSell, TODAY))).toBe(true);
  });

  test("同一個事件出現兩次只建立一筆", () => {
    const event = cashEvent({ exDate: "2026-10-20", cashPerShare: 3 });
    expect(planAutoDividends(ledgerOf([buy1000]), [event, event], TODAY).add).toHaveLength(1);
  });
});

describe("狀態：到了發放日轉成已入帳", () => {
  const event = cashEvent({ exDate: "2026-10-20", cashPerShare: 3, payDate: "2026-11-20" });

  test("發放日前是 estimated，發放日當天再跑一次 → received", () => {
    const first = sync(ledgerOf([buy1000]), [event], "2026-10-28");
    expect(first.dividends[0].status).toBe("estimated");
    const second = sync(first, [event], "2026-11-20");
    expect(second.dividends).toEqual([expect.objectContaining({ id: first.dividends[0].id, status: "received", cashAmount: 3000 })]);
  });

  test("沒有發放日（官方來源）先維持 estimated；之後拿到發放日就補上", () => {
    const noPayDate = { ...event, payDate: null };
    const first = sync(ledgerOf([buy1000]), [noPayDate], "2026-12-01");
    expect(first.dividends[0]).toEqual(expect.objectContaining({ status: "estimated" }));
    expect(first.dividends[0].payDate).toBeUndefined();
    const second = sync(first, [event], "2026-12-01");
    expect(second.dividends[0]).toEqual(expect.objectContaining({ status: "received", payDate: "2026-11-20" }));
  });

  test("沒變的時候不產生任何更新", () => {
    const first = sync(ledgerOf([buy1000]), [event]);
    expect(isEmptyPlan(planAutoDividends(first, [event], TODAY))).toBe(true);
  });
});

describe("使用者改過、刪過的自動紀錄", () => {
  const event = cashEvent({ exDate: "2026-10-20", cashPerShare: 3, payDate: "2026-11-20" });

  test("改過金額（扣了二代健保）→ 不再自動更新金額，但發放日到了仍轉成 received", () => {
    const first = sync(ledgerOf([buy1000]), [event]);
    const edited = { ...first.dividends[0], cashAmount: 2937, userModified: true };
    const ledger = { ...first, dividends: [edited] };
    // 再多買 1000 股（在除息日前）也不會把 2,937 改回去
    const moreBuy = makeTx({ side: "buy", tradeDate: "2026-06-02", price: 100, shares: 1000, fee: 142 });
    const withMore = { ...ledger, transactions: [...ledger.transactions, moreBuy] };
    expect(isEmptyPlan(planAutoDividends(withMore, [event], TODAY))).toBe(true);
    const later = sync(withMore, [event], "2026-11-21");
    expect(later.dividends).toEqual([expect.objectContaining({ cashAmount: 2937, status: "received" })]);
  });

  test("沒改過的：除權息日前的交易變了就跟著重算；參與股數變 0 就移除", () => {
    const first = sync(ledgerOf([buy1000]), [event]);
    const moreBuy = makeTx({ side: "buy", tradeDate: "2026-06-02", price: 100, shares: 1000, fee: 142 });
    const doubled = sync({ ...first, transactions: [buy1000, moreBuy] }, [event]);
    expect(doubled.dividends).toEqual([expect.objectContaining({ id: first.dividends[0].id, cashAmount: 6000 })]);
    const none = sync({ ...doubled, transactions: [] }, [event]);
    expect(none.dividends).toEqual([]);
  });

  test("刪掉的自動股利記進 dismissedAutoDividends，之後不再建立", () => {
    const first = sync(ledgerOf([buy1000]), [event]);
    const auto = first.dividends[0];
    const deleted = dismissAutoDividend({ ...first, dividends: [] }, auto);
    expect(deleted.dismissedAutoDividends).toEqual(["2330|2026-10-20|cash"]);
    expect(isEmptyPlan(planAutoDividends(deleted, [event], TODAY))).toBe(true);
    // 手動紀錄不用記；同一筆記兩次不重複
    expect(dismissAutoDividend(deleted, makeDividend({ type: "cash" }))).toBe(deleted);
    expect(dismissAutoDividend(deleted, auto)).toBe(deleted);
  });

  test("資料來源這次沒給某檔的事件，已經建好的自動股利不動", () => {
    const first = sync(ledgerOf([buy1000]), [event]);
    expect(isEmptyPlan(planAutoDividends(first, [], TODAY))).toBe(true);
  });

  test("去重看類型：同一天手動記了現金股利，配股仍會自動帶入", () => {
    const manualCash = makeDividend({ type: "cash", exDate: "2026-07-01", cashAmount: 800 });
    const both: DividendEvent = { kind: "dividend", symbol: "2330", exDate: "2026-07-01", cashPerShare: 0.9, stockPerThousand: 10, payDate: "2026-08-01" };
    const plan = planAutoDividends(ledgerOf([buy1000], [manualCash]), [both], TODAY);
    expect(plan.add.map((d) => [d.type, d.stockShares])).toEqual([["stock", 10]]);
  });
});

test("autoDividendKey：代號|除權息日|類型", () => {
  expect(autoDividendKey({ symbol: "0050", exDate: "2026-07-21", type: "cash" })).toBe("0050|2026-07-21|cash");
});
