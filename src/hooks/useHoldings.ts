import { useEffect, useMemo, useState } from "react";
import { ledgerRepository, priceSource as defaultPriceSource } from "@/data";
import type { LedgerRepository } from "@/data/ledgerRepository";
import type { PriceSource } from "@/data/PriceSource";
import { localIsoDate } from "@/domain/buyDate";
import { buildHoldingViews, ledgerSymbols, type HoldingView } from "@/domain/holdings";
import type { Ledger } from "@/domain/ledgerTypes";
import type { Quote } from "@/domain/types";
import { useLedger } from "./useLedger";

export type QuotesStatus = "loading" | "ready" | "error";

export type UseHoldings = {
  /** 記帳本；還沒讀完是 null */
  ledger: Ledger | null;
  loaded: boolean;
  /** 每檔一列（含已出清），價格還沒拿到的欄位是 null（畫面顯示 —） */
  holdings: HoldingView[];
  /** 行情狀態；error = 行情載入失敗（斷網等），市值與未實現顯示 — */
  quotesStatus: QuotesStatus;
  /** 參考價的資料日期（各檔中最新的一個；假價沒有） */
  asOf: string | null;
  repository: LedgerRepository;
};

export type UseHoldingsOptions = {
  repository?: LedgerRepository;
  prices?: PriceSource;
  /** 今天 YYYY-MM-DD，算持有天數；測試固定用 */
  today?: string;
};

/**
 * 持股明細、單一持股頁、首頁共用：記帳本 + 每檔參考價 → HoldingView。
 * 記帳本一變（新增交易、切換核心／衛星）就重算；代號清單變了才重抓行情。見 docs/stories/010。
 */
export function useHoldings(options: UseHoldingsOptions = {}): UseHoldings {
  const { ledger, loaded, repository } = useLedger(options.repository ?? ledgerRepository);
  const prices = options.prices ?? defaultPriceSource;
  const today = options.today ?? localIsoDate(new Date());

  const symbolsKey = ledger ? ledgerSymbols(ledger).join(",") : "";
  // 抓到的行情記著是哪一組代號的；代號變了（新增一檔）就算 loading，舊價格先照用
  const [fetched, setFetched] = useState<{ key: string; quotes: Record<string, Quote | null>; failed: boolean }>({
    key: "",
    quotes: {},
    failed: false,
  });
  const quotes = fetched.quotes;
  const quotesStatus: QuotesStatus =
    !loaded || fetched.key !== symbolsKey ? "loading" : fetched.failed ? "error" : "ready";

  useEffect(() => {
    if (!loaded) return;
    const symbols = symbolsKey ? symbolsKey.split(",") : [];
    let cancelled = false;
    Promise.allSettled(symbols.map((s) => prices.getQuote(s))).then((results) => {
      if (cancelled) return;
      const next: Record<string, Quote | null> = {};
      let failed = false;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next[symbols[i]] = r.value;
        else failed = true;
      });
      setFetched({ key: symbolsKey, quotes: next, failed });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, symbolsKey, prices]);

  const holdings = useMemo(() => {
    if (!ledger) return [];
    return buildHoldingViews(
      ledger,
      (symbol) => {
        const q = quotes[symbol];
        return q ? { price: q.price, name: q.name } : undefined;
      },
      today,
    );
  }, [ledger, quotes, today]);

  const asOf = useMemo(() => {
    const dates = Object.values(quotes)
      .map((q) => q?.asOf)
      .filter((d): d is string => !!d)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [quotes]);

  return { ledger, loaded, holdings, quotesStatus, asOf, repository };
}
