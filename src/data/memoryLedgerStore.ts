import type { Ledger } from "@/domain/ledgerTypes";
import { emptyLedger } from "@/domain/migrateSavedHoldings";
import type { LedgerStore } from "./LedgerStore";

/** 記憶體版：測試用，每次 create 都是乾淨的。存取都是複本，外面改不到裡面。 */
export function createMemoryLedgerStore(initial: Ledger = emptyLedger()): LedgerStore {
  let ledger = copy(initial);
  return {
    async load() {
      return copy(ledger);
    },
    async save(next) {
      ledger = copy(next);
    },
    async clear() {
      ledger = emptyLedger();
    },
  };
}

function copy(ledger: Ledger): Ledger {
  return JSON.parse(JSON.stringify(ledger)) as Ledger;
}
