import { useSyncExternalStore } from "react";
import {
  getDevicePrefsSnapshot,
  getLaunchDevicePrefsSnapshot,
  subscribeDevicePrefs,
  type DevicePrefs,
} from "@/data/devicePrefs";

/** 設定頁的手機端開關（Story 034、035）；還沒從手機讀完是 null。改用 updateDevicePrefs。 */
export function useDevicePrefs(): DevicePrefs | null {
  return useSyncExternalStore(subscribeDevicePrefs, getDevicePrefsSnapshot, getDevicePrefsSnapshot);
}

/** app 啟動時讀到的值（之後改了也不變）；還沒讀完是 null。解鎖畫面決定「啟動時要不要鎖」用 */
export function useLaunchDevicePrefs(): DevicePrefs | null {
  return useSyncExternalStore(subscribeDevicePrefs, getLaunchDevicePrefsSnapshot, getLaunchDevicePrefsSnapshot);
}
