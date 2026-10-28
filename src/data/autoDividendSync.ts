import { localIsoDate } from "@/domain/buyDate";
import type { DividendEvent } from "@/domain/types";
import type { CorporateActionSource } from "./CorporateActionSource";
import type { LedgerRepository, LedgerWriteResult } from "./ledgerRepository";

export type AutoDividendSyncDeps = {
  repository: LedgerRepository;
  actions: CorporateActionSource;
  /** 今天；決定抓到哪一天、哪些股利已到發放日。測試固定用 */
  now?: () => Date;
};

/**
 * 股利自動帶入（P2-03，docs/stories/012）：App 開啟時跑一次。
 * 記帳本裡每一檔有交易的證券，抓「第一筆交易日 ～ 今天」的除權息事件，交給 repository 一次寫回。
 * 某一檔抓不到（斷網、超過次數上限）就略過那一檔，不影響其他檔；那一檔已經建好的自動股利不動。
 */
export async function syncAutoDividends({
  repository,
  actions,
  now = () => new Date(),
}: AutoDividendSyncDeps): Promise<LedgerWriteResult> {
  const ledger = await repository.load();
  const today = localIsoDate(now());

  const firstTrade = new Map<string, string>();
  for (const t of ledger.transactions) {
    const first = firstTrade.get(t.symbol);
    if (!first || t.tradeDate < first) firstTrade.set(t.symbol, t.tradeDate);
  }

  const results = await Promise.all(
    [...firstTrade].map(async ([symbol, from]) => {
      try {
        return await actions.getActions(symbol, from, today);
      } catch {
        return [];
      }
    }),
  );
  const events = results.flat().filter((a): a is DividendEvent => a.kind === "dividend");
  return repository.syncAutoDividends(events);
}
