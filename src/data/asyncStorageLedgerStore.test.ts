import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_USER_SETTINGS } from "@/domain/fees";
import { spec37, spec37Ledger } from "@/domain/ledgerTestData";
import { emptyLedger, MIGRATED_NOTE } from "@/domain/migrateSavedHoldings";
import { computePosition } from "@/domain/position";
import type { SavedHolding } from "@/domain/types";
import { HOLDINGS_STORAGE_KEY } from "./asyncStorageHoldingStore";
import {
  CORRUPT_LEDGER_BACKUP_KEY,
  createAsyncStorageLedgerStore,
  LEDGER_STORAGE_KEY,
  LEGACY_HOLDINGS_BACKUP_KEY,
  migrateLegacyHoldings,
  parseLedger,
} from "./asyncStorageLedgerStore";

// jest.setup.js 已把 AsyncStorage 換成官方記憶體 mock；每個測試前清空。
// mock 的函式本身就是 jest.fn，模擬出錯一律用 *Once，用完自動恢復；不要 restoreAllMocks（會把記憶體實作一起拿掉）。
beforeEach(async () => {
  await AsyncStorage.clear();
});

const NOW = new Date(2026, 9, 27, 10, 0, 0);
const newStore = () => createAsyncStorageLedgerStore({ now: () => NOW });

const TSMC: SavedHolding = { symbol: "2330", buyPrice: "600", shares: "1000", buyDate: "2026/01/05" };
const HONHAI: SavedHolding = { symbol: "2317", buyPrice: "100.5", shares: "2000" };

async function seedLegacy(value: unknown) {
  await AsyncStorage.setItem(HOLDINGS_STORAGE_KEY, typeof value === "string" ? value : JSON.stringify(value));
}

describe("asyncStorageLedgerStore（對應 docs/stories/008）", () => {
  test("沒存過：load 回空記帳本（預設手續費設定）", async () => {
    expect(await newStore().load()).toEqual(emptyLedger());
  });

  test("save → load 來回不變，key 是 cspo.ledger.v1", async () => {
    const store = newStore();
    await store.save(spec37Ledger());
    expect(await store.load()).toEqual(spec37Ledger());
    expect(JSON.parse((await AsyncStorage.getItem(LEDGER_STORAGE_KEY)) ?? "")).toEqual(spec37Ledger());
  });

  test("clear 之後 load 回空記帳本", async () => {
    const store = newStore();
    await store.save(spec37Ledger());
    await store.clear();
    expect(await store.load()).toEqual(emptyLedger());
  });

  test.each([
    ["JSON 壞掉", "{not json"],
    ["不是物件", "[1,2]"],
    ["版本不認得", JSON.stringify({ ...emptyLedger(), schemaVersion: 2 })],
    ["沒有交易陣列", JSON.stringify({ schemaVersion: 1 })],
    ["重播不過（賣超）", JSON.stringify({ ...spec37Ledger(), transactions: [spec37.step3] })],
  ])("資料損壞（%s）：回空記帳本不 crash，原文備份起來", async (_, raw) => {
    await AsyncStorage.setItem(LEDGER_STORAGE_KEY, raw);
    await expect(newStore().load()).resolves.toEqual(emptyLedger());
    expect(await AsyncStorage.getItem(CORRUPT_LEDGER_BACKUP_KEY)).toBe(raw);
  });

  test("讀取本身出錯：回空記帳本不 crash", async () => {
    const store = newStore();
    await store.load();
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    await expect(store.load()).resolves.toEqual(emptyLedger());
  });

  test("個別壞掉的紀錄略過，缺的設定用預設值", async () => {
    const good = spec37Ledger();
    const raw = {
      ...good,
      transactions: [...good.transactions, { id: "x", side: "buy" }],
      dividends: [...good.dividends, null],
      holdingSettings: [{ symbol: "2330", bucket: "core" }, { symbol: "2317", bucket: "moon" }],
      settings: { feeDiscount: 0.28, feeRate: "abc" },
    };
    expect(parseLedger(raw)).toEqual({
      ...good,
      holdingSettings: [{ symbol: "2330", bucket: "core" }],
      settings: { ...DEFAULT_USER_SETTINGS, feeDiscount: 0.28 },
    });
  });

  test("刪過的自動股利（Story 012）留著，不是字串的略過；舊資料沒有這個欄位就不加", () => {
    const good = spec37Ledger();
    expect(parseLedger({ ...good, dismissedAutoDividends: ["2330|2026-06-11|cash", 3] })).toEqual({
      ...good,
      dismissedAutoDividends: ["2330|2026-06-11|cash"],
    });
    expect(parseLedger(good)).not.toHaveProperty("dismissedAutoDividends");
  });
});

describe("舊版持股搬移（對應 docs/stories/008）", () => {
  test("舊版存了 2 檔：升級後看到 2 筆買入交易，舊 key 刪掉", async () => {
    await seedLegacy([TSMC, HONHAI]);
    const ledger = await newStore().load();
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.transactions.map((t) => [t.symbol, t.side, t.price, t.shares, t.note?.startsWith(MIGRATED_NOTE)])).toEqual([
      ["2330", "buy", 600, 1000, true],
      ["2317", "buy", 100.5, 2000, true],
    ]);
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_HOLDINGS_BACKUP_KEY)).toBeNull();
  });

  test("搬過來的交易交給計算引擎算得出持股", async () => {
    await seedLegacy([TSMC]);
    const { transactions, dividends } = await newStore().load();
    const position = computePosition("2330", transactions, dividends, {
      type: "stock",
      price: 620,
      today: "2026-10-27",
    });
    expect(position.shares).toBe(1000);
    expect(position.costBasis).toBe(600_855);
  });

  test("搬過就不再搬：重開 app、舊 key 還在（刪除失敗）也不會重複", async () => {
    await seedLegacy([TSMC]);
    jest.spyOn(AsyncStorage, "removeItem").mockRejectedValueOnce(new Error("disk"));
    expect((await newStore().load()).transactions).toHaveLength(1);
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).not.toBeNull();

    // 重開 app
    expect((await newStore().load()).transactions).toHaveLength(1);
    expect(await migrateLegacyHoldings(NOW)).toEqual({ kind: "alreadyMigrated" });
  });

  test("寫入新記帳本失敗：舊資料還在、沒留下半份新 key，下次啟動再搬成功", async () => {
    await seedLegacy([TSMC, HONHAI]);
    const original = await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY);
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk full"));

    const store = newStore();
    expect(await store.load()).toEqual(emptyLedger());
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).toBe(original);
    expect(await AsyncStorage.getItem(LEDGER_STORAGE_KEY)).toBeNull();

    // 同一次開 app 的下一次讀取會再試
    expect((await store.load()).transactions).toHaveLength(2);
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).toBeNull();
  });

  test("寫進去讀回來不一致：當作失敗，舊資料還在", async () => {
    await seedLegacy([TSMC]);
    // 依序是：新 key 在不在、讀舊資料、寫入後讀回比對
    jest
      .spyOn(AsyncStorage, "getItem")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify([TSMC]))
      .mockResolvedValueOnce("{}");
    await expect(migrateLegacyHoldings(NOW)).rejects.toThrow();
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(LEDGER_STORAGE_KEY)).toBeNull();
  });

  test("搬移還沒成功時不寫入，免得舊資料被當成搬過了", async () => {
    await seedLegacy([TSMC]);
    const store = newStore();
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk full"));
    await store.load();

    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    await expect(store.save(emptyLedger())).rejects.toThrow();
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(LEDGER_STORAGE_KEY)).toBeNull();
  });

  test("有不合法的筆數：其餘照搬，舊資料原文另外備份", async () => {
    const raw = [TSMC, { symbol: "2330", buyPrice: "abc", shares: "1000" }, { symbol: 2330 }];
    await seedLegacy(raw);
    const ledger = await newStore().load();
    expect(ledger.transactions.map((t) => t.symbol)).toEqual(["2330"]);
    expect(JSON.parse((await AsyncStorage.getItem(LEGACY_HOLDINGS_BACKUP_KEY)) ?? "")).toEqual(raw);
    expect(await migrateLegacyHoldings(NOW)).toEqual({ kind: "alreadyMigrated" });
  });

  test("舊資料整份讀不懂：不動它、不建新記帳本", async () => {
    await seedLegacy("{broken");
    expect(await migrateLegacyHoldings(NOW)).toEqual({ kind: "unreadable" });
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).toBe("{broken");
    expect(await AsyncStorage.getItem(LEDGER_STORAGE_KEY)).toBeNull();
  });

  test("已經有新記帳本：不碰舊資料", async () => {
    await AsyncStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(spec37Ledger()));
    await seedLegacy([HONHAI]);
    expect(await newStore().load()).toEqual(spec37Ledger());
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).not.toBeNull();
  });

  test("沒有舊資料：不建新記帳本", async () => {
    expect(await migrateLegacyHoldings(NOW)).toEqual({ kind: "nothingToMigrate" });
    expect(await AsyncStorage.getItem(LEDGER_STORAGE_KEY)).toBeNull();
  });
});

describe("多幣別欄位（對應 docs/stories/025）", () => {
  test("舊資料沒有 market／currency／fxRate：照原樣讀回、不升 schemaVersion，計算時視為 TWD、1", async () => {
    await AsyncStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(spec37Ledger()));
    const ledger = await newStore().load();
    expect(ledger).toEqual(spec37Ledger());
    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.transactions.every((t) => t.currency === undefined && t.fxRate === undefined)).toBe(true);
    const p = computePosition("2330", ledger.transactions, ledger.dividends, {
      type: "stock",
      price: spec37.price,
      today: "2026-10-27",
    });
    expect(p.totalReturn).toBeCloseTo(152_880, 6);
  });

  test("有填的多幣別欄位存得進去也讀得回來", async () => {
    const ledger = spec37Ledger();
    const withFields = {
      ...ledger,
      transactions: ledger.transactions.map((t) => ({ ...t, market: "TWSE" as const, currency: "TWD" as const, fxRate: 1 })),
      dividends: ledger.dividends.map((d) => ({ ...d, currency: "TWD" as const, withholdingTax: 0 })),
      holdingSettings: [{ symbol: "2330", market: "TWSE" as const, bucket: "core" as const }],
    };
    await newStore().save(withFields);
    expect(await newStore().load()).toEqual(withFields);
  });

  test("認不得的值只拿掉那個欄位（回到預設），不丟整筆紀錄", () => {
    const ledger = spec37Ledger();
    const parsed = parseLedger({
      ...ledger,
      transactions: [{ ...spec37.step1, market: "NASDAQ", currency: "JPY", fxRate: -3 }, spec37.step2],
      dividends: [{ ...spec37.step4, fxRate: "30", withholdingTax: -1 }],
      holdingSettings: [{ symbol: "2330", market: 1, bucket: "core" }],
    });
    expect(parsed?.transactions).toEqual([spec37.step1, spec37.step2]);
    expect(parsed?.dividends).toEqual([spec37.step4]);
    expect(parsed?.holdingSettings).toEqual([{ symbol: "2330", bucket: "core" }]);
  });
});
