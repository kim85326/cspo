import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { holdingStore } from "@/data";
import type { HoldingStore } from "@/data/HoldingStore";
import type { SavedHolding } from "@/domain/types";

export type PersistedHoldings = {
  /** 目前已儲存的持股（啟動時從手機讀回來，之後跟著 persist / clearSaved 更新） */
  saved: SavedHolding[];
  /** 是否已經讀完。畫面要等 loaded 才把資料帶回欄位，避免把空值蓋過去。 */
  loaded: boolean;
  /** 整份覆寫並寫進手機。請在「計算」成功時呼叫，不要每打一個字就呼叫。 */
  persist: (items: SavedHolding[]) => Promise<void>;
  /** 清空手機裡的資料。 */
  clearSaved: () => Promise<void>;
};

export type PersistedHoldingsOptions = {
  /** 啟動時讀完手機資料後呼叫一次（讀失敗也會呼叫，給空陣列）。畫面用它把資料帶回欄位。 */
  onLoaded?: (items: SavedHolding[]) => void;
};

/**
 * 把持股存在手機本機、重開 app 帶回來。
 * 儲存邏輯都在 HoldingStore；這個 hook 只負責「啟動時讀」與「同步 saved 狀態」。
 * 預設用 src/data 的 holdingStore，測試可傳 memoryHoldingStore 進來；store 在畫面存活期間應保持同一個。
 */
export function usePersistedHoldings(
  store: HoldingStore = holdingStore,
  options: PersistedHoldingsOptions = {},
): PersistedHoldings {
  const [saved, setSaved] = useState<SavedHolding[]>([]);
  const [loaded, setLoaded] = useState(false);
  // useEffectEvent：永遠叫到最新的 onLoaded，又不會讓下面的 effect 因 callback 變了而重跑。
  const notifyLoaded = useEffectEvent((items: SavedHolding[]) => options.onLoaded?.(items));

  useEffect(() => {
    let active = true;
    store
      .load()
      .catch((): SavedHolding[] => [])
      .then((items) => {
        if (!active) return;
        setSaved(items);
        setLoaded(true);
        notifyLoaded(items);
      });
    return () => {
      active = false;
    };
  }, [store]);

  const persist = useCallback(
    async (items: SavedHolding[]) => {
      setSaved(items);
      try {
        await store.save(items);
      } catch {
        // 存不進去不該影響計算結果的顯示；下次開 app 少了資料而已。
      }
    },
    [store],
  );

  const clearSaved = useCallback(async () => {
    setSaved([]);
    try {
      await store.clear();
    } catch {
      // 同上：清不掉也不讓畫面壞掉。
    }
  }, [store]);

  return { saved, loaded, persist, clearSaved };
}
