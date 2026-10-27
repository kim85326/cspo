import type { Ledger } from "@/domain/ledgerTypes";

/**
 * 記帳本儲存介面：交易、股利、持股設定、手續費設定整份存在手機本機（M-07）。
 * 見 docs/stories/008。
 */
export interface LedgerStore {
  /** 讀出整份記帳本；沒存過或資料壞掉都回空的記帳本，不丟錯。 */
  load(): Promise<Ledger>;
  /** 整份覆寫。 */
  save(ledger: Ledger): Promise<void>;
  /** 清空。 */
  clear(): Promise<void>;
}
