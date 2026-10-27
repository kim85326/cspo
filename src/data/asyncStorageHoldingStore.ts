import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedHolding } from "@/domain/types";
import type { HoldingStore } from "./HoldingStore";

/** 儲存 key。格式若有不相容的改動，就升 v2 並視需要搬資料。 */
export const HOLDINGS_STORAGE_KEY = "cspo.holdings.v1";

/** 手機本機儲存（AsyncStorage）。JSON 壞掉或格式不對一律回空陣列，不讓 app crash。 */
export const asyncStorageHoldingStore: HoldingStore = {
  async load() {
    try {
      const raw = await AsyncStorage.getItem(HOLDINGS_STORAGE_KEY);
      if (raw == null) return [];
      return parseSavedHoldings(JSON.parse(raw));
    } catch {
      return [];
    }
  },
  async save(items) {
    await AsyncStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(items));
  },
  async clear() {
    await AsyncStorage.removeItem(HOLDINGS_STORAGE_KEY);
  },
};

/** 只接受「每筆三個欄位都是字串」的陣列；整份格式不對回空陣列，個別壞掉的筆數略過。 */
export function parseSavedHoldings(value: unknown): SavedHolding[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSavedHolding).map(({ symbol, buyPrice, shares }) => ({
    symbol,
    buyPrice,
    shares,
  }));
}

function isSavedHolding(value: unknown): value is SavedHolding {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.symbol === "string" && typeof v.buyPrice === "string" && typeof v.shares === "string"
  );
}
