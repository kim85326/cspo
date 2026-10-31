import { DEFAULT_USER_SETTINGS } from "./fees";
import type { DcaRule, Ledger } from "./ledgerTypes";
import { makeTx } from "./ledgerTestData";
import { buildOverview } from "./overview";
import {
  addDays,
  buildCloseSummary,
  closeFallbackId,
  closeSummaryMessage,
  isPast,
  planCloseFallbacks,
  planDcaReminders,
  planDividendReminders,
  planReminders,
  previousClose,
  shortDateLabel,
  shouldSendCloseSummary,
  upcomingExDividends,
  weekdayBefore,
  weekdayOnOrAfter,
} from "./notifications";
import type { DividendEvent, Quote } from "./types";

// 2026-10-30 是週五、10-31 週六、11-02 週一、11-13 週五、11-16 週一

function ledgerOf(transactions: Ledger["transactions"], patch: Partial<Ledger> = {}): Ledger {
  return {
    schemaVersion: 1,
    transactions,
    dividends: [],
    holdingSettings: [],
    settings: DEFAULT_USER_SETTINGS,
    ...patch,
  };
}

function rule(patch: Partial<DcaRule> = {}): DcaRule {
  return {
    id: "dca-1",
    symbol: "0050",
    amount: 3000,
    dayOfMonth: 6,
    startDate: "2026-07-01",
    enabled: true,
    handledPeriods: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...patch,
  };
}

function event(patch: Partial<DividendEvent> & Pick<DividendEvent, "symbol" | "exDate">): DividendEvent {
  return { kind: "dividend", cashPerShare: 1, stockPerThousand: 0, payDate: null, ...patch };
}

describe("日期小工具", () => {
  test("加減天數會跨月", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  test("週末順延到週一、往前找到週五", () => {
    expect(weekdayOnOrAfter("2026-10-31")).toBe("2026-11-02");
    expect(weekdayOnOrAfter("2026-10-30")).toBe("2026-10-30");
    expect(weekdayBefore("2026-11-02")).toBe("2026-10-30");
    expect(weekdayBefore("2026-11-13")).toBe("2026-11-12");
  });

  test("短日期標示含星期", () => {
    expect(shortDateLabel("2026-11-16")).toBe("11/16（一）");
  });

  test("時間到了或過了算已過", () => {
    const now = new Date(2026, 9, 30, 9, 0);
    expect(isPast({ date: "2026-10-30", hour: 9, minute: 0 }, now)).toBe(true);
    expect(isPast({ date: "2026-10-30", hour: 9, minute: 1 }, now)).toBe(false);
  });
});

describe("除息日前一天提醒", () => {
  const ledger = ledgerOf([makeTx({ symbol: "0056", side: "buy", price: 35, shares: 2000, tradeDate: "2026-09-01" })]);

  test("只取今天以後的除息事件，同一檔同一天只留一筆", () => {
    const events = [
      event({ symbol: "0056", exDate: "2026-10-20" }),
      event({ symbol: "0056", exDate: "2026-11-13" }),
      event({ symbol: "0056", exDate: "2026-11-13" }),
    ];
    expect(upcomingExDividends(events, "2026-10-30")).toEqual([
      { symbol: "0056", exDate: "2026-11-13", cashPerShare: 1 },
    ]);
  });

  test("前一天早上 9 點提醒，寫出預估金額與名稱", () => {
    const [r] = planDividendReminders(ledger, [{ symbol: "0056", exDate: "2026-11-13", cashPerShare: 1.07 }], "2026-10-30", {
      "0056": "元大高股息",
    });
    expect(r).toMatchObject({
      id: "dividend-0056-2026-11-13",
      kind: "dividend",
      date: "2026-11-12",
      hour: 9,
      minute: 0,
      title: "0056 元大高股息 明天除息",
    });
    expect(r.body).toContain("每股 1.07 元");
    expect(r.body).toContain("2,000 股");
    expect(r.body).toContain("約 2,140 元");
  });

  test("除息日是週一：週五提醒，標題寫日期不寫「明天」", () => {
    const [r] = planDividendReminders(ledger, [{ symbol: "0056", exDate: "2026-11-16", cashPerShare: null }], "2026-10-30");
    expect(r.date).toBe("2026-11-13");
    expect(r.title).toBe("0056 11/16（一）除息");
    expect(r.body).toContain("配發金額還沒公告");
  });

  test("沒持有、或除息日前已賣光：不提醒", () => {
    const sold = ledgerOf([
      makeTx({ symbol: "0056", side: "buy", price: 35, shares: 1000, tradeDate: "2026-09-01" }),
      makeTx({ symbol: "0056", side: "sell", price: 36, shares: 1000, tradeDate: "2026-10-01" }),
    ]);
    const upcoming = [{ symbol: "0056", exDate: "2026-11-13", cashPerShare: 1 }];
    expect(planDividendReminders(sold, upcoming, "2026-10-30")).toEqual([]);
    expect(planDividendReminders(ledger, [{ symbol: "2330", exDate: "2026-11-13", cashPerShare: 4 }], "2026-10-30")).toEqual([]);
  });

  test("提醒日已經過了（除息日是明天以後但提醒日在昨天）、或超過排程範圍：不提醒", () => {
    // 今天週六，除息日週一 → 提醒日是昨天週五
    expect(planDividendReminders(ledger, [{ symbol: "0056", exDate: "2026-11-02", cashPerShare: 1 }], "2026-10-31")).toEqual(
      [],
    );
    expect(planDividendReminders(ledger, [{ symbol: "0056", exDate: "2027-03-01", cashPerShare: 1 }], "2026-10-30")).toEqual(
      [],
    );
  });
});

describe("定期定額扣款日提醒", () => {
  const active = new Set(["dca-1"]);

  test("扣款日當天 9 點提醒，遇週末順延到週一", () => {
    const reminders = planDcaReminders([rule({ dayOfMonth: 7 })], active, "2026-10-30", { "0050": "元大台灣50" });
    // 11/7 是週六 → 11/9；12/7 是週一
    expect(reminders.map((r) => r.date)).toEqual(["2026-11-09", "2026-12-07"]);
    expect(reminders[0]).toMatchObject({
      id: "dca-dca-1-2026-11",
      kind: "dca",
      hour: 9,
      title: "今天是 0050 元大台灣50 定期定額扣款日",
    });
    expect(reminders[0].body).toContain("3,000 元");
  });

  test("上個月底週末順延到這個月初的那期也會提醒", () => {
    // 2026-11-28 是週六 → 11-30 週一；今天 11-29（週日）
    const reminders = planDcaReminders([rule({ dayOfMonth: 28 })], active, "2026-11-29");
    expect(reminders[0].date).toBe("2026-11-30");
  });

  test("暫停中、Free 方案未啟用、已處理過的期數、開始前與結束後：不提醒", () => {
    expect(planDcaReminders([rule({ enabled: false })], active, "2026-10-30")).toEqual([]);
    expect(planDcaReminders([rule()], new Set(), "2026-10-30")).toEqual([]);
    expect(
      planDcaReminders([rule({ handledPeriods: ["2026-11"] })], active, "2026-10-30").map((r) => r.id),
    ).toEqual(["dca-dca-1-2026-12"]);
    expect(planDcaReminders([rule({ startDate: "2026-12-01" })], active, "2026-10-30").map((r) => r.date)).toEqual([
      "2026-12-07",
    ]);
    expect(planDcaReminders([rule({ endDate: "2026-11-30" })], active, "2026-10-30").map((r) => r.date)).toEqual([
      "2026-11-06",
    ]);
  });

  test("今天就是扣款日：照樣排（時間過了由排程那邊略過）", () => {
    expect(planDcaReminders([rule()], active, "2026-11-06")[0].date).toBe("2026-11-06");
  });
});

describe("收盤損益", () => {
  test("平日 14:30 到 19:00 之間、今天還沒發過才發", () => {
    expect(shouldSendCloseSummary(new Date(2026, 9, 30, 14, 29), null)).toBe(false);
    expect(shouldSendCloseSummary(new Date(2026, 9, 30, 14, 30), null)).toBe(true);
    expect(shouldSendCloseSummary(new Date(2026, 9, 30, 18, 59), "2026-10-29")).toBe(true);
    expect(shouldSendCloseSummary(new Date(2026, 9, 30, 19, 0), null)).toBe(false);
    expect(shouldSendCloseSummary(new Date(2026, 9, 30, 15, 0), "2026-10-30")).toBe(false);
    expect(shouldSendCloseSummary(new Date(2026, 9, 31, 15, 0), null)).toBe(false);
  });

  test("退路提醒：接下來 10 個平日的 19:00，今天的時間過了就從下一個平日開始", () => {
    const before = planCloseFallbacks(new Date(2026, 9, 30, 10, 0));
    expect(before).toHaveLength(10);
    expect(before[0]).toMatchObject({ id: closeFallbackId("2026-10-30"), date: "2026-10-30", hour: 19, minute: 0 });
    expect(before[1].date).toBe("2026-11-02");
    const after = planCloseFallbacks(new Date(2026, 9, 30, 19, 30), 2);
    expect(after.map((r) => r.date)).toEqual(["2026-11-02", "2026-11-03"]);
  });

  test("昨收：日期早於今天的最後一根", () => {
    const candles = [
      { date: "2026-10-28", open: 1, high: 1, low: 1, close: 100 },
      { date: "2026-10-29", open: 1, high: 1, low: 1, close: 102 },
      { date: "2026-10-30", open: 1, high: 1, low: 1, close: 105 },
    ];
    expect(previousClose(candles, "2026-10-30")).toBe(102);
    expect(previousClose(candles, "2026-10-28")).toBeNull();
  });

  const ledger = ledgerOf([
    makeTx({ symbol: "0050", side: "buy", price: 100, shares: 1000, fee: 0, tradeDate: "2026-09-01" }),
    makeTx({ symbol: "2330", side: "buy", price: 500, shares: 100, fee: 0, tradeDate: "2026-09-01" }),
  ]);
  const quote = (symbol: string, price: number, asOf = "2026/10/30"): Quote => ({ symbol, name: symbol, price, asOf });

  test("今天損益 = Σ 股數 × (收盤 − 昨收)，總報酬沿用總覽的算法", () => {
    const summary = buildCloseSummary(
      ledger,
      { "0050": quote("0050", 110), "2330": quote("2330", 480) },
      { "0050": 107, "2330": 490 },
      "2026-10-30",
    );
    // 1000 × 3 + 100 × (−10) = 2000；總報酬和首頁一樣（未實現已扣掉預估賣出的手續費與稅）
    const overall = buildOverview(ledger, (s) => ({ "0050": quote("0050", 110), "2330": quote("2330", 480) })[s], "2026-10-30")
      .summary.overall;
    expect(summary).toEqual({ todayChange: 2000, totalReturn: overall.totalReturn, returnRate: overall.returnRate });
    expect(overall.totalReturn).toBe(7522);
    expect(closeSummaryMessage(summary!)).toEqual({
      title: "今日收盤損益",
      body: "今天 +2,000 元，總報酬 +7,522 元（+5.01%）",
    });
  });

  test("行情日期不是今天（休市或還沒更新）、缺報價或昨收：不發", () => {
    const prev = { "0050": 107, "2330": 490 };
    expect(
      buildCloseSummary(ledger, { "0050": quote("0050", 110, "2026/10/29"), "2330": quote("2330", 480) }, prev, "2026-10-30"),
    ).toBeNull();
    expect(buildCloseSummary(ledger, { "0050": quote("0050", 110) }, prev, "2026-10-30")).toBeNull();
    expect(
      buildCloseSummary(ledger, { "0050": quote("0050", 110), "2330": quote("2330", 480) }, { "0050": 107 }, "2026-10-30"),
    ).toBeNull();
  });

  test("沒有持股：不發", () => {
    expect(buildCloseSummary(ledgerOf([]), {}, {}, "2026-10-30")).toBeNull();
  });

  test("虧損的寫法", () => {
    expect(closeSummaryMessage({ todayChange: -3200, totalReturn: -500, returnRate: -0.085 }).body).toBe(
      "今天 -3,200 元，總報酬 -500 元（-8.50%）",
    );
    expect(closeSummaryMessage({ todayChange: 0, totalReturn: null, returnRate: null }).body).toBe("今天 0 元");
  });
});

describe("全部一起排", () => {
  const ledger = ledgerOf([makeTx({ symbol: "0056", side: "buy", price: 35, shares: 1000, tradeDate: "2026-09-01" })], {
    dcaRules: [rule()],
  });
  const base = {
    ledger,
    upcoming: [{ symbol: "0056", exDate: "2026-11-13", cashPerShare: 1 }],
    activeDcaRuleIds: new Set(["dca-1"]),
    now: new Date(2026, 9, 30, 10, 0),
    closeSummarySentOn: null,
  };
  const kinds = (switches: Parameters<typeof planReminders>[0]["switches"], patch = {}) =>
    [...new Set(planReminders({ ...base, ...patch, switches }).map((r) => r.kind))];

  test("只排有打開的種類", () => {
    expect(kinds({ closeSummary: false, dividendReminder: false, dcaReminder: false })).toEqual([]);
    expect(kinds({ closeSummary: true, dividendReminder: false, dcaReminder: false })).toEqual(["closeSummary"]);
    expect(kinds({ closeSummary: false, dividendReminder: true, dcaReminder: true })).toEqual(["dividend", "dca"]);
  });

  test("今天已經發過收盤損益：不排今天的退路提醒", () => {
    const all = { closeSummary: true, dividendReminder: false, dcaReminder: false };
    const sent = planReminders({ ...base, switches: all, closeSummarySentOn: "2026-10-30" });
    expect(sent[0].date).toBe("2026-11-02");
    expect(planReminders({ ...base, switches: all })[0].date).toBe("2026-10-30");
  });

  test("時間已過的提醒不排", () => {
    // 11/06 9:30：當天扣款提醒（9:00）已過
    const reminders = planReminders({
      ...base,
      now: new Date(2026, 10, 6, 9, 30),
      switches: { closeSummary: false, dividendReminder: false, dcaReminder: true },
    });
    expect(reminders.map((r) => r.date)).toEqual(["2026-12-07"]);
  });
});
