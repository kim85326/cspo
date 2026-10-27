import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { resolveFeatures, type Features } from "@/config/features";
import { fetchRemoteFlags, loadStoredFlags, saveStoredFlags } from "@/data/remoteFeatureFlags";

/** 沒包 Provider 時用打包時的預設值（加上開發時的 .env.local），不會碰網路。 */
const FeaturesContext = createContext<Features>(resolveFeatures({}));

type Props = {
  children: ReactNode;
  /** 測試用：換掉抓遠端的方式 */
  fetchRemote?: () => Promise<Partial<Features> | null>;
};

/**
 * 全 app 共用的功能開關（Story 026），放在根 layout。
 * 一開始就用預設值畫面，不等網路；接著讀手機裡存的值，再抓遠端。
 * app 啟動時抓一次，之後每次從背景回到前景再抓一次；抓到就存起來，抓不到就維持現狀。
 */
export function FeatureFlagsProvider({ children, fetchRemote = fetchRemoteFlags }: Props) {
  const [stored, setStored] = useState<Partial<Features> | null>(null);
  const [remote, setRemote] = useState<Partial<Features> | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    loadStoredFlags().then((value) => {
      if (active) setStored(value);
    });

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const value = await fetchRemote();
        if (!active || value === null) return;
        setRemote(value);
        await saveStoredFlags(value);
      } catch {
        // fetchRemote 不該丟錯；萬一丟了也不能讓 app 壞掉，維持現狀
      } finally {
        inFlight = false;
      }
    }

    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [fetchRemote]);

  const value = useMemo(() => resolveFeatures({ remote, stored }), [remote, stored]);
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

/** 測試用：直接指定幾個開關，其他用預設值。 */
export function StaticFeatureFlags({ flags, children }: { flags: Partial<Features>; children: ReactNode }) {
  const value = useMemo(() => ({ ...resolveFeatures({}), ...flags }), [flags]);
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

/** 目前的功能開關。遠端設定更新時，用到的畫面會重新 render。 */
export function useFeatures(): Features {
  return useContext(FeaturesContext);
}
