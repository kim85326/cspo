import { useEffect } from "react";
import { corporateActionSource, ledgerRepository } from "@/data";
import { syncAutoDividends, type AutoDividendSyncDeps } from "@/data/autoDividendSync";

/**
 * 股利自動帶入（P2-03，docs/stories/012）：放在根 layout，App 開啟時跑一次。
 * 背景執行、不擋畫面；失敗就等下次開 App 再試。寫進記帳本後，用 useLedger 的畫面會自己更新。
 */
export function useAutoDividendSync(
  deps: AutoDividendSyncDeps = { repository: ledgerRepository, actions: corporateActionSource },
): void {
  const { repository, actions, now } = deps;
  useEffect(() => {
    syncAutoDividends({ repository, actions, now }).catch(() => {
      // 讀不到記帳本或存檔失敗：不影響使用，下次開 App 再試
    });
  }, [repository, actions, now]);
}
