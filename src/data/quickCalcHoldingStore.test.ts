import AsyncStorage from "@react-native-async-storage/async-storage";
import { spec37Ledger } from "@/domain/ledgerTestData";
import type { SavedHolding } from "@/domain/types";
import { createMemoryLedgerRepository } from "./ledgerRepository";
import { createQuickCalcHoldingStore, QUICK_CALC_STORAGE_KEY } from "./quickCalcHoldingStore";

const HONHAI: SavedHolding = { symbol: "2317", buyPrice: "200", shares: "1000" };

beforeEach(async () => {
  await AsyncStorage.clear();
});

/** 3.7 範例：兩筆買入、一筆賣出、一筆股利 */
function setup() {
  const repository = createMemoryLedgerRepository(spec37Ledger());
  return { repository, store: createQuickCalcHoldingStore(repository) };
}

describe("快速試算記住輸入：只讀記帳本、不寫記帳本（對應 docs/stories/011 決策紀錄 1）", () => {
  test("還沒存過：用記帳本的買入交易當初始值", async () => {
    const { store } = setup();
    expect(await store.load()).toEqual([
      { symbol: "2330", buyPrice: "600", shares: "1000", buyDate: "2026/01/05" },
      { symbol: "2330", buyPrice: "500", shares: "1000", buyDate: "2026/02/05" },
    ]);
  });

  test("存試算輸入：記帳本的交易（含賣出）與股利原封不動", async () => {
    const { store, repository } = setup();
    const before = await repository.load();
    await store.save([HONHAI]);
    expect(await store.load()).toEqual([HONHAI]);
    expect(await repository.load()).toBe(before);
  });

  test("清除：記帳本不動，之後也不會再從記帳本帶回來", async () => {
    const { store, repository } = setup();
    const before = await repository.load();
    await store.save([HONHAI]);
    await store.clear();
    expect(await store.load()).toEqual([]);
    expect(await repository.load()).toBe(before);
  });

  test("存的資料壞掉：回空陣列，不讓 app crash", async () => {
    const { store } = setup();
    await AsyncStorage.setItem(QUICK_CALC_STORAGE_KEY, "{not json");
    expect(await store.load()).toEqual([]);
  });
});
