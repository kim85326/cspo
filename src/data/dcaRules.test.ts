import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import type { Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import type { Candle } from "@/domain/types";
import { createAsyncStorageLedgerStore, LEDGER_STORAGE_KEY, parseLedger } from "./asyncStorageLedgerStore";
import type { CandleSource } from "./CandleSource";
import {
  addDcaRule,
  dcaTransactionsOf,
  deleteDcaRule,
  runDcaCatchUp,
  setDcaRuleEnabledById,
  updateDcaRule,
} from "./dcaRules";
import { createLedgerRepository, createMemoryLedgerRepository } from "./ledgerRepository";

const RULE = { symbol: "0050", amount: 5000, dayOfMonth: 6, startDate: "2026-08-01", endDate: undefined };

function candle(date: string, close: number): Candle {
  return { date, open: close, high: close, low: close, close };
}

/** 假日 K：8/6、9/7（9/6 週日）、10/6 各一根；記下被要了哪些月份 */
function fakeSource(closes: Candle[] = [candle("2026-08-06", 180), candle("2026-09-07", 185), candle("2026-10-06", 190)]) {
  const calls: { symbol: string; months: string[] }[] = [];
  const source: CandleSource = {
    async getDailyCandles(symbol, months) {
      calls.push({ symbol, months });
      return closes.filter((c) => months.includes(c.date.slice(0, 7)));
    },
  };
  return { source, calls };
}

function setup(today = new Date(2026, 9, 28, 20, 0, 0), initial?: Ledger) {
  let clock = today;
  const repository = createMemoryLedgerRepository(initial, { now: () => clock });
  return { repository, setNow: (d: Date) => (clock = d) };
}

let seq = 0;
const ids = () => `id-${++seq}`;

beforeEach(() => {
  seq = 0;
});

describe("規則的新增、修改、暫停、刪除（Story 024）", () => {
  test("新增的規則存在記帳本 dcaRules，啟用中、還沒處理任何一期", async () => {
    const { repository } = setup();
    const result = await addDcaRule(repository, RULE, () => "dca-1");
    expect(result.ok).toBe(true);
    expect(repository.getSnapshot()?.dcaRules).toEqual([
      expect.objectContaining({ id: "dca-1", ...RULE, enabled: true, handledPeriods: [] }),
    ]);
  });

  test("修改只改規則欄位，已處理的期數與已產生的交易不動", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28", newId: ids });

    await updateDcaRule(repository, "dca-1", { ...RULE, amount: 10_000, dayOfMonth: 15 });
    const ledger = repository.getSnapshot() as Ledger;
    expect(ledger.dcaRules?.[0]).toMatchObject({ amount: 10_000, dayOfMonth: 15, handledPeriods: ["2026-08", "2026-09", "2026-10"] });
    expect(ledger.transactions.map((t) => t.shares)).toEqual([27, 26, 26]);
  });

  test("暫停後不產生；恢復後暫停期間的期數不補", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    await setDcaRuleEnabledById(repository, "dca-1", false);
    const paused = await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28" });
    expect(paused.created).toEqual([]);

    await setDcaRuleEnabledById(repository, "dca-1", true);
    expect(repository.getSnapshot()?.dcaRules?.[0]).toMatchObject({ enabled: true, resumedAt: "2026-10-28" });
    const resumed = await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28" });
    expect(resumed.created).toEqual([]);
  });

  test("刪除規則：之後不再產生，已產生的交易保留並仍標 source = dca", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28", newId: ids });
    await deleteDcaRule(repository, "dca-1");

    const ledger = repository.getSnapshot() as Ledger;
    expect(ledger.dcaRules).toEqual([]);
    expect(ledger.transactions).toHaveLength(3);
    expect(ledger.transactions.every((t) => t.source === "dca" && t.dcaRuleId === "dca-1")).toBe(true);
  });

  test("找不到規則：不寫入", async () => {
    const { repository } = setup();
    await repository.load();
    const before = repository.getSnapshot();
    await updateDcaRule(repository, "nope", RULE);
    await deleteDcaRule(repository, "nope");
    expect(repository.getSnapshot()).toBe(before);
  });
});

describe("runDcaCatchUp（App 開啟時補帳）", () => {
  test("三個月沒開 App：補產生三筆，只抓需要的月份", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    const { source, calls } = fakeSource();
    const report = await runDcaCatchUp({ repository, candleSource: source, unlimited: true, today: "2026-10-28", newId: ids });

    expect(report.created.map((t) => [t.tradeDate, t.price, t.shares])).toEqual([
      ["2026-08-06", 180, 27],
      ["2026-09-07", 185, 26],
      ["2026-10-06", 190, 26],
    ]);
    expect(calls).toEqual([{ symbol: "0050", months: ["2026-08", "2026-09", "2026-10"] }]);
    expect(dcaTransactionsOf(repository.getSnapshot() as Ledger, "dca-1").map((t) => t.tradeDate)).toEqual([
      "2026-10-06",
      "2026-09-07",
      "2026-08-06",
    ]);
  });

  test("刪掉某一期自動產生的交易後，重開 App 不會再出現", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    const first = await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28", newId: ids });
    await repository.deleteTransaction(first.created[1].id);

    const { source, calls } = fakeSource();
    const again = await runDcaCatchUp({ repository, candleSource: source, unlimited: true, today: "2026-10-28", newId: ids });
    expect(again.created).toEqual([]);
    expect(calls).toEqual([]); // 沒有待處理的期數就不打網路
    expect(repository.getSnapshot()?.transactions.map((t) => t.dcaPeriod)).toEqual(["2026-08", "2026-10"]);
  });

  test("同時觸發兩次也不會重複產生", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    const opts = { repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28", newId: ids };
    await Promise.all([runDcaCatchUp(opts), runDcaCatchUp(opts)]);
    expect(repository.getSnapshot()?.transactions).toHaveLength(3);
  });

  test("抓日 K 失敗：這次先跳過，下次再補", async () => {
    const { repository } = setup();
    await addDcaRule(repository, RULE, () => "dca-1");
    const failing: CandleSource = {
      getDailyCandles: async () => {
        throw new Error("offline");
      },
    };
    const report = await runDcaCatchUp({ repository, candleSource: failing, unlimited: true, today: "2026-10-28" });
    expect(report.failedSymbols).toEqual(["0050"]);
    expect(repository.getSnapshot()?.transactions).toEqual([]);

    const retry = await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28", newId: ids });
    expect(retry.created).toHaveLength(3);
  });

  test("Free 只有最早建立的 1 條規則會產生", async () => {
    const { repository, setNow } = setup(new Date(2026, 9, 28, 20, 0, 0));
    await addDcaRule(repository, RULE, () => "dca-1");
    setNow(new Date(2026, 9, 28, 20, 1, 0));
    await addDcaRule(repository, { ...RULE, symbol: "006208" }, () => "dca-2");
    const source: CandleSource = { getDailyCandles: async () => [candle("2026-10-06", 100)] };

    const free = await runDcaCatchUp({ repository, candleSource: source, unlimited: false, today: "2026-10-28", newId: ids });
    expect(free.created.map((t) => t.symbol)).toEqual(["0050"]);

    const pro = await runDcaCatchUp({ repository, candleSource: source, unlimited: true, today: "2026-10-28", newId: ids });
    expect(pro.created.map((t) => t.symbol)).toEqual(["006208"]);
  });

  test("沒有規則：不打網路、不寫入", async () => {
    const { repository } = setup();
    const { source, calls } = fakeSource();
    const report = await runDcaCatchUp({ repository, candleSource: source, unlimited: true, today: "2026-10-28" });
    expect(report).toEqual({ created: [], skipped: [], failedSymbols: [] });
    expect(calls).toEqual([]);
  });
});

describe("記帳本格式相容（dcaRules 是選填欄位）", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test("舊資料沒有 dcaRules：讀進來不帶這個欄位，等於沒有規則", () => {
    const old = { ...emptyLedger() };
    expect(parseLedger(old)).toEqual(old);
    expect(parseLedger(old)).not.toHaveProperty("dcaRules");
  });

  test("格式不對的規則略過，其他保留", () => {
    const good = {
      id: "dca-1",
      symbol: "0050",
      amount: 5000,
      dayOfMonth: 6,
      startDate: "2026-08-01",
      enabled: true,
      handledPeriods: ["2026-08"],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const parsed = parseLedger({ ...emptyLedger(), dcaRules: [good, { id: "bad" }, { ...good, handledPeriods: [1] }] });
    expect(parsed?.dcaRules).toEqual([good]);
  });

  test("存進手機再讀回來：規則與 dca 交易的欄位都在", async () => {
    const store = createAsyncStorageLedgerStore({ now: () => new Date(2026, 9, 28) });
    const repository = createLedgerRepository(store, { now: () => new Date(2026, 9, 28, 20) });
    await addDcaRule(repository, RULE, () => "dca-1");
    await runDcaCatchUp({ repository, candleSource: fakeSource().source, unlimited: true, today: "2026-10-28", newId: ids });

    const reloaded = await createAsyncStorageLedgerStore().load();
    expect(reloaded.dcaRules?.[0]).toMatchObject({ id: "dca-1", handledPeriods: ["2026-08", "2026-09", "2026-10"] });
    expect(reloaded.transactions[0]).toMatchObject({ source: "dca", dcaRuleId: "dca-1", dcaPeriod: "2026-08" });
    expect(JSON.parse((await AsyncStorage.getItem(LEDGER_STORAGE_KEY)) as string).schemaVersion).toBe(1);
    expect(reloaded.settings).toEqual(DEFAULT_USER_SETTINGS);
  });
});
