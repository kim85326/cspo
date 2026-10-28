import { spec37Ledger } from "@/domain/ledgerTestData";
import { syncAutoDividends } from "./autoDividendSync";
import type { CorporateActionSource } from "./CorporateActionSource";
import { fakeCorporateActionSource } from "./fakeCorporateActionSource";
import { createLedgerRepository } from "./ledgerRepository";
import { createMemoryLedgerStore } from "./memoryLedgerStore";
import { PriceLoadError } from "./PriceSource";

const NOW = new Date(2026, 9, 28, 10, 0, 0);
const opts = () => {
  let n = 0;
  return { now: () => NOW, newId: (prefix: "tx" | "div") => `${prefix}-${++n}` };
};

describe("syncAutoDividends（對應 docs/stories/012）", () => {
  test("3.7 範例 + 假除權息資料：補上 2330 三次除息，手動記的 6/15 不重複；存進手機", async () => {
    // fakeCorporateActionSource 的 2330（FinMind 真實資料）：
    //   2025-12-11 → 還沒買，不建立
    //   2026-03-17 每股 6.000035，參與 1500 股（3/5 已賣 500）→ floor(9000.0525) = 9,000，4/9 已發放
    //   2026-06-11 → 同上 9,000，7/9 已發放（3.7 範例手動記的是 6/15，日期不同，不算重複）
    //   2026-09-16 每股 7.000001 → floor(10500.0015) = 10,500，10/8 已發放
    const store = createMemoryLedgerStore(spec37Ledger());
    const repo = createLedgerRepository(store, opts());
    const result = await syncAutoDividends({ repository: repo, actions: fakeCorporateActionSource, now: () => NOW });
    expect(result.ok).toBe(true);
    const auto = (await store.load()).dividends.filter((d) => d.source === "auto");
    expect(auto.map((d) => [d.exDate, d.cashAmount, d.status, d.payDate])).toEqual([
      ["2026-03-17", 9000, "received", "2026-04-09"],
      ["2026-06-11", 9000, "received", "2026-07-09"],
      ["2026-09-16", 10500, "received", "2026-10-08"],
    ]);
  });

  test("再跑一次沒有變化：不存檔", async () => {
    const store = createMemoryLedgerStore(spec37Ledger());
    const repo = createLedgerRepository(store, opts());
    await syncAutoDividends({ repository: repo, actions: fakeCorporateActionSource, now: () => NOW });
    const save = jest.spyOn(store, "save");
    const again = await syncAutoDividends({ repository: repo, actions: fakeCorporateActionSource, now: () => NOW });
    expect(again.ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  test("抓的範圍是第一筆交易日到今天；某一檔抓不到就略過那一檔", async () => {
    const calls: [string, string, string][] = [];
    const flaky: CorporateActionSource = {
      async getActions(symbol, from, to) {
        calls.push([symbol, from, to]);
        if (symbol === "2330") throw new PriceLoadError("斷網");
        return [{ kind: "dividend", symbol, exDate: "2026-07-21", cashPerShare: 0.6, stockPerThousand: 0, payDate: "2026-11-10" }];
      },
    };
    const ledger = spec37Ledger();
    const buy0050 = { ...ledger.transactions[0], id: "etf", symbol: "0050", tradeDate: "2026-02-10", shares: 2000 };
    const store = createMemoryLedgerStore({ ...ledger, transactions: [...ledger.transactions, buy0050] });
    const repo = createLedgerRepository(store, opts());
    await syncAutoDividends({ repository: repo, actions: flaky, now: () => NOW });
    expect(calls).toEqual([
      ["2330", "2026-01-05", "2026-10-28"],
      ["0050", "2026-02-10", "2026-10-28"],
    ]);
    // 2000 股 × 0.6 = 1,200，發放日 11/10 還沒到 → 預估
    expect((await store.load()).dividends.filter((d) => d.source === "auto")).toEqual([
      expect.objectContaining({ symbol: "0050", cashAmount: 1200, status: "estimated" }),
    ]);
  });

  test("刪掉自動股利後再跑，不會再出現", async () => {
    const store = createMemoryLedgerStore(spec37Ledger());
    const repo = createLedgerRepository(store, opts());
    await syncAutoDividends({ repository: repo, actions: fakeCorporateActionSource, now: () => NOW });
    const target = repo.getSnapshot()?.dividends.find((d) => d.exDate === "2026-06-11");
    expect(target).toBeDefined();
    const deleted = await repo.deleteDividend(target!.id);
    expect(deleted.ok).toBe(true);
    expect(repo.getSnapshot()?.dismissedAutoDividends).toEqual(["2330|2026-06-11|cash"]);
    await syncAutoDividends({ repository: repo, actions: fakeCorporateActionSource, now: () => NOW });
    expect(repo.getSnapshot()?.dividends.some((d) => d.exDate === "2026-06-11")).toBe(false);
  });
});
