import type { CandleSource } from "./CandleSource";
import type { CorporateActionSource } from "./CorporateActionSource";
import { PriceLoadError } from "./PriceSource";

/**
 * 依序試，第一個成功的就用（FinMind 為主、官方為備援）。
 * 只吞 PriceLoadError（那個來源拿不到）；其他錯誤是程式錯，照樣往外丟。全部失敗才丟 PriceLoadError。
 * 注意：回空陣列算成功（這檔真的沒資料），不會再問下一個。
 */
async function firstAvailable<T>(attempts: (() => Promise<T>)[]): Promise<T> {
  const failures: PriceLoadError[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof PriceLoadError)) throw error;
      failures.push(error);
    }
  }
  throw new PriceLoadError("歷史資料載入失敗", { cause: failures[0] });
}

export function createFallbackCandleSource(sources: readonly CandleSource[]): CandleSource {
  return {
    getDailyCandles: (symbol, months) =>
      firstAvailable(sources.map((s) => () => s.getDailyCandles(symbol, months))),
  };
}

export function createFallbackActionSource(sources: readonly CorporateActionSource[]): CorporateActionSource {
  return {
    getActions: (symbol, from, to) => firstAvailable(sources.map((s) => () => s.getActions(symbol, from, to))),
  };
}
