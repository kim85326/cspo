import type { SavedHolding } from "@/domain/types";

/**
 * 持股儲存介面：把使用者輸入過的持股存在手機本機。
 * 存的是「陣列」：多檔股票比較一次會有多筆。
 */
export interface HoldingStore {
  /** 讀出全部已儲存的持股；沒有或資料壞掉都回空陣列，不丟錯。 */
  load(): Promise<SavedHolding[]>;
  /** 整份覆寫。 */
  save(items: SavedHolding[]): Promise<void>;
  /** 清空。 */
  clear(): Promise<void>;
}
