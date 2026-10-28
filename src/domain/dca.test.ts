import {
  activeDcaRuleIds,
  candleMonthsFor,
  dcaPurchase,
  duePeriods,
  generateDcaTransactions,
  nextPeriod,
  parseDcaRuleForm,
  scheduledDate,
  setDcaRuleEnabled,
  type DcaGenerationInput,
} from "./dca";
import { DEFAULT_USER_SETTINGS } from "./fees";
import type { DcaRule, Ledger } from "./ledgerTypes";
import { emptyLedger } from "./migrateSavedHoldings";
import type { Candle } from "./types";

function rule(patch: Partial<DcaRule> = {}): DcaRule {
  return {
    id: "dca-1",
    symbol: "0050",
    amount: 5000,
    dayOfMonth: 6,
    startDate: "2026-07-01",
    enabled: true,
    handledPeriods: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...patch,
  };
}

function candle(date: string, close: number): Candle {
  return { date, open: close, high: close, low: close, close };
}

function ledgerWith(rules: DcaRule[], patch: Partial<Ledger> = {}): Ledger {
  return { ...emptyLedger(), dcaRules: rules, ...patch };
}

let seq = 0;
function input(ledger: Ledger, candles: Record<string, Candle[]>, today: string): DcaGenerationInput {
  seq = 0;
  return {
    ledger,
    candles,
    today,
    newId: () => `tx-${++seq}`,
    now: `${today}T15:00:00.000Z`,
  };
}

describe("期數與扣款日", () => {
  test("scheduledDate 補零、nextPeriod 跨年", () => {
    expect(scheduledDate("2026-10", 6)).toBe("2026-10-06");
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(nextPeriod("2026-09")).toBe("2026-10");
  });

  test("開始日期之後、今天以前到期的期數；開始日當月扣款日已過就從下個月起", () => {
    expect(duePeriods(rule({ startDate: "2026-07-10" }), "2026-10-05")).toEqual(["2026-08", "2026-09"]);
    expect(duePeriods(rule({ startDate: "2026-07-06" }), "2026-10-06")).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  test("結束日期之後不再產生", () => {
    expect(duePeriods(rule({ endDate: "2026-08-31" }), "2026-10-28")).toEqual(["2026-07", "2026-08"]);
  });

  test("已處理過的期數、暫停中的規則都不算", () => {
    expect(duePeriods(rule({ handledPeriods: ["2026-07", "2026-09"] }), "2026-10-28")).toEqual([
      "2026-08",
      "2026-10",
    ]);
    expect(duePeriods(rule({ enabled: false }), "2026-10-28")).toEqual([]);
  });

  test("恢復後，暫停期間到期的期數不補", () => {
    expect(duePeriods(rule({ resumedAt: "2026-09-10" }), "2026-10-28")).toEqual(["2026-10"]);
  });

  test("要抓的月份：第一期到今天所在的月份（月底順延到下個月也抓得到）", () => {
    expect(candleMonthsFor(["2026-08", "2026-09"], "2026-10-02")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(candleMonthsFor([], "2026-10-02")).toEqual([]);
  });
});

describe("dcaPurchase（股數公式）", () => {
  test("P2-02 範例：5,000 元、成交價 180 → 27 股、成交金額 4,860、手續費 6", () => {
    expect(dcaPurchase(5000, 180, DEFAULT_USER_SETTINGS)).toEqual({ shares: 27, amount: 4860, fee: 6 });
  });

  test("零股最低手續費 1 元：3,000 元、成交價 150 → 19 股、手續費 4", () => {
    // floor(3000 ÷ (150 × 1.001425)) = 19；2,850 × 0.001425 = 4.06 → 4
    expect(dcaPurchase(3000, 150, DEFAULT_USER_SETTINGS)).toEqual({ shares: 19, amount: 2850, fee: 4 });
  });

  test("最低手續費讓總額超過每期金額時，少買一股，不會扣超過", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, minFeeOddLot: 20 };
    // 公式算出 9 股（9 × 100 + 20 = 920 > 910），減成 8 股（800 + 20 = 820）
    expect(dcaPurchase(910, 100, settings)).toEqual({ shares: 8, amount: 800, fee: 20 });
  });

  test("手續費折扣算進公式", () => {
    const settings = { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 };
    // floor(10000 ÷ (180 × 1.000399)) = 55；9,900 × 0.000399 = 3.95 → 3
    expect(dcaPurchase(10_000, 180, settings)).toEqual({ shares: 55, amount: 9900, fee: 3 });
  });

  test("連 1 股都買不起：0 股", () => {
    expect(dcaPurchase(100, 180, DEFAULT_USER_SETTINGS)).toEqual({ shares: 0, amount: 0, fee: 0 });
  });
});

describe("generateDcaTransactions（P2-02 產生邏輯）", () => {
  test("AC1：範例產生 27 股、手續費 6 的買入交易，source = dca", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01" })]);
    const result = generateDcaTransactions(input(ledger, { "0050": [candle("2026-10-06", 180)] }, "2026-10-28"));

    expect(result.created).toEqual([
      expect.objectContaining({
        symbol: "0050",
        side: "buy",
        tradeDate: "2026-10-06",
        price: 180,
        shares: 27,
        fee: 6,
        tax: 0,
        feeOverridden: false,
        source: "dca",
        dcaRuleId: "dca-1",
        dcaPeriod: "2026-10",
      }),
    ]);
    expect(result.ledger.transactions).toEqual(result.created);
    expect(result.ledger.dcaRules?.[0].handledPeriods).toEqual(["2026-10"]);
  });

  test("AC2：扣款日是週六，交易日期是下週一，成交價用週一收盤", () => {
    // 2026-11-07 是週六
    const ledger = ledgerWith([rule({ dayOfMonth: 7, startDate: "2026-11-01" })]);
    const candles = [candle("2026-11-06", 170), candle("2026-11-09", 175)];
    const result = generateDcaTransactions(input(ledger, { "0050": candles }, "2026-11-10"));

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ tradeDate: "2026-11-09", price: 175, dcaPeriod: "2026-11" });
  });

  test("AC3：三個月沒開 App，打開後補產生三筆", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-08-01" })]);
    const candles = [
      candle("2026-08-06", 180),
      candle("2026-09-07", 185), // 9/6 是週日
      candle("2026-10-06", 190),
    ];
    const result = generateDcaTransactions(input(ledger, { "0050": candles }, "2026-10-28"));

    expect(result.created.map((t) => [t.dcaPeriod, t.tradeDate])).toEqual([
      ["2026-08", "2026-08-06"],
      ["2026-09", "2026-09-07"],
      ["2026-10", "2026-10-06"],
    ]);
  });

  test("AC4：刪除某一期自動產生的交易後，再跑一次不會補回", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01" })]);
    const candles = { "0050": [candle("2026-10-06", 180)] };
    const first = generateDcaTransactions(input(ledger, candles, "2026-10-28"));
    const afterDelete: Ledger = { ...first.ledger, transactions: [] };

    const second = generateDcaTransactions(input(afterDelete, candles, "2026-10-29"));
    expect(second.created).toEqual([]);
    expect(second.ledger).toBe(afterDelete);
  });

  test("同一規則同一期只產生一筆：重跑不會重複", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01" })]);
    const candles = { "0050": [candle("2026-10-06", 180)] };
    const first = generateDcaTransactions(input(ledger, candles, "2026-10-28"));
    const second = generateDcaTransactions(input(first.ledger, candles, "2026-10-28"));
    expect(second.created).toEqual([]);
    expect(second.ledger.transactions).toHaveLength(1);
  });

  test("今天扣款但還沒有收盤價：先不產生、不標記，下次有價格再補", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01", dayOfMonth: 28 })]);
    const before = generateDcaTransactions(input(ledger, { "0050": [candle("2026-10-27", 180)] }, "2026-10-28"));
    expect(before.created).toEqual([]);
    expect(before.skipped).toEqual([{ ruleId: "dca-1", period: "2026-10", reason: "noPrice" }]);
    expect(before.ledger).toBe(ledger);

    const after = generateDcaTransactions(
      input(ledger, { "0050": [candle("2026-10-27", 180), candle("2026-10-28", 182)] }, "2026-10-28"),
    );
    expect(after.created[0]).toMatchObject({ tradeDate: "2026-10-28", price: 182 });
  });

  test("晚於今天的日 K（假資料會有）不拿來用", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01", dayOfMonth: 24 })]);
    // 10/24 週六，下一個交易日 10/26 還沒到
    const result = generateDcaTransactions(input(ledger, { "0050": [candle("2026-10-26", 180)] }, "2026-10-25"));
    expect(result.created).toEqual([]);
  });

  test("抓不到日 K 的代號：整條規則先跳過", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01" })]);
    const result = generateDcaTransactions(input(ledger, {}, "2026-10-28"));
    expect(result.created).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  test("金額不足買 1 股：不產生交易，但標記已處理", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01", amount: 100 })]);
    const result = generateDcaTransactions(input(ledger, { "0050": [candle("2026-10-06", 180)] }, "2026-10-28"));
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([{ ruleId: "dca-1", period: "2026-10", reason: "tooSmall" }]);
    expect(result.ledger.dcaRules?.[0].handledPeriods).toEqual(["2026-10"]);
  });

  test("用記帳本的手續費設定", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01", amount: 10_000 })], {
      settings: { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 },
    });
    const result = generateDcaTransactions(input(ledger, { "0050": [candle("2026-10-06", 180)] }, "2026-10-28"));
    expect(result.created[0]).toMatchObject({ shares: 55, fee: 3 });
  });

  test("那段時間沒有資料（順延超過 14 天）：不把好幾期擠到同一天，先跳過", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-08-01" })]);
    const result = generateDcaTransactions(input(ledger, { "0050": [candle("2026-10-06", 180)] }, "2026-10-28"));
    expect(result.created.map((t) => t.dcaPeriod)).toEqual(["2026-10"]);
    expect(result.skipped.map((s) => [s.period, s.reason])).toEqual([
      ["2026-08", "noPrice"],
      ["2026-09", "noPrice"],
    ]);
  });

  test("春節連假順延 9 天仍然產生", () => {
    const ledger = ledgerWith([rule({ startDate: "2027-02-01", dayOfMonth: 5 })]);
    const result = generateDcaTransactions(input(ledger, { "0050": [candle("2027-02-14", 200)] }, "2027-02-20"));
    expect(result.created[0]).toMatchObject({ tradeDate: "2027-02-14", dcaPeriod: "2027-02" });
  });

  test("只處理 ruleIds 裡的規則", () => {
    const ledger = ledgerWith([rule({ startDate: "2026-10-01" }), rule({ id: "dca-2", symbol: "006208", startDate: "2026-10-01" })]);
    const candles = { "0050": [candle("2026-10-06", 180)], "006208": [candle("2026-10-06", 100)] };
    const result = generateDcaTransactions({
      ...input(ledger, candles, "2026-10-28"),
      ruleIds: new Set(["dca-2"]),
    });
    expect(result.created.map((t) => t.symbol)).toEqual(["006208"]);
  });

  test("舊資料沒有 dcaRules：什麼都不做", () => {
    const ledger = emptyLedger();
    const result = generateDcaTransactions(input(ledger, {}, "2026-10-28"));
    expect(result.ledger).toBe(ledger);
    expect(result.created).toEqual([]);
  });
});

describe("activeDcaRuleIds（Free 1 條、Pro 不限）", () => {
  const rules = [
    rule({ id: "b", createdAt: "2026-09-01T00:00:00.000Z" }),
    rule({ id: "a", createdAt: "2026-08-01T00:00:00.000Z" }),
  ];

  test("Free 只有最早建立的那條", () => {
    expect([...activeDcaRuleIds(rules, false)]).toEqual(["a"]);
  });

  test("Pro 全部", () => {
    expect(activeDcaRuleIds(rules, true)).toEqual(new Set(["a", "b"]));
  });
});

describe("setDcaRuleEnabled（暫停／恢復）", () => {
  test("暫停：enabled = false", () => {
    expect(setDcaRuleEnabled(rule(), false, "2026-10-28")).toMatchObject({ enabled: false });
  });

  test("恢復：記下恢復日，暫停期間不補", () => {
    const resumed = setDcaRuleEnabled(rule({ enabled: false }), true, "2026-10-28");
    expect(resumed).toMatchObject({ enabled: true, resumedAt: "2026-10-28" });
    expect(duePeriods(resumed, "2026-10-28")).toEqual([]);
  });

  test("狀態沒變就原樣回傳", () => {
    const r = rule();
    expect(setDcaRuleEnabled(r, true, "2026-10-28")).toBe(r);
  });
});

describe("parseDcaRuleForm", () => {
  const valid = { symbol: "0050", amount: "5,000", dayOfMonth: "6", startDate: "2026/10/01", endDate: "" };

  test("合法輸入", () => {
    expect(parseDcaRuleForm(valid)).toEqual({
      ok: true,
      value: { symbol: "0050", amount: 5000, dayOfMonth: 6, startDate: "2026-10-01", endDate: undefined },
    });
  });

  test("扣款日只能 1–28", () => {
    for (const dayOfMonth of ["0", "29", "31", "1.5", ""]) {
      const result = parseDcaRuleForm({ ...valid, dayOfMonth });
      expect(result.ok ? null : result.errors.dayOfMonth).toBe("扣款日請填 1–28");
    }
    expect(parseDcaRuleForm({ ...valid, dayOfMonth: "28" }).ok).toBe(true);
  });

  test("金額、股票、日期", () => {
    const result = parseDcaRuleForm({ symbol: "", amount: "0", dayOfMonth: "6", startDate: "", endDate: "2026/02/30" });
    expect(result.ok ? null : result.errors).toEqual({
      symbol: "請選擇股票",
      amount: "每期金額必須是大於 0 的整數",
      startDate: "請選擇開始日期",
      endDate: "結束日期格式不對",
    });
  });

  test("結束日期不可早於開始日期", () => {
    const result = parseDcaRuleForm({ ...valid, endDate: "2026/09/30" });
    expect(result.ok ? null : result.errors.endDate).toBe("結束日期不可早於開始日期");
  });
});
