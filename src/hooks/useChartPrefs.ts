import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { CHART_PERIODS, type ChartPeriod, DEFAULT_CHART_PERIOD } from "@/domain/candles";

export type ChartMode = "line" | "candle";

export type ChartPrefs = {
  period: ChartPeriod;
  /** 預設折線：新手先看大方向，想看開高低再切 K 棒 */
  mode: ChartMode;
  /** 均線預設關：第一次看圖不要一次塞太多線 */
  showMa: boolean;
  /** 「怎麼看這張圖」第一次自動打開，按過「知道了」就不再自動跳出 */
  guideSeen: boolean;
};

export const CHART_PREFS_KEY = "cspo.chartPrefs.v1";
export const DEFAULT_CHART_PREFS: ChartPrefs = {
  period: DEFAULT_CHART_PERIOD,
  mode: "line",
  showMa: false,
  guideSeen: false,
};

/**
 * 走勢圖的偏好（期間、折線或 K 棒、均線、看過說明沒），存在手機本機，下次打開沿用。
 * 讀寫失敗一律當成預設值，不影響看圖。loaded 之前畫面先不顯示說明，避免看過的人閃一下。
 */
export function useChartPrefs(): ChartPrefs & {
  loaded: boolean;
  update: (patch: Partial<ChartPrefs>) => void;
} {
  const [prefs, setPrefs] = useState<ChartPrefs>(DEFAULT_CHART_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CHART_PREFS_KEY)
      .then((raw) => (raw ? parsePrefs(JSON.parse(raw)) : DEFAULT_CHART_PREFS))
      .catch(() => DEFAULT_CHART_PREFS)
      .then((stored) => {
        if (!active) return;
        // 讀回來之前使用者已經點過的設定優先
        setPrefs((current) => (current === DEFAULT_CHART_PREFS ? stored : current));
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<ChartPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      AsyncStorage.setItem(CHART_PREFS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return { ...prefs, loaded, update };
}

function parsePrefs(value: unknown): ChartPrefs {
  const v = (typeof value === "object" && value !== null ? value : {}) as Partial<ChartPrefs>;
  return {
    period: CHART_PERIODS.includes(v.period as ChartPeriod) ? (v.period as ChartPeriod) : DEFAULT_CHART_PREFS.period,
    mode: v.mode === "candle" ? "candle" : "line",
    showMa: v.showMa === true,
    guideSeen: v.guideSeen === true,
  };
}
