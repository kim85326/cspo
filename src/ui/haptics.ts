import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { Platform } from "react-native";
import { useFeatures } from "@/hooks/useFeatures";

/**
 * 觸覺回饋（Story 036）。畫面一律透過 useHaptics() 用，不要直接 import expo-haptics。
 *
 * - 由功能開關 haptics 控制（預設關閉），關閉時什麼都不做。
 * - 網頁版什麼都不做：expo-haptics 在網頁會呼叫瀏覽器的震動 API，桌機上沒意義、手機瀏覽器又可能整頁抖一下。
 * - 只給「輕微」的回饋；系統關了觸覺（iOS 低電量模式、Android 關掉觸控回饋）時手機本身就不會震。
 * - 震動失敗（模擬器、沒有震動馬達）一律吞掉，不能讓存檔、刪除這些動作因為震動失敗而出錯。
 */
export type HapticKind =
  /** 存檔成功 */
  | "success"
  /** 按下「確定刪除」 */
  | "delete"
  /** 切換分頁、切換選項 */
  | "selection"
  /** 下拉重新整理 */
  | "refresh"
  /** 開關切換 */
  | "toggle";

export type HapticsApi = Record<HapticKind, () => void>;

const KINDS: HapticKind[] = ["success", "delete", "selection", "refresh", "toggle"];

/** 實際觸發一次回饋。測試與 useHaptics 共用；網頁版不做事。 */
export function playHaptic(kind: HapticKind): void {
  if (Platform.OS === "web") return;
  const run = (): Promise<void> => {
    switch (kind) {
      case "success":
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case "delete":
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case "refresh":
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case "selection":
      case "toggle":
        return Haptics.selectionAsync();
    }
  };
  try {
    run().catch(() => {});
  } catch {
    // 原生模組呼叫失敗：當作沒有震動
  }
}

const NOOP: HapticsApi = Object.fromEntries(KINDS.map((kind) => [kind, () => {}])) as HapticsApi;
const LIVE: HapticsApi = Object.fromEntries(KINDS.map((kind) => [kind, () => playHaptic(kind)])) as HapticsApi;

/** 目前要不要震：功能開關關閉或網頁版時，每個方法都是空函式。 */
export function useHaptics(): HapticsApi {
  const enabled = useFeatures().haptics;
  return useMemo(() => (enabled && Platform.OS !== "web" ? LIVE : NOOP), [enabled]);
}
