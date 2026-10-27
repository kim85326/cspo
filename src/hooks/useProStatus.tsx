import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadFlag, PRO_DEMO_UNLOCKED_KEY, saveFlag } from "@/data/appPrefs";
import { isPro } from "@/domain/plan";

export type ProStatus = {
  /** 是不是 Pro（由 domain/plan 的 isPro 判斷） */
  pro: boolean;
  /** Demo 開關是否打開 */
  demoUnlocked: boolean;
  /** 是否已經從手機讀完 Demo 開關。讀完前一律當 Free。 */
  loaded: boolean;
  /** 切換 Demo 開關並存在手機，重開 app 仍維持 */
  setDemoUnlocked: (value: boolean) => Promise<void>;
};

const ProStatusContext = createContext<ProStatus>({
  pro: false,
  demoUnlocked: false,
  loaded: false,
  setDemoUnlocked: async () => {},
});

/**
 * 全 app 共用的 Pro 狀態，放在根 layout。設定頁切 Demo 開關後，其他畫面的鎖會跟著更新。
 * 沒包 Provider 時一律是 Free（測試或未來忘了包也不會意外解鎖）。
 */
export function ProStatusProvider({ children }: { children: ReactNode }) {
  const [demoUnlocked, setDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    loadFlag(PRO_DEMO_UNLOCKED_KEY).then((value) => {
      if (!active) return;
      setDemo(value);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setDemoUnlocked = useCallback(async (value: boolean) => {
    setDemo(value);
    try {
      await saveFlag(PRO_DEMO_UNLOCKED_KEY, value);
    } catch {
      // 寫不進去只影響「重開後是否維持」，這次開著的期間照樣切換
    }
  }, []);

  const value = useMemo(
    () => ({ pro: isPro({ demoUnlocked }), demoUnlocked, loaded, setDemoUnlocked }),
    [demoUnlocked, loaded, setDemoUnlocked],
  );
  return <ProStatusContext.Provider value={value}>{children}</ProStatusContext.Provider>;
}

export function useProStatus(): ProStatus {
  return useContext(ProStatusContext);
}
