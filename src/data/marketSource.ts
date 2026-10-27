import { orderForDirectory } from "./directoryOrder";
import { PriceLoadError, type PriceSource } from "./PriceSource";
import type { StockDirectory } from "./StockDirectory";

type MarketDataSource = PriceSource & StockDirectory;

/** 只吞 PriceLoadError（某個市場拿不到）；其他錯誤是程式錯，照樣往外丟 */
function rethrowUnexpected(results: PromiseSettledResult<unknown>[]): PriceLoadError[] {
  const failures: PriceLoadError[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    if (!(result.reason instanceof PriceLoadError)) throw result.reason;
    failures.push(result.reason);
  }
  return failures;
}

/**
 * 把多個市場（上市、上櫃）合成同一個 PriceSource + StockDirectory。sources 的順序就是優先順序。
 * - getAll：各市場的清單合在一起，照熱門規則重排（空白時第一檔仍是 2330）。
 *   一邊失敗另一邊照用；全部失敗才丟 PriceLoadError。
 * - getQuote：同時問各市場，取第一個有結果的。
 *   找不到時，如果有市場載入失敗，丟 PriceLoadError 而不是回 null——
 *   那一檔可能就在失敗的市場裡，說「找不到」會誤導（docs/stories/007 決策紀錄 3）。
 */
export function createMarketSource(sources: readonly MarketDataSource[]): MarketDataSource {
  return {
    async getAll() {
      const results = await Promise.allSettled(sources.map((s) => s.getAll()));
      const failures = rethrowUnexpected(results);
      if (failures.length === results.length) {
        throw new PriceLoadError("行情載入失敗", { cause: failures[0] });
      }
      return orderForDirectory(
        results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      );
    },

    async getQuote(symbol) {
      const results = await Promise.allSettled(sources.map((s) => s.getQuote(symbol)));
      const failures = rethrowUnexpected(results);
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) return result.value;
      }
      if (failures.length > 0) throw new PriceLoadError("行情載入失敗", { cause: failures[0] });
      return null;
    },
  };
}
