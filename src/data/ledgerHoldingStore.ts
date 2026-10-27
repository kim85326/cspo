import type { Ledger } from "@/domain/ledgerTypes";
import { replaceSavedHoldings, savedHoldingsFromLedger } from "@/domain/migrateSavedHoldings";
import type { HoldingStore } from "./HoldingStore";
import type { LedgerRepository } from "./ledgerRepository";

export type LedgerHoldingStoreOptions = {
  /** 現在時間；測試固定用 */
  now?: () => Date;
};

/**
 * 過渡期的轉接：讓還在用 SavedHolding 的 CalculateScreen 讀寫新記帳本（docs/stories/008）。
 * - load：記帳本裡的買入交易轉回欄位字串。
 * - save：用畫面上的持股取代記帳本的交易；股利與設定不動，沒改的那幾筆沿用原本的交易。
 * - clear：清掉交易與股利，手續費與持股設定留著。
 * 走 LedgerRepository 寫入，所以用 useLedger 的畫面也會跟著更新。
 * T6 首頁總覽取代 CalculateScreen 後就刪掉這個檔案。
 */
export function createLedgerHoldingStore(
  repository: LedgerRepository,
  options: LedgerHoldingStoreOptions = {},
): HoldingStore {
  const now = options.now ?? (() => new Date());
  const current = () => repository.load();
  const replace = async (ledger: Ledger) => {
    const result = await repository.replaceLedger(ledger);
    if (!result.ok) throw new Error(result.error.message);
  };
  return {
    async load() {
      return savedHoldingsFromLedger(await current());
    },
    async save(items) {
      await replace(replaceSavedHoldings(await current(), items, { now: now() }));
    },
    async clear() {
      await replace({ ...(await current()), transactions: [], dividends: [] });
    },
  };
}
