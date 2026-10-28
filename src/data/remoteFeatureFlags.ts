import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseFlags, REMOTE_FLAGS_URL, type Features } from "@/config/features";

/** 上次抓到的遠端開關（Story 033）。抓不到遠端時用這份。 */
export const FEATURE_FLAGS_KEY = "cspo.featureFlags.v1";

/** 遠端太慢就放棄，用手機裡存的值；畫面不會等這個請求。 */
const TIMEOUT_MS = 5000;

/**
 * 抓遠端開關。網路錯、逾時、HTTP 不是 2xx、不是 JSON、整份不是物件，一律回 null（不丟錯）。
 * `cache: "no-store"` 只略過手機端的 HTTP 快取；raw.githubusercontent.com 自己的 CDN 快取最多 5 分鐘，略不過。
 */
export async function fetchRemoteFlags(
  fetchImpl: typeof fetch = fetch,
  url: string = REMOTE_FLAGS_URL,
): Promise<Partial<Features> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    return parseFlags(JSON.parse(await response.text()));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 讀手機裡存的遠端開關。沒存過、讀失敗、內容壞掉都回 null。 */
export async function loadStoredFlags(): Promise<Partial<Features> | null> {
  try {
    const raw = await AsyncStorage.getItem(FEATURE_FLAGS_KEY);
    return raw === null ? null : parseFlags(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 存下這次抓到的遠端開關。寫不進去只影響下次離線啟動，不丟錯。 */
export async function saveStoredFlags(flags: Partial<Features>): Promise<void> {
  try {
    await AsyncStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(flags));
  } catch {
    // 忽略
  }
}
