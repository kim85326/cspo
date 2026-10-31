import { localIsoDate } from "@/domain/buyDate";
import { activeHoldings, buildHoldingViews } from "@/domain/holdings";
import type { Ledger } from "@/domain/ledgerTypes";
import {
  buildCloseSummary,
  closeFallbackId,
  closeSummaryMessage,
  previousClose,
  shouldSendCloseSummary,
} from "@/domain/notifications";
import type { Quote } from "@/domain/types";
import type { CandleSource } from "./CandleSource";
import type { PriceSource } from "./PriceSource";

export type CloseSummaryJobDeps = {
  now: () => Date;
  /** 功能開關 notifications 與設定頁「收盤損益」都開著才發 */
  isEnabled: () => Promise<boolean>;
  loadLastSent: () => Promise<string | null>;
  saveLastSent: (date: string) => Promise<void>;
  loadLedger: () => Promise<Ledger>;
  priceSource: PriceSource;
  candleSource: CandleSource;
  present: (title: string, body: string) => Promise<void>;
  cancelReminder: (id: string) => Promise<void>;
};

/** 這次背景工作做了什麼（測試與除錯用） */
export type CloseSummaryJobResult = "disabled" | "notNow" | "noData" | "sent";

function isoMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** 上個月 + 這個月：月初第一個交易日的昨收在上個月 */
function monthsFor(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return [prev, isoMonth(today)];
}

/**
 * 收盤損益（Story 034）：背景工作每次被系統叫起來就跑一次。
 * 交易日 14:30 ～ 19:00、今天還沒發過，才去抓收盤價與昨收、算今天的損益，發一則通知，
 * 並取消今天 19:00 的「打開 app 看看」退路提醒。行情還沒更新到今天（或今天休市）就什麼都不做，等下一次。
 */
export async function runCloseSummaryJob(deps: CloseSummaryJobDeps): Promise<CloseSummaryJobResult> {
  if (!(await deps.isEnabled())) return "disabled";
  const now = deps.now();
  const today = localIsoDate(now);
  if (!shouldSendCloseSummary(now, await deps.loadLastSent())) return "notNow";

  const ledger = await deps.loadLedger();
  const symbols = activeHoldings(buildHoldingViews(ledger, () => undefined, today)).map((h) => h.symbol);
  if (symbols.length === 0) return "noData";

  const months = monthsFor(today);
  const quotes: Record<string, Quote> = {};
  const previousCloses: Record<string, number> = {};
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const [quote, candles] = await Promise.all([
          deps.priceSource.getQuote(symbol),
          deps.candleSource.getDailyCandles(symbol, months),
        ]);
        if (quote) quotes[symbol] = quote;
        const prev = previousClose(candles, today);
        if (prev !== null) previousCloses[symbol] = prev;
      } catch {
        // 這檔抓不到：buildCloseSummary 會因為缺資料而不發，下一次再試
      }
    }),
  );

  const summary = buildCloseSummary(ledger, quotes, previousCloses, today);
  if (!summary) return "noData";
  const { title, body } = closeSummaryMessage(summary);
  await deps.present(title, body);
  await deps.saveLastSent(today);
  await deps.cancelReminder(closeFallbackId(today));
  return "sent";
}
