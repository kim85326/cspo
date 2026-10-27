import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { HoldingStore } from "@/data/HoldingStore";
import { createMemoryHoldingStore } from "@/data/memoryHoldingStore";
import type { SavedHolding } from "@/domain/types";
import { usePersistedHoldings } from "./usePersistedHoldings";

const TSMC: SavedHolding = { symbol: "2330", buyPrice: "500", shares: "1000" };

describe("usePersistedHoldings（對應 docs/stories/004）", () => {
  test("還沒讀完：loaded 是 false、saved 是空陣列", async () => {
    const pending: HoldingStore = {
      load: () => new Promise(() => {}),
      save: async () => {},
      clear: async () => {},
    };
    const { result } = await renderHook(() => usePersistedHoldings(pending));
    expect(result.current.loaded).toBe(false);
    expect(result.current.saved).toEqual([]);
  });

  test("啟動時從 store 讀回已存的持股，loaded 變 true", async () => {
    const store = createMemoryHoldingStore([TSMC]);
    const { result } = await renderHook(() => usePersistedHoldings(store));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.saved).toEqual([TSMC]);
  });

  test("沒存過：loaded 為 true、saved 是空陣列", async () => {
    const store = createMemoryHoldingStore();
    const { result } = await renderHook(() => usePersistedHoldings(store));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.saved).toEqual([]);
  });

  test("persist 會更新 saved 並寫進 store", async () => {
    const store = createMemoryHoldingStore();
    const { result } = await renderHook(() => usePersistedHoldings(store));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.persist([TSMC]);
    });
    expect(result.current.saved).toEqual([TSMC]);
    expect(await store.load()).toEqual([TSMC]);
  });

  test("clearSaved 會清空 saved 與 store", async () => {
    const store = createMemoryHoldingStore([TSMC]);
    const { result } = await renderHook(() => usePersistedHoldings(store));
    await waitFor(() => expect(result.current.saved).toEqual([TSMC]));

    await act(async () => {
      await result.current.clearSaved();
    });
    expect(result.current.saved).toEqual([]);
    expect(await store.load()).toEqual([]);
  });

  test("onLoaded 在讀完時被叫一次，拿到已存的持股", async () => {
    const store = createMemoryHoldingStore([TSMC]);
    const onLoaded = jest.fn();
    const { result } = await renderHook(() => usePersistedHoldings(store, { onLoaded }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith([TSMC]);
  });

  test("store 讀取失敗：仍然 loaded，saved 為空", async () => {
    const broken: HoldingStore = {
      load: () => Promise.reject(new Error("boom")),
      save: async () => {},
      clear: async () => {},
    };
    const { result } = await renderHook(() => usePersistedHoldings(broken));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.saved).toEqual([]);
  });

  test("store 寫入失敗：persist 不丟錯，saved 仍更新", async () => {
    const broken: HoldingStore = {
      load: async () => [],
      save: () => Promise.reject(new Error("boom")),
      clear: async () => {},
    };
    const { result } = await renderHook(() => usePersistedHoldings(broken));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await expect(result.current.persist([TSMC])).resolves.toBeUndefined();
    });
    expect(result.current.saved).toEqual([TSMC]);
  });
});
