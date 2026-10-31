import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { Ledger } from "@/domain/ledgerTypes";
import { makeTx } from "@/domain/ledgerTestData";
import type { Candle, Quote } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import { runCloseSummaryJob, type CloseSummaryJobDeps } from "./closeSummaryJob";
import { PriceLoadError, type PriceSource } from "./PriceSource";

// 2026-10-30 是週五
const LEDGER: Ledger = {
  schemaVersion: 1,
  transactions: [makeTx({ symbol: "0050", side: "buy", price: 100, shares: 1000, fee: 0, tradeDate: "2026-09-01" })],
  dividends: [],
  holdingSettings: [],
  settings: DEFAULT_USER_SETTINGS,
};

const candles: Candle[] = [
  { date: "2026-10-29", open: 105, high: 105, low: 105, close: 105 },
  { date: "2026-10-30", open: 108, high: 108, low: 108, close: 108 },
];

function deps(patch: Partial<CloseSummaryJobDeps> = {}): CloseSummaryJobDeps & {
  present: jest.Mock;
  saveLastSent: jest.Mock;
  cancelReminder: jest.Mock;
} {
  const quote: Quote = { symbol: "0050", name: "元大台灣50", price: 108, asOf: "2026/10/30" };
  const priceSource: PriceSource = { getQuote: jest.fn(async () => quote) };
  const candleSource: CandleSource = { getDailyCandles: jest.fn(async () => candles) };
  return {
    now: () => new Date(2026, 9, 30, 15, 0),
    isEnabled: async () => true,
    loadLastSent: async () => null,
    loadLedger: async () => LEDGER,
    priceSource,
    candleSource,
    ...patch,
    present: jest.fn(async () => {}),
    saveLastSent: jest.fn(async () => {}),
    cancelReminder: jest.fn(async () => {}),
  };
}

describe("收盤損益背景工作（對應 docs/stories/034）", () => {
  test("交易日收盤後：發通知、記下今天已發、取消今天 19:00 的退路提醒", async () => {
    const d = deps();
    await expect(runCloseSummaryJob(d)).resolves.toBe("sent");
    expect(d.present).toHaveBeenCalledWith("今日收盤損益", expect.stringMatching(/^今天 \+3,000 元，總報酬 \+/));
    expect(d.saveLastSent).toHaveBeenCalledWith("2026-10-30");
    expect(d.cancelReminder).toHaveBeenCalledWith("close-fallback-2026-10-30");
  });

  test("抓日 K 時要上個月與這個月（月初的昨收在上個月）", async () => {
    const d = deps({ now: () => new Date(2026, 10, 2, 15, 0) });
    await runCloseSummaryJob(d);
    expect(d.candleSource.getDailyCandles).toHaveBeenCalledWith("0050", ["2026-10", "2026-11"]);
  });

  test("功能開關或設定頁開關關著：什麼都不做", async () => {
    const d = deps({ isEnabled: async () => false });
    await expect(runCloseSummaryJob(d)).resolves.toBe("disabled");
    expect(d.priceSource.getQuote).not.toHaveBeenCalled();
    expect(d.present).not.toHaveBeenCalled();
  });

  test("還沒 14:30、週末、今天已經發過：不抓也不發", async () => {
    for (const patch of [
      { now: () => new Date(2026, 9, 30, 14, 0) },
      { now: () => new Date(2026, 9, 31, 15, 0) },
      { loadLastSent: async () => "2026-10-30" },
    ]) {
      const d = deps(patch);
      await expect(runCloseSummaryJob(d)).resolves.toBe("notNow");
      expect(d.priceSource.getQuote).not.toHaveBeenCalled();
    }
  });

  test("行情還沒更新到今天（或休市）：不發，下次再試", async () => {
    const stale: PriceSource = {
      getQuote: async () => ({ symbol: "0050", name: "元大台灣50", price: 105, asOf: "2026/10/29" }),
    };
    const d = deps({ priceSource: stale });
    await expect(runCloseSummaryJob(d)).resolves.toBe("noData");
    expect(d.present).not.toHaveBeenCalled();
    expect(d.saveLastSent).not.toHaveBeenCalled();
  });

  test("斷網抓不到：不發、不丟錯", async () => {
    const offline: PriceSource = {
      getQuote: async () => {
        throw new PriceLoadError();
      },
    };
    const d = deps({ priceSource: offline });
    await expect(runCloseSummaryJob(d)).resolves.toBe("noData");
  });

  test("沒有持股：不發", async () => {
    const d = deps({ loadLedger: async () => ({ ...LEDGER, transactions: [] }) });
    await expect(runCloseSummaryJob(d)).resolves.toBe("noData");
    expect(d.priceSource.getQuote).not.toHaveBeenCalled();
  });
});
