import { spec37 } from "@/domain/ledgerTestData";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import type { SavedHolding } from "@/domain/types";
import { createLedgerHoldingStore } from "./ledgerHoldingStore";
import { createMemoryLedgerStore } from "./memoryLedgerStore";

const NOW = new Date(2026, 9, 27, 10, 0, 0);
const TSMC: SavedHolding = { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/10/05" };
const HONHAI: SavedHolding = { symbol: "2317", buyPrice: "100.5", shares: "2000" };

function setup() {
  const ledgerStore = createMemoryLedgerStore({ ...emptyLedger(), dividends: [spec37.step4] });
  return { ledgerStore, store: createLedgerHoldingStore(ledgerStore, { now: () => NOW }) };
}

describe("ledgerHoldingStore：CalculateScreen 讀寫新記帳本（對應 docs/stories/008）", () => {
  test("save → load 來回，欄位字串與順序不變", async () => {
    const { store, ledgerStore } = setup();
    await store.save([TSMC, HONHAI]);
    expect(await store.load()).toEqual([TSMC, HONHAI]);
    const ledger = await ledgerStore.load();
    expect(ledger.transactions.map((t) => [t.symbol, t.tradeDate, t.fee])).toEqual([
      ["2330", "2026-10-05", 712],
      ["2317", "2026-10-27", 286],
    ]);
    expect(ledger.dividends).toEqual([spec37.step4]);
  });

  test("clear：交易與股利清掉，手續費設定留著", async () => {
    const { store, ledgerStore } = setup();
    await store.save([TSMC]);
    await store.clear();
    expect(await store.load()).toEqual([]);
    expect(await ledgerStore.load()).toEqual(emptyLedger());
  });
});
