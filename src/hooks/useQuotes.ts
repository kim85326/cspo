import { useCallback, useEffect, useState } from "react";
import { priceSource as defaultPriceSource } from "@/data";
import type { PriceSource } from "@/data/PriceSource";
import type { Quote } from "@/domain/types";

export type UseQuotes = {
  /** 拿到現價的代號 → 報價；拿不到的不在裡面 */
  quotes: Readonly<Record<string, Quote>>;
  /** 這組代號還沒抓完（第一次、或新增了一檔）；下拉重新整理時是 refreshing */
  loading: boolean;
  refreshing: boolean;
  /** 有幾檔拿不到現價（斷網、證交所沒回應、找不到代號） */
  failedCount: number;
  /** 最後一次抓完的時間；行情沒有資料日期（例如假價）時，首頁顯示這個 */
  updatedAt: Date | null;
  /** 重新抓一次全部現價 */
  refresh: () => Promise<void>;
};

type Fetched = {
  /** 這次抓的是哪組代號 */
  key: string;
  quotes: Record<string, Quote>;
  failedCount: number;
  updatedAt: Date;
};

const NOTHING: Fetched = { key: "", quotes: {}, failedCount: 0, updatedAt: new Date(0) };

/**
 * 一次抓多檔現價（首頁總覽用，Story 011）。每檔各自抓，一檔失敗不影響其他檔。
 * symbols 變了（例如新增了一檔的交易）就重抓；抓完之前 loading 為 true，畫面不要拿舊的數字算。
 */
export function useQuotes(symbols: readonly string[], source: PriceSource = defaultPriceSource): UseQuotes {
  const key = symbols.join(",");
  const [fetched, setFetched] = useState<Fetched>(NOTHING);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (): Promise<Fetched> => {
    const list = key === "" ? [] : key.split(",");
    const results = await Promise.allSettled(list.map((symbol) => source.getQuote(symbol)));
    const quotes: Record<string, Quote> = {};
    let failedCount = 0;
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) quotes[result.value.symbol] = result.value;
      else failedCount += 1;
    });
    return { key, quotes, failedCount, updatedAt: new Date() };
  }, [key, source]);

  useEffect(() => {
    if (key === "") return;
    let active = true;
    void fetchAll().then((next) => {
      if (active) setFetched(next);
    });
    return () => {
      active = false;
    };
  }, [key, fetchAll]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await fetchAll();
    setFetched(next);
    setRefreshing(false);
  }, [fetchAll]);

  const current = fetched.key === key;
  return {
    quotes: current ? fetched.quotes : {},
    loading: key !== "" && !current,
    refreshing,
    failedCount: current ? fetched.failedCount : 0,
    updatedAt: current && key !== "" ? fetched.updatedAt : null,
    refresh,
  };
}
