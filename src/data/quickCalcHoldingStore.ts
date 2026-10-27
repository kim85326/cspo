import AsyncStorage from "@react-native-async-storage/async-storage";
import { savedHoldingsFromLedger } from "@/domain/migrateSavedHoldings";
import { parseSavedHoldings } from "./asyncStorageHoldingStore";
import type { HoldingStore } from "./HoldingStore";
import type { LedgerRepository } from "./ledgerRepository";

/** 快速試算自己的輸入；跟記帳本分開存。不能用 cspo.holdings.v1，那是 Story 008 要搬走的舊資料 */
export const QUICK_CALC_STORAGE_KEY = "cspo.quickCalc.v1";

/**
 * 快速試算（CalculateScreen，路由 /calculate）記住輸入用（Story 011 決策紀錄 1）。
 * - 只讀記帳本、不寫記帳本：試算是「如果」，不能變成真的交易，也不能覆蓋使用者在交易畫面記的賣出與股利。
 * - 第一次打開（還沒存過）用記帳本的買入交易當初始值，舊版使用者升級後照樣看到原本的持股。
 * - 存過一次（包括清除）就只用自己的；清除存成空陣列，免得下次又從記帳本帶回來。
 */
export function createQuickCalcHoldingStore(repository: LedgerRepository): HoldingStore {
  return {
    async load() {
      let raw: string | null;
      try {
        raw = await AsyncStorage.getItem(QUICK_CALC_STORAGE_KEY);
      } catch {
        return [];
      }
      if (raw === null) return savedHoldingsFromLedger(await repository.load());
      try {
        return parseSavedHoldings(JSON.parse(raw));
      } catch {
        return [];
      }
    },
    async save(items) {
      await AsyncStorage.setItem(QUICK_CALC_STORAGE_KEY, JSON.stringify(items));
    },
    async clear() {
      await AsyncStorage.setItem(QUICK_CALC_STORAGE_KEY, "[]");
    },
  };
}
