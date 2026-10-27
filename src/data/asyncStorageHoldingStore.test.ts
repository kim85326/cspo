import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedHolding } from "@/domain/types";
import {
  asyncStorageHoldingStore as store,
  HOLDINGS_STORAGE_KEY,
  parseSavedHoldings,
} from "./asyncStorageHoldingStore";

// jest.setup.js 已把 AsyncStorage 換成官方記憶體 mock；每個測試前清空。
beforeEach(async () => {
  await AsyncStorage.clear();
});

const TSMC: SavedHolding = { symbol: "2330", buyPrice: "500", shares: "1000" };
const HONHAI: SavedHolding = { symbol: "2317", buyPrice: "100.5", shares: "2000" };

describe("asyncStorageHoldingStore（對應 docs/stories/004）", () => {
  test("沒存過：load 回空陣列", async () => {
    expect(await store.load()).toEqual([]);
  });

  test("save → load 來回，多筆順序不變、字串原樣保留", async () => {
    await store.save([TSMC, HONHAI]);
    expect(await store.load()).toEqual([TSMC, HONHAI]);
  });

  test("用的 key 是 cspo.holdings.v1，內容是 JSON", async () => {
    await store.save([TSMC]);
    expect(JSON.parse((await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)) ?? "")).toEqual([TSMC]);
  });

  test("再 save 會整份覆寫", async () => {
    await store.save([TSMC, HONHAI]);
    await store.save([HONHAI]);
    expect(await store.load()).toEqual([HONHAI]);
  });

  test("JSON 壞掉：回空陣列不 crash", async () => {
    await AsyncStorage.setItem(HOLDINGS_STORAGE_KEY, "{not json");
    await expect(store.load()).resolves.toEqual([]);
  });

  test("格式不對（不是陣列）：回空陣列", async () => {
    await AsyncStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify({ symbol: "2330" }));
    expect(await store.load()).toEqual([]);
  });

  test("陣列裡混了壞資料：只留下合格的筆", async () => {
    await AsyncStorage.setItem(
      HOLDINGS_STORAGE_KEY,
      JSON.stringify([TSMC, { symbol: 2330, buyPrice: 500, shares: 1000 }, null, "x"]),
    );
    expect(await store.load()).toEqual([TSMC]);
  });

  test("AsyncStorage 讀取丟錯：回空陣列", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    expect(await store.load()).toEqual([]);
  });

  test("clear 之後 load 是空的", async () => {
    await store.save([TSMC]);
    await store.clear();
    expect(await store.load()).toEqual([]);
    expect(await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY)).toBeNull();
  });
});

describe("parseSavedHoldings", () => {
  test("只保留三個已知欄位", () => {
    expect(parseSavedHoldings([{ ...TSMC, extra: 1 }])).toEqual([TSMC]);
  });

  test("非陣列一律空陣列", () => {
    expect(parseSavedHoldings(undefined)).toEqual([]);
    expect(parseSavedHoldings("[]")).toEqual([]);
    expect(parseSavedHoldings(42)).toEqual([]);
  });
});
