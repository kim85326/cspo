import AsyncStorage from "@react-native-async-storage/async-storage";

/** 使用者看過並同意免責聲明（Story 013）。 */
export const DISCLAIMER_ACCEPTED_KEY = "cspo.disclaimerAccepted.v1";
/** 設定頁的「Demo：解鎖所有 Pro 功能」開關（Story 020）。 */
export const PRO_DEMO_UNLOCKED_KEY = "cspo.proDemoUnlocked.v1";

/**
 * 存在手機本機的是非設定。讀失敗或值不對一律當 false：
 * 免責聲明會再出現一次、Pro 維持鎖住，都不會讓使用者誤以為有東西被打開。
 */
export async function loadFlag(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === "1";
  } catch {
    return false;
  }
}

export async function saveFlag(key: string, value: boolean): Promise<void> {
  await AsyncStorage.setItem(key, value ? "1" : "0");
}
