import { spec37, spec37Ledger } from "@/domain/ledgerTestData";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import type { LedgerStore } from "./LedgerStore";
import { createLedgerRepository, createMemoryLedgerRepository, type TransactionDraft } from "./ledgerRepository";
import { createMemoryLedgerStore } from "./memoryLedgerStore";

const NOW = new Date(2026, 9, 27, 10, 0, 0);
const opts = () => {
  let n = 0;
  return { now: () => NOW, newId: (prefix: "tx" | "div") => `${prefix}-${++n}` };
};

const BUY: TransactionDraft = {
  symbol: "2330",
  side: "buy",
  tradeDate: "2026-10-01",
  price: 600,
  shares: 1000,
  fee: 855,
  tax: 0,
  feeOverridden: false,
  source: "manual",
};

describe("ledgerRepository（對應 docs/stories/008）", () => {
  test("讀完前 snapshot 是 null，load 後是記帳本，重複 load 只讀一次", async () => {
    const store = createMemoryLedgerStore(spec37Ledger());
    const loadSpy = jest.spyOn(store, "load");
    const repo = createLedgerRepository(store, opts());
    expect(repo.getSnapshot()).toBeNull();
    expect(await repo.load()).toEqual(spec37Ledger());
    await repo.load();
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(repo.getSnapshot()).toEqual(spec37Ledger());
  });

  test("新增交易：補上 id 與時間、存進 store、通知訂閱者", async () => {
    const store = createMemoryLedgerStore();
    const repo = createLedgerRepository(store, opts());
    const listener = jest.fn();
    repo.subscribe(listener);

    const result = await repo.addTransaction(BUY);
    expect(result.ok).toBe(true);
    const [t] = repo.getSnapshot()?.transactions ?? [];
    expect(t).toEqual({ ...BUY, id: "tx-1", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    expect((await store.load()).transactions).toEqual([t]);
    expect(listener).toHaveBeenCalled();
  });

  test("賣超被拒絕：記帳本不變、不存、訊息照規格 3.7", async () => {
    const repo = createMemoryLedgerRepository(spec37Ledger(), opts());
    const before = await repo.load();
    const result = await repo.addTransaction({ ...BUY, side: "sell", shares: 2000, fee: 0, tradeDate: "2026-10-01" });
    expect(result).toMatchObject({ ok: false, error: { code: "oversell", message: "賣出股數超過持有股數（1,500 股）" } });
    expect(repo.getSnapshot()).toBe(before);
  });

  test("修改、刪除交易；刪掉買入導致後面賣超會被拒絕", async () => {
    const repo = createMemoryLedgerRepository(spec37Ledger(), opts());
    await repo.load();
    const updated = await repo.updateTransaction({ ...spec37.step2, note: "改備註" });
    expect(updated.ok && updated.ledger.transactions[1]).toMatchObject({ note: "改備註", updatedAt: NOW.toISOString() });

    expect((await repo.deleteTransaction("step2")).ok).toBe(true);
    const rejected = await repo.deleteTransaction("step1");
    expect(rejected).toMatchObject({ ok: false, error: { code: "oversell" } });
    expect(repo.getSnapshot()?.transactions.map((t) => t.id)).toEqual(["step1", "step3"]);
  });

  test("新增、刪除股利", async () => {
    const repo = createMemoryLedgerRepository(spec37Ledger(), opts());
    const added = await repo.addDividend({
      symbol: "2330",
      type: "cash",
      exDate: "2026-09-15",
      cashAmount: 4500,
      status: "received",
      source: "manual",
    });
    expect(added.ok && added.ledger.dividends.map((d) => d.id)).toEqual(["step4", "div-1"]);
    expect((await repo.deleteDividend("step4")).ok).toBe(true);
  });

  test("切換核心／衛星、改回預設；改手續費設定", async () => {
    const repo = createMemoryLedgerRepository(emptyLedger(), opts());
    await repo.setBucket("2330", "core");
    expect(repo.getSnapshot()?.holdingSettings).toEqual([{ symbol: "2330", bucket: "core" }]);
    await repo.setBucket("2330", null);
    expect(repo.getSnapshot()?.holdingSettings).toEqual([]);
    await repo.updateSettings({ feeDiscount: 0.28 });
    expect(repo.getSnapshot()?.settings.feeDiscount).toBe(0.28);
  });

  test("整份取代：重播不過就拒絕", async () => {
    const repo = createMemoryLedgerRepository(emptyLedger(), opts());
    const bad = { ...spec37Ledger(), transactions: [spec37.step3] };
    expect(await repo.replaceLedger(bad)).toMatchObject({ ok: false, error: { code: "oversell" } });
    expect((await repo.replaceLedger(spec37Ledger())).ok).toBe(true);
  });

  test("存檔失敗：回 saveFailed，記憶體裡的記帳本不變", async () => {
    const store: LedgerStore = { ...createMemoryLedgerStore(), save: () => Promise.reject(new Error("disk full")) };
    const repo = createLedgerRepository(store, opts());
    expect(await repo.addTransaction(BUY)).toEqual({
      ok: false,
      error: { code: "saveFailed", message: "存檔失敗，請再試一次" },
    });
    expect(repo.getSnapshot()?.transactions).toEqual([]);
  });

  test("同時送出的寫入依序套用，不互相覆蓋", async () => {
    const repo = createMemoryLedgerRepository(emptyLedger(), opts());
    await Promise.all([repo.addTransaction(BUY), repo.addTransaction({ ...BUY, price: 500 })]);
    expect(repo.getSnapshot()?.transactions.map((t) => t.price)).toEqual([600, 500]);
  });

  test("交易日期晚於今天被拒絕", async () => {
    const repo = createMemoryLedgerRepository(emptyLedger(), opts());
    expect(await repo.addTransaction({ ...BUY, tradeDate: "2026-10-28" })).toMatchObject({
      ok: false,
      error: { code: "invalid", field: "tradeDate" },
    });
  });

  test("reload：重新從 store 讀，通知訂閱者", async () => {
    const store = createMemoryLedgerStore(spec37Ledger());
    const repo = createLedgerRepository(store, opts());
    await repo.load();
    await store.clear();
    const listener = jest.fn();
    repo.subscribe(listener);
    expect(await repo.reload()).toEqual(emptyLedger());
    expect(listener).toHaveBeenCalled();
  });
});
