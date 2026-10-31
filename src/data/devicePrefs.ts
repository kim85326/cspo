import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 設定頁的手機端開關（Story 034 通知、Story 035 打開 app 時要驗證），存在這支手機、不跟記帳本走。
 * 全部預設關閉：通知要使用者自己打開（第一次打開時才跟系統要權限），驗證也是。
 *
 * 背景工作（收盤損益）在畫面沒開的時候也要讀，所以不用 React context，而是一個小 store：
 * 畫面用 useDevicePrefs()（src/hooks/useDevicePrefs.ts）訂閱，背景工作直接 loadDevicePrefs()。
 */
export type DevicePrefs = {
  /** 交易日收盤後通知今天的損益 */
  closeSummary: boolean;
  /** 除息日前一天提醒 */
  dividendReminder: boolean;
  /** 定期定額扣款日提醒 */
  dcaReminder: boolean;
  /** 打開 app 時要驗證 */
  biometricLock: boolean;
};

export const DEVICE_PREFS_KEY = "cspo.devicePrefs.v1";
/** 收盤損益上次發送的日期（YYYY-MM-DD），同一天只發一次 */
export const CLOSE_SUMMARY_SENT_KEY = "cspo.closeSummarySent.v1";

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  closeSummary: false,
  dividendReminder: false,
  dcaReminder: false,
  biometricLock: false,
};

/** 讀失敗或格式不對：認得的欄位才用，其他一律預設（關閉） */
export function parseDevicePrefs(json: unknown): DevicePrefs {
  const result = { ...DEFAULT_DEVICE_PREFS };
  if (typeof json !== "object" || json === null) return result;
  const record = json as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_DEVICE_PREFS) as (keyof DevicePrefs)[]) {
    if (typeof record[key] === "boolean") result[key] = record[key];
  }
  return result;
}

export async function loadDevicePrefs(): Promise<DevicePrefs> {
  try {
    const raw = await AsyncStorage.getItem(DEVICE_PREFS_KEY);
    return parseDevicePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_DEVICE_PREFS };
  }
}

// ───────────── 給畫面訂閱的 store ─────────────

let current: DevicePrefs | null = null;
/** app 啟動時從手機讀到的值：之後在設定頁改了也不變（Story 035：剛打開「要驗證」不會立刻鎖住） */
let atLaunch: DevicePrefs | null = null;
let loading: Promise<DevicePrefs> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** 目前的值；還沒從手機讀完是 null */
export function getDevicePrefsSnapshot(): DevicePrefs | null {
  return current;
}

/** app 啟動時讀到的值；還沒讀完是 null */
export function getLaunchDevicePrefsSnapshot(): DevicePrefs | null {
  return atLaunch;
}

export function subscribeDevicePrefs(listener: () => void): () => void {
  listeners.add(listener);
  if (current === null && loading === null) {
    loading = loadDevicePrefs().then((prefs) => {
      // 讀的途中已經有人改過（updateDevicePrefs）就以改過的為準
      atLaunch ??= prefs;
      if (current === null) {
        current = prefs;
        emit();
      }
      return current;
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** 改幾個開關並存回手機。存檔失敗也先讓畫面更新，下次開 app 會回到存檔前的值 */
export async function updateDevicePrefs(patch: Partial<DevicePrefs>): Promise<DevicePrefs> {
  const base = current ?? (await (loading ?? loadDevicePrefs()));
  atLaunch ??= base;
  current = { ...base, ...patch };
  emit();
  try {
    await AsyncStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify(current));
  } catch {
    // 存不進去（空間滿了）：這次 app 開著時仍然有效
  }
  return current;
}

/** 測試用：清掉記憶體裡的值，下一次訂閱重新從 AsyncStorage 讀 */
export function resetDevicePrefsForTest(): void {
  current = null;
  atLaunch = null;
  loading = null;
  listeners.clear();
}

export async function loadCloseSummarySentDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLOSE_SUMMARY_SENT_KEY);
  } catch {
    return null;
  }
}

export async function saveCloseSummarySentDate(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CLOSE_SUMMARY_SENT_KEY, date);
  } catch {
    // 存不進去最多是同一天多發一次
  }
}
