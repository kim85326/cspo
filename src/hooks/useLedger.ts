import { useEffect, useSyncExternalStore } from "react";
import { ledgerRepository } from "@/data";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { Ledger } from "@/domain/ledgerTypes";

export type UseLedger = {
  /** 目前的記帳本；還沒讀完是 null（畫面顯示載入中，不要當成空的） */
  ledger: Ledger | null;
  loaded: boolean;
  /** 新增／修改／刪除等寫入方法，結果見 LedgerWriteResult */
  repository: LedgerRepository;
};

/**
 * 畫面讀寫記帳本用。任何畫面寫入後，所有用這個 hook 的畫面都會跟著更新。
 * 預設用 src/data 的 ledgerRepository；測試與畫面開發傳 createMemoryLedgerRepository(...) 進來，
 * 同一個畫面存活期間要保持同一個 repository。見 docs/stories/008。
 */
export function useLedger(repository: LedgerRepository = ledgerRepository): UseLedger {
  const ledger = useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);

  useEffect(() => {
    void repository.load();
  }, [repository]);

  return { ledger, loaded: ledger !== null, repository };
}
